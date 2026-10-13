# Hubitat group membership: read-only integration contract

Status: Design gate; **not deployed**. This document records the blocker to migrating the 17 audited webCoRE pistons to the six Hubitat group devices.

## Verified limitation

The existing `HubitatClient` uses only Maker API `GET /apps/api/{appId}/devices` and `GET /apps/api/{appId}/devices/{id}`. Those return group *devices* but do not establish their constituent members. Group names, device-network IDs, switch states, or color temperatures are not membership evidence.

## Required read-only capability

Expose `hubitat_get_group_membership` for an exact allowlisted group device ID, returning: group device ID/name, authoritative source and snapshot time, member Hubitat device IDs and names, group behavior/options affecting command equivalence, and whether the result is complete. Reject unsupported IDs and ambiguous/incomplete results. No device command, Groovy configuration mutation, unrestricted URL fetch, credential echo, or administrative token in chat/Git.

## Source and security gate

**Do not implement an assumed Maker API endpoint**: the existing Maker API contract does not document membership retrieval. First verify a supported, read-only source on the running Hubitat system (e.g. a narrowly scoped Hubitat app endpoint with explicitly reviewed read-only access to Groups and Scenes configuration). Hubitat application state visibility, parent/child relationships, and supported API boundaries must be proven on the target hub before writing a provider. If that requires a new Hubitat app, independently review and approve its installation and permission scope; do not silently install it. Do not scrape admin HTML, request broad admin access, or use the Maker API token outside its existing bounded endpoints.

## Acceptance tests

1. Exact six known group devices are resolved and have a complete membership record.
2. Every member is reconciled to the current authorized Hubitat device inventory.
3. Unsupported/non-group IDs and missing memberships fail closed.
4. Read-only HTTP method and bounded endpoint enforced; no action-capable operations.
5. Secret and internal endpoint redaction in errors/logs.
6. Mocked tests for malformed, missing, stale, overlapping and duplicate membership.
7. No regression to existing Maker API reads, MCP tool classifications, or piston prepare/apply approval boundaries.
8. After code review and a separately approved release, verify the advertised tool in the running Windows MCP and in a fresh ChatGPT session.

## Piston migration gate

Only after verified membership: compare each original webCoRE action target set to group members; preserve individual-device exceptions, distinct color/brightness, per-device state save/restore, fade semantics, trigger and schedule logic, and active/paused state. Reject partial or overlapping group substitutions. Generate native webCoRE prepare/diffs for review. Do not upload, execute or change devices without separate approval.
