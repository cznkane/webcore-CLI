# Windows VM management MCP — phase 1

Status: **review only; not deployed**. The management capability is opt-in and read-only.

## Scope
The existing private MCP tunnel to Windows VM TERMINAL exposes four new fixed operations:
- `vm_status`: Windows OS, boot time, memory, system drive free bytes.
- `vm_scheduled_tasks`: state, last run, next run and last result for the two known Smart Home tasks.
- `vm_processes`: PID, parent PID, start time and executable name for node and tunnel-client processes. No command lines or credentials.
- `vm_git_status`: branch, commit and dirty-file count for the fixed `C:\\SmartHome\\webcore-CLI` checkout. No file contents or remote URLs.

All operations use embedded PowerShell scripts; callers cannot supply scripts, arguments, paths, or arbitrary commands. Operations have an eight-second timeout, a 64 KiB output cap, sanitized errors, and JSON-only responses. This phase adds no deploy, restart, rollback, task modification or Hubitat writes.

## Windows bootstrap
1. Review and merge the PR after tests pass.
2. Stage the next version beside the known-good production version; follow the canonical release runbook and Windows runtime record.
3. Set machine-scoped `WEBCORE_WINDOWS_MANAGEMENT_READONLY=enabled` for the **MCP service process** only after confirming the production Task Scheduler environment will inherit it. Do not change the existing service's credential storage or ACLs.
4. Restart the MCP task only during an approved controlled cutover, with the previous version available for rollback.
5. In a fresh ChatGPT Business chat, call `vm_status`, `vm_scheduled_tasks`, `vm_processes`, `vm_git_status`; confirm outputs contain no credentials or command lines.
6. Verify the WebCoRE status and Hubitat Maker API read paths remain healthy; record the live MCP version, runtime process, tunnel health and test evidence.

## Security boundaries
The current SYSTEM-hosted MCP process remains privileged. This phase therefore deliberately **does not** offer a generic shell, any arbitrary user-provided parameters, or write operations. A future privileged management worker must have a separate authorization boundary, signed operation requests, idempotency keys, audit records, staged release hashes, explicit human approval, and rollback verification. Do not treat MCP tool annotations as an authorization mechanism.

## Rollback
Disable the feature flag and restore the previous known-good MCP version via the canonical Windows deployment runbook. No Smart Home devices or pistons are modified by these tools.
