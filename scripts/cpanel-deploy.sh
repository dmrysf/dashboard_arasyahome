#!/usr/bin/env bash
set -Eeuo pipefail

# Activates the verified Dashboard release contained in this deploy-branch checkout. The production server needs
# no Node or Vite: GitHub Actions built, tested and checksummed the release. Releases are retained by source commit
# outside the public web root; activation is additive and switches index.html last.
repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
source "$repository_root/scripts/dashboard-release-common.sh"
for command in rsync sha256sum php mv cp mkdir find sort stat tr grep rm xargs date sed; do dashboard_require_command "$command"; done
gc_dry_run="${DASHBOARD_RELEASE_GC_DRY_RUN:-0}"
[[ "$gc_dry_run" == "0" || "$gc_dry_run" == "1" ]] || dashboard_fail "DASHBOARD_RELEASE_GC_DRY_RUN trebuie să fie 0 sau 1."
release_retention="${DASHBOARD_RELEASE_RETENTION:-5}"
[[ "$release_retention" =~ ^[0-9]+$ && "$release_retention" -ge 2 ]] || dashboard_fail "DASHBOARD_RELEASE_RETENTION trebuie să fie cel puțin 2."

dist_path="$repository_root/dist"
deploy_path="$(dashboard_resolve_path "${DASHBOARD_DEPLOY_PATH:-$HOME/public_html/dashboard.arasyahome.ro}")"
storage_path="$(dashboard_resolve_path "${DASHBOARD_RELEASE_STORAGE_PATH:-$HOME/arasya-dashboard-releases}")"
dashboard_guard_targets "$deploy_path" "$storage_path" "$repository_root"

[[ -f "$repository_root/SHA256SUMS" ]] || dashboard_fail "Lipsește manifestul SHA256 al pachetului deploy."
(cd -- "$repository_root" && sha256sum -c SHA256SUMS >/dev/null 2>&1) || dashboard_fail "Integritatea pachetului deploy a eșuat."
/bin/bash "$repository_root/scripts/validate-dashboard-release.sh" "$dist_path" >/dev/null || dashboard_fail "Release-ul din pachet este invalid."
commit="$(dashboard_release_commit "$dist_path")"; dashboard_validate_sha "$commit"

if [[ "${DRY_RUN:-0}" == "1" ]]; then dashboard_log "Dry-run valid pentru commit $commit → $deploy_path"; exit 0; fi

staging="$storage_path/.staging-$commit-$$"; retained="$storage_path/$commit"
cleanup() { [[ -d "$staging" ]] && rm -rf -- "$staging"; return 0; }
trap cleanup EXIT
mkdir -p -- "$storage_path" "$deploy_path"
chmod 0750 "$storage_path"
resolved_storage="$(cd -- "$storage_path" && pwd -P)"
[[ "${retained%/*}" == "$resolved_storage" ]] || dashboard_fail "Release-ul a ieșit din stocarea controlată."

if [[ -d "$retained" ]]; then
  /bin/bash "$repository_root/scripts/validate-dashboard-release.sh" "$retained" "$commit" >/dev/null || dashboard_fail "Release-ul reținut $commit este corupt."
else
  mkdir -- "$staging"
  rsync --archive --delete "$dist_path/" "$staging/"
  /bin/bash "$repository_root/scripts/validate-dashboard-release.sh" "$staging" "$commit" >/dev/null || dashboard_fail "Release-ul staged este invalid."
  mv -- "$staging" "$retained"
fi

dashboard_activate_release "$retained" "$deploy_path" "$storage_path" "$commit" deploy
/bin/bash "$repository_root/scripts/validate-dashboard-release.sh" "$retained" "$commit" >/dev/null
dashboard_gc_releases "$storage_path" "$deploy_path" "$release_retention" "$gc_dry_run"
trap - EXIT
dashboard_log "Activat commit Dashboard: $commit"
