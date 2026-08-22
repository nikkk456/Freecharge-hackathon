import { NavLink, Route, Routes } from "react-router-dom";
import CircularDetail from "./pages/CircularDetail";
import Circulars from "./pages/Circulars";
import Home from "./pages/Home";

const NAV = [
  { to: "/", label: "Foundation", end: true },
  { to: "/circulars", label: "Circulars", end: false },
];

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-3">
          <NavLink to="/" className="whitespace-nowrap font-semibold">
            🛡️ Compliance Advisory Copilot
          </NavLink>
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
          <span className="whitespace-nowrap text-xs text-gray-400">
            Stage 3 · verified citations
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/circulars" element={<Circulars />} />
          <Route path="/circulars/:id" element={<CircularDetail />} />
        </Routes>
      </main>
    </div>
  );
}
