# Hypersnap Farcaster — local port plan

Local folder: `/Users/felirami/hypersnap-farcaster`
GitHub repo: `https://github.com/felirami/hypersnap-farcaster`
Upstream source: `https://github.com/steipete/birdclaw`

## Product idea

A local-first Farcaster workspace for Hypersnap.org, initialized from Birdclaw's local-first architecture but rebranded away from Birdclaw/OpenClaw naming.

- local SQLite memory for casts, profiles, follows, reactions, mentions, notifications, and later Direct Casts if a usable source is wired
- web UI for home/feed, mentions, saved casts/likes, inbox/triage, links, profiles, and moderation lists
- scriptable CLI/JSON for agents and automation
- not a Farcaster Mini App

## Chosen decisions

- Repo name: `hypersnap-farcaster`
- GitHub owner: `felirami`
- Visibility: public
- v0 data source: Neynar API
- v0 scope: read-only local-first mirror/search/mentions/follows/links
- Direct Cast / DM support: later, using the provided Farcaster Direct Cast API reference
- Farcaster Mini App: no
- Naming: no `claw`; this is Hypersnap/Farcaster-oriented, not OpenClaw-related

## Key adaptations from Twitter/X to Farcaster

Birdclaw concept -> Farcaster equivalent:

- tweet -> cast
- profile/user -> Farcaster user/profile, keyed by fid and username
- likes/bookmarks -> reactions/saved casts where available
- followers/following -> Farcaster follows by fid
- mentions/replies -> cast parent/thread and mention embeds
- DMs -> Direct Cast adapter later; not part of protocol and not part of read-only Neynar v0
- xurl/bird transports -> Neynar transport adapter first, with room for direct Hub/Pinata later
- Twitter archive importer -> Farcaster API backfill and local backup/export/import

## Neynar docs read

Source material:

- `https://docs.neynar.com/llms.txt`
- `https://docs.neynar.com/llms-full.txt`
- `https://github.com/neynarxyz/OAS/blob/main/src/api/spec.yaml`

Detailed notes are in `NEYNAR_NOTES.md`.

Important API basics:

- Base URL: `https://api.neynar.com`
- Auth: `x-api-key` header or `@neynar/nodejs-sdk` `Configuration({ apiKey })`
- Required local env: `NEYNAR_API_KEY`
- List endpoints use cursor pagination: pass `cursor`, then store returned `next.cursor` for resumable sync.

v0 endpoints we care about:

- `GET /v2/farcaster/user/by_username/`
- `GET /v2/farcaster/user/bulk/`
- `GET /v2/farcaster/feed/user/casts/`
- `GET /v2/farcaster/feed/following/`
- `GET /v2/farcaster/cast/`
- `GET /v2/farcaster/casts/`
- `GET /v2/farcaster/cast/conversation/`
- `GET /v2/farcaster/cast/search/`
- `GET /v2/farcaster/followers/`
- `GET /v2/farcaster/following/`
- `GET /v2/farcaster/reactions/cast/`
- `GET /v2/farcaster/reactions/user/`
- `GET /v2/farcaster/notifications/`
- `GET /v2/farcaster/channel/`
- `GET /v2/farcaster/feed/channels/`

## First implementation phases

### Phase 0 — repo preparation

- Rename package/bin/app storage from `birdclaw`/`~/.birdclaw` to Hypersnap Farcaster equivalents.
- Keep upstream remote for attribution/reference.
- Keep repo public under `felirami/hypersnap-farcaster`.

### Phase 1 — Neynar client and Farcaster domain model

- Add Neynar config/env loading without committing secrets.
- Add raw HTTP wrapper or SDK wrapper with typed response normalization.
- Add cursor pagination helper and SQLite sync checkpoints.
- Introduce Farcaster domain types: `casts`, `profiles`, `reactions`, `cast_collections`, `cast_account_edges`, `follow_edges` keyed by fid/hash.
- Start with tests using fixture JSON; no live API key in CI.

Suggested files:

- `src/lib/neynar-client.ts`
- `src/lib/farcaster-types.ts`
- `src/lib/farcaster-sync.ts`
- `src/lib/farcaster-store.ts`

### Phase 2 — read-only sync

- Resolve configured username(s) to FID(s).
- Upsert profile(s).
- Sync authored casts via `feed/user/casts`.
- Sync following feed via `feed/following`.
- Sync followers/following graph.
- Lazily hydrate conversations and reactions for interesting casts.
- Sync notifications for inbox/mentions if available.
- Index links and FTS locally.

### Phase 3 — CLI/UI port

- Add CLI commands for sync, query, profile, thread, search, and backup.
- Adapt Home, Mentions, Links, Inbox, Profiles, and Search routes to cast data.
- Rename UI copy from Tweets/DMs/X to Casts/Farcaster/Hypersnap.

### Phase 4 — Direct Cast adapter later

- Read the user-provided Farcaster Direct Cast API reference.
- Treat Direct Casts as separate adapter/storage from Neynar protocol-ish read sync.
- Do not block v0 read-only local mirror on Direct Casts.

## Current local environment notes

- Local folder exists and is pushed to GitHub.
- `gh` is authenticated as `felirami`.
- Project requires Node `>=25.8.1 <27`; current active shell showed Node 22.21.0, so we likely need Node 25/26 before install/build/test.
- Package manager is `pnpm@10.31.0`.
