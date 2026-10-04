#!/bin/sh
# Vault(server mode)を初期化・unsealし、アプリの秘密情報とbackend用トークンを用意する。
# 再実行しても既存の鍵・秘密情報は再生成しない。
#
#   VAULT_ENV=production  (既定) docker-compose.production.yml / secrets/
#   VAULT_ENV=development        docker-compose.yml             / secrets/dev/
#
# 生成物（Git管理外）:
#   <dir>/vault_unseal_key.txt  vault-unsealer が自動unsealに使う
#   <dir>/vault_token.txt       backend用の transcendence policy トークン
#   <dir>/postgres_password.txt, <dir>/redis_password.txt
# root tokenはどこにも保存しない。設定時だけunseal keyから一時発行し、終了時にrevokeする。
#
# 任意の環境変数:
#   VAULT_STORE_UNSEAL_KEY=false  初期化時にunseal keyをファイルへ保存せず一度だけ表示する
#                                 （オフライン保管・手動unseal運用。以後は VAULT_UNSEAL_KEY で渡す）
#   VAULT_UNSEAL_KEY              keyファイルを置かない運用でのunseal key
#   FT_CLIENT_ID, FT_CLIENT_SECRET  42 OAuthの投入値
set -eu

cd "$(dirname "$0")/.."

env_name="${VAULT_ENV:-production}"
case "$env_name" in
  production)
    compose_file=docker-compose.production.yml
    secrets_dir=secrets
    unseal_key_file="${VAULT_UNSEAL_KEY_FILE_HOST:-$secrets_dir/vault_unseal_key.txt}"
    token_file="${VAULT_TOKEN_FILE_HOST:-$secrets_dir/vault_token.txt}"
    postgres_password_file="${POSTGRES_PASSWORD_FILE:-$secrets_dir/postgres_password.txt}"
    redis_password_file="${REDIS_PASSWORD_FILE:-$secrets_dir/redis_password.txt}"
    ;;
  development)
    compose_file=docker-compose.yml
    secrets_dir=secrets/dev
    unseal_key_file="$secrets_dir/vault_unseal_key.txt"
    token_file="$secrets_dir/vault_token.txt"
    postgres_password_file="$secrets_dir/postgres_password.txt"
    redis_password_file="$secrets_dir/redis_password.txt"
    ;;
  *)
    echo "VAULT_ENV must be production or development" >&2
    exit 1
    ;;
esac

compose() {
  docker compose -f "$compose_file" "$@"
}

# 秘密値はコマンドライン引数に載せず、docker exec -e NAME で環境変数として渡す
vault_cmd() {
  compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN vault vault "$@"
}

json_field() {
  node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],d);if(v===undefined)process.exit(1);process.stdout.write(String(v))' "$1"
}

VAULT_TOKEN=""
export VAULT_TOKEN
root_token_issued=false

revoke_root_token() {
  if [ "$root_token_issued" = true ]; then
    vault_cmd token revoke -self > /dev/null 2>&1 ||
      echo "WARNING: failed to revoke the temporary root token; re-run this script after fixing the error to revoke it" >&2
    root_token_issued=false
  fi
  VAULT_TOKEN=""
}
trap revoke_root_token EXIT
trap 'exit 1' INT TERM

vault_status() {
  compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 vault vault status -format=json 2>/dev/null || true
}

unseal_with() {
  UNSEAL_KEY="$1" compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 -e UNSEAL_KEY vault \
    sh -c 'vault operator unseal "$UNSEAL_KEY"' > /dev/null
}

generate_root_token() {
  compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 vault \
    vault operator generate-root -cancel > /dev/null 2>&1 || true
  init_json="$(compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 vault \
    vault operator generate-root -init -format=json)"
  nonce="$(printf '%s' "$init_json" | json_field nonce)"
  otp="$(printf '%s' "$init_json" | json_field otp)"
  encoded="$(UNSEAL_KEY="$1" NONCE="$nonce" compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 \
    -e UNSEAL_KEY -e NONCE vault \
    sh -c 'vault operator generate-root -nonce="$NONCE" -format=json "$UNSEAL_KEY"' |
    json_field encoded_token)"
  compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 vault \
    vault operator generate-root -decode="$encoded" -otp="$otp" | tr -d '\r\n'
}

