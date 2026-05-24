# Neynar notes for Hypersnap Farcaster

Source material read locally from:

- https://docs.neynar.com/llms.txt
- https://docs.neynar.com/llms-full.txt
- https://github.com/neynarxyz/OAS/blob/main/src/api/spec.yaml

Local cached copies live under `.hermes/research/` and are intentionally ignored if `.hermes/` is not tracked.

## Core API shape

- Base URL: `https://api.neynar.com`
- API authentication: `x-api-key` header, or the official Node SDK configuration.
- Node SDK: `@neynar/nodejs-sdk`
- Standard SDK setup:

```ts
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk'

const configuration = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY,
})

export const neynarClient = new NeynarAPIClient(configuration)
```

Required local env for v0:

```bash
NEYNAR_API_KEY=...
```

Do not commit this key.

## v0-relevant read endpoints

Primary endpoints from the OpenAPI spec:

- `GET /v2/farcaster/user/by_username/`
  - lookup user by username
  - params: `username`, optional `viewer_fid`

- `GET /v2/farcaster/user/bulk/`
  - fetch profiles by comma-separated FIDs
  - params: `fids`, optional `viewer_fid`

- `GET /v2/farcaster/feed/user/casts/`
  - chronological casts for one user
  - params: `fid`, optional `limit`, `cursor`, `include_replies`, `parent_url`, `channel_id`, `viewer_fid`

- `GET /v2/farcaster/feed/following/`
  - home/following feed for a user
  - params: `fid`, optional `with_recasts`, `limit`, `cursor`, `viewer_fid`

- `GET /v2/farcaster/cast/`
  - lookup cast by hash or URL
  - params: `identifier`, `type=url|hash`, optional `viewer_fid`

- `GET /v2/farcaster/casts/`
  - bulk fetch casts
  - params: `casts`, optional `viewer_fid`, `sort_type=trending|likes|recasts|replies|recent`

- `GET /v2/farcaster/cast/conversation/`
  - thread/conversation for a cast
  - params: `identifier`, `type=url|hash`, optional `reply_depth`, `include_chronological_parent_casts`, `sort_type`, `limit`, `cursor`, `viewer_fid`

- `GET /v2/farcaster/cast/search/`
  - search casts
  - params: `q`, optional `mode=literal|semantic|hybrid`, `sort_type`, `author_fid`, `parent_url`, `channel_id`, `limit`, `cursor`, `viewer_fid`

- `GET /v2/farcaster/followers/`
  - followers for FID
  - params: `fid`, optional `sort_type=desc_chron|algorithmic`, `limit`, `cursor`, `viewer_fid`

- `GET /v2/farcaster/following/`
  - following for FID
  - params: `fid`, optional `sort_type=desc_chron|algorithmic`, `limit`, `cursor`, `viewer_fid`

- `GET /v2/farcaster/reactions/cast/`
  - likes/recasts for a cast
  - params: `hash`, `types`, optional `limit`, `cursor`, `viewer_fid`

- `GET /v2/farcaster/reactions/user/`
  - reactions by a user
  - params: `fid`, `type=all|likes|recasts`, optional `limit`, `cursor`, `viewer_fid`

- `GET /v2/farcaster/notifications/`
  - notifications for a user
  - params: `fid`, optional `type[]`, `limit`, `cursor`

- `GET /v2/farcaster/channel/`
  - channel by ID or parent URL
  - params: `id`, optional `type=id|parent_url`, `viewer_fid`

- `GET /v2/farcaster/feed/channels/`
  - feed by channel IDs
  - params: `channel_ids`, optional `with_recasts`, `with_replies`, `members_only`, `fids`, `limit`, `cursor`, `viewer_fid`

## Pagination model

Most list endpoints use a `cursor` query param and return a `next.cursor` value. v0 sync should store per-job cursors/checkpoints in SQLite so sync is resumable.

Recommended v0 pagination helper:

```ts
async function paginate<T>(firstParams, fetchPage, consumePage) {
  let cursor = firstParams.cursor
  do {
    const page = await fetchPage({ ...firstParams, ...(cursor ? { cursor } : {}) })
    await consumePage(page)
    cursor = page.next?.cursor
  } while (cursor)
}
```

## Data mapping for our local schema

Neynar/Farcaster -> local Hypersnap:

- `fid` -> primary stable profile/user id
- `username`, `display_name`, `pfp_url`, `profile.bio.text` -> profile fields
- cast `hash` -> primary stable cast id
- cast `author.fid` -> author profile id
- cast `text`, `timestamp`, `embeds`, `mentions`, `parent_hash`, `parent_url`, channel data -> cast fields
- reactions endpoint -> local likes/recasts tables
- followers/following endpoints -> local follow edge snapshots
- notifications endpoint -> local inbox/mentions seed
- conversation endpoint -> thread expansion

## Direct Cast / DM note

Direct casts are not part of the Farcaster protocol yet. Neynar docs point to Farcaster client Direct Cast APIs and intents. Treat Direct Cast support as a separate adapter, not part of the Neynar read-only v0 mirror.

Relevant docs:

- https://docs.neynar.com/farcaster/reference/farcaster/direct-casts.md
- user-provided Notion Direct Cast API reference

## Implementation recommendation

For v0, prefer raw HTTP wrapper plus typed schemas instead of coupling every caller to SDK method names. The SDK is useful, but the raw OpenAPI endpoint map is clearer for porting Birdclaw-style sync jobs.

Suggested new files:

- `src/lib/neynar-client.ts` — API key loading, request helper, cursor helper, rate-limit/error handling
- `src/lib/farcaster-types.ts` — normalized app-level cast/profile/follow/reaction types
- `src/lib/farcaster-sync.ts` — read-only sync orchestration
- `src/lib/farcaster-store.ts` — SQLite upserts and cursor checkpoints
- tests with fixture JSON, no live API key required in CI

## v0 sync order

1. Resolve configured username(s) to FID(s).
2. Upsert own profile(s).
3. Sync authored casts with `feed/user/casts`.
4. Sync following feed with `feed/following`.
5. Sync followers/following graph.
6. For interesting casts, hydrate conversations and reactions lazily.
7. Sync notifications for inbox/mentions if available for the account/key.
8. Index links and FTS locally.
