declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type JsonRecord = Record<string, unknown>;
type AppsScriptResult = JsonRecord & { ok?: boolean; methodUsed?: string };

const SERVICE_NAME = 'scheduled-maintenance-control';
const API_VERSION = '1.1';
const MAX_REQUEST_BYTES = 65_536;
const encoder = new TextEncoder();
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'x-kinojo-automation-boundary': 'SERVER_AUTOMATION_V377',
};

function response(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function requiredEnv(name: string): string {
  const value = String(Deno.env.get(name) || '').trim();
  if (!value) throw new Error(`환경변수 ${name}이 비어 있습니다.`);
  return value;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function messageOf(value: unknown, fallback: string): string {
  if (value && typeof value === 'object') {
    const row = value as JsonRecord;
    return String(row.message || row.error || row.code || fallback).slice(0, 1000);
  }
  return String(value || fallback).slice(0, 1000);
}

async function rpc(name: string, body: JsonRecord, timeoutMs = 180000): Promise<JsonRecord> {
  const url = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const raw = await res.text();
    const parsed = parseJson(raw);
    if (!res.ok) {
      return { ok: false, code: 'SUPABASE_RPC_FAILED', httpStatus: res.status, message: messageOf(parsed, `RPC ${name} HTTP ${res.status}`) };
    }
    return parsed && typeof parsed === 'object' ? parsed as JsonRecord : { ok: false, code: 'SUPABASE_RPC_NON_JSON', message: `RPC ${name} JSON 응답이 아닙니다.` };
  } finally {
    clearTimeout(timer);
  }
}

async function callEdge(name: string, body: JsonRecord, timeoutMs = 180000): Promise<JsonRecord> {
  const url = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const raw = await res.text();
    const parsed = parseJson(raw);
    if (!res.ok) {
      return { ok: false, code: `EDGE_HTTP_${res.status}`, httpStatus: res.status, message: messageOf(parsed, `Edge ${name} HTTP ${res.status}`) };
    }
    return parsed && typeof parsed === 'object' ? parsed as JsonRecord : { ok: false, code: 'EDGE_NON_JSON', message: `Edge ${name} JSON 응답이 아닙니다.` };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAppsScript(methodUsed: string, res: Response, raw: string): AppsScriptResult {
  const parsed = parseJson(raw);
  if (res.ok && parsed && typeof parsed === 'object') return { ...(parsed as JsonRecord), methodUsed, httpStatus: res.status };
  const html = /^\s*<!doctype html/i.test(raw) || /^\s*<html/i.test(raw) || raw.includes('<title>');
  return {
    ok: false,
    code: html ? 'APPS_SCRIPT_HTML_RESPONSE' : 'APPS_SCRIPT_NON_JSON_RESPONSE',
    methodUsed,
    httpStatus: res.status,
    message: html ? `Apps Script가 HTML 오류 페이지를 반환했습니다. HTTP ${res.status}` : messageOf(parsed, `Apps Script HTTP ${res.status}`),
  };
}

async function fetchAppsScript(payload: JsonRecord, timeoutMs = 180000): Promise<AppsScriptResult> {
  const sheetUrl = requiredEnv('KINOJO_SHEET_SYNC_WEBAPP_URL');
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const getUrl = new URL(sheetUrl);
  for (const [key, value] of form.entries()) getUrl.searchParams.set(key, value);
  const attempts: Array<{ name: string; run: (signal: AbortSignal) => Promise<Response> }> = [
    {
      name: 'POST_JSON',
      run: signal => fetch(sheetUrl, {
        method: 'POST', redirect: 'follow', signal,
        headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload),
      }),
    },
    {
      name: 'POST_FORM',
      run: signal => fetch(sheetUrl, {
        method: 'POST', redirect: 'follow', signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' }, body: form.toString(),
      }),
    },
    { name: 'GET_QUERY', run: signal => fetch(getUrl.toString(), { method: 'GET', redirect: 'follow', signal }) },
  ];
  let last: AppsScriptResult = { ok: false, code: 'APPS_SCRIPT_CALL_FAILED', message: 'Apps Script 호출 실패' };
  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
      const res = await attempt.run(controller.signal);
      const normalized = normalizeAppsScript(attempt.name, res, await res.text());
      if (normalized.ok === true) return normalized;
      last = normalized;
      if (!['APPS_SCRIPT_HTML_RESPONSE', 'APPS_SCRIPT_NON_JSON_RESPONSE'].includes(String(normalized.code || ''))) break;
    } catch (error) {
      last = { ok: false, code: 'APPS_SCRIPT_FETCH_FAILED', methodUsed: attempt.name, message: String((error as Error)?.message || error) };
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}

async function finishCharacter(runId: string, sessionId: string | null, status: string, message: string): Promise<JsonRecord> {
  return await rpc('kinojo_automation_finish_v377', {
    p_job_type: 'character_refresh', p_run_id: runId, p_status: status, p_message: message, p_session_id: sessionId,
  }, 30000);
}

async function runCharacter(cronToken: string): Promise<JsonRecord> {
  const claim = await rpc('kinojo_automation_cron_claim_v377', { p_cron_token: cronToken, p_job_type: 'character_refresh' }, 30000);
  if (claim.ok !== true || claim.skipped === true) return claim;
  const runId = String(claim.runId || '');
  let sessionId: string | null = null;
  try {
    const started = await rpc('kinojo_automation_system_character_start_v377', { p_run_id: runId }, 30000);
    if (started.ok !== true) throw new Error(messageOf(started, '캐릭터 자동 세션 생성 실패'));
    sessionId = String(started.sessionId || '');
    const sessionToken = String(started.sessionToken || '');
    // One bounded relationship-only batch. Errors are retained by the DB as
    // unknown; they must not prevent the ordinary refresh from starting.
    let activityRecheck: JsonRecord;
    try {
      activityRecheck = await callEdge('character-refresh-worker', {
        action: 'activityRecheck', sessionId, sessionToken,
      }, 85000);
    } catch {
      activityRecheck = { ok: false, code: 'ACTIVITY_RECHECK_UNCONFIRMED' };
    }
    if (activityRecheck.ok !== true) console.warn('ACTIVITY_RECHECK_UNCONFIRMED');
    const prepared = await callEdge('lookup-list-prepare', {
      action: 'prepareList', sessionId, sessionToken,
      clientVersion: 'KINOJO_SERVER_377', payload: started.payload || {},
    });
    if (prepared.ok !== true) throw new Error(messageOf(prepared, '캐릭터 자동 Queue 준비 실패'));
    const accepted = await callEdge('character-refresh-worker', {
      action: 'startAutonomous', sessionId, sessionToken, clientVersion: 'KINOJO_SERVER_377',
    }, 30000);
    if (accepted.ok !== true || accepted.accepted !== true) throw new Error(messageOf(accepted, '캐릭터 자동 Worker 인계 실패'));
    return { ok: true, claimed: true, accepted: true, runId, sessionId, activityRecheck, message: '캐릭터 자동 최신화를 Server Worker에 인계했습니다.' };
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 1000);
    await finishCharacter(runId, sessionId, 'failed', message);
    return { ok: false, code: 'CHARACTER_AUTOMATION_START_FAILED', runId, sessionId, message };
  }
}

