import { onRequestOptions, onRequestPost } from '../functions/api/waitlist.js';
import { onRequestGet as onWhatsAppRequestGet, onRequestPost as onWhatsAppRequestPost } from '../functions/api/whatsapp.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

    return env.ASSETS.fetch(request);
  }
};
