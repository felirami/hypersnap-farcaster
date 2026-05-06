// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBirdclawPathsForTests } from "./config";
import { resetDatabaseForTests } from "./db";

let homeDir = "";

describe("URL expansion cache", () => {
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "birdclaw-url-expansion-"));
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

	it("extracts URLs and avoids repeated network expansion when cached", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			url: "https://docs.blacksmith.sh/blacksmith-testbox/overview",
		});
		const { expandUrlsFromTexts, extractUrls } =
			await import("./url-expansion");

		expect(
			extractUrls("See https://t.co/uEKD3k4vep, and https://example.com/x."),
		).toEqual(["https://t.co/uEKD3k4vep", "https://example.com/x"]);

		await expect(
			expandUrlsFromTexts(["See https://t.co/uEKD3k4vep"], {
				fetchImpl,
			}),
		).resolves.toEqual([
			expect.objectContaining({
				url: "https://t.co/uEKD3k4vep",
				finalUrl: "https://docs.blacksmith.sh/blacksmith-testbox/overview",
				status: "hit",
				source: "network",
			}),
		]);
		await expect(
			expandUrlsFromTexts(["Again https://t.co/uEKD3k4vep"], {
				fetchImpl,
			}),
		).resolves.toEqual([
			expect.objectContaining({
				finalUrl: "https://docs.blacksmith.sh/blacksmith-testbox/overview",
				source: "cache",
			}),
		]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});
