'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = String(process.env.LIVE_BASE || 'https://kinojo.info').replace(/\/$/, '');
const CHROME = String(process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe').trim();
const OUTPUT = process.env.FINAL_OUTPUT
  ? path.resolve(process.env.FINAL_OUTPUT)
  : path.join(__dirname, 'final-local.json');
// Keep the 0-2500 ms geometry timeline, then leave enough time for the live
// manifest image requests to finish so byte totals are not sampled mid-flight.
const WAIT_MS = Number(process.env.BASELINE_WAIT_MS || 3500);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : null;
}

function summarizeNetwork(records) {
  const completed = records.filter(record => Number.isFinite(record.encodedDataLength));
  const byType = {};
  for (const record of completed) {
    const type = String(record.type || 'Other');
    byType[type] = (byType[type] || 0) + record.encodedDataLength;
  }
  const sum = list => list.reduce((total, record) => total + Number(record.encodedDataLength || 0), 0);
  const images = completed.filter(record => String(record.type).toLowerCase() === 'image');
  const bannerImages = images.filter(record => /kinojo_banner_summer|kinojo-og|kinojo-site-banners/.test(record.url));
  const myInfoGuides = images.filter(record => /\/assets\/images\/my-info\/guides\//.test(record.url));
  return {
    requestCount: records.length,
    completedCount: completed.length,
    encodedBytes: sum(completed),
    imageBytes: sum(images),
    bannerImageBytes: sum(bannerImages),
    myInfoGuideBytes: sum(myInfoGuides),
    byType,
    largest: completed.slice().sort((a, b) => b.encodedDataLength - a.encodedDataLength).slice(0, 20),
    bannerImages,
    myInfoGuides,
    failed: records.filter(record => record.failedText),
    manifestRequests: records.filter(record => /\/functions\/v1\/kinojo-banner-media/.test(record.url)),
  };
}

async function attachNetwork(page) {
  const session = await page.context().newCDPSession(page);
  const active = new Map();
  const completed = [];
  await session.send('Network.enable');
  session.on('Network.requestWillBeSent', event => {
    const previous = active.get(event.requestId);
    if (event.redirectResponse && previous) {
      completed.push(Object.assign(previous, {
        status: event.redirectResponse.status,
        mimeType: event.redirectResponse.mimeType || '',
        fromDiskCache: !!event.redirectResponse.fromDiskCache,
        fromServiceWorker: !!event.redirectResponse.fromServiceWorker,
        encodedDataLength: finite(event.redirectResponse.encodedDataLength) || 0,
        redirect: true,
      }));
    }
    active.set(event.requestId, {
      requestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      type: event.type || '',
      initiatorType: event.initiator?.type || '',
      documentURL: event.documentURL || '',
      status: null,
      mimeType: '',
      cacheControl: '',
      etag: '',
      contentLength: '',
      fromDiskCache: false,
      fromPrefetchCache: false,
      fromServiceWorker: false,
      encodedDataLength: null,
      failedText: '',
      redirect: false,
    });
  });
  session.on('Network.responseReceived', event => {
    const record = active.get(event.requestId);
    if (!record) return;
    const headers = event.response.headers || {};
    Object.assign(record, {
      status: event.response.status,
      mimeType: event.response.mimeType || '',
      cacheControl: String(headers['cache-control'] || headers['Cache-Control'] || ''),
      etag: String(headers.etag || headers.ETag || ''),
      contentLength: String(headers['content-length'] || headers['Content-Length'] || ''),
      fromDiskCache: !!event.response.fromDiskCache,
      fromPrefetchCache: !!event.response.fromPrefetchCache,
      fromServiceWorker: !!event.response.fromServiceWorker,
    });
  });
  session.on('Network.loadingFinished', event => {
    const record = active.get(event.requestId);
    if (!record) return;
    record.encodedDataLength = finite(event.encodedDataLength) || 0;
    completed.push(record);
    active.delete(event.requestId);
  });
  session.on('Network.loadingFailed', event => {
    const record = active.get(event.requestId);
    if (!record) return;
    record.encodedDataLength = 0;
    record.failedText = String(event.errorText || 'UNKNOWN');
    completed.push(record);
    active.delete(event.requestId);
  });
  return {
    reset() {
      active.clear();
      completed.length = 0;
    },
    snapshot() {
      return completed.concat([...active.values()]);
    },
    close() {
      return session.detach();
    },
  };
}

async function installTimeline(page) {
  await page.addInitScript(() => {
    const state = window.__kinojoStage0Baseline = {
      startedAt: Date.now(),
      samples: [],
      layoutShifts: [],
      largestContentfulPaint: [],
    };
    const rectangle = element => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        display: style.display,
        position: style.position,
        state: element.dataset.kinojoPcBannerState || '',
        target: element.dataset.kinojoPcBannerTarget || '',
      };
    };
    const sample = label => {
      const slots = [...document.querySelectorAll('[data-kinojo-pc-banner]')].map(rectangle);
      state.samples.push({
        label,
        now: performance.now(),
        readyState: document.readyState,
        bodyClass: document.body?.className || '',
        viewport: {
          innerWidth,
          innerHeight,
          clientWidth: document.documentElement?.clientWidth || 0,
          scrollWidth: document.documentElement?.scrollWidth || 0,
          scrollHeight: document.documentElement?.scrollHeight || 0,
        },
        topbar: rectangle(document.querySelector('.kinojo-topbar')),
        subbar: rectangle(document.querySelector('.kinojo-home-subbar')),
        wrap: rectangle(document.querySelector('main.wrap')),
        main: rectangle(document.querySelector('.kinojo-main-banner')),
        sanctuary: rectangle(document.querySelector('.sanctuary-row')),
        slots,
      });
    };
    for (const point of [0, 40, 80, 120, 200, 320, 480, 640, 800, 1000, 1500, 2000, 2500]) {
      setTimeout(() => sample(String(point)), point);
    }
    addEventListener('DOMContentLoaded', () => sample('domcontentloaded'), { once: true });
    addEventListener('load', () => sample('load'), { once: true });
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          state.layoutShifts.push({
            startTime: entry.startTime,
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            sources: (entry.sources || []).map(source => ({
              node: source.node ? `${source.node.tagName || ''}#${source.node.id || ''}.${String(source.node.className || '').replace(/\s+/g, '.')}` : '',
              previousRect: source.previousRect || null,
              currentRect: source.currentRect || null,
            })),
          });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (_error) {}
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          state.largestContentfulPaint.push({
            startTime: entry.startTime,
            renderTime: entry.renderTime,
            loadTime: entry.loadTime,
            size: entry.size,
            url: entry.url || '',
            element: entry.element ? `${entry.element.tagName || ''}#${entry.element.id || ''}.${String(entry.element.className || '').replace(/\s+/g, '.')}` : '',
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_error) {}
  });
}

