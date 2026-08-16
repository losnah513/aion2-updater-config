# aion2-updater-config

KINOJO INFO GitHub Pages upload package.

- `index.html`: GitHub Pages root entry redirect
- `config.json`: Chrome extension remote config compatibility file
- `kinojo-main/`: KINOJO INFO main, common UI/core/pages/docs
- `hall-of-fame/`: Hall of Fame page and assets
- `sanctuary/`: Sanctuary page

`config.json` is intentionally kept at repository root because the extension currently reads `/config.json`.

## Character detail modal

- The shared modal lives in `ui/kinojo-character-reaction.*` and is used by Hall of Fame, ranking, and sanctuary pages on PC and mobile.
- The overview keeps stats and skills side by side on desktop, with independent category tabs to reduce vertical scrolling.
- Skill cards highlight levels 20+, 25+, and 30+ with yellow, orange, and red gradient borders and badges.
- The character header uses the original square profile image and groups class, server, level, legion, and title without repeating those facts below the stats.
- Manual full-detail refresh is mounted in the right side of the character header on desktop and stacks below the profile on mobile. Refresh completion appears as a temporary toast at the top of the modal.
- Daevanion uses eight compact board cards in one desktop row. The selected board opens a 3:7 workspace with cumulative effects in a two-column list and a normalized 15×15 node map supplied by `kinojo_character_daevanion_detail_v307`.
- Equipment rows use the official grade color family, match applied appearances by the official slot name, and keep enhancement separate from breakthrough. Item information, stats, soul engraving stats, and soul engraving skill options use compact two-column layouts on desktop.
- The Arcana tab groups equipped Arcana by official set data and shows the 2-set and 4-set effects with their current applied state.
- Nested modal scroll areas hand wheel scrolling back to the outer modal when the inner area reaches its top or bottom boundary.
- Passkey users do not see the comparison tab while viewing a character owned by their own account.

## Class icon assets

- All WEB class icons use the shared `assets/images/classes/class_icon_<class>.png` paths. Hall of Fame, ranking, sanctuary, Arcana, authentication, character detail, and Daevanion boards must reuse these paths instead of adding page-specific class icon files.
- The active nine icons are the 256×256 transparent PNG emblems built from the user-provided in-game diamond interiors, frames, and class artwork without glyph-threshold extraction or recoloring. The level text and outer screenshot background are removed; fine class lines and the original in-game colors remain intact.
- The filename mapping follows the user's direct Drive audit: the former `assassin` artwork is Gladiator, the former `cleric` artwork is Assassin, the former `gladiator` artwork is Cleric, and the existing Chanter artwork remains Chanter.
- The previous PLAYNC originals are preserved unchanged under `assets/images/classes/original/` with the same file names for rollback and comparison only. Runtime code must not reference the `original` folder.

## KINOJO Meter admin

- The MASTER-only Meter console is divided into Download, Meter, Statistics, Notice, and Dungeon Log management tabs on desktop and mobile.
- Stable and Staging controls are shown side by side on desktop and stack on mobile. Download, Core launch, statistics visibility, notice publication, and notice pinning all reuse the shared ranking slider switch.
- Download and private Core authorization keep independent KINOJO level allowlists. Current Launcher/Core release data is read-only at the top of Meter management.
- Statistics management groups Server-owned collection flow, validation quality, and publication readiness without recalculating Server metrics in the browser.
- Dungeon logs reuse the existing selected-character session and Server Catalog; only one lifecycle row is retained per dungeon visit and the list is ordered by exit time. Per-packet log duplication is forbidden.

## KINOJO Meter presence and party-card profile source

- The public desktop/mobile Meter page counts every active Meter user. Name publication defaults to ON; users who turn it OFF remain in the active count and appear only as an anonymous-user aggregate. The list refreshes every 15 seconds and Server expires stale presence after 45 seconds. Party Meter-user markers do not depend on WEB name publication.
- Party-card class, combat power, emblem key, and profile image are accepted only from a successful official PLAYNC AION2 public profile response. Server-stored character profiles, prior observations, packet class, and HUD class must never be display fallbacks.
- A failed official lookup remains unresolved. Runtime packet/HUD values may identify the lookup target and damage participant, but cannot populate party-card profile metadata.

## Authentication session

- PASS KEY login uses an absolute browser inactivity deadline of 30 minutes. The shared warning modal opens at the 25-minute mark and displays the final five minutes.
- Background tabs do not trust delayed interval ticks: focus, visibility, page-show, and cross-tab storage events recalculate the remaining time from `lastActivityAt`.
- Extending an idle session is accepted only before the absolute deadline and after `kinojo-auth-service.js` touches the existing Server-issued `kws_` session. The extension path does not re-submit the saved PASS KEY; privileged actions continue to be authorized by Server on every request.
- DB `50041` keeps PASS KEY rows when a main character leaves Google list and disables them instead of deleting them. An administrator can reactivate an inactive key from Member Management; this explicit override permits common PASS KEY features, Meter download, roster-inactive owned-character selection, and Core launch while the character remains excluded from list lookup and public roster display.

