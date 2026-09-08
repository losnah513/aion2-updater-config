const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('supabase/migrations/20260908111755_character_pvp_defense_title_v479.sql');
const rollback = read('supabase/rollbacks/20260908111755_character_pvp_defense_title_v479_rollback.sql');
(async () => {
  const db = new PGlite();
  await db.exec(`create schema extensions;
    create function public.kinojo_json_int(j jsonb, variadic keys text[]) returns integer language sql immutable as $$
      select (j->>k)::integer from unnest(keys) k where j->>k is not null limit 1 $$;
    create function public.kinojo_extract_aion_equipment_dom(t text) returns jsonb language plpgsql immutable as $$
      begin raise exception 'Test must supply explicit equipment evidence'; end $$;
    create function public.kinojo_aion_html_text(t text) returns text language sql immutable as $$
      select trim(regexp_replace(t, '<[^>]*>', ' ', 'g')) $$;`);
  await db.exec(read('tests/fixtures/pvp-title-before-v479.sql'));
  const equipment = {equipmentSectionFound:true,weaponArmorTabActive:true,visibleEquipmentSlotCount:10,populatedEquipmentSlotCount:10,abyssEquipmentSlotCount:7};
  const title = option => '<div class="title__item-stat">'+option+'</div>';
  const classify = async (html, overrides={}) => (await db.query(
    'select public.kinojo_extract_aion_pvp_dom($1,$2::jsonb) result',
    [html,JSON.stringify({...equipment,...overrides})])).rows[0].result;
  assert.equal((await classify(title('PVP 피해 내성 +5.5%'))).gearType,'PVE','baseline reproduces LAURA');
  await db.exec(migration);
  const cases = [
    ['amplification',title('PVP 피해 증폭 +5%'),{},'PVP'],
    ['defense',title('PVP 피해 내성 +5.5%'),{},'PVP'],
    ['both',title('PVP 피해 증폭 +5% PVP 피해 내성 +5%'),{},'PVP'],
    ['mixed',title('PVE 피해 증폭 +5.5% PVP 피해 내성 +5.5%'),{},'PVP'],
    ['threshold3',title('PVP 피해 내성 +5%'),{abyssEquipmentSlotCount:3},'PVP'],
    ['threshold2',title('PVP 피해 내성 +5%'),{abyssEquipmentSlotCount:2},'PVE'],
    ['pve',title('PVE 피해 증폭 +5%'),{},'PVE'],
    ['evasionOnly',title('PVP 회피 +110'),{},'PVE'],
    ['noTitle','',{},'PVE'],
    ['incomplete',title('PVP 피해 내성 +5%'),{populatedEquipmentSlotCount:4},'UNKNOWN'],
    ['inactive',title('PVP 피해 내성 +5%'),{weaponArmorTabActive:false},'UNKNOWN'],
    ['whitespace',title('pvp  피해  내성 +5%'),{},'PVP']
  ];
  for (const [name,html,override,expected] of cases)
    assert.equal((await classify(html,override)).gearType,expected,name);
  await db.exec(migration);
  assert.equal((await classify(title('PVP 피해 내성 +5%'))).gearType,'PVP','idempotent');
  await db.exec(rollback);
  assert.equal((await classify(title('PVP 피해 내성 +5%'))).gearType,'PVE','rollback');
  await db.exec(migration);
  assert.equal((await classify(title('PVP 피해 내성 +5%'))).gearType,'PVP','reapply');
  await db.close();
  console.log('PASS: baseline + 12 classification cases + idempotency/rollback/reapply');
})().catch(e=>{console.error(e);process.exitCode=1;});
