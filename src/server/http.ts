import { setTimeout as delay } from 'node:timers/promises';

import { logger } from '@/lib/log';
import { env } from '@/lib/env';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface FetchJsonOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  source: string;
  endpoint: string;
  attempt?: number;
  wallet?: string;
}

export interface FetchJsonResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_RETRIES = 2;

function redact(value: string | undefined) {
  if (!value) return value;
  if (value.length <= 6) return `${value.slice(0, 1)}***${value.slice(-1)}`;
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

export async function fetchJson<T>(url: string, init: FetchJsonOptions): Promise<FetchJsonResult<T>> {
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT;
  const retries = init.retries ?? DEFAULT_RETRIES;
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { ...init.headers };

  if (!headers['Content-Type'] && init.body) {
    headers['Content-Type'] = 'application/json';
  }

  const attempts = retries + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const started = Date.now();
    const signal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: init.body,
        signal,
      });
      const elapsed = Date.now() - started;
      const text = await response.text();
      let data: T | undefined;
      let parsedError: string | undefined;

      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch (error) {
          parsedError = `Failed to parse JSON: ${(error as Error).message}`;
        }
      }

      logger.debug('[http] request completed', {
        source: init.source,
        endpoint: init.endpoint,
        method,
        status: response.status,
        ms: elapsed,
        attempt: attempt + 1,
        wallet: init.wallet,
      });

      if (response.ok && data !== undefined) {
        return { ok: true, status: response.status, data };
      }

      const errorMessage = parsedError ?? (text || response.statusText || 'Unknown error');
      if (attempt === attempts - 1) {
        return { ok: false, status: response.status, error: errorMessage };
      }

      await delay(2 ** attempt * 100);
    } catch (error) {
      const elapsed = Date.now() - started;
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('[http] request failed', {
        source: init.source,
        endpoint: init.endpoint,
        method,
        ms: elapsed,
        attempt: attempt + 1,
        wallet: init.wallet,
        error: message,
      });
      if (attempt === attempts - 1) {
        return { ok: false, status: 0, error: message };
      }
      await delay(2 ** attempt * 100);
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: 0, error: 'Unknown failure' };
}

export function redactEnv() {
  return {
    nansenApiKey: redact(env.nansenApiKey),
    polySubgraphUrl: env.polySubgraphUrl,
    polyRestBase: env.polyRestBase,
  };
}
