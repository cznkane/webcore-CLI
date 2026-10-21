export class HubitatClient {
  constructor(config) {
    if (!config?.baseUrl) throw new Error('Hubitat baseUrl is not configured.');
    if (!config?.appId) throw new Error('Hubitat Maker API appId is not configured.');
    if (!config?.accessToken) throw new Error('Hubitat Maker API accessToken is not configured.');

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.appId = String(config.appId);
    this.accessToken = config.accessToken;
    this.logsEnabled = config.logsEnabled === true;
    this.eventCallbackHost = config.eventCallbackHost ?? null;
  }

  async request(path) {
    const url = `${this.baseUrl}/apps/api/${this.appId}/${path.replace(/^\/+/, '')}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const error = new Error(
        `Hubitat Maker API request failed: HTTP ${response.status} ${response.statusText}`
      );
      error.code = 'HUBITAT_API_ERROR';
      error.details = {
        status: response.status,
        statusText: response.statusText
      };
      throw error;
    }

    return response.json();
  }

  async getDeviceSnapshot(id, limit = 50) {
    if (!/^[0-9]+$/.test(String(id))) throw new Error('Numeric Hubitat device ID is required.');
    const devices = await this.listDevices();
    if (!Array.isArray(devices) || !devices.some(device => String(device.id) === String(id))) {
      const error = new Error('Device is not authorized by this Maker API instance.');
      error.code = 'HUBITAT_DEVICE_NOT_AUTHORIZED';
      throw error;
    }
    const [device, history] = await Promise.all([this.getDevice(id), this.getDeviceEvents(id, limit)]);
    return { device_id: String(id), device, history };
  }

  async setSwitch(id, command, authorized = false) {
    if (!/^[0-9]+$/.test(String(id))) throw new Error('Numeric Hubitat device ID is required.');
    if (command !== 'on' && command !== 'off') throw new Error('Only on/off switch commands are supported.');
    if (authorized !== true) {
      const error = new Error('Physical device control requires explicit authorization.');
      error.code = 'HUBITAT_COMMAND_NOT_AUTHORIZED';
      throw error;
    }
    const devices = await this.listDevices();
    if (!Array.isArray(devices) || !devices.some(device => String(device.id) === String(id))) {
      const error = new Error('Device is not authorized by this Maker API instance.');
      error.code = 'HUBITAT_DEVICE_NOT_AUTHORIZED';
      throw error;
    }
    const detail = await this.getDevice(id);
    const commands = detail?.commands;
    if (!Array.isArray(commands) || !commands.some(item => (typeof item === 'string' ? item : item?.command ?? item?.name) === command)) {
      const error = new Error('Requested switch command is not supported by this device.');
      error.code = 'HUBITAT_COMMAND_UNSUPPORTED';
      throw error;
    }
    return { device_id: String(id), command, result: await this.request(`devices/${encodeURIComponent(id)}/${command}`) };
  }

  async getDriverLogs({ deviceId, limit = 100, level, contains } = {}) {
    if (this.logsEnabled !== true) {
      const error = new Error('Hubitat admin log access is disabled. Set hubitat.logsEnabled=true in the local private configuration.');
      error.code = 'HUBITAT_LOGS_DISABLED';
      throw error;
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Log limit must be 1 to 500.');
    if (deviceId !== undefined && !/^[0-9]+$/.test(String(deviceId))) throw new Error('Numeric device ID required.');
    if (level !== undefined && !['error', 'warn', 'info', 'debug', 'trace'].includes(level)) throw new Error('Invalid log level.');
    if (contains !== undefined && (typeof contains !== 'string' || contains.length > 100)) throw new Error('Log search must be 100 characters or fewer.');
    if (deviceId !== undefined) {
      const devices = await this.listDevices();
      if (!Array.isArray(devices) || !devices.some(device => String(device.id) === String(deviceId))) {
        const error = new Error('Device is not authorized by Maker API.');
        error.code = 'HUBITAT_DEVICE_NOT_AUTHORIZED';
        throw error;
      }
    }
    const origin = new URL(this.baseUrl);
    if (origin.protocol !== 'http:' && origin.protocol !== 'https:') throw new Error('Hubitat logs require an HTTP(S) hub origin.');
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Hubitat logs require a plain local hub origin.');
    const response = await fetch(new URL('/logs/past/json', origin), { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      const error = new Error('Hubitat past logs request failed.');
      error.code = 'HUBITAT_LOGS_HTTP_ERROR';
      error.details = { status: response.status };
      throw error;
    }
    const declaredSize = Number(response.headers?.get?.('content-length') ?? 0);
    if (declaredSize > 2_000_000) throw new Error('Hubitat log response exceeds 2 MB.');
    const raw = await response.text();
    if (raw.length > 2_000_000) throw new Error('Hubitat log response exceeds 2 MB.');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('Hubitat returned invalid log JSON.'); }
    if (!Array.isArray(parsed)) throw new Error('Hubitat returned an unrecognized log payload.');
    const entries = parsed.filter(line => typeof line === 'string' && line.length <= 10000).map(line => {
      const parts = line.split(String.fromCharCode(9));
      const time = parts[0]?.trim();
      const severity = parts[1]?.trim().toLowerCase();
      const detail = parts.slice(2).join(' ').trim();
      const source = detail.match(/^(dev|app)[|]([0-9]+)[|]([^|]*?)(?:[|]|\\s{2,}|$)/i);
      if (!source) return { raw: line.slice(0, 2000) };
      return { time, level: severity, type: source[1].toLowerCase(), id: source[2], name: source[3].replace(/<[^>]*>/g, '').slice(0, 150), message: detail.slice(source[0].length).trim().slice(0, 2000) };
    });
    const filtered = entries.filter(entry => (deviceId === undefined || (entry.type === 'dev' && entry.id === String(deviceId))) && (level === undefined || entry.level === level) && (contains === undefined || JSON.stringify(entry).toLowerCase().includes(contains.toLowerCase())));
    return { source: 'hubitat_past_logs', device_id: deviceId == null ? null : String(deviceId), entries: filtered.slice(-limit), returned: Math.min(filtered.length, limit), total_matching: filtered.length, truncated: filtered.length > limit, historical_only: true };
  }

  async listModes() {
    const result = await this.request('modes');
    if (!Array.isArray(result)) {
      const error = new Error('Hubitat returned an unrecognized modes response.');
      error.code = 'HUBITAT_MODES_UNSUPPORTED';
      throw error;
    }
    return result;
  }

  async getCurrentMode() {
    const result = await this.request('mode');
    if (result == null || typeof result !== 'object' || Array.isArray(result)) {
      const error = new Error('Hubitat returned an unrecognized current mode response.');
      error.code = 'HUBITAT_MODE_UNSUPPORTED';
      throw error;
    }
    return result;
  }

  async listDeviceDetails() {
    const result = await this.request('devices/all');
    if (!Array.isArray(result) && (result == null || typeof result !== 'object')) throw new Error('Invalid detailed device inventory.');
    return result;
  }

  async getAuthorizedDevice(id) {
    if (!/^[0-9]+$/.test(String(id))) throw new Error('Numeric device ID required.');
    const inventory = await this.listDevices();
    if (!Array.isArray(inventory) || !inventory.some(device => String(device.id) === String(id))) {
      const error = new Error('Device is not authorized by Maker API.');
      error.code = 'HUBITAT_DEVICE_NOT_AUTHORIZED';
      throw error;
    }
    return this.getDevice(id);
  }

  async getDeviceCommands(id) {
    await this.getAuthorizedDevice(id);
    const result = await this.request(`devices/${encodeURIComponent(id)}/commands`);
    if (!Array.isArray(result) && (result == null || typeof result !== 'object')) throw new Error('Unrecognized commands payload.');
    return result;
  }

  async getDeviceAttribute(id, attribute) {
    if (typeof attribute !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(attribute)) throw new Error('Invalid attribute name.');
    const device = await this.getAuthorizedDevice(id);
    const attributes = device?.attributes;
    const known = Array.isArray(attributes) ? attributes.some(item => (typeof item === 'string' ? item : item?.name) === attribute) : attributes && typeof attributes === 'object' && Object.hasOwn(attributes, attribute);
    if (!known) throw new Error('Attribute is not listed on the authorized device.');
    return this.request(`devices/${encodeURIComponent(id)}/attribute/${encodeURIComponent(attribute)}`);
  }

  async setMode(modeId, authorized = false) {
    if (authorized !== true) throw new Error('Explicit authorization required for mode changes.');
    if (!/^[0-9]+$/.test(String(modeId))) throw new Error('Numeric mode ID required.');
    const modes = await this.listModes();
    const target = modes.find(mode => String(mode.id) === String(modeId));
    if (!target) throw new Error('Mode ID is not present in the Maker API mode inventory.');
    const result = await this.request(`modes/${encodeURIComponent(String(modeId))}`);
    return { mode_id: String(modeId), mode_name: target.name, result, verified: false };
  }

  async setHsm(command, authorized = false) {
    if (authorized !== true) throw new Error('Explicit authorization required for HSM changes.');
    if (!['armAway', 'armHome', 'armNight', 'disarm'].includes(command)) throw new Error('Unsupported HSM command.');
    await this.getHsmStatus();
    const result = await this.request(`hsm/${command}`);
    return { command, result, verified: false };
  }

  async sendDeviceCommandArgs(id, command, args, authorized = false) {
    if (authorized !== true) throw new Error('Explicit authorization required for live device commands.');
    if (!/^[0-9]+$/.test(String(id))) throw new Error('Numeric device ID required.');
    if (typeof command !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(command)) throw new Error('Invalid command.');
    if (/^(?:setCode|deleteCode|setLockCode|unlock|lock|setPin|setPassword|setUserCode|deleteUserCode)$/i.test(command)) throw new Error('Security-sensitive command blocked.');
    if (!Array.isArray(args) || args.length > 6 || !args.every(v => (typeof v === 'string' && v.length <= 100 && !v.includes(',')) || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean')) throw new Error('Arguments must be an array of up to six bounded scalar values, without commas.');
    const detail = await this.getAuthorizedDevice(id);
    if (!Array.isArray(detail?.commands) || !detail.commands.some(item => (typeof item === 'string' ? item : item?.command ?? item?.name) === command)) throw new Error('Command is not advertised by this device.');
    const suffix = args.length ? '/' + encodeURIComponent(args.map(String).join(',')) : '';
    const result = await this.request(`devices/${encodeURIComponent(String(id))}/${command}${suffix}`);
    return { device_id: String(id), command, argument_count: args.length, result };
  }

  async setEventCallback(url, authorized = false) {
    if (authorized !== true) throw new Error('Explicit authorization required to replace the Maker API event callback.');
    if (typeof url !== 'string' || url.length > 400) throw new Error('Callback URL is required and limited to 400 characters.');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Invalid callback URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || !parsed.hostname || parsed.port && parsed.port !== '443') throw new Error('Event callback must be an HTTPS URL without embedded credentials, fragments, or custom ports.');
    if (!this.eventCallbackHost || parsed.hostname.toLowerCase() !== this.eventCallbackHost.toLowerCase()) throw new Error('Callback host is not preapproved in hubitat.eventCallbackHost.');
    const result = await this.request(`postURL/${encodeURIComponent(url)}`);
    return { configured: true, callback_host: parsed.hostname, result };
  }

  async clearEventCallback(authorized = false) {
    if (authorized !== true) throw new Error('Explicit authorization required to remove the Maker API event callback.');
    if (!this.eventCallbackHost) throw new Error('Event callback management is not configured.');
    const result = await this.request('postURL');
    return { configured: false, result };
  }

  async getHsmStatus() { return this.request('hsm'); }

  async sendDeviceCommand(id, command, value, authorized = false) {
    if (authorized !== true) throw new Error('Explicit authorization required to execute a live device command.');
    if (!/^[0-9]+$/.test(String(id))) throw new Error('Numeric device ID required.');
    if (typeof command !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(command)) throw new Error('Invalid command.');
    if (['setCode', 'deleteCode', 'setLockCode', 'unlock', 'lock', 'setPin', 'setPassword'].includes(command)) throw new Error('Security-sensitive commands are not exposed by this tool.');
    if (value !== undefined && (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) throw new Error('Only scalar command arguments are supported.');
    if (value !== undefined && String(value).length > 100) throw new Error('Command argument exceeds 100 characters.');
    const detail = await this.getAuthorizedDevice(id);
    const commands = detail?.commands;
    const supported = Array.isArray(commands) && commands.some(item => (typeof item === 'string' ? item : item?.command ?? item?.name) === command);
    if (!supported) throw new Error('Command is not advertised by the authorized device.');
    const suffix = value === undefined ? '' : `/${encodeURIComponent(String(value))}`;
    return { device_id: String(id), command, result: await this.request(`devices/${encodeURIComponent(id)}/${command}${suffix}`) };
  }

  async listDevices() {
    return this.request('devices');
  }

  async getDevice(id) {
    if (!id) throw new Error('Hubitat device ID is required.');
    return this.request(`devices/${encodeURIComponent(id)}`);
  }
  async getDeviceEvents(id, limit = 50) {
    if (!/^[0-9]+$/.test(String(id))) throw new Error('Numeric Hubitat device ID is required.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Event limit must be between 1 and 100.');
    // Check the device against the Maker API authorization scope before reading its events.
    const devices = await this.listDevices();
    if (!Array.isArray(devices) || !devices.some(device => String(device.id) === String(id))) {
      const error = new Error('Device is not authorized by this Maker API instance.');
      error.code = 'HUBITAT_DEVICE_NOT_AUTHORIZED';
      throw error;
    }
    // Maker API event history is supported on some Hubitat versions/installations.
    // An HTTP failure is reported explicitly rather than silently returning no events.
    const response = await this.request(`devices/${encodeURIComponent(id)}/events`);
    const events = Array.isArray(response) ? response : response?.events;
    if (!Array.isArray(events)) {
      const error = new Error('Hubitat did not return a recognized device-events payload.');
      error.code = 'HUBITAT_EVENTS_UNSUPPORTED';
      throw error;
    }
    return { device_id: String(id), events: events.slice(0, limit), returned: Math.min(events.length, limit), truncated: events.length > limit };
  }

}
