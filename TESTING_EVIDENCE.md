# Testing Evidence for Certicheck Blockchain Integration

## Status Summary
- Backend certificate routes added for issuance, lookup, and revocation flow.
- IPFS metadata pinning is implemented with a deterministic fallback for environments without Pinata credentials.
- Solana program scaffold created under solana-program/ for Anchor-based issuance and revocation.
- Frontend verification currently uses the new backend lookup endpoint and no longer relies solely on the old demo logic.

## Verification Commands
Run the following locally once the toolchain is available:

```bash
cd backend
npm install
npm run setup-db
npm start
```

```bash
cd solana-program
cargo test
anchor build
```

## Expected Outcomes
- Backend exposes /api/certificates/issue, /api/certificates/lookup/:certificateId and /api/certificates/revoke/:certificateId.
- Local certificate persistence works with fallback storage when the database is unavailable.
- API integration tests demonstrate the issuer issue, lookup, and revoke flow using a demo token.
- Frontend verification page can query the backend certificate lookup endpoint.

## Test Commands
Run the backend tests locally:

```bash
cd backend
npm install
npm test
```

Verify the database and backend startup:

```bash
cd backend
npm run setup-db
npm run dev
```

Verify the Solana Anchor program locally once the toolchain is installed:

```bash
cd solana-program
cargo test
anchor build
```

## Evidence Notes
- The certificate persistence unit test covers local store issue, lookup, and revoke scenarios.
- A new API integration test covers the backend certificate issue/lookup/revoke flow using demo authentication.
- The backend now supports a demo token path for local API flow validation without requiring a full user signup.
- The backend certificate lookup route is wired to query deployed Anchor program state when `CERTIFICATE_PROGRAM_ID` is set and `SOLANA_ENABLE=true`.
- The Anchor build is documented for local execution, but the program was not compiled in this session due to missing local toolchain access.
- For final report evidence, capture terminal output from `npm test`, `npm run setup-db`, and `anchor build` along with relevant screenshots.

## Evidence Capture Checklist
- `backend/tests/certificate-store.test.js` passes
- `backend/tests/api-certificate-flow.test.js` passes
- `backend` health endpoint returns `status: ok`
- `backend/.env` configured with `DB_*` values and Solana settings
- Solana Anchor program build logs from `solana-program` folder
- Screenshot of issuer flow or API response for a certificate lookup

## Recommended log files
- `backend/logs/test-run.txt` — backend test run output
- `backend/logs/db-init.txt` — database initialization output
- `solana-program/logs/anchor-build.txt` — Anchor compile output

## Most Important Next Steps
1. Set up the local backend environment and database using `backend/SETUP_LOCAL.md`.
2. Run `npm test` in `backend` and record the terminal output.
3. Deploy the Anchor program to Solana devnet and save the generated program ID.
4. Update `backend/.env` with `CERTIFICATE_PROGRAM_ID` and `SOLANA_*` values.
5. Connect the frontend issuer issue flow to `/api/certificates/issue` and expose the returned transaction signature.
6. Verify certificate state from the deployed Anchor program by comparing backend lookup results against on-chain account data.
