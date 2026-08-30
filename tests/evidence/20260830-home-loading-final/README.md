# KINOJO HOME loading/layout final evidence

## Local acceptance snapshot

- Collected: 2026-08-30 KST
- Source branch: `codex/home-loading-layout-stability-20260830`
- Git base after rebase: `116914d232cdd415b5ef8ee34ee303e285570dbf`
- Machine-readable result: `final-local.json`
- Collector: `collect-final.cjs`

The local server cannot satisfy the production Supabase CORS allowlist, so its
Manifest failures are expected. Geometry, first-paint work, root navigation,
static asset bytes, and lazy UI creation remain valid local acceptance signals.
The same collector is run against `https://kinojo.info` after deployment for the
final Server/Manifest and network readback.

| Viewport | Cold CLS | Cold LCP | Warm LCP | Initial My Info guides | SIDE manifests |
|---|---:|---:|---:|---:|---:|
| 1920×1080 | 0.000236 | 664 ms | 360 ms | 0 | 2 |
| 1840×1080 | 0.000257 | 464 ms | 332 ms | 0 | 2 |
| 1839×1080 | 0.000258 | 444 ms | 340 ms | 0 | 0 |
| 390×844 | 0 | 372 ms | 144 ms | 0 | 0 |

The root request returns HTTP 200 at `/` and records exactly one Document
request. At 1920px the settled shell remains `69 / 52 / 121` for topbar height,
subbar height, and content start; SIDE slots remain `300×715`. The optimized
summer MAIN derivative is 307,496 bytes, down from 2,457,965 bytes for the PNG.

The lazy UI trace confirms this sequence:

1. Initial HOME: no My Info layer, panel, modal, or guide image exists.
2. First panel open: the layer and panel are created; modal and guides remain absent.
3. First image-manager open: the modal is created and its three lazy guide images appear.

## Production acceptance

Pending the product PR merge and GitHub Pages live readback. The deployment run
will write `final-production.json` and this section will be replaced with the
final production metrics, workflow links, and rollback boundary.
