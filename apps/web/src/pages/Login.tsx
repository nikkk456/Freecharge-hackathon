import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import Callout from "@/components/Callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

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
      <div className="flex flex-col items-center text-center">
        <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
          <ShieldCheck className="size-5 text-foreground" strokeWidth={2.25} />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Approving a circular is a named decision — it is recorded against you.
        </p>
      </div>

      <form onSubmit={submit} className="mt-7 space-y-3.5">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Password</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5"
          />
        </label>

        {error && <Callout tone="critical">{error}</Callout>}

        <Button type="submit" size="lg" disabled={busy || !email || !password} className="w-full">
          {busy && <Loader2 className="animate-spin" />}
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <Card className="mt-8">
        <CardContent className="py-4">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Demo accounts
          </h2>
          <ul className="mt-2.5 space-y-1.5">
            {DEMO.map((account) => (
              <li key={account.email} className="flex items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                  }}
                  className="rounded-sm font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                >
                  {account.email}
                </button>
                <span className="text-muted-foreground">{account.note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
