// auth-check.js: Global authentication check that runs on all pages
// Prevents back-button access after logout

(function() {
  function getToken() {
    const match = document.cookie.match(/(^| )token=([^;]+)/);
    if (match) return match[2];
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }

  function clearAuth() {
    // Clear all auth tokens
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
  }

  async function verifyToken(token) {
    if (!token) return false;
    try {
      const response = await fetch('/api/me', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store'
      });
      return response.ok;
    } catch (err) {
      return false;
    }
  }

  async function checkAuth() {
    // Skip auth check on login page
    if (window.location.pathname.includes('login.html') || window.location.pathname === '/') {
      return;
    }

    const token = getToken();
    
    // If no token, redirect to login
    if (!token) {
      clearAuth();
      window.location.replace('login.html');
      return;
    }

    // Verify token with server
    const isValid = await verifyToken(token);
    if (!isValid) {
      clearAuth();
      window.location.replace('login.html');
      return;
    }
  }

  // Run auth check immediately (before DOM loads)
  checkAuth();

  // Run auth check on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuth);
  } else {
    checkAuth();
  }

  // Run auth check when page becomes visible (handles back button)
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      checkAuth();
    }
  });

  // Run auth check on pageshow event (fires on back/forward navigation)
  window.addEventListener('pageshow', function(event) {
    // event.persisted is true if page was loaded from cache (back button)
    if (event.persisted) {
      // Force a fresh check when page is restored from cache
      setTimeout(checkAuth, 100);
    }
    // Always check on pageshow
    checkAuth();
  });

  // Also check periodically (every 30 seconds) to catch token expiration
  setInterval(checkAuth, 30000);
})();

