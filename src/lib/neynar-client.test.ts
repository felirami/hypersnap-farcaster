import { afterEach, describe, expect, it, vi } from "vitest";
import {
	NeynarApiError,
	createNeynarClient,
	getNeynarApiKeyFromEnv,
	paginateNeynar,
} from "./neynar-client";

describe("Neynar client", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reads the API key from NEYNAR_API_KEY and trims whitespace", () => {
		vi.stubEnv("NEYNAR_API_KEY", "  test-key  ");

		expect(getNeynarApiKeyFromEnv()).toBe("test-key");
	});

	it("returns null when NEYNAR_API_KEY is blank", () => {
		vi.stubEnv("NEYNAR_API_KEY", "   ");

		expect(getNeynarApiKeyFromEnv()).toBeNull();
	});

	it("sends x-api-key and encoded query params to Neynar", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ user: { fid: 6841, username: "alice" } }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
		);
		const client = createNeynarClient({ apiKey: "secret", fetch: fetchMock });

		await expect(client.lookupUserByUsername("alice.eth")).resolves.toEqual({
			user: { fid: 6841, username: "alice" },
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe(
			"https://api.neynar.com/v2/farcaster/user/by_username/?username=alice.eth",
		);
		expect(init).toMatchObject({
			headers: {
				accept: "application/json",
				"x-api-key": "secret",
			},
		});
	});

	it("serializes array query params as comma-separated values", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ users: [] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		);
		const client = createNeynarClient({ apiKey: "secret", fetch: fetchMock });

		await client.fetchBulkUsers([1, 2, 3]);

		const [url] = fetchMock.mock.calls[0]!;
		expect(String(url)).toBe(
			"https://api.neynar.com/v2/farcaster/user/bulk/?fids=1%2C2%2C3",
		);
	});

	it("maps v0 read methods to Neynar endpoints", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		);
		const client = createNeynarClient({ apiKey: "secret", fetch: fetchMock });

		await client.fetchFollowingFeed({ fid: 1, withRecasts: true, limit: 2 });
		await client.lookupCast({ identifier: "0xabc", type: "hash" });
		await client.fetchBulkCasts(["0x1", "0x2"], { sortType: "recent" });
		await client.fetchCastConversation({
			identifier: "0xabc",
			type: "hash",
			replyDepth: 2,
		});
		await client.searchCasts({ q: "hypersnap", mode: "hybrid", limit: 5 });
		await client.fetchFollowers({ fid: 1, sortType: "desc_chron" });
		await client.fetchFollowing({ fid: 1 });
		await client.fetchCastReactions({
			hash: "0xabc",
			types: ["likes", "recasts"],
		});
		await client.fetchUserReactions({ fid: 1, type: "likes" });
		await client.fetchNotifications({ fid: 1, types: ["mentions", "recasts"] });
		await client.lookupChannel({ id: "hypersnap" });
		await client.fetchChannelFeed({
			channelIds: ["hypersnap", "farcaster"],
			withReplies: true,
		});

		const urls = fetchMock.mock.calls.map(([url]) => String(url));
		expect(urls).toEqual([
			"https://api.neynar.com/v2/farcaster/feed/following/?fid=1&with_recasts=true&limit=2",
			"https://api.neynar.com/v2/farcaster/cast/?identifier=0xabc&type=hash",
			"https://api.neynar.com/v2/farcaster/casts/?casts=0x1%2C0x2&sort_type=recent",
			"https://api.neynar.com/v2/farcaster/cast/conversation/?identifier=0xabc&type=hash&reply_depth=2",
			"https://api.neynar.com/v2/farcaster/cast/search/?q=hypersnap&mode=hybrid&limit=5",
			"https://api.neynar.com/v2/farcaster/followers/?fid=1&sort_type=desc_chron",
			"https://api.neynar.com/v2/farcaster/following/?fid=1",
			"https://api.neynar.com/v2/farcaster/reactions/cast/?hash=0xabc&types=likes%2Crecasts",
			"https://api.neynar.com/v2/farcaster/reactions/user/?fid=1&type=likes",
			"https://api.neynar.com/v2/farcaster/notifications/?fid=1&type=mentions%2Crecasts",
			"https://api.neynar.com/v2/farcaster/channel/?id=hypersnap",
			"https://api.neynar.com/v2/farcaster/feed/channels/?channel_ids=hypersnap%2Cfarcaster&with_replies=true",
		]);
	});

	it("raises NeynarApiError with status and response body on non-2xx responses", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ message: "API key missing" }), {
					status: 401,
					headers: { "content-type": "application/json" },
				}),
		);
		const client = createNeynarClient({ apiKey: "secret", fetch: fetchMock });

		await expect(client.fetchUserCasts({ fid: 6841 })).rejects.toMatchObject({
			_tag: "NeynarApiError",
			status: 401,
			body: { message: "API key missing" },
		});
		await expect(client.fetchUserCasts({ fid: 6841 })).rejects.toBeInstanceOf(
			NeynarApiError,
		);
	});

	it("paginates until Neynar stops returning a next cursor", async () => {
		const seenCursors: Array<string | undefined> = [];
		const pages = [
			{ casts: [{ hash: "0x1" }], next: { cursor: "cursor-2" } },
			{ casts: [{ hash: "0x2" }], next: { cursor: null } },
		];

		const items = await paginateNeynar(
			async ({ cursor }) => {
				seenCursors.push(cursor);
				return pages.shift()!;
			},
			(page) => page.casts,
		);

		expect(seenCursors).toEqual([undefined, "cursor-2"]);
		expect(items).toEqual([{ hash: "0x1" }, { hash: "0x2" }]);
	});
});
