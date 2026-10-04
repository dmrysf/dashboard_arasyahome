#!/usr/bin/env bash
# Shared helpers for the Dashboard cPanel release scripts. Portable bash only: cPanel deploy shells have no
# /dev/fd, so process substitution is never used; loops read from here-strings or temporary files instead.

dashboard_log() { printf '[Arasya Dashboard] %s\n' "$1"; }
dashboard_fail() { printf '[Arasya Dashboard] EROARE: %s\n' "$1" >&2; exit 1; }
dashboard_require_command() { command -v "$1" >/dev/null 2>&1 || dashboard_fail "Comanda necesară lipsește: $1"; }
dashboard_validate_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || dashboard_fail "Commit-ul trebuie să fie SHA lowercase cu 40 de caractere."; }

dashboard_resolve_path() {
  local target="$1" suffix="" resolved
  [[ "$target" == /* ]] || dashboard_fail "Destinația trebuie să fie o cale absolută."
  case "/$target/" in *"/../"*|*"/./"*) dashboard_fail "Destinația conține segmente nesigure." ;; esac
  while [[ ! -e "$target" ]]; do suffix="/${target##*/}$suffix"; target="${target%/*}"; [[ -n "$target" ]] || target="/"; done
  [[ -d "$target" ]] || dashboard_fail "Baza destinației nu este director."
  resolved="$(cd -- "$target" && pwd -P)"
  if [[ "$resolved" == "/" ]]; then printf '/%s\n' "${suffix#/}"; else printf '%s%s\n' "$resolved" "$suffix"; fi
}

dashboard_release_commit() {
  php -r '$r=json_decode(file_get_contents($argv[1]), true, flags: JSON_THROW_ON_ERROR); $s=$r["commit"] ?? ""; if (!is_string($s) || preg_match("/^[0-9a-f]{40}$/", $s) !== 1) exit(2); echo $s;' "$1/release.json" \
    || dashboard_fail "release.json commit este invalid."
}

dashboard_read_pointer() {
  local pointer="$1" value
  [[ -f "$pointer" && ! -L "$pointer" ]] || dashboard_fail "Pointer-ul release nu este fișier regulat."
  value="$(tr -d '[:space:]' < "$pointer")"; dashboard_validate_sha "$value"; printf '%s\n' "$value"
}

dashboard_write_pointer() {
  local pointer="$1" value="$2" temporary="${1}.tmp.$$"
  dashboard_validate_sha "$value"; printf '%s\n' "$value" > "$temporary"; chmod 0644 "$temporary"; mv -f -- "$temporary" "$pointer"
}

dashboard_atomic_copy() {
  local source="$1" destination="$2" temporary="${2}.tmp.$$"
  cp -p -- "$source" "$temporary"; mv -f -- "$temporary" "$destination"
}

# Appends one line to the release history: UTC time, action, activated commit, previous commit.
dashboard_record_history() {
  local storage="$1" action="$2" commit="$3" previous="${4:-none}"
  printf '%s %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$action" "$commit" "$previous" >> "$storage/release-history.log"
}

# The deploy root is fixed: only a directory named dashboard.arasyahome.ro is ever written, and never one of the
# other Arasya, WordPress, Trendhome, OutletPerdele or Lace Secret roots.
dashboard_guard_targets() {
  local deploy_path="$1" storage_path="$2" repository_root="$3" home_path public_html target forbidden
  home_path="$(dashboard_resolve_path "$HOME")"
  public_html="$(dashboard_resolve_path "$HOME/public_html")"
  [[ "${deploy_path##*/}" == "dashboard.arasyahome.ro" ]] || dashboard_fail "Document root-ul Dashboard trebuie să fie directorul dashboard.arasyahome.ro."
  for target in "$deploy_path" "$storage_path"; do
    for forbidden in / "$home_path" "$public_html" "$repository_root" "$repository_root/dist" \
      "$(dashboard_resolve_path "$HOME/staff.arasyahome.ro")" "$(dashboard_resolve_path "$HOME/api.arasyahome.ro")" \
      "$(dashboard_resolve_path "$HOME/arasya-operations-api")" "$(dashboard_resolve_path "$HOME/arasya-config")" \
      "$(dashboard_resolve_path "$HOME/arasya-staff-releases")" "$(dashboard_resolve_path "$HOME/arasya-backups")"; do
      [[ "$target" != "$forbidden" ]] || dashboard_fail "Destinația de deploy este interzisă: $target"
    done
    case "$target/" in
      "$repository_root"/*|"$(dashboard_resolve_path "$HOME/staff.arasyahome.ro")"/*|"$(dashboard_resolve_path "$HOME/api.arasyahome.ro")"/*|"$(dashboard_resolve_path "$HOME/arasya-operations-api")"/*|"$(dashboard_resolve_path "$HOME/arasya-config")"/*|"$(dashboard_resolve_path "$HOME/arasya-staff-releases")"/*)
        dashboard_fail "Destinația este într-o rădăcină interzisă: $target" ;;
      *trendhome*|*outletperdele*|*lace-secret*|*lacesecret*) dashboard_fail "Destinația aparține altui site: $target" ;;
    esac
  done
  [[ "$deploy_path" != "$storage_path" ]] || dashboard_fail "Document root și stocarea release trebuie separate."
  case "$storage_path/" in "$deploy_path/"*|"$public_html/"*) dashboard_fail "Stocarea release nu poate fi publică." ;; esac
  case "$deploy_path/" in "$storage_path/"*) dashboard_fail "Document root nu poate fi în stocarea release." ;; esac
}

# Activation order: hashed assets first (additive), then static files, release.json, and index.html last, so a
# failure before the entrypoint switch leaves the previous release serving its own assets.
dashboard_activate_release() {
  local retained="$1" live="$2" storage="$3" commit="$4" action="${5:-deploy}"
  mkdir -p -- "$live/assets"
  rsync --archive "$retained/assets/" "$live/assets/"
  local source name
  for source in "$retained"/* "$retained"/.[!.]*; do
    [[ -f "$source" && ! -L "$source" ]] || continue
    name="${source##*/}"
    case "$name" in index.html|release.json|SHA256SUMS) continue ;; esac
    dashboard_atomic_copy "$source" "$live/$name"
  done
  dashboard_atomic_copy "$retained/release.json" "$live/release.json"
  [[ "${ARASYA_TEST_FAIL_BEFORE_INDEX:-0}" != "1" ]] || dashboard_fail "Eșec simulat înainte de index."
  dashboard_atomic_copy "$retained/index.html" "$live/index.html"
  local referenced_assets
  referenced_assets="$(grep -oE '/assets/[A-Za-z0-9._-]+' "$live/index.html" | LC_ALL=C sort -u)"
  [[ -n "$referenced_assets" ]] || dashboard_fail "index.html activ nu referă asset-uri."
  while IFS= read -r asset; do [[ -f "$live/${asset#/}" ]] || dashboard_fail "Asset activ lipsă: $asset"; done <<< "$referenced_assets"
  local old=""; if [[ -f "$storage/active-release" ]]; then old="$(dashboard_read_pointer "$storage/active-release")"; fi
  if [[ -n "$old" && "$old" != "$commit" ]]; then dashboard_write_pointer "$storage/previous-release" "$old"; fi
  dashboard_write_pointer "$storage/active-release" "$commit"
  dashboard_record_history "$storage" "$action" "$commit" "${old:-none}"
}

