#!/bin/sh
# Runs inside the vault-bootstrap container. Host requirements are Docker and Make only.
set -eu

secrets_dir=/secrets
unseal_key_file="$secrets_dir/vault_unseal_key.txt"
token_file="$secrets_dir/vault_token.txt"
postgres_password_file="$secrets_dir/postgres_password.txt"
redis_password_file="$secrets_dir/redis_password.txt"

prepare() {
  mkdir -p "$secrets_dir"
  umask 077
  [ -s "$postgres_password_file" ] || openssl rand -hex 32 > "$postgres_password_file"
  [ -s "$redis_password_file" ] || openssl rand -hex 32 > "$redis_password_file"
  [ -e "$unseal_key_file" ] || : > "$unseal_key_file"
  [ -e "$token_file" ] || : > "$token_file"
  chmod 600 "$postgres_password_file" "$redis_password_file" "$unseal_key_file" "$token_file"
}

json_field() {
  node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],d);if(v===undefined)process.exit(1);process.stdout.write(String(v))' "$1"
}

vault_status() {
  vault status -format=json 2>/dev/null |
    node -e 'const s=require("fs").readFileSync(0,"utf8");try{const d=JSON.parse(s);if(typeof d.initialized==="boolean")process.stdout.write(s)}catch{}' || true
}

wait_for_services() {
  attempt=0
  until PGPASSWORD="$(cat "$postgres_password_file")" \
    pg_isready -h postgres -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 60 ] || { echo "PostgreSQL did not become ready" >&2; exit 1; }
    sleep 1
  done

  echo "Waiting for Vault..."
  attempt=0
  status_json=""
  until [ -n "$status_json" ]; do
    status_json="$(vault_status)"
    [ -n "$status_json" ] && break
    attempt=$((attempt + 1))
    [ "$attempt" -lt 60 ] || { echo "Vault did not become reachable" >&2; exit 1; }
    sleep 1
  done
}

generate_root_token() {
  vault operator generate-root -cancel >/dev/null 2>&1 || true
  init_json="$(vault operator generate-root -init -format=json)"
  nonce="$(printf '%s' "$init_json" | json_field nonce)"
  otp="$(printf '%s' "$init_json" | json_field otp)"
  encoded="$(vault operator generate-root -nonce="$nonce" -format=json "$(cat "$unseal_key_file")" | json_field encoded_token)"
  vault operator generate-root -decode="$encoded" -otp="$otp" | tr -d '\r\n'
}

