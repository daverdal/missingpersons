// sms-menu.js: Injects the shared SMS menu into the page
(function() {
  function loadSmsMenu() {
    // Determine which page is active based on the current URL
    const path = window.location.pathname.split('/').pop() || window.location.href.split('/').pop();
    const activeClass = 'active';
    
    // Menu items configuration
    const menuItems = [
      { href: 'sms-blast.html', text: 'SMS Blast' },
      { href: 'list-sms-clients.html', text: 'List SMS Clients' },
      { href: 'email-blast.html', text: 'Email Blast' },
      { href: 'email-list.html', text: 'Clients with Email' }
    ];
    
    // Build the menu HTML
    let menuHTML = '<nav class="offender-news-menu">';
    menuItems.forEach(item => {
      const isActive = path === item.href;
      menuHTML += `<a href="${item.href}"${isActive ? ` class="${activeClass}"` : ''}>${item.text}</a>`;
    });
    menuHTML += '</nav>';
    
    // Find the main element and insert the menu after it opens
    const main = document.querySelector('main');
    if (main) {
      // Remove any existing offender-news-menu or sms-menu
      const oldMenu = main.querySelector('.offender-news-menu');
      if (oldMenu) oldMenu.remove();
      
      // Insert the menu at the beginning of main
      main.insertAdjacentHTML('afterbegin', menuHTML);
    }
  }
  
  // Load menu when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSmsMenu);
  } else {
    loadSmsMenu();
  }
})();

