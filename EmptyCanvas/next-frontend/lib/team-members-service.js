import "server-only";
import { selectAll, selectById } from "./supabase-rest";
import { measurePerformance } from "./performance-profiler";

const TEAM_MEMBERS_CACHE_TTL_MS = 30_000;
const PUBLIC_PROFILE_CACHE_TTL_MS = 60_000;
const publicProfileCache = new Map();
const publicProfileInflight = new Map();
let teamMembersCache = null;
let teamMembersInflight = null;
let teamMembersCacheGeneration = 0;
let teamMembersProjectionSupported = null;

// Proposals/Kits only need a tiny identity/assignment projection. Modern
// Supabase schemas use these canonical columns; customized/legacy schemas are
// supported by falling back to `select=*` when any projected column is absent.
const TEAM_MEMBERS_LITE_SELECT = "id,name,position,department,school";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") {
    return text(value.name || value.value || value.label || value.title || value.email || value.url);
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function valueFor(row, aliases = []) {
  const source = row && typeof row === "object" ? row : {};
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) return source[alias];
  }
  const wanted = new Set(aliases.map(canonical).filter(Boolean));
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(canonical(key))) return value;
  }
  return null;
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function serializeMember(row = {}) {
  const id = text(valueFor(row, ["id", "ID"]));
  const name = text(valueFor(row, ["name", "Name", "full_name", "Full Name"])) || "Unnamed";
  return {
    id,
    name,
    position: text(valueFor(row, ["position", "Position", "job_title", "Job Title"])),
    department: text(valueFor(row, ["department", "Department"])),
    stocktakingColumn: text(valueFor(row, ["school", "School", "stocktaking_column", "Stocktaking Column"])),
  };
}

