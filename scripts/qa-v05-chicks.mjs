/** Actual shared SVG renderer evidence. Requires Node24; no browser or npm dependencies. */
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const base = '3764261bd7ab2531b87b47c240a3158022b02754';
const output = resolve('DOCS/qa/0.5');
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(join(tmpdir(), 'chipper-v05-before-'));
function run(command, args) {
  try { return execFileSync(command, args); }
  catch (error) {
    // Some managed sandboxes deny the final process accounting call after success.
    if (error.status === 0 && error.stdout) return error.stdout;
    throw error;
  }
}
const { renderChickSvg, escapeXml } = await import('../src/chicks/renderer.ts');
const { visualDetailsFor } = await import('../src/chicks/models.ts');
const { PREVIEW_CHICKS } = await import('../src/chicks/previewFixtures.ts');
for (const name of ['renderer', 'geometry', 'models', 'animation']) {
  writeFileSync(join(temporary, `${name}.ts`), run('git', ['show', `${base}:src/chicks/${name}.ts`]));
}
const { renderChickSvg: before } = await import(pathToFileURL(join(temporary, 'renderer.ts')).href);
const stages = ['baby', 'teen', 'adult'];
const stageLabels = ['Птенец', 'Подросток', 'Взрослый'];
const text = (x, y, value, size = 16, fill = '#fff4dd') => `<text x="${x}" y="${y}" fill="${fill}" font-family="sans-serif" font-size="${size}">${escapeXml(value)}</text>`;
function rootSvg(width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#192139"/>${content}</svg>`;
}
function avatar(renderer, chick, x, y, index, size = 238) {
  return renderer({ chick, direction: 'front', phase: 0, id: `evidence-${index}` })
    .replace('<svg ', `<svg x="${x}" y="${y}" `)
    .replace('width="320" height="320"', `width="${size}" height="${size}"`);
}
let gallery = text(32, 42, 'CHIPPER 0.5 · CHICK VISUAL SYSTEM 3.0', 24)
  + text(32, 72, '30 deterministic V2 QA families · 12 palettes · 3 ages · deterministic ID cosmetics', 15, '#b6c1dc')
  + text(32, 96, 'Actual production SVG exports rasterized by librsvg. Not browser or Telegram screenshots.', 13, '#b6c1dc');
for (const [index, original] of PREVIEW_CHICKS.entries()) {
  const chick = { ...original, stage: stages[index % 3] };
  const x = 24 + index % 6 * 236; const y = 120 + Math.floor(index / 6) * 300;
  const details = visualDetailsFor(chick);
  gallery += `<rect x="${x}" y="${y}" width="224" height="286" rx="24" fill="#303b59"/>`
    + avatar(renderChickSvg, chick, x - 5, y - 8, index)
    + text(x + 12, y + 240, `${index + 1}. ${details.personalityLabel}`, 15)
    + text(x + 12, y + 264, `${stageLabels[index % 3]} · ${original.appearanceId}`, 11, '#c0cae1');
}
writeFileSync(join(output, 'chick-gallery-v3.svg'), rootSvg(1440, 1640, gallery));
let comparison = text(32, 42, 'CHIPPER 0.4 → 0.5 · SAME IDS, GENES AND AGES', 24)
  + text(32, 70, 'Before: exact main 3764261 · After: current shared production renderer', 14, '#b6c1dc')
  + text(32, 94, 'Vector renderer evidence; UI and physical Telegram checks are separate.', 13, '#b6c1dc');
for (let index = 0; index < 12; index++) {
  const original = PREVIEW_CHICKS[index]; const chick = { ...original, stage: stages[index % 3] };
  const x = 24 + index % 3 * 472; const y = 120 + Math.floor(index / 3) * 300;
  comparison += `<rect x="${x}" y="${y}" width="456" height="286" rx="24" fill="#303b59"/>`
    + avatar(before, chick, x - 2, y - 8, `before-${index}`, 224)
    + avatar(renderChickSvg, chick, x + 226, y - 8, `after-${index}`, 224)
    + text(x + 12, y + 238, `0.4 · ${stageLabels[index % 3]}`, 13, '#b6c1dc')
    + text(x + 240, y + 238, '0.5 · Visual 3.0', 13, '#f3cf94')
    + text(x + 12, y + 264, `${original.id} · ${original.appearanceId}`, 12);
}
writeFileSync(join(output, 'chicks-before-after.svg'), rootSvg(1440, 1340, comparison));
const rasterize = String.raw`import ctypes,sys
from ctypes import c_void_p,c_char_p,c_size_t,c_int,c_double,POINTER,c_ubyte
rsvg=ctypes.CDLL('librsvg-2.so.2'); cairo=ctypes.CDLL('libcairo.so.2'); glib=ctypes.CDLL('libgobject-2.0.so.0')
rsvg.rsvg_handle_new_from_data.argtypes=[POINTER(c_ubyte),c_size_t,c_void_p];rsvg.rsvg_handle_new_from_data.restype=c_void_p
rsvg.rsvg_handle_render_cairo.argtypes=[c_void_p,c_void_p];rsvg.rsvg_handle_render_cairo.restype=c_int
cairo.cairo_image_surface_create.argtypes=[c_int,c_int,c_int];cairo.cairo_image_surface_create.restype=c_void_p
cairo.cairo_create.argtypes=[c_void_p];cairo.cairo_create.restype=c_void_p
cairo.cairo_surface_write_to_png.argtypes=[c_void_p,c_char_p];cairo.cairo_surface_write_to_png.restype=c_int
cairo.cairo_destroy.argtypes=[c_void_p];cairo.cairo_surface_destroy.argtypes=[c_void_p];glib.g_object_unref.argtypes=[c_void_p]
data=open(sys.argv[1],'rb').read();buffer=(c_ubyte*len(data)).from_buffer_copy(data)
handle=rsvg.rsvg_handle_new_from_data(buffer,len(data),None)
if not handle: raise RuntimeError('SVG parse failure')
surface=cairo.cairo_image_surface_create(0,int(sys.argv[3]),int(sys.argv[4]));ctx=cairo.cairo_create(surface)
if not rsvg.rsvg_handle_render_cairo(handle,ctx): raise RuntimeError('SVG raster failure')
if cairo.cairo_surface_write_to_png(surface,sys.argv[2].encode()): raise RuntimeError('PNG write failure')
cairo.cairo_destroy(ctx);cairo.cairo_surface_destroy(surface);glib.g_object_unref(handle)
`;
for (const [name, height] of [['chick-gallery-v3', 1640], ['chicks-before-after', 1340]]) {
  run('python', ['-c', rasterize, join(output, `${name}.svg`), join(output, `${name}.png`), '1440', String(height)]);
}
rmSync(temporary, { recursive: true });
console.log(`Rendered 30-bird gallery and exact-main 12-pair comparison to ${output}; SVG + PNG, no browser claims.`);
