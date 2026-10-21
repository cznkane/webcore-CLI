# Hubitat and webCoRE MCP capability matrix

Tracking: #19. Implementation PR: #20.

## Hubitat Maker API

| Feature | Tool | Access |
| --- | --- | --- |
| Authorized device inventory | `hubitat_list_devices` | Read |
| Detailed device inventory | `hubitat_list_device_details` | Read |
| Device attributes and details | `hubitat_get_device` | Read |
| Recent device events | `hubitat_get_device_events` | Read |
| Historical driver and app logs (opt-in admin endpoint) | `hubitat_get_driver_logs` | Read, local opt-in |\n| Device diagnostic snapshot | `hubitat_get_device_snapshot` | Read |
| Device supported commands | `hubitat_get_device_commands` | Read |
| One device attribute | `hubitat_get_device_attribute` | Read |
| Modes inventory | `hubitat_list_modes` | Read |
| Current mode | `hubitat_get_current_mode` | Read |
| Exposed hub variables | `hubitat_list_hub_variables` | Read |
| Exposed hub variable detail | `hubitat_get_hub_variable` | Read |
| Hubitat Safety Monitor status | `hubitat_get_hsm_status` | Read |
| On/off switch command | `hubitat_set_switch` | Write, explicit authorization |
| Advertised device command, zero or one scalar argument | `hubitat_send_device_command` | Write, explicit authorization |

Maker API authorization is controlled on the hub. Unsupported or unauthorized endpoints must return errors, never fabricated data. Physical device commands must never be issued during diagnostics without explicit user approval. Security-sensitive commands such as lock/unlock and PIN management are deliberately excluded from the generic command tool.

## webCoRE

| Feature | Tool | Access |
| --- | --- | --- |
| Live status and version | `webcore_status` | Read |
| Connection and dashboard diagnostics | `webcore_diagnose` | Read |
| Authorized device inventory and details | `webcore_list_devices`, `webcore_get_device` | Read |
| Fresh device states | `webcore_refresh_device_states` | Read |
| Piston listing, selection, inspection | `webcore_list_pistons`, `webcore_select_piston`, `webcore_get_piston` | Read |
| Live language definitions | `webcore_lookup_language` | Read |
| Piston activity trace | `webcore_get_activity` | Read |
| Piston edit preparation and readback verification | `webcore_prepare_piston_update`, `webcore_verify_piston_update` | Read |
| Piston create/edit/test/pause/resume | Existing `webcore_*` write tools | Write; see tool-level safety contracts |

## Not provided by these APIs

- **Live streaming driver/app logs**: this release implements historical logs via the hub's local `/logs/past/json` endpoint, but not live WebSocket `/logsocket` streaming. The historical endpoint is separate from Maker API, is not a stable public API, and may require an authenticated admin session on some hub configurations. Set `hubitat.logsEnabled=true` in the private local config to opt in; never send Maker API credentials to the admin log endpoint. Filter by `deviceId` to restrict to an authorized Maker API device.
- **Hub administration, firmware, hub backup, arbitrary Groovy execution, Zigbee/Z-Wave radio management**: not Maker API features; deliberately not exposed through this credential.
- **Maker API multiple positional device command arguments**: not safely represented by the single optional secondary value endpoint; not exposed.
- **Hubitat lock/unlock and PIN-code management**: not exposed through the generic command tool.
- **Hubitat mode changes and HSM arming**: not enabled by this release until their exact endpoint/authorization semantics are verified against the target hub.

## Release gates

Run `npm run check` and `npm test` successfully on the exact PR head; verify PR preflight and the final merged SHA. Stage the pinned artifact on the Windows VM, obtain local deployment approval, then perform read-only live smoke tests before enabling writes. Keep the last-known-good artifact for rollback. Do not label a feature deployed until a live tool call verifies it.

## Notes

The plugin Tools list controls which tools are visible, but does not replace per-call authorization for actions that affect physical devices or automations.