## Sanctuary schedule

- The public PC and mobile schedule pages share the same calendar/detail module and public topbar/notice shell.
- STAFF or higher users see a Server-authorized schedule manager inside the selected date detail panel. It reuses `adminSanctuaryScheduleConsole` and `adminSanctuaryScheduleSave` for add/edit operations, so Server remains the source of permission and team validation.

## Sanctuary waitlist matching

- Server Engine 315 builds each sanctuary waitlist from active `character_master` rows that meet the Server-owned entry-mode item-level rule and are not already linked to a slot in that sanctuary.
- The waitlist modal keeps three logical panes: character cards, eligible sanctuary image cards, and live force/party recommendations.
- A recommendation request recalculates current vacancies and class overlap on Server. Forces with at least one vacant party that does not duplicate the selected class appear first.
- Sanctuary backgrounds and boss portraits are separated under `assets/images/sanctuary/backgrounds/` and `assets/images/sanctuary/bosses/`; official reference sources and asset policy are recorded in `assets/images/sanctuary/SOURCES.md`.
- `tests/sanctuary-waitlist-contract.test.js` prevents item-level thresholds from moving into WEB, verifies the three-pane/scroll-safe modal contract, and checks all six WebP assets against the web size budget.

## Public page shell verification

- `tests/web-shell-auth-contract.test.js` audits the active PC/mobile entrypoints for shared topbar, notice, authentication modules, and current cache keys.
- `.github/workflows/verify-kinojo-pages.yml` validates the full deployed page set and performs exact live readback against `https://kinojo.info` after main deployment.

## Public navigation and notice reliability

- The shared drawer measures its longest visible menu label and clamps the panel width to the available viewport instead of reserving a fixed 330px.
- Drawer links keep their readable font size, grow with wrapped text, and scroll inside a KINOJO-styled scrollbar without clipping in mobile landscape or enlarged-text modes.
- The closed menu icon uses three vertical dots and transitions to three horizontal menu lines on hover or while the drawer is open.
- Public notices use bounded retries, an eight-second request timeout, a seven-day last-success cache, explicit retry UI, and recovery on visibility, focus, page-show, and online events.


## PASS KEY authentication Edge boundary

- `core/kinojo-auth-service.js` sends WEB PASS KEY authentication only to the dedicated `kinojo-member-auth` Edge Function. The browser auth service must not call `kinojo_member_verify_session_264` directly.
- Edge API `2.0` fixes the tool scope to `KINOJO_WEB` and uses Server Engine contract `320` to issue, validate, touch, and revoke a random opaque WEB session. The browser-generated `supabase:<id>:<time>` compatibility token is forbidden.
- Server stores only the SHA-256 hash of each `kws_` session token in `private.kinojo_web_sessions`; the raw session token and PASS KEY are not stored in the session table. Sessions use a 30-minute idle expiry and are revoked on logout, local timeout, account deactivation, or permission removal.
- Phase 1-B preserves `passKey`/`passCode` only inside the existing browser session/account objects because downstream legacy RPC and Edge contracts still require `p_pass_key`. Those compatibility fields are removed only after the affected operations move to the scoped WEB session in Phase 1-C.
- `core/kinojo-auth-ui.js` validates the Server session when restoring a page, touches it at a five-minute bounded cadence during activity, performs a Server touch for manual extension, and hands logout/timeout revocation to the auth service.
- `tests/web-shell-auth-contract.test.js` verifies the static and runtime session boundary and, in GitHub CI, checks the deployed Edge `2.0` health/CORS/header contract.
- All 16 active PC/mobile entrypoints pin `kinojo-auth-session.js`, `kinojo-auth-service.js`, and `kinojo-auth-ui.js` to `cache=2026081602`; the contract test rejects all prior authentication cache keys.

## Sheet bridge workload split

- Active WEB routes sanctuary roster editing to `sanctuary-roster-bridge`, sanctuary source/admin sync to `sanctuary-sheet-bridge`, and list comparison/Queue preparation to `lookup-list-prepare`.
- Server list export, Apps Script write, and row-level readback are isolated in `lookup-list-sync`.
- `lookup-sheet-bridge` version `51` is a compatibility router only. It contains no roster, Queue preparation, or list-write implementation and forwards legacy Extension/Worker actions to the dedicated boundaries.
- Current WEB must not invoke `lookup-sheet-bridge` directly. Older Extension builds and the current modular character worker may continue through the compatibility router until their next source-specific release, but the heavy work executes only in the dedicated function.
- `tests/web-shell-auth-contract.test.js` checks all four deployed boundaries, response headers, legacy router forwarding, and the `kinojo-supabase-features.js?cache=2026081603` cutover across 16 active PC/mobile entrypoints.
