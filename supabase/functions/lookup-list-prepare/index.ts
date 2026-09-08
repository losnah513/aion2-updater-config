declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type JsonRecord = Record<string, unknown>;
type AppsScriptCallResult = JsonRecord & {
  ok?: boolean;
  httpStatus?: number;
  methodUsed?: string;
  contentType?: string;
  rawTextPreview?: string;
};

const MAX_REQUEST_BYTES = 65_536;
const encoder = new TextEncoder();
const SERVICE_NAME = 'lookup-list-prepare';
const API_VERSION = '1.1';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-kinojo-sheet-boundary, x-kinojo-sheet-api',
  'x-kinojo-sheet-boundary': 'LOOKUP_LIST_PREPARE_V1',
  'x-kinojo-sheet-api': API_VERSION,
};
function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function requiredEnv(name: string): string {
  const value = (Deno.env.get(name) || '').trim();
  if (!value) throw new Error(`환경변수 ${name}이 비어 있습니다.`);
  return value;
}

function isLikelyHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text) || text.includes('<title>');
}

function parseResponseText(text: string): { data: unknown; isJson: boolean; preview: string } {
  const preview = String(text || '').replace(/\s+/g, ' ').slice(0, 500);
  if (!text) return { data: null, isJson: false, preview };
  try { return { data: JSON.parse(text), isJson: true, preview }; }
  catch (_e) { return { data: text, isJson: false, preview }; }
}

function normalizeAppsScriptResult(
  methodUsed: string,
  res: Response,
  text: string,
): AppsScriptCallResult {
  const { data, isJson, preview } = parseResponseText(text);
  const contentType = res.headers.get('content-type') || '';

  if (res.ok && isJson && data && typeof data === 'object') {
    return Object.assign({}, data as JsonRecord, {
      httpStatus: res.status,
      methodUsed,
      contentType,
    });
  }

  const html = isLikelyHtml(text);
  return {
    ok: false,
    code: html ? 'APPS_SCRIPT_HTML_RESPONSE' : (isJson ? 'APPS_SCRIPT_ERROR' : 'APPS_SCRIPT_NON_JSON_RESPONSE'),
    httpStatus: res.status,
    methodUsed,
    contentType,
    message: html
      ? `Apps Script가 HTML 오류 페이지를 반환했습니다. 배포 URL/권한/요청 방식을 확인하세요. HTTP ${res.status}`
      : (isJson && data && typeof data === 'object'
          ? String((data as JsonRecord).message || (data as JsonRecord).error || `Apps Script HTTP ${res.status}`)
          : `Apps Script JSON 응답이 아닙니다. HTTP ${res.status}`),
    raw: isJson ? data : undefined,
    rawTextPreview: preview,
  };
}

