import "server-only";
import { selectAll } from "./supabase-rest";

const TEAM_MEMBERS_CACHE_TTL_MS = 30_000;
let teamMembersCache = null;
let teamMembersInflight = null;

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
  const rows = await selectAll(teamMembersTable(), { limit: 5000 });
  return (Array.isArray(rows) ? rows : [])
    .map(serializeMember)
    .filter((member) => member.id && member.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTeamMembersLite({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && teamMembersCache && teamMembersCache.expiresAt > now) return teamMembersCache.value;
  if (!fresh && teamMembersInflight) return await teamMembersInflight;

  const pending = loadTeamMembers();
  if (!fresh) teamMembersInflight = pending;
  try {
    const members = await pending;
    teamMembersCache = {
      value: members,
      expiresAt: Date.now() + TEAM_MEMBERS_CACHE_TTL_MS,
    };
    return members;
  } finally {
    if (!fresh) teamMembersInflight = null;
  }
}
