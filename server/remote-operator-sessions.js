// In-memory, unexposed session foundation; trusted verifier is the sole source of operator identity.
// Restart invalidates all sessions. No HTTP listener and no broker connection.
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {verifyOperatorAssertion} from './remote-operator-webauthn.js';
const token=()=>randomBytes(32).toString('base64url');
const digest=v=>createHash('sha256').update(v).digest();
export class RemoteOperatorSessions {
 #sessions=new Map();
 constructor({origin,rpId,credentialLookup,consumeChallenge,clock=()=>Date.now()}) {
  if(!origin?.startsWith('https://')||new URL(origin).hostname!==rpId||typeof credentialLookup!=='function'||typeof consumeChallenge!=='function')throw Error('invalid_gateway_config');
  Object.assign(this,{origin,rpId,credentialLookup,consumeChallenge,clock});
 }
 async authenticate({assertion,challenge}) {
  const credential=await this.credentialLookup(assertion?.rawId);
  const verified=await verifyOperatorAssertion({assertion,credential,challenge,expectedOrigin:this.origin,rpId:this.rpId,now:this.clock(),consumeChallenge:this.consumeChallenge});
  if(!verified)return null;
  const sessionToken=token(),csrf=token(),now=this.clock();
  this.#sessions.set(digest(sessionToken).toString('hex'),Object.freeze({...verified,csrf,origin:this.origin,expiresAt:now+120000}));
  return {sessionToken,csrf,expiresAt:now+120000};
 }
 get(sessionToken) {
  if(typeof sessionToken!=='string'||sessionToken.length!==43)return null;
  const key=digest(sessionToken).toString('hex'),session=this.#sessions.get(key);
  if(!session||session.expiresAt<=this.clock()){this.#sessions.delete(key);return null;}
  return session;
 }
 revoke(sessionToken){if(typeof sessionToken==='string')this.#sessions.delete(digest(sessionToken).toString('hex'));}
}
