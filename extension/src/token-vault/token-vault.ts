import type { PiiCategory } from "../shared/types";

type VaultEntry = Readonly<{ value: string; expiresAt: number }>;

/** In-memory and task-scoped by default. Plaintext entries never enter telemetry or transport. */
export class TokenVault {
  private readonly entries = new Map<string, VaultEntry>();
  private readonly counters = new Map<PiiCategory, number>();
  constructor(private readonly ttlMs = 30 * 60 * 1000) {}
  tokenize(category: PiiCategory, value: string): string {
    for (const [token, entry] of this.entries) if (entry.value === value && entry.expiresAt > Date.now()) return token;
    const count = (this.counters.get(category) ?? 0) + 1;
    this.counters.set(category, count);
    const token = `${category}_${count}_${crypto.randomUUID().slice(0, 8)}`;
    this.entries.set(token, { value, expiresAt: Date.now() + this.ttlMs });
    return token;
  }
  resolve(token: string): string | undefined { const entry = this.entries.get(token); if (!entry || entry.expiresAt <= Date.now()) { this.entries.delete(token); return undefined; } return entry.value; }
  has(token: string): boolean { return this.resolve(token) !== undefined; }
  clear(): void { this.entries.clear(); this.counters.clear(); }
}
