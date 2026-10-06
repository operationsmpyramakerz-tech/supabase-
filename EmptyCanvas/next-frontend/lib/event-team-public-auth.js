import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { insert, select, selectById, updateById } from "./supabase-rest";
import { createEventTeamMember, deleteEventTeamMember } from "./event-team-data";

const PUBLIC_ROLES = new Set(["instructor", "usher", "organizer"]);
const SESSION_COOKIE = "event_team_public_session_v1";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const ACCOUNT_TABLE = "event_team_public_accounts";

function text(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeRole(value) {
  const raw = text(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  return PUBLIC_ROLES.has(raw) ? raw : "";
}

export function normalizePublicNationalId(value) {
  return String(value ?? "").replace(/\D+/g, "").slice(0, 30);
}

function publicAccountTable() {
  return text(process.env.SUPABASE_EVENT_TEAM_PUBLIC_ACCOUNTS_TABLE, 120) || ACCOUNT_TABLE;
}

function teamTable() {
  return text(process.env.SUPABASE_EVENT_TEAM_TABLE, 120) || "event_team_members";
}

function sessionSecret() {
  const raw = String(
    process.env.EVENT_TEAM_PUBLIC_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SESSION_SECRET ||
    "",
  ).trim();
  if (!raw) {
    const error = new Error("Public Event Team session secret is not configured.");
    error.status = 500;
    throw error;
  }
  return createHash("sha256").update(raw).digest();
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function signatureFor(payloadPart) {
  return createHmac("sha256", sessionSecret()).update(payloadPart).digest("base64url");
}

export function createPublicEventTeamSession(account = {}) {
  const payload = encodeJson({
    aid: text(account?.id, 120),
    mid: text(account?.member_id || account?.memberId, 120),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
  return `${payload}.${signatureFor(payload)}`;
}

export function verifyPublicEventTeamSession(token) {
  const raw = text(token, 6000);
  const [payloadPart, signaturePart, extra] = raw.split(".");
  if (!payloadPart || !signaturePart || extra) return null;

  const expected = Buffer.from(signatureFor(payloadPart));
  const received = Buffer.from(signaturePart);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  const payload = decodeJson(payloadPart);
  const accountId = text(payload?.aid, 120);
  const memberId = text(payload?.mid, 120);
  const exp = Number(payload?.exp || 0);
  if (!accountId || !memberId || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  return { accountId, memberId, exp };
}

export const publicEventTeamSessionCookie = Object.freeze({
  name: SESSION_COOKIE,
  maxAge: SESSION_TTL_SECONDS,
});

function passwordHash(password) {
  const raw = String(password ?? "");
  if (raw.length < 6 || raw.length > 128) {
    const error = new Error("Password must be between 6 and 128 characters.");
    error.status = 400;
    throw error;
  }
  const salt = randomBytes(16);
  const digest = scryptSync(raw, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function passwordMatches(password, encoded) {
  const [scheme, saltPart, hashPart, extra] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart || extra) return false;
  try {
    const expected = Buffer.from(hashPart, "base64url");
    const actual = scryptSync(String(password ?? ""), Buffer.from(saltPart, "base64url"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function accountByNationalId(nationalId) {
  const rows = await select(publicAccountTable(), {
    select: "*",
    national_id: `eq.${nationalId}`,
    limit: "1",
  }, { profileName: "events.team-public-account-by-id" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function accountById(id) {
  return await selectById(publicAccountTable(), id, { profileName: "events.team-public-account" });
}

function profileFrom(member = {}, account = {}) {
  return {
    id: text(member?.id, 120),
    role: normalizeRole(member?.role),
    name: text(member?.name, 180),
    nationalId: normalizePublicNationalId(account?.national_id || member?.national_id),
    phone: text(member?.phone, 60),
    email: text(member?.email, 220),
    governorate: text(member?.governorate, 120),
    instapay: text(member?.instapay, 120),
    wallet: text(member?.wallet, 120),
    station: text(member?.station, 180),
    idPhotoUrl: text(member?.id_photo_url || member?.idPhotoUrl, 2000),
    isActive: member?.is_active !== false && member?.isActive !== false,
    createdAt: member?.created_at || member?.createdAt || null,
  };
}

function duplicateError(message = "") {
  return /duplicate key|23505|unique constraint/i.test(String(message || ""));
}

function publicError(message, status = 400, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

export async function registerPublicEventTeamMember(body = {}) {
  const role = normalizeRole(body?.role);
  if (!role) throw publicError("This team registration link is not valid.", 400, "INVALID_ROLE");

  const nationalId = normalizePublicNationalId(body?.nationalId || body?.national_id);
  if (nationalId.length < 6) throw publicError("Enter a valid ID number.", 400, "INVALID_ID");

  const name = text(body?.name, 180);
  if (!name) throw publicError("Full name is required.");

  const password = String(body?.password ?? "");
  const existing = await accountByNationalId(nationalId);
  if (existing) throw publicError("This ID number is already registered. Sign in to view your data.", 409, "ALREADY_REGISTERED");

  let member = null;
  try {
    member = await createEventTeamMember({
      role,
      name,
      nationalId,
      phone: body?.phone,
      email: body?.email,
      governorate: body?.governorate,
      instapay: body?.instapay,
      wallet: body?.wallet,
      station: role === "instructor" ? body?.station : "",
      idPhotoUrl: body?.idPhotoUrl,
      notes: "",
      isActive: true,
    }, {});

    const account = await insert(publicAccountTable(), {
      member_id: member.id,
      national_id: nationalId,
      password_hash: passwordHash(password),
      last_login_at: new Date().toISOString(),
    });

    return {
      account,
      member,
      profile: profileFrom(member, account),
    };
  } catch (error) {
    if (member?.id) {
      await deleteEventTeamMember(member.id).catch(() => null);
    }
    if (duplicateError(error?.message)) {
      throw publicError("This ID number is already registered. Sign in to view your data.", 409, "ALREADY_REGISTERED");
    }
    throw error;
  }
}

export async function loginPublicEventTeamMember(body = {}) {
  const nationalId = normalizePublicNationalId(body?.nationalId || body?.national_id);
  const password = String(body?.password ?? "");
  if (!nationalId || !password) throw publicError("ID number and password are required.");

  const account = await accountByNationalId(nationalId);
  if (!account || !passwordMatches(password, account?.password_hash)) {
    throw publicError("The ID number or password is incorrect.", 401, "INVALID_LOGIN");
  }

  const member = await selectById(teamTable(), account.member_id, { profileName: "events.team-public-member-login" });
  if (!member) throw publicError("Your Event Team record could not be found. Contact the event organizer.", 404, "MEMBER_NOT_FOUND");
  if (member?.is_active === false) throw publicError("This Event Team registration is inactive. Contact the event organizer.", 403, "INACTIVE_MEMBER");

  await updateById(publicAccountTable(), account.id, { last_login_at: new Date().toISOString() }).catch(() => null);
  return { account, member, profile: profileFrom(member, account) };
}

export async function profileFromPublicEventTeamSession(token) {
  const session = verifyPublicEventTeamSession(token);
  if (!session) return null;

  const account = await accountById(session.accountId);
  if (!account || text(account?.member_id) !== session.memberId) return null;
  const member = await selectById(teamTable(), session.memberId, { profileName: "events.team-public-member-profile" });
  if (!member) return null;
  return { account, member, profile: profileFrom(member, account) };
}

export function eventTeamPublicAuthError(error) {
  const raw = String(error?.message || "");
  if (/event_team_public_accounts|national_id|schema cache|PGRST204|PGRST205|42P01|42703/i.test(raw)) {
    return "Public Event Team registration is not installed yet. Run supabase_event_team_public_portal.sql in Supabase.";
  }
  return raw || "Public Event Team request failed.";
}

export const __eventTeamPublicAuthTest = {
  normalizeRole,
  passwordMatches,
  profileFrom,
};
