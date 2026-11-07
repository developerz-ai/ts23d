// The committed media of one asset (`recipes/<folder>/out/<asset>/`), as the media plugin exposes
// it to the page: renders by URL plus the CLI manifest's facts. Types only; shared with the plugin.

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
  readonly emitters: readonly {
    readonly name: string;
    readonly kind: string;
    readonly when: string;
  }[];
  readonly sockets: readonly { readonly name: string; readonly kind: string }[];
  readonly surfaces: readonly string[];
  readonly real: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly measures: readonly MediaMeasure[];
  readonly sources: readonly string[];
  /** QA verdict from the committed build; null when the manifest predates QA. */
  readonly qa: { readonly pass: boolean; readonly findings: number } | null;
  /** Beauty render (1600×900), a card-sized copy of it, and the contact sheet. Null if absent. */
  readonly hero: string | null;
  readonly card: string | null;
  readonly sheet: string | null;
}
