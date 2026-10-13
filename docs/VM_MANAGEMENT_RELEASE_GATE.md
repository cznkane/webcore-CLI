# Windows VM management release gate

Status: integrated release candidate, PR #5. NOT installed on TERMINAL. Merge and production commissioning require Rick's separate approval. Release identity is the exact PR head and the Windows CI installation-artifact SHA-256, not a floating branch name.

## Integrated implementation

The earlier disconnected Node worker scaffolds and their prototype-only tests were removed. The production boundary is `windows/VmManagement/{Common,Job,Host}.cs`, compiled as a .NET Framework 4.x x64 executable. `server/vm-management-client.js` is the sole MCP adapter. It invokes only the protected fixed executable in `client` mode, passing a validated bounded metadata request through stdin. It does not run npm, PowerShell, user commands or test code as SYSTEM.

| Boundary | Identity / authorization | Responsibility |
|---|---|---|
| Existing tunnel/MCP | Existing SYSTEM task, preserved | Existing WebCoRE functions; fixed management client |
| Management broker | Separate SYSTEM scheduled task | Immutable catalog, approval consumption, audit, fixed service/pointer transactions |
| Test worker | Dedicated local account, Limited task, no administrator membership | Verified tests and syntax only; fresh environment; private writable scratch |
| Operator channel | Exact installer-selected human SID and protected host executable | One-use, operation/commit/digest/current-state approval; five-minute expiry |

Only six operations exist: `run_webcore_tests`, `run_webcore_syntax_check`, `stage_release`, `deploy_release`, `rollback_release`, `restart_mcp`. Every operation requires independent approval. Existing four VM diagnostic tools retain their read-only behavior. An administrator-owned commissioning marker enables the adapter only after installation verification; uninstall removes it and tool listing drops management capabilities without a production restart. Three management tools appear after installation: health and request-status reads, plus a changing request tool. No MCP approval tool exists. The request tool is marked write/destructive and open-world because release staging contacts the fixed canonical GitHub source; health and status remain read-only.

## Security review

- The worker receives only `PROCESS_QUERY_LIMITED_INFORMATION` on the broker process so it can verify the peer executable. It receives no process-memory, token, thread-creation or debug access. Batch logon is explicitly granted to the new account; interactive, remote-interactive and network logons are explicitly denied.
- Native pipes have protected DACLs, reject remote clients, hold a single first instance, verify client token SID and executable hash, and verify server PID/token SID/executable hash. No TCP listener is added. Frames, nesting and total response size are bounded. An incomplete request expires; fail-closed process exit is recovered by Task Scheduler.
- Approval authority is the human channel, never a caller-provided `confirm` flag or reusable bearer token. The broker binds operation, commit, digest and expected current release to a random request ID. Approval is consumed before audit/execution. Replays, expired requests, forged IDs and stale state fail. A broker restart invalidates all pending approvals; there is no automatic retry of a consumed operation.
- Installer source directories and their ancestors must resist non-administrator replacement; every component is verified before privileged helper code is loaded. Release sources and Node binaries are hash-pinned, owner/DACL checked, and protected against worker mutation. ADS, relative paths and reparse points are rejected. Catalogs are admin/SYSTEM-owned; callers cannot supply paths, arguments or environments. Staging accepts only canonical-repository commits reachable from `main`; download source and network hosts are fixed. Archive hash, entries, symlinks, expanded size, dependencies, syntax and tests are checked before use.
- Processes start suspended and are assigned to a kill-on-close Job Object before resuming. Process count and memory are bounded; timeouts terminate the entire job and verify zero remaining active processes. Worker crash also closes the job. No breakaway flag or shell is allowed.
- The worker receives no inherited credentials, profile or Node options. It cannot read tunnel configuration, original recovery secrets or audit files. A worker-SID outbound block applies across all firewall profiles. The account password is random and retained only by Windows Task Scheduler's credential facility, never chat, Git or installer files. New account creation does not add administrator membership.
- Audit is flushed JSONL metadata, rotated by UTC date and protected from the worker. Request, admission failure, approval consumption, execution and outcome are recorded without credentials, commands, environments or process output. An unavailable audit destination prevents execution. No automatic audit deletion occurs; backup/retention remains an operator responsibility.
- Cutover checks task XML/configuration/executable drift, backs up the exact YAML, writes a durable recovery marker, temporarily inhibits the existing watchdog, stops the exact existing task, changes only the selected payload path, restarts, and verifies the expected Node executable/payload under the single tunnel process. Watchdog enablement is restored in `finally`. Local failure restores the previous YAML and restarts the prior payload. An uncertain crash leaves mutations blocked for independent recovery.

