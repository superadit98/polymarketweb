const DEFAULT_TIMEOUT_MS = 10_000;

type FetchOptions = Parameters<typeof fetch>[1] & { timeoutMs?: number };

export async function fetchJson<T>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request to ${url} failed: ${response.status} ${response.statusText} ${text}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`Request to ${url} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
