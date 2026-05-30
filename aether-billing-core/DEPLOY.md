# Deploy aether-billing-core on Hostinger

Target: **billing.aetherframeworks.dev** → Node on `127.0.0.1:5000`

> **Security:** Never commit `.env` to git. Never paste Stripe secret keys or `AETHER_INTERNAL_SECRET` in chat. Configure secrets only on the server via SSH.

## SSH access

| Field    | Value              |
|----------|--------------------|
| Host     | `82.29.86.221`     |
| Port     | `65002`            |
| User     | `u454645708`       |
| Password | Set/reset in Hostinger hPanel → SSH Access |

```bash
ssh -p 65002 u454645708@82.29.86.221
```

If you use an SSH key, add your public key in hPanel first. Automated deploy from this machine failed (no authorized key on the server).

## One-command deploy (on server)

After SSH login:

```bash
curl -fsSL https://raw.githubusercontent.com/elderworlds/AetherBilling/a46c3c1/aether-billing-core/deploy-hostinger.sh -o deploy-hostinger.sh
chmod +x deploy-hostinger.sh
./deploy-hostinger.sh
```

Or, if the repo is already on the server:

```bash
cd ~/AetherBilling/aether-billing-core
chmod +x deploy-hostinger.sh
./deploy-hostinger.sh
```

## Manual step-by-step

```bash
# 1. Clone (first time only)
git clone https://github.com/elderworlds/AetherBilling.git ~/AetherBilling
cd ~/AetherBilling/aether-billing-core

# 2. Install dependencies
npm install --production

# 3. Environment (required before first start)
cp .env.example .env
nano .env
```

```json
{"ok":true,"service":"aether-billing-core","version":"2026-05-30-terminal-pwa-v1","chargeModel":"direct"}
```

Set at minimum (add PWA origin to CORS):

- `PORT=5000`
- `STRIPE_PLATFORM_SECRET_KEY` — from Stripe Dashboard (live or test)
- `STRIPE_PLATFORM_PUBLIC_KEY`
- `AETHER_INTERNAL_SECRET` — long random string (shared with WordPress plugin)
- `STRIPE_CLIENT_ID` — Stripe Connect client ID
- `AETHER_ALLOWED_ORIGIN` — comma-separated: WordPress site URL **and** PWA origin (e.g. `https://yoursite.com,https://terminal.aetherframeworks.dev`)
- `NODE_BASE_URL=https://billing.aetherframeworks.dev`
- `STRIPE_WEBHOOK_SECRET` — from Stripe Dashboard → Webhooks → endpoint `https://billing.aetherframeworks.dev/api/v1/webhooks/stripe` (event: `payment_intent.succeeded`, Connect events on connected accounts)

**Optional — Pay in 4 customer emails (Resend):**

- `RESEND_API_KEY` — from [Resend](https://resend.com) dashboard (starts with `re_`). **Never commit this key.**
- `RESEND_FROM` — verified sender, e.g. `Aether Pay <payments@aetherframeworks.dev>`
- In Resend → Domains, add and verify `aetherframeworks.dev` (SPF/DKIM). Without verification, sends will fail (logged only; payments still work).
- If either variable is unset, email is disabled and all billing flows behave as before.

```bash
# 4. Install pm2 (once)
npm install -g pm2

# 5. Start app
pm2 start server.js --name aether-billing
pm2 save
pm2 startup   # follow the printed command so pm2 survives reboot

# 6. Local health check
curl -s http://127.0.0.1:5000/health
```

Expected JSON:

```json
{"ok":true,"service":"aether-billing-core","version":"2026-05-30-terminal-pwa-v1","chargeModel":"direct"}
```

## Fix Hostinger 503 “Node not running”

1. Confirm Node responds locally: `curl http://127.0.0.1:5000/health`
2. If that fails: `pm2 logs aether-billing --lines 50`
3. In **hPanel → Websites → billing.aetherframeworks.dev → Node.js** (or Advanced → Proxy):
   - Application root: `AetherBilling/aether-billing-core` (or your path)
   - Startup file: `server.js`
   - Port: `5000`
4. Apply reverse proxy so the subdomain forwards to `127.0.0.1:5000`. Snippet is written to `~/aether-billing-nginx.conf` by the deploy script.

## Updates (after code changes)

```bash
cd ~/AetherBilling
git pull
cd aether-billing-core
npm install --production
pm2 restart aether-billing
curl -s http://127.0.0.1:5000/health
```

## Stripe test mode (production billing server)

To run **billing.aetherframeworks.dev** in Stripe test mode (terminal + PWA use `/api/v1/terminal/config` for the publishable key and `mode`):

1. SSH to Hostinger (see above).
2. Edit `~/AetherBilling/aether-billing-core/.env`:
   - `STRIPE_PLATFORM_SECRET_KEY=sk_test_...`
   - `STRIPE_PLATFORM_PUBLIC_KEY=pk_test_...`
   - `STRIPE_DEFAULT_CURRENCY=usd`
   - `STRIPE_DEFAULT_COUNTRY=US`
3. Restart: `pm2 restart aether-billing`
4. Verify: `curl -s https://billing.aetherframeworks.dev/api/v1/terminal/config` — expect `"mode":"test"` and a `pk_test_` publishable key.

**Never commit** `.env` or paste secret keys in chat. Rotate keys if they were exposed.

To switch back to live mode, replace with `sk_live_` / `pk_live_` keys and restart pm2.

## Verify production

```bash
curl -s https://billing.aetherframeworks.dev/health
curl -s https://billing.aetherframeworks.dev/
```

Root should return: `Aether Billing API is running.`

## Troubleshooting

| Symptom | Action |
|---------|--------|
| 503 from Hostinger | Node not running or proxy not set — check `pm2 status` |
| `EADDRINUSE` | Another process on 5000 — `pm2 delete aether-billing` and restart |
| Stripe errors | Verify `.env` keys and `NODE_BASE_URL` match live/test mode |
| CORS errors from WP | Set `AETHER_ALLOWED_ORIGIN` to exact WordPress origin |
| CORS errors from PWA | Add PWA URL to comma-separated `AETHER_ALLOWED_ORIGIN` |

## Deploy PWA (iPhone terminal)

Target: **terminal.aetherframeworks.dev** (static files)

```bash
# On your dev machine
cd apps/aether-terminal-web
npm install
npm run build
# Upload dist/ to Hostinger public_html for terminal.aetherframeworks.dev
```

In Stripe Connect settings, ensure OAuth redirect URI includes:
`https://billing.aetherframeworks.dev/api/v1/stripe/callback`

PWA OAuth uses `return_url=https://terminal.aetherframeworks.dev/oauth-return` (handled by billing callback → PWA).

## Android APK (debug signing)

Release APK from `apps/aether-terminal/build-android.ps1` uses the **debug keystore** by default (fine for sideload/testing). Play Store requires a dedicated release keystore — document only; not configured in this repo.