async function collectRun(page, network, spec) {
  network.reset();
  const manifestResponses = [];
  const manifestBodyTasks = [];
  const pageErrors = [];
  const consoleErrors = [];
  const capturePageError = error => pageErrors.push(String(error?.stack || error));
  const captureConsoleError = message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  const captureManifest = response => {
    if (!/\/functions\/v1\/kinojo-banner-media/.test(response.url())) return;
    const task = (async () => {
      const headers = await response.allHeaders();
      let body = null;
      try {
        body = await response.json();
      } catch (_error) {}
      manifestResponses.push({
        url: response.url(),
        status: response.status(),
        cacheControl: String(headers['cache-control'] || ''),
        etag: String(headers.etag || ''),
        requestId: String(headers['x-kinojo-request-id'] || ''),
        body,
      });
    })();
    manifestBodyTasks.push(task);
  };
  page.on('response', captureManifest);
  page.on('pageerror', capturePageError);
  page.on('console', captureConsoleError);
  const url = `${BASE}/home.html?codex_stage0=${encodeURIComponent(spec.name)}-${Date.now()}`;
  const started = Date.now();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(WAIT_MS);
  page.off('response', captureManifest);
  page.off('pageerror', capturePageError);
  page.off('console', captureConsoleError);
  await Promise.allSettled(manifestBodyTasks);
  const browserState = await page.evaluate(() => {
    const state = window.__kinojoStage0Baseline || { samples: [], layoutShifts: [], largestContentfulPaint: [] };
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource').map(entry => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
    const criticalResources = resources.filter(entry => Number(entry.startTime) <= 2500);
    const criticalImages = criticalResources.filter(entry => entry.initiatorType === 'img' || /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(entry.name));
    const criticalSum = list => list.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0);
    const mainImage = document.querySelector('#kinojo-main-banner-image');
    return {
      href: location.href,
      title: document.title,
      bodyClass: document.body.className,
      timeline: state.samples,
      layoutShifts: state.layoutShifts,
      cls: state.layoutShifts.filter(entry => !entry.hadRecentInput).reduce((sum, entry) => sum + Number(entry.value || 0), 0),
      largestContentfulPaint: state.largestContentfulPaint,
      lcp: state.largestContentfulPaint.length ? state.largestContentfulPaint[state.largestContentfulPaint.length - 1].startTime : null,
      navigation: navigation ? {
        name: navigation.name,
        responseStart: navigation.responseStart,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
        duration: navigation.duration,
        transferSize: navigation.transferSize,
        encodedBodySize: navigation.encodedBodySize,
      } : null,
      resources,
      critical2500: {
        requestCount: criticalResources.length,
        transferBytes: criticalSum(criticalResources),
        imageBytes: criticalSum(criticalImages),
        bannerImageBytes: criticalSum(criticalImages.filter(entry => /kinojo_banner_summer|kinojo-og|kinojo-site-banners/.test(entry.name))),
        myInfoGuideBytes: criticalSum(criticalImages.filter(entry => /\/assets\/images\/my-info\/guides\//.test(entry.name))),
        sideManifestCount: criticalResources.filter(entry => /kinojo-banner-media.*slotCode=(?:LEFT|RIGHT)/.test(entry.name)).length,
      },
      mainImage: {
        src: mainImage?.currentSrc || mainImage?.src || '',
        complete: !!mainImage?.complete,
        naturalWidth: Number(mainImage?.naturalWidth || 0),
        naturalHeight: Number(mainImage?.naturalHeight || 0),
        pending: !!mainImage?.closest('.kinojo-main-banner')?.classList.contains('is-manifest-pending'),
      },
      initialDeferredUi: {
        myInfoLayerPresent: !!document.querySelector('#kinojoMyInfoLayer'),
        myInfoModalPresent: !!document.querySelector('#kinojoMyInfoModal'),
        myInfoGuideCount: document.querySelectorAll('#kinojoMyInfoModal img').length,
      },
      runtimeGlobals: {
        commonUi: typeof window.KinojoCommonUI,
        auth: typeof window.KinojoAuth,
        banner: typeof window.KinojoBannerRuntime,
      },
      images: [...document.images].map(image => ({
        src: image.currentSrc || image.src || '',
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      })),
      scripts: document.scripts.length,
      consoleMarker: 'browser-state-captured',
    };
  });
  browserState.manifestResponses = manifestResponses;
  const networkRecords = network.snapshot().map(record => Object.assign({}, record));
  return {
    name: spec.name,
    mode: spec.mode,
    viewport: spec.viewport,
    httpStatus: response?.status() || null,
    elapsedMs: Date.now() - started,
    browser: browserState,
    network: summarizeNetwork(networkRecords),
    runtimeErrors: { pageErrors, consoleErrors },
  };
}

async function collectRootRoute(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const network = await attachNetwork(page);
  const target = `${BASE}/?codex_stage0=root-${Date.now()}`;
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);
  const records = network.snapshot();
  const result = {
    requestedUrl: target,
    firstStatus: response?.status() || null,
    finalUrl: page.url(),
    documentRequests: records.filter(record => record.type === 'Document'),
  };
  await network.close();
  await context.close();
  return result;
}

