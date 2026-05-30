# Deploy Aether Terminal Web on Hostinger (Node.js + Passenger)

Production stack: **Express** serves Vite `dist/` (React PWA), injects runtime config, SPA fallback, `/health`.

**Do not** deploy billing (`aether-billing-core`) on `terminal.aetherframeworks.dev`. Billing stays on **billing.aetherframeworks.dev** only.

## Server layout

```text
/home/u454645708/domains/terminal.aetherframeworks.dev/
  nodejs/
    server.js
    package.json
    package-lock.json
    dist/              # npm run build output
    node_modules/
    tmp/restart.txt    # touch to restart Passenger
  public_html/
    .htaccess          # Passenger → nodejs/
```

## Environment (hPanel → Websites → terminal → Node.js)

| Variable | Example | Notes |
|----------|---------|--------|
| `NODE_ENV` | `production` | |
| `PORT` | `5000` | Hostinger/Passenger may override |
| `BILLING_API_URL` | `https://billing.aetherframeworks.dev` | Injected as `window.__AETHER_CONFIG__` |
| `STRIPE_PUBLISHABLE_KEY` | *(optional)* | Fallback if billing config unreachable |

Build-time vars (optional if using runtime injection):

- `VITE_BILLING_API_URL` in `.env.production` when running `npm run build`

## Local build

```powershell
cd apps/aether-terminal-web
npm ci
npm run build
npm start
# http://localhost:5000/health
```

## SSH deploy

```powershell
cd apps/aether-terminal-web
npm ci
npm run build
bash ./deploy-hostinger.sh
```

SSH: `ssh -p 65002 -i ~/.ssh/anytimeautolot_hostinger u454645708@82.29.86.221`

Manual rsync (PowerShell):

```powershell
scp -P 65002 -i $env:USERPROFILE\.ssh\anytimeautolot_hostinger -r `
  server.js package.json package-lock.json dist `
  u454645708@82.29.86.221:domains/terminal.aetherframeworks.dev/nodejs/
scp -P 65002 -i $env:USERPROFILE\.ssh\anytimeautolot_hostinger `
  deploy/public_html.htaccess `
  u454645708@82.29.86.221:domains/terminal.aetherframeworks.dev/public_html/.htaccess
```

On server:

```bash
cd ~/domains/terminal.aetherframeworks.dev/nodejs
npm install --production
touch tmp/restart.txt
```

## Billing CORS

On **billing** app env, include terminal origin in `AETHER_ALLOWED_ORIGIN`:

```text
https://terminal.aetherframeworks.dev,https://your-other-origin.example
```

Restart billing after changes. **Do not** remove or repoint billing subdomain.

## Verification

| URL | Expected |
|-----|----------|
| https://terminal.aetherframeworks.dev/health | `{"ok":true,"service":"aether-terminal-web"}` |
| https://terminal.aetherframeworks.dev/ | Terminal UI (not "Aether Billing API is running") |
| https://billing.aetherframeworks.dev/health | `service: aether-billing-core` unchanged |

PWA: DevTools → Application → Manifest + Service Worker; iOS Add to Home Screen.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Shows billing API text on terminal | Wrong Node app on terminal subdomain — deploy terminal `server.js` to `nodejs/` and Passenger `.htaccess` |
| 503 build missing | Run `npm run build` before `npm start` |
| CORS errors | Update billing `AETHER_ALLOWED_ORIGIN` |
| OAuth refresh 404 | Express SPA fallback serves `index.html` for `/oauth-return` |

Legacy static-only upload: see `HOSTINGER-DEPLOY.md` (deprecated).

## hPanel Node.js (required once)

1. **Websites** → **terminal.aetherframeworks.dev** → **Node.js** (or add website if you see Hostinger "Page Does Not Exist").
2. Application root: `domains/terminal.aetherframeworks.dev/nodejs`
3. Startup file: `server.js`
4. Node version: 22.x (match billing)
5. Environment variables (panel):

```text
NODE_ENV=production
BILLING_API_URL=https://billing.aetherframeworks.dev
```

6. Deploy / restart app, then `touch ~/domains/terminal.aetherframeworks.dev/nodejs/tmp/restart.txt`

SSH npm (non-interactive shells):

```bash
/opt/alt/alt-nodejs22/root/usr/bin/npm install --omit=dev
```
