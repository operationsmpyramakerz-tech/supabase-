const session = require("express-session");
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");

// Robust session config for Vercel (Upstash Redis) with safe fallback.
// In serverless, MemoryStore is not reliable because Vercel can serve the next
// request from a different lambda instance. Prefer Upstash for every deployed env.
const hasSecret = !!process.env.SESSION_SECRET;
const redisUrl = String(process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || "").trim();
const restUrl = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
const restToken = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const hasRedisUrl = !!redisUrl;
const hasRest = !!(restUrl && restToken);

let store = null;
let redisClient = null;
let sessionStoreType = "memory";

function safeBool(value) {
  return !!value;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

class UpstashRestSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.url = trimTrailingSlash(options.url);
    this.token = String(options.token || "").trim();
    this.prefix = options.prefix || "op:sess:";
    this.ttlSeconds = Number(options.ttlSeconds || 60 * 60 * 24 * 30);
  }

  _key(sid) {
    return `${this.prefix}${sid}`;
  }

  _ttl(sess) {
    try {
      const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : null;
      if (expires && Number.isFinite(expires)) {
        return Math.max(60, Math.ceil((expires - Date.now()) / 1000));
      }
      const maxAge = Number(sess?.cookie?.maxAge || 0);
      if (maxAge && Number.isFinite(maxAge)) return Math.max(60, Math.ceil(maxAge / 1000));
    } catch {}
    return this.ttlSeconds;
  }

  async _command(command) {
    if (!this.url || !this.token) throw new Error("Upstash REST session store is not configured.");
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      const message = payload?.error || `Upstash REST request failed with HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload?.result;
  }

  get(sid, callback) {
    this._command(["GET", this._key(sid)])
      .then((raw) => {
        if (!raw) return callback(null, null);
        if (typeof raw === "object") return callback(null, raw);
        try {
          return callback(null, JSON.parse(String(raw)));
        } catch (error) {
          return callback(error);
        }
      })
      .catch((error) => callback(error));
  }

  set(sid, sess, callback) {
    const ttl = this._ttl(sess);
    let value;
    try {
      value = JSON.stringify(sess);
    } catch (error) {
      if (callback) return callback(error);
      throw error;
    }

    this._command(["SET", this._key(sid), value, "EX", ttl])
      .then(() => callback && callback(null))
      .catch((error) => callback && callback(error));
  }

  destroy(sid, callback) {
    this._command(["DEL", this._key(sid)])
      .then(() => callback && callback(null))
      .catch((error) => callback && callback(error));
  }

  touch(sid, sess, callback) {
    const ttl = this._ttl(sess);
    this._command(["EXPIRE", this._key(sid), ttl])
      .then(() => callback && callback(null))
      .catch((error) => callback && callback(error));
  }
}

if (hasRedisUrl) {
  try {
    redisClient = createClient({
      url: redisUrl,
      socket: { tls: /^rediss:/i.test(redisUrl), keepAlive: 30000 },
    });
    redisClient.on("error", (err) => console.error("[Redis] error", err?.message || err));
    redisClient.on("connect", () => console.log("[Redis] connecting..."));
    redisClient.on("ready", () => console.log("[Redis] ready ✓"));
    // Connect lazily; do not block serverless cold start.
    redisClient.connect().catch((e) => console.error("[Redis] connect failed:", e?.message || e));
    store = new RedisStore({ client: redisClient, prefix: "op:" });
    sessionStoreType = "upstash-redis-url";
  } catch (e) {
    console.error("[session-redis] Failed to init RedisStore:", e?.message || e);
  }
}

if (!store && hasRest) {
  store = new UpstashRestSessionStore({
    url: restUrl,
    token: restToken,
    prefix: "op:sess:",
    ttlSeconds: 60 * 60 * 24 * 30,
  });
  sessionStoreType = "upstash-rest";
  console.log("[session-redis] Using Upstash REST session store ✓");
}

if (!store) {
  console.warn("[session-redis] Missing Upstash session store env; using MemoryStore TEMPORARILY.", {
    SESSION_SECRET: hasSecret ? "OK" : "MISSING",
    UPSTASH_REDIS_URL: hasRedisUrl ? "OK" : "MISSING",
    UPSTASH_REDIS_REST_URL: restUrl ? "OK" : "MISSING",
    UPSTASH_REDIS_REST_TOKEN: restToken ? "OK" : "MISSING",
  });
}

const forceSecureCookie = String(process.env.FORCE_SECURE_COOKIE || "").toLowerCase() === "true";
const secureCookie = forceSecureCookie ? true : "auto";

const sessionStore = store || new session.MemoryStore();

const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "dev-fallback-secret",
  proxy: true,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: process.env.SESSION_COOKIE_NAME || "op.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});

function getSessionDiagnostics() {
  return {
    storeType: sessionStoreType,
    persistent: sessionStoreType !== "memory",
    hasSessionSecret: safeBool(process.env.SESSION_SECRET),
    hasUpstashRedisUrl: safeBool(redisUrl),
    hasUpstashRestUrl: safeBool(restUrl),
    hasUpstashRestToken: safeBool(restToken),
    cookieName: process.env.SESSION_COOKIE_NAME || "op.sid",
    secureCookie,
  };
}


function _sessionMatchesUser(sess, userId) {
  const wanted = String(userId || "").trim();
  if (!wanted || !sess || typeof sess !== "object") return false;
  return [sess.userSupabaseId, sess.userNotionId]
    .map((value) => String(value || "").trim())
    .some((value) => value && value === wanted);
}

async function _sessionEntries() {
  if (sessionStoreType === "upstash-redis-url" && redisClient) {
    if (!redisClient.isOpen) await redisClient.connect();
    const entries = [];
    for await (const key of redisClient.scanIterator({ MATCH: "op:*", COUNT: 100 })) {
      const raw = await redisClient.get(key);
      if (!raw) continue;
      try {
        entries.push([String(key).replace(/^op:/, ""), JSON.parse(raw)]);
      } catch {}
    }
    return entries;
  }

  if (sessionStoreType === "upstash-rest" && typeof sessionStore?._command === "function") {
    const entries = [];
    let cursor = "0";
    do {
      const result = await sessionStore._command(["SCAN", cursor, "MATCH", "op:sess:*", "COUNT", 100]);
      cursor = String(Array.isArray(result) ? result[0] : "0");
      const keys = Array.isArray(result?.[1]) ? result[1] : [];
      for (const key of keys) {
        const raw = await sessionStore._command(["GET", key]);
        if (!raw) continue;
        try {
          entries.push([String(key).replace(/^op:sess:/, ""), typeof raw === "object" ? raw : JSON.parse(String(raw))]);
        } catch {}
      }
    } while (cursor !== "0");
    return entries;
  }

  // express-session MemoryStore keeps JSON strings keyed by the session ID.
  if (sessionStore?.sessions && typeof sessionStore.sessions === "object") {
    return Object.entries(sessionStore.sessions).flatMap(([sid, raw]) => {
      try {
        return [[sid, typeof raw === "object" ? raw : JSON.parse(String(raw))]];
      } catch {
        return [];
      }
    });
  }

  return await new Promise((resolve, reject) => {
    if (!sessionStore || typeof sessionStore.all !== "function") return resolve([]);
    sessionStore.all((error, sessions) => {
      if (error) return reject(error);
      if (sessions && !Array.isArray(sessions) && typeof sessions === "object") {
        return resolve(Object.entries(sessions));
      }
      resolve([]);
    });
  });
}

function _storeDestroy(sid) {
  return new Promise((resolve, reject) => {
    sessionStore.destroy(String(sid || ""), (error) => (error ? reject(error) : resolve()));
  });
}

/**
 * Destroy every active login session that belongs to a Team Member.
 * Used after username/password changes and user deletion so all connected
 * browsers/devices are signed out immediately on their next request.
 */
async function destroySessionsForUser(userId) {
  const wanted = String(userId || "").trim();
  if (!wanted) return { destroyed: 0 };

  const entries = await _sessionEntries();

  let destroyed = 0;
  for (const [sid, sess] of entries) {
    if (!_sessionMatchesUser(sess, wanted)) continue;
    await _storeDestroy(sid);
    destroyed += 1;
  }
  return { destroyed };
}

module.exports = {
  sessionMiddleware,
  sessionStore,
  redisClient,
  sessionStoreType,
  getSessionDiagnostics,
  destroySessionsForUser,
};
