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

  async listDevices() {
    return this.request('devices');
  }

  async getDevice(id) {
    if (!id) throw new Error('Hubitat device ID is required.');
    return this.request(`devices/${encodeURIComponent(id)}`);
  }
}
