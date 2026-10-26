// Browser stand-in for node:zlib. The library uses it to encode contact-sheet PNGs (`/render`) and
// to decode stamped PNG images (`material/paint`). The site uses neither path, so both are
// tree-shaken out or never called; the stubs exist so the imports resolve, and fail loudly if hit.

const unavailable = (fn: string): never => {
  throw new Error(`${fn} is not available in the browser build of the ts23d site`);
};

export function deflateSync(_data: Uint8Array): Uint8Array {
  return unavailable('deflateSync');
}

export function inflateSync(_data: Uint8Array): Uint8Array {
  return unavailable('inflateSync');
}
