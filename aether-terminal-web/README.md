# Aether Terminal Web (PWA)

Mobile-first Progressive Web App for iPhone merchants who cannot run the native Android terminal.

## Limitations

- **No Tap to Pay on iPhone** â€” Stripe Terminal SDK does not run in the browser. This app uses **Stripe Payment Element** (card-not-present entry) on the connected Stripe account.
- **Pay in full** supports card, **Klarna**, and **Afterpay** (USD; Klarna min ~$35, Afterpay max ~$2,000). Enable both methods in Stripe Dashboard â†’ Settings â†’ Payment methods.
- **Aether Pay in 4** is card-only (saves payment method for future installments).
- Requires HTTPS and a modern Safari/Chrome mobile browser.

## Features

- Stripe Connect OAuth onboarding (returns to `/oauth-return?connected_id=acct_â€¦`)
- Read-only connected account ID
- WooCommerce catalog sync (when WordPress is linked)
- Custom amount field
- Pay in full and Pay in 4 with schedule picker
- View/collect installment plans; open/share customer payment links

## Local development

```bash
cd aether-terminal-web
npm install
npm run dev
```

Set billing CORS to include your dev origin, e.g. `http://localhost:5173` in `AETHER_ALLOWED_ORIGIN`.

## Production build

```bash
npm run build
```

Upload the contents of `dist/` to your static host (e.g. Hostinger `public_html` for **terminal.aetherframeworks.dev**).

### Hostinger static site

1. Create subdomain `terminal.aetherframeworks.dev` pointing to a document root.
2. Upload `dist/*` via File Manager or SFTP.
3. Ensure `index.html` is served for SPA routes (fallback rewrite).

## Install on iPhone

1. Open **https://terminal.aetherframeworks.dev** in Safari.
2. Tap **Share** â†’ **Add to Home Screen**.
3. Launch from the home screen icon (standalone mode).

Add PNG icons (`public/icon-192.png`, `public/icon-512.png`) before production for best iOS install appearance. `icon.svg` is included for development.

## Billing server requirements

- Deploy updated `aether-billing-core` with:
  - `POST /api/v1/terminal/web/payment-intent`
  - `GET /api/v1/terminal/onboarding-url?return_url=â€¦`
  - CORS: `AETHER_ALLOWED_ORIGIN=https://your-wp-site.com,https://terminal.aetherframeworks.dev`
- Stripe Connect redirect URI: `https://billing.aetherframeworks.dev/api/v1/stripe/callback`

## Environment

The PWA calls `https://billing.aetherframeworks.dev` by default (`src/config.ts`). Override for local billing testing if needed.