async function fetchAppsScriptJson(
  sheetUrl: string,
  payload: JsonRecord,
  options: { timeoutMs?: number; allowGetFallback?: boolean } = {},
): Promise<AppsScriptCallResult> {
  const timeoutMs = Number(options.timeoutMs || 45000);
  const allowGetFallback = options.allowGetFallback === true;
  const action = String(payload.action || '').trim();

  const attempts: Array<{ methodUsed: string; request: (signal: AbortSignal) => Promise<Response> }> = [];

  const pushGetAttempt = () => {
    if (!allowGetFallback || !action) return;
    const getUrl = new URL(sheetUrl);
    for (const [key, value] of Object.entries(payload || {})) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') getUrl.searchParams.set(key, JSON.stringify(value));
      else getUrl.searchParams.set(key, String(value));
    }
    attempts.push({
      methodUsed: 'GET_QUERY',
      request: (signal) => fetch(getUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal,
      }),
    });
  };

  if (allowGetFallback && action === 'serverListSheetRead') pushGetAttempt();

  attempts.push({
    methodUsed: 'POST_JSON',
    request: (signal) => fetch(sheetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload || {}),
      redirect: 'follow',
      signal,
    }),
  });

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') form.set(key, JSON.stringify(value));
    else form.set(key, String(value));
  }
  attempts.push({
    methodUsed: 'POST_FORM',
    request: (signal) => fetch(sheetUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: form.toString(),
      redirect: 'follow',
      signal,
    }),
  });

  if (allowGetFallback && action !== 'serverListSheetRead') pushGetAttempt();

  let last: AppsScriptCallResult | null = null;
  const deadline=Date.now()+timeoutMs;

  for (const attempt of attempts) {
    if(Date.now()>=deadline)return{ok:false,code:'APPS_SCRIPT_TIMEOUT',message:'list 전체 읽기 시간 예산을 초과했습니다.'};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), Math.max(1,deadline-Date.now()));
    try {
      const res = await attempt.request(controller.signal);
      const text = await res.text();
      const normalized = normalizeAppsScriptResult(attempt.methodUsed, res, text);
      if (normalized.ok === true) return normalized;

      last = normalized;

      const code = String(normalized.code || '');
      const msg = String(normalized.message || '');
      const isHtmlOrNonJson = code === 'APPS_SCRIPT_HTML_RESPONSE' || code === 'APPS_SCRIPT_NON_JSON_RESPONSE';
      const isUnknownAction = /unknown action/i.test(msg);
      if (!isHtmlOrNonJson && !isUnknownAction) break;
    } catch (err) {
      last = {
        ok: false,
        code: 'APPS_SCRIPT_FETCH_FAILED',
        methodUsed: attempt.methodUsed,
        message: String((err as Error)?.message || err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return last || { ok: false, code: 'APPS_SCRIPT_CALL_FAILED', message: 'Apps Script 호출 실패' };
}

async function callRpc(functionName: string, body: JsonRecord, timeoutMs = 45000): Promise<JsonRecord> {
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const text = await res.text();
    const { data } = parseResponseText(text);
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        code: 'SUPABASE_RPC_FAILED',
        message: typeof data === 'string' ? data.slice(0, 1000) : ((data as JsonRecord)?.message as string || `RPC ${functionName} HTTP ${res.status}`),
        raw: data,
      };
    }
    return (data && typeof data === 'object') ? data as JsonRecord : { ok: false, message: 'RPC JSON 응답이 아닙니다.', raw: data };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ ok:false, code:'METHOD_NOT_ALLOWED', message:'POST만 허용됩니다.' },405);
  try {
    const raw=await req.text();
    if (encoder.encode(raw).byteLength>MAX_REQUEST_BYTES) return jsonResponse({ok:false,code:'REQUEST_TOO_LARGE',message:'요청 크기가 허용 범위를 초과했습니다.'},413);
    let body:JsonRecord={};
    try { body=raw?JSON.parse(raw) as JsonRecord:{}; } catch { return jsonResponse({ok:false,code:'JSON_REQUIRED',message:'JSON 요청만 허용됩니다.'},415); }
    const action=String(body.action||'').trim();
    if(action==='health') return jsonResponse({ok:true,service:SERVICE_NAME,apiVersion:API_VERSION,boundary:'LOOKUP_LIST_PREPARE_V1',actions:['prepareList'],legacyFallback:'lookup-sheet-bridge'});
    if(action!=='prepareList') return jsonResponse({ok:false,code:'UNKNOWN_ACTION',message:`알 수 없는 action입니다: ${action}`},400);
    const sessionId=String(body.sessionId||body.session_id||'').trim();
    const sessionToken=String(body.sessionToken||body.session_token||'').trim();
    const clientVersion=String(body.clientVersion||'').trim();
    if(!sessionId||!sessionToken) return jsonResponse({ok:false,code:'MISSING_SESSION',message:'sessionId/sessionToken이 필요합니다.'},400);
    const sessionCheck=await callRpc('kinojo_validate_updater_session',{p_session_id:sessionId,p_session_token:sessionToken},30000);
    if(sessionCheck.ok!==true) return jsonResponse({ok:false,code:String(sessionCheck.code||'INVALID_SESSION'),message:String(sessionCheck.message||'유효한 조회 세션이 아닙니다.')},401);
    const requestPayload=body.payload&&typeof body.payload==='object'&&!Array.isArray(body.payload)?body.payload as JsonRecord:{};
    const lookupFilter=requestPayload.lookupFilter&&typeof requestPayload.lookupFilter==='object'&&!Array.isArray(requestPayload.lookupFilter)?requestPayload.lookupFilter as JsonRecord:{};
    const sheetUrl=requiredEnv('KINOJO_SHEET_SYNC_WEBAPP_URL');
    if (action === 'prepareList') {
      const listRead = await fetchAppsScriptJson(sheetUrl, {
        action: 'serverListSheetRead',
        clientVersion,
        source: 'supabase-edge:lookup-list-prepare',
      }, { timeoutMs: 45000, allowGetFallback: true });

      if (listRead.ok !== true || listRead.readComplete !== true || !Array.isArray(listRead.list) || String(listRead.bridgeRole || '') !== 'APPSCRIPT_MASTER') {
        return jsonResponse({
          ok: false,
          code: 'LIST_SHEET_READ_FAILED',
          message: String(listRead.bridgeRole && listRead.bridgeRole !== 'APPSCRIPT_MASTER' ? 'KINOJO_SHEET_SYNC_WEBAPP_URL이 AppsScript_MASTER 배포를 가리키지 않습니다.' : (listRead.message || listRead.reason || listRead.code || 'list 시트 읽기 실패')),
          bridge: { listRead },
        }, 502);
      }

      const exclusions = await callRpc('kinojo_record_lookup_admin_exclusions_v287', {
        p_session_id: sessionId,
        p_session_token: sessionToken,
        p_list: listRead.list,
      }, 45000);

      if (exclusions.ok !== true) {
        return jsonResponse({
          ok: false,
          code: String(exclusions.code || 'LOOKUP_EXCLUSION_SNAPSHOT_FAILED'),
          message: String(exclusions.message || '조회 제외 대상의 세션 기록을 저장하지 못했습니다.'),
          bridge: { rawListCount: listRead.list.length, exclusions },
        }, 500);
      }

      const rpcResult = await callRpc('kinojo_prepare_lookup_queue_from_list', {
        p_session_id: sessionId,
        p_session_token: sessionToken,
        p_list: listRead.list,
        p_filter: {...lookupFilter,serverReadComplete:true},
      }, 45000);

      if (rpcResult.ok !== true) {
        return jsonResponse({
          ok: false,
          code: String(rpcResult.code || 'PREPARE_LOOKUP_FAILED'),
          message: String(rpcResult.message || 'Server Engine LIST / MASTER 대조 실패'),
          bridge: { rawListCount: listRead.list.length, rpcResult },
        }, 500);
      }

      return jsonResponse({
        ...rpcResult,
        adminExcludedCount: Number(exclusions.adminExcludedCount || rpcResult.adminExcludedCount || 0),
        adminExcludedReasonCounts: exclusions.reasonCounts || {},
        identityRecoveryQueuedCount: Number(exclusions.identityRecoveryQueuedCount || 0),
        ok: true,
        listReadBy: 'supabase-edge:lookup-list-prepare',
        rawListCount: Number(rpcResult.rawListCount || listRead.list.length || 0),
        listCount: listRead.list.length,
        bridge: {
          source: 'Google Apps Script via Supabase Edge Function',
          methodUsed: listRead.methodUsed || '',
          listCount: listRead.list.length,
          sheetMessage: listRead.message || '',
          exclusions,
          lookupFilter,
          lookupFilterSummary: String(rpcResult.lookupFilterSummary || requestPayload.lookupFilterSummary || ''),
        },
      });
    }
    return jsonResponse({ok:false,code:'ACTION_NOT_COMPLETED',message:'요청 처리가 완료되지 않았습니다.'},500);
  } catch(err) { return jsonResponse({ok:false,code:'EDGE_FUNCTION_ERROR',message:String((err as Error)?.message||err)},500); }
});

export {};