async function loadTeamMembers() {
  // Keep this intentionally lean. Pages such as Proposals/Kits only need the
  // assignment identity fields, not the full Users Center directory payload.
  // Avoid downloading profile photos, cover photos, permissions and other
  // Users Center fields just to populate an assignee dropdown.
  let rows;
  if (teamMembersProjectionSupported !== false) {
    try {
      rows = await selectAll(teamMembersTable(), {
        limit: 5000,
        order: "name.asc,id.asc",
        select: TEAM_MEMBERS_LITE_SELECT,
        profileName: "team-members.lite",
      });
      teamMembersProjectionSupported = true;
    } catch {
      // Remember the compatibility mode for this process so customized schemas
      // do not pay for one failed projected request on every cache miss.
      teamMembersProjectionSupported = false;
    }
  }
  if (!Array.isArray(rows)) {
    // Compatibility path for older/custom schemas whose identity fields use
    // non-canonical names. Keep the old behavior rather than breaking the page.
    rows = await selectAll(teamMembersTable(), { limit: 5000, profileName: "team-members.lite-fallback" });
  }
  return (Array.isArray(rows) ? rows : [])
    .map(serializeMember)
    .filter((member) => member.id && member.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTeamMembersLite({ fresh = false } = {}) {
  if (fresh) invalidateTeamMembersLiteCache();
  const now = Date.now();
  if (!fresh && teamMembersCache && teamMembersCache.expiresAt > now) return teamMembersCache.value;
  if (!fresh && teamMembersInflight) return await teamMembersInflight;

  const generation = teamMembersCacheGeneration;
  const pending = loadTeamMembers();
  if (!fresh) teamMembersInflight = pending;
  try {
    const members = await pending;
    // A forced refresh invalidates the previous generation before loading.
    // Never allow an older in-flight request to overwrite the newer snapshot.
    if (generation === teamMembersCacheGeneration) {
      teamMembersCache = {
        value: members,
        expiresAt: Date.now() + TEAM_MEMBERS_CACHE_TTL_MS,
      };
    }
    return members;
  } finally {
    if (!fresh && teamMembersInflight === pending) teamMembersInflight = null;
  }
}

export function invalidateTeamMembersLiteCache() {
  teamMembersCacheGeneration += 1;
  teamMembersCache = null;
  teamMembersInflight = null;
}

function extractUrl(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    return extractUrl(value.url || value.publicUrl || value.public_url || value.href || value.external?.url || value.file?.url || value.src || "");
  }
  const raw = text(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return extractUrl(parsed);
  } catch {
    return "";
  }
}

function publicProfileFiles(value) {
  const out = [];
  const seen = new Set();
  const push = (name, url) => {
    const cleanUrl = extractUrl(url);
    const cleanName = text(name) || `File ${out.length + 1}`;
    const key = `${cleanName}\u0000${cleanUrl}`;
    if (!cleanUrl || seen.has(key)) return;
    seen.add(key);
    out.push({ name: cleanName, url: cleanUrl });
  };
  const visit = (item) => {
    if (!item) return;
    if (Array.isArray(item)) return item.forEach(visit);
    if (typeof item === "object") {
      if (item.url || item.href || item.publicUrl || item.public_url || item.external?.url || item.file?.url) {
        push(item.name || item.filename || item.title || item.label, item);
        return;
      }
      for (const nested of Object.values(item)) visit(nested);
      return;
    }
    const raw = text(item);
    if (!raw) return;
    if (/^https?:\/\//i.test(raw)) return push("File", raw);
    try { visit(JSON.parse(raw)); } catch {}
  };
  visit(value);
  return out;
}

function serializePublicProfile(row = {}) {
  const name = text(valueFor(row, ["name", "Name", "full_name", "Full Name"])) || "Team member";
  const department = text(valueFor(row, ["department", "Department", "dept", "Dept"]));
  const position = text(valueFor(row, ["position", "Position", "job_title", "Job Title", "role", "Role"]));
  const phone = text(valueFor(row, ["phone", "Phone", "mobile", "Mobile", "phone_number", "Phone Number"]));
  const email = text(valueFor(row, ["email", "Email", "mail", "Mail"]));
  const employeeCode = text(valueFor(row, ["employee_code", "employeeCode", "Employee Code", "code", "Code"]));
  const photoUrl = extractUrl(valueFor(row, ["profile_picture", "profile_picture_url", "profile_photo", "profile_photo_url", "photo", "photo_url", "avatar", "avatar_url", "Profile picture", "Profile Picture"]));
  const coverPhotoUrl = extractUrl(valueFor(row, ["cover_photo", "cover_photo_url", "cover_image", "cover_image_url", "cover", "cover_url", "Cover photo", "Cover Photo"]));
  const filesMedia = publicProfileFiles(valueFor(row, ["files_media", "files", "media", "Files & media", "Files and media"]));
  const fields = [
    ["Name", name, "text"],
    ["Department", department, "text"],
    ["Position", position, "text"],
    ["Phone", phone, "phone_number"],
    ["Email", email, "email"],
    ["Employee Code", employeeCode, "text"],
  ].filter(([, value]) => text(value)).map(([label, value, type]) => ({ label, value, type, files: [] }));
  return {
    id: text(valueFor(row, ["id", "ID"])),
    name,
    username: name,
    department,
    position,
    phone,
    email,
    employeeCode,
    photoUrl,
    coverPhotoUrl,
    filesMedia,
    fields,
    source: "supabase-next",
  };
}

function normalizePublicProfileKey(value) {
  return canonical(value).slice(0, 240);
}

async function resolvePublicProfileRow(identifier) {
  const raw = text(identifier);
  if (!raw) return null;

  // Most modern order/task rows carry the Supabase member id. This is one
  // indexed lookup and avoids scanning the directory entirely.
  try {
    const byId = await selectById(teamMembersTable(), raw, { profileName: "team-members.public-profile-by-id" });
    if (byId) return byId;
  } catch {}

  // Compatibility path for older rows that stored the creator name instead of
  // the Supabase id. Reuse the already compact/cached directory only to resolve
  // the name -> id mapping, then load one full profile row by id.
  const target = canonical(raw);
  if (!target) return null;
  const members = await listTeamMembersLite().catch(() => []);
  const exact = members.find((member) => canonical(member.id) === target || canonical(member.name) === target);
  const fuzzy = exact || members.find((member) => {
    const name = canonical(member.name);
    return name && (name.includes(target) || target.includes(name));
  });
  if (!fuzzy?.id) return null;
  try {
    return await selectById(teamMembersTable(), fuzzy.id, { profileName: "team-members.public-profile-resolved" });
  } catch {
    return null;
  }
}

export async function getTeamMemberPublicProfile(identifier, { fresh = false } = {}) {
  const key = normalizePublicProfileKey(identifier);
  if (!key) {
    const error = new Error("Team member ID is required.");
    error.status = 400;
    throw error;
  }

  if (fresh) publicProfileCache.delete(key);
  const cached = publicProfileCache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!fresh && publicProfileInflight.has(key)) return await publicProfileInflight.get(key);

  const pending = measurePerformance("team-members", "public-profile", async () => {
    const row = await resolvePublicProfileRow(identifier);
    if (!row) {
      const error = new Error("Team member not found.");
      error.status = 404;
      throw error;
    }
    return serializePublicProfile(row);
  }, { lookup: /^[0-9a-f-]{16,}$/i.test(text(identifier)) ? "id" : "compat" });

  if (!fresh) publicProfileInflight.set(key, pending);
  try {
    const profile = await pending;
    publicProfileCache.set(key, { value: profile, expiresAt: Date.now() + PUBLIC_PROFILE_CACHE_TTL_MS });
    if (profile?.id) {
      const idKey = normalizePublicProfileKey(profile.id);
      if (idKey) publicProfileCache.set(idKey, { value: profile, expiresAt: Date.now() + PUBLIC_PROFILE_CACHE_TTL_MS });
    }
    if (profile?.name) {
      const nameKey = normalizePublicProfileKey(profile.name);
      if (nameKey) publicProfileCache.set(nameKey, { value: profile, expiresAt: Date.now() + PUBLIC_PROFILE_CACHE_TTL_MS });
    }
    return profile;
  } finally {
    if (!fresh && publicProfileInflight.get(key) === pending) publicProfileInflight.delete(key);
  }
}

export function invalidateTeamMemberPublicProfileCache(identifier = "") {
  const key = normalizePublicProfileKey(identifier);
  if (key) {
    publicProfileCache.delete(key);
    publicProfileInflight.delete(key);
    return;
  }
  publicProfileCache.clear();
  publicProfileInflight.clear();
}

