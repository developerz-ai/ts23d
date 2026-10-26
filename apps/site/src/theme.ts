// Bridges the CSS design tokens into three.js colours, and re-notifies when the colour scheme flips.

import { Color } from 'three';

const scheme = window.matchMedia('(prefers-color-scheme: dark)');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

export const token = (name: string): Color =>
  new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888');

export const onSchemeChange = (fn: () => void): void => scheme.addEventListener('change', fn);

export const reducedMotion = (): boolean => motion.matches;
