const DEFAULT_NEYNAR_BASE_URL = "https://api.neynar.com";

type NeynarQueryValue = string | number | boolean | null | undefined;
type NeynarQuery = Record<
	string,
	NeynarQueryValue | ReadonlyArray<NeynarQueryValue>
>;

type FetchLike = typeof fetch;

export interface NeynarClientOptions {
	apiKey?: string | null;
	baseUrl?: string;
	fetch?: FetchLike;
}

export interface NeynarPage {
	next?: {
		cursor?: string | null;
	} | null;
}

export class NeynarApiError extends Error {
	readonly _tag = "NeynarApiError";
	readonly status: number;
	readonly body: unknown;

	constructor(
		message: string,
		{ status, body }: { status: number; body: unknown },
	) {
		super(message);
		this.name = "NeynarApiError";
		this.status = status;
		this.body = body;
	}
}

export function getNeynarApiKeyFromEnv() {
	const value = process.env.NEYNAR_API_KEY?.trim();
	return value || null;
}

function appendQuery(url: URL, query: NeynarQuery = {}) {
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === "") continue;
		if (Array.isArray(value)) {
			const serialized = value
				.filter((item) => item !== undefined && item !== null && item !== "")
				.map(String)
				.join(",");
			if (serialized) url.searchParams.set(key, serialized);
			continue;
		}
		url.searchParams.set(key, String(value));
	}
}

