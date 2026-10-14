# Smart Home VM Management executable installation package

The native x64 Setup EXE embeds the exact pinned ZIP and its SHA-256. Verify the EXE against an independently trusted GitHub CI/release digest before running; the adjacent checksum file alone is not independent provenance. The artifacts are unsigned. No customer, tunnel, WebCoRE, SMTP or operator credential is embedded.

Setup requests UAC and provides Preflight, explicit HardenRuntime, Install boundary, Verify, Recover and Uninstall buttons with a readable report. It extracts once to protected administrator-owned ProgramData staging, verifies embedded archive and extracted bytes, rejects reparse/mutable ancestors and never silently overwrites staging. Existing healthy SYSTEM MCP, protected configuration, Node 24 and enabled firewall profiles are prerequisites. This is not the separate fresh-client gateway installer tracked in smart-home-hubitat#35.

Installation does not elevate/change the existing MCP service, overwrite credentials/configuration/schedules or cut production over. Initial cutover requires independent scoped operator approval. Normal runtime releases continue through the allowlisted MCP stage/deploy/rollback operations. Recovery and uninstall are explicit administrator actions.

The approval window has a concise status list and a read-only wrapping details pane showing the full operation/request/commit/digests/expiry/outcome. The installed shortcut elevates a public Windows PowerShell host before opening protected management code. Management ACLs and grant/peer verification remain strict.

An already-installed boundary is **validation-only**: this package does not replace running native broker/worker binaries. Deploying a newer Node payload alone does not upgrade the native approval UI. An explicit reviewed native-boundary migration is required for installed TERMINAL; see smart-home-hubitat#47. Do not uninstall/reinstall production merely to apply these UI improvements.

GitHub's draft-release workflow accepts only a full commit already reachable from main, reruns Windows/native/integration/full-suite checks and creates a draft with ZIP/EXE/checksums. Publishing and production installation remain separate approved actions. Windows 11 x64 is the current baseline; interactive UAC/GUI and clean-machine customer/server certification are separate from hosted headless tests.
