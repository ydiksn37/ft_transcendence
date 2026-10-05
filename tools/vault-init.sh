#!/bin/sh
# Prepare ignored secret files and synchronize Vault using Docker-only tooling.
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Create it explicitly before deployment:" >&2
  echo "  cp .env.example .env" >&2
  exit 1
fi

mkdir -p secrets/dev
chmod 700 secrets secrets/dev
chmod 600 .env

compose() {
  docker compose "$@"
}

BUILDX_NO_DEFAULT_ATTESTATIONS=1 compose --profile tools build vault-bootstrap
compose --profile tools run --rm --no-deps vault-bootstrap prepare
compose up -d postgres vault vault-unsealer
compose --profile tools run --rm --no-deps vault-bootstrap sync
