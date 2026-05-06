// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBirdclawPathsForTests } from "./config";
import { getNativeDb, resetDatabaseForTests } from "./db";

const mocks = vi.hoisted(() => ({
	lookupProfileViaBird: vi.fn(),
	lookupUsersByIds: vi.fn(),
}));

vi.mock("./bird", () => ({
	lookupProfileViaBird: mocks.lookupProfileViaBird,
}));

vi.mock("./xurl", () => ({
	lookupUsersByIds: mocks.lookupUsersByIds,
}));

let homeDir = "";

function resetStore() {
	const db = getNativeDb();
	db.exec(`
    delete from ai_scores;
    delete from tweet_actions;
    delete from dm_fts;
    delete from tweets_fts;
    delete from dm_messages;
    delete from dm_conversations;
    delete from tweets;
    delete from profiles;
    delete from accounts;
    delete from sync_cache;
  `);
	db.prepare(
		"insert into accounts (id, name, handle, transport, is_default, created_at) values ('acct_primary', 'Peter', '@steipete', 'archive', 1, '2009-03-19T22:54:05.000Z')",
	).run();
	db.prepare(
		"insert into profiles (id, handle, display_name, bio, followers_count, avatar_hue, created_at) values ('profile_user_42', 'id42', 'id42', 'Imported from archive user 42', 0, 210, '2009-03-19T22:54:05.000Z')",
	).run();
	db.prepare(
		"insert into dm_conversations (id, account_id, participant_profile_id, title, last_message_at, unread_count, needs_reply) values ('dm_1', 'acct_primary', 'profile_user_42', 'id42', '2026-05-01T00:00:00.000Z', 0, 1)",
	).run();
}

describe("profile resolver", () => {
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "birdclaw-profile-resolver-"));
		process.env.BIRDCLAW_HOME = homeDir;
		resetBirdclawPathsForTests();
		resetDatabaseForTests();
		mocks.lookupProfileViaBird.mockReset();
		mocks.lookupUsersByIds.mockReset();
		resetStore();
	});

	afterEach(() => {
		resetDatabaseForTests();
		resetBirdclawPathsForTests();
		delete process.env.BIRDCLAW_HOME;
		rmSync(homeDir, { recursive: true, force: true });
	});

	it("resolves placeholder profiles through bird and reuses persistent cache", async () => {
		mocks.lookupProfileViaBird.mockResolvedValueOnce({
			id: "42",
			username: "sam",
			name: "Sam Altman",
			description: "Working on AGI",
			profile_image_url:
				"https://pbs.twimg.com/profile_images/42/avatar_normal.jpg",
			public_metrics: { followers_count: 123, following_count: 45 },
		});
		const { resolveProfilesForIds } = await import("./profile-resolver");

		await expect(resolveProfilesForIds(["profile_user_42"])).resolves.toEqual([
			expect.objectContaining({
				status: "hit",
				source: "bird",
				profile: expect.objectContaining({ handle: "sam" }),
			}),
		]);
		expect(mocks.lookupUsersByIds).not.toHaveBeenCalled();

		const db = getNativeDb();
		db.prepare(
			"update profiles set handle = 'id42', display_name = 'id42', bio = 'Imported from archive user 42', followers_count = 0 where id = 'profile_user_42'",
		).run();
		await expect(resolveProfilesForIds(["profile_user_42"])).resolves.toEqual([
			expect.objectContaining({
				status: "hit",
				source: "cache",
				profile: expect.objectContaining({ handle: "sam" }),
			}),
		]);
		expect(mocks.lookupProfileViaBird).toHaveBeenCalledTimes(1);
	});

	it("negative-caches failed lookups", async () => {
		mocks.lookupProfileViaBird.mockRejectedValueOnce(new Error("bird down"));
		mocks.lookupUsersByIds.mockRejectedValueOnce(new Error("xurl down"));
		const { resolveProfilesForIds } = await import("./profile-resolver");

		await expect(resolveProfilesForIds(["profile_user_42"])).resolves.toEqual([
			expect.objectContaining({
				status: "error",
				source: "xurl",
				error: "xurl down",
			}),
		]);
		await expect(resolveProfilesForIds(["profile_user_42"])).resolves.toEqual([
			expect.objectContaining({
				status: "error",
				source: "negative-cache",
				error: "xurl down",
			}),
		]);
		expect(mocks.lookupProfileViaBird).toHaveBeenCalledTimes(1);
		expect(mocks.lookupUsersByIds).toHaveBeenCalledTimes(1);
	});
});
