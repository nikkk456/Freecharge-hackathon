import { ShieldCheck, LogOut } from "lucide-react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { cn } from "@/lib/utils";
import Audit from "@/pages/Audit";
import CircularDetail from "@/pages/CircularDetail";
import Circulars from "@/pages/Circulars";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Tracker from "@/pages/Tracker";

const NAV = [
  { to: "/", label: "Foundation", end: true },
  { to: "/circulars", label: "Circulars", end: false },
  { to: "/tracker", label: "Tracker", end: false },
  { to: "/audit", label: "Audit", end: false },
];

/** The circular workspace is a two-pane reading surface and needs the whole window;
 *  every other screen is a reading column. The pane heights in CircularDetail are
 *  computed against the header's `h-14`, so that height is load-bearing — changing
 *  it here means changing the calc() there. */
const WIDE_ROUTE = /^\/circulars\/[^/]+$/;

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

  // Everything behind a sign-in: an approval has to be attributable to a person, and
  // half-authenticated states are how that guarantee quietly gets lost.
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
      {user && (
        <header className="sticky top-0 z-40 h-14 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
          <div
            className={cn(
              "mx-auto flex h-full items-center justify-between gap-4 px-6",
              wide ? "max-w-[1800px]" : "max-w-5xl",
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
              {/* {user && (
              <div className="flex items-center gap-2.5 text-xs">
                <span className="hidden items-center gap-1.5 text-muted-foreground sm:flex">
                  <span className="font-medium text-foreground">
                    {user.full_name}
                  </span>
                  <span className="rounded bg-brand-surface px-1.5 py-0.5 font-medium capitalize text-brand">
                    {user.role}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-sm text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-brand hover:decoration-brand"
                >
                  Sign out
                </button>
              </div>
            )} */}
              {user && (
                <div className="flex items-center gap-2 rounded-full border border-border bg-muted/60 p-1 pl-3 text-xs shadow-sm">
                  {/* User Profile Info */}
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">
                      {user.full_name}
                    </span>

                    {/* Role Badge - Tinted to match brand purple theme */}
                    <span className="rounded-full bg-purple-100/70 px-2 py-0.5 text-[11px] font-semibold text-purple-800 capitalize">
                      {user.role}
                    </span>
                  </div>

                  {/* Subtle Divider */}
                  <div className="hidden sm:inline h-4 w-[1px] bg-slate-200 mx-0.5" />

                  {/* Integrated Sign Out Button */}
                  <button
                    type="button"
                    onClick={signOut}
                    title="Sign out"
                    aria-label="Sign out"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-brand-surface hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <main
        className={cn(
          "mx-auto w-full px-6 py-4",
          wide ? "max-w-[1800px]" : "max-w-5xl py-8",
        )}
      >
        {user ? (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/circulars" element={<Circulars />} />
            <Route path="/circulars/:id" element={<CircularDetail />} />
            <Route path="/tracker" element={<Tracker />} />
            <Route path="/audit" element={<Audit />} />
          </Routes>
        ) : (
          <Login />
        )}
      </main>
    </div>
  );
}
