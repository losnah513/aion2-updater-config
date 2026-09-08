const fs=require('node:fs'),assert=require('node:assert/strict');
const sql=fs.readFileSync('supabase/migrations/20260908130417_character_automation_cron_api_save.sql','utf8');
assert.match(sql,/perform cron\.alter_job\(j\.jobid, active := coalesce\(p_enabled, false\)\)/);
assert.doesNotMatch(sql,/update\s+cron\.job/i);
assert.match(sql,/coalesce\(v_actor\.level, 0\) < 5/);
assert.match(sql,/AUTOMATION_RUNNING/);
const ui=fs.readFileSync('admin/js/admin-characters.js','utf8');
assert.match(ui,/renderCharacterAutomation\(state\.characterAutomation\);\s*if\(saveError\)setStatus/);
console.log('PASS: supported cron API, existing authorization/running guard, persistent save error');
