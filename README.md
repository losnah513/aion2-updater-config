# KINOJO WEB

## Sanctuary permissions Stage14

CONFIRMED (2026-09-09): Stage14 connects private capabilities to v2 command/bootstrap/revision/lease contracts and the WEB/Edge adapters. STAFF needs an exact active assignment for assigned-scope scheduling; creator operations remain available. Master-only operator assignment never promotes accounts. Existing broad all/sanctuary_edit overrides and old assignments remain unchanged for explicit migration review. The coordinated five-migration release, sanctuary-management Edge v31 and WEB PR442 are deployed; detailed deployment evidence belongs to the Sanctuary project LOG.

The compact 920px permission matrix and on-demand operator panel use Server values and expected revisions; stale saves fail without overwrite and assignment changes are audited. Composite authorization compares actual DB state inside the same transaction, including pending support items, and rolls back the complete mutation on denial. The legacy boundary guards26 roster/registration delegates and revokes direct legacy command/bootstrap/lease access. Deploy the five migrations as a coordinated release, not individual fixes; restore matching Edge/WEB with the boundary rollback, preserving stored assignments/audits/settings.

Tests: PGlite `sanctuary-permission-{foundation,admin,command,legacy-save}.test.cjs`; Playwright `sanctuary-permissions-ui.test.cjs` and `sanctuary-permission-scopes-ui.test.cjs`, all wired into Pages CI. The legacy-save regression additionally exercises the real v446/v449-v454 SAVE_COMPOSITION chain with synthetic data and external helpers; it does not claim complete production-action or concurrent-session coverage. Normal CODEX_ADMIN production login verified the 11-row matrix, operator team list and editor open/close without saving operational data. Revalidate all scopes and read/cache/lease behavior when these contracts change.

## DB-only inactive lifecycle (replaces monthly deletion)

CONFIRMED: automatic exclusion does not delete a Master or LIST row. Migration `20260909143826_character_activity_inactive.sql` reuses the bounded relationship recheck and requires the next KST calendar month, fresh verified family evidence, no managed-legion/current-Sanctuary relation, and no unfinished lookup/LIST work before inactivity. Failed or incomplete checks hold. The inactive admin workspace reuses the three-column/six-row scroller. Reimport cannot reactivate an inactive Master. Official return or authenticated individual INCLUDE restores its prior presentation flags; manual exclusion remains authoritative. History and LIST remain unchanged. Existing Worker/maintenance and Apps Script are reused without deployment changes. Run the inactive lifecycle/concurrency and existing regression tests when policy, writers, or family/schedule semantics change. Recovery SQL freezes new transitions while preserving existing inactive records and restoration. Deployment evidence belongs to the project LOG.

## Historical monthly cleanup safety preflight (read-only, not an execution plan)

CONFIRMED (2026-09-09): deleting a current Master directly is unsafe. Live catalog has40 inbound FKs (15 CASCADE/11 SET NULL/10 RESTRICT/4 NO ACTION). Identity-change history CASCADE and audit SET NULL require independent historical references before cleanup. FK-free `character_history.character_master_id`, growth rollups, Master-event JSON, banner ID arrays, and weekly growth's current-Master join also require ownership/read-path review. Mere row survival does not prove history remains readable. Revalidate when schema/readers change.

`supabase/tests/character_monthly_cleanup_preflight.sql` remains a READ ONLY inventory and always reports `deletionAllowed=false`. It neither assigns dates nor restores/deletes anything. The user replaced deletion with DB inactivity; do not implement the superseded deletion/compensation/tombstone draft. Project Plan17C and the latest LOG are authoritative.

## Exclusion list layout contract

The exclusions workspace reuses Server policy: PC three columns, two below1100px, one below700px, and a bounded approximately six-row internal scroller. Native summary owns name/reason chips/keyboard toggle; no nested buttons. Expanded cards span the grid inside the same scroller. Unknown codes never imply legion departure. Other workspaces and editing remain unchanged. Recheck `node tests/character-refresh-ui-browser.test.cjs` on rendering/breakpoint/policy display changes. Deployment status belongs to the project LOG.

