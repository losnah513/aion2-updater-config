import { readRequestText } from "../_shared/http-budget.ts";

const SERVICE = "kinojo-member-image-cleanup";
const VERSION = "1.4";
const DB = "404";
const BUCKET = "kinojo-member-reference";
const MAX_BODY = 1024;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const SLOTS = new Set(["FRONT", "BACK", "UPPER_BODY"]);
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const enc = new TextEncoder();
// Keep one request's headers/body bounded; no automatic delete/write retries.
async function fetchText(url: string, init: RequestInit) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error("CLEANUP_UPSTREAM_TIMEOUT")); controller.abort(); }, 10000);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const res = await fetch(url, { ...init, signal: controller.signal });
      return { res, raw: await res.text() };
    })()]);
  } finally { clearTimeout(timer); }
}
const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const txt = (v: unknown, n = 1024) =>
  String(v ?? "")
    .trim()
    .slice(0, n);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

function ctx() {
  const url = txt(Deno.env.get("SUPABASE_URL"), 500).replace(/\/$/, "");
  let key = txt(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 2200);
  if (!key) {
    try {
      key = txt(
        rec(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"))?.default,
        2200,
      );
    } catch {
      key = "";
    }
  }
  if (!url || !key) throw new Error("CLEANUP_SERVER_NOT_CONFIGURED");
  return { url, key };
}

function headers() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-kinojo-cleanup-contract": DB,
    "x-kinojo-cleanup-cron-contract": "364",
  };
}

function out(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers() });
}

function serviceRoleAuthorized(req: Request, key: string) {
  return txt(req.headers.get("authorization"), 2400) === `Bearer ${key}`;
}

async function rpc(name: string, body: Record<string, unknown>) {
  const { url, key } = ctx();
  const { res, raw } = await fetchText(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "x-client-info": `${SERVICE}/${VERSION}`,
    },
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!res.ok) throw new Error(`RPC_FAILED:${name}:${res.status}`);
  return data;
}

async function cronAuthorized(req: Request) {
  const token = txt(req.headers.get("x-kinojo-cron-token"), 128);
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  try {
    return (
      (await rpc("kinojo_member_image_cleanup_cron_authorize_v364", {
        p_token: token,
      })) === true
    );
  } catch {
    return false;
  }
}

function validCandidate(v: Record<string, unknown>) {
  const sourceKind = txt(v.source_kind ?? v.sourceKind, 40);
  const requestId = num(v.request_id ?? v.requestId);
  const characterId = num(v.character_id ?? v.characterId);
  const slot = txt(v.slot, 40);
  const objectPath = txt(v.object_path ?? v.objectPath, 1024);
  const mimeType = txt(v.mime_type ?? v.mimeType, 120).toLowerCase();
  const ext = MIME_EXT[mimeType];
  if (
    !["REQUEST_ITEM", "QUEUED_OBJECT", "ACTIVE_REFERENCE"].includes(
      sourceKind,
    ) ||
    (sourceKind === "REQUEST_ITEM" &&
      (!Number.isInteger(requestId) || (requestId as number) <= 0)) ||
    !Number.isInteger(characterId) ||
    (characterId as number) <= 0 ||
    !SLOTS.has(slot) ||
    !ext
  )
    return null;
  const pattern = new RegExp(
    `^characters/${characterId}/${slot}/[0-9a-f]{32}\\.${ext}$`,
  );
  if (!pattern.test(objectPath)) return null;
  return {
    sourceKind,
    requestId: sourceKind === "REQUEST_ITEM" ? (requestId as number) : null,
    characterId: characterId as number,
    slot,
    objectPath,
    mimeType,
  };
}

