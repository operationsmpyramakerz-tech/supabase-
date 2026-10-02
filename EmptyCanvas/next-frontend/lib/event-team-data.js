import "server-only";

import { deleteById, insert, select, selectById, updateById, uploadStorageObject } from "./supabase-rest";
import { listEvents } from "./events-data";

const TEAM_ROLES = new Set(["instructor", "usher", "organizer"]);
const ATTENDANCE_STATUSES = new Set(["planned", "present", "late", "absent", "excused"]);

function text(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function longText(value, maxLength = 3000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["true", "1", "yes", "y", "on", "enabled"].includes(raw)) return true;
  if (["false", "0", "no", "n", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function uuid(value) {
  const raw = text(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : "";
}

function email(value) {
  const raw = text(value, 220).toLowerCase();
  return raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : "";
}

function safeUrl(value, maxLength = 2000) {
  const raw = text(value, maxLength);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function normalizeRole(value) {
  const raw = text(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  return TEAM_ROLES.has(raw) ? raw : "instructor";
}

function normalizeAttendanceStatus(value) {
  const raw = text(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  return ATTENDANCE_STATUSES.has(raw) ? raw : "planned";
}

function teamTable() {
  return text(process.env.SUPABASE_EVENT_TEAM_TABLE, 120) || "event_team_members";
}

function attendanceTable() {
  return text(process.env.SUPABASE_EVENT_TEAM_ATTENDANCE_TABLE, 120) || "event_team_attendance";
}

function memberIdFromAccount(account = {}) {
  return text(account?.teamMemberId || account?.userSupabaseId || account?.id, 120) || null;
}

function serializeMember(row = {}) {
  return {
    id: String(row?.id || ""),
    role: normalizeRole(row?.role),
    name: text(row?.name, 180),
    phone: text(row?.phone, 60),
    email: text(row?.email, 220),
    governorate: text(row?.governorate, 120),
    instapay: text(row?.instapay, 120),
    wallet: text(row?.wallet, 120),
    station: text(row?.station, 180),
    idPhotoUrl: safeUrl(row?.id_photo_url || row?.idPhotoUrl),
    notes: longText(row?.notes, 3000),
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function serializeAttendance(row = {}) {
  return {
    id: String(row?.id || ""),
    eventId: String(row?.event_id || row?.eventId || ""),
    memberId: String(row?.member_id || row?.memberId || ""),
    attendanceDate: row?.attendance_date || row?.attendanceDate || null,
    status: normalizeAttendanceStatus(row?.status),
    checkInTime: row?.check_in_time || row?.checkInTime || null,
    checkOutTime: row?.check_out_time || row?.checkOutTime || null,
    station: text(row?.station, 180),
    notes: longText(row?.notes, 3000),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function memberWriteRow(body = {}, account = {}) {
  const name = text(body?.name, 180);
  if (!name) {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }

  const rawEmail = text(body?.email, 220);
  const normalizedEmail = email(rawEmail);
  if (rawEmail && !normalizedEmail) {
    const error = new Error("Enter a valid email address.");
    error.status = 400;
    throw error;
  }

  const rawIdUrl = text(body?.idPhotoUrl || body?.id_photo_url, 2000);
  const idPhotoUrl = safeUrl(rawIdUrl);
  if (rawIdUrl && !idPhotoUrl) {
    const error = new Error("ID photo URL must start with http:// or https://.");
    error.status = 400;
    throw error;
  }

  return {
    role: normalizeRole(body?.role),
    name,
    phone: text(body?.phone, 60) || null,
    email: normalizedEmail || null,
    governorate: text(body?.governorate, 120) || null,
    instapay: text(body?.instapay, 120) || null,
    wallet: text(body?.wallet, 120) || null,
    station: text(body?.station, 180) || null,
    id_photo_url: idPhotoUrl || null,
    notes: longText(body?.notes, 3000) || null,
    is_active: bool(body?.isActive ?? body?.is_active, true),
    updated_by_user_id: memberIdFromAccount(account),
  };
}

function attendanceWriteRow(body = {}, account = {}) {
  const eventId = uuid(body?.eventId || body?.event_id);
  const memberId = uuid(body?.memberId || body?.member_id);
  if (!eventId || !memberId) {
    const error = new Error("Event and team member are required.");
    error.status = 400;
    throw error;
  }
  const date = text(body?.attendanceDate || body?.attendance_date, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error("Attendance date is required.");
    error.status = 400;
    throw error;
  }
  const timeValue = (value) => {
    const raw = text(value, 16);
    return /^\d{2}:\d{2}(?::\d{2})?$/.test(raw) ? raw : null;
  };

  return {
    event_id: eventId,
    member_id: memberId,
    attendance_date: date,
    status: normalizeAttendanceStatus(body?.status),
    check_in_time: timeValue(body?.checkInTime || body?.check_in_time),
    check_out_time: timeValue(body?.checkOutTime || body?.check_out_time),
    station: text(body?.station, 180) || null,
    notes: longText(body?.notes, 3000) || null,
    updated_by_user_id: memberIdFromAccount(account),
  };
}

export async function listEventTeamMembers() {
  const rows = await select(teamTable(), {
    select: "*",
    order: "name.asc",
    limit: "5000",
  }, { profileName: "events.team-members" });
  return (Array.isArray(rows) ? rows : []).map(serializeMember);
}

export async function listEventTeamAttendance() {
  const rows = await select(attendanceTable(), {
    select: "*",
    order: "attendance_date.desc,created_at.desc",
    limit: "5000",
  }, { profileName: "events.team-attendance" });
  return (Array.isArray(rows) ? rows : []).map(serializeAttendance);
}

export async function loadEventTeamPageData(account = null) {
  const [members, attendance, events] = await Promise.all([
    listEventTeamMembers(),
    listEventTeamAttendance(),
    listEvents({ includeArchived: true }),
  ]);
  return { members, attendance, events, account };
}

export async function createEventTeamMember(body = {}, account = {}) {
  const payload = memberWriteRow(body, account);
  payload.created_by_user_id = memberIdFromAccount(account);
  const row = await insert(teamTable(), payload);
  return serializeMember(row || payload);
}

export async function updateEventTeamMember(id, body = {}, account = {}) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid team member ID.");
    error.status = 400;
    throw error;
  }
  const existing = await selectById(teamTable(), cleanId);
  if (!existing) {
    const error = new Error("Team member was not found.");
    error.status = 404;
    throw error;
  }
  const row = await updateById(teamTable(), cleanId, memberWriteRow(body, account));
  return serializeMember(row || existing);
}

export async function deleteEventTeamMember(id) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid team member ID.");
    error.status = 400;
    throw error;
  }
  const row = await deleteById(teamTable(), cleanId);
  if (!row) {
    const error = new Error("Team member was not found.");
    error.status = 404;
    throw error;
  }
  return serializeMember(row);
}

export async function createEventTeamAttendance(body = {}, account = {}) {
  const payload = attendanceWriteRow(body, account);
  payload.created_by_user_id = memberIdFromAccount(account);
  const row = await insert(attendanceTable(), payload);
  return serializeAttendance(row || payload);
}

export async function updateEventTeamAttendance(id, body = {}, account = {}) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid attendance record ID.");
    error.status = 400;
    throw error;
  }
  const existing = await selectById(attendanceTable(), cleanId);
  if (!existing) {
    const error = new Error("Attendance record was not found.");
    error.status = 404;
    throw error;
  }
  const row = await updateById(attendanceTable(), cleanId, attendanceWriteRow(body, account));
  return serializeAttendance(row || existing);
}

export async function deleteEventTeamAttendance(id) {
  const cleanId = uuid(id);
  if (!cleanId) {
    const error = new Error("Invalid attendance record ID.");
    error.status = 400;
    throw error;
  }
  const row = await deleteById(attendanceTable(), cleanId);
  if (!row) {
    const error = new Error("Attendance record was not found.");
    error.status = 404;
    throw error;
  }
  return serializeAttendance(row);
}

function parseDataUrl(value = "") {
  const raw = String(value || "");
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) {
    const error = new Error("Invalid image data.");
    error.status = 400;
    throw error;
  }
  return { mime: match[1].toLowerCase(), buffer: Buffer.from(match[2], "base64") };
}

function cleanFilename(value = "") {
  const raw = text(value, 180) || "id-photo";
  return raw
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "id-photo";
}

export async function uploadEventTeamIdPhoto({ dataUrl = "", fileName = "" } = {}) {
  const { mime, buffer } = parseDataUrl(dataUrl);
  if (!/^image\/(png|jpeg|webp)$/i.test(mime)) {
    const error = new Error("ID photos must be PNG, JPG, or WEBP images.");
    error.status = 400;
    throw error;
  }
  if (buffer.length > 8 * 1024 * 1024) {
    const error = new Error("ID photo must be 8 MB or less.");
    error.status = 413;
    throw error;
  }
  const safeName = cleanFilename(fileName);
  const objectPath = `events/team/ids/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`;
  const uploaded = await uploadStorageObject(objectPath, buffer, { contentType: mime, upsert: false });
  if (!uploaded?.publicUrl) throw new Error("Supabase Storage did not return a public ID photo URL.");
  return { url: uploaded.publicUrl };
}

export function eventTeamDataError(error) {
  const raw = String(error?.message || "");
  if (/event_team_members|event_team_attendance|relation .* does not exist|Could not find the table|PGRST205|42P01|schema cache/i.test(raw)) {
    return "Event Team tables are not installed yet. Run supabase_event_team.sql in Supabase first.";
  }
  if (/duplicate key|23505/i.test(raw)) {
    return "This attendance record already exists for the selected person, event, and date.";
  }
  return raw || "Event Team request failed.";
}

export const __eventTeamDataTest = {
  normalizeRole,
  normalizeAttendanceStatus,
  serializeMember,
  serializeAttendance,
};
