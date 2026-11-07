import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "public/css/dark-mode-contrast-v349.css"), "utf8");
const layout = readFileSync(resolve(root, "app/layout.jsx"), "utf8");

test("dark-mode contrast patch is loaded by the shared root layout", () => {
  assert.match(layout, /dark-mode-contrast-v349\.css\?v=350-white-dock/);
});

test("dark mode uses white rails, dark icons, and orange selected icon without changing dock sizing", () => {
  assert.match(css, /--desktop-dock-bg:\s*#ffffff/);
  assert.match(css, /\.mobile-dock-pages-clip, \.mobile-dock-home-rail/);
  assert.match(css, /background:\s*#ffffff\s*!important/);
  assert.match(css, /\.nav-link:not\(\.active\) svg/);
  assert.match(css, /color:\s*#172033\s*!important/);
  assert.match(css, /background:\s*#f45108\s*!important/);
  assert.match(css, /sidebar-active-indicator-ready/);
  assert.doesNotMatch(css, /--desktop-dock-pages-width\s*:/);
  assert.doesNotMatch(css, /width:\s*960px/);
});

test("patch fixes dark text-on-dark-card issues in screenshot surfaces", () => {
  for (const name of ["home-item__title", "home-action__title", "stocktaking-folder-title", "next-notifications-row__main"]) {
    assert.ok(css.includes(name), `${name} lacks a themed correction`);
  }
});

test("patch is theme-gated and does not override the light workspace", () => {
  assert.doesNotMatch(css, /html\[data-theme="light"\]/);
  assert.doesNotMatch(css, /body\.next-classic-shell-active\s*\{[^}]*background:/);
  assert.match(css, /html\[data-theme="dark"\]/);
});
