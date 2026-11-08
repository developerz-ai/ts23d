// ISO metric fastener sizes, millimetres → metres: hex bolt head (ISO 4017), hex nut (ISO 4032),
// plain washer (ISO 7089). One table so bolt, nut, washer and flange agree on every size.

export type MetricSize = 'M6' | 'M8' | 'M10' | 'M12' | 'M16' | 'M20' | 'M24';

export interface MetricSpec {
  /** Thread (shank) diameter. */
  readonly d: number;
  /** Hex across flats. */
  readonly s: number;
  /** Bolt head height. */
  readonly k: number;
  /** Nut height. */
  readonly m: number;
  /** Washer outer diameter and thickness. */
  readonly washer: number;
  readonly washerH: number;
}

const mm = (d: number, s: number, k: number, m: number, washer: number, h: number): MetricSpec => ({
  d: d / 1000,
  s: s / 1000,
  k: k / 1000,
  m: m / 1000,
  washer: washer / 1000,
  washerH: h / 1000,
});

export const METRIC: Readonly<Record<MetricSize, MetricSpec>> = {
  M6: mm(6, 10, 4, 5.2, 12, 1.6),
  M8: mm(8, 13, 5.3, 6.8, 16, 1.6),
  M10: mm(10, 16, 6.4, 8.4, 20, 2),
  M12: mm(12, 18, 7.5, 10.8, 24, 2.5),
  M16: mm(16, 24, 10, 14.8, 30, 3),
  M20: mm(20, 30, 12.5, 18, 37, 3),
  M24: mm(24, 36, 15, 21.5, 44, 4),
};

export const METRIC_SIZES: readonly MetricSize[] = ['M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M24'];

/** Hex across corners from across flats. */
export const corners = (s: number): number => s / Math.cos(Math.PI / 6);

export const METRIC_SOURCE = 'ISO 4017 / ISO 4032 / ISO 7089 dimension tables';
