#!/usr/bin/env bash
set -Eeuo pipefail

# Validates a Dashboard release directory by content: every file must match SHA256SUMS, release.json must carry a
# lowercase 40-character source commit, a semantic version and preview=false, every asset referenced by
# index.html must exist, and the CSP must be resolved. Optional second argument: the expected source commit.
fail() { printf '[Arasya Dashboard] RELEASE INVALID: %s\n' "$1" >&2; exit 1; }
root="${1:-}"; expected_commit="${2:-}"
[[ -n "$root" && -d "$root" ]] || fail "Release directory is missing."
for command in find sha256sum php grep sort; do command -v "$command" >/dev/null 2>&1 || fail "$command is required."; done
root="$(cd -- "$root" && pwd -P)"
[[ -z "$(find "$root" -type l -print -quit)" ]] || fail "Symlinks are forbidden in Dashboard releases."
for file in index.html .htaccess release.json SHA256SUMS; do [[ -f "$root/$file" ]] || fail "Required file is missing: $file"; done
[[ -d "$root/assets" ]] || fail "assets directory is missing."
(cd -- "$root" && sha256sum -c SHA256SUMS >/dev/null 2>&1) || fail "SHA256SUMS verification failed."
# Every regular file except the manifest itself must be listed, so an extra unlisted file cannot ride along.
listed="$(sed -E 's/^[0-9a-f]{64}  //' "$root/SHA256SUMS" | LC_ALL=C sort)"
present="$(cd -- "$root" && find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort)"
[[ "$listed" == "$present" ]] || fail "SHA256SUMS does not list exactly the release files."
commit="$(php -r '$r=json_decode(file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR); $s=$r["commit"] ?? ""; $v=$r["version"] ?? ""; $b=$r["builtAt"] ?? "";
  if (!is_string($s) || preg_match("/^[0-9a-f]{40}$/D", $s) !== 1) exit(2);
  if (!is_string($v) || preg_match("/^\d+\.\d+\.\d+$/D", $v) !== 1) exit(3);
  if (!is_string($b) || preg_match("/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/D", $b) !== 1) exit(4);
  if (($r["preview"] ?? null) !== false) exit(5);
  echo $s;' "$root/release.json")" || fail "release.json is invalid (commit, version, builtAt or preview)."
[[ -z "$expected_commit" || "$commit" == "$expected_commit" ]] || fail "release.json commit $commit does not match the expected source $expected_commit."
# Here-strings instead of process substitution: cPanel deploy shells have no /dev/fd.
referenced_assets="$(grep -oE '/assets/[A-Za-z0-9._-]+' "$root/index.html" | LC_ALL=C sort -u || true)"
[[ -n "$referenced_assets" ]] || fail "index.html does not reference Vite assets."
while IFS= read -r asset; do [[ -f "$root/${asset#/}" ]] || fail "Referenced asset is missing: $asset"; done <<< "$referenced_assets"
grep -Fq 'Content-Security-Policy' "$root/.htaccess" || fail "Dashboard CSP is missing."
grep -Fq "frame-ancestors 'none'" "$root/.htaccess" || fail "Dashboard frame protection is missing."
grep -Eq "connect-src 'self' https://[A-Za-z0-9.-]+;" "$root/.htaccess" || fail "Dashboard CSP must allow exactly one HTTPS API origin."
! grep -Fq '__ARASYA_CONNECT_SRC__' "$root/.htaccess" || fail "Dashboard CSP placeholder remains unresolved."
! grep -rqE '127\.0\.0\.1|localhost:[0-9]|__DASHBOARD_E2E_LOOPBACK_HOST__' "$root/assets" || fail "Release bundle contains a test or development API address."
printf '[Arasya Dashboard] Release validation passed: %s\n' "$commit"
