# KINOJO HOME loading/layout Stage 0 baseline

## Scope and source of truth

- Stage: `0 · 기준선 고정과 변경 manifest`
- Collected: 2026-08-30 13:42 KST
- Production target: `https://kinojo.info/` and `https://kinojo.info/home.html`
- Git base: `origin/main` at `6e713e87455c3af7194b401342fb315bb942097f`
- Isolated branch: `codex/home-loading-layout-stability-20260830`
- Production database: Supabase project `josvoltpktvwysrasffq` (`kinojo-production`, `ACTIVE_HEALTHY`, `ap-northeast-2`)
- Banner function observed: `kinojo-banner-media` version 27, `ACTIVE`
- Full machine-readable evidence: `baseline.json`
- Collector: `collect-baseline.cjs`

This stage changes no product HTML, CSS, JavaScript, database object, Edge Function, or deployment state. It freezes the live failure mode before Stage 1 implementation.

## Reproduction

The collector launches the installed Chrome with Playwright, records CDP network bytes/cache/initiator data, observes CLS/LCP, and samples DOM geometry from 0 through 2500 ms. Each width is measured once with a fresh context (`cold`) and once in the same context (`warm`). The final capture waits 5500 ms after `DOMContentLoaded` so late banner responses and image bytes are included.

PowerShell:

```powershell
$env:NODE_PATH='C:\Users\LG\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\LG\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests/evidence/20260830-home-loading-stage0/collect-baseline.cjs
```

## Cold-load baseline

| Viewport | HTTP | CLS | LCP | Encoded bytes | Image bytes | Banner image bytes | Eager My Info guide bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1920×1080 | 200 | 0.212239 | 5100 ms | 4,944,241 | 4,767,214 | 3,005,613 | 604,487 |
| 1840×1080 | 200 | 0.231022 | 4660 ms | 4,938,590 | 4,767,033 | 3,005,586 | 604,489 |
| 1839×1080 | 200 | 0.012036 | 4712 ms | 4,938,774 | 4,767,200 | 3,005,746 | 604,488 |
| 390×844 | 200 | 0.070499 | 2512 ms | 4,938,710 | 4,767,218 | 3,005,615 | 604,535 |

Warm numbers remain in `baseline.json`, but are diagnostic rather than acceptance gates because banner rotation, revalidation, and the same-context image cache make them intentionally stateful. Cold runs are the Stage 0 comparison baseline.

## Frozen findings

1. This is not explained by the user's network alone. At 1920px the largest layout shift is 0.185875 at about 730 ms, sourced by both side-banner `ASIDE` elements. At 1840px it is 0.202389 at about 690 ms from the same elements.
2. Shell geometry is applied after parsing. In the 1920 cold run, `DOMContentLoaded` sees the subbar at `x=414, y=98, w=1092, h=1` and the wrap at `x=370, y=80, w=1180`; after `kinojo-page-shell-ready`, the subbar becomes `x=0, y=69, w=1920, h=52`, the wrap moves to `y=121`, and the side slots move to `x=56/1564, y=121, w=300, h=715`.
3. The 1840/1839 boundary is discontinuous. At 1840 the final side slots are visible and fixed (`300×715`) and the subbar is 52px high. At 1839 the slots are `display:none`, the subbar is 1px high, and the wrap starts at `y=70`.
4. Hidden side slots still trigger the HOME LEFT/RIGHT manifest and banner image work at 1839 and 390. Cold banner image transfer remains about 3.0 MB at every tested width.
5. The logged-in HOME load eagerly downloads three hidden My Info guide images, about 0.60 MB cold, before the user opens that UI.
6. The root URL performs two document requests: `/` returns 200 (`max-age=600`, 1,441 encoded bytes), then script navigation fetches `/home.html` as a second 200 document (`max-age=600`, 2,391 encoded bytes).
7. The only cold-run CDP failure is an intentionally aborted `HEAD home.html` connectivity check after an HTTP 200 response (`net::ERR_ABORTED`); it is not a failed page document request.

## Live HOME banner manifest snapshot

All three responses were HTTP 200 and used the public `banner-public-manifest-v1` contract.

| Slot | Manifest version / ETag suffix | Items | Rotation |
|---|---|---:|---:|
| MAIN | `bm402-17723458737244df09ac8b36` | 3 | 8000 ms / 600 ms transition |
| LEFT | `bm402-8da32ba745150e933ac98a23` | 20 | 4000 ms / 1000 ms transition |
| RIGHT | `bm402-ec25dfc93cfcfcd2cdefa415` | 20 | 4000 ms / 1000 ms transition |

The MAIN playlist has the same `kinojo_banner_summer.png` at positions 1 and 3, with `MEMBERS_02` between them. Full sanitized response bodies, URLs, ETags, request IDs, rotation values, and playlists are stored per run in `baseline.json`.

## Final live-browser geometry cross-check

An authenticated Chrome session at the deployed page reported no console warning/error and these settled values at 1920px (1905px client width because of the scrollbar): topbar `0,0,1905×69`; subbar `0,69,1905×52`; wrap `362.5,121,1180×1026.4375`; left/right slots `49/1557,121,300×715`; main banner `472.5,202,960×540.875`; sanctuary row `406.5,796.125,1092×243.125`.

The same session confirmed the breakpoint contract: 1840 shows both `300×715` side slots, 1839 hides them, and 390 hides them with a 347px wrap at the effective 375px client width.

## Change manifest frozen at the base commit

Only the files below are candidates for later stages. Stage 0 did not modify them.