async function deleteObject(path: string) {
  const { url, key } = ctx();
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const { res, raw } = await fetchText(`${url}/storage/v1/object/${BUCKET}/${encoded}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "x-client-info": `${SERVICE}/${VERSION}`,
    },
  });
  if (res.ok) return { ok: true, absent: false, status: res.status };
  let failure: Record<string, unknown> | null = null;
  try { failure = rec(JSON.parse(raw)); } catch { /* Unknown errors stay failed. */ }
  // Storage can return legacy HTTP 400 with the precise NoSuchKey code.
  // A generic 404 may be NoSuchBucket/tenant failure and must not erase metadata.
  const absent = [400, 404].includes(res.status) &&
    (failure?.code === "NoSuchKey" || failure?.error === "NoSuchKey");
  if (absent) return { ok: true, absent: true, status: res.status };
  return { ok: false, absent: false, status: res.status };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return out({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { key } = ctx();
    const serviceRole = serviceRoleAuthorized(req, key);
    const cron = serviceRole ? false : await cronAuthorized(req);
    if (!serviceRole && !cron)
      return out({ ok: false, code: "CLEANUP_AUTH_REQUIRED" }, 401);

    const raw = await readRequestText(req,MAX_BODY);
    if (enc.encode(raw).byteLength > MAX_BODY)
      return out({ ok: false, code: "REQUEST_TOO_LARGE" }, 413);
    const body = rec(raw ? JSON.parse(raw) : {}) || {};
    const action = txt(body.action, 40) || "run";
    if (action === "health")
      return out({
        ok: true,
        service: SERVICE,
        apiVersion: VERSION,
        databaseContract: DB,
        bucket: BUCKET,
        contract: "member-image-cleanup-edge-v1.4",
        cronContract: "364",
        sources: ["REQUEST_ITEM", "QUEUED_OBJECT", "ACTIVE_REFERENCE"],
        imageRetentionDays: 7,
        metadataRetentionDays: 30,
      });
    if (action !== "run")
      return out({ ok: false, code: "UNSUPPORTED_ACTION" }, 400);

    const requested = num(body.limit);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        Number.isInteger(requested) ? (requested as number) : DEFAULT_LIMIT,
      ),
    );
    const rows = await rpc("kinojo_member_image_cleanup_candidates_v404", {
      p_limit: limit,
    });
    const candidates = Array.isArray(rows) ? rows : [];

    const summary = {
      scanned: candidates.length,
      storageDeleted: 0,
      storageAbsent: 0,
      metadataDeleted: 0,
      storageFailed: 0,
      conflicts: 0,
      invalidCandidates: 0,
      requestMetadataDeleted: 0,
      finalizeFailed: 0,
    };
    let next = 0;
    const processCandidate = async (row: unknown) => {
      const candidate = validCandidate(rec(row) || {});
      if (!candidate) {
        summary.invalidCandidates++;
        return;
      }

      let removed;
      try { removed = await deleteObject(candidate.objectPath); }
      catch { summary.storageFailed++; return; }
      if (!removed.ok) {
        summary.storageFailed++;
        return;
      }
      if (removed.absent) summary.storageAbsent++;
      else summary.storageDeleted++;

      let finalized;
      try { finalized = rec(await rpc("kinojo_member_image_cleanup_finalize_v404", {
          p_source_kind: candidate.sourceKind,
          p_request_id: candidate.requestId,
          p_character_id: candidate.characterId,
          p_slot: candidate.slot,
          p_expected_object_path: candidate.objectPath,
        })); } catch { summary.finalizeFailed++; return; }
      if (finalized?.ok === true) {
        summary.metadataDeleted++;
        return;
      }
      summary.conflicts++;
    };
    // Four workers cap Storage/DB pressure while reducing serial batch latency.
    await Promise.all(Array.from({length:Math.min(4,candidates.length)}, async () => {
      while (next < candidates.length) await processCandidate(candidates[next++]);
    }));

    const metadata = rec(
      await rpc("kinojo_member_image_request_metadata_cleanup_v404", {
        p_limit: limit,
      }),
    );
    if (metadata?.ok !== true)
      throw new Error("REQUEST_METADATA_CLEANUP_FAILED");
    summary.requestMetadataDeleted =
      num(metadata.metadataDeleted ?? metadata.metadata_deleted) ?? 0;

    const ok = summary.storageFailed === 0 && summary.finalizeFailed === 0 && summary.invalidCandidates === 0;
    return out({
      ok,
      code: ok ? "CLEANUP_COMPLETE" : "CLEANUP_PARTIAL_FAILURE",
      service: SERVICE,
      apiVersion: VERSION,
      databaseContract: DB,
      contract: "member-image-cleanup-edge-v1.4",
      cronContract: "364",
      limit,
      hasMore: candidates.length === limit,
      summary,
      invariant: "STORAGE_DELETE_SUCCESS_BEFORE_METADATA_DELETE",
      requestRetention:
        "DRAFT_OBJECTS_2H_IMAGES_7D_METADATA_30D_AFTER_OBJECT_DELETE",
    }, ok ? 200 : 502);
  } catch (e) {
    const code = e instanceof Error ? e.message : "CLEANUP_SERVER_ERROR";
    if (code === "REQUEST_TOO_LARGE") return out({ok:false,code},413);
    if (code === "REQUEST_BODY_TIMEOUT") return out({ok:false,code},408);
    if (e instanceof SyntaxError) return out({ok:false,code:"INVALID_JSON"},400);
    console.error(SERVICE, code);
    return out(
      {
        ok: false,
        code:
          code === "CLEANUP_SERVER_NOT_CONFIGURED"
            ? code
            : "CLEANUP_SERVER_ERROR",
      },
      500,
    );
  }
});
