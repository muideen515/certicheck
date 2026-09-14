Security removal note

This commit is a non-sensitive documentation file created to allow opening a Pull Request that documents the sanitized change to `backend/.env`.

What I changed:
- Removed an accidentally committed JWT value from `backend/.env` and replaced it with an empty `PINATA_JWT` placeholder.
- Ensured `backend/.env` is untracked by Git (present in `.gitignore`).

This PR does NOT rewrite Git history. If you want to fully purge the secret from the repository history, we can run `git filter-repo` or BFG and force-push — this requires coordination and secret rotation afterwards.

Next recommended actions:
- Rotate any exposed credentials immediately.
- If you want me to purge history, confirm and I will prepare an explicit plan and make the necessary changes with your approval.
