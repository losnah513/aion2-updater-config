# aion2-updater-config

KINOJO INFO GitHub Pages upload package.

- `index.html`: GitHub Pages root entry redirect
- `config.json`: Chrome extension remote config compatibility file
- `kinojo-main/`: KINOJO INFO main, common UI/core/pages/docs
- `hall-of-fame/`: Hall of Fame page and assets
- `sanctuary/`: Canonical Server sanctuary team, force, schedule, and participation page
- `sanctuary-management/`: Shared Sanctuary implementation assets plus a compatibility redirect (`sanctuary-schedule/` is also a compatibility redirect)

`config.json` is intentionally kept at repository root because the extension currently reads `/config.json`.

## Sanctuary public read boundary

- Desktop `/sanctuary/` and mobile `/m/sanctuary/` show Sanctuary 1–4, published teams, force rosters, and the Wednesday-first monthly schedule without login.
- Guest responses include only `ACTIVE/FULL` teams. They omit viewer character candidates, support batches, assignment/pending state, member identifiers, and every edit/archive permission.
- Team creation, support, editing, archive, character lookup/registration, and all other mutations still require the opaque KINOJO session plus the existing Edge and database permission checks.
- `20260830051921_sanctuary_management_public_read_v448.sql` adds service-role-only read models; browsers continue to call the `sanctuary-management` Edge Function rather than database RPCs directly. The public-read addition keeps the current Edge API `1.8` / DB contract `446` for authenticated-write compatibility.

## Admin dashboard first-entry module boundary

- Admin loader cache `2026082901` starts the desktop and mobile dashboard with only `admin-shared.js` and `admin-bootstrap.js`. Member, character, notice, system/log, and banner modules load once when their feature tab is first entered.
- The initial dynamic admin JavaScript boundary fell from 677,096 bytes across 17 sequential modules to 42,350 bytes across two modules, a 93.7% reduction. The loader reuses in-flight promises, preserves the banner dependency order, and exposes a visible admin-log error if a feature module cannot load.
- Dashboard RPCs, notification refresh behavior, card rendering, database functions, and retention periods are unchanged in this step. `tests/admin-dashboard-lazy-loader-contract.test.js` and the full 77-test Node suite protect the split.

## Read-scope scalability known facts

- Meter public stats/my comparison default to the explicit Server `WEEK` period. `ALL` is an explicit user choice, not an omitted-period fallback. At 333 records/1,753 participants the aggregation gate is not reached; recheck at 100,000 participants, representative p95 300ms, or max 1s. Owner: Meter Server/DB.
- Admin member list uses DB428 server cursor pagination: default 20, hard max 100, server prefix/role filters, and four indexes. Recheck at 1,000 members, p95 300ms, or max 1s. Owner: Web Admin/DB.
- Sanctuary public read uses current-state roster tables, not historical-period data. DB442 (`20260828134721 / sanctuary_public_read_n_plus_one_v442`) removes repeated per-slot character/profile lookups while preserving guest/member payload digests. `rudra` improved from about 343ms/23,900 shared hits to 105–108ms/4,023 hits; `bagot` is about 95ms and `kaldrix` 81ms. Recheck at warm p95 300ms, max 1s, or 1,000 active slots. Owner: Sanctuary Web/DB.
- Admin notification v316 has status/latest/expiry indexes and no waiting relation lock in the 2026-08-28 profile. Fresh MASTER runs were 17ms first and 6.6ms warm, so no snapshot or retention change was added. Recheck at warm p95 300ms, reproducible waiting locks, or 100,000 related rows. Owner: Admin Notification/DB.
- No page period, retention, or explicit `ALL` behavior may be changed from these facts without user confirmation.
- Drive canonical sync at GitHub `bd8b2263d724915187b6ad45b4355648eac88b3c` updated the existing ranking-data, hall-data, and common feature file IDs to exact GitHub bytes. Supabase reported 27 ACTIVE Edge Functions; Drive now includes the GitHub/production-exact `sanctuary-management` v14 source and an ACTIVE inventory manifest. Three ACTIVE functions without GitHub canonical source remain explicitly inventory-only instead of receiving invented source files.
- DB427 cut over only the background ranking snapshot builder input from raw v390 aggregation to bounded v426 state after regular published snapshots 20 and 21 each passed all four exact-parity scopes with no errors. Public ranking/HOF/my-ranking contracts remained unchanged. Post-cutover verification reported `cutoverActive=true`, live parity 4/4, full Node contracts 76/76, and live HOME document overflow 0 at desktop 1920px and mobile 390px. Its then-unknown raw retention statement is superseded by DB443.
- DB443 (`20260828215808 / character_growth_raw_retention_v443`) keeps the latest 30 KST source dates, including the current day, in `character_history` and `growth_reviews`. Initial bounded cleanup deleted 8,441 history rows and 8,442 review rows; 9,171 and 9,125 rows remain with 2026-07-31 as the earliest source date and zero expired rows. Rollups, v426 current state, published snapshots, and public read payloads were hash-stable. Service-role-only cleanup runs Wednesday 05:40 KST in batches of at most 5,000 rows per table. Runtime events, payloads, sessions, audit data, and other tables are outside this policy. Rollback stops future cleanup but cannot restore deleted raw rows; production ranking input must remain on v426 rather than the raw v390 path.

