// Durable isolated WebAuthn credential and challenge store. No HTTP, MCP or native broker interface.
// Requires Node.js >=24 with built-in node:sqlite. Database directory and ACLs are deployment gates.
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
const encoded = s => typeof s==='string' && /^[A-Za-z0-9_-]{43}$/.test(s) && Buffer.from(s,'base64url').length===32 && Buffer.from(s,'base64url').toString('base64url')===s;
const digest = s => createHash('sha256').update(s).digest('hex');
export class DurableWebAuthnStore {
 #db;
 constructor(filename,{clock=()=>Date.now()}={}) {
  if(typeof filename!=='string'||!filename||filename===':memory:')throw Error('durable_database_required');
  this.clock=clock;
  this.#db=new DatabaseSync(filename);
  this.#db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS credentials (
      credential_id TEXT PRIMARY KEY, operator_id TEXT NOT NULL, public_key_pem TEXT NOT NULL,
      sign_count INTEGER NOT NULL CHECK(sign_count >= 0), revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS challenges (
      challenge_hash TEXT PRIMARY KEY, credential_id TEXT NOT NULL REFERENCES credentials(credential_id),
      expires_at INTEGER NOT NULL, consumed_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
    );`);
  this.#db.exec('PRAGMA foreign_keys=ON');
 }
 close(){this.#db.close();}
 // Enrollment is a privileged provisioning API, never callable from an assertion or MCP.
 enroll({credentialId,operatorId,publicKeyPem,signCount=0}) {
  if(!encoded(credentialId)||typeof operatorId!=='string'||!/^operator:[a-zA-Z0-9_-]{1,100}$/.test(operatorId)||
     typeof publicKeyPem!=='string'||!publicKeyPem.includes('BEGIN PUBLIC KEY')||!Number.isSafeInteger(signCount)||signCount<0)throw Error('invalid_enrollment');
  this.#db.prepare('INSERT INTO credentials(credential_id,operator_id,public_key_pem,sign_count) VALUES(?,?,?,?)').run(credentialId,operatorId,publicKeyPem,signCount);
 }
 lookup(credentialId) {
  if(!encoded(credentialId))return null;
  const r=this.#db.prepare('SELECT * FROM credentials WHERE credential_id=? AND revoked=0').get(credentialId);
  return r?{credentialId:r.credential_id,operatorId:r.operator_id,publicKeyPem:r.public_key_pem,signCount:r.sign_count}:null;
 }
 issue(credentialId,{ttlMs=120000}={}) {
  if(!encoded(credentialId)||!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>120000||!this.lookup(credentialId))throw Error('invalid_challenge_scope');
  const value=randomBytes(32).toString('base64url'),expiresAt=this.clock()+ttlMs;
  this.#db.prepare('INSERT INTO challenges(challenge_hash,credential_id,expires_at) VALUES(?,?,?)').run(digest(value),credentialId,expiresAt);
  return {value,expiresAt};
 }
 revokeCredential(credentialId) {
  if(!encoded(credentialId))throw Error('invalid_credential_id');
  this.#db.exec('BEGIN IMMEDIATE');
  try {
   this.#db.prepare('UPDATE credentials SET revoked=1 WHERE credential_id=?').run(credentialId);
   this.#db.prepare('UPDATE challenges SET revoked=1 WHERE credential_id=?').run(credentialId);
   this.#db.exec('COMMIT');
  }catch(e){this.#db.exec('ROLLBACK');throw e;}
 }
 revokeChallenge(value) {
  if(!encoded(value))throw Error('invalid_challenge');
  this.#db.prepare('UPDATE challenges SET revoked=1 WHERE challenge_hash=?').run(digest(value));
 }
 // Atomic compare-and-swap: stale counters, expired/consumed challenges and revoked credentials fail closed.
 // A zero->zero signature counter is permitted ONLY with a fresh unique challenge and UV assertion.
 consumeChallenge({challenge,credentialId,previousCount,nextCount}) {
  if(!encoded(challenge)||!encoded(credentialId)||!Number.isSafeInteger(previousCount)||!Number.isSafeInteger(nextCount)||
     previousCount<0||nextCount<0||nextCount>0xffffffff)return false;
  const now=this.clock();
  this.#db.exec('BEGIN IMMEDIATE');
  try {
   const row=this.#db.prepare(`SELECT c.sign_count,c.revoked AS credential_revoked,
      h.expires_at,h.consumed_at,h.revoked AS challenge_revoked
      FROM challenges h JOIN credentials c ON c.credential_id=h.credential_id
      WHERE h.challenge_hash=? AND h.credential_id=?`).get(digest(challenge),credentialId);
   if(!row||row.credential_revoked||row.challenge_revoked||row.consumed_at!==null||row.expires_at<=now||
      row.sign_count!==previousCount||(previousCount!==0&&nextCount<=previousCount)||
      (previousCount===0&&nextCount!==0&&nextCount<1)) {this.#db.exec('ROLLBACK');return false;}
   const u=this.#db.prepare('UPDATE credentials SET sign_count=? WHERE credential_id=? AND sign_count=? AND revoked=0').run(nextCount,credentialId,previousCount);
   const v=this.#db.prepare('UPDATE challenges SET consumed_at=? WHERE challenge_hash=? AND consumed_at IS NULL AND revoked=0').run(now,digest(challenge));
   if(u.changes!==1||v.changes!==1){this.#db.exec('ROLLBACK');return false;}
   this.#db.exec('COMMIT');return true;
  }catch(e){this.#db.exec('ROLLBACK');throw e;}
 }
}