sync() {
  prepare
  wait_for_services

  VAULT_TOKEN=""
  export VAULT_TOKEN
  root_token_issued=false
  revoke_root_token() {
    if [ "$root_token_issued" = true ]; then
      vault token revoke -self >/dev/null 2>&1 ||
        echo "WARNING: failed to revoke the temporary root token" >&2
    fi
    VAULT_TOKEN=""
  }
  trap revoke_root_token EXIT
  trap 'exit 1' INT TERM

  status_json="$(vault_status)"
  if [ "$(printf '%s' "$status_json" | json_field initialized)" != true ]; then
    echo "Initializing Vault..."
    init_json="$(vault operator init -key-shares=1 -key-threshold=1 -format=json)"
    unseal_key="$(printf '%s' "$init_json" | json_field unseal_keys_b64.0)"
    VAULT_TOKEN="$(printf '%s' "$init_json" | json_field root_token)"
    root_token_issued=true
    printf '%s\n' "$unseal_key" > "$unseal_key_file"
    : > "$token_file"
  fi

  unseal_key="$(cat "$unseal_key_file")"
  [ -n "$unseal_key" ] || { echo "Vault unseal key is unavailable" >&2; exit 1; }
  if [ "$(vault_status | json_field sealed || true)" = true ]; then
    echo "Unsealing Vault..."
    vault operator unseal "$unseal_key" >/dev/null
  fi
  if [ "$root_token_issued" = false ]; then
    VAULT_TOKEN="$(generate_root_token)"
    root_token_issued=true
  fi

  # Keep the database role synchronized with the persisted Docker secret.
  printf "SELECT format('ALTER ROLE %%I WITH PASSWORD %%L', :'role', :'password') \\gexec\n" |
    PGPASSWORD="$(cat "$postgres_password_file")" \
    psql -h postgres -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
      -v role="$POSTGRES_USER" -v password="$(cat "$postgres_password_file")" >/dev/null

  if ! vault secrets list -format=json | json_field "secret/.type" >/dev/null 2>&1; then
    vault secrets enable -path=secret kv-v2 >/dev/null
  fi

  echo "Synchronizing secret/transcendence..."
  existing_secret="$(vault kv get -format=json secret/transcendence 2>/dev/null || printf '{}')"
  printf '%s' "$existing_secret" |
    POSTGRES_PASSWORD="$(cat "$postgres_password_file")" \
    REDIS_PASSWORD="$(cat "$redis_password_file")" \
    node -e '
      const {randomBytes}=require("crypto");
      const input=require("fs").readFileSync(0,"utf8").trim();
      const existing=(input ? JSON.parse(input) : {}).data?.data ?? {};
      const configured=(v)=>Boolean(v?.trim())&&!/CHANGE_ME|PLACEHOLDER|EXAMPLE|DUMMY|YOUR[_-]/i.test(v);
      const validJwt=(v)=>configured(v)&&v.length>=32;
      const data={};
      for(const key of ["DATABASE_URL","REDIS_URL","JWT_SECRET","JWT_REFRESH_SECRET","FT_CLIENT_ID","FT_CLIENT_SECRET"])
        if(existing[key]!==undefined)data[key]=String(existing[key]);
      data.DATABASE_URL=`postgresql://${encodeURIComponent(process.env.POSTGRES_USER)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@postgres:5432/${encodeURIComponent(process.env.POSTGRES_DB)}?schema=public`;
      data.REDIS_URL=`redis://:${encodeURIComponent(process.env.REDIS_PASSWORD)}@redis:6379/0`;
      if(!validJwt(data.JWT_SECRET))data.JWT_SECRET=randomBytes(48).toString("base64");
      if(!validJwt(data.JWT_REFRESH_SECRET)||data.JWT_REFRESH_SECRET===data.JWT_SECRET)data.JWT_REFRESH_SECRET=randomBytes(48).toString("base64");
      for(const key of ["FT_CLIENT_ID","FT_CLIENT_SECRET"]){
        if(configured(process.env[key]))data[key]=process.env[key];
        else if(!configured(data[key]))delete data[key];
      }
      process.stdout.write(JSON.stringify(data));
    ' | vault kv put secret/transcendence - >/dev/null

  vault policy write transcendence /vault/policy.hcl >/dev/null
  backend_token="$(cat "$token_file")"
  if [ -z "$backend_token" ] ||
    ! VAULT_TOKEN="$backend_token" vault kv get secret/transcendence >/dev/null 2>&1; then
    echo "Issuing backend token..."
    vault token create -policy=transcendence -orphan -period=768h -field=token > "$token_file"
  fi

  self_accessor="$(vault token lookup -format=json | json_field data.accessor)"
  for accessor in $(vault list -format=json auth/token/accessors 2>/dev/null |
    node -e 'const s=require("fs").readFileSync(0,"utf8").trim();if(s)JSON.parse(s).forEach((a)=>process.stdout.write(`${a}\n`))'); do
    [ "$accessor" = "$self_accessor" ] && continue
    if vault token lookup -format=json -accessor "$accessor" |
      node -e 'process.exit(JSON.parse(require("fs").readFileSync(0,"utf8")).data.policies.includes("root")?0:1)'; then
      vault token revoke -accessor "$accessor" >/dev/null
      echo "Revoked a leftover root token"
    fi
  done

  revoke_root_token
  root_token_issued=false
  trap - EXIT
  echo "Vault is ready. Root token has been revoked."
}

case "${1:-}" in
  prepare) prepare ;;
  sync) sync ;;
  *) echo "Usage: vault-bootstrap prepare|sync" >&2; exit 2 ;;
esac