### Explicit trust limits

This is a Windows privilege boundary, not protection against an already compromised SYSTEM principal or local administrator. Existing MCP already runs as SYSTEM. Such a principal can replace privileged code, impersonate users or alter ACLs. The installer does not elevate MCP further, but cannot remove that pre-existing trust. Migrating the tunnel/MCP to a restricted service identity is a separate architecture change; no silent migration is included.

A release test suite is executable trusted code, not an untrusted-code sandbox. Its approved immutable release is part of the authorization. Firewall protection and NTFS permissions must remain enforced. The host is unsigned; provenance is the reviewed pinned source, Windows build artifact and externally verified package digest, not Authenticode.

Raw stdout/stderr are deliberately suppressed rather than returned or logged. Results include operation scope, exit status, duration, timeout and output-suppression metadata. This is an explicit privacy choice: failures are investigated against the reviewed source and protected metadata, not by exposing arbitrary test output through MCP.

Operator approvals use an administrator approval window on TERMINAL (or the operator's authenticated remote-desktop session). This is a recurring independent approval click, not a PowerShell relay. An unattended remote approval portal is not included. If the tunnel is down, the existing watchdog and the local recovery command remain the out-of-band path.

## Evidence requirements

Both workflows must pass on the same pinned final commit. Windows validation must compile the actual native host, test real pipe peer/DACL behavior, exercise real Job Objects, install under an actual limited account, verify protected reads/writes, scoped approval/replay, service restart, merged archive staging, deployment, prior-release rollback, recovery and uninstall. Mocked Node prototype tests do not substitute for these gates.

Windows hosted CI is not production evidence for TERMINAL. At commissioning, prove installed hashes/ACLs, actual tasks, live Node payload, MCP initialize/tools, tunnel, preserved watchdog and fresh-chat read/management acceptance. Reboot acceptance and live rollback are controlled commissioning gates; no production change or device test is authorized by this document.

## Installation and lifecycle

`Build-VmManagement.ps1` builds with the Windows .NET Framework compiler, without npm/NuGet dependencies. `Package-VmManagement.ps1` includes all runtime/compatibility manifests, installer, binary and per-file manifest in one pinned ZIP. The Windows workflow publishes the ZIP and SHA-256 only after validation succeeds.

`Install-VmManagement.ps1` defaults to `Preflight`; `Install` provisions only the management boundary and retains existing runtime files/task definitions/configuration/credentials. Repeating installation validates the existing installation and makes no changes. Unexpected pre-existing accounts/tasks, partial installation, ambiguous launch/config paths, mutable inputs, runtime identity changes or drift stop the procedure. Initial deployment is queued through the independent operator channel and is subject to normal merged-source, tests and cutover gates.

`Recover` disables the new broker/worker and restores the protected original tunnel YAML while preserving the existing task identities. The original source tree is intentionally retained as the initial break-glass runtime. `Uninstall` refuses while the tunnel selects a managed payload, removes only new management tasks/account/profile/logon rights/firewall rule/shortcut, and retains protected recovery/audit inventory for review. If Windows retains a loaded batch-logon hive after all worker processes exit, account retirement schedules a protected one-shot profile cleanup at next startup; no forced hive unload or immediate VM reboot occurs. This retained item has an explicit owner/retirement condition. Retirement of retained release/recovery material is a separate explicit no-dust decision after production acceptance.