## HOME banner delivery stability · 2026-09-09

CONFIRMED: PC HOME previously painted a seasonal image before Server validation. Initial/empty/error states now use a neutral SVG; schedules/order remain Server-owned. The PC frame is fixed at 16:9, hover no longer translates it, and crossfade backgrounds use the image's content box. Mobile retains its compact crop. Expired manifests cannot install a late image.

CONFIRMED: plain event images skipped composite generation. Publishing now generates WebP for every selected formal-event asset, deduplicates IDs and fails before publish if generation/upload fails. MAIN600KB/SIDE150KB limits apply. SQL487 permits matching-sourceHash derivatives without content layers; missing/stale derivatives preserve legacy behavior. Original uploads, IDs, schedules, exposure order, auth and Edge API remain unchanged.

Existing MAIN UUIDs 785ddeaa-480d-4410-8bc7-55b0dd8a6813, ad45f799-0f19-4425-ad56-e5bc92380f04, 98fb449f-540f-4152-a164-042af9033bf9 have reviewed WEB delivery aliases at 469352/165136/257478B. scripts/build-banner-delivery.cjs preserves dimensions and uses WebP quality86. Future formal event publishing uses the Server-registered derivative. Recheck aliases if UUID originals can be overwritten.

Regression: banner-delivery-publish.test.js, banner-delivery-db.test.cjs, home-banner-stability-e2e.cjs --fixture and existing Banner Runtime suite. Public-read tests install visitor-traffic before navigation and are not admin authentication checks. Revalidate on validity, publishing/composite, CSS box model or cache changes.

## Legion Tree HOME navigation · 2026-09-09

CONFIRMED: common `pageInfo()` must classify `/legion-tree/` and `/m/legion-tree/` as `legion-tree` before the HOME fallback. Otherwise Topbar generates HOME as `./`; the navigation extension corrects only the active styling, leaving the self-link intact. HOME targets `/` on PC and `/m/` on mobile. Regression: `tests/legion-tree-data-render-contract.test.js`; tree HTML uses `navigation=2026090901` to invalidate the old common UI cache. Revalidate when route classification or Topbar link construction changes. No DB/Edge or organization data changes.

## Banner context initialization · 2026-09-09

CONFIRMED: lazy banner panel mounting must reconcile visibility with the selected MAIN/SIDE navigation, including cold SIDE entry. Asset broadcasts update lists but cannot mark an uninitialized library as loaded; its first read must initialize the Storage base URL. Regression: `tests/banner-library-management.test.js` and `tests/banner-admin-chrome-e2e.html`. Revalidate when lazy-loader order, panel routing or asset notification contracts change. Loader revision `context=2026090901`; no DB/Edge or existing asset/event mutations.

## Character refresh stability

LOCAL CONTRACT (2026-09-09, LOG48): scheduled-maintenance-control reuses its genuine automatic session for one relationship-only Worker batch before regular preparation (5 characters, 75 seconds, seven days per character). Service-only DB claims validate session ownership, identity, Master revision and live policy; return restores family eligibility, uncertain responses hold cleanup. No equipment/stat/LIST/deletion writes. Manual exclusions are not overridden. Revalidate on cron/session/official profile/policy contracts. Deployment status is recorded separately in LOG48.

LOCAL CONTRACT (2026-09-09, LOG47): target-row locking alone allowed exclusion while another connection restored a family witness. Activity reconciliation and authenticated queue preparation now use a short, fail-fast table fence for Master, official snapshots and Sanctuary relationship/schedule inputs, including phantom inserts. Self-conflicting locks prevent parallel evaluators upgrading together. Conflict rolls preparation back with ACTIVITY_RELATION_BUSY. Tests: character-activity-concurrency.test.cjs on native PostgreSQL17.10, loopback synthetic cluster only. Revalidate if policy inputs or preparation transaction ownership changes; this is not authorization for monthly deletion. Operational contention/canary remains a deployment gate.

