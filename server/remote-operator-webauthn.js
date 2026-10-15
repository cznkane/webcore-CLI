// Isolated WebAuthn assertion verifier. No HTTP listener, approval issuance or native IPC.
// Credential enrollment and challenge storage must be supplied by a separately trusted gateway.
import {createHash, createPublicKey, verify as verifySignature, timingSafeEqual} from 'node:crypto';
const b64url = value => { if(typeof value!=='string'||! /^[A-Za-z0-9_-]+$/.test(value)) throw Error('invalid_encoding'); return Buffer.from(value,'base64url'); };
const same=(a,b)=>a.length===b.length&&timingSafeEqual(a,b);
const hash=s=>createHash('sha256').update(s).digest();
export async function verifyOperatorAssertion({assertion, credential, challenge, expectedOrigin, rpId, now=Date.now(), consumeChallenge}) {
  try {
    if(!assertion||!credential||typeof consumeChallenge!=='function'||typeof expectedOrigin!=='string'||!expectedOrigin.startsWith('https://')||typeof rpId!=='string'||!rpId) throw Error('invalid_context');
    if(typeof credential.operatorId!=='string'||!credential.operatorId||typeof credential.publicKeyPem!=='string'||!Number.isSafeInteger(credential.signCount)||credential.signCount<0) throw Error('credential');
    if(typeof challenge!=='object'||typeof challenge.value!=='string'||!Number.isFinite(challenge.expiresAt)||challenge.expiresAt<=now) throw Error('challenge');
    const raw=b64url(assertion.rawId),clientBytes=b64url(assertion.response.clientDataJSON),auth=b64url(assertion.response.authenticatorData),sig=b64url(assertion.response.signature);
    if(!same(raw,b64url(credential.credentialId))||auth.length<37||sig.length<8) throw Error('credential_mismatch');
    const client=JSON.parse(clientBytes.toString('utf8'));
    if(client.type!=='webauthn.get'||client.origin!==expectedOrigin||client.crossOrigin!==false&&client.crossOrigin!==undefined||!same(b64url(client.challenge),b64url(challenge.value))) throw Error('client_mismatch');
    if(!same(auth.subarray(0,32),hash(rpId))||(auth[32]&0x05)!==0x05) throw Error('rp_or_user_verification'); // UP and UV required
    const counter=auth.readUInt32BE(33);
    if(credential.signCount>0&&counter<=credential.signCount) throw Error('counter_replay');
    const key=createPublicKey(credential.publicKeyPem);
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1') throw Error('unsupported_key');
    if(!verifySignature('sha256',Buffer.concat([auth,hash(clientBytes)]),key,sig)) throw Error('bad_signature');
    // Trusted store must atomically consume challenge and persist updated counter before a session is issued.
    if(await consumeChallenge({challenge:challenge.value,credentialId:credential.credentialId,previousCount:credential.signCount,nextCount:counter})!==true) throw Error('consumed');
    return Object.freeze({operatorId:credential.operatorId,credentialId:credential.credentialId,authenticatedAt:now,authMethod:'webauthn-user-verified'});
  }catch{return null;}
}
