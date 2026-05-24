export interface NeynarProfilePayload {
	fid?: number;
	username?: string;
	display_name?: string;
	displayName?: string;
	pfp_url?: string | null;
	pfp?: { url?: string | null } | null;
	profile?: { bio?: { text?: string | null } | null } | null;
	bio?: string | null;
	follower_count?: number;
	followers_count?: number;
	following_count?: number;
	power_badge?: boolean;
	custody_address?: string | null;
	verified_addresses?: unknown;
}

export interface NeynarCastPayload {
	hash?: string;
	author?: NeynarProfilePayload | null;
	text?: string;
	timestamp?: string;
	created_at?: string;
	parent_hash?: string | null;
	parent_url?: string | null;
	root_parent_url?: string | null;
	channel?: { id?: string | null } | null;
	channel_id?: string | null;
	embeds?: unknown[];
	mentioned_profiles?: unknown[];
	mentions?: unknown[];
	reactions?: {
		likes_count?: number;
		recasts_count?: number;
	} | null;
	replies?: { count?: number } | null;
}

export type FarcasterFollowDirection = "followers" | "following";

export interface FarcasterSyncCheckpoint {
	cursor: string | null;
	metadata: Record<string, unknown>;
	updatedAt: string;
}
