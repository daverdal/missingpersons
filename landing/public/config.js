/**
 * Public site configuration.
 * Set window.PUBLIC_API_BASE to the origin that exposes the API (without trailing slash).
 *
 * Example for production:
 *   window.PUBLIC_API_BASE = 'https://missing.amc.ca';
 *
 * Example for same-host testing:
 *   window.PUBLIC_API_BASE = 'http://192.168.2.27:5000';
 */

(function configureDefaultApiBase() {
  if (window.PUBLIC_API_BASE) {
    window.PUBLIC_API_BASE = window.PUBLIC_API_BASE.replace(/\/+$/, '');
    return;
  }
  const { protocol, hostname, port } = window.location;
  const normalizedPort = port || (protocol === 'https:' ? '443' : '80');
  if (normalizedPort !== '80' && normalizedPort !== '443') {
    window.PUBLIC_API_BASE = `${protocol}//${hostname}:${normalizedPort}`;
    return;
  }
  // Default to API running on port 5000 of the same host if no override is provided.
  window.PUBLIC_API_BASE = `${protocol}//${hostname}:5000`;
})();



