const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;

export type FetchJsonOptions = (RequestInit & { timeoutMs?: number }) | undefined;

export type FetchJsonSuccess<T> = { ok: true; status: number; data: T };
export type FetchJsonFailure = { ok: false; status?: number; error: string };
export type FetchJsonResult<T> = FetchJsonSuccess<T> | FetchJsonFailure;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<FetchJsonResult<T>> {
  const retries = DEFAULT_RETRIES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const status = response.status;
      const text = await response.text();
      let parsed: unknown = null;

      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          parsed = text;
        }
      }

      if (response.ok) {
        return {
          ok: true,
          status,
          data: (parsed ?? {}) as T,
        };
      }

      const message = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);

      if (attempt < retries) {
        await delay(200 * (attempt + 1));
        continue;
      }

      return {
        ok: false,
        status,
        error: message || `Request failed with status ${status}`,
      };
    } catch (error) {
      if (attempt < retries) {
        await delay(200 * (attempt + 1));
        continue;
      }

      const message =
        error instanceof Error
          ? error.name === 'AbortError'
            ? 'Request timed out'
            : error.message
          : 'Unknown request error';

      return {
        ok: false,
        error: message,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return { ok: false, error: 'Unknown fetch error' };
}
