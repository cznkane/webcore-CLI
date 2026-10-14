# Windows worker review

The inert Node prototypes have been superseded and removed. Review the integrated native host, MCP adapter, installer and disposable Windows integration tests in PR #5. The security assessment and release gates are in `VM_MANAGEMENT_RELEASE_GATE.md`; installation and recovery steps are in `WINDOWS_VM_MANAGEMENT_INSTALL.md`.

No production installation, restart, task change, merge, piston execution or device operation was performed during engineering. Passing CI is necessary but does not certify installed TERMINAL state.

## Launcher correction security delta (0.4.12)

The task-bound preflight rejects backup substitution, multiple task actions, multiple config references, multiple supported pointers, unsupported launcher code, and task/process disagreement. No new operator operations, executable choices, caller inputs, identities or permissions are exposed. The only added entry point is the fixed diagnostics-enabling CommonJS adapter. Runtime file hashes still cover the complete baseline and managed code, including the adapter. Mutable source files fail before cutover; unrelated non-runtime files in the original unmanaged root do not affect managed exact-file enforcement. CI exercises direct and production-style wrapper layouts on independent disposable Windows runners. TERMINAL commissioning remains required.

## Immutable public-runtime reader policy (0.4.13)

Public installed executables need not be confidential. A dedicated ProtectedRuntime validator permits foreign read-only ACEs but preserves owner, no-reparse and write/delete/ACL/ownership checks. Only original unmanaged source files and the pre-existing global Node/tunnel binaries use it. Managed payload/worker inputs, credential-bearing configuration and metadata audit still use the strict validator. Native checks prove public readers accepted, public writers denied and confidential readers denied. Administrator-only permission hardening is an explicit installation mode, never an MCP operation or automatic Preflight/Install repair. Disposable Windows integration begins with Authenticated Users Modify on runtime code and a replaceable parent, then proves explicit hardening, idempotence, byte/process preservation and unchanged sibling permissions before the normal security/release lifecycle.

## SID-only ACL inspection (0.4.14)

TERMINAL hardening completed its ACL rewrite but a subsequent ancestor check failed resolving an account name to a SID. All installer access-rule checks now request SecurityIdentifier rules directly, and the TrustedInstaller authority uses its fixed Windows service SID. Unresolvable account names never waive permission checks; every numeric foreign SID is checked against the same rights masks. Runtime/tunnel/Node ancestor checks run inside the ACL restoration transaction. Windows integration includes an unresolvable numeric SID with runtime Modify and ancestor read permissions. The earlier protected ACL backup remains recovery evidence; no production cutover or installation was performed.

## Executable package and operator readability (0.4.15 candidate)

The UAC Setup EXE contains only source-pinned package bytes and an embedded SHA-256, with no embedded credentials. Extraction checks protected trusted staging/ancestors, rejects reparse/traversal/symlink entries, bounds entries/bytes and verifies extracted content against the immutable embedded archive rather than a caller-supplied manifest. Reuse validates; no overwrite or automatic retry. There is no caller-selected installer command or arbitrary shell mode. GUI administrator actions require local confirmation, and production cutover still requires an independent broker grant. Existing installation is validation-only; native-boundary migration is outside this package.

The native approval UI now separates concise operation/status rows from read-only wrapping complete scope/outcome details. Approve/Deny sends only the same selected immutable request ID; broker authentication and scope checks are unchanged. The Start-menu link targets a public Windows PowerShell binary with the documented shell-link elevation flag, then invokes only the fixed protected operator host. No ordinary-user read/write permissions are added to management code/config/audit. Unsigned artifact trust remains an external pinned-CI/release digest requirement.
