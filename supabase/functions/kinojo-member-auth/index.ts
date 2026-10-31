import { readRequestText } from "../_shared/http-budget.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SERVICE_NAME = "kinojo-member-auth";
const API_VERSION = "2.1";
const DATABASE_CONTRACT = "320";
const TOOL_NAME = "KINOJO_WEB";
const MAX_REQUEST_BYTES = 4_096;
const encoder = new TextEncoder();
const allowedOrigins = new Set([
  "https://kinojo.info",
  "https://www.kinojo.info",
]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function requestOrigin(request: Request): string {
  const origin = text(request.headers.get("origin"), 300);
  return allowedOrigins.has(origin) ? origin : "";
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = requestOrigin(request);
  return {
    "access-control-allow-origin": origin || "https://kinojo.info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-max-age": "600",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin",
    "x-content-type-options": "nosniff",
    "x-kinojo-auth-boundary": "KINOJO_MEMBER_AUTH_EDGE_V2",
    "x-kinojo-auth-contract": DATABASE_CONTRACT,
  };
}

function json(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), ...extraHeaders },
  });
}

function serviceContext(): { supabaseUrl: string; serviceKey: string } {
  const supabaseUrl = text(Deno.env.get("SUPABASE_URL"), 500).replace(/\/$/, "");
  let serviceKey = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 2_200);
  if (!serviceKey) {
    try {
      const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as JsonRecord;
      serviceKey = text(secretKeys.default, 2_200);
    } catch {
      serviceKey = "";
    }
  }
  if (!supabaseUrl || !serviceKey) {
    throw new Error("AUTH_SERVER_NOT_CONFIGURED");
  }
  return { supabaseUrl, serviceKey };
}

