import type { Database } from "./sqlite";
import type {
	FarcasterFollowDirection,
	FarcasterSyncCheckpoint,
	NeynarCastPayload,
	NeynarProfilePayload,
} from "./farcaster-types";

function nowIso(now?: string) {
	return now ?? new Date().toISOString();
}

function requireNumber(value: unknown, name: string) {
	const number = Number(value);
	if (!Number.isFinite(number)) {
		throw new Error(`Farcaster payload is missing ${name}`);
	}
	return number;
}

function requireString(value: unknown, name: string) {
	const string = String(value ?? "").trim();
	if (!string) {
		throw new Error(`Farcaster payload is missing ${name}`);
	}
	return string;
}

function json(value: unknown) {
	return JSON.stringify(value ?? null);
}

function profileDisplayName(profile: NeynarProfilePayload, username: string) {
	return (
		String(profile.display_name ?? profile.displayName ?? username).trim() ||
		username
	);
}

function profileBio(profile: NeynarProfilePayload) {
	return String(profile.profile?.bio?.text ?? profile.bio ?? "");
}

function profilePfpUrl(profile: NeynarProfilePayload) {
	return profile.pfp_url ?? profile.pfp?.url ?? null;
}

export function upsertFarcasterProfile(
	db: Database,
	profile: NeynarProfilePayload,
	options: { now?: string } = {},
) {
	const fid = requireNumber(profile.fid, "fid");
	const username = requireString(profile.username, "username").replace(
		/^@/,
		"",
	);
	const now = nowIso(options.now);

	db.prepare(
		`
    insert into farcaster_profiles (
      fid, username, display_name, bio, pfp_url, followers_count, following_count,
      power_badge, custody_address, verified_addresses_json, raw_json, created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(fid) do update set
      username = excluded.username,
      display_name = case
        when excluded.display_name != excluded.username then excluded.display_name
        else farcaster_profiles.display_name
      end,
      bio = case
        when excluded.bio != '' then excluded.bio
        else farcaster_profiles.bio
      end,
      pfp_url = coalesce(excluded.pfp_url, farcaster_profiles.pfp_url),
      followers_count = excluded.followers_count,
      following_count = excluded.following_count,
      power_badge = excluded.power_badge,
      custody_address = coalesce(excluded.custody_address, farcaster_profiles.custody_address),
      verified_addresses_json = excluded.verified_addresses_json,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
    `,
	).run(
		fid,
		username,
		profileDisplayName(profile, username),
		profileBio(profile),
		profilePfpUrl(profile),
		Number(profile.follower_count ?? profile.followers_count ?? 0),
		Number(profile.following_count ?? 0),
		profile.power_badge ? 1 : 0,
		profile.custody_address ?? null,
		json(profile.verified_addresses ?? {}),
		json(profile),
		now,
		now,
	);

	return { fid, username };
}

export function upsertFarcasterCast(
	db: Database,
	cast: NeynarCastPayload,
	options: { now?: string } = {},
) {
	const hash = requireString(cast.hash, "cast hash");
	const authorFid = requireNumber(cast.author?.fid, "author fid");
	if (cast.author) {
		upsertFarcasterProfile(db, cast.author, options);
	}
	const now = nowIso(options.now);
	const createdAt = requireString(
		cast.timestamp ?? cast.created_at,
		"cast timestamp",
	);
	const mentions = cast.mentioned_profiles ?? cast.mentions ?? [];
	const channelId = cast.channel?.id ?? cast.channel_id ?? null;

	db.prepare(
		`
    insert into farcaster_casts (
      hash, author_fid, text, created_at, parent_hash, parent_url, root_parent_url,
      channel_id, embeds_json, mentions_json, raw_json, reply_count, recast_count,
      like_count, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(hash) do update set
      author_fid = excluded.author_fid,
      text = excluded.text,
      created_at = excluded.created_at,
      parent_hash = excluded.parent_hash,
      parent_url = excluded.parent_url,
      root_parent_url = excluded.root_parent_url,
      channel_id = excluded.channel_id,
      embeds_json = excluded.embeds_json,
      mentions_json = excluded.mentions_json,
      raw_json = excluded.raw_json,
      reply_count = excluded.reply_count,
      recast_count = excluded.recast_count,
      like_count = excluded.like_count,
      updated_at = excluded.updated_at
    `,
	).run(
		hash,
		authorFid,
		String(cast.text ?? ""),
		createdAt,
		cast.parent_hash ?? null,
		cast.parent_url ?? null,
		cast.root_parent_url ?? null,
		channelId,
		json(cast.embeds ?? []),
		json(mentions),
		json(cast),
		Number(cast.replies?.count ?? 0),
		Number(cast.reactions?.recasts_count ?? 0),
		Number(cast.reactions?.likes_count ?? 0),
		now,
	);

	return { hash, authorFid };
}

export function upsertFarcasterFollowEdge(
	db: Database,
	input: {
		accountFid: number;
		direction: FarcasterFollowDirection;
		fid: number;
		source?: string;
		now?: string;
	},
) {
	const now = nowIso(input.now);
	db.prepare(
		`
    insert into farcaster_follow_edges (
      account_fid, direction, fid, source, current, first_seen_at, last_seen_at,
      ended_at, updated_at
    ) values (?, ?, ?, ?, 1, ?, ?, null, ?)
    on conflict(account_fid, direction, fid) do update set
      source = excluded.source,
      current = 1,
      last_seen_at = excluded.last_seen_at,
      ended_at = null,
      updated_at = excluded.updated_at
    `,
	).run(
		input.accountFid,
		input.direction,
		input.fid,
		input.source ?? "neynar",
		now,
		now,
		now,
	);
}

export function setFarcasterSyncCheckpoint(
	db: Database,
	input: {
		scope: string;
		accountFid: number;
		cursor: string | null;
		metadata?: Record<string, unknown>;
		now?: string;
	},
) {
	const now = nowIso(input.now);
	db.prepare(
		`
    insert into farcaster_sync_checkpoints (
      scope, account_fid, cursor, metadata_json, updated_at
    ) values (?, ?, ?, ?, ?)
    on conflict(scope, account_fid) do update set
      cursor = excluded.cursor,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
    `,
	).run(
		input.scope,
		input.accountFid,
		input.cursor,
		json(input.metadata ?? {}),
		now,
	);
}

export function getFarcasterSyncCheckpoint(
	db: Database,
	scope: string,
	accountFid: number,
): FarcasterSyncCheckpoint | undefined {
	const row = db
		.prepare(
			`
      select cursor, metadata_json, updated_at
      from farcaster_sync_checkpoints
      where scope = ? and account_fid = ?
      `,
		)
		.get(scope, accountFid) as
		| { cursor: string | null; metadata_json: string; updated_at: string }
		| undefined;

	if (!row) {
		return undefined;
	}

	return {
		cursor: row.cursor,
		metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
		updatedAt: row.updated_at,
	};
}
