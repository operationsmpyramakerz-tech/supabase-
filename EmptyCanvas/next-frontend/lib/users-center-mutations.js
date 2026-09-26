import "server-only";

import {
  deleteById,
  insert,
  insertMany,
  rpc,
  select,
  selectAll,
  selectById,
  supabaseRequest,
  updateById,
  updateByIds,
} from "./supabase-rest";
import {
  clearUsersCenterReadCaches,
  usersCenterMemberDetails,
  usersCenterPageAccess,
  usersCenterSvAccess,
  usersCenterAppPages,
} from "./users-center-data";
import { clearDirectSessionAccountCaches, setDirectUserAuthRevokedAt } from "./direct-session-account";
import { sendUsersCenterSignupStatusEmail } from "./users-center-email";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if (value.url) return String(value.url || "").trim();
    if (value.name) return String(value.name || "").trim();
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canon(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function token(value) { return text(value).toLowerCase(); }
function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function valueFor(row = {}, aliases = []) {
  for (const alias of aliases) if (Object.prototype.hasOwnProperty.call(row || {}, alias)) return row[alias];
  const wanted = new Set(aliases.map(canon).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) if (wanted.has(canon(key))) return value;
  return null;
}

function allKeys(rows = []) {
  const set = new Set();
  for (const row of rows || []) Object.keys(row || {}).forEach((key) => set.add(key));
  return Array.from(set);
}

function findKey(objOrKeys, aliases = []) {
  const keys = Array.isArray(objOrKeys) ? objOrKeys : Object.keys(objOrKeys || {});
  return aliases.map(canon).filter(Boolean).map((wanted) => keys.find((key) => canon(key) === wanted)).find(Boolean) || "";
}

function valueForLabel(row, label) {
  const key = canon(label);
  const aliases = [label];
  if (key === "name") aliases.push("Name", "name", "full_name", "username");
  if (key === "department") aliases.push("Department", "department");
  if (key === "phone") aliases.push("Phone", "phone", "mobile");
  if (key === "school") aliases.push("School", "school", "school_name", "School Name", "stocktaking_column", "Stocktaking Column", "done_column", "Done Column");
  if (key === "password") aliases.push("Password", "password", "passcode", "pin");
  if (key === "position") aliases.push("Position", "position", "role");
  if (key === "profilepicture") aliases.push("Profile picture", "Profile Picture", "Profile Photo", "Profile photo", "profile_picture", "profile_picture_url", "profile_photo", "profile_photo_url", "photo", "photo_url", "avatar", "avatar_url", "image", "image_url", "picture", "picture_url");
  if (key === "coverphoto") aliases.push("Cover photo", "Cover Photo", "Cover Image", "cover_photo", "cover_photo_url", "cover_image", "cover_image_url", "cover", "cover_url", "banner", "banner_url", "profile_cover", "profile_cover_url");
  if (key === "filesmedia") aliases.push("Files & media", "files_media", "files", "media");
  if (key === "employeecode") aliases.push("Employee Code", "employee_code", "employeeCode", "code");
  if (key === "email") aliases.push("Email", "email", "mail");
  return valueFor(row, aliases);
}

function teamMembersTable() { return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members"; }
function departmentsTable() { return text(process.env.SUPABASE_TEAM_MEMBER_DEPARTMENTS_TABLE) || "team_member_departments"; }
function svAccessTable() { return text(process.env.SUPABASE_TEAM_MEMBER_SV_SCHOOLS_TABLE) || "team_member_sv_schools"; }
function signupRequestsTable() { return text(process.env.SUPABASE_SIGNUP_REQUESTS_TABLE) || "team_member_signup_requests"; }
function stocktakingTable() { return text(process.env.SUPABASE_STOCKTAKING_TABLE) || "stocktaking"; }
function departmentKey(value) { return canon(text(value) || "No Department") || "nodepartment"; }
function cleanDepartmentName(value) { return text(value).replace(/\s+/g, " "); }
function memberId(row = {}) { return text(valueFor(row, ["id", "ID"])); }
function memberName(row = {}) { return text(valueForLabel(row, "Name")) || "Team member"; }
function normalizeAccessLevel(value) { const raw = text(value).toLowerCase(); return raw === "admin" ? "admin" : raw === "view" ? "view" : "edit"; }
function pageIdValue(value) { const raw = text(value); const number = Number(raw); return raw && Number.isFinite(number) && String(number) === raw.replace(/^0+(?=\d)/, "") ? number : raw; }

function httpError(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function missingTable(error, table) { return new RegExp(`${table}|schema cache|Could not find the table|relation .* does not exist|42P01|PGRST205`, "i").test(text(error?.message || error?.details || error)); }

async function teamRows() { return await selectAll(teamMembersTable(), { limit: 5000, profileName: "users-center.mutation-team-rows" }); }
async function departmentRows({ strict = false } = {}) {
  try { return await selectAll(departmentsTable(), { limit: 1000, order: "name.asc", profileName: "users-center.mutation-departments" }); }
  catch (error) {
    if (missingTable(error, departmentsTable()) && !strict) return [];
    if (missingTable(error, departmentsTable())) throw httpError("Department table is not installed. Run supabase_user_access_departments_migration.sql once, then try again.", 500);
    throw error;
  }
}

function nonEditableColumn(key) {
  return ["id", "createdat", "updatedat", "importedat", "lasteditedtime", "createdtime", "isactive", "svschoolsraw", "svschoolsnotionurls", "svschoolmemberids", "svschoolmembernames", "svschoolsunmatched"].includes(canon(key));
}

function labelForColumn(key) {
  const known = { id: "ID", createdat: "Created time", updatedat: "Updated time", department: "Department", name: "Name", phone: "Phone", school: "School", password: "Password", allowedpages: "Allowed Pages", svschools: "S.V Schools", position: "Position", profilepicture: "Profile picture", coverphoto: "Cover photo", filesmedia: "Files & media", employeecode: "Employee Code", email: "Email" };
  const normalized = canon(key);
  return known[normalized] || text(key).replace(/_/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function columnForIncomingField(keys, incomingName) {
  return findKey(keys, [incomingName, labelForColumn(incomingName)]);
}

function buildWriteRow(fields = {}, rows = []) {
  const keys = allKeys(rows).filter((key) => !nonEditableColumn(key));
  const row = {};
  for (const [incomingName, rawValue] of Object.entries(fields || {})) {
    if (["allowedpages", "svschools"].includes(canon(incomingName))) continue;
    const actual = columnForIncomingField(keys, incomingName);
    if (!actual) continue;
    const value = text(rawValue);
    row[actual] = value || null;
  }
  return row;
}

function fallbackSignupRow(request, department, position) {
  return { name: request.username, password: request.password, employee_code: request.employeeCode, phone: request.phone, email: request.email, department, position };
}

function buildSignupMemberRow(requestRow = {}, { department = "", position = "" } = {}, rows = []) {
  const request = serializeSignupRequest(requestRow, true);
  const fields = { Name: request.username, Password: request.password, "Employee Code": request.employeeCode, Phone: request.phone, Email: request.email, Department: department, Position: position };
  const writeRow = buildWriteRow(fields, rows);
  const keys = allKeys(rows);
  const mappings = [
    ["Name", ["Name", "name", "username", "full_name"], request.username],
    ["Password", ["Password", "password", "passcode", "pin"], request.password],
    ["Employee Code", ["Employee Code", "employee_code", "employeeCode", "code"], request.employeeCode],
    ["Phone", ["Phone", "phone", "mobile"], request.phone],
    ["Email", ["Email", "email", "mail"], request.email],
    ["Department", ["Department", "department"], department],
    ["Position", ["Position", "position", "role"], position],
  ];
  for (const [, aliases, value] of mappings) { const actual = findKey(keys, aliases); if (actual && typeof writeRow[actual] === "undefined") writeRow[actual] = value || null; }
  return Object.keys(writeRow).length ? writeRow : fallbackSignupRow(request, department, position);
}

function serializeSignupRequest(row = {}, includePassword = false) {
  const payload = {
    id: text(valueFor(row, ["id", "ID"])), username: text(valueFor(row, ["username", "name", "Name"])), employeeCode: text(valueFor(row, ["employee_code", "employeeCode", "Employee Code", "code"])), phone: text(valueFor(row, ["phone", "Phone"])), email: text(valueFor(row, ["email", "Email"])), status: text(valueFor(row, ["status"])) || "pending", department: text(valueFor(row, ["department", "Department"])), position: text(valueFor(row, ["position", "Position"])), reviewedBy: text(valueFor(row, ["reviewed_by", "reviewedBy"])), reviewedAt: text(valueFor(row, ["reviewed_at", "reviewedAt"])), createdAt: text(valueFor(row, ["created_at", "createdAt"])) || new Date().toISOString(),
  };
  if (includePassword) payload.password = text(valueFor(row, ["password", "Password"]));
  return payload;
}

function normalizeEmail(value) { const email = text(value).toLowerCase(); return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
async function duplicateAccount({ username, email, employeeCode }, rows = null) {
  const list = Array.isArray(rows) ? rows : await teamRows(); const wantedName = token(username); const wantedEmail = normalizeEmail(email); const wantedCode = token(employeeCode);
  return list.find((row) => (!!wantedName && token(valueForLabel(row, "Name")) === wantedName) || (!!wantedEmail && normalizeEmail(valueForLabel(row, "Email")) === wantedEmail) || (!!wantedCode && token(valueForLabel(row, "Employee Code")) === wantedCode)) || null;
}

function stocktakingColumnKey(label = "") {
  return text(label).toLowerCase().replace(/&/g, " and ").replace(/%/g, " percent ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_");
}
function titleCaseLabel(value = "") { return text(value).replace(/_/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }

export async function createStocktakingSchoolColumn(displayName = "") {
  const label = text(displayName).replace(/\s+/g, " ");
  if (!label) throw httpError("School name is required.", 400);
  const columnName = stocktakingColumnKey(label);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(columnName)) throw httpError("Invalid school column name. Use letters/numbers and avoid special characters.", 400);
  try { await rpc("add_stocktaking_school_column", { column_name: columnName }); }
  catch (error) {
    const message = text(error?.message || error);
    if (/function .*add_stocktaking_school_column|Could not find the function|PGRST202|schema cache/i.test(message)) throw httpError("Supabase helper function is not installed. Run supabase_user_access_helpers.sql once, then try again.", 500);
    throw error;
  }
  clearUsersCenterReadCaches();
  return { label: titleCaseLabel(columnName), column: columnName };
}

function pageIsStocktaking(page = {}) {
  const values = [page.pageKey, page.pageName, page.routePath].map(text).filter(Boolean);
  return values.some((value) => canon(value) === "stocktaking" || /(^|\/)stocktaking(?:$|[/?#])/i.test(value));
}

async function ensureGeneratedStocktakingColumn(memberIdValue, name, rows) {
  const id = text(memberIdValue); const label = text(name) ? `${text(name)} Stock` : "";
  if (!id || !label) return null;
  const list = Array.isArray(rows) && rows.length ? rows : await teamRows();
  const target = list.find((row) => memberId(row) === id); if (!target) throw httpError("Team member was not found while preparing Stocktaking access.", 404);
  const schoolKey = findKey(allKeys(list), ["School", "school", "school_name", "Stocktaking Column", "stocktaking_column", "Done Column", "done_column"]);
  if (!schoolKey) throw httpError("Team Members table does not have a Stocktaking/School column.", 500);
  const current = text(valueForLabel(target, "School")); const desired = stocktakingColumnKey(label);
  if (canon(current) !== canon(label)) {
    await createStocktakingSchoolColumn(label);
    await updateById(teamMembersTable(), id, { [schoolKey]: label });
    clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(id);
    return { label, column: desired, changed: true };
  }
  return { label, column: desired, changed: false };
}

export async function createDepartment(name = "") {
  const clean = cleanDepartmentName(name); if (!clean) throw httpError("Department name is required.", 400);
  const [members, departments] = await Promise.all([teamRows(), departmentRows({ strict: true })]);
  const key = departmentKey(clean); const names = [...members.map((row) => cleanDepartmentName(valueForLabel(row, "Department"))).filter(Boolean), ...departments.map((row) => cleanDepartmentName(valueFor(row, ["name", "department", "department_name"]))).filter(Boolean)];
  if (names.some((value) => departmentKey(value) === key)) throw httpError("A department with this name already exists.", 409);
  const created = await insert(departmentsTable(), { name: clean }); clearUsersCenterReadCaches();
  return { id: key, name: clean, count: 0, members: [], isCustomDepartment: true, departmentRecordId: text(valueFor(created || {}, ["id", "ID"])) };
}

export async function renameDepartment(departmentId = "", name = "") {
  const oldKey = text(departmentId); const clean = cleanDepartmentName(name);
  if (!oldKey) throw httpError("Department ID is required.", 400); if (!clean) throw httpError("Department name is required.", 400); if (oldKey === departmentKey("No Department")) throw httpError("The default No Department folder cannot be renamed.", 400);
  const [members, departments] = await Promise.all([teamRows(), departmentRows({ strict: true })]); const targetKey = departmentKey(clean);
  const names = [...members.map((row) => cleanDepartmentName(valueForLabel(row, "Department"))).filter(Boolean), ...departments.map((row) => cleanDepartmentName(valueFor(row, ["name", "department", "department_name"]))).filter(Boolean)];
  if (targetKey !== oldKey && names.some((value) => departmentKey(value) === targetKey)) throw httpError("Another department already uses this name.", 409);
  const departmentColumn = findKey(allKeys(members), ["Department", "department"]); if (!departmentColumn) throw httpError("Team Members table does not have a Department column.", 500);
  const affectedIds = members.filter((row) => departmentKey(cleanDepartmentName(valueForLabel(row, "Department")) || "No Department") === oldKey).map(memberId).filter(Boolean);
  if (affectedIds.length) await updateByIds(teamMembersTable(), affectedIds, { [departmentColumn]: clean });
  const record = departments.find((row) => departmentKey(valueFor(row, ["name", "department", "department_name"])) === oldKey);
  if (record) { const id = text(valueFor(record, ["id", "ID"])); try { await updateById(departmentsTable(), id, { name: clean, updated_at: new Date().toISOString() }); } catch (error) { if (/updated_at/i.test(text(error?.message || error))) await updateById(departmentsTable(), id, { name: clean }); else throw error; } }
  else if (!affectedIds.length) throw httpError("Department was not found.", 404);
  clearUsersCenterReadCaches(); affectedIds.forEach(clearDirectSessionAccountCaches);
  return { id: targetKey, name: clean, count: affectedIds.length, members: [], isCustomDepartment: !!record, departmentRecordId: text(valueFor(record || {}, ["id", "ID"])) };
}

export async function deleteDepartment(departmentId = "") {
  const oldKey = text(departmentId); if (!oldKey) throw httpError("Department ID is required.", 400); if (oldKey === departmentKey("No Department")) throw httpError("The default No Department folder cannot be deleted.", 400);
  const [members, departments] = await Promise.all([teamRows(), departmentRows({ strict: true })]); const departmentColumn = findKey(allKeys(members), ["Department", "department"]); if (!departmentColumn) throw httpError("Team Members table does not have a Department column.", 500);
  const affectedIds = members.filter((row) => departmentKey(cleanDepartmentName(valueForLabel(row, "Department")) || "No Department") === oldKey).map(memberId).filter(Boolean);
  if (affectedIds.length) await updateByIds(teamMembersTable(), affectedIds, { [departmentColumn]: null });
  const record = departments.find((row) => departmentKey(valueFor(row, ["name", "department", "department_name"])) === oldKey);
  if (record) await deleteById(departmentsTable(), valueFor(record, ["id", "ID"])); else if (!affectedIds.length) throw httpError("Department was not found.", 404);
  clearUsersCenterReadCaches(); affectedIds.forEach(clearDirectSessionAccountCaches);
  return { id: oldKey, movedMembers: affectedIds.length, name: record ? cleanDepartmentName(valueFor(record, ["name", "department", "department_name"])) : oldKey };
}

async function resolveDepartmentName(departmentIdValue = "") {
  const targetKey = text(departmentIdValue); if (!targetKey || targetKey === departmentKey("No Department")) return "";
  const [members, departments] = await Promise.all([teamRows(), departmentRows()]); const names = [...departments.map((row) => cleanDepartmentName(valueFor(row, ["name", "department", "department_name"]))).filter(Boolean), ...members.map((row) => cleanDepartmentName(valueForLabel(row, "Department"))).filter(Boolean)];
  const hit = names.find((name) => departmentKey(name) === targetKey); if (!hit) throw httpError("Target department was not found.", 404); return hit;
}

export async function moveMember(memberIdValue = "", departmentIdValue = "") {
  const id = text(memberIdValue); if (!id) throw httpError("Missing team member ID.", 400);
  const rows = await teamRows(); const departmentColumn = findKey(allKeys(rows), ["Department", "department"]); if (!departmentColumn) throw httpError("Team Members table does not have a Department column.", 500);
  const target = rows.find((row) => memberId(row) === id) || await selectById(teamMembersTable(), id); if (!target) throw httpError("Team member was not found.", 404);
  const targetName = await resolveDepartmentName(departmentIdValue); await updateById(teamMembersTable(), id, { [departmentColumn]: targetName || null }); clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(id);
  const detail = await usersCenterMemberDetails(id); return { member: detail.member, departmentName: targetName || "No Department" };
}

function normalizePageEntries(entries = []) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({ pageId: text(entry?.pageId || entry?.page_id || entry?.id), pageKey: text(entry?.pageKey || entry?.page_key), accessLevel: normalizeAccessLevel(entry?.accessLevel || entry?.access_level || "edit"), isEnabled: bool(entry?.isEnabled ?? entry?.is_enabled ?? entry?.enabled, false) })).filter((entry) => entry.pageId || entry.pageKey);
}

export async function savePageAccess(memberIdValue = "", entries = [], { grantedBy = "Admin", suppliedRows = null } = {}) {
  const id = text(memberIdValue); if (!id) throw httpError("Missing team member ID.", 400);
  const rows = Array.isArray(suppliedRows) && suppliedRows.length ? suppliedRows : await teamRows(); const target = rows.find((row) => memberId(row) === id) || null; if (!target) throw httpError("Team member was not found.", 404);
  const pages = await usersCenterAppPages({ assignableOnly: true }); const pagesById = new Map(pages.map((page) => [text(page.pageId || page.id), page])); const pagesByKey = new Map(pages.map((page) => [text(page.pageKey), page]));
  const cleanEntries = normalizePageEntries(entries); let existing = []; try { existing = await select("team_member_page_access", { select: "*", team_member_id: `eq.${id}`, limit: "1000" }); } catch { existing = []; }
  const existingByPageId = new Map((existing || []).map((row) => [text(valueFor(row, ["page_id", "pageId"])), row])); const incoming = new Map();
  for (const entry of cleanEntries) { const page = (entry.pageId && pagesById.get(entry.pageId)) || (entry.pageKey && pagesByKey.get(entry.pageKey)); if (!page) continue; const pageId = text(page.pageId || page.id); if (pageId) incoming.set(pageId, { page, entry }); }
  if (cleanEntries.length && !incoming.size) throw httpError("No valid application pages were received. Reload the page and try again.", 400);
  const writeRows = [];
  for (const [pageId, { entry }] of incoming.entries()) { if (!entry.isEnabled) continue; const previous = existingByPageId.get(pageId) || {}; writeRows.push({ team_member_id: id, team_member_name: memberName(target) || null, page_id: pageIdValue(pageId), access_level: normalizeAccessLevel(entry.accessLevel), is_enabled: true, granted_by: text(grantedBy) || text(valueFor(previous, ["granted_by", "grantedBy"])) || null, notes: valueFor(previous, ["notes"]) ?? null }); }
  for (const previous of existing || []) { const pageId = text(valueFor(previous, ["page_id", "pageId"])); if (!pageId || incoming.has(pageId) || !bool(valueFor(previous, ["is_enabled", "isEnabled"]), false)) continue; writeRows.push({ team_member_id: id, team_member_name: text(valueFor(previous, ["team_member_name", "teamMemberName"])) || memberName(target) || null, page_id: pageIdValue(pageId), access_level: normalizeAccessLevel(valueFor(previous, ["access_level", "accessLevel"]) || "edit"), is_enabled: true, granted_by: text(valueFor(previous, ["granted_by", "grantedBy"])) || text(grantedBy) || null, notes: valueFor(previous, ["notes"]) ?? null }); }
  if (Array.from(incoming.values()).some(({ page, entry }) => entry.isEnabled && pageIsStocktaking(page))) await ensureGeneratedStocktakingColumn(id, memberName(target), rows);
  await supabaseRequest(`/team_member_page_access?team_member_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); if (writeRows.length) await insertMany("team_member_page_access", writeRows);
  clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(id);
  const payload = await usersCenterPageAccess(id); const enabled = payload.pages.filter((row) => row.isEnabled); return { ...payload, summary: { allowedPages: enabled.map((row) => row.pageName).filter(Boolean), accessCount: enabled.length, adminCount: enabled.filter((row) => row.accessLevel === "admin").length } };
}

export async function saveSvAccess(memberIdValue = "", members = [], { suppliedRows = null } = {}) {
  const id = text(memberIdValue); if (!id) throw httpError("Missing team member ID.", 400); const rows = Array.isArray(suppliedRows) && suppliedRows.length ? suppliedRows : await teamRows(); const target = rows.find((row) => memberId(row) === id); if (!target) throw httpError("Team member was not found.", 404);
  const requested = new Set((Array.isArray(members) ? members : []).map((item) => text(item?.memberId || item?.id || item?.visible_team_member_id)).filter(Boolean)); const enabledRows = rows.filter((row) => requested.has(memberId(row)));
  try { await supabaseRequest(`/${encodeURIComponent(svAccessTable())}?team_member_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=representation" } }); if (enabledRows.length) await insertMany(svAccessTable(), enabledRows.map((row) => ({ team_member_id: id, visible_team_member_id: memberId(row), visible_team_member_name: memberName(row) || null }))); }
  catch (error) { if (missingTable(error, svAccessTable())) throw httpError("S.V Schools table is not installed. Run supabase_team_member_sv_schools.sql once, then try again.", 500); throw error; }
  const keys = allKeys(rows); const patch = {}; const ids = enabledRows.map(memberId).filter(Boolean); const names = enabledRows.map(memberName).filter(Boolean);
  const idKey = findKey(keys, ["sv_school_member_ids", "sv school member ids"]); const nameKey = findKey(keys, ["sv_school_member_names", "sv school member names"]); const svKey = findKey(keys, ["sv_schools", "S.V Schools", "SV Schools"]); const unmatchedKey = findKey(keys, ["sv_schools_unmatched", "sv schools unmatched"]); const updatedAtKey = findKey(keys, ["updated_at", "Updated time"]);
  if (idKey) patch[idKey] = ids.join(", ") || null; if (nameKey) patch[nameKey] = names.join(", ") || null; if (svKey) patch[svKey] = names.join(", ") || null; if (unmatchedKey) patch[unmatchedKey] = null; if (updatedAtKey) patch[updatedAtKey] = new Date().toISOString();
  if (Object.keys(patch).length) await updateById(teamMembersTable(), id, patch).catch(() => null); clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(id); return await usersCenterSvAccess(id);
}

export async function createMember({ fields = {}, pageAccess = [], svAccess = [], grantedBy = "Admin" } = {}) {
  const rows = await teamRows(); const writeRow = buildWriteRow(fields, rows); const name = text(valueForLabel(writeRow, "Name")); if (!name) throw httpError("Name is required.", 400); if (!Object.keys(writeRow).length) throw httpError("No valid fields were provided.", 400);
  const created = await insert(teamMembersTable(), writeRow); const id = memberId(created || {}); const allRows = [...rows, created || writeRow]; const writes = [];
  if (id && Array.isArray(pageAccess) && pageAccess.length) writes.push(savePageAccess(id, pageAccess, { grantedBy, suppliedRows: allRows })); if (id && Array.isArray(svAccess) && svAccess.length) writes.push(saveSvAccess(id, svAccess, { suppliedRows: allRows })); if (writes.length) await Promise.all(writes);
  clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(id); const detail = id ? await usersCenterMemberDetails(id) : { member: { id, name } }; return detail.member;
}

export async function updateMember(memberIdValue = "", fields = {}) {
  const id = text(memberIdValue); if (!id) throw httpError("Missing team member ID.", 400); const rows = await teamRows(); const existing = rows.find((row) => memberId(row) === id) || await selectById(teamMembersTable(), id); if (!existing) throw httpError("Team member was not found.", 404);
  const writeRow = buildWriteRow(fields, rows); if (!Object.keys(writeRow).length) throw httpError("No valid fields were provided.", 400);
  const oldName = text(valueForLabel(existing, "Name")); const oldPassword = text(valueForLabel(existing, "Password")); const updatesName = Object.keys(writeRow).some((key) => canon(key) === "name"); const updatesPassword = Object.keys(writeRow).some((key) => canon(key) === "password"); const updated = await updateById(teamMembersTable(), id, writeRow);
  const newName = updatesName ? (text(valueForLabel(updated || writeRow, "Name")) || oldName) : oldName; const newPassword = updatesPassword ? text(valueForLabel(updated || writeRow, "Password")) : oldPassword;
  if ((updatesName && newName !== oldName) || (updatesPassword && newPassword !== oldPassword)) { try { await setDirectUserAuthRevokedAt(id, Date.now()); } catch {} }
  clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(id); return (await usersCenterMemberDetails(id)).member;
}

export async function deleteMember(memberIdValue = "") {
  const id = text(memberIdValue); if (!id) throw httpError("Missing team member ID.", 400); const member = await selectById(teamMembersTable(), id); if (!member) throw httpError("Team member was not found.", 404);
  await Promise.allSettled([
    supabaseRequest(`/team_member_page_access?team_member_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
    supabaseRequest(`/${encodeURIComponent(svAccessTable())}?team_member_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
    supabaseRequest(`/${encodeURIComponent(svAccessTable())}?visible_team_member_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=representation" } }),
  ]);
  const deleted = await deleteById(teamMembersTable(), id); try { await setDirectUserAuthRevokedAt(id, Date.now()); } catch {} clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(id); return { id, name: memberName(member), deleted: deleted || member };
}

export async function approveSignupRequest(requestIdValue = "", { department = "", position = "", reviewedBy = "Admin" } = {}) {
  const requestId = text(requestIdValue); const cleanDepartment = cleanDepartmentName(department); const cleanPosition = text(position).replace(/\s+/g, " "); if (!requestId) throw httpError("Missing sign up request ID.", 400); if (!cleanDepartment) throw httpError("Department is required.", 400); if (!cleanPosition) throw httpError("Position is required.", 400);
  const requestRow = await selectById(signupRequestsTable(), requestId); if (!requestRow) throw httpError("Sign up request was not found.", 404); const request = serializeSignupRequest(requestRow, true); if (token(request.status) !== "pending") throw httpError(`This request is already ${request.status}.`, 409);
  const rows = await teamRows(); if (await duplicateAccount(request, rows)) throw httpError("A team member with this username, email, or employee code already exists.", 409);
  const writeRow = buildSignupMemberRow(requestRow, { department: cleanDepartment, position: cleanPosition }, rows); const created = await insert(teamMembersTable(), writeRow); const createdId = memberId(created || {});
  const updated = await updateById(signupRequestsTable(), requestId, { status: "approved", department: cleanDepartment, position: cleanPosition, reviewed_by: text(reviewedBy) || "Admin", reviewed_at: new Date().toISOString(), approved_team_member_id: createdId || null });
  clearUsersCenterReadCaches(); clearDirectSessionAccountCaches(createdId); let emailWarning = ""; try { await sendUsersCenterSignupStatusEmail({ to: request.email, name: request.username, status: "approved", department: cleanDepartment, position: cleanPosition }); } catch (error) { emailWarning = error?.message || "Approved, but email could not be sent."; }
  const detail = createdId ? await usersCenterMemberDetails(createdId).catch(() => null) : null; return { request: serializeSignupRequest(updated), member: detail?.member || { id: createdId, name: request.username }, emailWarning };
}

export async function rejectSignupRequest(requestIdValue = "", { reviewedBy = "Admin" } = {}) {
  const requestId = text(requestIdValue); if (!requestId) throw httpError("Missing sign up request ID.", 400); const requestRow = await selectById(signupRequestsTable(), requestId); if (!requestRow) throw httpError("Sign up request was not found.", 404); const request = serializeSignupRequest(requestRow, true); if (token(request.status) !== "pending") throw httpError(`This request is already ${request.status}.`, 409);
  const updated = await updateById(signupRequestsTable(), requestId, { status: "rejected", reviewed_by: text(reviewedBy) || "Admin", reviewed_at: new Date().toISOString() }); clearUsersCenterReadCaches(); let emailWarning = ""; try { await sendUsersCenterSignupStatusEmail({ to: request.email, name: request.username, status: "rejected" }); } catch (error) { emailWarning = error?.message || "Rejected, but email could not be sent."; }
  return { request: serializeSignupRequest(updated), emailWarning };
}

export const __usersCenterMutationsTest = { canon, departmentKey, buildWriteRow, stocktakingColumnKey };