## Legion Tree public rendering

- The desktop and mobile Legion Tree pages load the public `kinojo_web_get_legion_tree` Server contract and fail closed unless contract `web-legion-tree-v1` / database contract `453` contains all four required legions in order: 깡, 낮, 밤, 키나노동조합.
- Character add has no race/server selector. Each input accepts `이름` or `이름[서버약칭]`; a missing tag means the canonical Jikel server (2002), while a tag is resolved against the active v372 `server_master` name/short-name reference by both Browser preflight and the Server.
- Server `className` values render through the exact shared icon mapping: 수호성→templar, 검성→gladiator, 살성→assassin, 궁성→ranger, 마도성→sorcerer, 정령성→elementalist, 치유성→cleric, 호법성→chanter, 권성→fighter. Unknown or empty class values fail closed to the `?` class fallback instead of guessing an icon.
- Member cards render the exact Server `characterName` and `isMain` state without Browser-side ownership inference. The full name remains in DOM text, `title`, and `aria-label`; only names longer than five Unicode characters receive the right-edge fade, with no ellipsis.
- Server member-array order is preserved inside each explicitly ordered stage/role/group. The Browser does not alphabetize or move mains before alts.
- Branch count reduces columns without shrinking the fixed 124px cards: desktop uses 5 columns for one branch, 3 for two branches, and 2 for three or more; mobile centers on 2 columns for one or two branches and 1 for three or more.
- Browser code does not reconstruct missing tree structure or members. A Server-supplied `DEFAULT_FALLBACK` tree is marked `기본 단계`, while a role with no assigned members is rendered as `지정 전`; missing stages and inconsistent fallback state still fail closed.
- The subbar character-add action reuses the existing authenticated `kinojo-legion-tree` `character-add` Server chain. A main name alone requests `MAIN`; main plus alt requests `ALT`; alt-only input, malformed tags, and unknown server tags are rejected before any network call. The Browser sends the two raw name inputs plus the fixed Jikel fallback ID for cache-safe compatibility; suffix resolution remains a Server decision and the Browser never supplies resolved suffix server/race, mode, member identity, character facts, list columns, or Queue credentials.
- DB455 preserves the independently resolved main and target servers in the existing single-target Queue without requiring the existing main character to have a `list_row`. Before an alt Queue starts it requires the named active main character on the main server, and the relation finalizer links the alt to that main across servers. `복숭아` therefore resolves to Jikel while `화비[루미]` resolves to Lumiël without losing the main/alt relationship.
- Only an exact single-target `server:legion_tree_character_add_v455` session may take the listless terminal path. After official lookup, Master/relation, growth review, ranking, and any required ranking snapshot finish, DB455 requires zero `google_list_sheet_sync_queue` rows and completes with `SERVER_QUEUE_CHARACTER_MASTER_DONE`; it never calls `lookup-list-sync`, creates a Google list write Queue, or requires list readback. Every other Server Queue keeps the existing Google list contract.
- While the Server Worker runs, the UI prevents duplicate submission and maps the bound runtime session into four visible states: 공식 확인 → 정보 반영 → 트리 확인 → 완료. Inputs, actions, status, and progress occupy separate responsive subbar grid regions so long status text and the progress row do not overlap the tree. Completion is accepted only for the same session's terminal status, after which the page reloads `kinojo_web_get_legion_tree`.
- Reset clears both names, validation styling, status text, and add-progress presentation when no add operation is running. It never pretends to cancel a Server job.
- Character cards open the existing shared `KinojoCharacterReaction` modal by click, Enter, or Space. The page passes the exact Server character ID, character name, class, server ID/name, main owner, legion, and shared class icon; the modal then enriches that identity from Server data instead of the page guessing details.
- The organization editor is a PC/mobile shared modal with a page-local draft and a Server-owned save boundary. `kinojo-legion-tree` API 1.5 revalidates the KWS manager session and calls the unchanged organization DB453 contract, where revision CAS, stage/role/assignment/parent validation, configured save or fallback reset, and reread occur atomically. The Browser rerenders only the returned Server readback and never calls the service-role RPC directly.
- Occupied roles, roles referenced as parents, the last role in a stage, in-use stage removal, invalid parent direction, and `maxMembers` overflow or below-occupancy changes fail closed in the draft helper. Maximum capacity may be a positive integer or unlimited.
- The editor permits only the current Legion member set, keeps individual assignment, and adds an atomic multi-select batch assignment. Members below stage 1 must select a parent role from the immediate upper stage. Before a configured save, the Browser validates the complete stage, role, capacity, assignment, and parent graph and focuses the first invalid field without sending a request; the Server validator remains the final authority.
- `Escape`, backdrop/cancel, focus return, focus trapping, reduced motion, and zero horizontal overflow are part of the modal contract. `tests/legion-tree-data-render-contract.test.js` protects the complete nine-class mapping, exact/full character names, main/alt state, five-character fade boundary, Server member order, branch-responsive columns, fallback presentation, authenticated add wrapper, main/alt request shapes, alt-only network-zero guard, duplicate-click lock, four-stage listless progress, exact modal identity, click/Enter/Space, reset, completion-bound tree reload, DB455 service-role policy, cache lineage, and no-browser-reconstruction boundary. `tests/legion-tree-editor-contract.test.js` additionally protects the 카 editor details, atomic batch/capacity guards, current-member boundary, pre-save graph validation, the 타 DB453/Edge save-reset-readback contract, accessibility, responsive shell, and cache order.

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

