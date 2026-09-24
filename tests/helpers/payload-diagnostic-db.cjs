const fs=require('node:fs');
module.exports=async function(db){
 await db.exec("set time zone 'UTC';create schema private;create role anon;create role authenticated;create role service_role;grant usage on schema private to anon,authenticated,service_role;");
 const schema=JSON.parse(fs.readFileSync('tests/fixtures/master-event-schema.json'));
 for(const t of new Set(schema.map(c=>c.table_name)))await db.exec('create table '+t+'('+schema.filter(c=>c.table_name===t).map(c=>'"'+c.name+'" '+c.type).join(',')+')');
 await db.exec('alter table extension_character_payloads add primary key(id);create index on lookup_session_targets(payload_id);create index on lookup_session_targets(session_id,lookup_order);create table character_stat_sources(payload_id bigint);create table updater_sessions(session_id text,status text);create table lookup_snapshots(id bigint,raw_payload jsonb,character_name text);create table member_codes(main_character_name text,updated_at timestamptz);create table lookup_session_steps(id bigint,session_id text,step_key text,step_order int,status text,progress_current int,progress_total int,message text,detail jsonb,started_at timestamptz,finished_at timestamptz,updated_at timestamptz)');
 await db.exec(fs.readFileSync('tests/fixtures/character-payload-helpers.sql','utf8'));
 await db.exec(fs.readFileSync('tests/fixtures/snapshot-retention-triggers.sql','utf8').split('CREATE OR REPLACE FUNCTION public.kinojo_character_skill_normalize_v415')[0]);
 await db.exec(fs.readFileSync('tests/fixtures/character-payload-triggers.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260923052947_character_payload_compaction.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260924034219_payload_gear_evidence_dedup.sql','utf8'));
 // The snapshot pipeline has its own complete suite. This stub tests allocation only.
 await db.exec("create function private.kinojo_snapshot_diagnostic_cleanup_v508(boolean,integer) returns jsonb language sql as $$select jsonb_build_object('ok',true,'compacted',0,'budget',$2)$$");
 // Synthetic report authorization only; not an operating authentication test.
 await db.exec("create function kinojo_validate_updater_session(text,text) returns jsonb language sql as $$select '{\"ok\":true}'::jsonb$$");
 await db.exec(fs.readFileSync('tests/fixtures/payload-session-report.sql','utf8'));
};
