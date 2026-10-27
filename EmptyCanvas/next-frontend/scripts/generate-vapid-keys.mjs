// Run locally once: node scripts/generate-vapid-keys.mjs
// Copy the keys directly into Vercel Environment Variables (Production).
// Never commit, screenshot, or share the private key.
import crypto from "node:crypto";

const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
console.log("VAPID_PUBLIC_KEY=" + ecdh.getPublicKey().toString("base64url"));
const rawPrivate = ecdh.getPrivateKey();
const privateKey = rawPrivate.length === 32 ? rawPrivate : Buffer.concat([Buffer.alloc(32 - rawPrivate.length), rawPrivate]);
console.log("VAPID_PRIVATE_KEY=" + privateKey.toString("base64url"));
console.log("VAPID_SUBJECT=mailto:YOUR_REAL_EMAIL@gmail.com");
console.log("\nReplace the placeholder email; save all three to Vercel Production and redeploy.");
console.log("Keep the private key secret. Do not regenerate an existing working key pair.");
