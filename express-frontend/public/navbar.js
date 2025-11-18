// navbar.js: Injects the shared navigation bar into the page
(function() {
  function loadNavbar() {
    fetch('navbar.html?v=8')
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
        // Theme toggle logic
        var themeBtn = document.getElementById('themeToggleBtn');
        var body = document.body;
        function setTheme(mode) {
          if (mode === 'light') {
            body.classList.add('light-mode');
            themeBtn.textContent = '☀️';
          } else {
            body.classList.remove('light-mode');
            themeBtn.textContent = '🌙';
          }
        }
        // Load theme from localStorage
        var savedTheme = localStorage.getItem('themeMode');
        setTheme(savedTheme === 'light' ? 'light' : 'dark');
        if (themeBtn) {
          themeBtn.addEventListener('click', function() {
            var current = body.classList.contains('light-mode') ? 'light' : 'dark';
            var next = current === 'light' ? 'dark' : 'light';
            setTheme(next);
            localStorage.setItem('themeMode', next);
          });
        }
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

  // Global Konami code listener for Easter Egg
  const konamiSequence = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a'
  ];
  let konamiIndex = 0;

  function handleGlobalKeydown(e) {
    // Allow ESC to close the Easter egg overlay if active
    if (e.key === 'Escape' && typeof window.closeEasterEggGame === 'function') {
      try {
        window.closeEasterEggGame();
      } catch (_) {
        // ignore
      }
      return;
    }

    const key = e.key;
    const expected = konamiSequence[konamiIndex];
    const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
    const normalizedExpected =
      expected.length === 1 ? expected.toLowerCase() : expected;

    if (normalizedKey === normalizedExpected) {
      konamiIndex += 1;
      if (konamiIndex === konamiSequence.length) {
        konamiIndex = 0;
        triggerEasterEgg();
      }
    } else {
      // If this key could be the start of the sequence, reset index to 1, else 0
      konamiIndex = normalizedKey === konamiSequence[0] ? 1 : 0;
    }
  }

  function triggerEasterEgg() {
    // Lazy-load the game script on first use
    if (typeof window.startEasterEggGame === 'function') {
      try {
        window.startEasterEggGame();
      } catch (err) {
        console.error('Failed to start Easter egg game:', err);
      }
      return;
    }
    const existing = document.querySelector('script[data-easter-egg]');
    if (existing) return;
    const script = document.createElement('script');
    script.src = 'easter-egg.js?v=1';
    script.async = true;
    script.dataset.easterEgg = 'true';
    script.onload = function() {
      if (typeof window.startEasterEggGame === 'function') {
        window.startEasterEggGame();
      } else {
        console.warn('Easter egg script loaded but startEasterEggGame() is not available.');
      }
    };
    script.onerror = function() {
      console.error('Failed to load Easter egg script.');
    };
    document.body.appendChild(script);
  }

  window.addEventListener('keydown', handleGlobalKeydown);

})();
