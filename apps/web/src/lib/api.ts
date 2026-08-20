// Generic API client scaffold. Add typed feature calls here as you build modules.
// In dev, Vite proxies /api and /health to the FastAPI backend (see vite.config.ts).
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface Health {
  status: string;
  service: string;
}

export const api = {
  health: () => request<Health>("/health"),
};
