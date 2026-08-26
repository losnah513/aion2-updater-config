const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const migration = read(
  "supabase/migrations/20260826033315_member_image_request_batch_v404.sql",
);
const profile = read("supabase/functions/kinojo-member-profile/index.ts");
const cleanup = read("supabase/functions/kinojo-member-image-cleanup/index.ts");
const workflow = read(".github/workflows/verify-kinojo-pages.yml");

for (const token of [
  "create table private.member_image_requests",
  "create table private.member_image_request_items",
  "create table private.member_image_request_status_history",
  "create table private.member_image_object_cleanup_queue",
  "style_code in ('SHONEN_MANGA','ROMANCE_MANGA','ANIMATION','REALISTIC','CUSTOM')",
  "status in ('DRAFT','SUBMITTED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED')",
  "draft_expires_at <= created_at + interval '2 hours'",
  "image_expires_at <= created_at + interval '7 days'",
  "metadata_expires_at <= created_at + interval '30 days'",
  "char_length(request_note) <= 300",
  "member_image_requests_member_idempotency_key unique",
  "member_image_request_items_object_path_key unique",
  "enable row level security",
  "kinojo_member_image_request_prepare_v404",
  "kinojo_member_image_request_draft_v404",
  "kinojo_member_image_request_finalize_v404",
  "kinojo_member_image_request_state_v404",
  "kinojo_member_image_cleanup_candidates_v404",
  "kinojo_member_image_cleanup_finalize_v404",
  "kinojo_member_image_request_metadata_cleanup_v404",
  "perform pg_advisory_xact_lock(hashtextextended('kinojo-member-image-request:'",
  "status='SUBMITTED',submitted_at=v_now",
])
  assert.ok(migration.includes(token), `missing DB404 contract: ${token}`);

assert.match(
  migration,
  /jsonb_array_length\(p_items\);\n  if v_count < 1 or v_count > 3/,
);
assert.match(
  migration,
  /revoke all on table private\.member_image_requests from public, anon, authenticated/,
);
assert.match(
  migration,
  /grant execute on function public\.kinojo_member_image_request_finalize_v404[\s\S]+to service_role/,
);
assert.doesNotMatch(migration, /grant execute[\s\S]+to (?:anon|authenticated)/);
assert.match(migration, /REQUEST_REFERENCE_CONFLICT/);
assert.match(migration, /REPLACED_LEGACY_REFERENCE/);
assert.match(migration, /storage_deleted_at is null/);

for (const token of [
  'REQUEST = "404"',
  '"image-request-prepare"',
  '"image-request-finalize"',
  '"image-request-state"',
  'rpc("kinojo_member_image_request_prepare_v404"',
  'rpc("kinojo_member_image_request_draft_v404"',
  'rpc("kinojo_member_image_request_finalize_v404"',
  'rpc("kinojo_member_image_request_state_v404"',
  'privacy: "SIGNED_UPLOAD_URL_ONLY_NO_OBJECT_PATH_FIELD"',
  'privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS"',
  "pixelResult(stored.bytes, slot)",
  "await Promise.all(",
])
  assert.ok(profile.includes(token), `missing Edge request contract: ${token}`);

assert.ok(
  profile.includes('DB = "375"'),
  "existing DB375 image bootstrap contract must stay compatible",
);
for (const style of [
  "SHONEN_MANGA",
  "ROMANCE_MANGA",
  "ANIMATION",
  "REALISTIC",
  "CUSTOM",
])
  assert.ok(profile.includes(`"${style}"`));
assert.match(
  profile,
  /has\(b, \["items", "verifiedItems", "verified_items"\]\)/,
  "browser must not claim verified objects",
);
assert.match(
  profile,
  /txt\(draft\.status, 40\) === "SUBMITTED"[\s\S]+p_verified_items: \[\]/,
  "a submitted retry must return idempotently without reading expired Storage objects",
);
assert.match(
  profile,
  /const request = imageRequestPublic\(\s*d,\s*input\.items\.map\(\(x\) => x\.slot\),\s*\);/,
  "prepare must project the validated request slots when DB404 returns items without a slots field",
);
const publicHelperSource = profile.match(
  /function imageRequestPublic\(d, fallbackSlots = \[\]\) \{[\s\S]*?\n\}/,
)?.[0];
assert.ok(publicHelperSource, "image request public projection helper must stay testable");
const imageRequestPublic = vm.runInNewContext(`(${publicHelperSource})`, {
  SLOTS: ["FRONT", "BACK", "UPPER_BODY"],
  txt: (value, limit = 500) => String(value ?? "").trim().slice(0, limit),
  pos: (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  },
});
const rpcPrepareShape = {
  requestId: 8,
  status: "DRAFT",
  styleCode: "REALISTIC",
  requestNote: "",
  imageExpiresAt: "2026-09-02T12:11:43Z",
  metadataExpiresAt: "2026-09-25T12:11:43Z",
  items: [
    { slot: "FRONT", objectPath: "private/front.webp" },
    { slot: "BACK", objectPath: "private/back.webp" },
    { slot: "UPPER_BODY", objectPath: "private/upper-body.webp" },
  ],
};
assert.deepEqual(
  Array.from(
    imageRequestPublic(rpcPrepareShape, ["FRONT", "BACK", "UPPER_BODY"]).slots,
  ),
  ["FRONT", "BACK", "UPPER_BODY"],
  "the actual Edge helper must restore canonical slots for the DB404 prepare response shape",
);
assert.deepEqual(
  Array.from(imageRequestPublic({ ...rpcPrepareShape, slots: ["BACK"] }, ["FRONT"]).slots),
  ["BACK"],
  "an explicit DB slots field must remain authoritative for finalize and state responses",
);
assert.equal(
  JSON.stringify(imageRequestPublic(rpcPrepareShape, ["FRONT"])).includes("objectPath"),
  false,
  "the public projection must not expose private Storage object paths",
);
assert.doesNotMatch(profile, /uploads\.push\([^\n]*objectPath/);

for (const token of [
  'const VERSION = "1.3"',
  'const DB = "404"',
  "kinojo_member_image_cleanup_candidates_v404",
  "kinojo_member_image_cleanup_finalize_v404",
  "kinojo_member_image_request_metadata_cleanup_v404",
  '"REQUEST_ITEM"',
  '"QUEUED_OBJECT"',
  '"ACTIVE_REFERENCE"',
  "STORAGE_DELETE_SUCCESS_BEFORE_METADATA_DELETE",
])
  assert.ok(cleanup.includes(token), `missing cleanup v404 contract: ${token}`);

assert.ok(
  workflow.includes("node tests/my-info-image-request-server-contract.test.js"),
);
assert.ok(workflow.includes("supabase/functions/kinojo-member-profile/**"));
assert.ok(
  workflow.includes("supabase/functions/kinojo-member-image-cleanup/**"),
);

console.log("My Info image request server/storage v404 contract: PASS");
