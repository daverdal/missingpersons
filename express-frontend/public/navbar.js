// navbar.js: Injects the shared navigation bar into the page
(function() {
  function loadNavbar() {
    const header = document.querySelector('header');
    if (!header) {
      // Retry if header not ready yet (max 10 retries = 1 second)
      if (typeof loadNavbar.retryCount === 'undefined') {
        loadNavbar.retryCount = 0;
      }
      loadNavbar.retryCount++;
      if (loadNavbar.retryCount < 10) {
        setTimeout(loadNavbar, 100);
      } else {
        console.error('navbar.js: Header element not found after 10 retries');
      }
      return;
    }
    fetch('navbar.html?v=8')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch navbar: ' + response.status);
        }
        return response.text();
      })
      .then(html => {
        // Remove any existing nav in header
        const oldNav = header.querySelector('nav');
        if (oldNav) oldNav.remove();
        // Insert navbar at the end of header
        header.insertAdjacentHTML('beforeend', html);
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
        // Show admin links only if user is admin (they're hidden by default)
        if (typeof window.checkAndShowAdminLinks === 'function') {
          window.checkAndShowAdminLinks();
        }
        // Theme toggle logic
        var themeBtn = document.getElementById('themeToggleBtn');
        var body = document.body;
        function setTheme(mode) {
          if (mode === 'light') {
            body.classList.add('light-mode');
            if (themeBtn) themeBtn.textContent = '☀️';
          } else {
            body.classList.remove('light-mode');
            if (themeBtn) themeBtn.textContent = '🌙';
          }
        }
        
        // Load theme from database (user preferences) or fallback to localStorage
        function loadTheme() {
          // First try to get from API (user preferences)
          var token = (function() {
            const match = document.cookie.match(/(^| )token=([^;]+)/);
            if (match) return match[2];
            return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
          })();
          
          if (token) {
            fetch('/api/user/preferences', {
              headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(r => r.json())
            .then(data => {
              var theme = (data.preferences && data.preferences.themeMode) || localStorage.getItem('themeMode') || 'dark';
              setTheme(theme);
              // Sync to localStorage as backup
              localStorage.setItem('themeMode', theme);
            })
            .catch(err => {
              console.warn('Failed to load theme from preferences, using localStorage:', err);
              var savedTheme = localStorage.getItem('themeMode');
              setTheme(savedTheme === 'light' ? 'light' : 'dark');
            });
          } else {
            // No token, use localStorage only
            var savedTheme = localStorage.getItem('themeMode');
            setTheme(savedTheme === 'light' ? 'light' : 'dark');
          }
        }
        
        loadTheme();
        
        // Load and apply font preference
        function loadAndApplyFontPreference() {
          var token = (function() {
            const match = document.cookie.match(/(^| )token=([^;]+)/);
            if (match) return match[2];
            return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
          })();
          
          if (token) {
            fetch('/api/user/preferences', {
              headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(r => r.json())
            .then(data => {
              const prefs = data.preferences || {};
              if (prefs.fontFamily) {
                applyFontPreference(prefs.fontFamily);
              } else {
                // New user - apply default font (Inter)
                applyFontPreference('Inter');
              }
            })
            .catch(err => {
              console.warn('Failed to load font preference:', err);
              // Apply default font on error
              applyFontPreference('Inter');
            });
          } else {
            // No token - apply default font
            applyFontPreference('Inter');
          }
        }
        
        function applyFontPreference(fontFamily) {
          // Default to Inter if no font specified
          const defaultFont = 'Inter';
          if (!fontFamily) {
            fontFamily = defaultFont;
          }
          let styleEl = document.getElementById('userFontPreference');
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'userFontPreference';
            document.head.appendChild(styleEl);
          }
          
          const fontStacks = {
            'Fira Mono': "'Fira Mono', 'Consolas', 'Roboto Mono', 'Courier New', monospace",
            'Poppins': "Poppins, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
            'Roboto': "Roboto, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
            'Inter': "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            'Georgia': "Georgia, 'Times New Roman', Times, serif"
          };
          
          const fontStack = fontStacks[fontFamily] || fontStacks[defaultFont];
          styleEl.textContent = `body, body * { font-family: ${fontStack} !important; }`;
        }
        
        // Load font preference, defaulting to Inter for new users
        loadAndApplyFontPreference();
        
        // Apply default font if no preference is loaded
        setTimeout(function() {
          if (!document.getElementById('userFontPreference')) {
            applyFontPreference('Inter');
          }
        }, 500);
        
        if (themeBtn) {
          themeBtn.addEventListener('click', function() {
            var current = body.classList.contains('light-mode') ? 'light' : 'dark';
            var next = current === 'light' ? 'dark' : 'light';
            setTheme(next);
            localStorage.setItem('themeMode', next);
            
            // Save to database (user preferences)
            var token = (function() {
              const match = document.cookie.match(/(^| )token=([^;]+)/);
              if (match) return match[2];
              return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
            })();
            
            if (token) {
              fetch('/api/user/preferences', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ preferences: { themeMode: next } })
              })
              .catch(err => console.warn('Failed to save theme preference:', err));
            }
          });
        }
      })
      .catch(err => {
        console.error('Failed to load navbar:', err);
        // Fallback: if navbar fails to load, ensure the header still has some height
        const header = document.querySelector('header');
        if (header) {
          header.style.minHeight = '100px';
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
        // Clear cookie
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        // Remove tokens from both storages
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        // Use replace instead of href to prevent back button access
        window.location.replace('login.html');
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
