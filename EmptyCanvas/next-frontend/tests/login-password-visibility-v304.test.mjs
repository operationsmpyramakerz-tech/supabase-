import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const login = readFileSync(new URL('components/auth/LoginClient.jsx', root), 'utf8');
const css = readFileSync(new URL('public/css/login.css', root), 'utf8');
const loading = readFileSync(new URL('app/login/loading.jsx', root), 'utf8');

test('login password button preserves show/hide toggle and accessible state', () => {
  assert.match(login, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(login, /onClick=\{\(\) => setShowPassword\(\(value\) => !value\)\}/);
  assert.match(login, /aria-label=\{showPassword \? "Hide password" : "Show password"\}/);
  assert.match(login, /aria-pressed=\{showPassword\}/);
  assert.match(login, /<EyeIcon off=\{showPassword\}\s*\/>/);
  assert.equal((login.match(/className="login-password-eye-icon"/g) || []).length, 2);
});

test('visibility eye is explicitly layered and contrasted in login CSS', () => {
  assert.match(css, /\.login-container \.password-wrapper \.toggle-password\s*\{[^}]*z-index:\s*5\s*;/s);
  assert.match(css, /\.login-container \.password-wrapper \.toggle-password \.login-password-eye-icon\s*\{[^}]*display:\s*block\s*!important;[^}]*stroke:\s*#475467\s*!important;/s);
  assert.match(css, /\.login-container \.password-wrapper \.toggle-password:focus-visible\s*\{/);
  assert.match(css, /\.login-container \.password-wrapper input\[type="password"\]/);
});

test('login and login loading route request fresh css after the fix', () => {
  assert.match(login, /login\.css\?v=login-password-eye-plain-v305/);
  assert.match(loading, /login\.css\?v=login-password-eye-plain-v305/);
});


test('eye-only toggle has no visible label, frame, or hover tile', () => {
  assert.doesNotMatch(login, /className="toggle-password"\s+title=/);
  assert.match(login, /className="toggle-password" aria-label=/);
  assert.match(css, /\.login-container \.password-wrapper \.toggle-password\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(css, /\.login-container \.password-wrapper \.toggle-password:hover\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
});
