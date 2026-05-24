// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBirdclawPathsForTests } from "./config";
import { getNativeDb, resetDatabaseForTests } from "./db";
import {
	getFarcasterSyncCheckpoint,
	setFarcasterSyncCheckpoint,
	upsertFarcasterCast,
	upsertFarcasterFollowEdge,
	upsertFarcasterProfile,
} from "./farcaster-store";

let homeDir = "";

function columnNames(tableName: string) {
	return (
		getNativeDb({ seedDemoData: false })
			.prepare(`pragma table_info(${tableName})`)
			.all() as Array<{ name: string }>
	).map((column) => column.name);
}

describe("Farcaster store", () => {
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "hypersnap-farcaster-store-"));
		process.env.BIRDCLAW_HOME = homeDir;
		resetBirdclawPathsForTests();
		resetDatabaseForTests();
	});

	afterEach(() => {
		resetDatabaseForTests();
		resetBirdclawPathsForTests();
		delete process.env.BIRDCLAW_HOME;
		rmSync(homeDir, { recursive: true, force: true });
	});

	it("creates Farcaster tables for the read-only local mirror", () => {
		expect(columnNames("farcaster_profiles")).toEqual(
			expect.arrayContaining([
				"fid",
				"username",
				"display_name",
				"bio",
				"pfp_url",
				"followers_count",
				"following_count",
				"raw_json",
				"updated_at",
			]),
		);
		expect(columnNames("farcaster_casts")).toEqual(
			expect.arrayContaining([
				"hash",
				"author_fid",
				"text",
				"created_at",
				"parent_hash",
				"parent_url",
				"channel_id",
				"embeds_json",
				"mentions_json",
				"raw_json",
			]),
		);
		expect(columnNames("farcaster_follow_edges")).toEqual(
			expect.arrayContaining([
				"account_fid",
				"direction",
				"fid",
				"current",
				"first_seen_at",
				"last_seen_at",
			]),
		);
		expect(columnNames("farcaster_sync_checkpoints")).toEqual(
			expect.arrayContaining([
				"scope",
				"account_fid",
				"cursor",
				"metadata_json",
				"updated_at",
			]),
		);
	});

	it("upserts Neynar profile and cast payloads into normalized Farcaster rows", () => {
		const db = getNativeDb({ seedDemoData: false });
		upsertFarcasterProfile(db, {
			fid: 6841,
			username: "alice",
			display_name: "Alice",
			pfp_url: "https://example.com/alice.png",
			profile: { bio: { text: "building hypersnap" } },
			follower_count: 10,
			following_count: 5,
		});
		upsertFarcasterCast(db, {
			hash: "0xabc",
			author: { fid: 6841, username: "alice" },
			text: "hello farcaster https://example.com",
			timestamp: "2026-05-24T00:00:00.000Z",
			parent_hash: "0xparent",
			parent_url: "chain://eip155:1/erc721:0xchannel",
			channel: { id: "hypersnap" },
			embeds: [{ url: "https://example.com" }],
			mentioned_profiles: [{ fid: 99, username: "bob" }],
			reactions: { likes_count: 2, recasts_count: 1 },
			replies: { count: 3 },
		});

		expect(
			db
				.prepare(
					"select fid, username, display_name, bio, pfp_url from farcaster_profiles where fid = 6841",
				)
				.get(),
		).toEqual({
			fid: 6841,
			username: "alice",
			display_name: "Alice",
			bio: "building hypersnap",
			pfp_url: "https://example.com/alice.png",
		});
		expect(
			db
				.prepare(
					"select hash, author_fid, text, parent_hash, parent_url, channel_id, like_count, recast_count, reply_count from farcaster_casts where hash = '0xabc'",
				)
				.get(),
		).toEqual({
			hash: "0xabc",
			author_fid: 6841,
			text: "hello farcaster https://example.com",
			parent_hash: "0xparent",
			parent_url: "chain://eip155:1/erc721:0xchannel",
			channel_id: "hypersnap",
			like_count: 2,
			recast_count: 1,
			reply_count: 3,
		});
	});

	it("records follow edges and resumable Neynar cursor checkpoints", () => {
		const db = getNativeDb({ seedDemoData: false });
		upsertFarcasterFollowEdge(db, {
			accountFid: 6841,
			direction: "following",
			fid: 99,
			source: "neynar",
			now: "2026-05-24T00:00:00.000Z",
		});
		setFarcasterSyncCheckpoint(db, {
			scope: "following-feed",
			accountFid: 6841,
			cursor: "next-cursor",
			metadata: { pages: 2 },
			now: "2026-05-24T00:01:00.000Z",
		});

		expect(
			db
				.prepare(
					"select account_fid, direction, fid, source, current from farcaster_follow_edges",
				)
				.get(),
		).toEqual({
			account_fid: 6841,
			direction: "following",
			fid: 99,
			source: "neynar",
			current: 1,
		});
		expect(getFarcasterSyncCheckpoint(db, "following-feed", 6841)).toEqual({
			cursor: "next-cursor",
			metadata: { pages: 2 },
			updatedAt: "2026-05-24T00:01:00.000Z",
		});
	});
});
