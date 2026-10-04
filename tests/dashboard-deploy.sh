#!/usr/bin/env bash
set -Eeuo pipefail

# Exercises the real Dashboard deploy, rollback and validator scripts against a throw-away fake cPanel home.
workspace="$(mktemp -d "${TMPDIR:-/tmp}/arasya-dashboard-deploy-test.XXXXXX")"
[[ "$workspace" == *"/arasya-dashboard-deploy-test."* ]] || exit 1
cleanup() { rm -rf -- "$workspace"; }
trap cleanup EXIT
fail() { printf 'FAIL Dashboard deploy test: %s\n' "$1" >&2; exit 1; }
scripts=(scripts/cpanel-deploy.sh scripts/cpanel-rollback-dashboard.sh scripts/dashboard-release-common.sh scripts/validate-dashboard-release.sh scripts/generate-sha256s.sh)
[[ -f dist/index.html && -f dist/.htaccess ]] || fail "run the production build first"

# cPanel deploy shells have no /dev/fd; process substitution there silently skips loops.
if grep -nE '<\(|>\(' "${scripts[@]}"; then fail "deploy scripts must not use process substitution"; fi
if grep -nE '^[^#]*/dev/fd' "${scripts[@]}"; then fail "deploy scripts must not use /dev/fd"; fi

create_release() {
  local target="$1" sha="$2" marker="$3"
  mkdir -p "$target/dist" "$target/scripts"
  cp -R dist/. "$target/dist/"
  rm -f "$target/dist/release.json" "$target/dist/SHA256SUMS"
  printf 'window.__ARASYA_RELEASE_MARKER__=%q;\n' "$marker" > "$target/dist/assets/release-$marker.js"
  sed "s#</body>#<script type=\"module\" src=\"/assets/release-$marker.js\"></script></body>#" "$target/dist/index.html" > "$target/dist/index.next"
  mv "$target/dist/index.next" "$target/dist/index.html"
  printf '{\n  "commit": "%s",\n  "version": "0.1.0",\n  "builtAt": "2026-10-04T00:00:00Z",\n  "preview": false\n}\n' "$sha" > "$target/dist/release.json"
  /bin/bash scripts/generate-sha256s.sh "$target/dist"
  /bin/bash scripts/validate-dashboard-release.sh "$target/dist" "$sha" >/dev/null
  cp .cpanel.yml "$target/.cpanel.yml"
  cp "${scripts[@]}" "$target/scripts/"
  chmod +x "$target/scripts/"*.sh
  /bin/bash "$target/scripts/generate-sha256s.sh" "$target"
}
active() { tr -d '[:space:]' < "$storage/active-release"; }

sha_a="$(printf 'a%.0s' {1..40})"; sha_b="$(printf 'b%.0s' {1..40})"; sha_c="$(printf 'c%.0s' {1..40})"; sha_d="$(printf 'd%.0s' {1..40})"
for name in a b c d; do sha_var="sha_$name"; create_release "$workspace/release-$name" "${!sha_var}" "$name"; done

test_home="$workspace/home"; live="$test_home/public_html/dashboard.arasyahome.ro"; storage="$test_home/arasya-dashboard-releases"
mkdir -p "$live/.well-known" "$live/cgi-bin" "$test_home/staff.arasyahome.ro" "$test_home/api.arasyahome.ro" "$test_home/arasya-config" "$test_home/arasya-operations-api"
printf 'acme\n' > "$live/.well-known/acme.txt"; printf 'cgi\n' > "$live/cgi-bin/keep.txt"
printf 'wordpress\n' > "$test_home/public_html/index.php"; printf 'staff\n' > "$test_home/staff.arasyahome.ro/index.html"
printf 'api\n' > "$test_home/api.arasyahome.ro/index.php"; printf 'secret\n' > "$test_home/arasya-config/secrets.json"
snapshot() { (cd "$test_home" && find public_html/index.php staff.arasyahome.ro api.arasyahome.ro arasya-config arasya-operations-api -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum); }
before_roots="$(snapshot)"

# Correct root only.
for wrong in "$test_home/public_html" "$test_home/staff.arasyahome.ro" "$test_home/api.arasyahome.ro" "$test_home" "$test_home/public_html/trendhome.ro" "$test_home/public_html/dashboard"; do
  if HOME="$test_home" DASHBOARD_DEPLOY_PATH="$wrong" DRY_RUN=1 /bin/bash "$workspace/release-a/scripts/cpanel-deploy.sh" >/dev/null 2>&1; then fail "deploy accepted forbidden root $wrong"; fi
done
if HOME="$test_home" DASHBOARD_RELEASE_STORAGE_PATH="$test_home/public_html/releases" DRY_RUN=1 /bin/bash "$workspace/release-a/scripts/cpanel-deploy.sh" >/dev/null 2>&1; then fail "deploy accepted public release storage"; fi
if HOME="$test_home" DASHBOARD_RELEASE_STORAGE_PATH="$test_home/arasya-staff-releases" DRY_RUN=1 /bin/bash "$workspace/release-a/scripts/cpanel-deploy.sh" >/dev/null 2>&1; then fail "deploy accepted the Staff release storage"; fi
HOME="$test_home" DRY_RUN=1 /bin/bash "$workspace/release-a/scripts/cpanel-deploy.sh" | grep -qF "$(cd "$live" && pwd -P)" || fail "dry-run did not target the Dashboard root"
[[ ! -e "$storage/active-release" ]] || fail "dry-run changed the active pointer"

