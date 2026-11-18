// Rendering `review` sheets without a GPU, or without disturbing a busy one. Workbench needs a
// Vulkan or OpenGL driver; Mesa's lavapipe is a Vulkan driver that runs on the CPU. Blender finds
// it by itself on a machine with no GPU; forcing it (`--software-gpu`) keeps a review off a GPU a
// model job is using. Measured on Blender 5.3 with the GPU device nodes hidden: lavapipe installed
// renders; no Vulkan driver at all makes Blender crash (SIGSEGV) instead of reporting an error, so
// the only readable message about that case is the one written here.

import type { ToolExec } from './tool-spawn.ts';
import { failed } from './wire.ts';

/** Where distributions put lavapipe's Vulkan driver manifest. */
export const LAVAPIPE_MANIFESTS = [
  '/usr/share/vulkan/icd.d/lvp_icd.json',
  '/usr/share/vulkan/icd.d/lvp_icd.x86_64.json',
  '/usr/share/vulkan/icd.d/lvp_icd.aarch64.json',
  '/etc/vulkan/icd.d/lvp_icd.json',
] as const;

const INSTALL =
  'install Mesa software Vulkan (lavapipe): apt install mesa-vulkan-drivers · dnf install mesa-vulkan-drivers · pacman -S vulkan-swrast';

/** What to do when Blender died while rendering a review. */
export const REVIEW_CRASH_FIX = `review renders with Workbench, which needs a Vulkan or OpenGL driver, and Blender crashes when it finds none: ${INSTALL}, then run again (add --software-gpu to force it while the GPU is busy)`;

/** True for the way a process that crashed shows up in a T3D_NEURAL_FAILED cause. */
export const looksCrashed = (message: string): boolean =>
  /exited (null|139|134|-11|-6)\b/.test(message);

/** The first lavapipe manifest on this machine, or refuses with how to install one. */
export async function findLavapipe(paths: readonly string[] = LAVAPIPE_MANIFESTS): Promise<string> {
  const { access } = await import('node:fs/promises');
  for (const p of paths) {
    const there = await access(p).then(
      () => true,
      () => false,
    );
    if (there) return p;
  }
  return failed(`no lavapipe Vulkan driver found (looked in ${paths.join(', ')})`, INSTALL);
}

/** Environment that makes the Vulkan loader offer lavapipe alone. */
export const softwareGpuEnv = (manifest: string): Readonly<Record<string, string>> => ({
  VK_DRIVER_FILES: manifest,
  VK_ICD_FILENAMES: manifest,
});

/** Arguments selecting Vulkan; they go before the rest of Blender's command line. */
export const SOFTWARE_GPU_ARGS: readonly string[] = ['--gpu-backend', 'vulkan'];

/** A ToolExec running Blender on lavapipe, through `env`, around any other ToolExec. */
export const softwareGpuExec =
  (base: ToolExec, manifest: string): ToolExec =>
  (exe, args, o) =>
    base(
      'env',
      [
        ...Object.entries(softwareGpuEnv(manifest)).map(([k, v]) => `${k}=${v}`),
        exe,
        ...SOFTWARE_GPU_ARGS,
        ...args,
      ],
      o,
    );
