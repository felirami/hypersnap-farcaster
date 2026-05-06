// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBirdclawPathsForTests } from "./config";
import { getNativeDb, resetDatabaseForTests } from "./db";

let homeDir = "";

describe("whois", () => {
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "birdclaw-whois-"));
		process.env.BIRDCLAW_HOME = homeDir;
		resetBirdclawPathsForTests();
		resetDatabaseForTests();
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
			"insert into profiles (id, handle, display_name, bio, followers_count, avatar_hue, created_at) values ('profile_me', 'steipete', 'Peter', '', 1000, 18, '2009-03-19T22:54:05.000Z')",
		).run();
		db.prepare(
			"insert into profiles (id, handle, display_name, bio, followers_count, avatar_hue, created_at) values ('profile_user_42', 'aditya', 'Aditya', 'Blacksmith cofounder', 5000, 210, '2020-01-01T00:00:00.000Z')",
		).run();
		db.prepare(
			"insert into dm_conversations (id, account_id, participant_profile_id, title, last_message_at, unread_count, needs_reply) values ('dm_blacksmith', 'acct_primary', 'profile_user_42', 'Aditya', '2026-05-01T00:00:00.000Z', 0, 1)",
		).run();
		for (const message of [
			{
				id: "dm_before",
				text: "Hey Peter",
				createdAt: "2026-05-01T00:00:00.000Z",
				sender: "profile_user_42",
				direction: "inbound",
			},
			{
				id: "dm_match",
				text: "I am one of the Blacksmith cofounders, try the testboxes",
				createdAt: "2026-05-01T00:01:00.000Z",
				sender: "profile_user_42",
				direction: "inbound",
			},
		]) {
			db.prepare(
				`
        insert into dm_messages (
          id, conversation_id, sender_profile_id, text, created_at, direction, is_replied, media_count
        ) values (?, 'dm_blacksmith', ?, ?, ?, ?, 0, 0)
        `,
			).run(
				message.id,
				message.sender,
				message.text,
				message.createdAt,
				message.direction,
			);
			db.prepare("insert into dm_fts (message_id, text) values (?, ?)").run(
				message.id,
				message.text,
			);
		}
	});

	afterEach(() => {
		resetDatabaseForTests();
		resetBirdclawPathsForTests();
		delete process.env.BIRDCLAW_HOME;
		rmSync(homeDir, { recursive: true, force: true });
	});

	it("clusters DM evidence into ranked identity candidates", async () => {
		const { runWhois } = await import("./whois");

		const result = await runWhois("blacksmith", {
			resolveProfiles: false,
			expandUrls: false,
			context: 1,
		});

		expect(result.candidates[0]).toMatchObject({
			confidence: expect.any(Number),
			reasons: expect.arrayContaining([
				"resolved profile",
				"cofounder language",
				"message text matches query",
			]),
			conversation: expect.objectContaining({
				id: "dm_blacksmith",
				participant: expect.objectContaining({ handle: "aditya" }),
			}),
			evidence: [
				expect.objectContaining({
					messageId: "dm_match",
					text: expect.stringContaining("Blacksmith cofounders"),
				}),
			],
		});
		expect(result.candidates[0]?.confidence).toBeGreaterThanOrEqual(80);
	});
});
