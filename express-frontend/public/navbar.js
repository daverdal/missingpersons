// navbar.js: Injects the shared navigation bar into the page
(function() {
  function loadNavbar() {
    fetch('navbar.html')
      .then(response => response.text())
      .then(html => {
        const header = document.querySelector('header');
        if (header) {
          // Remove any existing nav in header
          const oldNav = header.querySelector('nav');
          if (oldNav) oldNav.remove();
          // Insert navbar at the end of header
          header.insertAdjacentHTML('beforeend', html);
        }
        // Highlight the active nav link
        var links = document.querySelectorAll('.nav-link');
        var path = window.location.pathname.split('/').pop();
        var found = false;
        links.forEach(function(link) {
          var href = link.getAttribute('href');
          if (href && href !== '#' && path === href) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
            found = true;
          } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
          }
        });
        // Run nav logic after insertion
        if (typeof updateAuthLinks === 'function') updateAuthLinks();
        if (typeof setupLogout === 'function') setupLogout();
      });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
  } else {
    loadNavbar();
  }

  // Add logout logic: clear tokens and redirect
  function setupLogout() {
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
      logoutLink.onclick = function(e) {
        e.preventDefault();
        // Remove tokens from both storages
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        // Optionally clear all storage (uncomment if needed)
        // localStorage.clear();
        // sessionStorage.clear();
        // Redirect to login page
        window.location.href = 'login.html';
      };
    }
  }

})();
