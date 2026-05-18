import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PeriodDigestContext } from "#/lib/period-digest";
import { MarkdownViewer } from "./MarkdownViewer";

const authorProfile = {
	id: "profile_chainzenit",
	handle: "ChainZenit",
	displayName: "Strata",
	bio: "",
	followersCount: 0,
	avatarHue: 280,
	createdAt: "2026-05-18T08:00:00.000Z",
};

const context = {
	window: {
		label: "Today",
		since: "2026-05-18T00:00:00.000Z",
		until: "2026-05-18T12:00:00.000Z",
	},
	includeDms: false,
	counts: {
		home: 1,
		mentions: 1,
		authored: 0,
		likes: 0,
		bookmarks: 0,
		dms: 0,
		links: 0,
	},
	tweets: [
		{
			id: "2056286865875935400",
			url: "https://x.com/ChainZenit/status/2056286865875935400",
			source: "mentions",
			author: "ChainZenit",
			name: "Strata",
			authorProfile,
			createdAt: "2026-05-18T09:12:00.000Z",
			text: "@GOATNetwork @openclaw oh nice, autonomous agents running on goAT",
			likeCount: 0,
			liked: false,
			bookmarked: false,
			needsReply: true,
		},
	],
	dms: [],
	links: [],
	hash: "demo",
} satisfies PeriodDigestContext;

describe("MarkdownViewer", () => {
	it("links generated tweet citations without showing raw ids", () => {
		render(
			<MarkdownViewer
				context={context}
				markdown={
					"ChainZenit reacted positively to “autonomous agents running on goAT” (tweet_2056286865875935400)."
				}
			/>,
		);

		expect(
			screen.queryByText(/tweet_2056286865875935400/),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("link", {
				name: "“autonomous agents running on goAT”",
			}),
		).toHaveAttribute(
			"href",
			"https://x.com/ChainZenit/status/2056286865875935400",
		);
	});
});
