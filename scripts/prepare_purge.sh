#!/usr/bin/env bash
set -euo pipefail

echo "Preparing purge helper — non-destructive checks only"

# Check for git-filter-repo
if command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo found"
else
  echo "git-filter-repo not found. To install: python3 -m pip install --user git-filter-repo"
fi

# Show last commits touching backend/.env (if any)
echo
echo "Recent commits that touched backend/.env:"
git log --oneline --decorate -- backend/.env || true

# Suggest next commands (printed only)
cat <<'INSTRUCTIONS'

NEXT STEPS (manual, non-destructive):

1. Rotate the exposed secret at its provider.
2. Make a mirror backup:
   git clone --mirror <repo-url> repo-mirror.git
3. Inspect the mirror and test filter commands locally.
4. When ready, run one of the purge commands from PURGE_HISTORY_PLAN.md.

This script WILL NOT run destructive commands automatically.

INSTRUCTIONS