async function parseResponseBody(response: Response) {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function errorMessage(body: unknown, fallback: string) {
	if (body && typeof body === "object") {
		const maybeMessage = (body as { message?: unknown; error?: unknown })
			.message;
		if (typeof maybeMessage === "string" && maybeMessage.trim()) {
			return maybeMessage;
		}
		const maybeError = (body as { error?: unknown }).error;
		if (typeof maybeError === "string" && maybeError.trim()) {
			return maybeError;
		}
	}
	return fallback;
}

function createUrl(baseUrl: string, path: string, query?: NeynarQuery) {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const url = new URL(
		normalizedPath,
		baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
	);
	appendQuery(url, query);
	return url;
}

export function createNeynarClient(options: NeynarClientOptions = {}) {
	const apiKey = options.apiKey?.trim() || getNeynarApiKeyFromEnv();
	if (!apiKey) {
		throw new Error("NEYNAR_API_KEY is required for Neynar API requests");
	}
	const baseUrl = options.baseUrl ?? DEFAULT_NEYNAR_BASE_URL;
	const fetchImpl = options.fetch ?? fetch;

	async function request<T>(path: string, query?: NeynarQuery): Promise<T> {
		const response = await fetchImpl(createUrl(baseUrl, path, query), {
			headers: {
				accept: "application/json",
				"x-api-key": apiKey,
			},
		});
		const body = await parseResponseBody(response);
		if (!response.ok) {
			throw new NeynarApiError(
				errorMessage(
					body,
					`Neynar request failed with status ${response.status}`,
				),
				{ status: response.status, body },
			);
		}
		return body as T;
	}

	return {
		request,
		lookupUserByUsername(username: string, viewerFid?: number) {
			return request("/v2/farcaster/user/by_username/", {
				username,
				viewer_fid: viewerFid,
			});
		},
		fetchBulkUsers(fids: ReadonlyArray<number>, viewerFid?: number) {
			return request("/v2/farcaster/user/bulk/", {
				fids,
				viewer_fid: viewerFid,
			});
		},
		fetchUserCasts(params: {
			fid: number;
			limit?: number;
			cursor?: string;
			includeReplies?: boolean;
			parentUrl?: string;
			channelId?: string;
			viewerFid?: number;
		}) {
			return request("/v2/farcaster/feed/user/casts/", {
				fid: params.fid,
				limit: params.limit,
				cursor: params.cursor,
				include_replies: params.includeReplies,
				parent_url: params.parentUrl,
				channel_id: params.channelId,
				viewer_fid: params.viewerFid,
			});
		},
		fetchFollowingFeed(params: {
			fid: number;
			viewerFid?: number;
			withRecasts?: boolean;
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/feed/following/", {
				fid: params.fid,
				viewer_fid: params.viewerFid,
				with_recasts: params.withRecasts,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		lookupCast(params: {
			identifier: string;
			type: "url" | "hash";
			viewerFid?: number;
		}) {
			return request("/v2/farcaster/cast/", {
				identifier: params.identifier,
				type: params.type,
				viewer_fid: params.viewerFid,
			});
		},
		fetchBulkCasts(
			casts: ReadonlyArray<string>,
			options: { viewerFid?: number; sortType?: string } = {},
		) {
			return request("/v2/farcaster/casts/", {
				casts,
				viewer_fid: options.viewerFid,
				sort_type: options.sortType,
			});
		},
		fetchCastConversation(params: {
			identifier: string;
			type: "url" | "hash";
			replyDepth?: number;
			includeChronologicalParentCasts?: boolean;
			viewerFid?: number;
			sortType?: string;
			fold?: string;
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/cast/conversation/", {
				identifier: params.identifier,
				type: params.type,
				reply_depth: params.replyDepth,
				include_chronological_parent_casts:
					params.includeChronologicalParentCasts,
				viewer_fid: params.viewerFid,
				sort_type: params.sortType,
				fold: params.fold,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		searchCasts(params: {
			q: string;
			mode?: "literal" | "semantic" | "hybrid";
			sortType?: string;
			authorFid?: number;
			viewerFid?: number;
			parentUrl?: string;
			channelId?: string;
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/cast/search/", {
				q: params.q,
				mode: params.mode,
				sort_type: params.sortType,
				author_fid: params.authorFid,
				viewer_fid: params.viewerFid,
				parent_url: params.parentUrl,
				channel_id: params.channelId,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		fetchFollowers(params: {
			fid: number;
			viewerFid?: number;
			sortType?: "desc_chron" | "algorithmic";
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/followers/", {
				fid: params.fid,
				viewer_fid: params.viewerFid,
				sort_type: params.sortType,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		fetchFollowing(params: {
			fid: number;
			viewerFid?: number;
			sortType?: "desc_chron" | "algorithmic";
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/following/", {
				fid: params.fid,
				viewer_fid: params.viewerFid,
				sort_type: params.sortType,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		fetchCastReactions(params: {
			hash: string;
			types: ReadonlyArray<string>;
			viewerFid?: number;
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/reactions/cast/", {
				hash: params.hash,
				types: params.types,
				viewer_fid: params.viewerFid,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		fetchUserReactions(params: {
			fid: number;
			type: "all" | "likes" | "recasts";
			viewerFid?: number;
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/reactions/user/", {
				fid: params.fid,
				type: params.type,
				viewer_fid: params.viewerFid,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		fetchNotifications(params: {
			fid: number;
			types?: ReadonlyArray<string>;
			limit?: number;
			cursor?: string;
		}) {
			return request("/v2/farcaster/notifications/", {
				fid: params.fid,
				type: params.types,
				limit: params.limit,
				cursor: params.cursor,
			});
		},
		lookupChannel(params: {
			id: string;
			type?: "id" | "parent_url";
			viewerFid?: number;
		}) {
			return request("/v2/farcaster/channel/", {
				id: params.id,
				type: params.type,
				viewer_fid: params.viewerFid,
			});
		},
		fetchChannelFeed(params: {
			channelIds: ReadonlyArray<string>;
			withRecasts?: boolean;
			viewerFid?: number;
			withReplies?: boolean;
			membersOnly?: boolean;
			fids?: ReadonlyArray<number>;
			limit?: number;
			cursor?: string;
			shouldModerate?: boolean;
		}) {
			return request("/v2/farcaster/feed/channels/", {
				channel_ids: params.channelIds,
				with_recasts: params.withRecasts,
				viewer_fid: params.viewerFid,
				with_replies: params.withReplies,
				members_only: params.membersOnly,
				fids: params.fids,
				limit: params.limit,
				cursor: params.cursor,
				should_moderate: params.shouldModerate,
			});
		},
	};
}

export async function paginateNeynar<Page extends NeynarPage, Item>(
	fetchPage: (params: { cursor?: string }) => Promise<Page>,
	itemsFromPage: (page: Page) => ReadonlyArray<Item>,
) {
	const items: Item[] = [];
	let cursor: string | undefined;
	do {
		const page = await fetchPage({ cursor });
		items.push(...itemsFromPage(page));
		cursor = page.next?.cursor || undefined;
	} while (cursor);
	return items;
}
