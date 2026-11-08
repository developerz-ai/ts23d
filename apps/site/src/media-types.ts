// The committed media of one asset (`recipes/<folder>/out/<asset>/`), as the media plugin exposes
// it to the page. `MediaEntry` is the light part bundled with the page (cards, badges, LOD
// policy); `MediaFacts` is the rest, fetched per asset page from `media/<name>/facts.json`.
// Types only; shared with the plugin.

export interface MediaMeasure {
  readonly label: string;
  readonly spec: number;
  readonly measured: number | null;
  readonly source?: string;
}

export interface MediaEntry {
  /** Asset name, e.g. `t34_1941`. */
  readonly name: string;
  /** Folder under recipes/, e.g. `t34` (one folder may export several assets). */
  readonly folder: string;
  readonly kind: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly triangles: readonly number[];
  readonly drawCalls: readonly number[];
  readonly pivots: number;
  readonly moving: number;
  readonly emitters: number;
  readonly sockets: number;
  readonly surfaces: readonly string[];
  readonly real: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  } | null;
  /** QA verdict from the committed build; null when the manifest predates QA. */
  readonly qa: { readonly pass: boolean; readonly findings: number } | null;
  /** The critique's overall score (0–10), null when there is no critique.json. */
  readonly score: number | null;
  /** Counts the card and the badges show without loading the facts. */
  readonly sounds: number;
  readonly liveries: number;
  /** Beauty render (1600×900), a card-sized copy of it, and the contact sheet. Null if absent. */
  readonly hero: string | null;
  readonly card: string | null;
  readonly sheet: string | null;
  /** URL of this asset's `MediaFacts`. */
  readonly facts: string;
}

export interface MediaSound {
  readonly node: string;
  readonly clip: string;
  readonly trigger: string;
  readonly loop: boolean;
  readonly seconds: number;
  /** URL of `<clip>.wav`, null when the file is not committed. */
  readonly url: string | null;
}

export interface CritiqueScore {
  readonly score: number;
  readonly reason: string;
}

/** `critique.json`: the agent's rubric scores plus the measured art metrics behind them. */
export interface MediaCritique {
  readonly reviewer: string;
  readonly overall: number;
  readonly scores: Readonly<Record<string, CritiqueScore>>;
  readonly silhouette: readonly { readonly view: string; readonly iou: number }[];
  readonly focal: readonly { readonly part: string; readonly share: number }[];
  /** Rest share of the silhouette (calm areas) and its declared minimum. */
  readonly rest: { readonly share: number; readonly min: number } | null;
  readonly shape: string | null;
}

export interface MediaWeather {
  readonly effect: string;
  readonly target: number;
  readonly actual: number;
  readonly area: number;
}

export interface MediaFacts {
  readonly measures: readonly MediaMeasure[];
  readonly sources: readonly string[];
  readonly paint: Readonly<Record<string, string>>;
  readonly variants: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly sounds: readonly MediaSound[];
  readonly weather: readonly MediaWeather[];
  readonly joints: number;
  readonly critique: MediaCritique | null;
  /** Extra committed images: blueprint, RTS icon / portrait / in-game shot. */
  readonly images: Readonly<Partial<Record<MediaImage, string>>>;
}

export type MediaImage = 'blueprint' | 'icon' | 'portrait' | 'rts';
export const MEDIA_IMAGES: readonly MediaImage[] = ['blueprint', 'icon', 'portrait', 'rts'];
