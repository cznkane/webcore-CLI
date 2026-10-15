# Issue #47 — Remote operator approval foundation (review only)

Status: feature-branch design and pure policy validation; NOT a commissioned approval service. No production/native wiring.

## Trust boundary
MCP and ChatGPT are untrusted requesters, never authenticators or grant issuers. A separate browser origin with a verified human operator identity is preferred. No officially supported ChatGPT-native independent human approval authority has been demonstrated. A chat link is navigation only.

Browser -> independent TLS reverse proxy / IdP -> dedicated approval gateway -> tightly authenticated native broker endpoint. The gateway must never share the SYSTEM/MCP credential, native operator SID, or worker token. Native broker must validate the authenticated gateway identity independently, and must not accept a client-asserted identity, CSRF result, or signed claim without verification.

## Current code boundary
`server/remote-approval-policy.js` is a pure validation helper and deliberately has no HTTP listener, broker IPC, credential store, native grant issuance, or execution path. It rejects malformed scope, stale requests, identity overlap, unverified sessions, CSRF and origin mismatch. The caller-provided session fields are NOT authentication proof; only a future trusted gateway may construct them after independent verification. This code alone cannot approve anything and is not deployable.

## Native integration prerequisites (must be reviewed before coding/commissioning)
1. Choose and demonstrate a concrete passkey/WebAuthn RP and verified user-presence/UV implementation, HTTPS origin, allowlisted remote exposure and phishing-resistant credential enrollment/recovery. Bind session to RP, credential, operator ID, and recent verified assertion. Enforce secure HttpOnly SameSite cookies, CSRF tokens, Origin checks, CSP, rate limits, and no-store caching.
2. Extend native broker with a dedicated authenticated gateway principal and peer verification, distinct from SYSTEM, worker and local operator. Never grant the gateway unrestricted operator-pipe access. Pin gateway executable identity/digest and use an explicit native request/grant protocol. Do not weaken existing SID, pipe or executable checks.
3. Persist atomic one-use grant consumption and denial BEFORE execution; reject replay across broker restart, concurrent approval, expired requests, stale expected-current digest, altered target/operation/catalog digest, lost session and identity substitution. Preserve durable fail-closed audit and recovery.
4. Render exact operation, target machine, full commit, catalog SHA-256, expected-current SHA-256, request ID, expiry, current status and human identity. Require explicit Approve/Deny; never auto-approve.
5. Retain local native operator/RDP break-glass and rollback. Tunnel or IdP outage must not make emergency recovery impossible.
6. Windows integration: malicious-client, origin/CSRF, stolen session, WebAuthn UV, stale/scope swap, race/replay, broker crash, reboot, audit failure, rollback and failover tests. Validate no arbitrary commands, paths, args or environment overrides.
7. Review deployment and rollback separately. No native installation, merge, release, tunnel/network change or production cutover authorized by this PR.

## Acceptance gates
- [x] Canonical design and threat boundaries drafted
- [x] Pure request/session/scope validation and negative unit fixtures
- [ ] Independently authenticated real human WebAuthn demonstration
- [ ] Native gateway peer protocol, persistent single-use ledger and fail-closed audit
- [ ] Browser UI and secure session lifecycle
- [ ] Windows integration, security, crash/reboot and rollback tests
- [ ] CI green and independent security review
- [ ] Explicit release/deployment approval and live acceptance

Related Smart Home issue: https://github.com/cznkane/smart-home-hubitat/issues/47
