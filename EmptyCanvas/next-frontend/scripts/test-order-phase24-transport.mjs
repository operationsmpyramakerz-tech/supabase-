import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("../lib/orders-bundle-transport.js", import.meta.url), "utf8")
  .replaceAll("export const ", "const ")
  .replaceAll("export function ", "function ");
const ctx = vm.createContext({});
vm.runInContext(`${src}\nthis.transport = summarizeBundleTransportHeaders;`, ctx);
const normalize = (value) => JSON.parse(JSON.stringify(value));
assert.deepEqual(normalize(ctx.transport({ contentEncoding: "gzip", contentLength: "25000" })), { encoding: "gzip", declaredBytes: 25000 });
assert.deepEqual(normalize(ctx.transport({ contentEncoding: "Br", contentLength: "0" })), { encoding: "br", declaredBytes: 0 });
assert.deepEqual(normalize(ctx.transport({ contentEncoding: "", contentLength: null })), { encoding: "not specified", declaredBytes: null });
assert.deepEqual(normalize(ctx.transport({ contentEncoding: "zstd", contentLength: "not-a-number" })), { encoding: "other", declaredBytes: null });
assert.deepEqual(normalize(ctx.transport({ contentEncoding: "identity", contentLength: "9999999999999999999" })), { encoding: "identity", declaredBytes: null });
console.log("Phase 24 transport header scenarios: PASS");
