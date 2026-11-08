// Roadster V10 key dimensions (metres, Z up, +X front, origin = mid-wheelbase on the ground,
// +Y = left). Every number is from the dossier (README.md): class envelope, ISO tyre codes,
// engineering references. Derived values are computed here, never retyped elsewhere.

// ---------------------------------------------------------------- overall
export const LENGTH = 4.46;
export const BODY_WIDTH = 1.94;
export const HEIGHT = 1.235;
export const WHEELBASE = 2.51;
export const TRACK_F = 1.55;
export const TRACK_R = 1.56;

export const X_FA = WHEELBASE / 2; // front axle
export const X_RA = -WHEELBASE / 2; // rear axle
export const X_NOSE = 2.225;
export const X_TAIL = X_NOSE - LENGTH; // -2.235

// ---------------------------------------------------------------- tyres (ISO metric codes)
/** 295/30 ZR18: rim 18 in, sidewall 30 % of 295 mm. */
export const TYRE_F = { width: 0.295, rim: (18 * 0.0254) / 2, side: 0.295 * 0.3 };
/** 355/30 ZR19. */
export const TYRE_R = { width: 0.355, rim: (19 * 0.0254) / 2, side: 0.355 * 0.3 };
export const R_F = TYRE_F.rim + TYRE_F.side; // 0.3171
export const R_R = TYRE_R.rim + TYRE_R.side; // 0.3478
/** Static loaded radius ≈ 97 % of free radius (the contact patch flattens it). */
export const Z_FA = R_F * 0.985;
export const Z_RA = R_R * 0.985;
export const Y_WF = TRACK_F / 2;
export const Y_WR = TRACK_R / 2;

// ---------------------------------------------------------------- body landmarks
export const RIDE = 0.12; // rocker / floor pan underside
export const X_COWL = 0.34; // windscreen base at the centre line
export const Z_COWL = 0.905;
export const X_SCREEN_TOP = -0.27;
export const Z_SCREEN_TOP = HEIGHT;
export const X_COCKPIT_REAR = -0.9;
export const X_DOOR_FRONT = 0.3;
export const X_DOOR_REAR = -0.78;
export const Z_BELT = 0.855;
export const X_FIREWALL = 0.42;
export const ARCH_F = R_F + 0.026;
export const ARCH_R = R_R + 0.026;

// ---------------------------------------------------------------- engine (8.4 L class, 90° V10)
export const BORE = 0.103;
export const STROKE = 0.1006;
export const BANK = (45 * Math.PI) / 180; // each bank 45° off vertical
export const BORE_PITCH = 0.1194; // cylinder centre spacing along the crank
export const X_CRANK_FRONT = 1.27; // crank nose (front of block)
export const Z_CRANK = 0.35;
export const DECK = 0.235; // crank axis to head deck along the bank
