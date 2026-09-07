import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const m=JSON.parse(readFileSync('public/control/manifest.json','utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
assert.equal(hash('public/control/data/case024.json'),m.projection_sha256);
assert.equal(hash('public/data/case024.json'),m.projection_sha256);
for(const file of [m.javascript,m.stylesheet]){assert(existsSync('public/control/'+file));assert(readFileSync('public/control/index.html','utf8').includes(file));}
assert.equal(m.source_commit,'cb3fb4def087314ee8def545c51060c99bfeb23e');
console.log('Control PASS: frozen pre-evolution entry and identical de-identified snapshot');
