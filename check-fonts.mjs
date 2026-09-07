import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadLensTypeface,LENS_FONT_FAMILY,FALLBACK_FONT_FAMILY,LENS_FONT_WEIGHTS} from './src/focus/typography.ts';
const manifest=JSON.parse(readFileSync(new URL('./public/fonts/iosevka/manifest.json',import.meta.url)));
assert.deepEqual(manifest.fonts.map(f=>f.weight),[400,500,600]);
assert(manifest.features.every(f=>!['liga','calt','dlig'].includes(f)));
for(const font of manifest.fonts){
 const bytes=readFileSync(new URL('./public/fonts/iosevka/'+font.file,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),font.sha256);
 assert.equal(bytes.subarray(0,4).toString(),'wOF2');
}
const calls=[];
assert.equal(await loadLensTypeface({load:async(font,text)=>{calls.push({font,text});return [{}];}},50),LENS_FONT_FAMILY);
assert.equal(calls.length,LENS_FONT_WEIGHTS.length);
assert(calls.every(c=>c.text.includes('Її')&&c.text.includes('β')&&c.text.includes('≤')));
assert.equal(await loadLensTypeface({load:async()=>[]},50),FALLBACK_FONT_FAMILY);
assert.equal(await loadLensTypeface({load:async()=>{throw Error('Offline');}},50),FALLBACK_FONT_FAMILY);
assert.equal(await loadLensTypeface({load:()=>{throw Error('Unavailable API');}},50),FALLBACK_FONT_FAMILY);
assert.equal(await loadLensTypeface({load:()=>new Promise(()=>{})},1),FALLBACK_FONT_FAMILY);
const css=readFileSync(new URL('./src/focus/style.css',import.meta.url),'utf8');
assert(css.includes('font-variant-ligatures: none'));
assert(css.includes('MedLens Iosevka'));
console.log('Fonts: PASS — three pinned WOFF2 faces, glyph receipt, atomic ready/fallback selection');
