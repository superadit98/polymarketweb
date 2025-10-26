type Entry<T> = { v: T; exp: number };

export class TTLCache<T = unknown> {
  private store = new Map<string, Entry<T>>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.exp) {
      this.store.delete(key);
      return undefined;
    }
    return entry.v;
  }

  set(key: string, value: T): void {
    this.store.set(key, { v: value, exp: Date.now() + this.ttlMs });
  }
}
