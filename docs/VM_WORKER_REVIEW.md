# Windows worker review

The inert Node prototypes have been superseded and removed. Review the integrated native host, MCP adapter, installer and disposable Windows integration tests in PR #5. The security assessment and release gates are in `VM_MANAGEMENT_RELEASE_GATE.md`; installation and recovery steps are in `WINDOWS_VM_MANAGEMENT_INSTALL.md`.

No production installation, restart, task change, merge, piston execution or device operation was performed during engineering. Passing CI is necessary but does not certify installed TERMINAL state.

## Launcher correction security delta (0.4.12)

The task-bound preflight rejects backup substitution, multiple task actions, multiple config references, multiple supported pointers, unsupported launcher code, and task/process disagreement. No new operator operations, executable choices, caller inputs, identities or permissions are exposed. The only added entry point is the fixed diagnostics-enabling CommonJS adapter. Runtime file hashes still cover the complete baseline and managed code, including the adapter. Mutable source files fail before cutover; unrelated non-runtime files in the original unmanaged root do not affect managed exact-file enforcement. CI exercises direct and production-style wrapper layouts on independent disposable Windows runners. TERMINAL commissioning remains required.
