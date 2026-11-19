// Gate `connections` (LOD0): stuff is nicely connected to one another — not just within 2 cm.
// Every piece (each shell of each part) reaches the ground or main body over a real contact face;
// grown appendages are rooted and blended; eyes sit in sockets and look one way; sculpts carry no
// unblended seams. Codes T3D_CONNECT_* (docs/architecture/errors.md); errors fail the build,
// warnings (T3D_CONNECT_BURIED) print in the report and on `connectionsOverlay`.

import type { CompiledAsset, ConnectAs, Part } from '../core/index.ts';
import { blanketIssues, honestCreases } from './connections-crease.ts';
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
import { SCULPT_TRIS, seamIssues } from './connections-seam.ts';
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
    ...connectivity(shells, kindOf, asset.medium === 'water').issues,
  ];
  const ok: ConnectOk[] = [];
  const eyes: Eye[] = [];
  for (const [part, d] of declared) {
    const mine = byPart.get(part) ?? [];
    if (mine.length === 0) continue;
    const before = issues.length;
    const main = mine.reduce((m, s) => (s.area > m.area ? s : m));
    const hosts = mine.map((s) =>
      d.as === 'grown' || (d.as === 'socket' && s === main) ? partnerOf(s, shells, d.to) : null,
    );
    const host = hosts[mine.indexOf(main)] ?? hosts.find((h) => h) ?? null;
    const alone = !shells.some((c) => c.part !== part && c.area > 1e-9);
    if ((d.as === 'grown' || d.as === 'socket') && !host && !alone)
      issues.push(unheld(part, d, main, shells));
    if (d.as === 'grown')
      mine.forEach((s, i) => {
        issues.push(...grownIssues(s, shells, d.to, hosts[i] ?? null));
      });
    if (d.as === 'socket' && host) {
      if (EYE.test(part) && host.shell.solid) {
        const r = eyeIssues(part, mine, host.shell, shells);
        eyes.push(r.eye);
        issues.push(...r.issues);
      } else if (host.patch.buried < SOCKET_SHARE * main.area)
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
    if ((d.as === 'grown' || d.as === 'socket') && host && issues.length === before)
      ok.push({
        part,
        to: host.shell.part,
        at: host.patch.at ?? main.centroid,
        radius: Math.sqrt(main.area) / 2,
      });
  }
  issues.push(...gazeIssues(eyes, asset.kind === 'character'));
  issues.push(...blanketIssues(asset, shells, SCULPT_TRIS));
  const creases = honestCreases(asset.creases ?? [], shells, SCULPT_TRIS);
  for (const [part, d] of declared)
    if ((ORGANIC_KINDS.has(asset.kind) && !EYE.test(part)) || d.as === 'grown')
      for (const s of byPart.get(part) ?? []) issues.push(...seamIssues(s, creases, shells));
  return { issues, ok };
}

/** A grown or socket part with nothing to grow from or sit in: no piece of it touches the
 *  declared `to` (or, undeclared, any other part). */
function unheld(part: string, d: Declared, main: Shell, shells: readonly Shell[]): ConnectIssue {
  const how = d.as === 'socket' ? 'sits in a socket' : 'grows from its parent';
  const says = d.declared ? `declares it ${how}` : `${how} (by its name)`;
  const want = d.to ? `'${d.to}'` : 'any other part';
  const real = d.to ? partnerOf(main, shells, null)?.shell.part : undefined;
  return {
    code: d.as === 'socket' ? 'T3D_CONNECT_SOCKET' : 'T3D_CONNECT_ISLAND',
    severity: 'error',
    part,
    at: main.centroid,
    radius: Math.sqrt(main.area) / 2,
    message: `'${part}' ${says}, but no piece of it reaches ${want}${real ? ` (it touches '${real}')` : ''}`,
    fix: `move its root into ${d.to ? `'${d.to}'` : 'the part that holds it'}, or correct connect: { as, to } to how it is really held${real ? ` (to: '${real}')` : ''}`,
  };
}

function invalid(asset: CompiledAsset, declared: ReadonlyMap<string, Declared>): ConnectIssue[] {
  const names = asset.parts.map((p) => p.name);
  const issue = (part: string, message: string): ConnectIssue => ({
    code: 'T3D_CONNECT_INVALID',
    severity: 'error',
    part,
    at: [0, 0, 0],
    radius: 0,
    message,
    fix: 'name another existing part (globs allowed; ctx.use prefixes are added for you)',
  });
  return [...declared].flatMap(([part, d]) => {
    if (d.to === null) return [];
    const hits = names.filter((n) => glob(d.to ?? '').test(n));
    if (hits.length === 0)
      return [issue(part, `'${part}' declares connect.to '${d.to}', which matches no part`)];
    // A part cannot hold itself: `to` must reach some other part.
    return hits.every((n) => n === part)
      ? [issue(part, `'${part}' declares connect.to '${d.to}', which names only the part itself`)]
      : [];
  });
}

/** Errors as gate findings, a few per (code, part) and a count for the rest. */
export function connectionFindings(report: ConnectionReport): Finding[] {
  const seen = new Map<string, { code: string; part: string; n: number }>();
  const out: Finding[] = [];
  for (const i of report.issues) {
    if (i.severity !== 'error') continue;
    const key = `${i.code}:${i.part}`;
    const s = seen.get(key) ?? { code: i.code, part: i.part, n: 0 };
    s.n++;
    seen.set(key, s);
    if (s.n <= PER_PART)
      out.push({
        gate: 'connections',
        code: i.code,
        part: i.part,
        message: `${i.code}: ${i.message}`,
        fix: i.fix,
      });
  }
  for (const { code, part, n } of seen.values())
    if (n > PER_PART)
      out.push({
        gate: 'connections',
        code,
        ...(part ? { part } : {}),
        message: `${code}: …and ${n - PER_PART} more like it on '${part}'`,
        fix: 'see `connectionsOverlay` (t3d connections) for every location',
      });
  return out;
}

/** The gate: LOD0 only (far LODs drop the detail that connects). */
export const connections: Gate = (asset) =>
  asset.lod === 0 ? connectionFindings(connectionReport(asset)) : [];
