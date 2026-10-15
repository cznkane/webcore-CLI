import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRemoteApproval} from '../server/remote-approval-policy.js';
const now=Date.parse('2026-10-15T12:00:00Z');
const request={requestId:'a'.repeat(48),targetMachineId:'machine:terminal',nativeOperationId:'native:deploy_release',operation:'deploy_release',commit:'b'.repeat(40),sha256:'c'.repeat(64),expectedCurrentSha256:'d'.repeat(64),expiresAt:new Date(now+60000).toISOString(),status:'pending'};
const session={humanId:'operator:123',requesterId:'mcp-agent',authenticatedAt:now-1000,authMethod:'webauthn-user-verified',csrf:'secret-token',origin:'https://approvals.example.test',expiresAt:now+60000};
const submission={action:'approve',requestId:request.requestId,targetMachineId:request.targetMachineId,nativeOperationId:request.nativeOperationId,operation:request.operation,commit:request.commit,sha256:request.sha256,expectedCurrentSha256:request.expectedCurrentSha256,csrf:session.csrf};
const check=(changes={})=>validateRemoteApproval({request:{...request,...changes.request},session:{...session,...changes.session},submission:{...submission,...changes.submission},origin:changes.origin??session.origin,now});
test('exact independently authenticated scope accepted by policy only',()=>assert.equal(check().ok,true));
for(const [name,change] of Object.entries({
  expired:{request:{expiresAt:new Date(now-1).toISOString()}},
  consumed:{request:{status:'consumed'}},
  swappedDigest:{submission:{sha256:'e'.repeat(64)}},
  swappedCommit:{submission:{commit:'f'.repeat(40)}},
  swappedRequest:{submission:{requestId:'f'.repeat(48)}},
  swappedOperation:{submission:{operation:'rollback_release'}},
  swappedTarget:{submission:{targetMachineId:'machine:other'}},
  swappedNativeOperation:{submission:{nativeOperationId:'native:rollback_release'}},
  invalidNativeIdentity:{request:{nativeOperationId:'native:rollback_release'}},
  staleCurrent:{submission:{expectedCurrentSha256:'e'.repeat(64)}},
  csrf:{submission:{csrf:'bad'}},
  origin:{origin:'https://attacker.example.test'},
  http:{origin:'http://approvals.example.test',session:{origin:'http://approvals.example.test'}},
  mcpIdentity:{session:{humanId:'mcp-agent'}},
  unverified:{session:{authMethod:'password-only'}},
  staleAuth:{session:{authenticatedAt:now-180000}},
  expiredSession:{session:{expiresAt:now-1}},
  unknownOperation:{request:{operation:'powershell'}},
  extraField:{submission:{command:'whoami'}},
  extraRequest:{request:{callerArgs:'--eval'}},
  denyMismatch:{submission:{action:'other'}}
})) test('fails closed: '+name,()=>assert.equal(check(change).ok,false));
test('deny uses the same authenticated exact scope',()=>assert.deepEqual(check({submission:{action:'deny'}}).ok,true));
