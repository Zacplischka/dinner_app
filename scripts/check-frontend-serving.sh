#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
caddy_bin="${CADDY_BIN:-caddy}"
expected_caddy_version="${EXPECTED_CADDY_VERSION:-v2.11.4}"
document_cache_control='max-age=0, must-revalidate'
cdn_cache_control='no-store'
cloudflare_cache_control='public, max-age=60, must-revalidate'
asset_cache_control='public, max-age=31536000, immutable'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

command -v "$caddy_bin" >/dev/null 2>&1 || fail "Caddy not found: $caddy_bin"
actual_caddy_version="$("$caddy_bin" version | awk '{print $1}')"
[[ "$actual_caddy_version" == "$expected_caddy_version" ]] ||
  fail "expected Caddy $expected_caddy_version, got $actual_caddy_version"

cd "$repo_root"
npm run build:frontend

format_diff="$("$caddy_bin" fmt --diff Caddyfile)"
if grep -Eq '^[+-]' <<<"$format_diff"; then
  fail "Caddyfile is not formatted:\n$format_diff"
fi
"$caddy_bin" validate --config Caddyfile --adapter caddyfile >/dev/null

tmp_dir="$(mktemp -d)"
caddy_pid=''
cleanup() {
  if [[ -n "$caddy_pid" ]]; then
    kill "$caddy_pid" 2>/dev/null || true
    wait "$caddy_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

cp -R "$repo_root/frontend/dist" "$tmp_dir/dist"
dist_dir="$tmp_dir/dist"
mkdir -p "$dist_dir/__contract-directory" "$dist_dir/.git"
cp "$dist_dir/index.html" "$dist_dir/__contract-directory/index.html"
touch "$dist_dir/.env-contract" "$dist_dir/.git/config"

escaped_dist_dir="${dist_dir//&/\\&}"
sed "s&/app/frontend/dist&$escaped_dist_dir&g" Caddyfile >"$tmp_dir/Caddyfile"

port="$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
PORT="$port" "$caddy_bin" run --config "$tmp_dir/Caddyfile" --adapter caddyfile \
  >"$tmp_dir/caddy.log" 2>&1 &
caddy_pid=$!
base_url="http://127.0.0.1:$port"

for _ in {1..50}; do
  if curl --silent --fail "$base_url/health" >/dev/null; then
    break
  fi
  sleep 0.1
done
kill -0 "$caddy_pid" 2>/dev/null || fail "Caddy failed to start: $(cat "$tmp_dir/caddy.log")"

header_value() {
  local file="$1"
  local name="$2"
  awk -F ': *' -v name="$name" 'tolower($1) == tolower(name) { sub(/\r$/, "", $2); print $2 }' "$file" |
    tail -n 1
}

assert_header() {
  local file="$1"
  local name="$2"
  local expected="$3"
  local actual
  actual="$(header_value "$file" "$name")"
  [[ "$actual" == "$expected" ]] || fail "expected $name: $expected, got: ${actual:-<missing>}"
}

assert_no_header() {
  local file="$1"
  local name="$2"
  local actual
  actual="$(header_value "$file" "$name")"
  [[ -z "$actual" ]] || fail "expected no $name header, got: $actual"
}

request() {
  local name="$1"
  local method="$2"
  local path="$3"
  local accept="$4"
  local expected_status="$5"
  local accept_encoding="${6:-}"
  local curl_args=(--silent --show-error --dump-header "$tmp_dir/$name.headers" --output "$tmp_dir/$name.body" --header "Accept: $accept")

  if [[ "$method" == 'HEAD' ]]; then
    curl_args+=(--head)
  fi
  if [[ -n "$accept_encoding" ]]; then
    curl_args+=(--header "Accept-Encoding: $accept_encoding")
  fi

  status="$(curl "${curl_args[@]}" --write-out '%{http_code}' "$base_url$path")"
  [[ "$status" == "$expected_status" ]] || fail "$method $path returned $status, expected $expected_status"
  headers="$tmp_dir/$name.headers"
  body="$tmp_dir/$name.body"
}

assert_document_headers() {
  assert_header "$headers" Cache-Control "$document_cache_control"
  assert_header "$headers" CDN-Cache-Control "$cdn_cache_control"
  assert_header "$headers" Cloudflare-CDN-Cache-Control "$cloudflare_cache_control"
  assert_header "$headers" Cache-Tag dinder-route-html
}

assert_no_document_headers() {
  assert_no_header "$headers" CDN-Cache-Control
  assert_no_header "$headers" Cloudflare-CDN-Cache-Control
  assert_no_header "$headers" Cache-Tag
}

request root GET / text/html 200
assert_document_headers
assert_header "$headers" X-Content-Type-Options nosniff
assert_no_header "$headers" Server
root_hash="$(shasum -a 256 "$body" | awk '{print $1}')"

request direct_html GET /index.html text/html 200
assert_document_headers

request directory_index GET /__contract-directory/ text/html 200
assert_document_headers
[[ "$(shasum -a 256 "$body" | awk '{print $1}')" == "$root_hash" ]] || fail 'directory index body differs from index.html'

request fallback GET /deep/spa/route text/html 200
assert_document_headers
[[ "$(shasum -a 256 "$body" | awk '{print $1}')" == "$root_hash" ]] || fail 'SPA fallback body differs from index.html'

request fallback_head HEAD /another/deep/route text/html 200
assert_document_headers

asset_count=0
while IFS= read -r asset_file; do
  [[ "$(basename "$asset_file")" =~ -[A-Za-z0-9_-]{8,}\. ]] ||
    fail "production asset is not fingerprinted: $asset_file"
  asset_path="/assets/$(basename "$asset_file")"
  request asset GET "$asset_path" '*/*' 200
  assert_header "$headers" Cache-Control "$asset_cache_control"
  assert_no_document_headers
  ((asset_count += 1))
done < <(find "$dist_dir/assets" -maxdepth 1 -type f -print | sort)
[[ "$asset_count" -gt 0 ]] || fail 'production build emitted no assets'

compressible_asset="$(find "$dist_dir/assets" -maxdepth 1 -type f -name 'index-*.js' -print | head -n 1)"
[[ -n "$compressible_asset" ]] || fail 'production build emitted no entry JavaScript asset'
request compressed_asset GET "/assets/$(basename "$compressible_asset")" '*/*' 200 gzip
assert_header "$headers" Cache-Control "$asset_cache_control"
assert_header "$headers" Content-Encoding gzip
assert_no_document_headers

cp "$dist_dir/favicon.png" "$dist_dir/assets/plain.png"
request non_fingerprinted_asset GET /assets/plain.png text/html 200
assert_no_header "$headers" Cache-Control
assert_no_document_headers

request missing_asset GET /assets/missing-ABCDEFGH.js text/html 404
assert_no_header "$headers" Cache-Control
assert_no_document_headers

request health GET /health text/html 200
assert_no_header "$headers" Cache-Control
assert_no_document_headers
assert_header "$headers" X-Content-Type-Options nosniff
assert_no_header "$headers" Server

request non_html_file GET /favicon.png text/html 200
assert_no_header "$headers" Cache-Control
assert_no_document_headers

request non_html_client GET /client-without-html application/json 200
assert_no_header "$headers" Cache-Control
assert_no_document_headers

request hidden_env GET /.env-contract text/html 404
assert_no_document_headers

request hidden_git GET /.git/config text/html 404
assert_no_document_headers

echo "Frontend serving contract passed with Caddy $actual_caddy_version"
