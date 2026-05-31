import * as Sentry from '@sentry/cloudflare';
import { onRequestOptions, onRequestPost } from '../functions/api/waitlist.js';
import { onRequestGet as onWhatsAppRequestGet, onRequestPost as onWhatsAppRequestPost } from '../functions/api/whatsapp.js';

function withCacheHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  if (pathname === '/robots.txt' || pathname === '/sitemap.xml') {
    headers.set('cache-control', 'public, max-age=3600');
  } else if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?)$/i.test(pathname)) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  } else if (headers.get('content-type')?.includes('text/html')) {
    headers.set('cache-control', 'public, max-age=0, must-revalidate');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // TEMPORARY (#89 verification): unhandled throw to confirm Sentry captures errors.
    // Remove after confirming the event appears in the Sentry "wopa gateway" project.
    if (url.pathname === '/__sentry-test') {
      throw new Error('WOPA gateway Sentry test — please ignore');
    }

    if (url.pathname === '/healthz') {
      return new Response('ok', {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    if (url.pathname === '/api/waitlist') {
      if (request.method === 'POST') {
        return onRequestPost({ request, env, ctx });
      }
      if (request.method === 'OPTIONS') {
        return onRequestOptions({ request, env, ctx });
      }
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'POST, OPTIONS' }
      });
    }

    if (url.pathname === '/webhooks/whatsapp') {
      if (request.method === 'GET') {
        return onWhatsAppRequestGet({ request, env, ctx });
      }
      if (request.method === 'POST') {
        return onWhatsAppRequestPost({ request, env, ctx });
      }
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, POST' }
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withCacheHeaders(assetResponse, url.pathname);
  }
};

// Wrap the Worker with Sentry. No-op when SENTRY_DSN is unset (so local/dev and any
// environment without the secret behave exactly as before). DSN is provided via a
// Cloudflare secret, never committed. PII (user IPs, etc.) is NOT sent — the gateway
// handles WhatsApp phone numbers, so we keep sendDefaultPii off for GDPR.
export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN ?? '',
    enabled: Boolean(env.SENTRY_DSN),
    tracesSampleRate: 1.0,
    enableLogs: true,
    sendDefaultPii: false,
  }),
  handler,
);
