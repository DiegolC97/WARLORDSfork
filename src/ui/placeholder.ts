/**
 * Tiny DOM helpers for placeholder screens. Real screens will replace these
 * with engine-rendered UI; nothing here is part of the game's design.
 */

export function heading(overlay: HTMLElement, text: string): HTMLHeadingElement {
  const h = document.createElement('h1');
  h.textContent = text;
  overlay.appendChild(h);
  return h;
}

export function note(overlay: HTMLElement, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  overlay.appendChild(p);
  return p;
}

export function button(
  parent: HTMLElement,
  label: string,
  onClick: () => void,
  opts: { action?: string; disabled?: boolean } = {},
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (opts.action) b.dataset.action = opts.action;
  b.disabled = opts.disabled ?? false;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
}

export function row(overlay: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'row';
  overlay.appendChild(d);
  return d;
}
