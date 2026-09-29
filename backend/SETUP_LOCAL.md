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
SMTP_USER=your-gmail@gmail.com
# Set SMTP_PASS as a Render environment variable; never commit it.
EMAIL_FROM=CertiCheck <your-gmail@gmail.com>
```

The backend seeds three admin logins on first authentication: `admin@certicheck.com`, `admin2@certicheck.com`, and `admin3@certicheck.com`. All use the default password `password`.

Signup, login, and password reset accept valid email addresses from any domain. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` in the environment, or use `EMAIL_USER` and `EMAIL_PASSWORD` for the Gmail service transport. Set `EMAIL_FROM` to the same mailbox used to authenticate with SMTP. Never store SMTP passwords in a tracked file or commit them. Configure SPF/DKIM with your provider; without SMTP, development mode prints OTPs to the backend console and production returns a configuration error.

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
