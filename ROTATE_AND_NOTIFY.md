Secret rotation & collaborator notification checklist

Priority: High — rotate now.

1) Immediate rotation actions (you or credential owners must perform):
   - Revoke the exposed JWT/keys at the issuing provider.
   - Generate new credentials (JWT secret, API keys) and store in a secrets manager.
   - Update `backend/.env` on deploy targets and CI secret stores (do NOT commit `.env`).

2) Update repository and deployments:
   - Ensure `backend/.env` is removed from working trees and present in `.gitignore`.
   - Add new secrets to GitHub Actions/other CI via repository secrets.

3) Communicate to collaborators (draft message below):

Draft message (short):

Subject: [ACTION REQUIRED] Repo secret exposed — rotate credentials and re-clone

Body:
Hi team,

A secret (JWT) was accidentally committed to the repo and has been removed from history and the working tree. We have sanitized the repo and force-pushed cleaned history.

Actions for you:
- Immediately rotate any credentials that may have been exposed (invalidate old JWTs).
- Re-clone the repository fresh: `git clone https://github.com/muideen515/certicheck.git` or run `git fetch origin && git reset --hard origin/main` (this will discard local changes).
- Update any local environment variables from the team secret manager.

If you have any questions or need help rotating keys, reply here.

Thanks.

4) Post-rotation verification:
   - Verify no leaked secret strings remain:
     - `git grep -n "part_of_secret" || true`
   - Check CI logs and deployments for failures.

If you want, I can send this message as a PR comment and open an issue to track rotation tasks.
