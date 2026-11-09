import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidExternalMediaUrl, resolveExternalMediaLink } from "../lib/user-media-external-link.mjs";

const component = readFileSync(new URL("../components/users-center/UsersCenterDialogs.jsx", import.meta.url), "utf8");

test("accepts Google Maps short URL with the chosen Location display name", () => {
  const url = "https://maps.app.goo.gl/xmbxcKQm7GDcV";
  assert.deepEqual(resolveExternalMediaLink(url, "Location"), { ok: true, url, name: "Location" });
});

test("also recognizes a valid URL when old fields were filled in reverse order", () => {
  const url = "https://maps.app.goo.gl/abc?g_st=ac";
  assert.deepEqual(resolveExternalMediaLink("Location", url), { ok: true, url, name: "Location" });
});

test("does not rewrite parameters or fragments", () => {
  const url = "https://drive.google.com/file/d/aBc/view?usp=sharing#details";
  assert.equal(resolveExternalMediaLink(`  ${url}  `, "Contract").url, url);
});

test("requires an actual absolute HTTP(S) URL", () => {
  for (const url of ["Location", "example.com", "https://", "https://not a host", "javascript:alert(1)", "file:///etc/passwd", "https://?q=a", ""]) {
    assert.equal(isValidExternalMediaUrl(url), false, url);
  }
  assert.equal(isValidExternalMediaUrl("http://example.com/a"), true);
  assert.equal(resolveExternalMediaLink("", "Location").reason, "missing");
  assert.equal(resolveExternalMediaLink("Location", "Maps").reason, "invalid");
});

test("external link URL field appears first, followed by name and Add link button", () => {
  const section = component.split('<strong>External link</strong>')[1]?.split("</div>\n      </div>")[0] || "";
  assert.ok(section.includes('aria-label="External link URL"'));
  assert.ok(section.includes('aria-label="External link display name"'));
  assert.ok(section.indexOf('aria-label="External link URL"') < section.indexOf('aria-label="External link display name"'));
  assert.ok(section.includes("resolveExternalMediaLink(link, linkName)" ) === false); // data resolution is in the action handler
  assert.match(component, /const resolved = resolveExternalMediaLink\(link, linkName\)/);
});
