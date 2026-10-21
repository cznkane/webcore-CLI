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
