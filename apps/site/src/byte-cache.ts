// A promise cache bounded by bytes: the gallery's painted trim sheets (12 MiB at 1024², 48 MiB at
// 2048²) are cached per asset, LOD and size, and a visitor browsing many assets must not keep every
// one of them. Least recently asked first out; the newest entry always stays. A failed promise is
// dropped so the next ask tries again. An evicted value lives on while a viewer still holds it.

interface Entry<V> {
  readonly value: Promise<V>;
  bytes: number;
}

export class ByteCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private total = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly sizeOf: (value: V) => number,
  ) {}

  /** The cached promise for `key`, or `make()`'s, remembered until evicted or rejected. */
  get(key: string, make: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value;
    }
    const entry: Entry<V> = { value: make(), bytes: 0 };
    this.entries.set(key, entry);
    entry.value.then(
      (v) => {
        if (this.entries.get(key) !== entry) return;
        entry.bytes = this.sizeOf(v);
        this.total += entry.bytes;
        this.evict();
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    return entry.value;
  }

  /** Keys held now, oldest first (tests, diagnostics). */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  private evict(): void {
    for (const [key, e] of this.entries) {
      if (this.total <= this.maxBytes || this.entries.size <= 1) return;
      this.entries.delete(key);
      this.total -= e.bytes;
    }
  }
}
