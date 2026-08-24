# aion2-updater-config

KINOJO INFO GitHub Pages upload package.

- `index.html`: GitHub Pages root entry redirect
- `config.json`: Chrome extension remote config compatibility file
- `kinojo-main/`: KINOJO INFO main, common UI/core/pages/docs
- `hall-of-fame/`: Hall of Fame page and assets
- `sanctuary/`: Sanctuary page

`config.json` is intentionally kept at repository root because the extension currently reads `/config.json`.

## Legion Tree public rendering

- The desktop and mobile Legion Tree pages load the public `kinojo_web_get_legion_tree` Server contract and fail closed unless contract `web-legion-tree-v1` / database contract `365` contains all four required legions in order: 깡, 낮, 밤, 키나노동조합.
- Race selection filters the v372 Server reference to the current 21 Elyos or 21 Asmodian servers and clears an incompatible selected server when the race changes.
- Server `className` values render through the exact shared icon mapping: 수호성→templar, 검성→gladiator, 살성→assassin, 궁성→ranger, 마도성→sorcerer, 정령성→elementalist, 치유성→cleric, 호법성→chanter, 권성→fighter. Unknown or empty class values fail closed to the `?` class fallback instead of guessing an icon.
- Member cards retain the existing main/alt treatment and long-name fade. The current layout allows up to five cards per row on desktop and two on mobile.
- Browser code does not reconstruct missing tree structure or members. A Server-supplied `DEFAULT_FALLBACK` tree is marked `기본 단계`, while a role with no assigned members is rendered as `지정 전`; missing stages and inconsistent fallback state still fail closed.
- `tests/legion-tree-data-render-contract.test.js` protects the complete nine-class shared-icon mapping and assets, unknown-class fallback, four-legion fallback marker, empty-role presentation, cache lineage, and no-browser-reconstruction boundary.

## Legion ranking unified panel

- Desktop PVE/PVP rankings share one outer card with a visual center divider. Each side owns an independent, hidden-scrollbar viewport and keeps the Server-returned order; reaching the viewport end appends the next Server page without moving the document scroll.
- Mobile reuses the same panels through PVE/PVP tabs and preserves each tab's scroll position. The fixed notice strip remains outside the panel safe area.
- Unfolded mobile/tablet widths from `700px` through `1220px` use a two-column/two-row toolbar grid: search and scope switches stay in the left column while the five-column class filter occupies the right column. This prevents the former one-line flex shrink and label/control overlap in both Fold orientations.
- Panel headers do not draw PVE/PVP-colored inset bars. The center divider and labeled chips remain the only fixed-area separators.
- The bottom affordance is a non-interactive gradient overlay. It fades only the peeking card edge, never applies CSS blur to card text, and disappears at the end of the list.
- Ranking cards omit visible class text because the shared class emblem already identifies the class. Legion and server render together as `<레기온> [서버]`, and combat power is stacked above item level in the compact metric column.
- `내 캐릭터 순위 보기` reuses the authenticated `kinojo-member-profile` character list and matches only exact `server_id + character_name` identities. The Browser does not infer ownership or calculate a rank.
- `tests/ranking-ui-contract.test.js` protects the unified panel, compact-card, exact-identity, independent-scroll, hidden-scrollbar, gradient, Fold toolbar, and no-header-accent contracts.

## My Info image editor contract

