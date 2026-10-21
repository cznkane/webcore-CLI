export class HubitatClient {
  constructor(config) {
    if (!config?.baseUrl) throw new Error('Hubitat baseUrl is not configured.');
    if (!config?.appId) throw new Error('Hubitat Maker API appId is not configured.');
    if (!config?.accessToken) throw new Error('Hubitat Maker API accessToken is not configured.');

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.appId = String(config.appId);
    this.accessToken = config.accessToken;
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

  async listHubVariables() { return this.request('hubvariables'); }

  async getHubVariable(name) {
    if (typeof name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_ -]{0,79}$/.test(name)) throw new Error('Invalid hub variable name.');
    const inventory = await this.listHubVariables();
    const found = Array.isArray(inventory) ? inventory.some(item => (typeof item === 'string' ? item : item?.name) === name) : inventory && typeof inventory === 'object' && Object.hasOwn(inventory, name);
    if (!found) throw new Error('Hub variable is not exposed by this Maker API instance.');
    return this.request(`hubvariables/${encodeURIComponent(name)}`);
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
