const maxBodyBytes = 1024 * 1024;

export function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.warn('whatsapp_webhook_verify_token_missing');
    return new Response('WhatsApp webhook verify token is not configured', { status: 503 });
  }

  if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    console.log('whatsapp_webhook_verified');
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  console.warn('whatsapp_webhook_verification_failed', {
    mode,
    hasToken: Boolean(token),
    hasChallenge: Boolean(challenge)
  });
  return new Response('Forbidden', { status: 403 });
}

export async function onRequestPost({ request, env }) {
  let body;

  try {
    body = await readRequestBody(request, maxBodyBytes);
  } catch (error) {
    console.warn('whatsapp_webhook_body_rejected', error instanceof Error ? error.message : error);
    return new Response('Payload too large', { status: 413 });
  }

  // Fail closed: without META_APP_SECRET we cannot verify the Meta signature, so we
  // must NOT forward an unverified payload to the backend (the Worker attaches the
  // trusted X-Wopa-Webhook-Secret on forward, so an unverified body would be vouched
  // for downstream). Mirrors the GET verify handler's 503 and the backend's own
  // fail-closed behaviour.
  if (!env.META_APP_SECRET) {
    console.error('whatsapp_webhook_meta_app_secret_missing');
    return new Response('Webhook signing secret is not configured', { status: 503 });
  }

  const valid = await isValidMetaSignature(
    env.META_APP_SECRET,
    body,
    request.headers.get('X-Hub-Signature-256')
  );
  if (!valid) {
    console.warn('whatsapp_webhook_signature_failed');
    return new Response('Invalid signature', { status: 401 });
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(body));
    console.log('whatsapp_webhook_received', summarizeWhatsAppWebhook(payload));

    if (env.WOPA_BACKEND_WEBHOOK_URL) {
      const forwardResponse = await forwardToBackend(request, env, body);
      if (!forwardResponse.ok) {
        console.error('whatsapp_webhook_forward_failed', {
          status: forwardResponse.status,
          statusText: forwardResponse.statusText
        });
        return new Response('Backend forward failed', { status: 502 });
      }
      console.log('whatsapp_webhook_forwarded', { status: forwardResponse.status });
    }

    return new Response('EVENT_RECEIVED', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    console.warn('whatsapp_webhook_invalid_json', error instanceof Error ? error.message : error);
    return new Response('Invalid JSON', { status: 400 });
  }
}

async function forwardToBackend(request, env, body) {
  if (!env.WOPA_BACKEND_WEBHOOK_SECRET) {
    console.error('whatsapp_backend_webhook_secret_missing');
    return new Response('Backend webhook secret is not configured', { status: 503 });
  }

  const headers = new Headers({
    'Content-Type': request.headers.get('Content-Type') || 'application/json',
    'X-Wopa-Webhook-Secret': env.WOPA_BACKEND_WEBHOOK_SECRET
  });
  const metaSignature = request.headers.get('X-Hub-Signature-256');
  if (metaSignature) {
    headers.set('X-Hub-Signature-256', metaSignature);
  }

  return fetch(env.WOPA_BACKEND_WEBHOOK_URL, {
    method: 'POST',
    headers,
    body
  });
}

async function readRequestBody(request, maxBytes) {
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) {
    throw new Error(`Request body exceeded ${maxBytes} bytes`);
  }
  return body;
}

async function isValidMetaSignature(secret, body, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, body);
  const expected = `sha256=${toHex(digest)}`;
  return timingSafeEqual(signatureHeader, expected);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function summarizeWhatsAppWebhook(payload) {
  if (!payload || typeof payload !== 'object') {
    return { object: 'unknown', entries: 0 };
  }

  return {
    object: payload.object || 'unknown',
    entries: Array.isArray(payload.entry) ? payload.entry.length : 0
  };
}
