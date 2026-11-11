import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {labelToken,verifyLabelToken,publicLabelUrl,configuredLabelSecret,configuredPublicLabelBase,labelIdentity} from '../lib/preparing-label-token.mjs';
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const uuid='213e4567-e89b-42d3-a456-426614174000';
const alt='213e4567-e89b-42d3-a456-426614174001';
const secret='test-key-please-use-random-production-keys-123456789';
test('signed kit and carton QR links are different, deterministic, and unguessable from the UUID',()=>{
 const kit=labelToken('kit',uuid,secret),carton=labelToken('carton',uuid,secret);
 assert.match(kit,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(kit,carton);
 assert.equal(labelToken('kit',uuid,secret),kit);
 assert.ok(verifyLabelToken('kit',uuid,kit,secret));
 assert.ok(!verifyLabelToken('carton',uuid,kit,secret));
 assert.ok(!verifyLabelToken('kit',alt,kit,secret));
 assert.ok(!verifyLabelToken('kit',uuid,kit.slice(0,-1)+'_',secret));
 assert.ok(!verifyLabelToken('kit',uuid,uuid,secret));
});
test('IDs and public origins are strictly validated',()=>{
 assert.equal(labelIdentity('kit',uuid),`kit:${uuid}`);
 for(const [type,id] of [['box',uuid],['kit','../unsafe'],['carton','not-uuid']]) assert.equal(labelIdentity(type,id),null);
 const token=labelToken('kit',uuid,secret);
 assert.equal(publicLabelUrl('kit',uuid,token,'https://erp.example.org'),`https://erp.example.org/next/label/kit/${uuid}?token=${token}`);
 assert.throws(()=>publicLabelUrl('kit',uuid,token,'javascript:evil'));
 assert.throws(()=>publicLabelUrl('kit',uuid,token,'https://username:secret@erp.example.org'));
});
test('missing server QR signing secret fails closed',()=>{
 const orig=process.env.PREPARING_LABEL_QR_SECRET;
 try{delete process.env.PREPARING_LABEL_QR_SECRET;assert.throws(()=>configuredLabelSecret(),/PREPARING_LABEL_QR_SECRET/);}
 finally{if(orig===undefined)delete process.env.PREPARING_LABEL_QR_SECRET;else process.env.PREPARING_LABEL_QR_SECRET=orig;}
});
test('print endpoint is authenticated by existing per-stage read gate',()=>{
 const code=read('app/api/projects-preparing/label-print/route.js');
 assert.match(code,/getDirectAccountGate\(/);assert.match(code,/preparingStageReadGate\(/);
 assert.match(code,/readPublicLabel\(kind,id\)/);assert.match(code,/QRCode\.toBuffer\(/);assert.match(code,/Content-Type':\s*'application\/pdf'/);
});
test('public scan is HMAC protected, read-only, and contains no editable fields',()=>{
 const page=read('app/label/[kind]/[id]/page.jsx'),source=read('lib/preparing-label-content.js');
 assert.match(page,/verifyLabelToken\(/);assert.match(page,/readPublicLabel\(/);
 assert.doesNotMatch(page,/<input|<textarea|onClick=|<form/);
 assert.match(source,/generated_kit_label/);assert.match(source,/box\.school_id!==carton\.school_id/);
 assert.match(source,/packed_qty/);assert.match(source,/erp_preparing_school_carton_kits/);
});
test('both physical label details views link to the printable QR PDF endpoint',()=>{
 const box=read('components/preparing/ProjectBoxDistribution.jsx');
 const carton=read('components/preparing/SchoolKitCartons.jsx');
 assert.match(box,/label-print\?kind=kit/);assert.match(carton,/label-print\?kind=carton/);
});

test('external QR base origin must be explicitly configured, never taken from untrusted Host headers',()=>{
 const orig=process.env.PREPARING_LABEL_PUBLIC_URL;
 try{
  delete process.env.PREPARING_LABEL_PUBLIC_URL;assert.throws(()=>configuredPublicLabelBase(),/PREPARING_LABEL_PUBLIC_URL/);
  process.env.PREPARING_LABEL_PUBLIC_URL='https://erp.example.org';assert.equal(configuredPublicLabelBase(),'https://erp.example.org');
  process.env.PREPARING_LABEL_PUBLIC_URL='javascript:evil';assert.throws(()=>configuredPublicLabelBase());
 }finally{if(orig===undefined)delete process.env.PREPARING_LABEL_PUBLIC_URL;else process.env.PREPARING_LABEL_PUBLIC_URL=orig;}
});
