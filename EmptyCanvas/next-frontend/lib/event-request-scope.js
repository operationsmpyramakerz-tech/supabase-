import "server-only";
import { select } from "./supabase-rest";
import { getEvent } from "./events-data";
import { eventRequestScopeFor, eventRequestOwnerAllowed } from "./event-request-scope.mjs";

const clean = value => String(value ?? "").trim();
function deny(message,status=403) {
  const err = new Error(message); err.status=status; throw err;
}
export async function resolveEventRequestScope(account={}, permission="events.requests.view") {
  const scope = eventRequestScopeFor(account,permission);
  if (scope === null || scope === "all") return { scope, visibleIds: [] };
  if (scope === "none") deny("Event Requests permission is not allowed.");
  const self = clean(account?.teamMemberId || account?.userSupabaseId);
  if (!self) deny("Verified member identity is required for Event Requests scope.",503);
  if (scope === "own") return { scope, visibleIds:[self] };
  let rows;
  try {
    rows = await select("erp_member_scope_team_links",{
      select:"visible_member_id",manager_member_id:`eq.${self}`,limit:"5000"
    },{profileName:"events.request-team-scope"});
  } catch { deny("Event Requests team relationships could not be verified.",503); }
  if (!Array.isArray(rows) || rows.length >= 5000) deny("Event Requests team relationships could not be verified.",503);
  return {scope,visibleIds:[...new Set([self,...rows.map(row=>clean(row?.visible_member_id)).filter(Boolean)])]};
}
export async function scopedEventRequestList(account, events=[]) {
  const policy=await resolveEventRequestScope(account,"events.requests.view");
  return (Array.isArray(events)?events:[]).filter(event=>eventRequestOwnerAllowed(event,policy.scope,policy.visibleIds));
}
export async function assertEventRequestScope(account,permission,eventOrId) {
  const policy=await resolveEventRequestScope(account,permission);
  if (policy.scope === null) return;
  const event=typeof eventOrId === "string" ? await getEvent(eventOrId) : eventOrId;
  if (!event?.id) deny("Event request was not found.",404);
  if (!eventRequestOwnerAllowed(event,policy.scope,policy.visibleIds)) deny("Event request is outside the permitted data scope.");
}
export async function eventRequestUiScopePolicy(account={}) {
  const keys={view:"events.requests.view", edit:"events.requests.edit",cancel:"events.requests.cancel",
    workflow:"events.requests.workflow",archive:"events.requests.archive",pdf:"events.requests.pdf"};
  const scopes=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,eventRequestScopeFor(account,v)]).filter(([,scope])=>scope!==null));
  if (!Object.keys(scopes).length) return null;
  const self=clean(account?.teamMemberId || account?.userSupabaseId);
  const teamRequested=Object.values(scopes).some(scope=>scope==="team");
  const needsSelf=Object.values(scopes).some(scope=>scope==="team" || scope==="own");
  if (needsSelf && !self) deny("Verified member identity is required for Event Requests scope.",503);
  const team=teamRequested ? await resolveEventRequestScope(account,"events.requests.view") : null;
  // View may be Own with a Team action, capped to Own. When View is All and
  // a Team action exists, read that action's policy to resolve its team IDs.
  const actionTeam=teamRequested && team?.scope!=="team"
    ? await resolveEventRequestScope(account,Object.entries(keys).find(([k])=>scopes[k]==="team")?.[1]) : null;
  return {self,visibleIds:(team?.scope==="team" ? team.visibleIds : actionTeam?.visibleIds) || (self ? [self]:[]),scopes};
}
