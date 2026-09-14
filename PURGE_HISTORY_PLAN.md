Purge Git history plan (non-destructive prep)

Goal

Safely remove committed secrets (e.g. the JWT found in `backend/.env`) from repository history and ensure secrets are rotated. This document lists recommended steps, commands, and verification guidance. Do NOT run destructive steps until you approve them.

Overview

1. Rotate any exposed credentials immediately (invalidate the JWT/keys at the provider).
2. Prepare and test history-purge commands locally on a clone (backup first).
3. Run `git filter-repo` or BFG to remove offending files/strings from history.
4. Force-push cleaned branches to the remote and inform collaborators to re-clone or rebase.

Recommended approach (git-filter-repo)

Install:

```bash
python3 -m pip install --user git-filter-repo
# or use your package manager
```

Common operations:

- To remove a path entirely from history (e.g. `backend/.env`):

```bash
# Make a backup clone first
git clone --mirror git@github.com:muideen515/certicheck.git certicheck-mirror.git
cd certicheck-mirror.git
# Remove the path from all commits
git filter-repo --invert-paths --paths backend/.env
# Push cleaned history (force push) AFTER coordination
git push --force --all
git push --force --tags
```

- To replace an exact secret string across history (safer for inline secrets):

Create `replace.txt` with entries like:

```
# Format: <literal>=<replacement>
# Replace the literal secret with a harmless placeholder
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...==[REMOVED_SECRETS]
```

Then run:

```bash
git filter-repo --replace-text replace.txt
```

BFG alternative (simpler for files):

```bash
# requires Java
# Remove files named .env across history
bfg --delete-files backend/.env
# then follow with
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

Rotation & notification

- Immediately rotate any keys/jwt/secrets discovered (revoke and issue new ones).
- Update environment and secret stores with new values.
- Notify any collaborators and downstream services of the rotation.

Verification

- After pushing cleaned history, verify the secret no longer appears with:

```bash
git clone https://github.com/muideen515/certicheck.git tmp-check
cd tmp-check
git grep -n "part_of_secret" || true
```

Coordination notes

- Force-pushing rewritten history will require all collaborators to re-clone:
  - `git fetch origin` then `git reset --hard origin/main` or a fresh clone.
- Schedule a maintenance window if this repo is actively worked on.

If you approve, I can prepare and run the purge steps (non-interactive on this machine). Otherwise I can provide a step-by-step script for you to run locally.
