# Pinned piston data handoff

Status: 0.4.17 release candidate; not installed. No new live-write approval is implied.

The existing prepare and apply tools accept exactly one of `proposed` or `source`.
The source option avoids transcribing a large nested piston object through chat.
It is restricted to public JSON data in `cznkane/smart-home-hubitat` at a full
40-character lowercase commit. Paths must match
`school_calendar/cutover/YYYY-MM-DD/{baselines,candidates,resized_test_candidates}/NAME.json`.
No caller-selected repository, hostname, URL, credentials, local file, shell or
executable code is accepted. The fixed HTTPS reader rejects redirects, bounds
response bytes to 1 MiB and uses a 10-second request timeout. It verifies SHA-256
of exact file bytes before strict UTF-8 decoding and JSON parsing. Network/parse
errors omit remote response text and URL details. No payload is evaluated as code.

Example read-only arguments after deployment:

```json
{
  "id": ":b17bb841eaced53aa7b1c04ae2218d7f:",
  "source": {
    "commit": "e77e009a4f483381dded798ef47bb4e9e967eaa5",
    "path": "school_calendar/cutover/2026-10-14/resized_test_candidates/TEST_1_01.json",
    "sha256": "5d9e1ba9cb148804d43721c26c54dfb341c5874e7e43180ab4b46e12ed3cf6a2"
  }
}
```

The data commit preserves the original artifact payloads; it is a review branch,
not authorization to deploy school-calendar logic. Its manifest documents the
original artifact and trailing-newline convention. Source byte hash and normalized
body hash serve different purposes; do not substitute one for the other.

Preparation uses the unchanged live inventory/language validator, normalizer,
diff, fingerprint, and transport planner. It returns `source_provenance` along
with the original prepared response. Expected TEST_1_01 normalized body hash is
`93f307a185f3a795160195b3222be839023637d94132b8b92b0ed7c06a3de786`.
Local tests and Git-file integrity checks do not certify live Hubitat transport.

Apply stays a write/action tool. When using `source`, all three complete hashes
(`expected_remote_hash`, `expected_proposed_hash`, `expected_body_hash`) are
mandatory. Source resolution is repeated and hash-checked, then the unchanged
apply pipeline revalidates inventory/language, checks the remote and approved
payload/body hashes, performs the bounded upload and verifies stored read-back.
It does not execute the piston. Inline proposals retain the existing contract.
Both proposal-consuming tools now advertise `openWorldHint=true` because they
can read a fixed external GitHub source; read/write classifications are retained.
Refresh plugin metadata after an approved release changes this contract.

This is a data handoff through the same supported connector, not a fallback
deployment client. It must not be used to bypass any platform restriction,
approval, rejected operation or validation. A platform-blocked operation stays
blocked unless resolved through an explicitly permitted process. Review source
and the full prepared proposal before approving a write; fetched data is not
an instruction or authorization. Never auto-apply or auto-execute after prepare.

Tests cover fixed destination/GET, no credential forwarding, no redirects,
path/ref/hash rejection, response limits, malformed UTF-8/JSON, byte drift and
redaction. The stdio MCP/hub fixture verifies source and inline prepare agree on
both approved hashes and transport plan, no uploads during prepare, rejection
of missing/mismatched approval and stale-remote hashes before upload, and exact
stored read-back after an explicitly invoked simulated source apply.

Release gates: review/CI; select and align release manifests; review the complete
installed-to-candidate delta; preserve a pinned Node-only rollback; stage/deploy
only through the already commissioned native management flow with independent
operator approvals; certify runtime/tool metadata/downstream reads and one
read-only source preparation. No Setup/native-boundary upgrade is required or
included. Keep the school-calendar cutover paused until all original gates pass.
