const SERVICE = "kinojo-member-image-cleanup";
const VERSION = "1.3";
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
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "x-client-info": `${SERVICE}/${VERSION}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
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
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${encoded}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "x-client-info": `${SERVICE}/${VERSION}`,
    },
  });
  if (res.ok) return { ok: true, absent: false, status: res.status };
  if (res.status === 404) return { ok: true, absent: true, status: 404 };
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

    const raw = await req.text();
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
        contract: "member-image-cleanup-edge-v1.3",
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
    };
    for (const row of candidates) {
      const candidate = validCandidate(rec(row) || {});
      if (!candidate) {
        summary.invalidCandidates++;
        continue;
      }

      const removed = await deleteObject(candidate.objectPath);
      if (!removed.ok) {
        summary.storageFailed++;
        continue;
      }
      if (removed.absent) summary.storageAbsent++;
      else summary.storageDeleted++;

      const finalized = rec(
        await rpc("kinojo_member_image_cleanup_finalize_v404", {
          p_source_kind: candidate.sourceKind,
          p_request_id: candidate.requestId,
          p_character_id: candidate.characterId,
          p_slot: candidate.slot,
          p_expected_object_path: candidate.objectPath,
        }),
      );
      if (finalized?.ok === true) {
        summary.metadataDeleted++;
        continue;
      }
      summary.conflicts++;
    }

    const metadata = rec(
      await rpc("kinojo_member_image_request_metadata_cleanup_v404", {
        p_limit: limit,
      }),
    );
    if (metadata?.ok !== true)
      throw new Error("REQUEST_METADATA_CLEANUP_FAILED");
    summary.requestMetadataDeleted =
      num(metadata.metadataDeleted ?? metadata.metadata_deleted) ?? 0;

    return out({
      ok: true,
      service: SERVICE,
      apiVersion: VERSION,
      databaseContract: DB,
      contract: "member-image-cleanup-edge-v1.3",
      cronContract: "364",
      limit,
      hasMore: candidates.length === limit,
      summary,
      invariant: "STORAGE_DELETE_SUCCESS_BEFORE_METADATA_DELETE",
      requestRetention:
        "DRAFT_OBJECTS_2H_IMAGES_7D_METADATA_30D_AFTER_OBJECT_DELETE",
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "CLEANUP_SERVER_ERROR";
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
