// navbar-auth.js: Hide Admin Panel link for non-admins after navbar is injected

(function() {
  function hideAdminLinkIfNotAdmin() {
    var adminLink = document.getElementById('adminLink');
    var token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
      if (adminLink) adminLink.style.display = 'none';
      return;
    }
    try {
      var payload = JSON.parse(atob(token.split('.')[1]));
      var roles = payload.roles || payload.groups || payload.roles_claim || [];
      if (!Array.isArray(roles)) roles = [roles];
      if (!roles.includes('admin')) {
        if (adminLink) adminLink.style.display = 'none';
      }
    } catch (e) {
      if (adminLink) adminLink.style.display = 'none';
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
