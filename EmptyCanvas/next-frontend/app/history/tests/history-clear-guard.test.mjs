import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../../../app/api/history/route.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../../../components/history/HistoryDialogs.jsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../../components/history/HistoryClient.jsx', import.meta.url), 'utf8');

test('clearing is authorized and a persisted marker is created before destructive DELETE', () => {
  const fromDelete = api.slice(api.indexOf('export async function DELETE('));
  assert.match(fromDelete, /featureGate\(gate, "history.clear"\)/);
  assert.match(fromDelete, /adminPassword/);
  const loggedAt = fromDelete.indexOf('const marker = await recordHistoryForAccount(');
  const deletedAt = fromDelete.indexOf('await supabaseRequest(`/${encodeURIComponent(table)}?id=neq.');
  assert.ok(loggedAt >= 0 && deletedAt > loggedAt, 'audit marker must be committed before deletion');
  assert.doesNotMatch(fromDelete, /id=not\.is\.null/);
  assert.match(fromDelete, /if \(!\/\^\[a-zA-Z0-9-\]\{1,100\}\$\/\.test\(protectedId\)\)/);
  assert.match(fromDelete, /await updateById\(table, protectedId,/);
});

test('client reloads the retained audit entry, and confirmation describes retention truthfully', () => {
  assert.match(modal, /A record of who cleared History and when will be retained/);
  assert.match(client, /void loadRecent\(\{ silent: true \}\);/);
  assert.match(client, /administrator's clearing event remains in History/);
});
