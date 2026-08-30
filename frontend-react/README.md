# Frontend (frontend-react)

Development

Install deps and run dev server (Vite proxies `/api` to the backend):

```bash
cd frontend-react
npm install
npm run dev
```

The dev server runs at `http://localhost:5173/`. It proxies `/api` to `http://localhost:3000` by default (see `vite.config.js`).

Notes
- The app uses demo auth headers (`Authorization: Bearer demo-token`) for local development. Set appropriate auth in production.
- For production builds, set `VITE_API_BASE_URL` if you host the API under a different origin.
