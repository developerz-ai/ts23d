// American 4-4-0 "Jupiter" (Schenectady 1868, Central Pacific No. 60) as the 1979 operating replica
// at Golden Spike NHP in its 1994+ Caledonian-blue / vermilion / gold livery: 5 ft 4 in (1.626 m)
// drivers, 16 × 24 in cylinders, 1.435 m gauge; engine + tender ≈ 17.4 m × 2.8 m × 4.6 m (overall
// box estimated from photos, drivers as ruler). A family over the Whyte arrangement: the frame,
// boiler and rods are laid out from it. Surfaces use the material library: Russia-iron jacket,
// brass domes / cylinders / bands, graphite smokebox and stack, painted wood cab and pilot,
// painted iron tender, polished steel rods, weathered ties. Dossier: ./README.md.

import { clear, defineFamily, noOverlap, touches } from '@developerz.ai/ts23d';
import { buildBoiler } from './boiler.ts';
import { buildCab } from './cab.ts';
import { buildBoards, buildHeadlamp, buildPilot, buildPipework } from './fittings.ts';
import { buildFrame, buildRods, buildSplashers, gearOf } from './running-gear.ts';
import { GAUGE, HEAD, layoutOf, mirrored, whenBuilt } from './shared.ts';
import { buildTender } from './tender.ts';
import { buildTrack } from './track.ts';

interface Params {
  /** Whyte notation; the frame, boiler and rods are laid out from it. */
  readonly arrangement: string;
  readonly number: string;
  readonly name: string;
}

const WIKI = 'https://en.wikipedia.org/wiki/Jupiter_(locomotive)';

const americanFamily = defineFamily<Params>({
  kind: 'vehicle',
  tags: ['rail', 'steam', '19th-century'],
  sources: [
    `${WIKI} (Schenectady 1868, 4-4-0, 5 ft 4 in drivers, 16 × 24 in cylinders, standard gauge; replica O'Connor 1979)`,
    'https://utahrails.net/utahrails/promontory-locomotives.php (1994 repaint from 1868-69 newspaper descriptions; "Pepsi" blue refined to Caledonian blue)',
    'https://home.nps.gov/gosp/learn/historyculture/horse-of-a-different-color.htm (1869: "gleaming in blue and crimson with gold")',
    'https://commons.wikimedia.org/wiki/File:Replica_of_Central_Pacific_Railroad_-_60_steam_locomotive_(4-4-0)_(Golden_Spike_National_Historic_Site,_Utah,_USA)_1_(22825879887).jpg (side 3/4)',
    'https://commons.wikimedia.org/wiki/File:Central_Pacific_Jupiter_01.jpg (front)',
    'https://commons.wikimedia.org/wiki/File:Replica_of_Central_Pacific_Railroad_-_60_steam_locomotive%27s_tender_(Golden_Spike_National_Historic_Site,_Utah,_USA)_(23219999275).jpg (tender side)',
    'https://en.wikipedia.org/wiki/4-4-0 (American type: 2-axle lead truck, 2 coupled axles)',
    'https://en.wikipedia.org/wiki/Standard-gauge_railway (1435 mm)',
  ],
  real: {
    length: 17.4,
    width: 2.8,
    height: 4.6,
    tolerance: 0.05,
    measures: [
      {
        label: 'driver diameter (5 ft 4 in)',
        axis: 'z',
        value: 1.626,
        parts: ['axle_driver_0_wheel_l'],
        source: WIKI,
      },
      {
        label: 'lead truck wheel diameter (30 in, typical; not in the Jupiter infobox)',
        axis: 'z',
        value: 0.762,
        parts: ['axle_lead_0_wheel_l'],
      },
      {
        label: 'rail centres (1435 mm gauge + 72 mm head)',
        axis: 'y',
        value: GAUGE + HEAD,
        between: ['track_rail_l', 'track_rail_r'],
        source: 'https://en.wikipedia.org/wiki/Standard-gauge_railway',
      },
      {
        label: 'driver wheelbase (8 ft, estimated from the reference photo)',
        axis: 'x',
        value: 2.44,
        between: ['axle_driver_0_wheel_l', 'axle_driver_1_wheel_l'],
      },
      {
        label: 'boiler barrel diameter (49 in, typical)',
        axis: 'y',
        value: 1.24,
        parts: ['boiler_barrel'],
      },
      {
        label: 'funnel stack height (estimated from the reference photo)',
        axis: 'z',
        value: 1.6,
        parts: ['stack'],
      },
    ],
  },
  // Measured 46.0k / 18.0k / 1.4k: sixteen wheels, a 17 m tender + track, riveted smokebox and
  // tender at LOD0; LOD1 keeps every wheel spoked and the rods; LOD2 is the silhouette.
  budget: { triangles: [54000, 20000, 1650] },
  checks: [
    clear('axle_*', 'boiler*'),
    clear('cab', 'boiler*'),
    noOverlap('axle_driver_*_wheel_l'),
    touches('boiler_barrel', 'frame'),
    touches('cab', 'frame'),
    whenBuilt('crosshead_l', touches('crosshead_l', 'guides')),
    mirrored,
  ],
  defaults: { arrangement: '4-4-0', number: '60', name: 'JUPITER' },
  build(ctx, p) {
    const L = layoutOf(ctx, p.arrangement);
    buildTrack(ctx, L);

    ctx.group('locomotive');
    const gear = gearOf(ctx);
    buildFrame(ctx, L);
    L.leads.forEach((a, i) => {
      gear.wheelset(`axle_lead_${i}`, a.x, a.radius, 'locomotive', null, 0, ['lead_truck']);
    });
    L.drivers.forEach((a, i) => {
      gear.wheelset(`axle_driver_${i}`, a.x, a.radius, 'locomotive', 0, ctx.pick([16, 8, 0]), [
        'frame',
        'rod_side_l',
        'rod_side_r',
        'rod_main_l',
        'rod_main_r',
      ]);
    });
    buildRods(ctx, L, gear);
    buildSplashers(ctx, L);
    buildBoiler(ctx, L, p.number);
    buildHeadlamp(ctx, L);
    buildBoards(ctx, L);
    buildPilot(ctx, L);
    buildPipework(ctx, L);
    buildCab(ctx, L, p.name);

    buildTender(ctx, L, gear, p.name);
  },
});

/** American 4-4-0 in Jupiter colours. */
export const loco_440 = americanFamily.variant({
  name: 'loco_440',
  description:
    'Central Pacific No. 60 "Jupiter" 4-4-0 (1979 Golden Spike replica): balloon stack, brass steam dome and cylinders, Russia-iron boiler, box headlamp, blue slatted pilot, red spoked drivers with polished rods, lettered tender, track',
});
