// Public API of /neural: optional AI adapters — local-GPU mesh generators for organic shapes,
// mesh import, and image sources (kubeez.com) for references and materials. Never required.

export {
  type GenerateRequest,
  importGlb,
  localGenerator,
  type MeshGenerator,
} from './generator.ts';
export { type ImageRequest, type ImageSource, kubeezImages } from './images.ts';
