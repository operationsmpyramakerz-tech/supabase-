const session = require("express-session");
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");

// Robust session config for Vercel (Upstash Redis) with safe fallback.
// Important: some Vercel preview/custom domains can reject a __Secure-* cookie
// if Express cannot confidently mark it Secure behind the proxy. Use a normal
// httpOnly session cookie and keep sameSite=Lax so the browser always persists
// the login session on the same Vercel domain.
const hasSecret = !!process.env.SESSION_SECRET;
const hasUrl = !!process.env.UPSTASH_REDIS_URL;

let store = null;
let redisClient = null;
if (hasSecret && hasUrl) {
  try {
    redisClient = createClient({
      url: process.env.UPSTASH_REDIS_URL,
      socket: { tls: /^rediss:/i.test(process.env.UPSTASH_REDIS_URL || ""), keepAlive: 30000 },
    });
    redisClient.on("error", (err) => console.error("[Redis] error", err?.message || err));
    redisClient.on("connect", () => console.log("[Redis] connecting..."));
    redisClient.on("ready", () => console.log("[Redis] ready ✓"));
    // connect lazily; don't await in serverless cold start
    redisClient.connect().catch((e) => console.error("[Redis] connect failed:", e?.message || e));
    store = new RedisStore({ client: redisClient, prefix: "op:" });
  } catch (e) {
    console.error("[session-redis] Failed to init RedisStore:", e?.message || e);
  }
} else {
  console.warn("[session-redis] Missing env; using MemoryStore TEMPORARILY for debugging.", {
    SESSION_SECRET: hasSecret ? "OK" : "MISSING",
    UPSTASH_REDIS_URL: hasUrl ? "OK" : "MISSING",
  });
}

const isProductionLike = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
const forceSecureCookie = String(process.env.FORCE_SECURE_COOKIE || "").toLowerCase() === "true";

const sessionMiddleware = session({
  store: store || undefined, // MemoryStore fallback if Redis env is missing
  secret: process.env.SESSION_SECRET || "dev-fallback-secret",
  proxy: true,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  // Use a non-prefixed cookie name to avoid browsers rejecting preview-domain
  // cookies when the Secure flag is not detected exactly as expected.
  name: process.env.SESSION_COOKIE_NAME || "op.sid",
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    // Default false is intentional for Vercel preview stability. HTTPS is still
    // used by Vercel; set FORCE_SECURE_COOKIE=true later if you want Secure flag.
    secure: forceSecureCookie ? true : false,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
});

module.exports = { sessionMiddleware, redisClient };
