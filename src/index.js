import { onRequestOptions, onRequestPost } from '../functions/api/waitlist.js';

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

    return env.ASSETS.fetch(request);
  }
};