# Release metadata must match the source commit.
mismatch="$workspace/mismatch"; cp -R "$workspace/release-a/dist" "$mismatch"
if /bin/bash scripts/validate-dashboard-release.sh "$mismatch" "$sha_b" >/dev/null 2>&1; then fail "validator accepted a release for another source commit"; fi
sed 's/"preview": false/"preview": true/' "$mismatch/release.json" > "$mismatch/release.next"; mv "$mismatch/release.next" "$mismatch/release.json"; /bin/bash scripts/generate-sha256s.sh "$mismatch"
if /bin/bash scripts/validate-dashboard-release.sh "$mismatch" >/dev/null 2>&1; then fail "validator accepted a preview release"; fi

# Invalid checksum aborts before anything changes.
corrupt="$workspace/corrupt"; cp -R "$workspace/release-a" "$corrupt"; printf '\n<!-- tampered -->\n' >> "$corrupt/dist/index.html"
if HOME="$test_home" /bin/bash "$corrupt/scripts/cpanel-deploy.sh" >/dev/null 2>&1; then fail "deploy accepted a tampered package"; fi
[[ ! -e "$storage/active-release" && ! -f "$live/index.html" ]] || fail "tampered package changed the live root"
unlisted="$workspace/unlisted"; cp -R "$workspace/release-a/dist" "$unlisted"; printf 'x' > "$unlisted/assets/extra.js"
if /bin/bash scripts/validate-dashboard-release.sh "$unlisted" >/dev/null 2>&1; then fail "validator accepted an unlisted extra file"; fi

# Deploy A, then B: B active, A recorded as previous, both asset sets kept for rollback.
HOME="$test_home" /bin/bash "$workspace/release-a/scripts/cpanel-deploy.sh" >/dev/null
[[ "$(active)" == "$sha_a" ]] || fail "release A was not activated"
grep -q 'release-a.js' "$live/index.html" || fail "release A index was not activated"
HOME="$test_home" /bin/bash "$workspace/release-b/scripts/cpanel-deploy.sh" >/dev/null
[[ "$(active)" == "$sha_b" && "$(tr -d '[:space:]' < "$storage/previous-release")" == "$sha_a" ]] || fail "release B / previous pointer is wrong"
[[ -f "$live/assets/release-a.js" && -f "$live/assets/release-b.js" ]] || fail "additive activation removed rollback assets"
grep -q "deploy $sha_b $sha_a" "$storage/release-history.log" || fail "release history is missing the B deploy"
[[ "$(stat -c '%a' "$storage" 2>/dev/null || stat -f '%Lp' "$storage")" == "750" ]] || fail "release storage is not private"

# A partial release cannot activate: a failure before the entrypoint switch keeps B serving.
if HOME="$test_home" ARASYA_TEST_FAIL_BEFORE_INDEX=1 /bin/bash "$workspace/release-d/scripts/cpanel-deploy.sh" >/dev/null 2>&1; then fail "simulated pre-index failure succeeded"; fi
grep -q 'release-b.js' "$live/index.html" || fail "pre-index failure replaced the active index"
[[ "$(active)" == "$sha_b" ]] || fail "pre-index failure changed the pointer"
missing="$workspace/missing-asset"; cp -R "$workspace/release-c" "$missing"; rm "$missing/dist/assets/release-c.js"
/bin/bash scripts/generate-sha256s.sh "$missing/dist"; /bin/bash scripts/generate-sha256s.sh "$missing"
if HOME="$test_home" /bin/bash "$missing/scripts/cpanel-deploy.sh" >/dev/null 2>&1; then fail "deploy accepted a release with a missing referenced asset"; fi
[[ "$(active)" == "$sha_b" ]] || fail "incomplete release changed the pointer"

# Rollback targets the previous verified release; dry-run changes nothing.
HOME="$test_home" DRY_RUN=1 /bin/bash "$workspace/release-b/scripts/cpanel-rollback-dashboard.sh" --previous | grep -q "$sha_a" || fail "rollback dry-run did not name release A"
[[ "$(active)" == "$sha_b" ]] || fail "rollback dry-run changed the pointer"
HOME="$test_home" /bin/bash "$workspace/release-b/scripts/cpanel-rollback-dashboard.sh" --previous >/dev/null
[[ "$(active)" == "$sha_a" ]] || fail "--previous did not activate A"
grep -q 'release-a.js' "$live/index.html" || fail "rollback did not restore the A entrypoint"
grep -q "rollback $sha_a $sha_b" "$storage/release-history.log" || fail "release history is missing the rollback"
HOME="$test_home" /bin/bash "$workspace/release-a/scripts/cpanel-rollback-dashboard.sh" "$sha_b" >/dev/null
[[ "$(active)" == "$sha_b" ]] || fail "explicit rollback to B failed"
if HOME="$test_home" /bin/bash "$workspace/release-a/scripts/cpanel-rollback-dashboard.sh" "$sha_c" >/dev/null 2>&1; then fail "rollback accepted a release that was never retained"; fi

# A corrupted retained release is refused for rollback.
printf '\ncorrupt\n' >> "$storage/$sha_a/index.html"
if HOME="$test_home" /bin/bash "$workspace/release-b/scripts/cpanel-rollback-dashboard.sh" "$sha_a" >/dev/null 2>&1; then fail "rollback accepted a corrupt retained release"; fi
[[ "$(active)" == "$sha_b" ]] || fail "corrupt rollback changed the pointer"

[[ -f "$live/.well-known/acme.txt" && -f "$live/cgi-bin/keep.txt" ]] || fail "preserved live directories changed"
[[ "$(snapshot)" == "$before_roots" ]] || fail "deploy touched WordPress, Staff, API or config roots"
printf 'PASS Dashboard releases deploy only to dashboard.arasyahome.ro, verify checksums and provenance, survive partial failure, and roll back to verified releases.\n'
