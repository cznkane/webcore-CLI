import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign,randomBytes} from 'node:crypto';
import {verifyOperatorAssertion} from '../server/remote-operator-webauthn.js';
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const rpId='approvals.example.test',origin='https://approvals.example.test';
const enc=b=>Buffer.from(b).toString('base64url'),digest=b=>createHash('sha256').update(b).digest();
const credential={operatorId:'operator:123',credentialId:enc(randomBytes(32)),publicKeyPem:publicKey.export({type:'spki',format:'pem'}),signCount:4};
function fixture(overrides={}) {
 const challenge={value:enc(randomBytes(32)),expiresAt:200000};
 const client={type:'webauthn.get',challenge:challenge.value,origin,crossOrigin:false,...overrides.client};
 const bytes=Buffer.from(JSON.stringify(client)),auth=Buffer.concat([digest(overrides.rpId??rpId),Buffer.from([overrides.flags??5]),Buffer.from([0,0,0,overrides.count??5])]);
 const signature=sign('sha256',Buffer.concat([auth,digest(bytes)]),privateKey);
 return {assertion:{rawId:credential.credentialId,response:{clientDataJSON:enc(bytes),authenticatorData:enc(auth),signature:enc(signature)}},credential:{...credential,...overrides.credential},challenge,expectedOrigin:overrides.expectedOrigin??origin,rpId,now:100000,consumeChallenge:overrides.consumeChallenge??(async()=>true)};
}
test('verified signed assertion returns operator identity',async()=>assert.equal((await verifyOperatorAssertion(fixture()))?.operatorId,'operator:123'));
for(const [name,override] of Object.entries({
 origin:{client:{origin:'https://evil.example.test'}},rp:{rpId:'evil.example.test'},uv:{flags:1},
 counter:{count:4},wrongCredential:{credential:{credentialId:enc(randomBytes(32))}},
 identitySwap:{credential:{publicKeyPem:generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({type:'spki',format:'pem'})}},
 consumed:{consumeChallenge:async()=>false},expired:{}
}))test('rejects '+name,async()=>{const x=fixture(override);if(name==='expired')x.challenge.expiresAt=99999;assert.equal(await verifyOperatorAssertion(x),null)});
test('rejects assertion replay after atomic challenge consumption',async()=>{let used=false;const x=fixture({consumeChallenge:async()=>{if(used)return false;used=true;return true}});assert.ok(await verifyOperatorAssertion(x));assert.equal(await verifyOperatorAssertion(x),null)});
test('rejects modified signature',async()=>{const x=fixture();x.assertion.response.signature=enc(randomBytes(64));assert.equal(await verifyOperatorAssertion(x),null)});
