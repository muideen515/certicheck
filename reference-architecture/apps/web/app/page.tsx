export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-5xl font-bold">Certicheck</h1>
        <p className="mt-4 max-w-xl text-slate-300">
          Public application flow, admin approval, issuer certificate issuance, and blockchain verification.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">1. Apply</h2>
            <p className="mt-2 text-slate-300">User submits issuer application.</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">2. Review</h2>
            <p className="mt-2 text-slate-300">Admin approves or rejects application.</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">3. Issue</h2>
            <p className="mt-2 text-slate-300">Issuer mints verifiable certificate on-chain.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
