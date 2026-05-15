# WOPA

<p align="center">
  <img alt="GitHub Pages" src="https://img.shields.io/badge/GitHub%20Pages-live-222?style=for-the-badge&logo=githubpages&logoColor=white&labelColor=111&color=f0a500">
  <img alt="Chat Invoicing" src="https://img.shields.io/badge/Chat-Invoicing-222?style=for-the-badge&labelColor=111&color=25D366">
  <img alt="Built for Trades" src="https://img.shields.io/badge/Built%20for-UK%20Tradespeople-222?style=for-the-badge&labelColor=111&color=444">
</p>

WOPA is a chat-native invoicing assistant for UK tradespeople. It turns everyday Telegram or WhatsApp messages into professional invoices, payment reminders, and paid-status tracking.

## Live Demo

[View the landing page](https://boubakerwa.github.io/wopa_public/)

## Waitlist on Cloudflare

The landing page posts waitlist submissions to `/api/waitlist`, implemented by the Cloudflare Worker entrypoint in `src/index.js` and the handler in `functions/api/waitlist.js`.

Recommended storage is D1:

```sh
wrangler d1 create wopa-waitlist
wrangler d1 execute wopa-waitlist --file=schema.sql
```

Bind the database to the `wopa` Worker project as `WOPA_WAITLIST_DB`. The function also supports a KV namespace bound as `WOPA_WAITLIST` if you want a simpler append-only MVP.

### Confirmation email with Resend

If the waitlist submission includes an email address, the Worker sends a confirmation email through Resend after the D1 write succeeds. The D1 write is still the source of truth; email failures are logged and do not reject the waitlist submission.

Set these Worker values in Cloudflare:

- `RESEND_API_KEY` as a secret
- `RESEND_EMAIL_FROM` as a variable, for example `WOPA <hello@mywopa.com>`

For local development, the same names can live in `.env` or `.dev.vars`, but production deploys only see values configured in Cloudflare.

## Modes

- **Telegram mode:** chat-native invoicing through Telegram.
- **WhatsApp mode:** the same workflow shaped for WhatsApp Business.

## What It Does

- Creates invoices from natural language.
- Sends professional PDF invoices by email.
- Schedules payment reminders automatically.
- Tracks outstanding and paid jobs from chat.
