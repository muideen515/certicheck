# Security & Secrets Review Checklist

1. Ensure `.env` and `backend/.env` are listed in `.gitignore` (done).
2. Provide `backend/.env.example` with placeholders (done).
3. Rotate any leaked secrets and remove them from history if present.
4. Use repository secrets for CI/deployment (e.g., `POSTGRES_PASSWORD`, `JWT_SECRET`, `PINATA_*`).
5. Limit access to deployment keys and review team permissions.
6. Run dependency vulnerability scans (e.g., `npm audit` / Dependabot).
7. Ensure HTTP endpoints enforce rate-limiting and input validation.
8. Review database user privileges (avoid superuser credentials in production).
9. Configure logging to avoid sensitive data in logs.
10. Consider adding automated secret scanning on CI (repo-scanning action).
