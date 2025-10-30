// navbar-auth.js: Hide Admin Panel link for non-admins after navbar is injected

(function() {
  function hideAdminLinkIfNotAdmin() {
    var adminLink = document.getElementById('adminLink');
    var settingsLink = document.getElementById('settingsLink');
    var assignCasesLink = document.getElementById('assignCasesLink');
    // Get token from cookie first, then localStorage/sessionStorage
    function getToken() {
      const cookies = document.cookie.split(';');
      for (let c of cookies) {
        const [key, value] = c.trim().split('=');
        if (key === 'token') return value;
      }
      return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    }
    var token = getToken();
    if (!token) {
      if (adminLink) adminLink.style.display = 'none';
      if (settingsLink) settingsLink.style.display = 'none';
      if (assignCasesLink) assignCasesLink.style.display = 'none';
      return;
    }
    try {
      var payload = JSON.parse(atob(token.split('.')[1]));
      var roles = payload.roles || payload.groups || payload.roles_claim || [];
      if (!Array.isArray(roles)) roles = [roles];
      if (roles.includes('admin')) {
        if (adminLink) adminLink.style.display = '';
        if (settingsLink) settingsLink.style.display = '';
        if (assignCasesLink) assignCasesLink.style.display = '';
      } else {
        if (adminLink) adminLink.style.display = 'none';
        if (settingsLink) settingsLink.style.display = 'none';
        if (assignCasesLink) assignCasesLink.style.display = 'none';
      }
    } catch (e) {
      if (adminLink) adminLink.style.display = 'none';
      if (settingsLink) settingsLink.style.display = 'none';
      if (assignCasesLink) assignCasesLink.style.display = 'none';
    }
  }

  // Run on DOMContentLoaded and after navbar injection
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(hideAdminLinkIfNotAdmin, 100);
    // Also observe for dynamic navbars
    var observer = new MutationObserver(function() {
      hideAdminLinkIfNotAdmin();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
