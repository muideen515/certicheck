# Local setup for the issuer certificate flow

## 1. Install dependencies

```powershell
cd c:\Users\DONALDTRUMP\Desktop\Notes\backend
npm install
```

## 2. Create a PostgreSQL database

If PostgreSQL is installed locally, create the database:

```powershell
createdb certicheck
```

If you use a different database name, update the env file.

## 3. Create the environment file

```powershell
copy .env.example .env
```

Then edit .env and set:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_NAME=certicheck
JWT_SECRET=your_secret_here
ADMIN_EMAIL=admin@certicheck.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@certicheck.com
SMTP_PASS=your-smtp-app-password
EMAIL_FROM=CertiCheck <noreply@certicheck.com>
```

The backend seeds three admin logins on first authentication: `admin@certicheck.com`, `admin2@certicheck.com`, and `admin3@certicheck.com`. All use the default password `password`.

For real password-reset emails, configure SMTP with credentials from a verified `@certicheck.com` mailbox. Keep `SMTP_PASS` in your local `.env` or deployment secret store, never in source control. Configure SPF/DKIM with your provider; without SMTP, development mode prints the OTP to the backend console.

## 4. Initialize the database schema

```powershell
npm run setup-db
```

## 5. Start the backend

```powershell
npm run dev
```

The backend will be available at:
- http://localhost:5000/health

## 6. Run tests

```powershell
npm test
```

This runs unit and integration coverage for certificate persistence and the issuer certificate API flow.

## 7. Use the issuer flow

1. Open the frontend in a browser.
2. Sign up or log in.
3. Submit an issuer application.
4. Approve the application from the database/admin flow.
5. Open the Issuer page and issue a certificate.
