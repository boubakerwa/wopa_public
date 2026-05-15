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

  const statements = submission.contacts.map((item) => db.prepare(`
      INSERT INTO waitlist_submissions (
        id, group_id, channel, contact, mode, page_path, incentive, user_agent, country, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      item.id,
      submission.id,
      item.channel,
      item.contact,
      submission.mode,
      submission.pagePath,
      submission.incentive,
      submission.userAgent,
      submission.country,
      submission.createdAt
    ));

  if (typeof db.batch === 'function') {
    await db.batch(statements);
  } else {
    for (const statement of statements) await statement.run();
  }

  return true;
}

async function storeInKV(env, submission) {
  const kv = env.WOPA_WAITLIST || env.WAITLIST;
  if (!kv || typeof kv.put !== 'function') return false;

  await kv.put(`waitlist:${submission.createdAt}:${submission.id}`, JSON.stringify(submission), {
    metadata: {
      channels: submission.contacts.map((item) => item.channel).join(','),
      mode: submission.mode,
      incentive: submission.incentive
    }
  });

  return true;
}

function getEmailContact(submission) {
  const item = submission.contacts.find((contact) => contact.channel === 'email');
  return item ? item.contact : '';
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
    return { sent: false, reason: 'resend_not_configured' };
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

  const rawContacts = Array.isArray(body.contacts)
    ? body.contacts
    : [{ channel: body.channel, contact: body.contact }];

  const contacts = [];
  for (const raw of rawContacts) {
    const channel = String(raw && raw.channel || '').toLowerCase();
    const contact = normalizeContact(channel, raw && raw.contact);
    const validationError = validate(channel, contact);
    if (validationError) return json({ error: validationError }, 400);
    contacts.push({
      id: crypto.randomUUID(),
      channel,
      contact
    });
  }

  if (!contacts.length) return json({ error: 'Choose at least one contact channel.' }, 400);

  const submission = {
    id: crypto.randomUUID(),
    contacts,
    mode: String(body.mode || 'unknown').slice(0, 40),
    pagePath: String(body.page_path || '').slice(0, 160),
    incentive: String(body.incentive || 'founder_pricing').slice(0, 80),
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
