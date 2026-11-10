import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';

// The transport is server-only in Next; strip the marker for standalone Node tests.
const source = readFileSync(new URL('../lib/notification-smtp.js', import.meta.url), 'utf8').replace('import "server-only";', '');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { smtpUsesImplicitTls, smtpFailureReason } = await import(moduleUrl);

test('standard SMTP ports override stale Gmail secure settings', () => {
  assert.equal(smtpUsesImplicitTls(587, 'true'), false);
  assert.equal(smtpUsesImplicitTls(587, 'false'), false);
  assert.equal(smtpUsesImplicitTls(465, 'false'), true);
  assert.equal(smtpUsesImplicitTls(2525, 'true'), true);
  assert.equal(smtpUsesImplicitTls(2525, 'false'), false);
  assert.equal(smtpFailureReason({ code: 'ERR_SSL_WRONG_VERSION_NUMBER' }), 'smtp-tls-failed');
  assert.equal(smtpFailureReason({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }), 'smtp-tls-failed');
});

test('users center uses shared SMTP and prefers it over Resend', () => {
  const email = readFileSync(new URL('../lib/users-center-email.js', import.meta.url), 'utf8');
  assert.match(email, /await sendNotificationViaSmtp\(email\)/);
  assert.doesNotMatch(email, /tls\.connect|net\.connect/);
  assert.match(email, /const smtp = await sendWithSmtp\(email\);[\s\S]*const resend = await sendWithResend\(email\)/);
});

test('local SMTP delivery works with STARTTLS and implicit TLS, with certificate verification', { timeout: 25000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-smtp-test-'));
  const keyFile = join(dir, 'key.pem'), certFile = join(dir, 'cert.pem');
  try {
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'], { stdio: 'ignore' });
    const credentials = { key: readFileSync(keyFile), cert: readFileSync(certFile) };
    const context = tls.createSecureContext(credentials);
    for (const implicit of [false, true]) {
      let accepted = false, authEncrypted = false, received = '';
      const sockets = new Set();
      function session(socket, encrypted, greeting) {
        sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket));
        let buffer = '', auth = 0, data = false;
        const reply = value => socket.write(value + '\r\n');
        if (greeting) reply('220 localhost test SMTP');
        function onData(chunk) {
          buffer += chunk.toString();
          while (buffer.includes('\r\n')) {
            const index = buffer.indexOf('\r\n'); const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
            if (data) { if (line === '.') { data = false; accepted = true; reply('250 queued'); } else received += line + '\n'; continue; }
            if (line.startsWith('EHLO ')) reply(encrypted ? '250-localhost\r\n250 AUTH LOGIN' : '250-localhost\r\n250 STARTTLS');
            else if (line === 'STARTTLS') {
              socket.off('data', onData); reply('220 ready');
              const wrapped = new tls.TLSSocket(socket, { isServer: true, secureContext: context });
              session(wrapped, true, false); return;
            } else if (line === 'AUTH LOGIN') { authEncrypted = encrypted; auth = 1; reply('334 VXNlcm5hbWU6'); }
            else if (auth === 1) { assert.equal(Buffer.from(line, 'base64').toString(), 'sender@example.com'); auth = 2; reply('334 UGFzc3dvcmQ6'); }
            else if (auth === 2) { assert.equal(Buffer.from(line, 'base64').toString(), 'test-only-password'); auth = 0; reply('235 authenticated'); }
            else if (line.startsWith('MAIL FROM:') || line.startsWith('RCPT TO:')) reply('250 ok');
            else if (line === 'DATA') { data = true; reply('354 continue'); }
            else if (line === 'QUIT') { reply('221 bye'); socket.end(); }
            else reply('500 unexpected command');
          }
        }
        socket.on('data', onData);
      }
      const server = implicit ? tls.createServer(credentials, s => session(s, true, true)) : net.createServer(s => session(s, false, true));
      server.on('tlsClientError', () => {});
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      try {
        const env = { ...process.env, NODE_EXTRA_CA_CERTS: certFile, SMTP_HOST: 'localhost', SMTP_PORT: String(server.address().port), SMTP_SECURE: String(implicit), SMTP_USER: 'sender@example.com', SMTP_FROM: 'sender@example.com', SMTP_PASS: 'test-only-password' };
        delete env.NODE_TLS_REJECT_UNAUTHORIZED;
        const script = `import {sendNotificationViaSmtp} from ${JSON.stringify(moduleUrl)}; await sendNotificationViaSmtp({to:'recipient@example.com',subject:'ERP test',text:'Test message',html:'<p>Test</p>'});`;
        await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, ['--input-type=module','-e',script], { env });
          let stderr = ''; child.stderr.on('data', c => stderr += c);
          child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr || `exit ${code}`)));
        });
        assert.equal(accepted, true); assert.equal(authEncrypted, true); assert.match(received, /Subject: ERP test/);
      } finally { for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
