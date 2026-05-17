const CHANNELS = new Set(['whatsapp', 'telegram', 'email', 'messaging']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function normalizeContact(channel, contact) {
  const value = String(contact || '').trim();
  if (!value) return '';
  if (channel === 'telegram' && value[0] !== '@' && !/^\+?[0-9]/.test(value)) {
    return `@${value}`;
  }
  return value;
}

function validate(channel, contact) {
  if (!CHANNELS.has(channel)) return 'Choose email or WhatsApp / Telegram.';
  if (!contact) return 'Contact details are required.';
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return 'Enter a valid email address.';
  }
  if ((channel === 'whatsapp' || channel === 'messaging') && !/^(@?[a-zA-Z0-9_]{5,}|(\+?[0-9][0-9\s().-]{6,}))$/.test(contact)) {
    return 'Enter a valid WhatsApp / Telegram number or handle.';
  }
  if (channel === 'telegram' && !/^(@?[a-zA-Z0-9_]{5,}|(\+?[0-9][0-9\s().-]{6,}))$/.test(contact)) {
    return 'Enter a Telegram handle or phone number.';
  }
  return '';
}

async function storeInD1(env, submission) {
  const db = env.WOPA_WAITLIST_DB || env.DB;
  if (!db || typeof db.prepare !== 'function') return false;

  try {
    await db.prepare(`
      INSERT INTO waitlist_submissions (
        id, group_id, channel, contact, email, messaging_contact, mode, page_path, incentive, marketing_opt_in, consent_version, user_agent, country, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      submission.id,
      null,
      submission.channel,
      submission.contact,
      submission.email,
      submission.messagingContact,
      submission.mode,
      submission.pagePath,
      submission.incentive,
      submission.marketingOptIn ? 1 : 0,
      submission.consentVersion,
      submission.userAgent,
      submission.country,
      submission.createdAt
    ).run();
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    await db.prepare(`
      INSERT INTO waitlist_submissions (
        id, group_id, channel, contact, mode, page_path, incentive, user_agent, country, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      submission.id,
      null,
      submission.channel,
      getLegacyContact(submission),
      submission.mode,
      submission.pagePath,
      submission.incentive,
      submission.userAgent,
      submission.country,
      submission.createdAt
    ).run();
  }

  return true;
}

function isMissingColumnError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /no column named|has no column named|table .* has no column/i.test(message);
}

async function storeInKV(env, submission) {
  const kv = env.WOPA_WAITLIST || env.WAITLIST;
  if (!kv || typeof kv.put !== 'function') return false;

  await kv.put(`waitlist:${submission.createdAt}:${submission.id}`, JSON.stringify(submission), {
    metadata: {
      channels: getSubmissionChannels(submission).join(','),
      mode: submission.mode,
      incentive: submission.incentive,
      marketing_opt_in: submission.marketingOptIn ? 'true' : 'false',
      consent_version: submission.consentVersion
    }
  });

  return true;
}

function getEmailContact(submission) {
  return submission.email || '';
}

function getSubmissionChannels(submission) {
  return [
    submission.email ? 'email' : '',
    submission.messagingContact ? 'messaging' : ''
  ].filter(Boolean);
}

function getLegacyContact(submission) {
  if (submission.email && submission.messagingContact) {
    return `${submission.email} | ${submission.messagingContact}`;
  }
  return submission.contact;
}

function confirmationEmail(email, submission) {
  const subject = "You're on the WOPA waitlist";
  const text = [
    "You're on the WOPA waitlist.",
    '',
    'Founder pricing is reserved for you. We will contact you when early access opens.',
    '',
    `Reference: ${submission.id}`,
    '',
    'WOPA'
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#171717;max-width:560px">
      <h1 style="font-size:24px;line-height:1.15;margin:0 0 16px">You're on the WOPA waitlist.</h1>
      <p style="margin:0 0 14px">Founder pricing is reserved for you. We will contact you when early access opens.</p>
      <p style="margin:0 0 20px;color:#666">Reference: ${submission.id}</p>
      <p style="margin:0;font-weight:700">WOPA</p>
    </div>
  `;

  return {
    from: '',
    to: [email],
    subject,
    text,
    html
  };
}

async function sendConfirmationEmail(env, submission) {
  const email = getEmailContact(submission);
  if (!email) return { sent: false, reason: 'no_email' };
  if (!env.RESEND_API_KEY || !env.RESEND_EMAIL_FROM) {
    return {
      sent: false,
      reason: 'resend_not_configured',
      missing: [
        !env.RESEND_API_KEY ? 'RESEND_API_KEY' : '',
        !env.RESEND_EMAIL_FROM ? 'RESEND_EMAIL_FROM' : ''
      ].filter(Boolean)
    };
  }

  const payload = confirmationEmail(email, submission);
  payload.from = env.RESEND_EMAIL_FROM;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Resend failed with ${response.status}: ${message.slice(0, 240)}`);
  }

  const result = await response.json().catch(() => ({}));
  return {
    sent: true,
    provider: 'resend',
    provider_id: result.id || ''
  };
}

