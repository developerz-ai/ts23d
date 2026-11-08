// The asset page's sounds: every KHR_audio_emitter the GLB declares (node, clip, what triggers it,
// loop, length) with a play button for its committed WAV. "Positional" plays the clip from its node
// in the live viewer through three.js PositionalAudio, so orbiting moves the sound; otherwise a
// plain <audio> plays it. Nothing loads until a button is pressed.

import { AudioListener, AudioLoader, type Camera, type Object3D, PositionalAudio } from 'three';
import { loadFacts } from './facts.ts';
import type { Item } from './items.ts';
import type { MediaSound } from './media-types.ts';

export interface SoundStage {
  readonly camera: Camera;
  /** The live model, or null while compiling / in Scene mode. */
  readonly model: () => Object3D | null;
}

let listener: AudioListener | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();
const loadBuffer = (url: string): Promise<AudioBuffer> => {
  let b = buffers.get(url);
  if (!b) {
    b = new AudioLoader().loadAsync(url);
    buffers.set(url, b);
  }
  return b;
};

export class SoundPanel {
  private readonly list: HTMLElement | null;
  private readonly positional: HTMLInputElement | null;
  private playing: { stop(): void } | null = null;
  private token = 0;

  constructor(
    private readonly section: HTMLElement,
    private readonly stage: SoundStage,
  ) {
    this.list = section.querySelector('[data-sounds]');
    this.positional = section.querySelector('[data-positional]');
  }

  render(item: Item): void {
    const ticket = ++this.token;
    this.stop();
    this.section.hidden = true;
    if (!item.media?.sounds) return;
    void loadFacts(item).then((f) => {
      if (ticket !== this.token || !f?.sounds.length || !this.list) return;
      this.list.replaceChildren(...f.sounds.map((s) => this.row(s)));
      this.section.hidden = false;
    });
  }

  stop(): void {
    this.playing?.stop();
    this.playing = null;
  }

  private row(s: MediaSound): HTMLLIElement {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sound-play';
    b.textContent = '▶ Play';
    b.disabled = !s.url;
    b.setAttribute('aria-label', `Play ${s.clip}`);
    b.addEventListener('click', () => void this.play(s, b));
    const name = document.createElement('code');
    name.textContent = s.clip;
    const meta = document.createElement('span');
    meta.className = 'part-meta';
    meta.textContent = `on ${s.node} · ${s.trigger}${s.loop ? ' · loops' : ''} · ${s.seconds.toFixed(1)} s`;
    li.append(b, name, meta);
    return li;
  }

  private async play(s: MediaSound, button: HTMLButtonElement): Promise<void> {
    if (!s.url) return;
    this.stop();
    const reset = (): void => {
      button.textContent = '▶ Play';
    };
    button.textContent = '■ Playing';
    const model = this.stage.model();
    if (this.positional?.checked && model) {
      listener ??= new AudioListener();
      if (!listener.parent) this.stage.camera.add(listener);
      const audio = new PositionalAudio(listener);
      audio.setBuffer(await loadBuffer(s.url));
      audio.setRefDistance(2);
      (model.getObjectByName(s.node) ?? model).add(audio);
      audio.onEnded = () => {
        audio.removeFromParent();
        reset();
      };
      audio.play();
      this.playing = {
        stop: () => {
          if (audio.isPlaying) audio.stop();
          audio.removeFromParent();
          reset();
        },
      };
      return;
    }
    const el = new Audio(s.url);
    el.addEventListener('ended', reset);
    void el.play().catch(reset);
    this.playing = {
      stop: () => {
        el.pause();
        reset();
      },
    };
  }
}
