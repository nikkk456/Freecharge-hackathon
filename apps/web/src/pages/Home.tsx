import { useEffect, useMemo, useState } from "react";
import RagBar from "../components/RagBar";
import StatTile from "../components/StatTile";
import StatusChip from "../components/StatusChip";
import { api, type ControlOut, type LibraryStats } from "../lib/api";

type Load = "loading" | "ok" | "error";

// Stage 0 screen: proves the whole stack is live end to end — browser -> API ->
// Postgres -> seeded foundation data. Everything shown here is read from the DB;
// nothing is hard-coded in the frontend.
export default function Home() {
  const [state, setState] = useState<Load>("loading");
  const [error, setError] = useState<string>("");
  const [service, setService] = useState<string>("");
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [controls, setControls] = useState<ControlOut[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([api.health(), api.stats(), api.controls()])
      .then(([health, s, c]) => {
        setService(health.service);
        setStats(s);
        setControls(c);
        setState("ok");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("error");
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return controls;
    return controls.filter((c) =>
      [c.code, c.name, c.description ?? "", c.owner_function?.name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [controls, query]);

  if (state === "loading") {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (state === "error") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-gray-900">Backend not reachable</h1>
        <p className="mt-2 text-sm text-gray-600">
          Start the API and make sure Postgres is up, then reload.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-600">
          {error}
        </pre>
        <p className="mt-3 text-xs text-gray-500">
          <code>docker compose up -d db redis minio</code> · <code>uvicorn app.main:app --reload</code>
          {" · "}
          <code>python -m scripts.seed</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Compliance foundation</h1>
        <p className="mt-1 text-sm text-gray-600">
          The reference data every later stage reads from — connected to{" "}
          <span className="font-medium text-gray-800">{service}</span>.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Functions" value={stats!.functions} hint="Impacted departments" />
        <StatTile label="Controls" value={stats!.controls} hint="Control library" />
        <StatTile label="Key control indicators" value={stats!.kcis} hint="Measured monthly" />
        <StatTile
          label="Circulars"
          value={stats!.circulars}
          hint={stats!.circulars === 0 ? "Upload arrives in Stage 1" : "Ingested"}
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Control health today</h2>
        <p className="mb-4 mt-0.5 text-xs text-gray-500">
          Where the {stats!.kcis} indicators sit against their targets.
        </p>
        <RagBar mix={stats!.kci_status_mix} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Control library</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter controls…"
            aria-label="Filter controls"
            className="w-56 rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-5 py-2.5 font-medium">Code</th>
                <th className="px-5 py-2.5 font-medium">Control</th>
                <th className="px-5 py-2.5 font-medium">Owner function</th>
                <th className="px-5 py-2.5 font-medium">Indicator</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const kci = c.kcis[0];
                return (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="whitespace-nowrap px-5 py-3 font-medium tabular-nums text-gray-500">
                      {c.code}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{c.description}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {c.owner_function ? (
                        <>
                          <span className="tabular-nums text-gray-400">
                            {c.owner_function.code}
                          </span>{" "}
                          {c.owner_function.name}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {kci ? (
                        <>
                          <div>{kci.name}</div>
                          <div className="mt-0.5 text-xs tabular-nums text-gray-500">
                            {kci.current_value} vs {kci.target}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">No KCI</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {kci ? <StatusChip status={kci.status} /> : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-5 py-6 text-sm text-gray-500">No controls match “{query}”.</p>
          )}
        </div>
      </section>
    </div>
  );
}
