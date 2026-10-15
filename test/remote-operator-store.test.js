import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {DurableWebAuthnStore} from '../server/remote-operator-store.js';
const id=()=>randomBytes(32).toString('base64url');
function fixture() {
 const dir=mkdtempSync(join(tmpdir(),'webauthn-store-')),path=join(dir,'state.sqlite');
 let now=100000;const clock=()=>now;
 const a=new DurableWebAuthnStore(path,{clock});
 const credentialId=id(),publicKeyPem=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'});
 a.enroll({credentialId,operatorId:'operator:alice',publicKeyPem,signCount:4});
 return {a,path,credentialId,clock,advance:ms=>{now+=ms},cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test('durable enrollment identity and atomic consumption across restart',()=>{const f=fixture();try{
 const challenge=f.a.issue(f.credentialId);assert.equal(f.a.lookup(f.credentialId).operatorId,'operator:alice');
 assert.equal(f.a.consumeChallenge({challenge:challenge.value,credentialId:f.credentialId,previousCount:4,nextCount:5}),true);
 f.a.close();const b=new DurableWebAuthnStore(f.path,{clock:f.clock});
 assert.equal(b.lookup(f.credentialId).signCount,5);
 assert.equal(b.consumeChallenge({challenge:challenge.value,credentialId:f.credentialId,previousCount:4,nextCount:6}),false);
 b.close();
}finally{f.cleanup()}});
test('expiration and revocation fail closed',()=>{const f=fixture();try{
 const expired=f.a.issue(f.credentialId,{ttlMs:1000});f.advance(1001);
 assert.equal(f.a.consumeChallenge({challenge:expired.value,credentialId:f.credentialId,previousCount:4,nextCount:5}),false);
 const revoked=f.a.issue(f.credentialId);f.a.revokeChallenge(revoked.value);
 assert.equal(f.a.consumeChallenge({challenge:revoked.value,credentialId:f.credentialId,previousCount:4,nextCount:5}),false);
 const pending=f.a.issue(f.credentialId);f.a.revokeCredential(f.credentialId);
 assert.equal(f.a.lookup(f.credentialId),null);
 assert.equal(f.a.consumeChallenge({challenge:pending.value,credentialId:f.credentialId,previousCount:4,nextCount:5}),false);
}finally{f.a.close();f.cleanup()}});
test('counter CAS rejects stale concurrent requests and credential substitution',()=>{const f=fixture();try{
 const first=f.a.issue(f.credentialId),second=f.a.issue(f.credentialId);
 const other=id();const pem=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'});
 f.a.enroll({credentialId:other,operatorId:'operator:bob',publicKeyPem:pem});
 assert.equal(f.a.consumeChallenge({challenge:first.value,credentialId:other,previousCount:0,nextCount:1}),false);
 const attempts=[first,second].map(x=>f.a.consumeChallenge({challenge:x.value,credentialId:f.credentialId,previousCount:4,nextCount:5}));
 assert.deepEqual(attempts,[true,false]);
}finally{f.a.close();f.cleanup()}});
test('strict challenge encoding and lifecycle',()=>{const f=fixture();try{
 const x=f.a.issue(f.credentialId);assert.match(x.value,/^[A-Za-z0-9_-]{43}$/);
 for(const bad of ['abc','a'.repeat(43)+'=',id()+'x','../evil',''])assert.equal(f.a.consumeChallenge({challenge:bad,credentialId:f.credentialId,previousCount:4,nextCount:5}),false);
 assert.throws(()=>f.a.issue(f.credentialId,{ttlMs:500000}));
 assert.equal(f.a.consumeChallenge({challenge:x.value,credentialId:f.credentialId,previousCount:4,nextCount:5}),true);
 assert.equal(f.a.consumeChallenge({challenge:x.value,credentialId:f.credentialId,previousCount:5,nextCount:6}),false);
}finally{f.a.close();f.cleanup()}});
test('zero counters: allow zero-to-zero with fresh challenge, reject replay',()=>{const f=fixture();try{
 const zero=id(),pem=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'});
 f.a.enroll({credentialId:zero,operatorId:'operator:zero',publicKeyPem:pem});
 const x=f.a.issue(zero);assert.equal(f.a.consumeChallenge({challenge:x.value,credentialId:zero,previousCount:0,nextCount:0}),true);
 assert.equal(f.a.consumeChallenge({challenge:x.value,credentialId:zero,previousCount:0,nextCount:0}),false);
 const y=f.a.issue(zero);assert.equal(f.a.consumeChallenge({challenge:y.value,credentialId:zero,previousCount:0,nextCount:0}),true);
}finally{f.a.close();f.cleanup()}});
test('duplicate credential enrollment cannot silently change operator',()=>{const f=fixture();try{
 assert.throws(()=>f.a.enroll({credentialId:f.credentialId,operatorId:'operator:mallory',publicKeyPem:'-----BEGIN PUBLIC KEY-----'}));
 assert.equal(f.a.lookup(f.credentialId).operatorId,'operator:alice');
}finally{f.a.close();f.cleanup()}});
