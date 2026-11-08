// The source panel: the recipe's TypeScript, lightly highlighted. This text *is* the asset.
// Multi-file recipes get a file picker (entry first, then siblings and nested modules).

import type { Recipe } from './recipes.ts';

const KEYWORDS =
  /\b(import|from|export|const|let|for|of|if|else|return|function|as|type|interface|new|true|false|null|undefined)\b/;
// Order matters: comments and strings swallow anything that looks like a keyword inside them.
const TOKEN = new RegExp(
  [
    String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)`,
    String.raw`('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\x60(?:\\.|[^\x60\\])*\x60)`,
    String.raw`\b(\d+(?:\.\d+)?)\b`,
    KEYWORDS.source,
  ].join('|'),
  'g',
);
const CLASSES = ['tok-comment', 'tok-string', 'tok-number', 'tok-keyword'];

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(source: string): string {
  let out = '';
  let last = 0;
  for (const m of source.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    out += escapeHtml(source.slice(last, at));
    const group = m.slice(1).findIndex((g) => g !== undefined);
    out += `<span class="${CLASSES[group] ?? ''}">${escapeHtml(m[0])}</span>`;
    last = at + m[0].length;
  }
  return out + escapeHtml(source.slice(last));
}

export function renderSource(root: HTMLElement, file: string, source: string): void {
  const title = root.querySelector<HTMLElement>('[data-source-file]');
  const pre = root.querySelector<HTMLElement>('pre');
  const code = root.querySelector<HTMLElement>('pre code');
  // The listing scrolls, so keyboard users need to be able to focus it.
  if (pre) pre.tabIndex = 0;
  if (title) title.textContent = `recipes/${file}`;
  if (code) code.innerHTML = highlight(source);
}

let token = 0;

/** Show `recipe`'s entry file, with a picker over all of its files when there are several. */
export function renderRecipe(root: HTMLElement, recipe: Recipe): void {
  const ticket = ++token;
  const picker = root.querySelector<HTMLSelectElement>('[data-source-pick]');
  const show = (file: string): void =>
    void recipe.source(file).then((text) => {
      if (ticket === token) renderSource(root, file, text);
    });
  if (picker) {
    picker.hidden = recipe.files.length < 2;
    picker.replaceChildren(
      ...recipe.files.map((f) =>
        Object.assign(document.createElement('option'), { value: f, textContent: f }),
      ),
    );
    picker.onchange = () => show(picker.value);
    picker.setAttribute('aria-label', `Recipe file (${recipe.files.length} files)`);
  }
  show(recipe.file);
}