- The shared modal lives in `ui/kinojo-character-reaction.*` and is used by Hall of Fame and ranking pages on PC and mobile.
- `ui/kinojo-character-skill-bridge.js` repairs the internal `.kinojo-character-reaction-scroll` viewport when a card click creates the modal lazily. The outer dialog stays locked while the internal viewport owns vertical scrolling.
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

## Admin character refresh current progress

- The queue-status read contract is DB `422` with terminal-state correction `423`. `updater_session_progress_current` owns one materialized current-progress row per runtime session and is updated transactionally from the existing session, target, step, event, job, batch, lock, and rate-limit writers.
- `kinojo_admin_server_queue_status_v289` selects only the authenticated actor's explicit session, active session, or latest session. It does not interpret an omitted date range as all operational history and does not rebuild missing reports while reading.
- Poll responses exclude target, event, step, and performance aggregates. Those sections use the credential-gated `kinojo_admin_server_queue_detail_v422` endpoint only after the user opens the related detail control, with bounded section limits.
- Foreground polling uses three seconds, hidden or inactive polling uses fifteen seconds, and terminal status stops polling without an extra request. Same-name targets on different servers remain separate by target ID or server identity. Desktop and mobile share admin loader `2026082801`.
- `tests/admin-queue-materialized-status-contract.test.js` and `tests/admin-queue-materialized-status-runtime.test.js` protect the one-row poll path, bounded lazy details, background backoff, and terminal stop behavior.

## Preventive scalability known facts

- Meter public statistics default to Server period `WEEK`; DAY/WEEK/MONTH have explicit KST start/end bounds. `ALL` is an explicit user-selectable cumulative period, not an omitted-period fallback. On 2026-08-28 the raw tables contained 333 combat records and 1,753 participants (about 3.1 MiB total), with zero publication-eligible rows. Reprofile weekly; aggregate only when participants reach 100,000, representative p95 reaches 300 ms, max reaches 1 s, or the 90-day growth projection reaches one of those gates. Owner: Meter Server/DB.
- Admin member list DB contract `428` uses Server prefix search, role filtering, indexed stable ordering, an opaque forward cursor, a 20-row WEB page, and a 100-row hard maximum. The legacy v264 name is a bounded compatibility wrapper. The 2026-08-28 baseline is 16 members / 128 KiB / 10.735 ms warm. Reprofile at 1,000 members, p95 300 ms, or max 1 s. Owner: Web Admin/DB.

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

## Sanctuary management Server boundary

