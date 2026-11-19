// Test preload: seal ambient entropy. A recipe or module that reaches for Math.random fails its
// test here instead of shipping non-deterministic bytes. Use ctx.rng / createRng(seed).

Math.random = () => {
  throw new Error(
    'T3D_AMBIENT_RANDOM: Math.random is sealed in tests — use ctx.rng or createRng(seed)',
  );
};

// Tests never wait in the machine's resource queue (src/cli/queue): a test that calls the CLI
// in-process must not block behind another agent's render. Queue tests set their own mode.
process.env['T3D_QUEUE'] ??= 'off';
