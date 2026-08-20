import { useEffect, useState } from "react";
import { api } from "../lib/api";

// Placeholder landing page. Its only job is to confirm the React app builds and can
// reach the backend — it pings /health. Build your feature pages from here.
export default function Home() {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    api
      .health()
      .then((h) => setStatus(`API: ${h.status} (${h.service})`))
      .catch(() => setStatus("API not reachable — start the FastAPI backend."));
  }, []);

  return (
    <div className="rounded-lg border bg-white p-6">
      <h1 className="text-xl font-semibold">Project scaffold is ready</h1>
      <p className="mt-2 text-sm text-gray-600">
        This is a clean React + Vite + TypeScript shell. No features are implemented yet —
        add pages under <code>src/pages</code> and API calls in <code>src/lib/api.ts</code>.
      </p>
      <p className="mt-4 inline-block rounded bg-gray-100 px-3 py-1.5 text-sm">{status}</p>
    </div>
  );
}
