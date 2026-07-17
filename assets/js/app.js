// Aura Unity Enterprise v2 — shared application namespace.
window.AuraUnity = window.AuraUnity || {
  version: '2.0.0-modular',
  architecture: 'enterprise-v2',
  modules: Object.create(null),
  register(name, api = {}) {
    this.modules[name] = api;
    return api;
  }
};
