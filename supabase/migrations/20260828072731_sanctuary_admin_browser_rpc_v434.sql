-- Restore the browser-callable ACL used by the existing admin member-list RPC.
--
-- ADMIN_BROWSER_RPC_SESSION_GATE: the public WEB calls this function with the
-- opaque Server-issued kws_ session in p_pass_key. v433 must therefore remain
-- executable by PostgREST's anon/authenticated roles, while the delegated v428
-- function performs the real actor/session/role authorization before any row is
-- returned. Do not "secure" this wrapper by making it service_role-only: that
-- caused the 2026-08-28 production member-list outage. PUBLIC remains revoked.

revoke all on function public.kinojo_admin_member_list_v433(text, integer, text, text, text)
  from public;

grant execute on function public.kinojo_admin_member_list_v433(text, integer, text, text, text)
  to anon, authenticated, service_role;

comment on function public.kinojo_admin_member_list_v433(text, integer, text, text, text) is
  'Admin member cursor list. Browser RPC is admitted for anon/authenticated, then authorized by the delegated v428 opaque kws_ session gate; ADMIN rows remain visible only to raw MASTER actors.';
