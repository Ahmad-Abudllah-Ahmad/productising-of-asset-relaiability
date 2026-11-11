// Deterministic seed generator for the Reliability prototype.
// Same options -> byte-identical output. No Date.now(), no Math.random().
// All names, manufacturers and IDs are invented demo data.

import { CONFIG, DEFECT_CLASSES, TX_DEFECT_CLASSES } from '../domain/config.js';

const SEED = CONFIG.seed;

// ---------------------------------------------------------------- helpers

function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function addDays(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

const M_PER_DEG = 111320;
function offset(p, dxM, dyM) {
  return {
    type: 'point',
    lat: round(p.lat + dyM / M_PER_DEG, 6),
    lng: round(p.lng + dxM / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180)), 6),
  };
}
function distM(a, b) {
  const dy = (b.lat - a.lat) * M_PER_DEG;
  const dx = (b.lng - a.lng) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}
const midpoint = (a, b) => ({ type: 'point', lat: round((a.lat + b.lat) / 2, 6), lng: round((a.lng + b.lng) / 2, 6) });

const IMAGES_RGB = [
  '/assets/custom/power-line-inspection.jpg',
  '/assets/custom/hero-drone-inspection.jpg',
  '/assets/custom/wind-power-inspection.jpg',
  '/assets/custom/solar-power-inspection.webp',
];
const IMAGE_THERMAL = '/assets/custom/thermal-power-plant.jpg';
const SENSOR_NAMES = { rgb: 'RGB-45MP', thermal: 'TIR-640', lidar: 'LiDAR-L2' };

// What each defect class is attached to, and which sensor sees it.
const LINE_DEFECT_TARGET = {
  broken_strand: ['conductor', 'rgb'],
  conductor_corrosion: ['conductor', 'rgb'],
  sag_excessive: ['conductor', 'lidar'],
  damper_displaced: ['damper', 'rgb'],
  damper_damaged: ['damper', 'rgb'],
  spacer_damaged: ['conductor', 'rgb'],
  clamp_loose: ['insulator_string', 'thermal'],
  insulator_cracked: ['insulator_string', 'rgb'],
  insulator_contaminated: ['insulator_string', 'rgb'],
  insulator_flashover_mark: ['insulator_string', 'rgb'],
  insulator_missing_disc: ['insulator_string', 'rgb'],
  steel_corrosion: ['tower', 'rgb'],
  bent_member: ['tower', 'rgb'],
  missing_bolt: ['tower', 'rgb'],
  cotter_pin_missing: ['tower', 'rgb'],
  foundation_cracked: ['foundation', 'rgb'],
  foundation_erosion: ['foundation', 'rgb'],
  earthwire_damaged: ['earthwire', 'rgb'],
  arrester_damaged: ['tower', 'rgb'],
  bird_nest: ['tower', 'rgb'],
  sign_missing: ['tower', 'rgb'],
  vegetation_encroachment: ['span_corridor_segment', 'lidar'],
  structure_encroachment: ['span_corridor_segment', 'lidar'],
};
const TX_DEFECT_TARGET = {
  oil_leak: ['tank_oil', 'rgb'],
  bushing_hotspot: ['bushing', 'thermal'],
  radiator_corrosion: ['cooling', 'rgb'],
  tank_damage: ['tank_oil', 'rgb'],
};

// -------------------------------------------------------------- generator

/**
 * @param {{seed?: number}} [options]
 * @returns {{assets:import('../domain/types.js').Asset[], links:import('../domain/types.js').Link[],
 *   labels:import('../domain/types.js').Label[], campaigns:import('../domain/types.js').Campaign[],
 *   captures:import('../domain/types.js').Capture[], findings:import('../domain/types.js').Finding[],
 *   workOrders:import('../domain/types.js').WorkOrder[], repairs:import('../domain/types.js').Repair[],
 *   dga:import('../domain/types.js').DgaSample[], groundTruth:import('../domain/types.js').GroundTruth}}
 */
