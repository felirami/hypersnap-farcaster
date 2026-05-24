# Birdclaw for Farcaster — local port plan

Local folder: `/Users/felirami/hypersnap-farcaster`
Upstream source: `https://github.com/steipete/birdclaw`

## Product idea

A local-first Farcaster workspace inspired by Birdclaw:

- local SQLite memory for casts, profiles, follows, reactions, mentions, notifications, and possibly DMs if a usable source exists
- web UI for home/feed, mentions, saved casts/likes, inbox/triage, links, profiles, and moderation lists
- scriptable CLI/JSON for agents and automation
- optional Mini App publishing layer later, but core should stay local-first

## Key adaptations from Twitter/X to Farcaster

Birdclaw concept -> Farcaster equivalent:

- tweet -> cast
- profile/user -> Farcaster user/profile, keyed by fid and username
- likes/bookmarks -> reactions/saved casts where available
- followers/following -> Farcaster follows by fid
- mentions/replies -> cast parent/thread and mention embeds
- DMs -> not first-class via public Hub APIs; needs separate source or deferred scope
- xurl/bird transports -> Farcaster Hub/Neynar/Pinata/third-party transport adapters
- Twitter archive importer -> Farcaster data/import source, likely API backfill rather than official archive

## Decisions needed before GitHub push / first real implementation

1. Repo identity
   - Name: `hypersnap-farcaster
   - Public or private GitHub repo?
   - Personal account `felirami` or org?

2. Data source / transport
   - Use direct Farcaster Hub APIs, Neynar, Pinata, or another provider?
   - If provider API is needed, provide key via local env only; do not commit secrets.

3. Scope for v0
   - Recommended v0: read-only local mirror + search + mentions + profile/follow graph + links.
   - Defer posting/replying/moderation writes until auth and signing are clear.
   - Defer DMs unless we have a supported Farcaster DM source.

4. Product stance
   - Pure local desktop/web tool, or also a Farcaster Mini App?
   - If Mini App: need stable production domain and signed `accountAssociation` for `/.well-known/farcaster.json`.

5. Branding
   - Keep Birdclaw-inspired naming/credit, or fully rebrand to avoid confusion with upstream?

## First implementation phases

### Phase 0 — repo preparation

- Rename package/bin/app storage from `birdclaw`/`~/.birdclaw` to selected Farcaster name.
- Keep upstream remote for attribution/reference.
- Create new GitHub origin only after repo name/visibility are chosen.

### Phase 1 — schema language port

- Introduce Farcaster domain types: `casts`, `profiles`, `reactions`, `cast_collections`, `cast_account_edges`, `follow_edges` keyed by fid/hash.
- Add migration compatibility or start from clean schema for v0.
- Rename UI copy from Tweets/DMs/X to Casts/Farcaster.

### Phase 2 — transport adapters

- Add a provider abstraction: Hub/Neynar/Pinata.
- Implement profile hydration by fid/username.
- Implement authored casts, mentions, replies/thread fetch, reactions, and follows backfill.

### Phase 3 — UI/CLI

- Adapt Home, Mentions, Links, Inbox, Profiles, and Search routes to cast data.
- Add CLI commands for sync, query, profile, thread, and backup.

### Phase 4 — optional Mini App

- Add `@farcaster/miniapp-sdk` only if we are publishing a Mini App surface.
- Serve `/.well-known/farcaster.json` for the chosen domain.
- Add page-level `fc:miniapp` metadata and call `sdk.actions.ready()`.

## Current local environment notes

- Local folder exists and is cloned from upstream.
- `gh` is authenticated as `felirami`.
- Project requires Node `>=25.8.1 <27`; current active shell showed Node 22.21.0, so we likely need Node 25/26 before install/build/test.
- Package manager is `pnpm@10.31.0`.

## Chosen decisions

- Repo name: `hypersnap-farcaster`
- GitHub owner: `felirami`
- Visibility: public
- v0 data source: Neynar API
- v0 scope: read-only local-first mirror/search/mentions/follows/links
- Direct Cast / DM support: later, using the provided Farcaster Direct Cast API reference
- Farcaster Mini App: no
- Naming: no `claw`; this is Hypersnap/Farcaster-oriented, not OpenClaw-related
