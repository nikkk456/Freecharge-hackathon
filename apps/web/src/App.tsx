import { NavLink, Route, Routes } from "react-router-dom";
import Audit from "./pages/Audit";
import CircularDetail from "./pages/CircularDetail";
import Circulars from "./pages/Circulars";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Tracker from "./pages/Tracker";
import { AuthProvider, useAuth } from "./lib/auth";

const NAV = [
  { to: "/", label: "Foundation", end: true },
  { to: "/circulars", label: "Circulars", end: false },
  { to: "/tracker", label: "Tracker", end: false },
  { to: "/audit", label: "Audit", end: false },
];

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { user, ready, signOut } = useAuth();

  // Everything behind a sign-in: an approval has to be attributable to a person, and
  // half-authenticated states are how that guarantee quietly gets lost.
  if (!ready) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <NavLink to="/" className="whitespace-nowrap font-semibold">
            🛡️ Compliance Advisory Copilot
          </NavLink>
          {user && (
            <nav className="flex flex-1 gap-1 text-sm">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `rounded px-2.5 py-1 ${
                      isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          {user ? (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-600">
                {user.full_name}
                <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                  {user.role}
                </span>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="text-gray-500 underline hover:text-gray-900"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-xs text-gray-400">Stage 6 · tracker</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
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
