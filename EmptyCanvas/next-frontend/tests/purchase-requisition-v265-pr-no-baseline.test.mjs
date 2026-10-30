import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const render = fs.readFileSync(new URL("../lib/purchase-requisition-render.js", import.meta.url), "utf8");
const label = render.match(/function prNumberLabel\(x,y,w,h\) \{([\s\S]*?)\n  \}/)?.[1];

test("PR No. Latin text drops 2.5 points to align optically with Arabic text", () => {
  assert.ok(label, "PR label renderer exists");
  assert.match(label, /write\(english,groupLeft,y\+2\.5,englishWidth,h,/);
  assert.match(label, /write\(arabic,groupLeft\+englishWidth\+gap\+dashWidth\+gap,y,arabicWidth,h,/);
});

test("the separator, group right alignment and cell dimensions remain unchanged", () => {
  assert.match(label, /const groupLeft=x\+w-7-groupWidth/);
  assert.match(label, /write\("-",groupLeft\+englishWidth\+gap,y,dashWidth,h,/);
  assert.match(render, /prNumberLabel\(xx,y,width,h\)/);
});
