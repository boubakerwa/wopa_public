(function () {
  const forms = document.querySelectorAll('[data-waitlist-form]');
  if (!forms.length) return;

  function capture(eventName, properties) {
    if (!window.posthog || typeof window.posthog.capture !== 'function') return;
    window.posthog.capture(eventName, Object.assign({
      mode: document.body.dataset.wopaMode || 'unknown',
      path: window.location.pathname
    }, properties || {}));
  }

  function setStatus(form, message, state) {
    const status = form.querySelector('[data-waitlist-status]');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || '';
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validMessaging(value) {
    return /^(@?[a-zA-Z0-9_]{5,}|(\+?[0-9][0-9\s().-]{6,}))$/.test(value);
  }

  function getContacts(form) {
    const email = (form.querySelector('[data-email-input]') || {}).value || '';
    const messaging = (form.querySelector('[data-messaging-input]') || {}).value || '';
    const trimmedEmail = email.trim();
    const trimmedMessaging = messaging.trim();
    const contacts = [];

    if (!trimmedEmail && !trimmedMessaging) {
      return { error: 'Add an email or WhatsApp / Telegram contact.', contacts: [] };
    }

    if (trimmedEmail) {
      if (!validEmail(trimmedEmail)) return { error: 'Enter a valid email address.', contacts: [] };
      contacts.push({ channel: 'email', contact: trimmedEmail });
    }

    if (trimmedMessaging) {
      if (!validMessaging(trimmedMessaging)) {
        return { error: 'Enter a valid WhatsApp / Telegram number or handle.', contacts: [] };
      }
      contacts.push({ channel: 'messaging', contact: trimmedMessaging });
    }

    return { error: '', contacts };
  }

  forms.forEach((form) => {
    const submit = form.querySelector('[data-waitlist-submit]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const trap = form.querySelector('input[name="company"]');
      const result = getContacts(form);
      if (result.error) {
        setStatus(form, result.error, 'error');
        capture('wopa_waitlist_validation_failed', { reason: result.error });
        return;
      }

      if (submit) submit.disabled = true;
      setStatus(form, 'Joining...', 'pending');

      try {
        const response = await fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contacts: result.contacts,
            company: trap ? trap.value : '',
            mode: document.body.dataset.wopaMode || 'unknown',
            page_path: window.location.pathname,
            incentive: 'founder_pricing'
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Something went wrong. Try again.');
        }

        form.reset();
        setStatus(form, 'You are on the list. Founder pricing reserved.', 'success');
        capture('wopa_waitlist_joined', {
          channels: result.contacts.map((item) => item.channel),
          waitlist_id: data.id || ''
        });
      } catch (error) {
        setStatus(form, error.message || 'Something went wrong. Try again.', 'error');
        capture('wopa_waitlist_submit_failed', {
          channels: result.contacts.map((item) => item.channel)
        });
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
})();
