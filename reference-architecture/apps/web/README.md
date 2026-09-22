# Web app setup

## Install

```bash
cd reference-architecture
npm install
```

## Database

```bash
cd reference-architecture
cp .env.example .env
docker compose up -d postgres
npx prisma migrate dev --schema apps/web/prisma/schema.prisma
```

## Run app

```bash
npm run dev:web
```

## Routes

- Public apply: `POST /api/applications/submit`
- Admin approve: `POST /api/admin/applications/:id/approve`
- Admin reject: `POST /api/admin/applications/:id/reject`
- Issuer issue: `POST /api/issuer/certificates/issue`
- Public lookup: `GET /api/public/certificates/:id`
