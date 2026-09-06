import {
  Loader2,
  LockIcon,
  MailIcon,
  Eye,
  EyeOff,
  FileSearch,
  ShieldCheck,
  Grid3x3,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import Callout from "@/components/Callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";

// The demo accounts, shown on the form so nobody has to dig through the README.
// Roles differ on purpose: only reviewer and owner can approve a draft.
const DEMO = [
  { email: "analyst@cac.dev", password: "analyst123", note: "drafts, cannot approve" },
  { email: "reviewer@cac.dev", password: "reviewer123", note: "can approve" },
  { email: "owner@cac.dev", password: "owner123", note: "can approve" },
  { email: "admin@cac.dev", password: "admin123", note: "everything" },
];

// The four stages the app actually performs, left to right.
const PIPELINE = [
  { icon: FileSearch, label: "Ingest the circular" },
  { icon: ShieldCheck, label: "Ground every claim in the source" },
  { icon: Grid3x3, label: "Map risks to the control library" },
  { icon: ListChecks, label: "Track each obligation to closure" },
];

// Each stage a shade more present than the last. Static so Tailwind's
// scanner sees them; index-keyed to PIPELINE.
const TINT = [
  "bg-primary-foreground/15",
  "bg-primary-foreground/25",
  "bg-primary-foreground/35",
  "bg-primary-foreground/45",
];

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("reviewer@cac.dev");
  const [password, setPassword] = useState("reviewer123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div
      className="flex items-center justify-center w-full bg-background"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <Card className="mx-auto flex w-full max-w-5xl min-h-[680px] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-lg md:flex-row">
        {/* Left panel — branding */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-primary-foreground md:flex md:w-1/2">
          {/* decorative glows */}
          <div className="absolute -mr-32 -mt-32 right-0 top-0 h-64 w-64 rounded-full bg-primary-foreground/5 blur-3xl" />
          <div className="absolute -mb-48 -ml-48 bottom-0 left-0 h-96 w-96 rounded-full bg-black/10 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,color-mix(in_oklab,var(--primary-foreground)_14%,transparent),transparent_55%)]" />

          <div className="relative z-10">
            <div className="mb-12 flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-foreground">
                <ShieldMark className="h-6 w-6 text-brand" />
              </div>
              <span
                className="text-2xl font-bold tracking-tight"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                RegVisor
              </span>
            </div>

            <h2 className="mb-6 text-4xl font-semibold leading-tight">
              Unified Banking <br />
              Compliance Suite.
            </h2>
            <p className="max-w-xs text-xl leading-relaxed text-primary-foreground/70">
              Secure, real-time regulatory oversight and reporting for modern
              financial institutions.
            </p>

            <GroundedClaim />
          </div>

          <div className="relative z-10">
            {/* The pipeline, in order — each stage hands off to the next,
                so they overlap. Hover lifts one circle out of the stack;
                `z-10` is what makes it clear its neighbours, since -space-x
                leaves later siblings painted on top. Fanning the whole group
                on hover was tried and merged all four into one blob. */}
            <div className="mb-4 flex -space-x-3">
              {PIPELINE.map(({ icon: Icon, label }, i) => (
                <div
                  key={label}
                  title={label}
                  className={`relative grid h-10 w-10 place-items-center rounded-full border-2 border-brand transition-transform duration-200 ease-out hover:z-10 hover:-translate-y-1.5 hover:scale-110 ${TINT[i]}`}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
              ))}
            </div>
            <p className="text-sm text-primary-foreground/60">
              Ingest, ground, map, close — with a person on every decision.
            </p>
          </div>
        </aside>
        {/* Right panel — login form */}
        <section className="flex flex-1 flex-col justify-center p-8 sm:p-12 lg:p-16">
          <div className="flex self-center mb-12 md:hidden items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-foreground">
              <ShieldMark className="h-6 w-6 text-brand" />
            </div>
            <span
              className="text-2xl font-bold tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              RegVisor
            </span>
          </div>
          <div className="mb-10 xs:self-center xs:text-center">
            <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
              Welcome Back
            </h1>
            <p className="text-muted-foreground">
              Please enter your details to access your account.
            </p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-3.5">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Email
              </span>
              <div className="relative">
                <MailIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@corporate.com"
                  className="mt-1.5 h-12 w-full rounded-xl border border-input bg-muted/40 pl-11 pr-4 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/70"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Password
              </span>
              <div className="relative">
                <LockIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 h-12 w-full rounded-xl border border-input bg-muted/40 pl-11 pr-11 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/70"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </label>

            {error && <Callout tone="critical">{error}</Callout>}

            <div className="pt-4">
              <Button
                type="submit"
                size="lg"
                disabled={busy || !email || !password}
                className="w-full"
              >
                {busy && <Loader2 className="animate-spin" />}
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </div>
          </form>

          <div className="flex shrink-0 self-center items-center gap-3 mt-8">
            <ThemeToggle />
          </div>

          {/* Footer — features + legal */}
          <div className="mt-auto pt-12 text-center">
            <div className="mb-8 flex justify-center gap-6 opacity-50">
              <TrustBadge code="AI" label="Advisory" />
              <TrustBadge code="RCM" label="Matrix" />
              <TrustBadge code="Health" label="Score" />
            </div>

            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              <a href="#" className="transition-colors hover:text-foreground">
                Terms of Service
              </a>
              <span className="text-border">|</span>
              <a href="#" className="transition-colors hover:text-foreground">
                Privacy Policy
              </a>
              <span className="text-border">|</span>
              <a href="#" className="transition-colors hover:text-foreground">
                Help Center
              </a>
            </div>
          </div>

          <Card className="mt-8 hidden">
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
        </section>
      </Card>
    </div>
  );
}

/* ---------- small presentational components ---------- */

/**
 * The product's whole argument, at the size of a business card: an AI claim,
 * and the line of the circular it came from. Deliberately not a statistic —
 * a compliance tool that exists to make claims checkable should not open with
 * a number nobody can check.
 */
function GroundedClaim() {
  return (
    <figure className="mt-11 max-w-sm">
      <figcaption className="mb-4 flex items-center gap-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/50">
          Every claim, traced to its line
        </span>
        <span className="rounded-full px-2 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground/50 ring-1 ring-primary-foreground/25">
          Example
        </span>
      </figcaption>

      {/* A thread from the claim down to its evidence. No card: the
          relationship is the design, and a box around it only adds edges. */}
      <div className="relative pl-6">
        <span
          aria-hidden
          className="absolute left-[3px] top-3 bottom-6 w-px bg-gradient-to-b from-primary-foreground/45 via-primary-foreground/20 to-transparent"
        />
        <span
          aria-hidden
          className="absolute left-0 top-2.5 h-[7px] w-[7px] rounded-full bg-primary-foreground/70"
        />

        <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1.5 backdrop-blur-sm ring-1 ring-inset ring-primary-foreground/20">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="text-xs font-semibold">Risk rating: High</span>
        </div>

        <p className="mt-4 font-serif text-[15px] leading-[1.75] text-primary-foreground/85">
          &ldquo;&hellip;recovery agents shall not contact the borrower{" "}
          <span className="cite-sweep rounded px-1 py-0.5 text-primary-foreground">
            outside the hours of 8:00 a.m. and 7:00 p.m.
          </span>{" "}
          &hellip;&rdquo;
        </p>

        <div className="mt-3.5 flex items-center gap-1.5 text-[11px] text-primary-foreground/55">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          Verified — this exact span exists in the uploaded circular
        </div>
      </div>
    </figure>
  );
}

function TrustBadge({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="rounded border border-current px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {code}
      </div>
      <span className="mt-1 text-[8px] text-muted-foreground/70">{label}</span>
    </div>
  );
}

/* ---------- inline icons ---------- */

function ShieldMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2.5 4 6v5c0 4.5 3.3 8.5 8 10 4.7-1.5 8-5.5 8-10V6l-8-3.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}
