# TERMINAL controlled installation session

Use only the final successful Windows CI artifact for the exact reviewed PR head. Do not substitute GitHub's floating branch archive. Verify the outer installation ZIP SHA-256 against the engineering handoff before executing any file; the package's internal manifest is not an independent trust anchor. Extract once to a protected administrator-owned staging directory. Never put credentials in commands or screenshots.

Prerequisites: Windows 11 Pro x64; administrator Windows PowerShell 5.1; existing Node 24; existing healthy `SmartHome-WebCoRE-MCP` under SYSTEM and enabled watchdog; protected current runtime, tunnel config and tunnel executable; all Windows Firewall profiles enabled; reviewed source merged into canonical `main` without losing the pinned candidate commit. For a squash/rebase merge, rebuild/test/package the resulting main commit rather than reusing the pre-merge identity.

The installer does not change machine execution policy. If an authorized locally downloaded script is blocked only by its Internet mark, verify the ZIP hash first, then unblock the verified extracted installer. Never use global Unrestricted/Bypass or weaken ACLs to make preflight pass.

## Do / Expect / Stop if / Verify

1. **Do:** verify and extract the pinned ZIP to `C:\ProgramData\SmartHome\VmManagementInstall-<commit>`. Use the administrator session chosen as the independent operator. **Expect:** all manifest files present and no credentials requested. **Stop if:** hash differs, archive identity is unclear, or staging is writable by ordinary users.
2. **Do:** run the installer with `-Mode Preflight -PackageRoot <extracted directory>`. **Expect:** `PREFLIGHT PASS`, no live changes. **Stop if:** any prerequisite, ownership/ACL, version, launcher/config detection, task identity or partial-install check fails. Discovery uses the existing task's single absolute `--config` reference and verifies the running Node child. An explicit `-TunnelConfigPath` must match that reference; stale backup YAML is rejected. Direct `server/index.js` and the exact reviewed `windows-readonly-launcher.cjs` wrapper are supported, including forward-slash YAML paths.
3. **Do:** after separate installation authorization, run `-Mode Install` with the same arguments. **Expect:** `INSTALL PASS`; a new limited worker account/task and a separate broker task; existing MCP/watchdog task XML and tunnel YAML unchanged. **Verify:** `-Mode Verify`. **Stop if:** verification fails, the existing read path is lost, or either management task cannot start.
4. **Do:** open the installed **Smart Home VM Approval** Start-menu shortcut (UAC), or launch `C:\ProgramData\SmartHome\VmManagement\bin\VmManagement.exe operator` from the existing administrator console. Select **Queue initial deployment**, inspect exact operation, candidate commit, manifest digest and current digest, then **Approve once** only after production cutover approval. **Expect:** consumed → succeeded, exact new Node payload, prior snapshot retained. **Stop if:** merged-source validation, tests, task/config hashes or local runtime verification fail. An operation can drop the requesting MCP session; never infer failure solely from that disconnect or replay the consumed approval.
5. **Verify:** installer `-Mode Verify`; exactly one intended tunnel and its correct Node payload; independent MCP initialize/tools identity; Business Admin refresh shows the two new read tools and one write request tool; permission policy remains **Allow read tools**. In a fresh chat invoke management health, existing WebCoRE status and read-only Maker inventory. Queue and independently approve one syntax check; inspect its result. **Expect:** correct pinned identity, clean recovery state, successful restricted validation and metadata audit. **Stop if:** any layer disagrees; preserve evidence and use the smallest corrective/recovery step.
6. **Next:** under separate approval, complete reboot and rollback commissioning, then classify predecessor/source backups and retire stale staging. Do not delete the original runtime or immediate prior snapshot before rollback and stability acceptance.

## Production rollback

From management health obtain the actual `previousCommit`, current digest and protected catalog digest. Queue `rollback_release` for that exact prior snapshot and expected current digest; independently approve once. The broker rechecks immutable files, tests, task/config drift and local process identity. Reconnect after the restart and verify prior MCP identity plus WebCoRE/Maker reads in a fresh chat. Rollback to a pre-management release can remove the new tools from the MCP inventory; the local operator/recovery path remains available.

If the tunnel/broker is unavailable or the recovery marker is uncertain, use the original verified installer in an administrator console:

```powershell
& 'C:\ProgramData\SmartHome\VmManagementInstall-<commit>\scripts\Install-VmManagement.ps1' -Mode Recover
```

**Expect:** new management tasks disabled, original protected tunnel configuration restored, original MCP task restarted and watchdog enablement restored. **Stop if:** backup hash mismatch, a tunnel remains running after stop, or the prior read path fails. Do not issue repeated speculative restarts. **Verify:** the original version and both read paths; record the actual rollback result. Recovery deliberately leaves broker mutations disabled until the incident is reviewed.

