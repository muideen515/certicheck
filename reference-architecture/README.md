# Certicheck Reference Architecture

This project is a reference implementation of the architecture described in the provided flow:

- Public user applies from the home/apply page
- Application is routed to admin review
- Admin approves or rejects the applicant
- Approved applicants receive access via Google OAuth / Auth.js
- Issuers can issue blockchain-backed certificates
- Certificates are public and verifiable

## Stack

- Frontend: Next.js, Tailwind CSS, Framer Motion
- Backend: Next.js API Routes + Prisma + PostgreSQL
- Auth: Auth.js / NextAuth with Google OAuth
- Blockchain: Solidity + Hardhat + Ethers/Viem

## Project structure

```text
reference-architecture/
  apps/
    web/
      app/
      components/
      lib/
      prisma/
      public/
      types/
      scripts/
  blockchain/
    contracts/
    scripts/
    test/
    hardhat.config.js
  .env.example
  docker-compose.yml
  package.json
```

## Local development

1. Install dependencies
2. Start PostgreSQL via Docker Compose
3. Run Prisma migrate
4. Start the Next.js app
5. Start the Hardhat local node

See the app README and blockchain README for exact commands.
