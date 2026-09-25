#!/bin/sh
set -eu

base_url="${WAF_BASE_URL:-https://localhost:8443}"

request_status() {
  curl --silent --show-error --insecure --output /dev/null --write-out '%{http_code}' "$@"
}

assert_blocked() {
  name="$1"
  shift
  status="$(request_status "$@")"
  if [ "$status" != "403" ]; then
    echo "$name: expected HTTP 403, got $status" >&2
    exit 1
  fi
  echo "$name: blocked (403)"
}

assert_not_blocked() {
  name="$1"
  shift
  status="$(request_status "$@")"
  if [ "$status" = "403" ]; then
    echo "$name: benign request was blocked" >&2
    exit 1
  fi
  echo "$name: passed through ($status)"
}

assert_not_blocked "benign JSON" \
  --request POST "$base_url/api/auth/login" \
  --header 'Content-Type: application/json' \
  --data '{"username":"waf-check","password":"not-a-real-password"}'

assert_blocked "XSS" \
  --request POST "$base_url/api/auth/login" \
  --header 'Content-Type: application/json' \
  --data '{"username":"<script>alert(1)</script>","password":"x"}'

assert_blocked "SQL injection" \
  --get "$base_url/api/users/search" \
  --data-urlencode "username=' OR 1=1 --"

assert_blocked "path traversal" \
  "$base_url/api/users/%2e%2e/%2e%2e/etc/passwd"

echo "WAF smoke tests passed"
