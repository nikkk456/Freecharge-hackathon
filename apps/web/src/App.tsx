import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { cn } from "@/lib/utils";
import Audit from "@/pages/Audit";
import CircularDetail from "@/pages/CircularDetail";
import Circulars from "@/pages/Circulars";
import Foundation from "@/pages/Foundation";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Tracker from "@/pages/Tracker";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/foundation", label: "Foundation", end: false },
  { to: "/circulars", label: "Circulars", end: false },
  { to: "/tracker", label: "Tracker", end: false },
  { to: "/audit", label: "Audit", end: false },
];

/** The circular workspace is a two-pane reading surface and needs the whole window;
 *  every other screen is a reading column. The pane heights in CircularDetail are
 *  computed against the header's `h-14`, so that height is load-bearing — changing
 *  it here means changing the calc() there. */
const WIDE_ROUTE = /^\/circulars\/[^/]+$/;

/** The home page is a walkthrough rather than a reading column: its stage sits beside
 *  a rail, and at the 5xl the rest of the app uses, one of the two has to give. It
 *  gets a little more room and nothing else changes. */
const LANDING_ROUTE = /^\/$/;

/** First letters of the first two words — "Ravi Reviewer" → "RR". */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Who is signed in, and what they are allowed to do.
 *
 * The role was a filled pill sitting beside the name, which made it read as a second
 * control in a row of controls — you could believe it was a toggle for switching role.
 * It is not interactive and never can be: a reviewer cannot promote themselves, and the
 * whole approval chain rests on that.
 *
 * So it is written as a caption under the name instead — typographic hierarchy rather
 * than a chip. Identity on top, authority beneath it, the shape every account menu in
 * the world uses, and nothing in it looks pressable except the one thing that is. The
 * role is spelled out in words with no colour carrying meaning, so it survives both
 * themes and does not borrow the status palette, which is reserved for health.
 *
 * Geometry and surface deliberately mirror `ThemeToggle` — same `rounded-md`, same
 * `bg-muted/60` tray, same `size-6` inset button — because they sit side by side and
 * two neighbours in different shapes read as an accident.
 */
function UserChip({
  user,
  onSignOut,
}: {
  user: { full_name: string; role: string };
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/60 p-0.5">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded bg-brand-surface-strong text-2xs font-semibold leading-none text-brand"
      >
        {initialsOf(user.full_name)}
      </span>

      <div className="hidden min-w-0 flex-col justify-center pr-1 leading-none sm:flex">
        <span className="truncate text-xs font-medium text-foreground">{user.full_name}</span>
        <span className="mt-0.5 truncate text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {user.role}
        </span>
      </div>

      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

      <button
        type="button"
        onClick={onSignOut}
        title="Sign out"
        aria-label="Sign out"
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors",
          "hover:bg-card hover:text-destructive hover:shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        )}
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Shell />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const { user, ready, signOut } = useAuth();
  const { pathname } = useLocation();
  const wide = WIDE_ROUTE.test(pathname);
  const landing = LANDING_ROUTE.test(pathname);

  // The home page is the one public surface. Everything that reads or writes a
  // circular, an analysis or an obligation is still behind the sign-in, because an
  // approval has to be attributable to a person and half-authenticated states are how
  // that guarantee quietly gets lost. The landing page touches none of that — it
  // describes the product and pings /health, which is public anyway — so gating it
  // bought no safety and cost every visitor the explanation of what they are looking at.
  if (!ready) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-10">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {(user || landing) && (
        <header className="sticky top-0 z-40 h-14 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
          <div
            className={cn(
              "mx-auto flex h-full items-center justify-between gap-4 px-6",
              wide && "max-w-[1800px]",
              !wide && (landing ? "max-w-6xl" : "max-w-5xl"),
            )}
          >
            <NavLink
              to="/"
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm text-sm font-semibold tracking-tight text-foreground"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-brand text-primary-foreground">
                <ShieldCheck className="size-[15px]" strokeWidth={2.4} />
              </span>
              <span className="hidden sm:inline">RegVisor</span>
              <span className="sm:hidden">RV</span>
            </NavLink>

            {user && (
              <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto text-sm">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "relative whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors",
                        isActive
                          ? "bg-brand-surface text-brand"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}

            <div className="flex shrink-0 items-center gap-3">
              <ThemeToggle />
              {user ? (
                <UserChip user={user} onSignOut={signOut} />
              ) : (
                // No nav is rendered for a visitor, because every entry in it is
                // gated — a row of links that all lead to the same login form reads
                // as a broken menu rather than as a locked door.
                <Button asChild size="sm">
                  <Link to="/login">
                    <LogIn className="size-3.5" />
                    Sign in
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </header>
      )}

      <main
        className={cn(
          "mx-auto w-full px-6 py-4",
          wide && "max-w-[1800px]",
          !wide && (landing ? "max-w-6xl py-8" : "max-w-5xl py-8"),
        )}
      >
        {user ? (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/foundation" element={<Foundation />} />
            <Route path="/circulars" element={<Circulars />} />
            <Route path="/circulars/:id" element={<CircularDetail />} />
            <Route path="/tracker" element={<Tracker />} />
            <Route path="/audit" element={<Audit />} />
            {/* Someone who signs in from /login must not be left staring at a route
                that no longer exists for them. */}
            <Route path="/login" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            {/* Every other path — /login included — is the sign-in form, rendered in
                place rather than redirected to, so the address the visitor asked for
                survives and they can be returned to it later. */}
            <Route path="*" element={<Login />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