export async function onRequestPost({ request, env, ctx }) {
  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json({ error: 'Send JSON.' }, 400);
  }

  if (body.company) {
    return json({ ok: true, id: 'accepted' });
  }

  const contactDetails = parseContactDetails(body);
  if (contactDetails.error) return json({ error: contactDetails.error }, 400);

  const submission = {
    id: crypto.randomUUID(),
    email: contactDetails.email,
    messagingContact: contactDetails.messagingContact,
    channel: contactDetails.channel,
    contact: contactDetails.contact,
    mode: String(body.mode || 'unknown').slice(0, 40),
    pagePath: String(body.page_path || '').slice(0, 160),
    incentive: String(body.incentive || 'founder_pricing').slice(0, 80),
    marketingOptIn: body.marketing_opt_in === true,
    consentVersion: String(body.consent_version || 'landing-2026-05-17').slice(0, 80),
    userAgent: request.headers.get('User-Agent') || '',
    country: request.cf && request.cf.country ? request.cf.country : '',
    createdAt: new Date().toISOString()
  };

  try {
    const stored = await storeInD1(env, submission) || await storeInKV(env, submission);
    if (!stored) {
      return json({
        error: 'Waitlist storage is not configured. Bind WOPA_WAITLIST_DB/D1 or WOPA_WAITLIST/KV in Cloudflare.'
      }, 503);
    }
  } catch (error) {
    return json({ error: 'Could not save the waitlist entry.' }, 500);
  }

  let confirmationEmail = { sent: false, reason: 'not_attempted' };
  try {
    confirmationEmail = await sendConfirmationEmail(env, submission);
  } catch (error) {
    confirmationEmail = {
      sent: false,
      provider: 'resend',
      error: error instanceof Error ? error.message : 'Unknown Resend error'
    };
    console.error('waitlist_confirmation_email_failed', confirmationEmail.error);
  }

  return json({
    ok: true,
    id: submission.id,
    confirmation_email: confirmationEmail
  }, 201);
}

export function onRequestOptions() {
  return json({ ok: true });
}

function parseContactDetails(body) {
  const rawEmail = body.email || body.contact_email || '';
  const rawMessaging = body.messaging_contact || body.contact_messaging || '';
  let email = normalizeContact('email', rawEmail);
  let messagingContact = normalizeContact('messaging', rawMessaging);

  if (!email && !messagingContact && Array.isArray(body.contacts)) {
    for (const raw of body.contacts) {
      const channel = String(raw && raw.channel || '').toLowerCase();
      const contact = normalizeContact(channel, raw && raw.contact);
      if (channel === 'email' && contact && !email) email = contact;
      if ((channel === 'whatsapp' || channel === 'telegram' || channel === 'messaging') && contact && !messagingContact) {
        messagingContact = contact;
      }
    }
  }

  if (!email && !messagingContact && body.channel && body.contact) {
    const channel = String(body.channel || '').toLowerCase();
    const contact = normalizeContact(channel, body.contact);
    if (channel === 'email') email = contact;
    if (channel === 'whatsapp' || channel === 'telegram' || channel === 'messaging') {
      messagingContact = contact;
    }
  }

  if (!email && !messagingContact) {
    return { error: 'Choose at least one contact channel.' };
  }

  if (email) {
    const validationError = validate('email', email);
    if (validationError) return { error: validationError };
  }

  if (messagingContact) {
    const validationError = validate('messaging', messagingContact);
    if (validationError) return { error: validationError };
  }

  return {
    email,
    messagingContact,
    channel: email && messagingContact ? 'messaging' : (email ? 'email' : 'messaging'),
    contact: messagingContact || email
  };
}