LOCAL CONTRACT (2026-09-09, deployment status in LOG46): activity policy text is presentation-only. AUTO_NO_ACTIVITY and CURRENT_SANCTUARY_FAMILY use explicit Korean labels. Only known Server reason codes are shown; absent departure evidence is never inferred from an empty legion string. cleanupCandidateAt is a review-eligible date, not an execution promise. No reviewDueAt means no scheduled review, not overdue. Existing collapsed cards and writes are unchanged. Tests: character-refresh-ui-browser.test.cjs (1440/390/320), character-refresh-policy.test.cjs (prepare-to-dispatch relationship changes, sequential fixtures rather than concurrent PostgreSQL). Revalidate when Server policy fields or dispatch guards change. Loader revision activity=2026090901.

CONFIRMED (2026-09-09): records contains only unresolved, non-excluded lookups. Successful rename/transfer history and list-only backlog do not keep a character in records. Exclusions retain Server policy reasons and history. Cards collapse to name/detail summary; native details exposes existing controls. Identity probing appears only for unresolved, non-query-excluded records. Navigation never writes policy. Tests: character-status-tabs.test.cjs and character-refresh-ui-browser.test.cjs; statusTabs=2026090903. Revalidate on Server policy/response or routing changes. LOG42 tracks deployment.

CONFIRMED (2026-09-09): regular lookup includes canonical family members when any non-excluded, non-archived member belongs to 지켈(2002) 깡/키나노동조합/낮/밤. Individual/group manual policy and deletion-candidate priority remain unchanged; Sanctuary-only participation does not automatically include all alts. Verified unchanged identity probes do not prompt or call identityApply/list writes. Revalidate when family links, eligibility priority or identity response contracts change. Tests: `character-family-eligibility.test.cjs`, `character-identity-unchanged.test.cjs`; migration `20260909060134_character_family_lookup_eligibility.sql`. Existing list-restore evidence guards are unchanged.

