# On-chain issuance setup

To enable real on-chain issuance you must provide a funded Solana keypair for the backend payer and set the following environment variables in `backend/.env` or your deployment environment:

- `SOLANA_ENABLE=true`
- `SOLANA_CLUSTER=devnet` (or `mainnet-beta`)
- `SOLANA_RPC_URL` (optional, defaults to cluster)
- `SOLANA_KEYPAIR_PATH` — path to a JSON keypair file accessible to the backend process
  - OR set `SOLANA_PAYER_SECRET` to a JSON array string of the secret key
- `CERTIFICATE_PROGRAM_ID` — Anchor program ID (default set in `solana-program`)

Notes:
- Ensure the keypair has enough SOL to pay transaction fees and account creation (issuer PDA, certificate PDA).
- For CI/testing, use `DEMO_MODE=true` to run without on-chain features.
- The backend will validate `SOLANA_KEYPAIR_PATH` at startup and throw if missing when `SOLANA_ENABLE=true`.
