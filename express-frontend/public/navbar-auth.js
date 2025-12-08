// navbar-auth.js: Show admin links only for admins (links are hidden by default in navbar.html)

(function() {
  function checkAndShowAdminLinks() {
    var adminLink = document.getElementById('adminLink');
    var settingsLink = document.getElementById('settingsLink');
    var assignCasesLink = document.getElementById('assignCasesLink');
    var auditLogLink = document.getElementById('auditLogLink');
    var reportsLink = document.getElementById('reportsLink');
    var smsBlastLink = document.getElementById('smsBlastLink');
    var offenderNewsLink = document.getElementById('offenderNewsLink');
    
    // If links don't exist yet, return
    if (!adminLink && !settingsLink && !assignCasesLink && !auditLogLink && !reportsLink) {
      return;
    }
    
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
      // No token - keep links hidden (they're already hidden by default)
      return;
    }
    
    try {
      var payload = JSON.parse(atob(token.split('.')[1]));
      var roles = payload.roles || payload.groups || payload.roles_claim || [];
      if (!Array.isArray(roles)) roles = [roles];
      var isAdmin = roles.includes('admin');
      
      if (isAdmin) {
        // Show admin links only for admins
        if (adminLink) adminLink.style.setProperty('display', 'inline-block', 'important');
        if (settingsLink) settingsLink.style.setProperty('display', 'inline-block', 'important');
        if (assignCasesLink) assignCasesLink.style.setProperty('display', 'inline-block', 'important');
        if (auditLogLink) auditLogLink.style.setProperty('display', 'inline-block', 'important');
        if (reportsLink) reportsLink.style.setProperty('display', 'inline-block', 'important');
        if (smsBlastLink) smsBlastLink.style.setProperty('display', 'inline-block', 'important');
        if (offenderNewsLink) offenderNewsLink.style.setProperty('display', 'inline-block', 'important');
      }
      // If not admin, links stay hidden (default state)
    } catch (e) {
      // Error parsing token - keep links hidden
      console.warn('Failed to parse token for admin check:', e);
    }
  }

  // Run when navbar is injected
  function runCheck() {
    // Force hide first, then check and show if admin
    var adminLink = document.getElementById('adminLink');
    var settingsLink = document.getElementById('settingsLink');
    var assignCasesLink = document.getElementById('assignCasesLink');
    var auditLogLink = document.getElementById('auditLogLink');
    var reportsLink = document.getElementById('reportsLink');
    var smsBlastLink = document.getElementById('smsBlastLink');
    var offenderNewsLink = document.getElementById('offenderNewsLink');
    
    // Force hide all admin links first (use important to override any CSS)
    if (adminLink) adminLink.style.setProperty('display', 'none', 'important');
    if (settingsLink) settingsLink.style.setProperty('display', 'none', 'important');
    if (assignCasesLink) assignCasesLink.style.setProperty('display', 'none', 'important');
    if (auditLogLink) auditLogLink.style.setProperty('display', 'none', 'important');
    if (reportsLink) reportsLink.style.setProperty('display', 'none', 'important');
    if (smsBlastLink) smsBlastLink.style.setProperty('display', 'none', 'important');
    if (offenderNewsLink) offenderNewsLink.style.setProperty('display', 'none', 'important');
    
    // Now check if user is admin and show if needed
    checkAndShowAdminLinks();
  }
  
  // Expose function globally so navbar.js can call it after injection
  window.checkAndShowAdminLinks = runCheck;
  
  // Also observe for when navbar is injected
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          if (node.id === 'adminLink' || 
              (node.querySelector && node.querySelector('#adminLink'))) {
            runCheck();
          }
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Run immediately if links already exist
  if (document.readyState !== 'loading') {
    runCheck();
  }
  
  // Also run on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', runCheck);
})();
