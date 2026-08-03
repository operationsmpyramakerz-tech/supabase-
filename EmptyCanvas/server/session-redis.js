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
let redisConnectPromise = null;
let restCommandStore = null;

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

if (hasRest) {
  restCommandStore = new UpstashRestSessionStore({
    url: restUrl,
    token: restToken,
    prefix: "op:sess:",
    ttlSeconds: 60 * 60 * 24 * 30,
  });
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
    redisConnectPromise = redisClient.connect().catch((e) => {
      console.error("[Redis] connect failed:", e?.message || e);
      return null;
    });
    store = new RedisStore({ client: redisClient, prefix: "op:" });
    sessionStoreType = "upstash-redis-url";
  } catch (e) {
    console.error("[session-redis] Failed to init RedisStore:", e?.message || e);
  }
}

if (!store && restCommandStore) {
  store = restCommandStore;
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


async function ensureRedisClientReady() {
  if (!redisClient) return null;
  if (redisClient.isReady) return redisClient;

  try {
    if (!redisClient.isOpen) {
      if (!redisConnectPromise) {
        redisConnectPromise = redisClient.connect().catch((error) => {
          redisConnectPromise = null;
          throw error;
        });
      }
      await redisConnectPromise;
    } else if (redisConnectPromise) {
      await redisConnectPromise.catch(() => null);
    }
  } catch (error) {
    console.error("[Redis] lazy connection failed:", error?.message || error);
    return null;
  }

  return redisClient.isReady ? redisClient : null;
}

// Generic Redis adapter used by application caches. Session persistence already
// supported both the normal Redis URL and Upstash REST, but the application
// cache previously worked only when the normal Redis URL was present. This
// adapter gives cache reads/writes the same REST fallback without exposing
// tokens or coupling application code to the session-store implementation.
const cacheRedis = {
  isConfigured() {
    return !!redisClient || !!restCommandStore;
  },

  backendType() {
    if (redisClient && restCommandStore) return "redis-url+rest-fallback";
    if (redisClient) return "redis-url";
    if (restCommandStore) return "upstash-rest";
    return "memory-only";
  },

  async get(key) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return null;

    const client = await ensureRedisClientReady();
    if (client) return await client.get(normalizedKey);
    if (restCommandStore) {
      return await restCommandStore._command(["GET", normalizedKey]);
    }
    return null;
  },

  async set(key, value, options = {}) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return null;
    const rawTtl = Number(options?.EX || options?.ex || options?.ttl || 0) || 0;
    const ttl = rawTtl > 0 ? Math.max(1, rawTtl) : 0;

    const client = await ensureRedisClientReady();
    if (client) {
      return ttl
        ? await client.set(normalizedKey, value, { EX: ttl })
        : await client.set(normalizedKey, value);
    }
    if (restCommandStore) {
      const command = ["SET", normalizedKey, value];
      if (ttl) command.push("EX", ttl);
      return await restCommandStore._command(command);
    }
    return null;
  },

  async del(keys) {
    const list = (Array.isArray(keys) ? keys : [keys])
      .map((key) => String(key || "").trim())
      .filter(Boolean);
    if (!list.length) return 0;

    const client = await ensureRedisClientReady();
    if (client) return await client.del(list);
    if (restCommandStore) {
      return Number(await restCommandStore._command(["DEL", ...list])) || 0;
    }
    return 0;
  },

  async scan(cursor = "0", options = {}) {
    const match = String(options?.MATCH || options?.match || "*").trim() || "*";
    const count = Math.max(1, Number(options?.COUNT || options?.count || 200) || 200);

    const client = await ensureRedisClientReady();
    if (client && typeof client.scan === "function") {
      const reply = await client.scan(String(cursor || "0"), { MATCH: match, COUNT: count });
      if (Array.isArray(reply)) return { cursor: String(reply[0] || "0"), keys: reply[1] || [] };
      return { cursor: String(reply?.cursor ?? "0"), keys: reply?.keys || [] };
    }

    if (restCommandStore) {
      const reply = await restCommandStore._command(["SCAN", String(cursor || "0"), "MATCH", match, "COUNT", count]);
      if (Array.isArray(reply)) return { cursor: String(reply[0] || "0"), keys: reply[1] || [] };
      return { cursor: "0", keys: [] };
    }

    return { cursor: "0", keys: [] };
  },
};

const forceSecureCookie = String(process.env.FORCE_SECURE_COOKIE || "").toLowerCase() === "true";
const secureCookie = forceSecureCookie ? true : "auto";

const sessionMiddleware = session({
  store: store || undefined,
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

const authRevocationMemory = new Map();
const AUTH_REVOCATION_PREFIX = "op:auth-revoked:";

function authRevocationKey(userId) {
  return `${AUTH_REVOCATION_PREFIX}${String(userId || "").trim()}`;
}

async function setUserAuthRevokedAt(userId, timestamp = Date.now()) {
  const id = String(userId || "").trim();
  if (!id) return 0;
  const value = Number(timestamp) || Date.now();
  authRevocationMemory.set(id, value);

  if (redisClient) {
    try {
      const client = await ensureRedisClientReady();
      if (client) {
        await client.set(authRevocationKey(id), String(value));
        return value;
      }
    } catch (error) {
      console.error("[session-redis] Failed to persist auth revocation:", error?.message || error);
    }
  }

  if (restCommandStore) {
    try {
      await restCommandStore._command(["SET", authRevocationKey(id), String(value)]);
      return value;
    } catch (error) {
      console.error("[session-redis] Failed to persist REST auth revocation:", error?.message || error);
    }
  }

  return value;
}

async function getUserAuthRevokedAt(userId) {
  const id = String(userId || "").trim();
  if (!id) return 0;

  if (redisClient) {
    try {
      const client = await ensureRedisClientReady();
      const raw = client ? await client.get(authRevocationKey(id)) : null;
      if (raw !== null && raw !== undefined) return Number(raw) || 0;
    } catch (error) {
      console.error("[session-redis] Failed to read auth revocation:", error?.message || error);
    }
  }

  if (restCommandStore) {
    try {
      const raw = await restCommandStore._command(["GET", authRevocationKey(id)]);
      if (raw !== null && raw !== undefined) return Number(raw) || 0;
    } catch (error) {
      console.error("[session-redis] Failed to read REST auth revocation:", error?.message || error);
    }
  }

  return Number(authRevocationMemory.get(id) || 0);
}

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
    cacheBackend: cacheRedis.backendType(),
    cachePersistent: cacheRedis.isConfigured(),
  };
}

module.exports = { sessionMiddleware, redisClient, cacheRedis, sessionStoreType, getSessionDiagnostics, setUserAuthRevokedAt, getUserAuthRevokedAt };
