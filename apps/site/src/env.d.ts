/// <reference types="vite/client" />

declare module 'virtual:ts23d-media' {
  export const MEDIA: readonly import('./media-types.ts').MediaEntry[];
  /** Committed neural records per recipe folder (hybrids), published under media/neural/. */
  export const NEURAL: Readonly<Record<string, readonly import('./media-types.ts').MediaNeural[]>>;
}
