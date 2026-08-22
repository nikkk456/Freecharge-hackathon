import { useState } from "react";
import { useAuth } from "../lib/auth";

// The demo accounts, shown on the form so nobody has to dig through the README.
// Roles differ on purpose: only reviewer and owner can approve a draft.
const DEMO = [
  { email: "analyst@cac.dev", password: "analyst123", note: "drafts, cannot approve" },
  { email: "reviewer@cac.dev", password: "reviewer123", note: "can approve" },
  { email: "owner@cac.dev", password: "owner123", note: "can approve" },
  { email: "admin@cac.dev", password: "admin123", note: "everything" },
];

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("reviewer@cac.dev");
  const [password, setPassword] = useState("reviewer123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
      <p className="mt-1 text-sm text-gray-600">
        Approving a circular is a named decision — it is recorded against you.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <label className="block">
          <span className="text-xs text-gray-600">Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
          />
        </label>

        {error && (
          <p className="text-sm text-[color:var(--status-critical)]">
            <span aria-hidden className="mr-1.5 font-bold">✕</span>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Demo accounts
        </h2>
        <ul className="mt-2 space-y-1.5">
          {DEMO.map((account) => (
            <li key={account.email} className="flex items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                className="text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
              >
                {account.email}
              </button>
              <span className="text-gray-400">{account.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
