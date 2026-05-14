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

## Modes

- **Telegram mode:** chat-native invoicing through Telegram.
- **WhatsApp mode:** the same workflow shaped for WhatsApp Business.

## What It Does

- Creates invoices from natural language.
- Sends professional PDF invoices by email.
- Schedules payment reminders automatically.
- Tracks outstanding and paid jobs from chat.
