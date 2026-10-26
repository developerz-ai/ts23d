// Minimal types for the dev-only Khronos validator (it ships none).
declare module 'gltf-validator' {
  export function validateBytes(
    data: Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<{
    issues: {
      numErrors: number;
      numWarnings: number;
      messages: { severity: number; code: string; pointer?: string; message: string }[];
    };
  }>;
}
