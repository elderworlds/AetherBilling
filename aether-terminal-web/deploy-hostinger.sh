#!/usr/bin/env bash
set -euo pipefail

NPM_BIN="/opt/alt/alt-nodejs22/root/usr/bin/npm"
SSH_USER="${SSH_USER:-u454645708}"
SSH_HOST="${SSH_HOST:-82.29.86.221}"
SSH_PORT="${SSH_PORT:-65002}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/anytimeautolot_hostinger}"
REMOTE_NODEJS="${REMOTE_NODEJS:-domains/terminal.aetherframeworks.dev/nodejs}"
REMOTE_PUBLIC="${REMOTE_PUBLIC:-domains/terminal.aetherframeworks.dev/public_html}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f dist/index.html ]]; then
  echo "ERROR: dist/index.html missing. Run: npm run build"
  exit 1
fi

SSH=(ssh -p "$SSH_PORT" -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
RSYNC=(rsync -avz --delete -e "ssh -p $SSH_PORT -i $SSH_KEY")

echo "==> Sync Node app to ~/$REMOTE_NODEJS/"
"${SSH[@]}" "$SSH_USER@$SSH_HOST" "mkdir -p ~/$REMOTE_NODEJS/tmp"

"${RSYNC[@]}" \
  --exclude node_modules \
  --exclude .env.local \
  ./ "$SSH_USER@$SSH_HOST:~/$REMOTE_NODEJS/"

echo "==> npm install --omit=dev on server..."
"${SSH[@]}" "$SSH_USER@$SSH_HOST" "cd ~/$REMOTE_NODEJS && $NPM_BIN install --omit=dev"

scp -P "$SSH_PORT" -i "$SSH_KEY" "$SCRIPT_DIR/deploy/public_html.htaccess" \
  "$SSH_USER@$SSH_HOST:~/$REMOTE_PUBLIC/.htaccess"

"${SSH[@]}" "$SSH_USER@$SSH_HOST" "touch ~/$REMOTE_NODEJS/tmp/restart.txt"

echo "Verify: curl -s https://terminal.aetherframeworks.dev/health"