async function runSanctuary(cronToken: string): Promise<JsonRecord> {
  const claim = await rpc('kinojo_automation_cron_claim_v377', { p_cron_token: cronToken, p_job_type: 'sanctuary_sync' }, 30000);
  if (claim.ok !== true || claim.skipped === true) return claim;
  const runId = String(claim.runId || '');
  const results: JsonRecord[] = [];
  try {
    const prepared = await rpc('kinojo_automation_system_sanctuary_prepare_v377', { p_run_id: runId }, 30000);
    if (prepared.ok !== true) throw new Error(messageOf(prepared, '성역 자동 동기화 준비 실패'));
    const targets = Array.isArray(prepared.targets) ? prepared.targets as JsonRecord[] : [];
    for (const target of targets) {
      const jobId = Number(target.jobId || 0);
      const sheetName = String(target.sheetName || '').trim();
      if (!jobId || !sheetName) continue;
      try {
        const sheetRead = await fetchAppsScript({
          action: 'serverSanctuarySheetRead', sheetName,
          clientVersion: 'KINOJO_SERVER_377', source: 'supabase-edge:scheduled-maintenance-control',
        });
        if (sheetRead.ok !== true || String(sheetRead.bridgeRole || '') !== 'APPSCRIPT_MASTER') {
          throw new Error(messageOf(sheetRead, '성역 원본 시트 읽기 실패'));
        }
        const applied = await rpc('kinojo_automation_system_sanctuary_apply_v377', {
          p_run_id: runId, p_job_id: jobId, p_raw_sheet: sheetRead,
        });
        if (applied.ok !== true) throw new Error(messageOf(applied, '성역 Server 반영 실패'));
        results.push(applied);
      } catch (error) {
        const message = String((error as Error)?.message || error).slice(0, 1000);
        await rpc('kinojo_automation_system_sanctuary_fail_v377', { p_run_id: runId, p_job_id: jobId, p_message: message }, 30000);
        results.push({ ok: false, jobId, message });
      }
    }
    const failed = results.filter(item => item.ok !== true);
    const status = failed.length ? 'failed' : 'completed';
    const message = failed.length ? `성역 자동 동기화 ${failed.length}건 실패` : `성역 자동 동기화 ${results.length}건 완료`;
    await rpc('kinojo_automation_finish_v377', {
      p_job_type: 'sanctuary_sync', p_run_id: runId, p_status: status, p_message: message, p_session_id: null,
    }, 30000);
    return { ok: failed.length === 0, runId, status, message, results };
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 1000);
    await rpc('kinojo_automation_finish_v377', {
      p_job_type: 'sanctuary_sync', p_run_id: runId, p_status: 'failed', p_message: message, p_session_id: null,
    }, 30000);
    return { ok: false, code: 'SANCTUARY_AUTOMATION_FAILED', runId, message, results };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return response({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'POST만 허용됩니다.' }, 405);
  try {
    const raw = await req.text();
    if (encoder.encode(raw).byteLength > MAX_REQUEST_BYTES) return response({ ok: false, code: 'REQUEST_TOO_LARGE', message: '요청 크기가 허용 범위를 초과했습니다.' }, 413);
    let body: JsonRecord = {};
    try { body = raw ? JSON.parse(raw) as JsonRecord : {}; }
    catch { return response({ ok: false, code: 'JSON_REQUIRED', message: 'JSON 요청만 허용됩니다.' }, 415); }
    const action = String(body.action || '').trim();
    if (action === 'health') return response({ ok: true, service: SERVICE_NAME, apiVersion: API_VERSION, boundary: 'SERVER_AUTOMATION_V377' });

    if (action === 'adminStatus') {
      const credential = String(body.sessionToken || body.session_token || '').trim();
      if (!credential) return response({ ok: false, code: 'ADMIN_SESSION_REQUIRED', message: '관리자 로그인 세션이 필요합니다.' }, 401);
      const result = await rpc('kinojo_automation_admin_status_v377', { p_pass_key: credential }, 30000);
      return response(result, result.ok === true ? 200 : 403);
    }
    if (action === 'adminSave') {
      const credential = String(body.sessionToken || body.session_token || '').trim();
      if (!credential) return response({ ok: false, code: 'ADMIN_SESSION_REQUIRED', message: '관리자 로그인 세션이 필요합니다.' }, 401);
      const result = await rpc('kinojo_automation_admin_save_v377', {
        p_pass_key: credential,
        p_job_type: String(body.jobType || body.job_type || ''),
        p_enabled: body.enabled === true,
      }, 30000);
      const status = result.ok === true ? 200 : (String(result.code || '') === 'AUTOMATION_RUNNING' ? 409 : 403);
      return response(result, status);
    }
    if (action === 'cronCharacter') return response(await runCharacter(String(body.cronToken || '')), 202);
    if (action === 'cronSanctuary') return response(await runSanctuary(String(body.cronToken || '')), 200);
    return response({ ok: false, code: 'UNKNOWN_ACTION', message: `알 수 없는 action입니다: ${action}` }, 400);
  } catch (error) {
    return response({ ok: false, code: 'EDGE_FUNCTION_ERROR', message: String((error as Error)?.message || error).slice(0, 1000) }, 500);
  }
});

export {};
