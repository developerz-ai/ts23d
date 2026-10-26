// The source panel: the recipe's TypeScript, lightly highlighted. This text *is* the asset.

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
  const code = root.querySelector<HTMLElement>('code');
  // The listing scrolls, so keyboard users need to be able to focus it.
  if (pre) pre.tabIndex = 0;
  if (title) title.textContent = `recipes/${file}`;
  if (code) code.innerHTML = highlight(source);
}
