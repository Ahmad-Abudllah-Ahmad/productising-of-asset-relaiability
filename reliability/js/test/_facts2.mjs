import { generateSeed } from '../data/seed.js';
import { createRepository } from '../data/repository.js';
import { loadSnapshot } from '../app/snapshot.js';
import { loadMap } from '../app/mapModel.js';
const snap = await loadSnapshot(createRepository(generateSeed(), { storage: null }));
const m = loadMap(snap);
const pad=0.0008, A=[40.5255,49.7869], B=[40.5308,49.7895];
const poly=[{lat:A[0]-pad,lng:A[1]-pad},{lat:A[0]-pad,lng:B[1]+pad},{lat:B[0]+pad,lng:B[1]+pad},{lat:B[0]+pad,lng:A[1]-pad}];
const sel=m.select(poly); console.log(sel.total, sel.items.map(i=>i.id+':'+i.risk).join(' '));
