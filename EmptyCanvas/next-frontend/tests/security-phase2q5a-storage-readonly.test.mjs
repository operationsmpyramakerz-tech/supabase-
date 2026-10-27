import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseProductionAuthScopeConfig } from '../lib/production-auth-scope-probe.mjs';

const sql = readFileSync(new URL('../sql/ERP_Phase2Q5A_Production_Storage_Metadata_Readonly.sql', import.meta.url), 'utf8');

test('2Q5A: production storage audit uses bucket and catalog metadata without reading object records or performing writes', () => {
  const statements = sql.replace(/--[^\n]*/g, '');
  assert.match(statements, /\bWITH\s+snapshot\s+AS\s*\(/i);
  assert.match(statements, /\bFROM\s+storage\.buckets\b/i);
  assert.match(statements, /\bFROM\s+pg_catalog\.pg_policies\b/i);
  assert.match(statements, /\bFROM\s+pg_catalog\.pg_class\b/i);
  assert.doesNotMatch(statements, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|MERGE|GRANT|REVOKE|CALL|EXECUTE|DO|COPY)\b/i);
  assert.doesNotMatch(statements, /\b(?:FROM|JOIN)\s+storage\.objects\b/i);
  assert.doesNotMatch(statements, /(?:object_name|storage\.objects\.name|signed_url|secret_key|password|auth\.users)/i);
  assert.match(statements, /\bORDER\s+BY\s+section\s*,\s*item\s*;/i);
});

test('2Q5A: offline check-config does not waive live production consent or disclose cookies', () => {
  const env = {
    ERP_PROD_SCOPE_BASE_URL: 'https://operation.propyramakerz.com/next',
    ERP_PROD_SCOPE_EXPECTED_HOSTNAME: 'operation.propyramakerz.com',
    ERP_PROD_SCOPE_ORDER_OWN: '11',
    ERP_PROD_SCOPE_ORDER_TEAM: '22',
    ERP_PROD_SCOPE_ORDER_OUTSIDE: '33',
  };
  const cli = new URL('../scripts/security-production-auth-scope.mjs', import.meta.url).pathname;
  const offline = spawnSync(process.execPath, [cli, '--check-config'], { encoding: 'utf8', env });
  assert.equal(offline.status, 0);
  assert.match(offline.stdout, /No cookies read; no requests sent/);
  assert.throws(() => parseProductionAuthScopeConfig(env), /consent is required/);
  const live = spawnSync(process.execPath, [cli], { encoding: 'utf8', env });
  assert.equal(live.status, 2);
  assert.match(live.stderr, /consent is required/);
  const wrongHost = spawnSync(process.execPath, [cli, '--check-config'], { encoding: 'utf8', env: {
    ...env, ERP_PROD_SCOPE_BASE_URL: 'https://untrusted.example.test/next', ERP_PROD_SCOPE_EXPECTED_HOSTNAME: 'untrusted.example.test',
  }});
  assert.equal(wrongHost.status, 2);
  assert.match(wrongHost.stderr, /No cookies read; no requests sent/);
});
