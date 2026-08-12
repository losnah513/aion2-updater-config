const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

for (const entry of [
  'hof/index.html','m/hof/index.html',
  'ranking/index.html','m/ranking/index.html',
  'sanctuary/index.html','m/sanctuary/index.html',
  'sanctuary-schedule/index.html','m/sanctuary-schedule/index.html'
]) {
  const html = read(entry);
  assert.ok(html.includes('kinojo-page-booting'), `${entry}: page boot state missing`);
  assert.ok(html.includes('kinojo-staged-loading.css'), `${entry}: staged loading CSS missing`);
  assert.ok(html.includes('kinojo-staged-loading.js'), `${entry}: staged loading JS missing`);
}

const sanctuary = read('sanctuary/js/sanctuary.js');
assert.ok(sanctuary.includes("getAction('sanctuaryRosterData'"), 'Sanctuary roster must load independently');
assert.ok(sanctuary.includes("getAction('sanctuaryWaitlistData'"), 'Sanctuary waitlist must load independently');
assert.ok(sanctuary.includes('Promise.allSettled([rosterTask,waitlistTask])'), 'Sanctuary staged regions must settle independently');

const schedule = read('sanctuary-schedule/js/sanctuary-schedule.js');
assert.ok(schedule.includes('const data = await dayRequest'), 'Schedule day must render before admin context settles');
assert.ok(schedule.includes('adminRequest.then'), 'Schedule admin context must hydrate independently');

const scheduleCss = read('sanctuary-schedule/css/sanctuary-schedule.css');
assert.ok(scheduleCss.includes('.schedule-page-bar{position:sticky'), 'Schedule attached page bar is missing');
assert.ok(read('ui/kinojo-components.css').includes('.hof-filter-bar{position:sticky'), 'HOF attached filter bar is missing');
assert.ok(read('ranking/css/ranking.css').includes('top:var(--kinojo-topbar-actual-height'), 'Ranking attached toolbar is missing');

const hallData = read('hof/js/hall-data.js');
assert.ok(hallData.includes('kinojo_web_get_my_hof_ranking_v319'), 'Scope-aware personal ranking RPC missing');
assert.ok(hallData.includes('for(const wait of [0,450,1100])'), 'Personal ranking retry contract missing');

const hallRender = read('hof/js/hall-render.js');
assert.ok(hallRender.includes('집계 대기'), 'HOF pending aggregation state missing');
assert.ok(hallRender.includes('hallSlotTasks'), 'HOF independent slot loader missing');

console.log('KINOJO staged page, attached subbar, and personal ranking contract: PASS');
