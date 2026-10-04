#!/usr/bin/env bash
set -Eeuo pipefail

# Re-activates a retained, checksum-verified Dashboard release: a specific source commit or --previous.
# DRY_RUN=1 validates the candidate and prints what would be activated without changing anything.
repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
source "$repository_root/scripts/dashboard-release-common.sh"
for command in rsync sha256sum php mv cp find sort tr grep date sed; do dashboard_require_command "$command"; done
[[ $# -eq 1 ]] || dashboard_fail "Utilizare: cpanel-rollback-dashboard.sh <sourceCommit|--previous>"
deploy_path="$(dashboard_resolve_path "${DASHBOARD_DEPLOY_PATH:-$HOME/public_html/dashboard.arasyahome.ro}")"
storage_path="$(dashboard_resolve_path "${DASHBOARD_RELEASE_STORAGE_PATH:-$HOME/arasya-dashboard-releases}")"
dashboard_guard_targets "$deploy_path" "$storage_path" "$repository_root"
current="$(dashboard_read_pointer "$storage_path/active-release")"
if [[ "$1" == "--previous" ]]; then target="$(dashboard_read_pointer "$storage_path/previous-release")"; else target="$1"; dashboard_validate_sha "$target"; fi
[[ "$target" != "$current" ]] || dashboard_fail "Release-ul cerut este deja activ."
retained="$storage_path/$target"; resolved_storage="$(cd -- "$storage_path" && pwd -P)"
resolved_retained="$(cd -- "$retained" 2>/dev/null && pwd -P)" || dashboard_fail "Release-ul de rollback nu există."
[[ "${resolved_retained%/*}" == "$resolved_storage" && "${resolved_retained##*/}" == "$target" ]] || dashboard_fail "Release-ul de rollback a ieșit din stocarea controlată."
/bin/bash "$repository_root/scripts/validate-dashboard-release.sh" "$resolved_retained" "$target" >/dev/null || dashboard_fail "Release-ul de rollback $target nu trece validarea."
if [[ "${DRY_RUN:-0}" == "1" ]]; then dashboard_log "Ar activa commit Dashboard: $target (activ acum: $current)"; exit 0; fi
dashboard_activate_release "$resolved_retained" "$deploy_path" "$storage_path" "$target" rollback
dashboard_log "Activat commit Dashboard: $target"
