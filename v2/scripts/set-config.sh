#!/usr/bin/env bash
# Usage: v2/scripts/set-config.sh https://<ref>.supabase.co <publishable-or-anon-key> [vapid-public-key]
# (VAPID public key defaults to the one in /home/box/.secrets/flarmalodebop-v2.env — it is a PUBLIC key.)
set -euo pipefail
cd "$(dirname "$0")/.."
VAPID="${3:-$(grep -s '^VAPID_PUBLIC=' /home/box/.secrets/flarmalodebop-v2.env | cut -d= -f2- || true)}"
cat > public/config.js <<EOC
// Public client config (safe to commit: the publishable key is meant for browsers; RLS protects the data).
window.FLARM_CONFIG = {
  SUPABASE_URL: '$1',
  SUPABASE_ANON_KEY: '$2',
  VAPID_PUBLIC: '${VAPID:-__VAPID_PUBLIC__}'
};
EOC
echo "config.js updated for $1"
