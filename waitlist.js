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
    return /^\+?[0-9][0-9\s().-]{6,}$/.test(value);
  }

  function getContactDetails(form) {
    const email = (form.querySelector('[data-email-input]') || form.querySelector('[name="contact_email"]') || {}).value || '';
    const messaging = (form.querySelector('[data-messaging-input]') || form.querySelector('[name="contact_messaging"]') || {}).value || '';
    const trimmedEmail = email.trim();
    const trimmedMessaging = messaging.trim();

    if (!trimmedEmail && !trimmedMessaging) {
      return { error: 'Add an email or WhatsApp contact.', email: '', messaging: '' };
    }

    if (trimmedEmail) {
      if (!validEmail(trimmedEmail)) {
        return { error: 'Enter a valid email address.', email: '', messaging: '' };
      }
    }

    if (trimmedMessaging) {
      if (!validMessaging(trimmedMessaging)) {
        return { error: 'Enter a valid WhatsApp number.', email: '', messaging: '' };
      }
    }

    return { error: '', email: trimmedEmail, messaging: trimmedMessaging };
  }

  function getChannels(contactDetails) {
    return [
      contactDetails.email ? 'email' : '',
      contactDetails.messaging ? 'messaging' : ''
    ].filter(Boolean);
  }

  forms.forEach((form) => {
    const submit = form.querySelector('[data-waitlist-submit]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const trap = form.querySelector('input[name="company"]');
      const marketingOptIn = form.querySelector('[name="marketing_opt_in"]')?.checked === true;
      const result = getContactDetails(form);
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
            email: result.email,
            messaging_contact: result.messaging,
            company: trap ? trap.value : '',
            marketing_opt_in: marketingOptIn,
            consent_version: form.dataset.consentVersion || 'landing-2026-05-17',
            mode: form.dataset.waitlistMode || document.body.dataset.wopaMode || 'unknown',
            page_path: window.location.pathname,
            incentive: form.dataset.waitlistIncentive || 'founder_pricing'
          })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Something went wrong. Try again.');
        }

        form.reset();
        setStatus(form, form.dataset.successMessage || 'You are on the waitlist. Founder pricing reserved.', 'success');
        capture('wopa_waitlist_joined', {
          channels: getChannels(result),
          waitlist_id: data.id || ''
        });
      } catch (error) {
        setStatus(form, error.message || 'Something went wrong. Try again.', 'error');
        capture('wopa_waitlist_submit_failed', {
          channels: getChannels(result)
        });
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
})();
