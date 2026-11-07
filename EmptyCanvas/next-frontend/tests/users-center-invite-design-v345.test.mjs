import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { renderUsersCenterMemberInviteEmail } from '../lib/users-center-invite-template.js';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const ui = read('components/users-center/UsersCenterClient.jsx');
const css = read('public/css/users-center-directory-v339.css');
const emails = read('lib/users-center-email.js');

test('Add Member uses the reference tile while Add Department retains its own design', () => {
  assert.match(ui, /className="ua-add-member-card ua-add-member-card--centered"/);
  assert.match(ui, /className="ua-add-member-card ua-add-department-card"/);
  assert.match(css, /\.ua-add-member-card--centered \.ua-add-member-card__plus/);
  assert.match(css, /border: 1\.6px solid #ff7a16/);
  assert.match(css, /html\[data-theme="dark"\].*\.ua-add-member-card--centered/);
});

test('Branded invitation is wired into the existing send flow, without exposing credentials to client', () => {
  assert.match(emails, /renderUsersCenterMemberInviteEmail\(/);
  assert.match(emails, /sendWithResend\(email\)/);
  assert.match(emails, /sendWithSmtp\(email\)/);
  const html = renderUsersCenterMemberInviteEmail({
    name: '<Test & User>',
    username: 'qa@example.com',
    password: 'P<&>"',
    loginUrl: 'https://example.com/next/login',
    imageBaseUrl: 'https://example.com/next/images',
  });
  assert.match(html, /You're Invited to/);
  assert.match(html, /Pyramakerz ERP/);
  assert.match(html, /Open ERP/);
  assert.match(html, /Logo%20horizontal\.png/);
  assert.match(html, /erp-invite-illustration\.png/);
  assert.match(html, /&lt;Test &amp; User&gt;/);
  assert.match(html, /P&lt;&amp;&gt;&quot;/);
  assert.doesNotMatch(html, /<Test & User>/);
  assert.doesNotMatch(html, /P<&>"/);
  assert.match(html, /https:\/\/example\.com\/next\/login/);
});

test('Email art is included as public app assets', () => {
  for (const f of ['erp-invite-illustration.png', 'erp-invite-corner-top.png', 'erp-invite-corner-bottom.png']) {
    assert.ok(existsSync(new URL(`../public/images/${f}`, import.meta.url)), f);
  }
});
