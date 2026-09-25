#!/bin/sh
# vault-unsealer sidecar: Vaultの再起動でsealされたら、保管済みのunseal keyで自動unsealする。
# keyファイルが空・未配置の場合は何もしない（keyをオフライン保管して手動unsealする運用）。
set -u

interval="${VAULT_UNSEAL_INTERVAL:-5}"
key_file="${VAULT_UNSEAL_KEY_FILE:-/run/secrets/vault_unseal_key}"

while true; do
  status="$(vault status -format=json 2>/dev/null || true)"
  if printf '%s' "$status" | grep -Eq '"initialized": *true' &&
    printf '%s' "$status" | grep -Eq '"sealed": *true'; then
    key="$(cat "$key_file" 2>/dev/null || true)"
    if [ -n "$key" ]; then
      if vault operator unseal "$key" > /dev/null 2>&1; then
        echo "Vault unsealed"
      else
        echo "Vault unseal failed" >&2
      fi
    fi
  fi
  sleep "$interval"
done
