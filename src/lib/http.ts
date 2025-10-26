export async function jfetch(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 12_000, ...rest } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(rest.headers || {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
