// In-process concurrency guard for the future isolated worker.
// This module is inert until a dedicated non-admin worker uses it.
export class VmWorkerBusyError extends Error {
  constructor() { super('VM worker already executing an approved operation.'); this.name = 'VmWorkerBusyError'; }
}
export class VmWorkerGate {
  #busy = false;
  get busy() { return this.#busy; }
  async run(task) {
    if (typeof task !== 'function') throw new TypeError('Worker task must be a function.');
    if (this.#busy) throw new VmWorkerBusyError();
    this.#busy = true;
    try { return await task(); }
    finally { this.#busy = false; }
  }
}