dashboard_release_mtime() { if stat -c '%Y' "$1" >/dev/null 2>&1; then stat -c '%Y' "$1"; else stat -f '%m' "$1"; fi; }

dashboard_gc_releases() {
  local storage="$1" live="$2" retain="$3" dry_run="${4:-0}"
  local active previous="" listing="$storage/.gc-list.$$" directory name kept=0
  [[ "$retain" =~ ^[0-9]+$ && "$retain" -ge 1 ]] || dashboard_fail "Retenția trebuie să fie pozitivă."
  active="$(dashboard_read_pointer "$storage/active-release")"; if [[ -f "$storage/previous-release" ]]; then previous="$(dashboard_read_pointer "$storage/previous-release")"; fi
  : > "$listing"
  for directory in "$storage"/*; do [[ -d "$directory" && ! -L "$directory" ]] || continue; name="${directory##*/}"; [[ "$name" =~ ^[0-9a-f]{40}$ ]] || continue; printf '%s %s\n' "$(dashboard_release_mtime "$directory")" "$name" >> "$listing"; done
  [[ -d "$storage/$active" ]] && kept=$((kept + 1))
  [[ -n "$previous" && "$previous" != "$active" && -d "$storage/$previous" ]] && kept=$((kept + 1))
  sort -rn "$listing" > "$listing.sorted"
  while read -r _ name; do
    [[ -n "$name" ]] || continue
    if [[ "$name" == "$active" || "$name" == "$previous" ]]; then continue; fi
    if (( kept < retain )); then kept=$((kept + 1)); continue; fi
    directory="$storage/$name"; [[ "${directory%/*}" == "$storage" ]] || dashboard_fail "Curățare release nesigură."
    if [[ "$dry_run" == "1" ]]; then dashboard_log "Ar elimina release: $name"; else rm -rf -- "$directory"; fi
  done < "$listing.sorted"
  rm -f -- "$listing" "$listing.sorted"

  local asset relative retained found asset_listing="$storage/.gc-assets.$$"
  [[ -d "$live/assets" ]] || return 0
  find "$live/assets" -type f -print0 > "$asset_listing"
  while IFS= read -r -d '' asset; do
    relative="${asset#"$live/assets/"}"; found=0
    for retained in "$storage"/[0-9a-f]*; do [[ -f "$retained/assets/$relative" ]] && { found=1; break; }; done
    if [[ "$found" == "0" ]]; then if [[ "$dry_run" == "1" ]]; then dashboard_log "Ar elimina asset: $relative"; else rm -f -- "$asset"; fi; fi
  done < "$asset_listing"
  rm -f -- "$asset_listing"
}
