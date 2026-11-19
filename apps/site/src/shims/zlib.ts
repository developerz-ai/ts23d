// Browser stand-in for node:zlib. The library uses it to decode PNG images (stamped cells in
// `material/paint`, model outputs in `neural`); PNG encoding is the library's own deflate and needs
// none. The site calls neither decode path, so the stubs exist so the imports resolve, and fail
// loudly if hit.

const unavailable = (fn: string): never => {
  throw new Error(`${fn} is not available in the browser build of the ts23d site`);
};

export function deflateSync(_data: Uint8Array): Uint8Array {
  return unavailable('deflateSync');
}

export function inflateSync(_data: Uint8Array): Uint8Array {
  return unavailable('inflateSync');
}
