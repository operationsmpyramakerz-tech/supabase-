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

module.exports = { sessionMiddleware, redisClient, sessionStoreType, getSessionDiagnostics };
