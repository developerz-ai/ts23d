// The parts kit: every shared part, and the catalogue rows describing them. Search here (or the
// generated README.md) before writing geometry: a bolt, hinge or railing is already defined.

import { type AnyPart, catalogueOf, type PartInfo } from '@developerz.ai/ts23d';
import { barrel } from './barrel.ts';
import { casement_window } from './casement_window.ts';
import { chain } from './chain.ts';
import { crate } from './crate.ts';
import { door_handle } from './door_handle.ts';
import { flange } from './flange.ts';
import { hex_bolt } from './hex_bolt.ts';
import { hex_nut } from './hex_nut.ts';
import { hinge } from './hinge.ts';
import { ladder } from './ladder.ts';
import { lamp } from './lamp.ts';
import { panel_door } from './panel_door.ts';
import { pipe } from './pipe.ts';
import { railing } from './railing.ts';
import { rivet_row } from './rivet_row.ts';
import { seat } from './seat.ts';
import { spring } from './spring.ts';
import { steel_beam } from './steel_beam.ts';
import { valve_wheel } from './valve_wheel.ts';
import { washer } from './washer.ts';
import { wheel } from './wheel.ts';

export { METRIC, METRIC_SIZES, type MetricSize } from './metric.ts';
export {
  barrel,
  casement_window,
  chain,
  crate,
  door_handle,
  flange,
  hex_bolt,
  hex_nut,
  hinge,
  ladder,
  lamp,
  panel_door,
  pipe,
  railing,
  rivet_row,
  seat,
  spring,
  steel_beam,
  valve_wheel,
  washer,
  wheel,
};

/** Every part in the kit, sorted by name. */
export const PARTS: readonly AnyPart[] = [
  barrel,
  casement_window,
  chain,
  crate,
  door_handle,
  flange,
  hex_bolt,
  hex_nut,
  hinge,
  ladder,
  lamp,
  panel_door,
  pipe,
  railing,
  rivet_row,
  seat,
  spring,
  steel_beam,
  valve_wheel,
  washer,
  wheel,
];

/** Catalogue rows (name, description, tags, params with defaults), sorted by name. */
export const catalogue = (): PartInfo[] => catalogueOf(PARTS);