- PC `/sanctuary/` and mobile `/m/sanctuary/` are the canonical Sanctuary entrypoints. Every signed-in member can inspect the Server domain and Stage 7 `OPEN` enables normal writes; team creator or privileged manager authorization remains the additional gate for edit, approval, schedule operations, and archive controls.
- The browser reads and writes the new domain only through the `KinojoSupabase` sanctuary-management feature methods. They invoke the `sanctuary-management` Edge Function with the current opaque KWS session; the browser does not call service-role DB RPCs, PLAYNC, the legacy Sheet bridge, or a page mock adapter directly.
- The active contract is Edge API `2.2` / DB `454`. Server `sanctuary_master` supplies management-visible names, release metadata, and item-level entry modes: sanctuary 1 `2700`, sanctuary 2 `3500`, sanctuary 3 normal `4300` / hard `4500`, while sanctuary 4 remains unresolved. Each Sanctuary 3 force persists its own difficulty and minimum item-level projection; the shared team schedule no longer overwrites every force. DB446 still owns the service-only Stage 7 backup and transition state machine.
- Fixed and participation team modes share the square composer and team-level schedule panel. A participation team is not created by the footer button: the first `+ 포스 추가` action atomically creates the DRAFT, schedule, force 1, two parties, and ten slots. Later additions use the existing revision/idempotency/lease boundary and stop at force 9; the Server row lock and DB force-number constraint independently reject force 10.
- Participation teams persist `INSTANT` as the default join policy or `APPROVAL` when selected. Publication requires at least one creator-owned character somewhere in the team composition; other forces and slots may remain empty. Support selection keeps a one-to-one force-to-character assignment inside a batch and supports partial success when another force conflicts or fills concurrently.
- An empty saved slot opens only the selected force's Server candidates in the right rail. The Server resolves the team's creator through `kinojo_member_character_list_v334`, returns canonical main/alt metadata, and returns no candidates after that creator already occupies the force. Existing unique force indexes remain the final one-character-per-owner/root-character authority.
- Character search accepts `이름` or `이름[서버]`, defaults a name-only query to `지켈`, requires an exact name/server match, and searches the character master before PLAYNC. Official results are held as short-lived service-only candidates and rate-gated before external lookup; the Edge Function is the sole PLAYNC caller.
- `깡`, `낮`, `밤`, and `키나노동조합` are DB-owned operational-legion references. Their official characters require a `MAIN` or `ALT` relationship; `ALT` requires a separately verified registered main character. External-legion and no-legion results can only become `GUEST`. The selected character is written to the exact originally selected slot and the Server bootstrap is reloaded after registration and assignment.
- DB452 stores Sanctuary 3 `NORMAL/HARD` difficulty, automatically rejects characters below the selected Sanctuary item-level minimum, and allows one composition rule to use either combat power or item level. Support selection includes one last random-alt option; the Server resolves it to an eligible active linked alt before reserving the support item. PLAYNC detail parsing persists both combat power and item level to `character_master`, so a materialized official result is used by later Sanctuary master-first searches.
- Desktop keeps the square composer beside the vertical schedule panel. Mobile places the schedule above the square composer. A nine-force rail uses vertical overflow with a hidden scrollbar and bottom fade, while horizontal overflow remains forbidden. The linked-alt chooser is viewport-bounded and routes vertical wheel input from anywhere in the open composer to its smooth hidden-scroll list, with a bottom fade while more results remain.
- Public team cards place the shared schedule above a highlighted `[고정]`/`[참여]` title band and omit internal team IDs, revisions, force totals, and the former team-level difficulty badge. Desktop pages show two full-size forces as `(1,2)`, `(3,4)`, and for an odd tail `(4,5)`; compact layouts show one force per touch-swipe page. The all-force modal remains the single view for every force and retains support, edit, and image-copy routes.
- Global read/write flags and `write_rollout_mode=OPEN` are active. Every Edge mutation still performs a DB446 write-access preflight and the final DB wrapper repeats credential-bound ownership, capability, revision, lease, capacity, conflict, and idempotency checks.
- Stage 7 stopped the sanctuary Sheet cron and retired the sanctuary-specific Sheet/roster bridges with HTTP 410 tombstones. The general lookup Sheet bridge is unchanged. The upgraded Server screen now owns `/sanctuary/`; the former `/sanctuary-management/` and `/sanctuary-schedule/` PC/mobile URLs preserve bookmarks through query-safe redirects, while their separate topbar and drawer buttons are retired.
- The raw `ADMIN` QA role remains MASTER-equivalent for permission checks but hidden from non-MASTER membership lists. No passkey or session credential is stored in migrations, comments, fixtures, logs, or browser-visible data.
- `tests/sanctuary-management-stage6-pilot-contract.test.js`, `tests/sanctuary-management-stage6-transition-contract.test.js`, and `tests/sanctuary-management-transition-approval-stability-contract.test.js` preserve the historical pilot and approval boundaries. `tests/sanctuary-management-stage7-complete-contract.test.js` verifies the DB446 backup/restore/cutover state machine, and `tests/sanctuary-management-stage9-contract.test.js` protects the DB452 eligibility, difficulty, random-alt, linked-alt, metric, and compact-card contract.
- The current redesign follow-up is closed at 87/87. [`docs/SANCTUARY_MANAGEMENT_STAGE10_CLOSEOUT_20260831.md`](docs/SANCTUARY_MANAGEMENT_STAGE10_CLOSEOUT_20260831.md) is the active UI/API operating boundary; [`docs/SANCTUARY_MANAGEMENT_STAGE7_CLOSEOUT_20260830.md`](docs/SANCTUARY_MANAGEMENT_STAGE7_CLOSEOUT_20260830.md) remains the authoritative transition backup and recovery boundary.

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
