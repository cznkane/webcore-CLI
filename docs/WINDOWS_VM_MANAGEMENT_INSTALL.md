# TERMINAL controlled installation session

Use only the final successful Windows CI artifact for the exact reviewed PR head. Do not substitute GitHub's floating branch archive. Verify the outer installation ZIP SHA-256 against the engineering handoff before executing any file; the package's internal manifest is not an independent trust anchor. Extract once to a protected administrator-owned staging directory. Never put credentials in commands or screenshots.

Prerequisites: Windows 11 Pro x64; administrator Windows PowerShell 5.1; existing Node 24; existing healthy `SmartHome-WebCoRE-MCP` under SYSTEM and enabled watchdog; protected current runtime, tunnel config and tunnel executable; all Windows Firewall profiles enabled; reviewed source merged into canonical `main` without losing the pinned candidate commit. For a squash/rebase merge, rebuild/test/package the resulting main commit rather than reusing the pre-merge identity.

The installer does not change machine execution policy. If an authorized locally downloaded script is blocked only by its Internet mark, verify the ZIP hash first, then unblock the verified extracted installer. Never use global Unrestricted/Bypass or weaken ACLs to make preflight pass.

## Do / Expect / Stop if / Verify

1. **Do:** verify and extract the pinned ZIP to `C:\SmartHome\staging\vm-management-<commit>`. Use the administrator session chosen as the independent operator. **Expect:** all manifest files present and no credentials requested. **Stop if:** hash differs, archive identity is unclear, or staging is writable by ordinary users.
2. **Do:** run the installer with `-Mode Preflight -PackageRoot <extracted directory>`. **Expect:** `PREFLIGHT PASS`, no live changes. **Stop if:** any prerequisite, ownership/ACL, version, launcher/config detection, task identity or partial-install check fails. Supply `-TunnelConfigPath` only if automatic discovery is ambiguous; establish the exact existing path locally without displaying its contents.
3. **Do:** after separate installation authorization, run `-Mode Install` with the same arguments. **Expect:** `INSTALL PASS`; a new limited worker account/task and a separate broker task; existing MCP/watchdog task XML and tunnel YAML unchanged. **Verify:** `-Mode Verify`. **Stop if:** verification fails, the existing read path is lost, or either management task cannot start.
4. **Do:** launch `C:\ProgramData\SmartHome\VmManagement\bin\VmManagement.exe operator` elevated. Select **Queue initial deployment**, inspect exact operation, candidate commit, manifest digest and current digest, then **Approve once** only after production cutover approval. **Expect:** consumed → succeeded, exact new Node payload, prior snapshot retained. **Stop if:** merged-source validation, tests, task/config hashes or local runtime verification fail. An operation can drop the requesting MCP session; never infer failure solely from that disconnect or replay the consumed approval.
5. **Verify:** installer `-Mode Verify`; exactly one intended tunnel and its correct Node payload; independent MCP initialize/tools identity; Business Admin refresh shows the two new read tools and one write request tool; permission policy remains **Allow read tools**. In a fresh chat invoke management health, existing WebCoRE status and read-only Maker inventory. Queue and independently approve one syntax check; inspect its result. **Expect:** correct pinned identity, clean recovery state, successful restricted validation and metadata audit. **Stop if:** any layer disagrees; preserve evidence and use the smallest corrective/recovery step.
6. **Next:** under separate approval, complete reboot and rollback commissioning, then classify predecessor/source backups and retire stale staging. Do not delete the original runtime or immediate prior snapshot before rollback and stability acceptance.

## Production rollback

From management health obtain the actual `previousCommit`, current digest and protected catalog digest. Queue `rollback_release` for that exact prior snapshot and expected current digest; independently approve once. The broker rechecks immutable files, tests, task/config drift and local process identity. Reconnect after the restart and verify prior MCP identity plus WebCoRE/Maker reads in a fresh chat. Rollback to a pre-management release can remove the new tools from the MCP inventory; the local operator/recovery path remains available.

If the tunnel/broker is unavailable or the recovery marker is uncertain, use the original verified installer in an administrator console:

```powershell
& 'C:\SmartHome\staging\vm-management-<commit>\scripts\Install-VmManagement.ps1' -Mode Recover
```

**Expect:** new management tasks disabled, original protected tunnel configuration restored, original MCP task restarted and watchdog enablement restored. **Stop if:** backup hash mismatch, a tunnel remains running after stop, or the prior read path fails. Do not issue repeated speculative restarts. **Verify:** the original version and both read paths; record the actual rollback result. Recovery deliberately leaves broker mutations disabled until the incident is reviewed.

## Uninstall

First recover and verify the original runtime. Then:

```powershell
& 'C:\SmartHome\staging\vm-management-<commit>\scripts\Install-VmManagement.ps1' -Mode Uninstall
```

**Expect:** only the new broker/worker tasks, new worker account and its outbound deny rule removed. Original MCP/watchdog tasks and credentials remain. Protected audit/recovery/release inventory is intentionally retained pending explicit retirement. Inspect it; do not label uninstall a complete no-dust retirement until remaining artifact ownership and deletion decisions are recorded.

## Unavoidable manual actions

One administrator installation session, the independently selected operator identity, verified artifact download, the first approved cutover, plugin tool refresh and fresh-chat commissioning. Every future changing operation requires an independent scoped approval in the operator window. Routine operations do not require copying PowerShell commands. Exceptional break-glass recovery does.