export function generateSeed(options = {}) {
  const rand = makeRng(options.seed ?? SEED.seed);
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const between = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const chance = (p) => rand() < p;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  // ---- managed label list
  const labelMap = new Map();
  const lab = (kind, value) => {
    const id = `${kind}:${slug(value)}`;
    if (!labelMap.has(id)) labelMap.set(id, { label_id: id, kind, value });
    return id;
  };

  // ---- assets
  const assets = [];
  const byId = new Map();
  const add = (a) => {
    const rec = {
      asset_id: a.asset_id, category: a.category, class: a.class, parent_id: a.parent_id ?? null,
      name: a.name, external_ids: a.external_ids ?? {}, location: a.location ?? null,
      voltage_kv: a.voltage_kv ?? null, install_date: a.install_date ?? null,
      criticality: a.criticality ?? 1, labels: [...new Set(a.labels ?? [])],
      health_index: null, health_updated_at: null, ext: a.ext ?? {},
    };
    assets.push(rec);
    byId.set(rec.asset_id, rec);
    return rec;
  };
  const critClass = (c) => lab('criticality_class', c >= 5 ? 'A' : c === 4 ? 'B' : c === 3 ? 'C' : 'D');

  // ---- geometry for the three lines (substation S-2 sits at the end of L-220-03)
  const S1 = { type: 'point', lat: 40.5, lng: 49.8 };
  function path(start, bearingDeg, n, spacing) {
    const pts = [];
    let heading = (bearingDeg * Math.PI) / 180;
    let cur = start;
    for (let i = 0; i < n; i += 1) {
      heading += gauss() * 0.04;
      cur = offset(cur, Math.sin(heading) * spacing * between(0.9, 1.1), Math.cos(heading) * spacing * between(0.9, 1.1));
      pts.push(cur);
    }
    return pts;
  }
  const [spec132, spec220, spec500] = SEED.lines;
  const p220 = path(S1, 95, spec220.towers, spec220.spacingM);
  const S2 = offset(p220[p220.length - 1], 350, 0);
  const geometry = {
    [spec132.id]: path(S1, 340, spec132.towers, spec132.spacingM),
    [spec220.id]: p220,
    [spec500.id]: path(S2, 160, spec500.towers, spec500.spacingM),
  };

  // ---- corridors and lines
  const corridorIds = {};
  for (const spec of SEED.lines) {
    const cid = `COR-${slug(spec.corridor).toUpperCase()}`;
    corridorIds[spec.id] = cid;
    add({
      asset_id: cid, category: 'line_network', class: 'corridor', name: `Corridor ${spec.corridor}`,
      external_ids: { gis: `GIS-${cid}` }, criticality: 4,
      labels: [lab('corridor', `Corridor ${spec.corridor}`)],
    });
  }

  const lineMeta = {};
  const lineEnds = {
    [spec132.id]: { start: 'SUB-S1', end: null },
    [spec220.id]: { start: 'SUB-S1', end: 'SUB-S2' },
    [spec500.id]: { start: 'SUB-S2', end: null },
  };
  const commissioned = { 132: 1998, 220: 2007, 500: 2015 };
  const crit = { 132: 3, 220: 4, 500: 5 };
  for (const spec of SEED.lines) {
    const short = spec.id.slice(2);
    const base = [lab('corridor', `Corridor ${spec.corridor}`), lab('circuit', spec.id), lab('region', `Region ${spec.region}`)];
    lineMeta[spec.id] = { spec, short, base, towers: [] };
    add({
      asset_id: spec.id, category: 'line_network', class: 'line', parent_id: corridorIds[spec.id], name: spec.id,
      external_ids: { sap: `SAP-LIN-${short}`, gis: `GIS-${spec.id}` },
      location: { type: 'line', coordinates: geometry[spec.id].map((p) => [p.lat, p.lng]) },
      voltage_kv: spec.kv, install_date: `${commissioned[spec.kv]}-05-01`, criticality: crit[spec.kv],
      labels: [...base, critClass(crit[spec.kv])],
      ext: {
        circuit_id: `C-${short}`, length_km: round(((spec.towers - 1) * spec.spacingM) / 1000, 2),
        end_substations: [lineEnds[spec.id].start, lineEnds[spec.id].end],
      },
    });
  }

  // ---- substations, bays, transformers and parts
  const SUBS = [
    { id: 'SUB-S1', name: 'Substation S-1', loc: S1, levels: [220, 132], corridors: ['North', 'Coastal'], txPrefix: '1', hv: 220, lv: 132, ratingMva: [150, 150, 200], year: [2004, 2004, 2012], lines: [spec132.id, spec220.id] },
    { id: 'SUB-S2', name: 'Substation S-2', loc: S2, levels: [500, 220], corridors: ['North', 'Inland'], txPrefix: '2', hv: 500, lv: 220, ratingMva: [400, 400, 400], year: [2015, 2015, 2019], lines: [spec220.id, spec500.id] },
  ];
  const TX_SUFFIX = ['A', 'B', 'C'];
  const TX_PROFILES = { 'TX-1A': 'healthy', 'TX-1B': 'aging', 'TX-1C': 'healthy', 'TX-2A': 'thermal', 'TX-2B': 'healthy', 'TX-2C': 'arcing' };
  const TX_FAMILY = { 'TX-1A': 'AP-150', 'TX-1C': 'AP-150', 'TX-1B': 'BT-150', 'TX-2A': 'AP-400', 'TX-2B': 'AP-400', 'TX-2C': 'BT-400' };
  const TX_MAKER = { 'AP-150': 'Aurelian Power', 'BT-150': 'Brandt Transformers', 'AP-400': 'Aurelian Power', 'BT-400': 'Brandt Transformers' };
  const transformers = [];
  const txParts = {};
  const bayByLine = {};
  for (const sub of SUBS) {
    const subLabels = [lab('substation', sub.name), ...sub.corridors.map((c) => lab('corridor', `Corridor ${c}`))];
    add({
      asset_id: sub.id, category: 'substation', class: 'substation', name: sub.name,
      external_ids: { sap: `SAP-SUB-${sub.txPrefix}`, gis: `GIS-${sub.id}` },
      location: sub.loc, voltage_kv: sub.hv, install_date: `${sub.year[0]}-03-01`, criticality: 5, labels: [...subLabels, critClass(5)],
      ext: { voltage_levels_kv: sub.levels, bays: 5, lines_terminated: sub.lines },
    });
    sub.lines.forEach((lineId, k) => {
      const bay = add({
        asset_id: `BAY-S${sub.txPrefix}-${k + 4}`, category: 'substation', class: 'bay', parent_id: sub.id,
        name: `S-${sub.txPrefix} bay ${k + 4}`, external_ids: { gis: `GIS-BAY-S${sub.txPrefix}-${k + 4}` },
        location: offset(sub.loc, 40 + k * 25, -30), voltage_kv: lineMeta[lineId].spec.kv, install_date: `${sub.year[0]}-03-01`,
        criticality: 4, labels: [...subLabels, lab('circuit', lineId), critClass(4)], ext: { role: 'line', line_id: lineId },
      });
      bayByLine[`${sub.id}|${lineId}`] = bay.asset_id;
    });
    TX_SUFFIX.forEach((suffix, k) => {
      const txId = `TX-${sub.txPrefix}${suffix}`;
      const family = TX_FAMILY[txId];
      const maker = TX_MAKER[family];
      const labelsTx = [...subLabels, lab('manufacturer', maker), lab('design_family', family), critClass(5)];
      add({
        asset_id: `BAY-S${sub.txPrefix}-${k + 1}`, category: 'substation', class: 'bay', parent_id: sub.id,
        name: `S-${sub.txPrefix} bay ${k + 1}`, external_ids: { gis: `GIS-BAY-S${sub.txPrefix}-${k + 1}` },
        location: offset(sub.loc, -40 - k * 25, 30), voltage_kv: sub.hv, install_date: `${sub.year[0]}-03-01`,
        criticality: 5, labels: [...subLabels, critClass(5)], ext: { role: 'transformer', transformer_id: txId },
      });
      const loc = offset(sub.loc, -40 - k * 25, 55);
      const profile = TX_PROFILES[txId];
      const aged = profile === 'aging';
      const tx = add({
        asset_id: txId, category: 'transformer', class: 'power_transformer', parent_id: `BAY-S${sub.txPrefix}-${k + 1}`,
        name: txId, external_ids: { sap: `SAP-TRF-${sub.txPrefix}${suffix}`, gis: `GIS-${txId}` },
        location: loc, voltage_kv: sub.hv, install_date: `${sub.year[k]}-09-15`, criticality: 5, labels: labelsTx,
        ext: {
          rating_mva: sub.ratingMva[k], voltage_ratio: `${sub.hv}/${sub.lv}`, serial: `SN-${sub.txPrefix}${suffix}-${int(10000, 99999)}`,
          oil_type: 'mineral', manufacturer: maker, design_family: family,
          last_dga: addDays(SEED.referenceDate, -int(10, 25)),
          oil: {
            date: addDays(SEED.referenceDate, -int(10, 25)),
            moisture_ppm: aged ? int(24, 30) : profile === 'healthy' ? int(7, 12) : int(13, 18),
            acidity_mgkoh_g: aged ? round(between(0.11, 0.16), 3) : round(between(0.02, 0.05), 3),
            breakdown_kv: aged ? int(36, 42) : int(58, 72),
          },
          electrical_tests: { date: addDays(SEED.referenceDate, -int(60, 300)), result: aged || profile === 'arcing' ? 'watch' : 'pass' },
          loading_pct_12m: Array.from({ length: 12 }, () => round(Math.min(98, Math.max(35, (k === 1 ? 82 : 62) + gauss() * 7)), 1)),
        },
      });
      transformers.push(tx);
      const parts = {};
      for (const [cls, nm, extra] of [
        ['bushing', 'BSH-HV', { side: 'HV', count: 3 }],
        ['bushing', 'BSH-LV', { side: 'LV', count: 3 }],
        ['tap_changer', 'OLTC', { type: 'on-load', positions: 17 }],
        ['cooling', 'COOL', { type: 'ONAN/ONAF', fans: 6 }],
        ['tank_oil', 'TANK', { oil_litres: sub.ratingMva[k] * 90 }],
      ]) {
        const part = add({
          asset_id: `${txId}-${nm}`, category: 'transformer', class: cls, parent_id: txId, name: `${txId} ${nm}`,
          external_ids: { sap: `SAP-TRF-${sub.txPrefix}${suffix}-${nm}` }, location: loc, voltage_kv: sub.hv,
          install_date: tx.install_date, criticality: 5, labels: labelsTx, ext: extra,
        });
        (parts[cls] ??= []).push(part);
      }
      txParts[txId] = parts;
    });
  }

  // ---- towers, components and spans
  const INSUL_MAKERS = ['Northwind Ceramics', 'Kestrel Glassworks', 'Halden Polymer'];
  const DAMPER_MAKERS = ['Vortex Dynamics', 'Stockline Fittings'];
  const CORROSION = { Coastal: 'C4', North: 'C3', Inland: 'C2' };
  const towerComponents = {};
  const spansByLine = {};
  for (const spec of SEED.lines) {
    const meta = lineMeta[spec.id];
    const pts = geometry[spec.id];
    const designFor = spec.kv === 500 ? 'Lattice-X5' : spec.kv === 220 ? 'Lattice-Z2' : 'Lattice-Y1';
    const spans = [];
    pts.forEach((loc, i) => {
      const n = i + 1;
      const tcrit = Math.min(5, Math.max(1, crit[spec.kv] + (chance(0.15) ? 1 : 0) - (chance(0.15) ? 1 : 0)));
      const tower = add({
        asset_id: `TWR-${meta.short}-${pad(n, 3)}`, category: 'structure', class: 'tower', parent_id: spec.id,
        name: `T-${pad(n, 3)}`, external_ids: { sap: `SAP-TWR-${spec.kv}${meta.short.slice(-2)}${pad(n, 3)}`, gis: `GIS-TWR-${meta.short}-${pad(n, 3)}` },
        location: loc, voltage_kv: spec.kv, install_date: `${commissioned[spec.kv] + int(0, 2)}-06-15`, criticality: tcrit,
        labels: [...meta.base, lab('corrosion_zone', CORROSION[spec.corridor]), lab('design_family', designFor), critClass(tcrit)],
        ext: { index: n, tower_type: designFor, height_m: round(spec.kv === 500 ? between(55, 70) : spec.kv === 220 ? between(38, 48) : between(25, 35), 1), corrosion_zone: CORROSION[spec.corridor] },
      });
      meta.towers.push(tower);
      const comp = { insulators: [], dampers: [] };
      const cl = (extra = []) => [...meta.base, critClass(tcrit), ...extra];
      comp.foundation = add({
        asset_id: `FND-${meta.short}-${pad(n, 3)}`, category: 'structure', class: 'foundation', parent_id: tower.asset_id,
        name: `${tower.name} foundation`, external_ids: { gis: `GIS-FND-${meta.short}-${pad(n, 3)}` }, location: loc,
        voltage_kv: spec.kv, install_date: tower.install_date, criticality: tcrit, labels: cl(), ext: { type: 'pad-and-chimney' },
      });
      ['A', 'B', 'C'].forEach((phase) => {
        comp.insulators.push(add({
          asset_id: `INS-${meta.short}-${pad(n, 3)}-${phase}`, category: 'line_component', class: 'insulator_string', parent_id: tower.asset_id,
          name: `${tower.name} string ${phase}`, external_ids: { sap: `SAP-INS-${meta.short}-${pad(n, 3)}-${phase}` }, location: loc,
          voltage_kv: spec.kv, install_date: tower.install_date, criticality: tcrit,
          labels: cl([lab('manufacturer', INSUL_MAKERS[(n + phase.charCodeAt(0)) % INSUL_MAKERS.length])]),
          ext: { phase, position: 'suspension', manufacturer: INSUL_MAKERS[(n + phase.charCodeAt(0)) % INSUL_MAKERS.length], model: spec.kv === 500 ? 'GL-420' : 'GL-300' },
        }));
      });
      comp.earthwire = add({
        asset_id: `EW-${meta.short}-${pad(n, 3)}`, category: 'line_component', class: 'earthwire', parent_id: tower.asset_id,
        name: `${tower.name} earthwire`, external_ids: { sap: `SAP-EW-${meta.short}-${pad(n, 3)}` }, location: loc,
        voltage_kv: spec.kv, install_date: tower.install_date, criticality: tcrit, labels: cl(), ext: { position: 'peak', model: 'OPGW-24' },
      });
      [1, 2].forEach((side) => {
        const mk = DAMPER_MAKERS[(n + side) % DAMPER_MAKERS.length];
        comp.dampers.push(add({
          asset_id: `DMP-${meta.short}-${pad(n, 3)}-${side}`, category: 'line_component', class: 'damper', parent_id: tower.asset_id,
          name: `${tower.name} damper ${side}`, external_ids: { sap: `SAP-DMP-${meta.short}-${pad(n, 3)}-${side}` }, location: loc,
          voltage_kv: spec.kv, install_date: tower.install_date, criticality: tcrit, labels: cl([lab('manufacturer', mk)]),
          ext: { phase: 'A', position: side === 1 ? 'back-span' : 'ahead-span', manufacturer: mk, model: 'SD-2' },
        }));
      });
      towerComponents[tower.asset_id] = comp;
    });

    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = meta.towers[i];
      const b = meta.towers[i + 1];
      const sid = `SPN-${meta.short}-${pad(i + 1, 3)}-${pad(i + 2, 3)}`;
      const length = round(distM(a.location, b.location), 1);
      const span = add({
        asset_id: sid, category: 'line_network', class: 'span', parent_id: spec.id, name: `${a.name}/${b.name}`,
        external_ids: { gis: `GIS-${sid}` }, location: { type: 'line', coordinates: [[a.location.lat, a.location.lng], [b.location.lat, b.location.lng]] },
        voltage_kv: spec.kv, install_date: a.install_date, criticality: Math.max(a.criticality, b.criticality), labels: [...meta.base, critClass(Math.max(a.criticality, b.criticality))],
        ext: { from_tower: a.asset_id, to_tower: b.asset_id, length_m: length, min_clearance_m: round(between(spec.kv === 500 ? 9 : 6.5, spec.kv === 500 ? 13 : 10), 1) },
      });
      const conductor = add({
        asset_id: `CND-${meta.short}-${pad(i + 1, 3)}`, category: 'line_component', class: 'conductor', parent_id: sid, name: `${span.name} conductor`,
        external_ids: { sap: `SAP-CND-${meta.short}-${pad(i + 1, 3)}` }, location: span.location, voltage_kv: spec.kv,
        install_date: a.install_date, criticality: span.criticality, labels: span.labels,
        ext: { conductor_type: spec.kv === 500 ? 'ACSR Bluebird x4' : 'ACSR Drake', phases: 3 },
      });
      const row = add({
        asset_id: `ROW-${meta.short}-${pad(i + 1, 3)}`, category: 'right_of_way', class: 'span_corridor_segment', parent_id: sid, name: `${span.name} corridor`,
        external_ids: { gis: `GIS-ROW-${meta.short}-${pad(i + 1, 3)}` }, location: span.location, voltage_kv: spec.kv,
        criticality: span.criticality, labels: span.labels, ext: { clearance_m: round(between(4, 12), 1), encroachment_type: null },
      });
      spans.push({ span, conductor, row });
    }
    spansByLine[spec.id] = spans;
  }

  // ---- duplicate asset records (same physical asset, second system of record)
  const groundTruth = { duplicates: [], repeatSightings: [], sameModel: {}, dgaProfiles: TX_PROFILES };
  let dupCounter = 0;
  const nameVariants = {
    tower: (n) => { const k = Number(n.slice(2)); return pick([`T${k}`, `Tower ${k}`, `T-${k}`, `T ${pad(k, 3)}`]); },
    power_transformer: (n) => pick([n.replace('-', ''), `Transformer ${n.slice(3)}`, n.toLowerCase()]),
    insulator_string: (n) => n.toLowerCase().replace('string', 'str.'),
  };
  function duplicate(orig) {
    dupCounter += 1;
    const mx = `MX-${orig.class.slice(0, 3).toUpperCase()}-${pad(1000 + dupCounter * 37 + int(0, 30), 4)}`;
    const dup = add({
      asset_id: mx, category: orig.category, class: orig.class, parent_id: orig.parent_id, name: nameVariants[orig.class](orig.name),
      external_ids: { maximo: mx, ...(dupCounter % 2 ? { gis: orig.external_ids.gis } : {}) },
      location: orig.location && orig.location.type === 'point' ? offset(orig.location, between(-12, 12), between(-12, 12)) : orig.location,
      voltage_kv: orig.voltage_kv, install_date: dupCounter % 2 ? orig.install_date : addDays(orig.install_date, 365),
      criticality: orig.criticality, labels: orig.labels.filter((l) => !l.startsWith('corrosion_zone:')),
      ext: orig.class === 'power_transformer' ? { ...orig.ext, serial: orig.ext.serial.replace(/-/g, ' ') } : { ...orig.ext },
    });
    groundTruth.duplicates.push({ original: orig.asset_id, duplicate: dup.asset_id });
    return dup;
  }
  const allTowers = Object.values(lineMeta).flatMap((m) => m.towers);
  const dupTowerPool = allTowers.filter((t) => t.ext.index > 4 && t.ext.index < 36);
  for (let i = 0; i < SEED.duplicateAssets.towers; i += 1) {
    const t = dupTowerPool.splice(Math.floor(rand() * dupTowerPool.length), 1)[0];
    duplicate(t);
  }
  for (let i = 0; i < SEED.duplicateAssets.transformers; i += 1) duplicate(byId.get('TX-2A'));
  for (let i = 0; i < SEED.duplicateAssets.insulatorStrings; i += 1) {
    const t = pick(allTowers.filter((x) => x.ext.index > 4 && x.ext.index < 36));
    duplicate(pick(towerComponents[t.asset_id].insulators));
  }

  // ---- defects -> findings (repeat sightings come from defects seen in several campaigns)
  const campaigns = SEED.campaigns.map((c) => ({
    campaign_id: c.id, name: c.name, start: c.start, end: addDays(c.start, c.days - 1),
    inspected_tower_ids: allTowers.filter(() => chance(SEED.towerInspectionCoverage)).map((t) => t.asset_id),
  }));

  function makeDefects(classes, targetMap, total, resolveFn, labelPrefix) {
    const out = [];
    let sightings = 0;
    let n = 0;
    while (sightings < total) {
      const cls = n < classes.length ? classes[n] : pick(classes);
      n += 1;
      const first = int(0, campaigns.length - 1);
      const seen = [first];
      let c = first;
      while (c < campaigns.length - 1 && chance(0.6)) { c += 1; seen.push(c); }
      if (sightings + seen.length > total) seen.length = total - sightings;
      sightings += seen.length;
      const [targetClass, sensor] = targetMap[cls.id];
      out.push({ defect_id: `${labelPrefix}-${pad(n, 3)}`, cls, sensor, targetClass, seen, ...resolveFn(targetClass) });
    }
    return out;
  }

  function lineTarget(targetClass) {
    const tower = pick(allTowers);
    const comp = towerComponents[tower.asset_id];
    const lineSpans = spansByLine[tower.parent_id];
    const sp = lineSpans[Math.min(tower.ext.index - 1, lineSpans.length - 1)];
    let trueAsset;
    let loc;
    if (targetClass === 'tower') { trueAsset = tower; loc = tower.location; }
    else if (targetClass === 'foundation') { trueAsset = comp.foundation; loc = tower.location; }
    else if (targetClass === 'insulator_string') { trueAsset = pick(comp.insulators); loc = tower.location; }
    else if (targetClass === 'damper') { trueAsset = pick(comp.dampers); loc = tower.location; }
    else if (targetClass === 'earthwire') { trueAsset = comp.earthwire; loc = tower.location; }
    else {
      const mid = midpoint(byId.get(sp.span.ext.from_tower).location, byId.get(sp.span.ext.to_tower).location);
      trueAsset = targetClass === 'conductor' ? sp.conductor : sp.row;
      loc = mid;
    }
    const towerLevelOnly = ['damper', 'insulator_string', 'foundation', 'earthwire'].includes(targetClass) && chance(0.35);
    return {
      tower, trueAssetId: trueAsset.asset_id, recordedAssetId: towerLevelOnly ? tower.asset_id : trueAsset.asset_id,
      componentHint: towerLevelOnly ? targetClass : null, location: offset(loc, between(-15, 15), between(-15, 15)),
    };
  }
  function txTarget(targetClass) {
    const tx = pick(transformers);
    const part = pick(txParts[tx.asset_id][targetClass]);
    return { tower: null, trueAssetId: part.asset_id, recordedAssetId: part.asset_id, componentHint: null, location: offset(tx.location, between(-8, 8), between(-8, 8)) };
  }

  const defects = [
    ...makeDefects(DEFECT_CLASSES, LINE_DEFECT_TARGET, SEED.lineFindingSightings, lineTarget, 'D'),
    ...makeDefects(TX_DEFECT_CLASSES, TX_DEFECT_TARGET, SEED.transformerFindingSightings, txTarget, 'DX'),
  ];

  const sightingsFlat = [];
  defects.forEach((d, di) => {
    let score = pick([1, 2, 2, 3, 3, 3, 4]);
    d.seen.forEach((ci, k) => {
      if (k > 0 && chance(0.4)) score = Math.max(1, score - 1);
      sightingsFlat.push({ d, di, ci, score });
    });
  });
  sightingsFlat.sort((a, b) => a.ci - b.ci || a.di - b.di);

  const captures = [];
  const captureByKey = new Map();
  const findings = [];
  const findingIdsByDefect = new Map();
  sightingsFlat.forEach(({ d, ci, score }, idx) => {
    const camp = campaigns[ci];
    const spot = d.tower ? d.tower.asset_id : d.recordedAssetId.split('-BSH')[0].split('-COOL')[0].split('-TANK')[0];
    const key = `${camp.campaign_id}|${spot}|${d.sensor}`;
    let cap = captureByKey.get(key);
    if (!cap) {
      cap = {
        capture_id: `CAP-${camp.campaign_id.slice(4)}-${pad(captures.length + 1, 4)}`, campaign_id: camp.campaign_id, type: d.sensor,
        sensor: SENSOR_NAMES[d.sensor], date: addDays(camp.start, int(0, SEED.campaigns[ci].days - 1)),
        location: d.tower ? d.tower.location : byId.get(spot).location,
        image: d.sensor === 'lidar' ? null : d.sensor === 'thermal' ? IMAGE_THERMAL : pick(IMAGES_RGB), finding_ids: [],
      };
      captureByKey.set(key, cap);
      captures.push(cap);
    }
    const status = pick(['confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'pending', 'pending', 'pending', 'rejected', 'rejected']);
    const w = round(between(0.06, 0.25), 3);
    const h = round(between(0.06, 0.25), 3);
    const f = {
      finding_id: `F-${pad(idx + 1, 4)}`, campaign_id: camp.campaign_id, capture_id: cap.capture_id, defect_class: d.cls.id, group: d.cls.group,
      asset_id: d.recordedAssetId, tower_id: d.tower ? d.tower.asset_id : null, component_hint: d.componentHint, sensor: d.sensor, date: cap.date,
      location: offset(d.location, between(-6, 6), between(-6, 6)),
      bbox: d.sensor === 'lidar' ? null : { x: round(between(0, 1 - w), 3), y: round(between(0, 1 - h), 3), w, h },
      confidence: round(status === 'confirmed' ? between(0.7, 0.99) : status === 'pending' ? between(0.5, 0.95) : between(0.4, 0.75), 2),
      condition_score: score, review_status: status, confirmed_by: status === 'pending' ? null : `reviewer-0${int(1, 3)}`,
    };
    findings.push(f);
    cap.finding_ids.push(f.finding_id);
    (findingIdsByDefect.get(d.defect_id) ?? findingIdsByDefect.set(d.defect_id, []).get(d.defect_id)).push(f.finding_id);
  });

  defects.forEach((d) => {
    const ids = findingIdsByDefect.get(d.defect_id) ?? [];
    if (ids.length >= 2) groundTruth.repeatSightings.push({ defect_id: d.defect_id, true_asset_id: d.trueAssetId, finding_ids: ids });
  });

  // failure-mode labels: tag the asset a finding points at, and its tower
  for (const f of findings) {
    if (f.review_status === 'rejected') continue;
    const tag = lab('failure_mode', f.defect_class);
    for (const id of [f.asset_id, f.tower_id]) {
      const a = id && byId.get(id);
      if (a && !a.labels.includes(tag)) a.labels.push(tag);
    }
  }

  // ---- work orders and repairs
  // Own random stream, so adding this block does not change any data generated above.
  // A completed repair closes the findings it fixed. Repairs are dated after the last
  // sighting they close and before the next campaign, so a repaired defect is not seen again,
  // except for "ineffective" repairs, where the defect is sighted again later.
  const wr = makeRng(((options.seed ?? SEED.seed) ^ 0x5eed) >>> 0);
  const wInt = (a, b) => a + Math.floor(wr() * (b - a + 1));
  const wChance = (p) => wr() < p;
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const findingById = new Map(findings.map((f) => [f.finding_id, f]));
  const WORK_TYPE = {
    conductor: 'conductor repair', conductor_accessories: 'fitting replacement', insulators: 'insulator replacement',
    steel_structure: 'steel repair', foundation: 'foundation repair', lightning_protection: 'earthwire repair',
    tower_accessories: 'fitting replacement', right_of_way: 'corridor clearing', tx_visual: 'transformer repair',
  };
  const lastCampaign = campaigns.length - 1;
  const entries = [];
  defects.forEach((d, di) => {
    const live = (findingIdsByDefect.get(d.defect_id) ?? []).map((id) => findingById.get(id)).filter((f) => f.review_status !== 'rejected');
    if (!live.length) return;
    const minScore = Math.min(...live.map((f) => f.condition_score));
    if (!wChance(minScore <= 3 ? 0.92 : 0.35)) return;
    const base = { di, defect: d, priority: minScore <= 2 ? 'high' : minScore === 3 ? 'medium' : 'low' };
    let rest = live;
    if (live.length >= 2 && wChance(0.2)) {
      const gap = daysBetween(live[0].date, live[1].date);
      if (gap >= 5) {
        entries.push({ ...base, findings: [live[0]], created: addDays(live[0].date, wInt(1, 2)), status: 'completed', repairDate: addDays(live[0].date, wInt(3, Math.min(40, gap - 1))), effective: false });
        rest = live.slice(1);
      }
    }
    const last = rest[rest.length - 1];
    const ci = campaigns.findIndex((c) => c.campaign_id === last.campaign_id);
    const isLast = ci === lastCampaign;
    const winStart = addDays(last.date, 3);
    const winEnd = isLast ? addDays(SEED.referenceDate, -1) : addDays(campaigns[ci + 1].start, -1);
    const created = addDays(rest[0].date, wInt(1, 2));
    if (winStart <= winEnd && wChance(isLast ? 0.3 : 0.85)) {
      entries.push({ ...base, findings: rest, created, status: 'completed', repairDate: addDays(winStart, wInt(0, Math.min(30, daysBetween(winStart, winEnd)))), effective: true });
    } else if (isLast ? wChance(0.55) : wChance(0.5)) {
      entries.push({ ...base, findings: rest, created, status: wChance(0.35) ? 'in_progress' : 'open', repairDate: null, effective: null });
    }
  });
  entries.sort((a, b) => a.created.localeCompare(b.created) || a.di - b.di);
  const workOrders = [];
  const repairs = [];
  groundTruth.repairs = [];
  entries.forEach((e, k) => {
    const woId = `WO-${pad(k + 1, 4)}`;
    const group = e.defect.cls.group;
    workOrders.push({
      work_order_id: woId, asset_id: e.defect.trueAssetId, work_type: WORK_TYPE[group], priority: e.priority, status: e.status,
      finding_ids: e.findings.map((f) => f.finding_id), created_at: e.created,
      planned_date: addDays(e.created, wInt(14, 60)), completed_at: e.repairDate,
    });
    if (e.status === 'completed') {
      const repair = {
        repair_id: `RPR-${pad(repairs.length + 1, 4)}`, work_order_id: woId, asset_id: e.defect.trueAssetId, date: e.repairDate,
        action: WORK_TYPE[group], closes_finding_ids: e.findings.map((f) => f.finding_id),
      };
      repairs.push(repair);
      groundTruth.repairs.push({ repair_id: repair.repair_id, work_order_id: woId, defect_id: e.defect.defect_id, effective: e.effective, closes_finding_ids: repair.closes_finding_ids });
    }
  });

  // ---- DGA history (demo data, assumption A2)
  const GAS_BASE = { h2: [20, 60], ch4: [15, 40], c2h6: [10, 30], c2h4: [5, 25], co: [200, 400], co2: [2000, 4000] };
  const GROWTH = {
    healthy: { h2: 1.03, ch4: 1.03, c2h6: 1.03, c2h4: 1.03, co: 1.03, co2: 1.03 },
    aging: { h2: 1.03, ch4: 1.03, c2h6: 1.03, c2h4: 1.03, co: 1.1, co2: 1.09 },
    thermal: { h2: 1.08, ch4: 1.18, c2h6: 1.12, c2h4: 1.25, co: 1.04, co2: 1.04 },
    arcing: { h2: 1.2, ch4: 1.05, c2h6: 1.03, c2h4: 1.06, co: 1.04, co2: 1.04 },
  };
  const dga = [];
  const nSamples = SEED.dgaSamplesPerTransformer;
  for (const tx of transformers) {
    const profile = TX_PROFILES[tx.asset_id];
    const vals = Object.fromEntries(Object.entries(GAS_BASE).map(([g, [lo, hi]]) => [g, between(lo, hi)]));
    let c2h2 = between(0, 0.8);
    for (let s = 0; s < nSamples; s += 1) {
      const monthsBack = (nSamples - 1 - s) * 3;
      const date = addDays(SEED.referenceDate, -(monthsBack * 30 + 10));
      if (s > 0) {
        for (const g of Object.keys(vals)) vals[g] *= GROWTH[profile][g];
        if (profile === 'arcing') c2h2 += between(0.6, 2.5);
      }
      const noisy = (v) => round(Math.max(0, v * (1 + gauss() * 0.04)), 1);
      dga.push({
        sample_id: `DGA-${tx.asset_id}-${pad(s + 1, 2)}`, asset_id: tx.asset_id, date,
        h2: noisy(vals.h2), ch4: noisy(vals.ch4), c2h6: noisy(vals.c2h6), c2h4: noisy(vals.c2h4),
        c2h2: round(Math.max(0, c2h2), 1), co: noisy(vals.co), co2: noisy(vals.co2),
      });
    }
  }

  // ---- links known from the asset master and the topology (rule/resemblance links come in Phase 3)
  const links = [];
  let ln = 0;
  const addLink = (from, to, type, relation, by) => links.push({
    link_id: `LNK-${pad(++ln, 5)}`, from_asset: from, to_asset: to, type, relation, source: 'manual', confidence: 1,
    status: 'confirmed', confirmed_by: by, created_at: '2026-01-05T08:00:00Z',
  });
  for (const a of assets) if (a.parent_id) addLink(a.asset_id, a.parent_id, 'hierarchy', 'part_of', 'asset-master-import');
  for (const sub of SUBS) {
    for (const lineId of sub.lines) {
      const bay = bayByLine[`${sub.id}|${lineId}`];
      addLink(lineId, bay, 'electrical', 'terminates_at', 'topology-import');
      const kv = lineMeta[lineId].spec.kv;
      for (const tx of transformers.filter((t) => t.parent_id.startsWith(`BAY-S${sub.txPrefix}-`))) {
        if (kv === sub.hv || kv === sub.lv) addLink(bay, tx.asset_id, 'electrical', 'feeds', 'topology-import');
      }
    }
  }

  // same-model answer key: transformers and towers by design family
  for (const a of assets) {
    if (a.class !== 'power_transformer' && a.class !== 'tower') continue;
    const fam = a.labels.find((l) => l.startsWith('design_family:'));
    if (fam) (groundTruth.sameModel[fam] ??= []).push(a.asset_id);
  }

  return {
    assets, links, labels: [...labelMap.values()].sort((x, y) => x.label_id.localeCompare(y.label_id)),
    campaigns, captures, findings, workOrders, repairs, dga, groundTruth,
  };
}
