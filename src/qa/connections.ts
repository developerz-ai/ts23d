// Gate `connections` (LOD0): stuff is nicely connected to one another — not just within 2 cm.
// Every piece (each shell of each part) reaches the ground or main body over a real contact face;
// grown appendages are rooted and blended; eyes sit in sockets and look one way; sculpts carry no
// unblended seams. Codes T3D_CONNECT_* (docs/architecture/errors.md); errors fail the build,
// warnings (T3D_CONNECT_BURIED) print in the report and on `connectionsOverlay`.

import type { CompiledAsset, ConnectAs, Part } from '../core/index.ts';
import {
  type ConnectIssue,
  type ConnectOk,
  connectionOf,
  type Declared,
  EYE,
  ORGANIC_KINDS,
} from './connections-declare.ts';
import { type Eye, eyeIssues, gazeIssues } from './connections-eyes.ts';
import { connectivity } from './connections-graph.ts';
import { grownIssues } from './connections-grown.ts';
import { partnerOf } from './connections-partner.ts';
import { seamIssues } from './connections-seam.ts';
import { assetShells, type Shell } from './connections-shells.ts';
import { glob } from './inspect.ts';
import type { Finding, Gate } from './types.ts';

export interface ConnectionReport {
  readonly issues: readonly ConnectIssue[];
  readonly ok: readonly ConnectOk[];
}

/** Findings per (code, part) before the rest are summarised. */
const PER_PART = 4;
/** Share of a generic socket that must sit inside what holds it. */
const SOCKET_SHARE = 0.25;

const cache = new WeakMap<readonly Part[], ConnectionReport>();

/** The full connection report (errors, warnings and passing joints), cached per compile. */
export function connectionReport(asset: CompiledAsset): ConnectionReport {
  const hit = cache.get(asset.parts);
  if (hit) return hit;
  const made = analyse(asset);
  cache.set(asset.parts, made);
  return made;
}

function analyse(asset: CompiledAsset): ConnectionReport {
  const shells = assetShells(asset);
  const declared = new Map<string, Declared>(
    asset.parts.map((p) => [p.name, connectionOf(asset, p)]),
  );
  const kindOf = (part: string): ConnectAs => declared.get(part)?.as ?? 'welded';
  const byPart = new Map<string, Shell[]>();
  for (const s of shells) if (s.area > 1e-9) byPart.set(s.part, [...(byPart.get(s.part) ?? []), s]);
  const issues: ConnectIssue[] = [
    ...invalid(asset, declared),
    ...connectivity(shells, kindOf).issues,
  ];
  const ok: ConnectOk[] = [];
  const eyes: Eye[] = [];
  for (const [part, d] of declared) {
    const mine = byPart.get(part) ?? [];
    if (mine.length === 0) continue;
    const before = issues.length;
    if (d.as === 'grown') for (const s of mine) issues.push(...grownIssues(s, shells, d.to));
    if (d.as === 'socket') {
      const main = mine.reduce((m, s) => (s.area > m.area ? s : m));
      const host = partnerOf(main, shells, d.to);
      if (host && EYE.test(part) && host.shell.solid) {
        const r = eyeIssues(part, mine, host.shell, shells);
        eyes.push(r.eye);
        issues.push(...r.issues);
      } else if (host && host.patch.buried < SOCKET_SHARE * main.area)
        issues.push({
          code: 'T3D_CONNECT_SOCKET',
          severity: 'error',
          part,
          at: host.patch.at ?? main.centroid,
          radius: Math.sqrt(main.area) / 2,
          message: `'${part}' is only ${((host.patch.buried / main.area) * 100).toFixed(0)}% seated in '${host.shell.part}' (socket needs ≥ ${SOCKET_SHARE * 100}%)`,
          fix: `sink it deeper into '${host.shell.part}' or declare it welded / rest`,
        });
    }
    if ((d.as === 'grown' || d.as === 'socket') && issues.length === before) {
      const main = mine.reduce((m, s) => (s.area > m.area ? s : m));
      const host = partnerOf(main, shells, d.to);
      if (host)
        ok.push({
          part,
          to: host.shell.part,
          at: host.patch.at ?? main.centroid,
          radius: Math.sqrt(main.area) / 2,
        });
    }
  }
  issues.push(...gazeIssues(eyes, asset.kind === 'character'));
  for (const [part, d] of declared)
    if ((ORGANIC_KINDS.has(asset.kind) && !EYE.test(part)) || d.as === 'grown')
      for (const s of byPart.get(part) ?? [])
        issues.push(...seamIssues(s, asset.creases ?? [], shells));
  return { issues, ok };
}

function invalid(asset: CompiledAsset, declared: ReadonlyMap<string, Declared>): ConnectIssue[] {
  const names = asset.parts.map((p) => p.name);
  return [...declared]
    .filter(([, d]) => d.to !== null && !names.some((n) => glob(d.to ?? '').test(n)))
    .map(([part, d]) => ({
      code: 'T3D_CONNECT_INVALID',
      severity: 'error',
      part,
      at: [0, 0, 0],
      radius: 0,
      message: `'${part}' declares connect.to '${d.to}', which matches no part`,
      fix: 'name an existing part (globs allowed; ctx.use prefixes are added for you)',
    }));
}

/** Errors as gate findings, a few per (code, part) and a count for the rest. */
export function connectionFindings(report: ConnectionReport): Finding[] {
  const seen = new Map<string, number>();
  const out: Finding[] = [];
  for (const i of report.issues) {
    if (i.severity !== 'error') continue;
    const key = `${i.code}:${i.part}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n <= PER_PART)
      out.push({
        gate: 'connections',
        part: i.part,
        message: `${i.code}: ${i.message}`,
        fix: i.fix,
      });
  }
  for (const [key, n] of seen)
    if (n > PER_PART) {
      const [code, part] = key.split(':');
      out.push({
        gate: 'connections',
        ...(part ? { part } : {}),
        message: `${code}: …and ${n - PER_PART} more like it on '${part}'`,
        fix: 'see `connectionsOverlay` (t3d connections) for every location',
      });
    }
  return out;
}

/** The gate: LOD0 only (far LODs drop the detail that connects). */
export const connections: Gate = (asset) =>
  asset.lod === 0 ? connectionFindings(connectionReport(asset)) : [];
