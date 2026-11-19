// Growable byte buffer the deflate encoder writes bits into, least significant bit first
// (RFC 1951 §3.1.1).

/** Bits go out least significant first; `bits` takes at most 16 at a time. */
export class BitWriter {
  private out: Uint8Array;
  private pos = 0;
  private acc = 0;
  private held = 0;

  constructor(capacity: number) {
    this.out = new Uint8Array(capacity);
  }

  /** Room for `bytes` more bytes, so `bits` and `bytes` never check. */
  reserve(bytes: number): void {
    if (this.pos + bytes <= this.out.length) return;
    const grown = new Uint8Array(Math.max(this.out.length * 2, this.pos + bytes));
    grown.set(this.out.subarray(0, this.pos));
    this.out = grown;
  }

  bits(value: number, count: number): void {
    this.acc |= value << this.held;
    this.held += count;
    while (this.held >= 8) {
      this.out[this.pos++] = this.acc & 255;
      this.acc >>>= 8;
      this.held -= 8;
    }
  }

  /** Pads to a byte boundary with zero bits. */
  align(): void {
    if (this.held > 0) this.bits(0, 8 - this.held);
  }

  bytes(data: Uint8Array): void {
    this.out.set(data, this.pos);
    this.pos += data.length;
  }

  finish(): Uint8Array {
    return this.out.slice(0, this.pos);
  }
}
