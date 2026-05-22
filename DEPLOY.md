# Deploying the WOPA Cloudflare Worker

## Secrets

The Worker requires the following secrets. These are set once via CLI and **persist across deployments** — `npx wrangler deploy` does not overwrite them.

```bash
# Meta webhook signature validation
npx wrangler secret put META_APP_SECRET

# WhatsApp webhook verification token (must match Meta console)
npx wrangler secret put WHATSAPP_WEBHOOK_VERIFY_TOKEN

# WhatsApp Cloud API access token (System User permanent token)
npx wrangler secret put WHATSAPP_ACCESS_TOKEN

# Backend tunnel URL — where the Worker forwards webhooks
# e.g. https://<tunnel>.trycloudflare.com/webhooks/whatsapp
npx wrangler secret put WOPA_BACKEND_WEBHOOK_URL

# Shared secret for authenticating forwarded webhooks to the backend
# Must match WOPA_BACKEND_WEBHOOK_SECRET in the backend .env
npx wrangler secret put WOPA_BACKEND_WEBHOOK_SECRET

# Stripe keys (for billing webhooks)
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET

# Resend (for email delivery)
npx wrangler secret put RESEND_API_KEY
```

## Deploy

```bash
cd wopa_public
npx wrangler deploy
```

Secrets survive redeployments. You only need to re-run `wrangler secret put` when a value changes.

## Quick tunnel URL changes

When `cloudflared` restarts, the tunnel URL changes. Update the backend URL:

```bash
npx wrangler secret put WOPA_BACKEND_WEBHOOK_URL
# paste: https://<new-tunnel-url>/webhooks/whatsapp
```

No redeployment needed — secret updates take effect immediately.

## Verify secrets are set

```bash
npx wrangler secret list
```
