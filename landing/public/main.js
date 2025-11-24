(() => {
  const API_BASE_URL = (window.PUBLIC_API_BASE || '').replace(/\/+$/, '');
  const lovedOnesListEl = document.getElementById('lovedOnesList');
  const lovedOnesErrorEl = document.getElementById('lovedOnesError');
  const lovedOnesCountEl = document.getElementById('lovedOnesCount');
  const lastUpdatedLabelEl = document.getElementById('lastUpdatedLabel');
  const filterForm = document.getElementById('lovedOnesFilters');
  const refreshButton = document.getElementById('refreshLovedOnes');
  const scrollButton = document.getElementById('scrollToLovedOnes');
  const contactForm = document.getElementById('contactForm');
  const contactSubmit = document.getElementById('contactSubmit');
  const toastEl = document.querySelector('[data-role="toast"]');
  const yearLabel = document.getElementById('yearLabel');

  let lovedOnesAbortController;
  if (yearLabel) {
    yearLabel.textContent = new Date().getFullYear();
  }

  if (scrollButton) {
    scrollButton.addEventListener('click', () => {
      document.getElementById('lovedOnesSection')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  function escapeHtml(value = '') {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchLovedOnes(params = {}) {
    if (!lovedOnesListEl) return;
    setLovedOnesState('loading');
    lovedOnesErrorEl?.classList.add('hidden');
    if (lovedOnesAbortController) lovedOnesAbortController.abort();
    lovedOnesAbortController = new AbortController();

    try {
      const url = new URL(`${API_BASE_URL}/api/public/loved-ones`);
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });

      const response = await fetch(url.toString(), { signal: lovedOnesAbortController.signal });
      if (!response.ok) {
        throw new Error('Unable to load loved ones at this time.');
      }
      const data = await response.json();
      renderLovedOnes(data.results || []);
      lovedOnesCountEl.textContent = data.results?.length ?? 0;
      if (lastUpdatedLabelEl) {
        lastUpdatedLabelEl.textContent = new Date().toLocaleString();
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setLovedOnesState('error', err.message || 'Something went wrong.');
    }
  }

  function renderLovedOnes(items) {
    if (!items.length) {
      lovedOnesListEl.innerHTML = '<p class="meta">No loved ones match the filters provided.</p>';
      setLovedOnesState('idle');
      return;
    }

    lovedOnesListEl.innerHTML = items.map(item => {
      const initials = item.familyContactInitials
        ? `<span class="badge">${escapeHtml(item.familyContactInitials)}</span>`
        : '';
      const summary = escapeHtml(item.summary ?? 'Details to be shared with case workers.');
      const relationship = item.relationship ? escapeHtml(`Relationship: ${item.relationship}`) : '';
      return `
        <article class="card">
          <div class="card__header">
            ${initials}
            <h3>${escapeHtml(item.name)}</h3>
          </div>
          <p class="meta">${escapeHtml(formatLocation(item))}</p>
          <p class="meta">${escapeHtml(formatDate(item.dateOfIncident))}</p>
          <span class="badge critical">${escapeHtml(item.status)}</span>
          <p>${summary}</p>
          <p class="meta">${relationship}</p>
        </article>
      `;
    }).join('');
    setLovedOnesState('idle');
  }

  function formatLocation(item) {
    const parts = [item.lastLocation, item.community, item.province].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Location to be confirmed';
  }

  function formatDate(value) {
    if (!value) return 'Date unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `Last seen: ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  }

  function setLovedOnesState(state, message = '') {
    if (!lovedOnesListEl) return;
    lovedOnesListEl.dataset.state = state;
    if (state === 'error') {
      lovedOnesErrorEl.textContent = message;
      lovedOnesErrorEl.classList.remove('hidden');
    } else {
      lovedOnesErrorEl?.classList.add('hidden');
    }
  }

  function getFilterValues() {
    if (!filterForm) return {};
    const formData = new FormData(filterForm);
    return ['search', 'community', 'province', 'status'].reduce((acc, key) => {
      const value = formData.get(key)?.toString().trim();
      if (value) acc[key] = value;
      return acc;
    }, {});
  }

  let filterDebounce;
  if (filterForm) {
    filterForm.addEventListener('input', () => {
      clearTimeout(filterDebounce);
      filterDebounce = setTimeout(() => fetchLovedOnes(getFilterValues()), 350);
    });
    filterForm.addEventListener('submit', evt => evt.preventDefault());
  }

  refreshButton?.addEventListener('click', () => fetchLovedOnes(getFilterValues()));

  if (contactForm) {
    contactForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!API_BASE_URL) {
        showToast('API base URL is not configured.', 'error');
        return;
      }

      const formData = new FormData(contactForm);
      const payload = {
        fullName: formData.get('fullName')?.toString().trim(),
        email: formData.get('email')?.toString().trim(),
        phone: formData.get('phone')?.toString().trim(),
        community: formData.get('community')?.toString().trim(),
        preferredContactMethod: formData.get('preferredContactMethod')?.toString().trim(),
        message: formData.get('message')?.toString().trim()
      };

      if (!payload.fullName || !payload.email || !payload.message) {
        showToast('Please complete the required fields.', 'error');
        return;
      }

      try {
        contactSubmit.disabled = true;
        contactSubmit.textContent = 'Sending...';
        const response = await fetch(`${API_BASE_URL}/api/public/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || 'Unable to submit inquiry.');
        }
        contactForm.reset();
        showToast('Thank you. Our team will reach out shortly.', 'success');
      } catch (err) {
        showToast(err.message || 'We could not submit your inquiry. Please try again.', 'error');
      } finally {
        contactSubmit.disabled = false;
        contactSubmit.textContent = 'Submit inquiry';
      }
    });
  }

  function showToast(message, variant = 'info') {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.dataset.variant = variant;
    toastEl.setAttribute('data-visible', 'true');
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => {
      toastEl.removeAttribute('data-visible');
    }, 4500);
  }

  // Initial load
  fetchLovedOnes();
})();


