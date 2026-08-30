const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const reaction = read('ui/kinojo-character-reaction.js');
const bridge = read('ui/kinojo-character-skill-bridge.js');
const common = read('ui/kinojo-common-ui.js');

const canonicalRpc = 'kinojo_character_skill_overview_v415';
const retiredRpcs = [
  'kinojo_character_skill_overview_v304',
  'kinojo_character_skill_overview_v305'
];

assert.equal(
  (reaction.match(new RegExp(canonicalRpc, 'g')) || []).length,
  1,
  'The common character modal must declare exactly one canonical skill RPC'
);
assert.ok(
  reaction.includes("await rpc.rpc(SKILL_RPC"),
  'The common character modal must own the single skill current-state request'
);
assert.ok(
  reaction.includes('p_server_id:Number(identity.serverId||0)') &&
    reaction.includes("p_character_name:String(identity.characterName||'')"),
  'The canonical request must preserve exact server/name identity arguments'
);
assert.ok(
  reaction.includes("skillSource:result.source") && reaction.includes("skillRefreshedAt:result.refreshedAt"),
  'The canonical response provenance must remain attached to the overview payload'
);
assert.ok(
  reaction.includes("skillLoadState:result.skills.length?'ready':'empty'"),
  'Ready and empty skill states must remain distinct'
);
assert.ok(reaction.includes("skillLoadState:'error'"), 'Skill error state is missing');
assert.ok(
  reaction.includes("identity !== liveIdentityKey(state.target)"),
  'Late responses must not overwrite a newly opened character'
);
assert.ok(
  reaction.includes('data-kinojo-skill-load-state=') && reaction.includes('data-kinojo-skill-api-version="415"'),
  'Rendered skill state/version markers are missing'
);

for (const rpc of retiredRpcs) {
  assert.equal(reaction.includes(rpc), false, `Reaction modal still calls retired ${rpc}`);
  assert.equal(bridge.includes(rpc), false, `Skill bridge still calls retired ${rpc}`);
}

assert.equal(
  /rpc\.rpc\(\s*(?:RPC|['"]kinojo_character_skill_overview_)/.test(bridge),
  false,
  'The bridge must not issue a second skill RPC after the overview renders'
);
assert.ok(
  bridge.includes('kinojo_web_character_profile_effective_v342'),
  'The bridge must retain effective-profile responsibility'
);
assert.ok(
  bridge.includes('ensureScrollViewport'),
  'The bridge must retain modal scroll responsibility'
);
assert.ok(
  bridge.includes("const activeRoot=document.getElementById('kinojoCharacterReactionModal');") &&
    bridge.includes('if(activeRoot) ensureScrollViewport(activeRoot);'),
  'The bridge observer must repair the scroll viewport when the modal is created lazily'
);
assert.ok(
  common.includes('/ui/kinojo-character-skill-bridge.js'),
  'My Info must keep loading the reduced profile/scroll bridge'
);

for (const page of [
  'hof/index.html', 'm/hof/index.html',
  'ranking/index.html', 'm/ranking/index.html'
]) {
  const html = read(page);
  assert.equal((html.match(/kinojo-character-reaction\.js\?cache=2026082701/g) || []).length, 1, `${page}: reaction cache contract mismatch`);
  assert.equal((html.match(/kinojo-character-skill-bridge\.js\?cache=2026083001/g) || []).length, 1, `${page}: reduced bridge cache contract mismatch`);
}

console.log('KINOJO character skill current-state single-call contract: PASS');
