import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Read the actual design tokens instead of maintaining a second palette.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'src/app.css'), 'utf8');
function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert(start >= 0, `Missing ${selector} palette`);
  const block = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6}(?:[\da-f]{2})?);/gi)].map(([, key, value]) => [key, value]));
}
function rgb(hex) { return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255); }
function luminance(color) {
  return rgb(color).reduce((sum, channel, index) => sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index], 0);
}
function contrast(a, b) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + .05) / (low + .05);
}
function composite(foreground, background) {
  const alpha = foreground.length === 9 ? parseInt(foreground.slice(7, 9), 16) / 255 : 1;
  const back = rgb(background);
  return `#${rgb(foreground).map((channel, index) => Math.round((channel * alpha + back[index] * (1 - alpha)) * 255).toString(16).padStart(2, '0')).join('')}`;
}
const pairs = [
  ['ink', 'canvas'], ['ink', 'paper'], ['ink', 'soft'], ['muted', 'canvas'], ['muted', 'paper'], ['muted', 'soft'],
  ['muted', 'accent-soft'], ['muted', 'apricot-soft'], ['muted', 'mint-soft'], ['danger', 'danger-soft'],
  ['accent', 'accent-soft'], ['apricot', 'apricot-soft'], ['mint', 'mint-soft'],
  ['on-action', 'action'], ['dock-ink', 'glass-solid'], ['dock-selected', 'accent-soft'],
];
const results = [];
for (const [theme, palette] of [['light', tokens(':root')], ['dark', tokens(":root[data-theme='dark']")]]) {
  for (const [foreground, background] of pairs) {
    assert(palette[foreground] && palette[background], `Missing ${theme} ${foreground}/${background}`);
    const ratio = contrast(palette[foreground], palette[background]);
    results.push({ theme, foreground, background, ratio: Number(ratio.toFixed(2)), AA: ratio >= 4.5 });
    assert(ratio >= 4.5, `${theme} ${foreground}/${background}: ${ratio.toFixed(2)} < 4.5`);
  }
  for (const backdrop of ['#000000', '#ffffff']) {
    const base = composite(palette['dock-bg'], backdrop);
    const ratio = contrast(palette['dock-ink'], base);
    results.push({ theme, foreground: 'dock-ink', background: `base dock over ${backdrop}`, composite: base, ratio: Number(ratio.toFixed(2)), AA: ratio >= 4.5 });
    assert(ratio >= 4.5, `${theme} dock base over ${backdrop}: ${ratio.toFixed(2)} < 4.5`);
  }
}
const output = {
  method: 'WCAG 2.x relative luminance, sRGB linearization; normal text threshold 4.5:1',
  scope: 'Actual CSS solid token pairs and conservative base dock layer over black/white. Layered reflections, scene composition and text rasterization require browser screenshots; this is not physical-device or full-page accessibility evidence.',
  results,
};
if (process.argv.includes('--write')) {
  const destination = path.join(root, 'DOCS/qa/0.5/contrast-ui-tokens.json');
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(output, null, 2)}\n`);
}
console.log(`Chipper 0.5 contrast: ${results.length}/${results.length} token/base-glass pairs meet normal-text AA (minimum ${Math.min(...results.map(result => result.ratio)).toFixed(2)}:1).`);