mkdir -p "$secrets_dir"
chmod 700 secrets "$secrets_dir"
umask 077

[ -e .env ] && chmod 600 .env
[ -s "$postgres_password_file" ] || openssl rand -hex 32 > "$postgres_password_file"
[ -s "$redis_password_file" ] || openssl rand -hex 32 > "$redis_password_file"
# compose の secrets 定義はファイルの存在を要求するため、未発行でも空ファイルを置く
[ -e "$unseal_key_file" ] || : > "$unseal_key_file"
[ -e "$token_file" ] || : > "$token_file"
chmod 600 "$postgres_password_file" "$redis_password_file" "$unseal_key_file" "$token_file"

postgres_user="$(compose config --format json |
  node -e '
    const config = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const user = String(config.services.postgres.environment.POSTGRES_USER ?? "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) process.exit(1);
    process.stdout.write(user);
  ')"
compose up -d postgres
attempt=0
until compose exec -T postgres pg_isready -U "$postgres_user" -d postgres > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done
# POSTGRES_PASSWORD_FILE is only applied when the data directory is first created.
# Keep an existing development volume in sync when migrating from the old .env password.
POSTGRES_USER="$postgres_user" POSTGRES_PASSWORD="$(cat "$postgres_password_file")" node -e '
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD.replaceAll("'"'"'", "'"'"''"'"'");
  process.stdout.write(`ALTER ROLE "${user}" WITH PASSWORD '"'"'${password}'"'"';\n`);
' | compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$postgres_user" -d postgres > /dev/null

compose up -d vault vault-unsealer

echo "Waiting for Vault..."
attempt=0
status_json=""
until [ -n "$status_json" ]; do
  status_json="$(vault_status)"
  [ -n "$status_json" ] && break
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Vault did not become reachable" >&2
    exit 1
  fi
  sleep 1
done

unseal_key="${VAULT_UNSEAL_KEY:-}"
[ -n "$unseal_key" ] || unseal_key="$(cat "$unseal_key_file")"

if [ "$(printf '%s' "$status_json" | json_field initialized)" != "true" ]; then
  echo "Initializing Vault..."
  init_json="$(vault_cmd operator init -key-shares=1 -key-threshold=1 -format=json)"
  unseal_key="$(printf '%s' "$init_json" | json_field unseal_keys_b64.0)"
  VAULT_TOKEN="$(printf '%s' "$init_json" | json_field root_token)"
  root_token_issued=true
  unset init_json
  : > "$token_file"
  if [ "${VAULT_STORE_UNSEAL_KEY:-true}" = false ]; then
    : > "$unseal_key_file"
    echo "=== Vault unseal key (store it offline; it is not saved) ===" >&2
    echo "$unseal_key" >&2
    echo "============================================================" >&2
  else
    printf '%s\n' "$unseal_key" > "$unseal_key_file"
  fi
fi

if [ -z "$unseal_key" ]; then
  echo "Unseal key is unavailable: set VAULT_UNSEAL_KEY or restore $unseal_key_file" >&2
  exit 1
fi

if [ "$(vault_status | json_field sealed || true)" = "true" ]; then
  echo "Unsealing Vault..."
  unseal_with "$unseal_key"
fi

if [ "$root_token_issued" = false ]; then
  VAULT_TOKEN="$(generate_root_token "$unseal_key")"
  root_token_issued=true
fi

if ! vault_cmd secrets list -format=json | json_field "secret/.type" > /dev/null; then
  vault_cmd secrets enable -path=secret kv-v2 > /dev/null
fi

if [ "${VAULT_PURGE_SECRET_HISTORY:-false}" = true ]; then
  # KV v2 keeps older secret versions unless metadata is removed explicitly.
  vault_cmd kv metadata delete secret/transcendence > /dev/null 2>&1 || true
fi

echo "Synchronizing secret/transcendence..."
existing_secret="$(vault_cmd kv get -format=json secret/transcendence 2>/dev/null || printf '{}')"
printf '%s' "$existing_secret" |
  POSTGRES_PASSWORD="$(cat "$postgres_password_file")" \
  REDIS_PASSWORD="$(cat "$redis_password_file")" \
  ROTATE_APPLICATION_SECRETS="${VAULT_ROTATE_APPLICATION_SECRETS:-false}" \
  node -e '
    const { randomBytes } = require("crypto");
    const { existsSync, readFileSync } = require("fs");
    const { parse } = require("dotenv");

    const raw = readFileSync(0, "utf8").trim();
    const response = raw ? JSON.parse(raw) : {};
    const existing = response.data?.data ?? {};
    const local = existsSync(".env") ? parse(readFileSync(".env")) : {};
    const placeholder = (value) =>
      /CHANGE_ME|PLACEHOLDER|EXAMPLE|DUMMY|YOUR[_-]/i.test(value ?? "");
    const configured = (value) => Boolean(value?.trim()) && !placeholder(value);
    const validJwt = (value) => configured(value) && value.length >= 32;
    const rotate = process.env.ROTATE_APPLICATION_SECRETS === "true";
    const user = local.POSTGRES_USER || "transcendence";
    const database = local.POSTGRES_DB || "transcendence_db";
    const allowed = [
      "DATABASE_URL", "REDIS_URL", "JWT_SECRET", "JWT_REFRESH_SECRET",
      "FT_CLIENT_ID", "FT_CLIENT_SECRET",
    ];
    const data = Object.fromEntries(
      allowed.filter((key) => existing[key] !== undefined).map((key) => [key, String(existing[key])]),
    );

    data.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@postgres:5432/${encodeURIComponent(database)}?schema=public`;
    data.REDIS_URL = `redis://:${encodeURIComponent(process.env.REDIS_PASSWORD)}@redis:6379/0`;
    if (rotate || !validJwt(data.JWT_SECRET)) {
      data.JWT_SECRET = randomBytes(48).toString("base64");
    }
    if (rotate || !validJwt(data.JWT_REFRESH_SECRET) || data.JWT_REFRESH_SECRET === data.JWT_SECRET) {
      data.JWT_REFRESH_SECRET = randomBytes(48).toString("base64");
    }

    for (const key of ["FT_CLIENT_ID", "FT_CLIENT_SECRET"]) {
      if (configured(local[key])) data[key] = local[key];
      else if (placeholder(data[key])) delete data[key];
    }
    process.stdout.write(JSON.stringify(data));
  ' | vault_cmd kv put secret/transcendence - > /dev/null

vault_cmd policy write transcendence - < vault/transcendence-policy.hcl > /dev/null

backend_token="$(cat "$token_file")"
if [ "${VAULT_ROTATE_BACKEND_TOKEN:-false}" = true ] && [ -n "$backend_token" ]; then
  BACKEND_TOKEN="$backend_token" compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 -e BACKEND_TOKEN vault \
    sh -c 'VAULT_TOKEN="$BACKEND_TOKEN" vault token revoke -self' > /dev/null 2>&1 || true
  : > "$token_file"
  backend_token=""
fi
if [ -z "$backend_token" ] ||
  ! BACKEND_TOKEN="$backend_token" compose exec -T -e VAULT_ADDR=http://127.0.0.1:8200 -e BACKEND_TOKEN vault \
    sh -c 'VAULT_TOKEN="$BACKEND_TOKEN" vault kv get secret/transcendence' > /dev/null 2>&1; then
  echo "Issuing backend token..."
  vault_cmd token create -policy=transcendence -orphan -period=768h -field=token > "$token_file"
fi

# 以前の実行が途中で失敗した場合などに残ったroot tokenも破棄し、root tokenが0件の状態で終える
self_accessor="$(vault_cmd token lookup -format=json | json_field data.accessor)"
for accessor in $(vault_cmd list -format=json auth/token/accessors |
  node -e 'JSON.parse(require("fs").readFileSync(0,"utf8")).forEach((a)=>console.log(a))'); do
  [ "$accessor" = "$self_accessor" ] && continue
  if vault_cmd token lookup -format=json -accessor "$accessor" |
    node -e 'process.exit(JSON.parse(require("fs").readFileSync(0,"utf8")).data.policies.includes("root")?0:1)'; then
    vault_cmd token revoke -accessor "$accessor" > /dev/null
    echo "Revoked a leftover root token"
  fi
done

revoke_root_token
echo "Vault ($env_name) is ready. Root token has been revoked."