Existing services share DB-owned eligibility, direct-key identity recovery, stable Master-ID writes and immutable per-session list export preferences. Scope follows the existing project plan; status, evidence and next actions belong only in the [project LOG](https://drive.google.com/file/d/1k0R6heq6ttLl9IKFm_q1_EGm4FCxmVbQ/view). See docs/CHARACTER_REFRESH_STABILITY_STAGE2_RELEASE.md and CHARACTER_REFRESH_STAGE2_MANIFEST.json for deployment/rollback contracts. No production execution is authorized by these documents.

## Sanctuary external family registration · 2026-09-08

CONFIRMED: DB480 separates external GUEST membership from canonical MAIN/ALT family identity. The composer offers guest registration or an existing/official main lookup, commits new main+alt together, and defaults List export to Y (N persists only Server data). List failures preserve registration and offer a separate retry. Retry revalidates all event Queue rows, including already-synced rows after a lost final response. Existing guest families are not inferred or bulk rewritten.

The selected authenticated bootstrap must enrich composerCharacters with latest PVE power/item level. Missing enrichment, not a Sanctuary4 threshold error, caused own-character cards to show dashes and reject 청소기 despite stored itemLevel6007/power878793. The server correction is applied. Revalidate when bootstrap or metric contracts change.

Sanctuary Edge v30 negotiates API2.5/DB480 for clientContract480 and retains API2.4/458 for cached callers. PR422/main71a37795, Pages and all six main checks passed. Node117, six responsive Y/N fixtures, PGlite lost-response/partial-success/ACL checks passed. Existing CODEX_ADMIN normal session verified official lookup, main lookup and Y/N selection without registration or team writes. Shared lookup-list-sync writer integration is owned by character-refresh PR421; full Stage13 closure awaits its deployment verification. See the Sanctuary project LOG for final state.

## Roster family node editor · 2026-09-08

Sanctuary hover follow-up: actual-character cards use Server `isMain/mainCharacterId` to enable the existing main/alt tooltip even when the independent membership classification is GUEST. The Server already returns the correct main name after roster saving. PC hover and mobile tap show 강태공2의 부캐 for 강태공1 while preserving the guest card style. Sanctuary JS cache parameter familyHover2026090801; no DB/Edge change.

DB478 follow-up: unowned Sanctuary characters retain `GUEST` when their canonical main/alt family changes. DB477 incorrectly changed this membership classification to ALT, violated the owner-null check and rolled back the entire save. The real 강태공2/강태공1 request now succeeds in BEGIN/ROLLBACK verification; production relationships remain unchanged until the administrator saves. Edge v12/API1.11 returns family-specific failures. This editor writes the Server DB; it does not write the Google list sheet. The SQL regression now includes a GUEST owner row.

CONFIRMED: the roster subbar opens a compact main/alt editor for server-authorized managers. Search loads complete existing families. Mouse/touch dragging places cards freely, wires follow movement and the main slot attracts nearby drops; replacing the main demotes the former main. Save persists a single canonical family, rejects stale/incomplete/duplicate/unavailable or conflicting member/force relationships, and safely replays uncertain requests. DB477 explicit overrides protect saved links from older worker snapshots. Deployment changes no existing character relationships. Images and legion membership are preserved. Whole-family edits are limited to 100 characters.

Edge `kinojo-legion-tree` v11/API1.10 reuses WEB_COMMON validation and service-only DB facades. Web cache2026090805; fixed 전체/레기온별 switch labels and roster search reset. Tests: `tests/roster-family-edge.test.js` (Node24), `tests/roster-family-editor-e2e.js` (local fixtures, PC/touch), and rollback-only `tests/roster-family-v477.sql`. Web/Edge rollback precedes the supplied DB477 rollback; saved relationships and audit rows are retained. Final deployment and Drive evidence: roster project LOG latest entry.

## Banner library management · 2026-09-08

CONFIRMED: the upload tab determines MAIN_16_9/SIDE_300_715; dimensions do not infer the category. Library detail offers explicit reclassification and permanent deletion of unused uploaded images. DB475 checks campaign items, random pool assets/composites and representatives. Original Storage bytes and metadata use the existing prepare/delete/finalize API. Static images are protected. Asset broadcasts do not mark uninitialized event workflows as loaded. Recheck when reference tables, deletion lifecycle or workflow initialization change. Tests: `node tests/banner-library-management.test.js`, read-only `tests/banner-library-management-v475.sql`. Edge v29/API2.8/DB475, admin cache2026090804; no operational images automatically changed.

## Legion Roster foundation

Stage 6 (2026-09-07): character registration inputs, candidate selection and queue progress now live in the roster subbar. The existing Legion Tree controller runs in roster mode and reuses the same permission checks and Edge contracts; it does not load tree data there. Completed registration invalidates roster caches/in-flight reads and reloads the current scope. The tree retains organization editing. No DB/Edge contract changes or production test registrations.

Arrow keys continue across panels: up/down selects roster members, left/right selects and reveals main/alt cards, including after a render removes the focused card. Text inputs and dialogs retain their own keys. Images can be stepped with Enter on their chevron buttons. Selected wheel and family cards have stronger borders. A blue/purple three-chevron signal appears only while more family cards remain offscreen (or another family page exists); its button advances the family selection and respects reduced motion.

The scope switch and registration controls fit inside the shared subbar, with two control rows on narrow screens; the “최신 PVE” caption is removed. Family information is compact. Image apertures preserve a 300:715 aspect ratio at responsive sizes; images fit the aperture width, stay vertically centered and crop overflow. Fullscreen download/close controls are centered beneath the image. The browser regression checks subbar bounds, aperture ratios, viewer controls, manager/non-manager behavior, duplicate-add errors and completion refresh.

PC `/legion-roster/` and mobile `/m/legion-roster/` use DB465 public reads for actual legion members, canonical main/alt families and current PVE values. Membership/search/relationships are decided by the server; list-row placement is not an eligibility condition. The list pages at 50 (server maximum 100), family pages at 20 (maximum 50), with source-bound cursors, 30-second shared memory cache, at most 32 cached responses, in-flight deduplication and stale-selection rejection. Scroll near the end loads the next page. Empty search reloads the list; errors remain retryable through search or card selection.

The upright wheel and mobile list/detail flip remain. Family cards emerge left-to-right from behind the previous card, main first; linked library images then rise above each card. DB467 exposes READY assets linked to the selected character's canonical public family, with 20/50 bounded pages. Image metadata loads near visible family cards; current and next files are prepared separately from entrance timing. Each character has independent image rotation. Empty cards stay blank, one image has no arrows, and multiple images use keyboard/touch chevrons with rotateY and reduced-motion support. Clicking opens a full-viewport dialog with focus restoration and original-byte download, including retryable failures. Official class/item-level/power icons are reused. Sound and supported coarse-pointer vibration have no separate controls. Character registration is now provided by the roster subbar.

CONFIRMED (2026-09-07, DB467): only assetId/url/dimensions/MIME/alt/revision are projected; original file names, account and audit metadata stay private. The public read wrapper intentionally uses SECURITY DEFINER with explicit EXECUTE, fixed search_path and selected-family eligibility checks. The expected advisor notices are [0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). SQL verification: `tests/legion-roster-images-v467.sql`. Browser tests cover 0/1/23 images, image paging, independent indices, full-viewport dialog, ESC/focus and original download byte parity/error recovery. Mobile browser emulation does not establish physical-device OS save behavior.

CONFIRMED (2026-09-07, DB465): public wrappers intentionally expose only eligible roster facts; private helpers and the administrator image library remain non-public. Fixed search_path and page limits are enforced. The Supabase advisor's public-definer execution notices are expected for these two deliberately public, read-only wrappers. SQL verification: `tests/legion-roster-read-v465.sql`. Browser regression uses deterministic RPC fixtures by default; set `ROSTER_LIVE_DATA=1` for real read-only API checks. Recheck if master eligibility or the public response schema changes.

CONFIRMED (2026-09-07, stage 3): selection intent must survive ResizeObserver callbacks caused by status text wrapping. Reduced motion and rapid keyboard input share that same intent. Evidence: `tests/legion-roster-interaction-e2e.js`; recheck when selection, responsive CSS or shared subbar layout changes. Sound/vibration API dispatch is browser-tested with controlled stubs; physical device sensation is not asserted by automation.

Known fact (2026-09-07): the shared route guard loads `ui/kinojo-common-navigation.js`; updating navigation requires its loader cache and the route-guard include caches in public entrypoints. The roster has its own `pageInfo` identity so common links resolve from the correct desktop/mobile root.

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

- The desktop and mobile Legion Tree pages load the public `kinojo_web_get_legion_tree` Server contract and fail closed unless contract `web-legion-tree-v1` / database contract `460` contains all four required legions in order: 깡, 낮, 밤, 키나노동조합.
- Internal read contract 461 materializes the member source once per rebuild and stores one exact-source-token snapshot in the private schema. A normal snapshot hit was 2.5–2.8ms in the production rollback benchmark, compared with about 83ms for the former payload assembly; one advisory-lock holder refreshes stale data while concurrent readers keep the last valid payload. The external database contract remains 460.
- Browser reads retry only transient timeout/network failures up to three attempts. Every validated success is cached locally for at most 24 hours, so a temporary Server saturation keeps the last known-good tree visible and schedules bounded background recovery instead of replacing the page with an empty error state.
- Character add has no race/server selector or immediate-write button. Each input accepts `이름` or `이름[서버약칭]`; an untagged read-only search returns every exact-name candidate on active servers in one official request, while a tagged search restricts candidates to the Server-resolved active server name/short name. The user must explicitly select one candidate for each supplied input before `추가` can start.
- Server `className` values render through the exact shared icon mapping: 수호성→templar, 검성→gladiator, 살성→assassin, 궁성→ranger, 마도성→sorcerer, 정령성→elementalist, 치유성→cleric, 호법성→chanter, 권성→fighter. Unknown or empty class values fail closed to the `?` class fallback instead of guessing an icon.
- Member cards render the exact Server `characterName` and `isMain` state without Browser-side ownership inference. The full name remains in DOM text, `title`, and `aria-label`; only names longer than five Unicode characters receive the right-edge fade, with no ellipsis.
- Server member-array order is preserved inside each explicitly ordered stage/role/group. The Browser does not alphabetize or move mains before alts.
- Every member list uses the same responsive 124px-card grid. `auto-fit` follows the actual branch width and a 652px cap guarantees at most five cards per row; narrow mobile viewers naturally reduce to two or one without Browser-side branch-count rules.
- Browser code does not reconstruct missing tree structure or members. A Server-supplied `DEFAULT_FALLBACK` tree is marked `기본 단계`, while a role with no assigned members is rendered as `지정 전`; missing stages and inconsistent fallback state still fail closed.
- The authenticated `kinojo-legion-tree` API 1.9 `character-search` action is manager-only, exact-name-only, active-server-only, rate-gated by the service-role DB457 gate, and explicitly creates no Target or Queue. DB458 adds a service-role-only, indexed batch readback against `character_master` so cards already present on the Server render with the red `추가된 캐릭터` marker. Search, close, and reset therefore perform no character data write. The Browser sends raw query text only and renders the Server candidate identity; it never resolves missing tags to Jikel.
- Explicit add converts the selected Server candidates to exact `이름[원본서버명]` inputs and reuses the existing `character-add` chain. API 1.9 revalidates the current KWS session and `canManage`, rejects an unselected/missing server tag, resolves both active servers again, and owns mode, member identity, official facts, list policy, and Queue credentials. Alt-only input, malformed tags, unknown tags, and same character/server remain fail-closed.
- DB455 preserves the independently resolved main and target servers in the existing single-target Queue without requiring the existing main character to have a `list_row`. Before an alt Queue starts it requires the named active main character on the main server, and the relation finalizer links the alt to that main across servers. Selecting `복숭아[지켈]` and `화비[루미엘]` therefore preserves the cross-server relationship.
- Only an exact single-target `server:legion_tree_character_add_v455` session may take the listless terminal path. After official lookup, Master/relation, growth review, ranking, and any required ranking snapshot finish, DB455 requires zero `google_list_sheet_sync_queue` rows and completes with `SERVER_QUEUE_CHARACTER_MASTER_DONE`; it never calls `lookup-list-sync`, creates a Google list write Queue, or requires list readback. Every other Server Queue keeps the existing Google list contract.
- The fade-in candidate panel appears beneath the query controls, presents separate main/alt card groups, and keeps `추가 / 닫기 / 초기화` in its right action rail (bottom rail on mobile). Close preserves query text; input changes invalidate stale results; reset clears both names, candidates, selections, validation, and progress. Search or add failures preserve retryable input/results/selection.
- While the Server Worker runs, the UI prevents duplicate submission and maps the bound runtime session into four visible states: 공식 확인 → 정보 반영 → 트리 확인 → 완료. Completion is accepted only for the same session's terminal status and a successful `kinojo_web_get_legion_tree` reread; only then are the full subbar, result panel, selection, and progress state reset.
- Character cards open the existing shared `KinojoCharacterReaction` modal by click, Enter, or Space. The page passes the exact Server character ID, character name, class, server ID/name, main owner, legion, and shared class icon; the modal then enriches that identity from Server data instead of the page guessing details.
- The public tree remains anonymously readable. Candidate search, character add, and organization edit controls fail closed for non-managers, and `kinojo-legion-tree` API 1.9 independently revalidates the KWS manager session on every search/add/save/reset boundary. Organization DB460 keeps the revision-CAS transaction and applies `immediate_upper_or_terminal_default_or_explicit_unaffiliated`: one immediate-upper role is automatic, terminal members without a selected parent become the terminal default, multiple immediate-upper roles still require an explicit parent, and `소속 외 (독립 부서)` remains a user-selected `parent_role_id = NULL` state.
- Occupied roles, roles referenced as parents, the last role in a stage, in-use stage removal, invalid parent direction, and `maxMembers` overflow or below-occupancy changes fail closed in the draft helper. Maximum capacity may be a positive integer or unlimited.
- The 560px desktop editor switches legions with `깡 / 낮 / 밤 / 키나노동조합` buttons. Each role uses a character-name input and `조회`; results come only from the already loaded member set of the selected legion and can be assigned or moved without a dropdown or network lookup. Members below stage 1 must select an immediate-upper role or explicitly choose `소속 외 (독립 부서)`. Before save, the Browser validates the complete stage, role, capacity, assignment, and affiliation graph and focuses the first invalid field without sending a request; the Server validator remains the final authority.
- The visible tree uses the configured role/stage names without synthetic `n단계` or `부서장` labels. Every rank, including the terminal `군단병` rank, renders as its own name plate followed by that rank's member grid. A single upper role remains one centered vertical chain; multiple same-stage roles branch horizontally with rails ending at the first and last branch centers. Default-unassigned and explicit `소속 외` terminal branches keep distinct affiliation plates.
- The page renders one legion at a time inside a fixed-height viewer. Wide left/right rails overlap the card edge without narrowing the organization canvas, show the previous/next legion name, cycle through the four Server-ordered legions, update ARIA labels/status, and reset the internal scroll position. Directional perspective page-turn motion accompanies pointer or keyboard navigation and is disabled for reduced-motion users. The viewer owns the vertical scroll with hidden scrollbars; a non-interactive white bottom gradient appears only while more content remains below, and the card keeps the same 10px safe gap from the fixed notice strip that it has below the subbar.
- `Escape`, backdrop/cancel, focus return, focus trapping, reduced motion, and zero horizontal overflow are part of the modal contract. `tests/legion-tree-data-render-contract.test.js` additionally protects suffixless all-server search, tagged search, DB457 service-role rate gate, read-only zero-Target/Queue declarations, selection-required exact-server add, non-manager network-zero guards, retry preservation, terminal reset, cache lineage, and the existing listless/tree/card contracts. `tests/legion-tree-editor-contract.test.js` protects the editor graph/save contract and shared cache order.

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

- Equipped titles use the read-only `kinojo_character_equipped_titles_v466` RPC over existing verified official snapshots. Attack/Defense/Etc render in that order with official category icons and light-mode grade colors. Only `equipStatList` appears as applied effects; owned `statList` is excluded and no totals are recalculated. Empty slots and unavailable data remain distinct, and request sequencing prevents stale titles after character changes.
- CONFIRMED 2026-09-09: official Seal1/Seal2 use accessory slots 25/26 (인장 1/2), between bracelets and pendant. Profile API305.3 and manual detail API305.5 preserve existing collection/auth boundaries. Newer stored equipment wins over older manual lists; detail reads match both slot and item ID. Title RPC identity is server/name, independent of profile charKey enrichment; results are cached for 120 seconds (50 entries), deduplicated in flight, and invalidated on manual reload. Evidence: official characters index.js, stored 더샷 equipment, character-seal-slots.test.js and character-titles-e2e.js. Recheck after official slot or snapshot contract changes.
- The PLAYNC information link sits beside the character name; the former live-time row is removed. Profile and name share a grid row at all viewport widths.

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
- Foreground lookup polling uses three seconds and hidden/inactive lookup polling uses fifteen seconds. Terminal lookup refreshes recent history once. Only a pending public Ranking/HOF snapshot keeps slower 30/60-second status reads alive; disabled/idle publication stops them. The existing authenticated status RPC adds read-only dispatch/pointer metadata without rebuilding progress or publishing. Recheck if dispatch or cached status contracts change.
- Terminal target results take precedence over the last current-character label. The DB ranking step is distinct from delayed public Ranking/HOF generation. Desktop and mobile share the same character module.
- CONFIRMED (2026-09-08): official precheck's normalized-name latest-payload reads need `idx_extension_payloads_identity_latest` (server, canonical normalized name, received_at/id descending). Existing plain character-name indexes cannot satisfy that expression. Recheck on identity normalization/schema or query-plan changes; predicate and parser semantics remain unchanged.
- DB-only list restoration accepts both the prepare source and its exact `server_queue:` worker-prefixed form. It still requires fresh matching identity and managed-legion evidence; stale Master row numbers are not append destinations.
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
- Sanctuary backgrounds and transparent boss portraits are grouped by stable numbered boss folders under `assets/images/sanctuary/sanctuary-N-boss/`; browser paths are resolved by `ui/kinojo-sanctuary-assets.js`, and source policy is recorded in `assets/images/sanctuary/SOURCES.md`.
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


## 방문 통계 검수 분리 · DB474 · 2026-09-08

- CONFIRMED: 로컬/CI 테스트는 tests/helpers/visitor-traffic.js로 방문 RPC를 차단한다. WEB의 로컬 호스트/navigator.webdriver/test marker는 기록하지 않는다.
- 서버 traffic_class(PUBLIC/LOCAL_TEST/AUTOMATED/INTERNAL_ADMIN)가 일반 일별·페이지별 집계와 방문 이력의 기준이다. 전용 CODEX_ADMIN만 is_automation_account=true이며 일반 관리자까지 제외하지 않는다.
- 관리자 방문 이력의 INTERNAL 선택으로 제외된 원시 기록을 조회한다. 기존 이벤트 ID·시각·payload·회원 연결은 유지한다.
- 실제 운영 검수는 CODEX_ADMIN 정상 로그인·서버 세션 확인 후 같은 브라우저를 재사용한다. 세션 만료 시 재로그인, 자격증명 부재 시 관리자 검수 중단. 비밀값은 저장소/문서에 기록하지 않는다.
- 검증: node tests/visitor-traffic.test.js; node tests/web-shell-auth-contract.test.js; supabase/tests/visitor_traffic_v474.sql은 BEGIN/ROLLBACK으로 실행. 롤백 파일은 visitor_traffic_v474_rollback.sql.
- 재검증 조건: 방문 RPC/집계/테스트 helper/전용 계정 정책 변경. 증거: tests/evidence/20260908-visitor-traffic.

- CONFIRMED 2026-09-09: official character info omits profile.charKey and supplies its exact decimal string in the HTTPS profileimg.plaync.com profileImage URL. Manual detail API305.6 normalizes that verified key into the existing SQL identity proof, preserving server/name/class/key and worker fences. Explicit invalid/numeric or conflicting keys remain rejected. Evidence: live 청소기 info and character-detail-identity-edge.test.cjs. Recheck if the official info identity schema changes.

# 명부 가족 편집 대상과 연결 해제 · 2026-09-09

CONFIRMED: DB487은 가족 read/revision/save에서 활성·비삭제·노출 비제외 캐릭터만 동일하게 다룬다. 옛 서버 중복 보관 행은 삭제하거나 관계를 바꾸지 않고 편집 노드에서 제외한다. 부캐 카드 안쪽 원형 − → 확인/취소는 해제 초안을 만들고, 연결 저장은 배치와 독립 본캐 분리를 한 트랜잭션으로 반영한다. 명시적 detachedCharacterIds 외 누락은 거부하고, 기존 전체 가족 revision·멱등·권한·회원/성역 충돌 검사를 유지한다. 해제한 캐릭터의 override와 성역 root도 자기 ID로 변경하며 회원 계정·소유권·레기온·이미지는 보존한다. 기존 GUEST 구분은 유지한다. Edge kinojo-legion-tree API1.12는 서비스 전용 save_v487을 호출하며 구 입력은 빈 해제로 호환한다. list 쓰기 추가 없음. 근거: tests/roster-family-unlink.test.cjs 및 PC/mobile editor E2E; 재검증 조건: 가족/활성 상태·회원 소유권·성역 root·원자 저장 계약 변경.