async function collectLazyUi(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/home.html?codex_final=lazy-ui-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);
  const snapshot = () => page.evaluate(() => ({
    commonUiReady: typeof window.KinojoCommonUI === 'object',
    authReady: typeof window.KinojoAuth === 'object',
    layerPresent: !!document.querySelector('#kinojoMyInfoLayer'),
    panelPresent: !!document.querySelector('#kinojoMyInfoPanel'),
    panelOpen: !!document.querySelector('#kinojoMyInfoLayer')?.classList.contains('open'),
    modalPresent: !!document.querySelector('#kinojoMyInfoModal'),
    modalOpen: !!document.querySelector('#kinojoMyInfoModal')?.classList.contains('open'),
    guideCount: document.querySelectorAll('#kinojoMyInfoModal img[loading="lazy"][decoding="async"]').length,
  }));
  const initial = await snapshot();
  await page.evaluate(() => {
    window.KinojoAuth.getSession = () => ({ token: `kws_${'a'.repeat(40)}` });
    window.KinojoCommonUI.openMyInfoPanel();
  });
  await page.waitForTimeout(150);
  const afterPanelOpen = await snapshot();
  await page.evaluate(() => { void window.KinojoCommonUI.openMyInfoModal(); });
  await page.waitForTimeout(300);
  const afterModalOpen = await snapshot();
  await context.close();
  return { initial, afterPanelOpen, afterModalOpen };
}

(async () => {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome executable not found: ${CHROME}`);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const output = {
    schema: 'kinojo-home-loading-final-v1',
    generatedAt: new Date().toISOString(),
    base: BASE,
    chrome: CHROME,
    waitMs: WAIT_MS,
    runs: [],
    rootRoute: null,
    lazyUi: null,
  };
  try {
    for (const width of [1920, 1840, 1839, 390]) {
      const height = width === 390 ? 844 : 1080;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const network = await attachNetwork(page);
      await installTimeline(page);
      output.runs.push(await collectRun(page, network, {
        name: `${width}-cold`, mode: 'cold', viewport: { width, height },
      }));
      output.runs.push(await collectRun(page, network, {
        name: `${width}-warm`, mode: 'warm', viewport: { width, height },
      }));
      await network.close();
      await context.close();
    }
    output.rootRoute = await collectRootRoute(browser);
    output.lazyUi = await collectLazyUi(browser);
  } finally {
    await browser.close();
  }
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: OUTPUT,
    generatedAt: output.generatedAt,
    runs: output.runs.map(run => ({
      name: run.name,
      httpStatus: run.httpStatus,
      cls: run.browser.cls,
      lcp: run.browser.lcp,
      requests: run.network.requestCount,
      encodedBytes: run.network.encodedBytes,
      imageBytes: run.network.imageBytes,
      bannerImageBytes: run.network.bannerImageBytes,
      myInfoGuideBytes: run.network.myInfoGuideBytes,
      critical2500: run.browser.critical2500,
      failed: run.network.failed.length,
    })),
    rootRoute: output.rootRoute,
    lazyUi: output.lazyUi,
  }, null, 2));
})().catch(error => {
  console.error(error?.stack || error);
  process.exit(1);
});
