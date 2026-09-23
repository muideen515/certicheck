# Deployment Checklist

This document outlines recommended steps to deploy the Certicheck backend to production.

## Current deployment limitation

This workspace has a local DB-backed deployment, but no verified public frontend/backend URL is configured here. Vercel/Render deployment still requires a hosted database, production secrets, CORS configuration, and a public smoke test. Until those are supplied, report the system as local/demo mode rather than live production.

1. Environment variables
   - Create a `.env` file with required values:
     - `PORT=5000`
     - `DATABASE_URL=postgres://user:pass@host:5432/dbname`
     - `JWT_SECRET` and `ADMIN_JWT_SECRET` (must be strong, different values)
     - `SOLANA_ENABLE=true` (optional)
     - `SOLANA_KEYPAIR_PATH` or `SOLANA_PAYER_SECRET` (if `SOLANA_ENABLE=true`)
     - `CERTIFICATE_PROGRAM_ID` (Anchor program ID)

2. Database
   - Provision a Postgres instance and run `node src/db/init.js` or set up migrations.

3. Secrets
   - Store keypair/secret in a secure secrets manager. Avoid checking key files into the repo.

4. Process manager
   - Use `systemd`, `pm2`, or container orchestration (Docker Compose / Kubernetes) to run the app.

5. Monitoring & backups
   - Monitor application logs and Postgres metrics. Backup DB regularly.

6. CI
   - Run demo-mode tests on each PR. Run on-chain tests in a gated job that uses protected secrets.