## Uninstall

First recover and verify the original runtime. Then:

```powershell
& 'C:\ProgramData\SmartHome\VmManagementInstall-<commit>\scripts\Install-VmManagement.ps1' -Mode Uninstall
```

**Expect:** only the new broker/worker tasks, new worker account and its outbound deny rule removed. Original MCP/watchdog tasks and credentials remain. Protected audit/recovery/release inventory is intentionally retained pending explicit retirement. If Windows retains the worker profile after its processes exit, a protected one-shot cleanup retires it at the next separately authorized reboot; verify that cleanup and task self-removal before declaring retirement complete. Inspect it; do not label uninstall a complete no-dust retirement until remaining artifact ownership and deletion decisions are recorded.

## Unavoidable manual actions

One administrator installation session, the independently selected operator identity, verified artifact download, the first approved cutover, plugin tool refresh and fresh-chat commissioning. Every future changing operation requires an independent scoped approval in the operator window. Routine operations do not require copying PowerShell commands. Exceptional break-glass recovery does.

## 0.4.12 commissioning correction

TERMINAL preflight of 0.4.11 failed safely before provisioning. User-provided task/process evidence established the active YAML points to `C:/SmartHome/staging/webcore-cli-0.4.10/windows-readonly-launcher.cjs`; the former content search selected a pre-release backup. The reviewed wrapper sets only `WEBCORE_WINDOWS_MANAGEMENT_READONLY=enabled` and requires adjacent `./server/index.js`. Do not patch the old verified package or edit production YAML to bypass this gate.

0.4.12 records each release entry point and exact YAML pointer representation. Protected baseline snapshots retain the original wrapper; managed wrapper deployments preserve the diagnostics flag. Archive staging adds only the fixed, compiled-in reviewed adapter (also shipped in the pinned package), includes it in the protected file catalog, and syntax-checks it. Recovery retains the original raw YAML bytes. Original unmanaged source verification checks every catalog runtime file without treating unrelated retained documentation as an extra managed payload file; managed releases still reject all unexpected files.

Fresh-install correction only: the state/catalog schema now includes entry point and pointer encoding. Existing 0.4.11 installations require separate reviewed migration; this installer does not overwrite them.

## 0.4.13 runtime permission commissioning

A TERMINAL 0.4.12 preflight stopped safely because Authenticated Users inherited Modify on the active staging runtime and tunnel executable. Default Preflight/Install still refuse writable input. After explicit permission-hardening approval, the packaged administrator-only `-Mode HardenRuntime` backs up metadata-only ACL descriptors beside the protected package, reduces foreign runtime write ACEs to read/execute, and prevents replacement through C:\SmartHome ancestor directories. Parent changes retain the original inheritable permissions for unrelated child directories. The mode does not install accounts/tasks, change credential/configuration/file contents, or restart processes. Run normal Preflight afterward. Ownership, reparse points, active task/process binding and configuration/task drift remain stop conditions.

The native broker now distinguishes immutable public runtime code (Node, tunnel executable and original source files) from confidential inputs. Read/execute access to public runtime code is acceptable; nontrusted write/delete/permission/ownership access is always rejected. Managed releases, worker Node, configuration, audit and recovery inputs retain their restrictive reader policies. Global Node permissions are not rewritten merely to satisfy an overly restrictive reader check. Retain the protected ACL backup until commissioning and rollback acceptance; do not restore known-writable production permissions casually.

## Executable Setup (0.4.15 candidate)

`Package-VmManagement.ps1` emits `SmartHome-VmManagement-Setup-<commit>.exe` and SHA-256 beside the existing ZIP. The EXE is unsigned; verify an independently supplied CI/release digest before launch. It requests UAC, embeds the pinned package, stages it in protected ProgramData and verifies both the embedded archive and each extracted file before invoking the fixed installer. No download credentials, reusable secrets or new network listener are introduced.

**Do:** double-click the verified Setup EXE in the intended operator session. **Expect:** native installation buttons and a wrapping report. Run Preflight; if inherited runtime permissions require correction, review and approve HardenRuntime, then repeat Preflight. Run Install boundary, then Verify. **Stop if:** identity/hash/ACL/prerequisite checks fail, staging already exists with differing bytes, or a partial installation is reported. Do not delete or overwrite evidence to bypass failure. **Next:** independent operator initial deployment and normal MCP/fresh-chat acceptance.

For an existing installed boundary, use Verify. Install remains validation-only and never changes existing broker binaries or credentials. New native UI requires separate reviewed migration; a Node-only MCP deployment cannot provide that update. `Prepare VM management draft release` is a manual GitHub workflow on main with a full reviewed merged commit input; it reruns checks and creates a draft release, never auto-publishes.