async function callRpc(functionName: string, body: JsonRecord): Promise<JsonRecord> {
  const { supabaseUrl, serviceKey } = serviceContext();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error("AUTH_UPSTREAM_TIMEOUT")); controller.abort(); }, 10000);
  });
  let response: Response, raw: string;
  try { ({response,raw} = await Promise.race([timeout,(async () => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      "x-client-info": `${SERVICE_NAME}/${API_VERSION}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  return {response,raw:await response.text()};
  })()])); } finally { clearTimeout(timer); }
  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error("AUTH_RPC_FAILED");
  }
  return asRecord(data) || {};
}

function failure(data: JsonRecord, fallbackCode: string, fallbackMessage: string): JsonRecord {
  return {
    ok: false,
    code: text(data.code, 80) || fallbackCode,
    message: text(data.message, 300) || fallbackMessage,
  };
}

function sanitizeProfile(value: unknown): JsonRecord {
  const row = asRecord(value) || {};
  const permissions = Array.isArray(row.permissions)
    ? row.permissions.map((item) => text(item, 80)).filter(Boolean).slice(0, 32)
    : [];
  return {
    id: row.id ?? null,
    mainCharacterName: text(row.mainCharacterName ?? row.main_character_name, 120),
    mainCharacter: text(row.mainCharacter ?? row.main_character_name, 120),
    role: text(row.role, 40),
    roleLabel: text(row.roleLabel ?? row.role_label, 80),
    level: Number.isFinite(Number(row.level)) ? Number(row.level) : 0,
    permissions,
    canManage: row.canManage === true || row.can_manage === true,
    canLike: row.canLike !== false && row.can_like !== false,
    canSuggest: row.canSuggest !== false && row.can_suggest !== false,
    source: text(row.source, 80) || "supabase_web_session_320",
  };
}

function sanitizeSession(value: unknown, token = ""): JsonRecord {
  const row = asRecord(value) || {};
  const result: JsonRecord = {
    issuedAt: text(row.issuedAt ?? row.issued_at, 80),
    lastActivityAt: text(row.lastActivityAt ?? row.last_activity_at, 80),
    expiresAt: text(row.expiresAt ?? row.expires_at, 80),
    idleTimeoutSeconds: Number.isFinite(Number(row.idleTimeoutSeconds ?? row.idle_timeout_seconds))
      ? Number(row.idleTimeoutSeconds ?? row.idle_timeout_seconds)
      : 1_800,
    serverSession: row.serverSession !== false,
    contractVersion: text(row.contractVersion ?? row.contract_version, 40) || DATABASE_CONTRACT,
  };
  const sessionToken = token || text(row.token, 120);
  if (sessionToken) result.token = sessionToken;
  return result;
}

function sanitizeSuccess(data: JsonRecord, token = ""): JsonRecord {
  if (data.ok !== true) {
    return failure(data, "AUTH_FAILED", "로그인 상태를 확인하지 못했습니다.");
  }
  const profile = sanitizeProfile(data.profile);
  const session = sanitizeSession(data.session, token);
  if (!session.token) {
    return failure({}, "SESSION_TOKEN_MISSING", "로그인 세션을 발급하지 못했습니다.");
  }
  return {
    ok: true,
    tool: TOOL_NAME,
    databaseContract: DATABASE_CONTRACT,
    profile,
    session,
  };
}

function sessionTokenFrom(body: JsonRecord): string {
  return text(body.sessionToken ?? body.session_token ?? body.token, 120);
}

async function clientScope(request: Request): Promise<string> {
  // Pseudonymize network origin with a server-only HMAC key. Never hash a PASS
  // KEY, never store raw IPs, and do not treat forwarded headers as authority.
  const { serviceKey } = serviceContext();
  const ip = text(request.headers.get("x-forwarded-for"), 300).split(",")[0].trim() || "unknown";
  const key = await crypto.subtle.importKey("raw",encoder.encode(serviceKey),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes = await crypto.subtle.sign("HMAC",key,encoder.encode("kinojo-login-v546:"+ip));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { ok: false, code: "METHOD_NOT_ALLOWED", message: "POST 요청만 허용합니다." }, 405);
  }
  if (!text(request.headers.get("content-type"), 200).toLowerCase().includes("application/json")) {
    return json(request, { ok: false, code: "JSON_REQUIRED", message: "JSON 요청만 허용합니다." }, 415);
  }

  try {
    const raw = await readRequestText(request,MAX_REQUEST_BYTES);
    if (encoder.encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return json(request, { ok: false, code: "REQUEST_TOO_LARGE", message: "인증 요청 크기가 허용 범위를 초과했습니다." }, 413);
    }

    const body = asRecord(raw ? JSON.parse(raw) : {}) || {};
    const action = text(body.action, 40) || "login";

    if (action === "health") {
      return json(request, {
        ok: true,
        service: SERVICE_NAME,
        apiVersion: API_VERSION,
        databaseContract: DATABASE_CONTRACT,
        authBoundary: "SERVER_EDGE_SESSION",
        tool: TOOL_NAME,
        actions: ["login", "validate", "touch", "logout"],
      });
    }

    if (["login", "verifyPassKey", "verify"].includes(action)) {
      const admission = await callRpc("kinojo_auth_login_admit_v546", {p_client_scope:await clientScope(request)});
      if (admission.ok !== true) {
        const retryAfter = Math.max(1,Math.min(300,Number(admission.retryAfter)||60));
        return json(request,{ok:false,code:"AUTH_RATE_LIMITED",message:"로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.",retryAfter},429,{"retry-after":String(retryAfter)});
      }
      const passKeyValue = String(body.passKey ?? body.pass_key ?? "");
      if (Array.from(passKeyValue).length > 80) {
        return json(request, { ok: false, code: "PASS_KEY_TOO_LONG", message: "PASS KEY 형식이 올바르지 않습니다." }, 400);
      }
      if (!passKeyValue.replace(/\s+/g, "")) {
        return json(request, { ok: false, code: "PASS_KEY_REQUIRED", message: "PASS KEY를 입력하세요." });
      }

      const data = await callRpc("kinojo_web_session_issue_v320", {
        p_pass_key: passKeyValue,
        p_replace_session_token: sessionTokenFrom({
          sessionToken: body.replaceSessionToken ?? body.replace_session_token,
        }) || null,
        p_client_context: {
          clientVersion: text(body.clientVersion ?? body.client_version, 80),
          origin: requestOrigin(request),
        },
      });
      const result = sanitizeSuccess(data);
      return json(request, result);
    }

    if (action === "validate" || action === "touch") {
      const sessionToken = sessionTokenFrom(body);
      if (!sessionToken) {
        return json(request, { ok: false, code: "SESSION_TOKEN_REQUIRED", message: "로그인 세션이 필요합니다." });
      }
      const data = await callRpc("kinojo_web_session_validate_v320", {
        p_session_token: sessionToken,
        p_touch: action === "touch",
      });
      const result = sanitizeSuccess(data, sessionToken);
      return json(request, result);
    }

    if (action === "logout" || action === "revoke") {
      const sessionToken = sessionTokenFrom(body);
      const data = await callRpc("kinojo_web_session_revoke_v320", {
        p_session_token: sessionToken,
        p_reason: text(body.reason, 80) || "logout",
      });
      return json(request, {
        ok: data.ok !== false,
        revoked: data.revoked === true,
        code: text(data.code, 80) || "NO_ACTIVE_SESSION",
        databaseContract: DATABASE_CONTRACT,
      });
    }

    return json(request, { ok: false, code: "UNSUPPORTED_ACTION", message: "지원하지 않는 인증 요청입니다." }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "AUTH_SERVER_ERROR";
    if (code === "REQUEST_TOO_LARGE") return json(request,{ok:false,code},413);
    if (code === "REQUEST_BODY_TIMEOUT") return json(request,{ok:false,code},408);
    if (error instanceof SyntaxError) return json(request,{ok:false,code:"INVALID_JSON"},400);
    const serverConfigurationError = code === "AUTH_SERVER_NOT_CONFIGURED";
    return json(request, {
      ok: false,
      code: serverConfigurationError ? "AUTH_SERVER_NOT_CONFIGURED" : "AUTH_SERVER_ERROR",
      message: "PASS KEY 인증 서버 처리 중 오류가 발생했습니다.",
    }, 500);
  }
});

