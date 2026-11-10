import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import tls from 'node:tls';
const source = readFileSync(new URL('../lib/notification-smtp.js', import.meta.url), 'utf8').replace('import "server-only";', '');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const message = 'From: sender@example.com\r\nTo: target@example.com\r\nSubject: Test\r\n\r\nHello مرحبا\r\n';
const { archiveSmtpMessage } = await import(moduleUrl);
test('archiving is disabled unless explicitly enabled', async () => {
  delete process.env.IMAP_SAVE_SENT;
  assert.deepEqual(await archiveSmtpMessage(message), { status: 'disabled' });
});
test('TLS IMAP APPEND discovers Sent, preserves bytes, handles override and rejection', {timeout: 20000}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'erp-imap-test-'));
  const keyFile = join(dir, 'key.pem'), certFile = join(dir, 'cert.pem');
  try {
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'], {stdio:'ignore'});
    for (const mode of ['special','fallback','override','reject']) {
      let appended, appendCount = 0;
      const sockets = new Set();
      const server = tls.createServer({key:readFileSync(keyFile),cert:readFileSync(certFile)}, socket => {
        sockets.add(socket); socket.on('error',()=>{}); socket.on('close',()=>sockets.delete(socket));
        let buffer = Buffer.alloc(0), literalSize = null, appendTag;
        socket.write('* OK test IMAP\r\n');
        socket.on('data', chunk => {
          buffer = Buffer.concat([buffer,chunk]);
          for (;;) {
            if (literalSize !== null) {
              if (buffer.length < literalSize+2) return;
              appended = buffer.subarray(0,literalSize); buffer = buffer.subarray(literalSize+2); literalSize = null;
              socket.write(`${appendTag} OK appended\r\n`); continue;
            }
            const n = buffer.indexOf('\r\n'); if(n<0)return;
            const line = buffer.subarray(0,n).toString(); buffer=buffer.subarray(n+2);
            const tag = line.split(' ')[0];
            if(line.includes(' LOGIN ')) { assert.equal(line, `${tag} LOGIN "sender@example.com" "test\\"pass"`); socket.write(`${tag} OK login\r\n`); }
            else if(line.includes(' LIST ')) { assert.notEqual(mode,'override'); socket.write(`* LIST (\\HasNoChildren${mode==='special'||mode==='reject'?' \\Sent':''}) "." "INBOX.Sent"\r\n${tag} OK list\r\n`); }
            else if(line.includes(' APPEND ')) {
              appendCount++; const expected = mode==='override'?'Sent Items':'INBOX.Sent';
              assert.equal(line,`${tag} APPEND "${expected}" (\\Seen) {${Buffer.byteLength(message)}}`);
              if(mode==='reject') {socket.write(`${tag} NO [TRYCREATE] rejected\r\n`); continue;}
              appendTag=tag; literalSize=Buffer.byteLength(message); socket.write('+ ready\r\n');
            } else if(line.includes(' LOGOUT')) {socket.end(`* BYE bye\r\n${tag} OK logout\r\n`);}
          }
        });
      });
      server.on('tlsClientError',()=>{});
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      try {
        const env={...process.env,NODE_EXTRA_CA_CERTS:certFile,IMAP_SAVE_SENT:'true',IMAP_HOST:'localhost',IMAP_PORT:String(server.address().port),SMTP_USER:'sender@example.com',SMTP_PASS:'test"pass',IMAP_SENT_FOLDER:mode==='override'?'Sent Items':''};
        delete env.IMAP_USER;delete env.IMAP_PASS;delete env.NODE_TLS_REJECT_UNAUTHORIZED;
        const script=`import {archiveSmtpMessage} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await archiveSmtpMessage(${JSON.stringify(message)})));`;
        const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script],{env});let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(new Error(err)));});
        assert.equal(appendCount,1);
        if(mode==='reject'){assert.deepEqual(result,{status:'failed',code:'IMAP_APPEND_FAILED'});assert.equal(appended,undefined);}
        else {assert.deepEqual(result,{status:'saved'});assert.deepEqual(appended,Buffer.from(message));}
      } finally {for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
