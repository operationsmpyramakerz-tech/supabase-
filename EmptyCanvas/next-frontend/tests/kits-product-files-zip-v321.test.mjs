import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { archiveEntries, fetchArchiveEntries, productArchiveName, safeArchiveFileName } from "../lib/product-attachments-archive.mjs";

const source = fs.readFileSync(new URL("../components/kits/KitsClient.jsx", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/products/files-download/route.js", import.meta.url), "utf8");
const supabaseUrl = "https://storage.example.com";
const bucket = "Data";
const fileUrl = (name) => `${supabaseUrl}/storage/v1/object/public/${bucket}/products/files/${name}`;
const file = (name, url = fileUrl(name)) => ({ name, url, size: 5, type: "application/octet-stream" });

function makeEntries(files) { return archiveEntries(files, { supabaseUrl, bucket }); }

test("Kits retains all product attachments rather than the legacy first link", () => {
  assert.match(source, /attachments: Array\.isArray\(product\?\.attachments\)/);
  assert.match(source, /files\.length > 1/);
  assert.match(source, /\/next\/api\/products\/files-download\?id=/);
  assert.match(source, /Download ZIP/);
  assert.match(source, /files\[0\]\?\.url \|\| row\.product\?\.url/);
  assert.match(route, /"kits\.view"/);
  assert.match(route, /getProduct\(productId\)/);
  assert.match(route, /Cache-Control/);
});

test("deduplicates repeated file names without losing their extensions or order", () => {
  const attachments = [
    file("part.stl", fileUrl("1.stl")),
    file("part.stl", fileUrl("2.stl")),
    file("part.STL", fileUrl("3.stl")),
    file("laser.lbrn2", fileUrl("4.lbrn2")),
  ];
  assert.deepEqual(makeEntries(attachments).map((entry) => entry.name), ["part.stl", "part (2).stl", "part (3).STL", "laser.lbrn2"]);
});

test("rejects cross-origin, missing, redirected and oversized file metadata before network fetch", () => {
  assert.throws(() => makeEntries([file("one.stl")]), /multiple/);
  assert.throws(() => makeEntries(Array(11).fill(file("many.stl"))), /multiple/);
  assert.throws(() => makeEntries([file("one.stl"), file("evil.stl", "https://evil.example.com/a.stl")]), /Invalid product file reference/);
  assert.throws(() => makeEntries([file("one.stl"), file("bad.stl", fileUrl("..%2Fsecret"))]), /Invalid product file reference/);
  assert.throws(() => makeEntries([file("one.stl"), { ...file("big.stl"), size: 10 * 1024 * 1024 + 1 }]), /Invalid product file size/);
});

test("sanitizes potential ZIP traversal file names and generates a safe download name", () => {
  assert.equal(safeArchiveFileName("../notes.txt"), ".._notes.txt");
  assert.equal(safeArchiveFileName("sub\\folder.stl"), "sub_folder.stl");
  assert.equal(safeArchiveFileName(".."), "attachment");
  assert.equal(productArchiveName("Ninja OTTO"), "Ninja OTTO-files.zip");
  assert.equal(productArchiveName('bad"name'), "bad-name-files.zip");
});

test("downloads all resources completely, preserving binary bytes", async () => {
  const entries = makeEntries([file("one.stl"), file("two.lbrn2")]);
  const payloads = [Buffer.from([0, 255, 1, 2]), Buffer.from([23, 31, 48])];
  const calls = [];
  const result = await fetchArchiveEntries(entries, {
    fetchImpl: async (url, options) => {
      calls.push([url, options.redirect, options.method]);
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(payloads[calls.length - 1]);
          controller.close();
        },
      });
      return { ok: true, headers: new Headers(), body };
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.slice(1)), [["error", "GET"], ["error", "GET"]]);
  assert.deepEqual(result.map((r) => r.name), ["one.stl", "two.lbrn2"]);
  assert.deepEqual(result.map((r) => r.content), payloads);
});

test("refuses a ZIP if any one resource is unavailable (no incomplete archive)", async () => {
  const entries = makeEntries([file("one.stl"), file("two.stl")]);
  let number = 0;
  await assert.rejects(fetchArchiveEntries(entries, {
    fetchImpl: async () => {
      number += 1;
      if (number === 2) return { ok: false, headers: new Headers(), body: null };
      return { ok: true, headers: new Headers(), body: new ReadableStream({
        start(controller) { controller.enqueue(Buffer.from("test")); controller.close(); },
      }) };
    },
  }), /Could not download two\.stl/);
});

test("enforces actual downloaded bytes even if upstream omits content-length", async () => {
  const entries = makeEntries([file("one.stl"), file("two.stl")]);
  await assert.rejects(fetchArchiveEntries(entries, {
    fetchImpl: async () => ({ ok: true, headers: new Headers(), body: new ReadableStream({
      start(controller) { controller.enqueue(Buffer.alloc(10 * 1024 * 1024 + 1)); controller.close(); },
    }) }),
  }), /exceeds the file size limit/);
});
