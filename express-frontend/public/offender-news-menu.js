// offender-news-menu.js: Injects the shared Offender News menu into the page
(function() {
  function loadOffenderNewsMenu() {
    // Determine which page is active based on the current URL
    const path = window.location.pathname.split('/').pop() || window.location.href.split('/').pop();
    const activeClass = 'active';
    
    // Menu items configuration
    const menuItems = [
      { href: 'offender-news.html', text: 'Email Inbox' },
      { href: 'offender-news-police.html', text: 'Winnipeg Police RSS' },
      { href: 'offender-news-manitoba.html', text: 'Manitoba RSS' },
      { href: 'offender-matches.html', text: 'Client Keyword Matches' },
      { href: 'news-items.html', text: 'News Items' }
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
      // Remove any existing offender-news-menu
      const oldMenu = main.querySelector('.offender-news-menu');
      if (oldMenu) oldMenu.remove();
      
      // Insert the menu at the beginning of main
      main.insertAdjacentHTML('afterbegin', menuHTML);
    }
  }
  
  // Load menu when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadOffenderNewsMenu);
  } else {
    loadOffenderNewsMenu();
  }
})();

