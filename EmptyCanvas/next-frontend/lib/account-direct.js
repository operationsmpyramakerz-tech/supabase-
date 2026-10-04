import "server-only";

import crypto from "node:crypto";
import {
  createSignedUploadUrl,
  deleteStorageObjects,
  getSupabaseConfig,
  selectById,
  storagePublicUrl,
  updateById,
} from "./supabase-rest";
import { clearDirectSessionAccountCaches } from "./direct-session-account";
import { clearUsersCenterReadCaches } from "./users-center-data";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") {
    return text(value.name || value.value || value.label || value.title || value.email || value.url);
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canon(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function valueFor(row = {}, aliases = []) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, alias)) return row[alias];
  }
  const wanted = new Set(aliases.map(canon).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(canon(key))) return value;
  }
  return null;
}

function findKey(row = {}, aliases = []) {
  const wanted = new Set(aliases.map(canon).filter(Boolean));
  return Object.keys(row || {}).find((key) => wanted.has(canon(key))) || "";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function memberId(account = {}) {
  return text(account?.teamMemberId || account?.userSupabaseId || account?.userId || account?.id);
}

function httpError(message, status = 400) {
  const error = new Error(message || "Account request failed.");
  error.status = status;
  return error;
}

function passwordValue(row = {}) {
  return valueFor(row, ["Password", "password", "passcode", "pin"]);
}

function accountFieldKey(row = {}, label = "") {
  const key = canon(label);
  const aliases = [label];
  if (key === "name") aliases.push("Name", "name", "full_name", "username");
  if (key === "department") aliases.push("Department", "department");
  if (key === "position") aliases.push("Position", "position", "role");
  if (key === "phone") aliases.push("Phone", "phone", "mobile");
  if (key === "email") aliases.push("Email", "email", "mail");
  if (key === "employeecode") aliases.push("Employee Code", "employee_code", "employeeCode", "code");
  if (key === "password") aliases.push("Password", "password", "passcode", "pin");
  return findKey(row, aliases);
}

function profilePictureKey(row = {}) {
  const direct = findKey(row, [
    "Profile picture",
    "Profile Picture",
    "Profile Photo",
    "Profile photo",
    "profile_picture",
    "profile_picture_url",
    "profile_photo",
    "profile_photo_url",
    "photo_url",
    "avatar_url",
    "picture_url",
    "image_url",
    "photo",
    "avatar",
    "picture",
    "image",
  ]);
  if (direct) return direct;

  return Object.keys(row || {}).find((key) => {
    const normalized = canon(key);
    if (!normalized || ["filesmedia", "allowedpages", "password"].includes(normalized)) return false;
    const hasProfileWord = normalized.includes("profile") || normalized.includes("avatar");
    const hasImageWord = normalized.includes("picture") || normalized.includes("photo") || normalized.includes("image") || normalized.includes("pic");
    return (hasProfileWord && hasImageWord) || ["photo", "avatar", "image"].includes(normalized);
  }) || "";
}


function coercePatchValue(existingValue, nextValue) {
  if (nextValue === null || typeof nextValue === "undefined") return null;
  if (typeof existingValue === "number") {
    const number = Number(String(nextValue).replace(/,/g, ""));
    return Number.isFinite(number) ? number : nextValue;
  }
  if (typeof existingValue === "boolean") {
    const raw = String(nextValue ?? "").trim().toLowerCase();
    return ["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw);
  }
  return String(nextValue ?? "").trim() || null;
}

async function currentMember(account = {}) {
  const id = memberId(account);
  if (!id) throw httpError("The signed-in Team Member ID is unavailable.", 503);
  const row = await selectById(teamMembersTable(), id, { profileName: "account.member" });
  if (!row) throw httpError("User not found.", 404);
  return { id, row };
}

export async function verifyAccountPassword(account = {}, currentPassword = "") {
  const provided = text(currentPassword);
  if (!provided) throw httpError("Current password is required.", 400);

  const { id, row } = await currentMember(account);
  const stored = passwordValue(row);
  if (stored === null || typeof stored === "undefined" || !text(stored)) {
    throw httpError("No password set for this account.", 400);
  }
  if (String(stored) !== provided) throw httpError("invalid password", 401);
  return { id, row };
}

function clearAccountCaches(id = "") {
  clearDirectSessionAccountCaches(id);
  try { clearUsersCenterReadCaches(); } catch {}
}

export async function updateAccountDirect(account = {}, body = {}) {
  const { id, row } = await verifyAccountPassword(account, body?.currentPassword);
  const patch = {};

  const setPatch = (label, rawValue, { required = false } = {}) => {
    if (typeof rawValue === "undefined") return;
    const value = text(rawValue);
    if (required && !value) throw httpError(`${label} cannot be empty.`, 400);
    const key = accountFieldKey(row, label);
    if (!key) return;
    patch[key] = coercePatchValue(row?.[key], value || null);
  };

  setPatch("Phone", body?.phone);
  setPatch("Email", body?.email);
  setPatch("Department", body?.department);
  setPatch("Position", body?.position);
  setPatch("Employee Code", body?.employeeCode);
  setPatch("Name", body?.name, { required: true });

  if (typeof body?.password !== "undefined") {
    const nextPassword = text(body.password);
    if (!nextPassword) throw httpError("Password cannot be empty.", 400);
    const key = accountFieldKey(row, "Password");
    if (key) patch[key] = coercePatchValue(row?.[key], nextPassword);
  }

  if (!Object.keys(patch).length) throw httpError("No valid fields to update.", 400);

  const updated = await updateById(teamMembersTable(), id, patch);
  clearAccountCaches(id);
  return { success: true, ok: true, memberId: id, row: updated || { ...row, ...patch }, source: "supabase-next" };
}

function normalizeImageKind(value = "") {
  const kind = text(value).toLowerCase();
  if (["profile", "profile-picture", "profile_picture"].includes(kind)) return "profile";
  throw httpError("Only profile picture updates are supported.", 400);
}

function imageColumnKey(row = {}, kind = "") {
  normalizeImageKind(kind);
  return profilePictureKey(row);
}

function imageFolder(kind = "") {
  normalizeImageKind(kind);
  return "profile-pictures";
}

function safeFilename(value = "") {
  return (text(value) || "image.webp").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "image.webp";
}

function ownedImagePath(pathValue = "", kind = "", id = "") {
  const path = text(pathValue).replace(/^\/+/, "");
  const prefix = `team-members/${imageFolder(kind)}/${text(id)}/`;
  if (!path || !prefix || !path.startsWith(prefix)) throw httpError("The uploaded image path is invalid.", 400);
  return path;
}

function storagePathFromPublicUrl(value = "") {
  const url = text(value);
  if (!url) return "";
  const { url: supabaseUrl, storageBucket } = getSupabaseConfig();
  if (!supabaseUrl || !storageBucket) return "";
  const prefix = `${String(supabaseUrl).replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(storageBucket)}/`;
  if (!url.startsWith(prefix)) return "";
  const encodedPath = url.slice(prefix.length);
  try {
    return encodedPath.split("/").map((part) => decodeURIComponent(part)).join("/");
  } catch {
    return encodedPath;
  }
}

async function deleteOldOwnedImage(row = {}, key = "", nextPath = "") {
  const oldUrl = text(row?.[key]);
  const oldPath = storagePathFromPublicUrl(oldUrl);
  if (!oldPath || oldPath === nextPath || !oldPath.startsWith("team-members/")) return;
  await deleteStorageObjects([oldPath]).catch(() => {});
}

export async function prepareAccountImageUpload(account = {}, input = {}) {
  const kind = normalizeImageKind(input?.kind);
  const { id, row } = await verifyAccountPassword(account, input?.currentPassword);
  const mime = text(input?.mime || input?.type);
  const size = Math.max(0, Number(input?.size) || 0);
  if (!/^image\//i.test(mime)) throw httpError("Only image uploads are allowed.", 400);
  if (!size) throw httpError("Image data is required.", 400);
  if (size > MAX_IMAGE_BYTES) throw httpError("Image is too large. Maximum size is 10MB.", 413);

  const key = imageColumnKey(row, kind);
  if (!key) {
    throw httpError("Profile picture field is not configured.", 400);
  }

  const filename = safeFilename(input?.filename || "profile-picture.webp");
  const objectPath = `team-members/${imageFolder(kind)}/${id}/${Date.now()}-${crypto.randomUUID()}-${filename}`;
  const ticket = await createSignedUploadUrl(objectPath);

  return {
    ok: true,
    kind,
    path: ticket.path,
    publicUrl: ticket.publicUrl,
    upload: {
      method: "PUT",
      signedUrl: ticket.signedUrl,
      publicUrl: ticket.publicUrl,
      headers: { "x-upsert": "false", "Content-Type": mime },
      bucket: ticket.bucket,
      path: ticket.path,
    },
    source: "supabase-next",
  };
}

export async function finalizeAccountImage(account = {}, input = {}) {
  const kind = normalizeImageKind(input?.kind);
  const { id, row } = await verifyAccountPassword(account, input?.currentPassword);
  const path = ownedImagePath(input?.path, kind, id);
  const key = imageColumnKey(row, kind);
  if (!key) throw httpError("Profile picture field is not configured.", 400);

  const publicUrl = storagePublicUrl(path);
  if (!publicUrl) throw httpError("Supabase Storage is not configured.", 500);

  const updated = await updateById(teamMembersTable(), id, { [key]: publicUrl });
  await deleteOldOwnedImage(row, key, path);
  clearAccountCaches(id);

  return { ok: true, success: true, photoUrl: publicUrl, source: "supabase-next", row: updated || null };
}

export async function removeAccountImage(account = {}, kindValue = "") {
  const kind = normalizeImageKind(kindValue);
  const { id, row } = await currentMember(account);
  const key = imageColumnKey(row, kind);
  if (!key) throw httpError("Profile picture field is not configured.", 400);

  await updateById(teamMembersTable(), id, { [key]: null });
  await deleteOldOwnedImage(row, key, "");
  clearAccountCaches(id);

  return { ok: true, success: true, photoUrl: "", source: "supabase-next" };
}

export function normalizeAccountPayload(account = {}) {
  const name = text(account?.name || account?.username);
  return {
    ...account,
    name,
    username: name || text(account?.username),
    department: text(account?.department),
    position: text(account?.position),
    phone: text(account?.phone),
    email: text(account?.email),
    employeeCode: text(account?.employeeCode) || null,
    photoUrl: text(account?.photoUrl || account?.profilePicture || account?.profile_picture),
    filesMedia: Array.isArray(account?.filesMedia) ? account.filesMedia : [],
    passwordSet: account?.passwordSet === true,
    source: "supabase-next",
  };
}

export const __accountDirectTest = {
  accountFieldKey,
  profilePictureKey,
  coercePatchValue,
  normalizeImageKind,
  storagePathFromPublicUrl,
};
