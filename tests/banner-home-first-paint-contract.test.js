const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const targets = [
  { name: 'PC HOME', file: 'home.html', host: 'kinojo-main-banner', pendingVisibility: 'hidden' },
  { name: 'Mobile HOME', file: 'm/index.html', host: 'mobile-og-banner', pendingVisibility: 'hidden' },
];

for (const target of targets) {
  const html = fs.readFileSync(path.join(root, target.file), 'utf8');
  assert.match(
    html,
    new RegExp(`<a class="${target.host} is-manifest-pending"[^>]*aria-busy="true"`),
    `${target.name} must mark the server-owned banner as pending before first paint`,
  );
  assert.match(
    html,
    new RegExp(`\\.${target.host}\\.is-manifest-pending>img\\s*\\{\\s*visibility:${target.pendingVisibility};?\\s*\\}`),
    `${target.name} must use its approved pending visibility while the Manifest is unresolved`,
  );
  assert.match(
    html,
    /<noscript><style>[^<]*is-manifest-pending>img\{visibility:visible\}[^<]*<\/style><\/noscript>/,
    `${target.name} must preserve the static fallback when JavaScript is disabled`,
  );
  assert.match(html, /const revealBanner = \(\) => \{[\s\S]*classList\.remove\('is-manifest-pending'\);[\s\S]*removeAttribute\('aria-busy'\);/, `${target.name} reveal state missing`);
  assert.match(html, /if \(!runtime\?\.mountBanner\) \{[\s\S]*revealBanner\(\);[\s\S]*return;/, `${target.name} must reveal the fallback if the runtime is unavailable`);
  assert.match(html, /const restoreFallback = \(\) => \{[\s\S]*revealBanner\(\);[\s\S]*\};/, `${target.name} inactive/error fallback must be revealed`);
  assert.match(html, /onActive: revealBanner/, `${target.name} must reveal only after the active Manifest image is installed`);
  assert.match(html, /onError: \(error\) => \{[\s\S]*revealBanner\(\);[\s\S]*console\.warn/, `${target.name} must reveal the fallback when the first active image cannot preload`);
  assert.match(html, /<meta property="og:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/, `${target.name} SEO fallback must remain static`);
  if (target.name === 'PC HOME') {
    assert.ok(html.includes('src="assets/images/common/kinojo-banner-placeholder.svg"'), 'unvalidated first paint must be season-neutral');
    assert.equal(html.includes('kinojo_banner_summer'), false, 'HOME must never hard-code a seasonal first image');
  }
}

console.log('KINOJO HOME server banner first-paint contract: PASS');
