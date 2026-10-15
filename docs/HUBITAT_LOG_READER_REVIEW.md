# Hubitat log reader: review gate (not deployed)

## Scope
Read-only retrieval of Hubitat device/driver logs for group device 664 (G-Deck) and members 665 (UpperDeck), 669 (LowerDeck), 671 (DeckString). No device commands, piston writes, remote Hubitat exposure, or changes to existing Maker API permissions.

## Current verified constraint
The existing `HubitatClient` implements only Maker API `devices` and `devices/:id` reads. It has **no supported log transport**. Maker API device reads must not be misrepresented as Past Logs access.

This branch deliberately adds only the bounded filter/redaction layer and an explicit fail-closed transport placeholder. It does not register a misleading live MCP log tool or fetch an undocumented hub URL.

## Gate before implementing transport
1. Verify an officially supported Hubitat Past Logs API or a trusted local log-forwarding mechanism, including authentication, read-only authorization, retention, rate limits and failure semantics.
2. If using a local log forwarder, bind to loopback/private network, require a separate least-privilege credential, document installation/rollback, and do not expose Hubitat inbound to the Internet.
3. Implement transport with mocked HTTP/socket tests: no commands, no secrets in errors, bounded payload, timeouts, allowed device IDs, pagination/cursor behavior, and timestamp handling.
4. Register MCP tool only after transport tests pass. Validate in staging; separately approve production release and verify plugin version after deployment.

## Reviewable change
- `server/hubitat-logs.js`: strict read-only log filtering, redaction, and unavailable-transport error.
- `test/hubitat-logs.test.js`: offline tests for device filtering, bounds, redaction, and fail-closed behavior.

## Rollback
Revert the feature branch / close the draft PR. No production changes have been made.
