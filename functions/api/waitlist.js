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

export async function onRequestPost({ request, env }) {
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

  return json({ ok: true, id: submission.id }, 201);
}

export function onRequestOptions() {
  return json({ ok: true });
}
