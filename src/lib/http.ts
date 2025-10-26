type FetchOpts = RequestInit & { timeoutMs?: number };

export async function fetchJson<T = any>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { timeoutMs = 15_000, ...init } = opts;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    }
    return data as T;
  } finally {
    clearTimeout(id);
  }
}

