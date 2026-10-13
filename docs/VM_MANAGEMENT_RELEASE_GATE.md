# Controlled Windows VM management: release gate

**Status: design/implementation in progress; not approved for production.**

## Acceptance criterion
The operator can request diagnostics, validation, release staging, approved deployment, restart and rollback through ChatGPT without manually transporting commands or files. Production-changing actions require explicit, operation-specific approval.

## Trust boundaries
1. Existing SYSTEM-level MCP service remains read-only for VM management. It cannot mint approvals, accept arbitrary commands, or spawn an execution worker.
2. A dedicated restricted Windows identity runs the worker, with no administrator privileges, no access to tunnel or MCP credentials, and no write access to verified release inputs.
3. A separate trusted operator approval channel issues one-use, short-lived, operation-and-release-bound grants. ChatGPT/MCP cannot self-approve.
4. Authenticated local IPC authorizes each request, enforces caller identity, bounds message size, and rejects replays. No network listener or shell.
5. All executables and working directories are provisioned from trusted machine-local configuration, not from the request. Verify immutable release manifests and protected ACLs before execution; prevent symlink/reparse escapes and time-of-check/time-of-use replacement.
6. Windows Job Objects enforce kill-on-close, process count and duration bounds. Node child.kill alone does **not** meet this requirement.
7. Audit logs are append-only, ACL-protected and fail closed when unavailable. Never record secrets, stdout/stderr or command environment.
8. Separate deployment identity/permissions are required for controlled service restart, version switch and rollback. Do not grant the test worker administrative rights.

## Required validation
- GitHub CI green for full suite and management tests.
- Windows integration tests under actual restricted identity and real NTFS ACLs.
- Negative tests: unauthorized caller, expired/replayed approval, mismatched digest, mutable release, path/reparse attacks, wrong executable, overlapping requests, worker crash, audit write failure, timeout and descendant process survival.
- Confirm current MCP tunnel and watchdog recover correctly after controlled failure.
- Document exact install, preflight, backup, canary, health check and rollback commands with stop conditions.

## Production change control
A draft PR or a general project-level go-ahead is not authorization to modify TERMINAL. Present the exact change set, expected outcome, stop conditions and rollback. Obtain separate explicit approval for the actual installation/deployment. Until then, keep VM execution tools unregistered.