- The completed Stage 1-8 member-image system remains the active upload, ownership, privacy, retention, and cleanup baseline. The follow-up editor must reuse it instead of rebuilding those Server contracts.
- `ui/kinojo-my-info-image-contract.js` owns the follow-up output contract: profile `512x512` (1:1), front/back `800x1200` (2:3), and upper body `800x1000` (4:5).
- The editor output is WebP at quality `0.90`, with metadata removed. Only the edited result may be uploaded; the original screenshot stays in the browser.
- Source selection remains JPEG, PNG, or WebP up to 5 MiB. Profile output is a public profile override; FRONT/BACK/UPPER_BODY remain private references with the existing maximum seven-day retention.
- Before file selection, FRONT must request the full head, both hands, and feet; BACK must include hair, outfit back, and heels; UPPER_BODY must include the full head through the waist and both shoulders. A shared warning explains that overlapping chat/HUD/skill UI cannot be removed by the editor.
- B-3 connects only the validated edited WebP result to the existing Stage 1-8 signed-upload flow. Profile and private reference images support new registration and safe replacement; reference slots also expose Server-backed registration state and complete object/metadata deletion.
- A-2 reference guides under `assets/images/my-info/guides/` are transparent PNG overlays: FRONT/BACK are 800×1200 (2:3) and UPPER_BODY is 800×1000 (4:5). They contain only the face-free character outline, hair orientation cues, framing marks, and semi-transparent guide lines; the guide is display-only and never enters the edited WebP output.
- `guideAssetPath` in the shared image contract owns each reference slot's asset path. PROFILE intentionally has no pre-attachment reference asset in this three-guide set.
- B-1 adds `ui/kinojo-my-info-image-editor.js` as the shared pre-attachment guide-card and editor viewport foundation. It fixes the editing frame to each slot's contract ratio, overlays the A-2 transparent PNG guide, and supports drag, zoom, rotation, reset, keyboard-safe dismissal, focus containment, and object-URL cleanup.
- The editor reuses `ui/kinojo-range-control.js` for zoom and rotation. B-2 renders the selected transform into an exact-size canvas, encodes only the edited pixels as metadata-free WebP at quality `0.90`, and returns a browser-memory `Blob`/`File` result. The A-2 guide overlay is never included in the output.
- Output quality is estimated from effective source pixels per output pixel. Below `1.00` shows a caution and below `0.75` shows a low-resolution warning; neither warning blocks export. Desktop and mobile frames keep the slot ratio while presenting the warning and controls.
- The upload boundary accepts only `outputReady: true`, `uploadConnected: false`, metadata-free WebP editor results and never stores or transmits the selected original. Signed Storage upload uses `upsert: false` and a random object path.
- `kinojo-member-profile` API `2.7` / Edge v20 preserves the B-3 pixel boundary: it reads the uploaded Storage bytes, parses the actual WebP dimensions, and activates metadata only when PROFILE is `512x512`, FRONT/BACK are `800x1200`, or UPPER_BODY is `800x1000`. Invalid candidates are deleted before activation.
- C-1 adds `ui/kinojo-my-info-batch-bootstrap.js`. Opening My Info sends one `batch-bootstrap` Edge request, which performs one service-role-only v375 RPC and returns the owned character list plus every character's profile and private-reference registration metadata.
- Character switching reads the hydrated profile/reference cache without another request. The bootstrap response never exposes private reference object paths or signed URLs.
- C-2 adds `ui/kinojo-my-info-image-preloader.js`. The selected character and the next character in the hydrated order settle before the modal opens; one failed image does not block the gate.
- After the modal opens, only the remaining idle profile images load in the background with a fixed concurrency of two. A failed character remains isolated and exposes retry only for that character.
- The Browser accepts only normalized HTTP(S) profile URLs from the C-1 effective-profile state. Private FRONT/BACK/UPPER_BODY references remain metadata-only and never receive C-2 signed preview URLs.
- D-1 measures the longest hydrated character name once per character-list identity and sizes only the desktop right-side My Info panel from `352px` through `420px`. Reopening or rerendering the same list reuses the cached result.
- Mobile routes and viewports up to `760px` keep a full-width panel. The central image-management modal does not consume the character-name width variable.
- `tests/my-info-image-editor-harness.html` verifies the editor output, `tests/my-info-image-upload-harness.html` verifies profile registration, private reference replacement/deletion, original non-upload, `tests/my-info-batch-bootstrap.test.js` protects the one-request/one-RPC bootstrap boundary, and `tests/my-info-image-preloader.test.js` protects the C-2 gate, concurrency, failure isolation, and retry contract.
- `tests/my-info-panel-width.test.js` protects the D-1 desktop clamp, one-measure cache, mobile full-width override, and central-modal isolation contracts.

## KINOJO shared range control

- `ui/kinojo-range-control.js` owns the shared continuous, stepped, thin, and interval range behavior. `ui/kinojo-components.css` owns the track, active segment, thumb, focus, disabled, forced-colors, reduced-motion, and mobile hit-area visuals.
- Controls use a `[data-kinojo-range]` root and `[data-kinojo-range-input]` native range inputs. Stepped controls declare stops and accessible labels with `data-kinojo-range-stops` and `data-kinojo-range-labels`; interval controls use `from` and `to` handles.
- The controller exposes `enhance`, `enhanceAll`, `sync`, `setValue`, and `setValues`, and emits bubbling `kinojo-range-input` and `kinojo-range-change` events. Page code consumes those events and owns only feature state and layout.
- The Sanctuary quick-add search scope is the first migrated consumer. Its former track, thumb, snapping, button-state, and keyboard implementations were removed from page CSS/JS.

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
