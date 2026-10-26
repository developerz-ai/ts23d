// Packs typed arrays into one 4-byte-aligned glTF buffer and records bufferViews + accessors.

export const ARRAY_BUFFER = 34962;
export const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UINT32 = 5125;

export interface Json {
  [key: string]: unknown;
}

export class BinWriter {
  private readonly chunks: Uint8Array[] = [];
  length = 0;
  readonly views: Json[] = [];
  readonly accessors: Json[] = [];

  private push(bytes: Uint8Array, target?: number): number {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) {
      this.chunks.push(new Uint8Array(pad));
      this.length += pad;
    }
    this.views.push({
      buffer: 0,
      byteOffset: this.length,
      byteLength: bytes.byteLength,
      ...(target ? { target } : {}),
    });
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
    return this.views.length - 1;
  }

  accessor(
    data: Float32Array | Uint32Array,
    type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4',
    target?: number,
    bounds = false,
  ): number {
    const view = this.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), target);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const acc: Json = {
      bufferView: view,
      componentType: data instanceof Uint32Array ? UINT32 : FLOAT,
      count: data.length / width,
      type,
    };
    if (bounds) {
      const min = Array<number>(width).fill(Infinity);
      const max = Array<number>(width).fill(-Infinity);
      for (let i = 0; i < data.length; i++) {
        const k = i % width;
        const v = data[i] ?? 0;
        if (v < (min[k] ?? 0)) min[k] = v;
        if (v > (max[k] ?? 0)) max[k] = v;
      }
      acc['min'] = min;
      acc['max'] = max;
    }
    this.accessors.push(acc);
    return this.accessors.length - 1;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.length / 4) * 4);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.byteLength;
    }
    return out;
  }
}
