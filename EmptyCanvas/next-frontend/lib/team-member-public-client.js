const PROFILE_CACHE_TTL_MS = 60_000;
const resolvedProfiles = new Map();
const inflightProfiles = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function keyFor(value) {
  return clean(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 240);
}

async function readJson(response) {
  return await response.json().catch(() => ({}));
}

async function fetchProfile(identifier) {
  const encoded = encodeURIComponent(clean(identifier));
  let response = await fetch(`/next/api/team-members/${encoded}/public`, { credentials: "include", cache: "no-store" });
  let body = await readJson(response);

  // Compatibility fallback remains available while the migration is running.
  // Do not call Express unless the direct Next/Supabase route actually failed.
  if (!response.ok && response.status !== 401) {
    response = await fetch(`/api/team-members/${encoded}/public`, { credentials: "include", cache: "no-store" });
    body = await readJson(response);
  }

  if (!response.ok) {
    const error = new Error(body?.error || "Failed to load user profile.");
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function loadTeamMemberPublicProfile(identifier, { fresh = false } = {}) {
  const key = keyFor(identifier);
  if (!key) throw new Error("Team member ID is required.");

  if (fresh) resolvedProfiles.delete(key);
  const cached = resolvedProfiles.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!fresh && inflightProfiles.has(key)) return await inflightProfiles.get(key);

  const pending = fetchProfile(identifier);
  if (!fresh) inflightProfiles.set(key, pending);
  try {
    const profile = await pending;
    const expiresAt = Date.now() + PROFILE_CACHE_TTL_MS;
    resolvedProfiles.set(key, { value: profile, expiresAt });
    for (const alias of [profile?.id, profile?.name, profile?.username]) {
      const aliasKey = keyFor(alias);
      if (aliasKey) resolvedProfiles.set(aliasKey, { value: profile, expiresAt });
    }
    return profile;
  } finally {
    if (!fresh && inflightProfiles.get(key) === pending) inflightProfiles.delete(key);
  }
}

export function clearTeamMemberPublicProfileCache(identifier = "") {
  const key = keyFor(identifier);
  if (key) {
    resolvedProfiles.delete(key);
    inflightProfiles.delete(key);
    return;
  }
  resolvedProfiles.clear();
  inflightProfiles.clear();
}