| Candidate | Base blob | Bytes | Intended stage / risk |
|---|---|---:|---|
| `index.html` | `17e5771f131f976c0ebc98573e4bc1399f7f605d` | 2,650 | Stage 2 root route; redirect/cache risk |
| `home.html` | `f04c552ebf8f238a6795a497719f79f34a6709ed` | 7,007 | Stage 1–4 markup/critical geometry; high overlap |
| `ui/info-home.css` | `d692882fae509a2c39feb9721d675bc503a7fe23` | 16,177 | Stage 1 HOME geometry |
| `ui/kinojo-public-shell.css` | `82ed7088d641b230009f0e42b0c9aa875ab3650f` | 22,261 | Stage 1 shell reservation; cross-page risk |
| `ui/kinojo-staged-loading.css` | `d76283c668301c00a5c8163254b1c3f6164424ba` | 2,588 | Stage 1 staged visibility |
| `ui/kinojo-staged-loading.js` | `50ccdb7bf6279df637d897ca1481de46ca6b394f` | 2,329 | Stage 1 shell-ready timing |
| `ui/kinojo-pc-banners.css` | `090fa87da8755d93fe8906a5fe2b5c790a860d38` | 1,998 | Stage 1 breakpoint/slot geometry |
| `ui/kinojo-pc-banners.js` | `d8dd54dc219c99e9d7f8aa3682530031993103ab` | 6,238 | Stage 3 viewport-gated work |
| `ui/kinojo-banner-runtime.js` | `009fb9357d4ce5b5e5e68706a7555db691b88835` | 14,463 | Stage 3 manifest/image scheduling; shared contract risk |
| `ui/kinojo-common-ui.js` | `52a698a003d490d11485c53d2ebc58f3ceee5ad8` | 158,606 | Stage 1/4 shell and My Info deferral; very high overlap |
| `ui/kinojo-sanctuary-cards.css` | `2bca14ce2631d9ff6b203cf4d6a0afcf9ffc44ac` | 6,591 | Stage 1 lower-row reservation |
| `ui/kinojo-sanctuary-master.js` | `ec4cd2b87cfe0ae5f63de3c2f43aaeabdfd907db` | 12,417 | Stage 4 noncritical scheduling |
| `tests/banner-home-first-paint-contract.test.js` | `499b39b45af1d01a05ff6f674ef1d3a25db4fb01` | 2,134 | Stage 1 regression |
| `tests/home-layout-cache-guard.test.js` | `139e035b01f528714a6411fd21bbb3cae8e255b3` | 1,790 | Stage 1 cache token regression |
| `tests/pc-banner-slot-contract.test.js` | `e49830f757890224c74af84e01871a0b1644d16b` | 6,386 | Stage 1/3 breakpoint regression |
| `tests/staged-page-contract.test.js` | `9377ed6bd3797dc53d6d62e876a7f7457aec46a8` | 2,598 | Stage 1 staged-loading regression |
| `tests/banner-manifest-client-contract.test.js` | `85f4b8b45ebdfb32190578af478b7bfc174598c2` | 29,705 | Stage 3 runtime contract |
| `tests/banner-home-main-live-e2e.js` | `b23663f2e6bffb0006bcfb4b83f4cecd9bf5ce78` | 4,545 | Stage 3 live MAIN verification |
| `tests/banner-pc-side-live-e2e.js` | `c6b8cf430c2fac8956b65a99a69a4698d73ed543` | 7,318 | Stage 3 live side verification |
| `tests/web-shell-auth-contract.test.js` | `24942e39189e53795294506aa1c7e9cd5be8c2cd` | 14,577 | Stage 1 auth/shell regression |
| `.github/workflows/verify-banner-runtime.yml` | `e59395873eb04146f07ebba9057047a60818ff20` | 12,142 | Stage 5 CI gate |
| `.github/workflows/verify-kinojo-pages.yml` | `c9fc666b531a4edbff3265ab58aa9bbd9b08ebe6` | 31,412 | Stage 5 page gate |
| `docs/HANDOFF.md` | `d992f8581d3e519a2fd2da69f2be0557f700e4eb` | 120,389 | Stage 5 handoff update |
| `README.md` | `b64ed74878af3ce43df39ce3ce8750f1ee76f5c3` | 32,459 | Stage 5 command/index update if needed |

## Dirty-worktree boundary and overlap risk

The user's original checkout is on `codex/banner-stage7-navigation-random-ui-20260826` at `bc7d331257e80e4d4696fdb9e6e2b853617dea68` and contains extensive uncommitted work. Its modified paths overlap high-risk candidates including `home.html`, `ui/kinojo-common-ui.js`, `ui/kinojo-pc-banners.css`, both staged-loading files, banner/staged tests, and workflows.

Therefore all Stage 0 evidence was created in the clean isolated worktree `.codex-tmp/worktrees/home-loading-layout-stability-20260830` from fresh `origin/main`. No file in the user's original checkout was edited, staged, cleaned, or reverted.

## Stage 0 exit and rollback

- Reproduction and before metrics: complete.
- Exact candidate file blobs/sizes: frozen above.
- Overlap risk and isolation decision: complete.
- Product/operation changes: none.
- Rollback: delete only the Stage 0 evidence commit/worktree/branch if this investigation is abandoned. No site, database, Edge Function, or deployment rollback is required.
- Next authorized plan stage: Stage 1, reserving final shell and outer-layout geometry from the first paint. It is deliberately not started in this Stage 0 closeout.
