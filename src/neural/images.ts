// Image sources for the material generator and the agent loop: reference/concept images, decals,
// texture source photos. kubeez.com is the recommended hosted source; any function returning PNG
// bytes fits. Results are cached by (source, prompt, seed) like generated meshes. Planned: M5.

import { notImplemented } from '../core/index.ts';

export interface ImageRequest {
  readonly prompt: string;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** e.g. 'decal', 'tileable', 'reference', 'concept'. */
  readonly purpose: 'decal' | 'tileable' | 'reference' | 'concept';
}

export interface ImageSource {
  readonly name: string;
  generate(request: ImageRequest): Promise<Uint8Array>;
}

/** kubeez.com image generation. Reads the key from the caller, never from ambient env. */
export function kubeezImages(_o: { apiKey: string; model?: string }): ImageSource {
  return notImplemented(
    'kubeezImages (kubeez.com image source)',
    'docs/idea/08-neural-adapters.md',
  );
}
