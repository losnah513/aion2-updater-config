# KINOJO HOME loading/layout final evidence

## Local acceptance snapshot

- Collected: 2026-08-30 KST
- Source series: PR `#343`, `#344`, `#345`, `#347`
- Final production main: `36c18b25e1c0fbe230b6076690fe6ef3b7f2d92e`
- Machine-readable result: `final-local.json`
- Collector: `collect-final.cjs`

The local server cannot satisfy the production Supabase CORS allowlist, so its
Manifest failures are expected. Geometry, first-paint work, root navigation,
static asset bytes, and lazy UI creation remain valid local acceptance signals.
The same collector is run against `https://kinojo.info` after deployment for the
final Server/Manifest and network readback.

| Viewport | Cold CLS | Cold LCP | Warm LCP | Initial My Info guides | SIDE manifests |
|---|---:|---:|---:|---:|---:|
| 1920×1080 | 0.000236 | 708 ms | 192 ms | 0 | 2 |
| 1840×1080 | 0.000257 | 452 ms | 196 ms | 0 | 2 |
| 1839×1080 | 0.000258 | 488 ms | 172 ms | 0 | 0 |
| 390×844 | 0 | 564 ms | 156 ms | 0 | 0 |

The root request returns HTTP 200 at `/` and records exactly one Document
request. At 1920px the settled shell remains `69 / 52 / 121` for topbar height,
subbar height, and content start; SIDE slots remain `300×715`. The optimized
summer MAIN derivative is 307,496 bytes, down from 2,457,965 bytes for the PNG.

The lazy UI trace confirms this sequence:

1. Initial HOME: no My Info layer, panel, modal, or guide image exists.
2. First panel open: the layer and panel are created; modal and guides remain absent.
3. First image-manager open: the modal is created and its three lazy guide images appear.

## Production acceptance

- Machine-readable result: `final-production.json`
- KINOJO Pages source + exact custom-domain readback: [run 33295310685](https://github.com/losnah513/aion2-updater-config/actions/runs/33295310685)
- Banner source + byte readback + Manifest ETag + PC SIDE/MAIN + mobile MAIN: [run 33295310712](https://github.com/losnah513/aion2-updater-config/actions/runs/33295310712)
- GitHub Pages deployment: [run 33295310440](https://github.com/losnah513/aion2-updater-config/actions/runs/33295310440)

| Viewport | Cold CLS | Cold LCP | Warm LCP | Critical banner bytes | Initial guides | SIDE manifests |
|---|---:|---:|---:|---:|---:|---:|
| 1920×1080 | 0.000236 | 824 ms | 244 ms | 307,796 | 0 | 2 |
| 1840×1080 | 0.000257 | 576 ms | 172 ms | 307,796 | 0 | 2 |
| 1839×1080 | 0.000258 | 536 ms | 200 ms | 307,796 | 0 | 0 |
| 390×844 | 0 | 1,288 ms | 188 ms | 307,796 | 0 | 0 |

The acceptance gates are met: 1920 cold CLS is below 0.05, cold LCP is
below 2.5 seconds, warm LCP is below 1.5 seconds, and the critical first banner
is below 1.9 MB. The root URL returns one HTTP 200 Document without a second
navigation. The only cold CDP failure is the existing intentionally aborted
`HEAD home.html` connectivity probe after its response; it is not a document or
asset load failure.

The in-app production browser had no retained authenticated KWS session during
closeout. Therefore no real-account mutation was attempted. The collector uses
a valid-format isolated test token only to exercise client-side creation order:
initially no My Info panel/modal/guides, panel creation on first open, and three
lazy guide images only when the image manager is first constructed.

Rollback is Web-only: revert PR `#347` first if the visible optimized first
banner must be withdrawn, then PR `#345`/`#344` test gates if required, and PR
`#343` for the complete loading/layout change. No Supabase schema, Auth, data,
Storage object, Edge Function, or banner playlist rollback is required.
