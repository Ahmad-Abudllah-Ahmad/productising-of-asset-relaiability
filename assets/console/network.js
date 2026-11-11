// One network for every module. The towers, spans, lines, substations, transformers, findings, work orders and
// repairs come from the Asset Reliability seed and its scoring (health index, risk); everything another module needs
// on top (crews, people, depots, parts, suppliers, permits, budgets, telemetry) is generated here, deterministically,
// keyed to those same assets. So T-039 on L-220-03 is the same tower in Field Operations, Finance and Workforce.

import { repository } from '/reliability/js/data/repository.js';
import { loadSnapshot, AS_OF } from '/reliability/js/app/snapshot.js';
import { rng, addDays, daysBetween, live, KV_COLOR } from './console.js';

export { AS_OF };
const R = rng(20261112);
const pick = (a) => a[Math.floor(R() * a.length)];
const between = (a, b) => a + R() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export const DEFECT_LABEL = {
  broken_strand: 'Broken conductor strand', conductor_corrosion: 'Conductor corrosion', sag_excessive: 'Excessive sag', damper_displaced: 'Displaced vibration damper', damper_damaged: 'Damaged vibration damper', spacer_damaged: 'Damaged spacer', clamp_loose: 'Loose clamp (hot joint)', insulator_cracked: 'Cracked insulator', insulator_contaminated: 'Contaminated insulator', insulator_flashover_mark: 'Insulator flashover mark', insulator_missing_disc: 'Missing insulator disc', steel_corrosion: 'Tower steel corrosion', bent_member: 'Bent tower member', missing_bolt: 'Missing bolt', cotter_pin_missing: 'Missing cotter pin', foundation_cracked: 'Cracked foundation', foundation_erosion: 'Foundation erosion', earthwire_damaged: 'Damaged earthwire', arrester_damaged: 'Damaged surge arrester', bird_nest: 'Bird nest', sign_missing: 'Missing danger sign', vegetation_encroachment: 'Vegetation encroachment', structure_encroachment: 'Structure encroachment', oil_leak: 'Transformer oil leak', bushing_hotspot: 'Bushing hotspot', radiator_corrosion: 'Radiator corrosion', tank_damage: 'Tank damage',
};
/** condition_score 1 (worst) … 5 → severity */
export const SEVERITY = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low', 5: 'low' };
export const SEV_TONE = { critical: 'crit', high: 'high', medium: 'warn', low: 'ok' };
export const CORRIDOR = { 'L-132-01': 'Coastal', 'L-220-03': 'North', 'L-500-01': 'Inland' };
export const LINE_NAME = { 'L-132-01': 'L-132-01 Coastal 132 kV', 'L-220-03': 'L-220-03 Corridor North 220 kV', 'L-500-01': 'L-500-01 Inland 500 kV' };
export const kvColor = (kv) => KV_COLOR[kv] || '#64748b';

let cache = null;
export function loadNetwork() { if (!cache) cache = build(); return cache; }

async function build() {
  const snap = await loadSnapshot(repository);
  const all = await repository.getAll();
  const asOf = snap.asOf;
  const byId = snap.byId;
  const sc = (id) => snap.scores.get(id);

  /* ---------------------------------------------------------------- lines, towers, spans */
  const lineAssets = snap.assets.filter((a) => a.class === 'line');
  const towersRaw = snap.assets.filter((a) => a.class === 'tower' && a.location?.lat);
  const towerOf = (asset) => { let a = asset; for (let i = 0; i < 4 && a; i += 1) { if (a.class === 'tower') return a; if (a.ext?.from_tower && byId.get(a.ext.from_tower)) return byId.get(a.ext.from_tower); a = byId.get(a.parent_id); } return null; };
  const spanLine = (s) => s.parent_id;

  const towers = towersRaw.map((t) => {
    const s = sc(t.asset_id);
    const f = snap.findingsByOwner.get(t.asset_id) || [];
    const kv = t.voltage_kv;
    const age = 2026 - Number(String(t.install_date).slice(0, 4));
    return {
      id: t.asset_id, name: t.name, line: t.parent_id, kv, lat: t.location.lat, lng: t.location.lng,
      corridor: CORRIDOR[t.parent_id], type: t.ext?.tower_type, height: t.ext?.height_m, zone: t.ext?.corrosion_zone, idx: t.ext?.index,
      install: t.install_date, age, criticality: t.criticality,
      hi: s?.hi?.score ?? null, band: s?.hi?.band ?? null, risk: s?.risk?.score ?? null, riskBand: s?.risk?.band ?? null,
      riskFactors: s?.risk?.breakdown?.factors ?? null, hiGroups: s?.hi?.breakdown?.groups ?? [],
      findings: f, open: f.length, unreviewed: snap.unreviewedByOwner.get(t.asset_id) || 0,
      worst: f.reduce((m, x) => Math.min(m, x.condition_score ?? 5), 5),
      sap: t.external_ids?.sap, gis: t.external_ids?.gis,
    };
  });
  const towerById = new Map(towers.map((t) => [t.id, t]));
  const spans = snap.assets.filter((a) => a.class === 'span').map((s) => {
    const x = sc(s.asset_id);
    return { id: s.asset_id, name: s.name, line: spanLine(s), kv: s.voltage_kv, coords: s.location?.coordinates || [], length: s.ext?.length_m, clearance: s.ext?.min_clearance_m, hi: x?.hi?.score ?? null, band: x?.hi?.band ?? null, risk: x?.risk?.score ?? null, riskBand: x?.risk?.band ?? null, open: (snap.findingsByOwner.get(s.asset_id) || []).length, from: s.ext?.from_tower, to: s.ext?.to_tower };
  });
  const lines = lineAssets.map((l) => {
    const x = sc(l.asset_id);
    const ts = towers.filter((t) => t.line === l.asset_id).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
    return {
      id: l.asset_id, name: LINE_NAME[l.asset_id] || l.name, kv: l.voltage_kv, corridor: CORRIDOR[l.asset_id], coords: l.location?.coordinates || [], lengthKm: l.ext?.length_km,
      ends: l.ext?.end_substations || [], install: l.install_date, criticality: l.criticality, hi: x?.hi?.score ?? null, band: x?.hi?.band, risk: x?.risk?.score ?? null, riskBand: x?.risk?.band,
      bandCounts: x?.hi?.breakdown?.bandCounts, towers: ts, spans: spans.filter((s) => s.line === l.asset_id),
      rating: { 132: 145, 220: 420, 500: 1650 }[l.voltage_kv], // thermal rating, MVA (ACSR conductor at 35 °C ambient)
      color: kvColor(l.voltage_kv),
    };
  });

  /* ---------------------------------------------------------------- substations, transformers */
  const substations = snap.assets.filter((a) => a.class === 'substation').map((s) => ({
    id: s.asset_id, name: s.name, short: s.name.replace('Substation ', ''), lat: s.location.lat, lng: s.location.lng, levels: s.ext?.voltage_levels_kv || [s.voltage_kv], lines: s.ext?.lines_terminated || [], bays: s.ext?.bays, criticality: s.criticality,
  }));
  const transformers = snap.assets.filter((a) => a.class === 'power_transformer' && !a.merged_into).map((t) => {
    const x = sc(t.asset_id);
    const dga = all.dga.filter((d) => d.asset_id === t.asset_id).sort((a, b) => a.date.localeCompare(b.date));
    let sub = null; let a = t; for (let i = 0; i < 3 && a; i += 1) { if (a.class === 'substation') sub = a; a = byId.get(a.parent_id); }
    const dgaInput = x?.hi?.breakdown?.inputs?.find((i) => i.input === 'dga');
    return { id: t.asset_id, name: t.name, sub: sub?.asset_id, lat: t.location?.lat, lng: t.location?.lng, rating: t.ext?.rating_mva, ratio: t.ext?.voltage_ratio, maker: t.ext?.manufacturer, serial: t.ext?.serial, install: t.install_date, hi: x?.hi?.score ?? null, band: x?.hi?.band, risk: x?.risk?.score ?? null, riskBand: x?.risk?.band, dga, duval: dgaInput?.detail?.duval, worstGas: dgaInput?.detail?.worstGas, open: (snap.findingsByOwner.get(t.asset_id) || []).length };
  });

  /* ---------------------------------------------------------------- findings, work orders, repairs */
  const findings = all.findings.map((f) => {
    const asset = byId.get(f.asset_id);
    const tw = f.tower_id ? towerById.get(f.tower_id) : null;
    const line = tw?.line || (asset?.class === 'span' ? asset.parent_id : null);
    return { ...f, label: DEFECT_LABEL[f.defect_class] || f.defect_class, severity: SEVERITY[f.condition_score] || 'low', towerName: tw?.name, line, kv: tw?.kv || asset?.voltage_kv, lat: f.location?.lat, lng: f.location?.lng, assetName: asset?.name };
  });
  const findingById = new Map(findings.map((f) => [f.finding_id, f]));
  const UNIT = { 'fitting replacement': 3800, 'corridor clearing': 6200, 'insulator replacement': 5400, 'earthwire repair': 7400, 'conductor repair': 12800, 'foundation repair': 21500, 'steel repair': 9600, 'transformer repair': 46000 };
  const HOURS = { 'fitting replacement': 10, 'corridor clearing': 28, 'insulator replacement': 16, 'earthwire repair': 20, 'conductor repair': 36, 'foundation repair': 60, 'steel repair': 24, 'transformer repair': 80 };
  const crewsSeed = [
    { id: 'C-01', name: 'Live-Line Crew Alpha', base: 'DEP-S1', lead: 'R. Aliyev', skill: 'live-line', size: 6, vehicle: 'Insulated aerial lift · AZ-10-LL-201' },
    { id: 'C-02', name: 'Tower Steel Crew Bravo', base: 'DEP-S1', lead: 'K. Mammadova', skill: 'structures', size: 5, vehicle: 'Crane truck 25 t · AZ-10-ST-117' },
    { id: 'C-03', name: 'Stringing Crew Charlie', base: 'DEP-MID', lead: 'T. Huseynov', skill: 'conductor', size: 8, vehicle: 'Tensioner/puller set · AZ-90-CN-044' },
    { id: 'C-04', name: 'Insulator Crew Delta', base: 'DEP-MID', lead: 'S. Karimova', skill: 'insulators', size: 5, vehicle: 'Aerial lift 32 m · AZ-90-IN-058' },
    { id: 'C-05', name: 'Civil & Foundation Echo', base: 'DEP-S2', lead: 'E. Guliyev', skill: 'civil', size: 6, vehicle: 'Excavator + mixer · AZ-77-CV-302' },
    { id: 'C-06', name: 'ROW Vegetation Foxtrot', base: 'DEP-S2', lead: 'N. Ismayilov', skill: 'vegetation', size: 7, vehicle: 'Mulcher + chipper · AZ-77-VG-019' },
    { id: 'C-07', name: 'Substation HV Golf', base: 'DEP-S2', lead: 'L. Rzayeva', skill: 'substation', size: 4, vehicle: 'Oil-processing trailer · AZ-77-SS-410' },
    { id: 'C-08', name: 'Earthwire & OPGW Hotel', base: 'DEP-S1', lead: 'F. Nasirov', skill: 'conductor', size: 5, vehicle: 'Line truck · AZ-10-EW-226' },
  ];
  const SKILL_FOR = { 'fitting replacement': 'live-line', 'corridor clearing': 'vegetation', 'insulator replacement': 'insulators', 'earthwire repair': 'conductor', 'conductor repair': 'conductor', 'foundation repair': 'civil', 'steel repair': 'structures', 'transformer repair': 'substation' };
  const STATUS_FLOW = ['requested', 'approved', 'planned', 'scheduled', 'in_progress', 'completed'];
  const workOrders = all.workOrders.map((w, i) => {
    const asset = byId.get(w.asset_id);
    const tw = towerById.get(towerOf(asset)?.asset_id) || (asset?.class === 'span' ? towerById.get(asset.ext?.from_tower) : null) || null;
    const seg = asset?.class === 'span_corridor_segment' ? byId.get(asset.parent_id) : null;
    const tw2 = tw || (seg ? towerById.get(seg.ext?.from_tower) : null);
    const tx = asset?.class === 'power_transformer' ? transformers.find((t) => t.id === asset.asset_id) : (asset && byId.get(asset.parent_id)?.class === 'power_transformer' ? transformers.find((t) => t.id === asset.parent_id) : null);
    const loc = tw2 ? { lat: tw2.lat, lng: tw2.lng } : tx ? { lat: tx.lat, lng: tx.lng } : asset?.location?.lat ? { lat: asset.location.lat, lng: asset.location.lng } : null;
    const line = tw2?.line || (tx ? null : byId.get(asset?.parent_id)?.class === 'line' ? asset.parent_id : null);
    const skill = SKILL_FOR[w.work_type] || 'live-line';
    const crew = crewsSeed.filter((c) => c.skill === skill)[i % crewsSeed.filter((c) => c.skill === skill).length] || crewsSeed[i % crewsSeed.length];
    const fs = (w.finding_ids || []).map((id) => findingById.get(id)).filter(Boolean);
    const sev = fs.reduce((m, f) => Math.min(m, f.condition_score ?? 5), 5);
    const labour = HOURS[w.work_type] * (0.8 + R() * 0.6);
    const est = Math.round(UNIT[w.work_type] * (0.85 + R() * 0.5));
    // a richer lifecycle than open/in_progress/completed, for planning and approvals
    let stage = w.status === 'completed' ? 'completed' : w.status === 'in_progress' ? 'in_progress' : STATUS_FLOW[i % 4];
    if (w.status === 'open' && w.priority === 'high' && stage === 'requested') stage = 'approved';
    const ttrDays = w.completed_at ? daysBetween(fs[0]?.date || w.created_at, w.completed_at) : null;
    return {
      ...w, id: w.work_order_id, asset: asset?.name || w.asset_id, assetClass: asset?.class, towerId: tw2?.id, towerName: tw2?.name || tx?.name, line, kv: tw2?.kv || asset?.voltage_kv, corridor: line ? CORRIDOR[line] : 'Substation', lat: loc?.lat, lng: loc?.lng,
      crew: crew.id, crewName: crew.name, skill, stage, sevScore: sev, severity: SEVERITY[sev] || 'low', findings: fs,
      sap: `40${String(1250 + i).padStart(6, '0')}`, maximo: `WO-${71000 + i * 7}`, sync: pick(['synced', 'synced', 'synced', 'synced', 'pending', 'synced', 'conflict']).replace(/conflict/, i % 13 === 0 ? 'conflict' : 'synced'),
      estCost: est, labourH: round(labour, 0), materials: Math.round(est * 0.38), outage: ['conductor repair', 'insulator replacement', 'steel repair', 'earthwire repair', 'transformer repair'].includes(w.work_type), ttrDays,
    };
  });
  const repairs = all.repairs.map((r) => ({ ...r, wo: workOrders.find((w) => w.work_order_id === r.work_order_id) }));

  /* ---------------------------------------------------------------- depots, crews, people */
  const S1 = substations.find((s) => s.id === 'SUB-S1'); const S2 = substations.find((s) => s.id === 'SUB-S2');
  const l220 = lines.find((l) => l.id === 'L-220-03');
  const mid = l220.coords[Math.floor(l220.coords.length / 2)];
  const depots = [
    { id: 'DEP-S1', name: 'Northern Maintenance Depot', short: 'North Depot', lat: S1.lat - 0.012, lng: S1.lng + 0.006, kind: 'depot + warehouse', bins: 1840 },
    { id: 'DEP-MID', name: 'Central Line Stores', short: 'Central Stores', lat: mid[0] - 0.018, lng: mid[1] + 0.004, kind: 'line stores', bins: 960 },
    { id: 'DEP-S2', name: 'Eastern Grid Warehouse', short: 'East Warehouse', lat: S2.lat - 0.014, lng: S2.lng - 0.01, kind: 'main warehouse', bins: 3120 },
  ];
  const depotById = new Map(depots.map((d) => [d.id, d]));
  const crews = crewsSeed.map((c, i) => {
    const active = workOrders.filter((w) => w.crew === c.id && w.stage === 'in_progress');
    const at = active[0] && active[0].lat ? active[0] : null;
    const base = depotById.get(c.base);
    return { ...c, baseName: base.short, lat: at ? at.lat + 0.002 : base.lat + (i % 3) * 0.002, lng: at ? at.lng + 0.002 : base.lng + (i % 2) * 0.003, status: at ? 'on site' : i % 4 === 3 ? 'travelling' : 'available', job: at?.id || null, utilisation: Math.round(between(58, 94)), hoursWeek: Math.round(between(30, 46)) };
  });
  const FIRST = ['Rauf', 'Kamala', 'Tural', 'Sevinj', 'Elchin', 'Nijat', 'Leyla', 'Farid', 'Aysel', 'Orkhan', 'Gunay', 'Vugar', 'Nigar', 'Ramil', 'Aynur', 'Samir', 'Lala', 'Javid', 'Narmin', 'Emil', 'Togrul', 'Shahla', 'Murad', 'Zaur', 'Konul', 'Ilkin', 'Sabina', 'Rashad', 'Fidan', 'Anar', 'Arzu', 'Kanan', 'Ulvi', 'Gulnar', 'Habib', 'Parvin', 'Asif', 'Mehriban', 'Teymur', 'Jala', 'Bahruz', 'Samira', 'Rufat', 'Ilaha', 'Vusal', 'Lamiya', 'Elvin', 'Nazrin', 'Ruslan', 'Turkan'];
  const LAST = ['Aliyev', 'Mammadova', 'Huseynov', 'Karimova', 'Guliyev', 'Ismayilov', 'Rzayeva', 'Nasirov', 'Hasanova', 'Abbasov', 'Babayeva', 'Jafarov', 'Mustafayeva', 'Gasimov', 'Safarova', 'Valiyev', 'Ahmadova', 'Sadigov', 'Novruzova', 'Bagirov'];
  const ROLES = { 'live-line': ['Crew lead', 'Live-line linesman', 'Live-line linesman', 'Linesman', 'Safety observer', 'Lift operator'], structures: ['Crew lead', 'Steel erector', 'Steel erector', 'Rigger', 'Crane operator'], conductor: ['Crew lead', 'Stringing linesman', 'Linesman', 'Linesman', 'Winch operator', 'Rigger', 'Linesman', 'Driver'], insulators: ['Crew lead', 'Linesman', 'Linesman', 'Lift operator', 'Safety observer'], civil: ['Crew lead', 'Civil technician', 'Excavator operator', 'Concrete technician', 'Labourer', 'Surveyor'], vegetation: ['Crew lead', 'Arborist', 'Arborist', 'Mulcher operator', 'Labourer', 'Labourer', 'Safety observer'], substation: ['Crew lead', 'HV test engineer', 'Oil technician', 'Protection technician'] };
  const CERTS = [
    { id: 'HV-AUTH', name: 'HV Authorised Person (≥ 110 kV)', months: 36 }, { id: 'LIVE-LINE', name: 'Live-line working (bare-hand / hot-stick)', months: 24 },
    { id: 'WAH', name: 'Work at height & rescue (GWO/EN 363)', months: 24 }, { id: 'FIRST-AID', name: 'First aid at work', months: 36 }, { id: 'RIGGING', name: 'Rigging & slinging', months: 36 },
    { id: 'CRANE', name: 'Mobile crane operator', months: 60 }, { id: 'SF6', name: 'SF₆ gas handling (EU 2015/2066)', months: 60 }, { id: 'CHAINSAW', name: 'Chainsaw & tree felling', months: 36 }, { id: 'SWITCHING', name: 'Switching & earthing (Senior AP)', months: 36 },
  ];
  const CERT_FOR = { 'Crew lead': ['HV-AUTH', 'SWITCHING', 'WAH', 'FIRST-AID'], 'Live-line linesman': ['HV-AUTH', 'LIVE-LINE', 'WAH'], Linesman: ['HV-AUTH', 'WAH'], 'Stringing linesman': ['HV-AUTH', 'WAH', 'RIGGING'], 'Safety observer': ['FIRST-AID', 'HV-AUTH'], 'Lift operator': ['WAH'], 'Steel erector': ['WAH', 'RIGGING'], Rigger: ['RIGGING', 'WAH'], 'Crane operator': ['CRANE', 'RIGGING'], 'Winch operator': ['RIGGING'], 'Civil technician': ['FIRST-AID'], 'Excavator operator': ['FIRST-AID'], 'Concrete technician': [], Labourer: ['FIRST-AID'], Surveyor: [], Arborist: ['CHAINSAW', 'WAH'], 'Mulcher operator': ['CHAINSAW'], 'HV test engineer': ['HV-AUTH', 'SWITCHING', 'SF6'], 'Oil technician': ['HV-AUTH'], 'Protection technician': ['HV-AUTH', 'SWITCHING'], Driver: [] };
  const people = []; let pi = 0;
  for (const c of crews) {
    const roles = ROLES[c.skill].slice(0, c.size);
    roles.forEach((role, k) => {
      const name = k === 0 ? c.lead.replace(/^(\w)\. /, (m, a) => `${FIRST.find((f) => f[0] === a) || a} `) : `${FIRST[(pi * 7 + 3) % FIRST.length]} ${LAST[(pi * 3 + 5) % LAST.length]}`;
      const certs = (CERT_FOR[role] || []).map((cid) => {
        const def = CERTS.find((x) => x.id === cid);
        const expires = addDays(asOf, int(-25, def.months * 30));
        return { id: cid, name: def.name, expires, state: expires < asOf ? 'expired' : daysBetween(asOf, expires) <= 60 ? 'expiring' : 'valid' };
      });
      people.push({ id: `EMP-${String(1001 + pi).padStart(4, '0')}`, name, role, crew: c.id, crewName: c.name, certs, hoursWeek: Math.round(between(32, 52)), fatigue: Math.round(between(10, 75)), years: int(1, 28) });
      pi += 1;
    });
  }

  /* ---------------------------------------------------------------- parts, suppliers, stock */
  const suppliers = [
    { id: 'SUP-01', name: 'Caspian Line Hardware LLC', country: 'Azerbaijan', otd: 96, lead: 12, quality: 99.1, spend: 0, cat: 'Fittings & dampers' },
    { id: 'SUP-02', name: 'Anatolia Insulator Works', country: 'Türkiye', otd: 88, lead: 34, quality: 98.4, spend: 0, cat: 'Insulators' },
    { id: 'SUP-03', name: 'Rhein Conductor GmbH', country: 'Germany', otd: 91, lead: 56, quality: 99.6, spend: 0, cat: 'Conductor & OPGW' },
    { id: 'SUP-04', name: 'Kura Steel Fabrication', country: 'Azerbaijan', otd: 79, lead: 21, quality: 96.8, spend: 0, cat: 'Tower steel' },
    { id: 'SUP-05', name: 'Nordic Transformer Services', country: 'Sweden', otd: 93, lead: 84, quality: 99.3, spend: 0, cat: 'Transformer spares' },
    { id: 'SUP-06', name: 'Absheron Civil Supplies', country: 'Azerbaijan', otd: 97, lead: 5, quality: 97.9, spend: 0, cat: 'Civil & concrete' },
    { id: 'SUP-07', name: 'Gulf Surge Protection Co.', country: 'UAE', otd: 85, lead: 28, quality: 98.0, spend: 0, cat: 'Arresters & earthing' },
  ];
  const PARTS = [
    ['VD-4R-ACSR', 'Stockbridge damper 4R, ACSR 400/51', 'Dampers', ['damper_displaced', 'damper_damaged'], 86, 'SUP-01', 'ea'],
    ['SP-QUAD-450', 'Quad-bundle spacer damper 450 mm', 'Dampers', ['spacer_damaged'], 142, 'SUP-01', 'ea'],
    ['INS-CL-120', 'Glass cap-and-pin disc U120BS', 'Insulators', ['insulator_missing_disc', 'insulator_cracked', 'insulator_flashover_mark'], 38, 'SUP-02', 'ea'],
    ['INS-LR-220', 'Composite long-rod insulator 220 kV, 120 kN', 'Insulators', ['insulator_cracked', 'insulator_contaminated', 'insulator_flashover_mark'], 410, 'SUP-02', 'ea'],
    ['INS-LR-500', 'Composite long-rod insulator 500 kV, 210 kN', 'Insulators', ['insulator_cracked', 'insulator_contaminated'], 1180, 'SUP-02', 'ea'],
    ['RS-ACSR-400', 'Full-tension repair sleeve ACSR 400/51', 'Conductor', ['broken_strand', 'conductor_corrosion'], 64, 'SUP-03', 'ea'],
    ['CND-ACSR-400', 'ACSR 400/51 conductor (drum 2 km)', 'Conductor', ['broken_strand', 'conductor_corrosion', 'sag_excessive'], 18600, 'SUP-03', 'drum'],
    ['OPGW-48F', 'OPGW 48-fibre earthwire (drum 4 km)', 'Conductor', ['earthwire_damaged'], 23900, 'SUP-03', 'drum'],
    ['STL-L90', 'Galvanised angle L90×8, 6 m', 'Tower steel', ['bent_member', 'steel_corrosion'], 96, 'SUP-04', 'ea'],
    ['BLT-M20-HDG', 'Bolt set M20 HDG grade 8.8 (box 50)', 'Tower steel', ['missing_bolt'], 74, 'SUP-04', 'box'],
    ['CP-SS-8', 'Stainless cotter pin 8 mm (box 100)', 'Fittings', ['cotter_pin_missing'], 22, 'SUP-01', 'box'],
    ['SC-SUS-400', 'Suspension clamp AGS, ACSR 400', 'Fittings', ['clamp_loose'], 58, 'SUP-01', 'ea'],
    ['ZRP-PAINT-20', 'Zinc-rich epoxy primer 20 L', 'Tower steel', ['steel_corrosion'], 188, 'SUP-04', 'pail'],
    ['GRT-FND-25', 'Non-shrink grout 25 kg', 'Civil', ['foundation_cracked', 'foundation_erosion'], 19, 'SUP-06', 'bag'],
    ['GAB-2X1', 'Gabion basket 2×1×1 m', 'Civil', ['foundation_erosion'], 64, 'SUP-06', 'ea'],
    ['SA-ZNO-220', 'ZnO surge arrester 220 kV class', 'Arresters', ['arrester_damaged'], 2350, 'SUP-07', 'ea'],
    ['DS-SIGN-HV', 'HV danger plate + anti-climb sign kit', 'Fittings', ['sign_missing'], 31, 'SUP-01', 'kit'],
    ['BD-DIVERT', 'Bird diverter / nest guard', 'Fittings', ['bird_nest'], 27, 'SUP-01', 'ea'],
    ['TX-GSK-KIT', 'Transformer gasket kit (nitrile, main tank)', 'Transformer', ['oil_leak', 'tank_damage'], 1240, 'SUP-05', 'kit'],
    ['TX-BSH-245', 'OIP condenser bushing 245 kV', 'Transformer', ['bushing_hotspot'], 28400, 'SUP-05', 'ea'],
    ['TX-OIL-IEC', 'Inhibited mineral oil IEC 60296 (1,000 L IBC)', 'Transformer', ['oil_leak'], 2650, 'SUP-05', 'IBC'],
    ['TX-RAD-PNL', 'Radiator panel 520 mm, galvanised', 'Transformer', ['radiator_corrosion'], 1980, 'SUP-05', 'ea'],
  ];
  const demandBy = {}; for (const f of findings) if (f.review_status !== 'rejected') demandBy[f.defect_class] = (demandBy[f.defect_class] || 0) + 1;
  const parts = PARTS.map(([sku, name, cat, defects, cost, sup, uom], i) => {
    const demand = defects.reduce((a, d) => a + (demandBy[d] || 0), 0);
    const scaleQty = cost > 5000 ? 0.15 : cost > 1000 ? 0.6 : 3;
    const min = Math.max(2, Math.round(demand * scaleQty * 0.35));
    const max = Math.max(min + 4, Math.round(min * 3.2));
    const stock = Object.fromEntries(depots.map((d, k) => [d.id, Math.max(0, Math.round((max / 2.4) * (0.2 + R() * 1.1) * (k === 2 ? 1.3 : 0.8)) - (i % 5 === 0 && k === 0 ? 6 : 0))]));
    const onHand = Object.values(stock).reduce((a, b) => a + b, 0);
    const reserved = Math.round(onHand * between(0.05, 0.45));
    const supp = suppliers.find((s) => s.id === sup);
    supp.spend += cost * demand * scaleQty * 1.4;
    return { sku, name, cat, defects, unitCost: cost, supplier: sup, supplierName: supp.name, uom, lead: Math.round(supp.lead * between(0.85, 1.25)), min, max, stock, onHand, reserved, available: onHand - reserved, demand, monthly: round(demand * scaleQty / 10, 1), critical: cost > 1000 || defects.some((d) => ['broken_strand', 'insulator_cracked', 'bushing_hotspot'].includes(d)) };
  });

  /* ---------------------------------------------------------------- permits */
  const PERMIT_TYPES = [['PTW-HV', 'HV permit-to-work'], ['LLW', 'Live-line work permit'], ['SFT', 'Sanction for test'], ['HOT', 'Hot-work permit'], ['EXC', 'Excavation permit'], ['WAH', 'Work-at-height permit']];
  const permits = workOrders.filter((w) => w.stage !== 'completed' && w.stage !== 'requested').map((w, i) => {
    const [code, type] = w.work_type === 'foundation repair' ? PERMIT_TYPES[4] : w.work_type === 'fitting replacement' ? PERMIT_TYPES[1] : w.work_type === 'transformer repair' ? PERMIT_TYPES[2] : w.work_type === 'steel repair' ? PERMIT_TYPES[3 + (i % 3 === 0 ? 0 : 2)] : PERMIT_TYPES[0];
    const state = w.stage === 'in_progress' ? 'active' : w.stage === 'scheduled' ? pick(['issued', 'approved', 'pending isolation']) : w.stage === 'planned' ? pick(['draft', 'submitted']) : 'draft';
    const checks = [
      ['Work order approved', true], ['Crew qualified for voltage level', i % 9 !== 4], ['Switching programme approved', state !== 'draft'], ['Isolation points locked & tagged', ['active', 'issued'].includes(state)],
      ['Portable earths applied & proved dead', state === 'active'], ['Toolbox talk recorded', state === 'active'], ['Weather window confirmed (< 10 m/s)', true],
    ];
    return { id: `${code}-${2600 + i}`, code, type, wo: w.id, woRef: w, crew: w.crew, crewName: w.crewName, asset: w.towerName || w.asset, line: w.line, state, issued: addDays(asOf, -int(0, 6)), expires: addDays(asOf, int(0, 5)), authorisedBy: pick(['Senior AP: L. Rzayeva', 'Senior AP: R. Aliyev', 'Control: Dispatcher 2']), checks, lat: w.lat, lng: w.lng, isolation: w.outage ? `${w.line || 'Bay'} — Q0/Q9 open, Q8 earthed both ends` : 'No isolation — live-line method' };
  });

  /* ---------------------------------------------------------------- telemetry tags (SCADA/EMS) */
  defineGridTags(lines, transformers, substations);

  /* ---------------------------------------------------------------- search index */
  const searchIndex = [
    ...towers.map((t) => ({ kind: 'tower', id: t.id, label: `${t.name} · ${t.line}`, sub: `Tower · HI ${t.hi ?? '—'} · ${t.open} open findings`, icon: 'tower' })),
    ...lines.map((l) => ({ kind: 'line', id: l.id, label: l.name, sub: `${l.lengthKm} km · ${l.towers.length} towers`, icon: 'line' })),
    ...transformers.map((t) => ({ kind: 'transformer', id: t.id, label: `${t.name} · ${t.rating} MVA`, sub: `Transformer · ${t.ratio} kV · HI ${t.hi ?? '—'}`, icon: 'transformer' })),
    ...workOrders.map((w) => ({ kind: 'wo', id: w.id, label: `${w.id} · ${w.work_type}`, sub: `${w.towerName || w.asset} · ${w.stage}`, icon: 'clipboard' })),
    ...crews.map((c) => ({ kind: 'crew', id: c.id, label: `${c.id} · ${c.name}`, sub: `${c.status} · ${c.baseName}`, icon: 'users' })),
  ];

  return { asOf, snap, repo: repository, all, lines, towers, towerById, spans, substations, transformers, findings, findingById, workOrders, repairs, depots, crews, people, certs: CERTS, parts, suppliers, permits, searchIndex, byId };
}

/** SCADA/EMS tags for every line and transformer: loading (MW/MVA), current, voltage, conductor temp, oil temps. */
function defineGridTags(lines, transformers, substations) {
  const LOAD = { 'L-132-01': 0.58, 'L-220-03': 0.78, 'L-500-01': 0.52 };
  for (const l of lines) {
    const id = l.id; const rating = l.rating; const pu = LOAD[id] || 0.6;
    live.define(`${id}.MW`, { base: rating * pu * 0.96, noise: rating * 0.006, rev: 0.06, dec: 0, unit: 'MW', desc: `${id} active power` });
    live.define(`${id}.MVAR`, { base: rating * pu * 0.22, noise: rating * 0.004, rev: 0.08, dec: 0, unit: 'Mvar', desc: `${id} reactive power` });
    live.define(`${id}.LOAD`, { fn: () => { const p = live.get(`${id}.MW`); const q = live.get(`${id}.MVAR`); return (Math.hypot(p, q) / rating) * 100; }, dec: 1, unit: '%', h: 90, hh: 100, desc: `${id} loading` });
    live.define(`${id}.I`, { fn: () => (Math.hypot(live.get(`${id}.MW`), live.get(`${id}.MVAR`)) * 1000) / (Math.sqrt(3) * l.kv), dec: 0, unit: 'A', desc: `${id} current` });
    live.define(`${id}.KV`, { base: l.kv * 1.012, noise: l.kv * 0.0015, rev: 0.1, dec: 1, unit: 'kV', h: l.kv * 1.05, l: l.kv * 0.95, desc: `${id} voltage` });
    live.define(`${id}.TC`, { fn: () => 28 + (live.get(`${id}.LOAD`) / 100) ** 2 * 52, dec: 1, unit: '°C', h: 75, hh: 85, desc: `${id} conductor temperature` });
    live.define(`${id}.SAG`, { fn: () => 8.2 + (live.get(`${id}.TC`) - 28) * 0.045, dec: 2, unit: 'm', desc: `${id} mid-span sag` });
  }
  for (const s of substations) {
    live.define(`${s.id}.F`, { base: 50, noise: 0.008, rev: 0.25, dec: 3, unit: 'Hz', h: 50.2, l: 49.8, desc: `${s.short} frequency` });
    for (const kv of s.levels) live.define(`${s.id}.BUS${kv}`, { base: kv * 1.01, noise: kv * 0.0012, rev: 0.12, dec: 1, unit: 'kV', h: kv * 1.05, l: kv * 0.95, desc: `${s.short} ${kv} kV busbar voltage` });
  }
  transformers.forEach((t, i) => {
    const pu = [0.62, 0.71, 0.55, 0.82, 0.6, 0.66, 0.5][i % 7];
    const hot = t.band === 'poor' || t.duval?.zone === 'D2' || t.duval?.zone === 'T2';
    live.define(`${t.id}.MVA`, { base: (t.rating || 150) * pu, noise: (t.rating || 150) * 0.006, rev: 0.06, dec: 1, unit: 'MVA', desc: `${t.id} load` });
    live.define(`${t.id}.AMB`, { base: 21, noise: 0.05, rev: 0.02, dec: 1, unit: '°C', desc: 'Ambient temperature' });
    live.define(`${t.id}.TOT`, { fn: () => live.get(`${t.id}.AMB`) + 38 * ((live.get(`${t.id}.MVA`) / (t.rating || 150)) ** 2 * 6 + 1) / 7 + (hot ? 8 : 0), dec: 1, unit: '°C', h: 85, hh: 95, desc: `${t.id} top-oil temperature` });
    live.define(`${t.id}.HST`, { fn: () => live.get(`${t.id}.TOT`) + 23 * (live.get(`${t.id}.MVA`) / (t.rating || 150)) ** 1.6, dec: 1, unit: '°C', h: 98, hh: 110, desc: `${t.id} winding hot-spot` });
    live.define(`${t.id}.H2`, { base: t.dga?.[t.dga.length - 1]?.h2 ?? 40, noise: 0.6, rev: 0.03, dec: 0, unit: 'ppm', h: 150, hh: 300, desc: `${t.id} dissolved H₂ (online DGA)` });
    live.define(`${t.id}.C2H2`, { base: t.dga?.[t.dga.length - 1]?.c2h2 ?? 0.5, noise: 0.05, rev: 0.04, min: 0, dec: 1, unit: 'ppm', h: 2, hh: 10, desc: `${t.id} dissolved C₂H₂ (online DGA)` });
    live.define(`${t.id}.MOIST`, { base: 9 + i, noise: 0.15, rev: 0.05, dec: 1, unit: 'ppm', h: 25, desc: `${t.id} moisture in oil` });
    live.define(`${t.id}.TAP`, { base: 9 + (i % 3), noise: 0, rev: 0, dec: 0, unit: '', desc: `${t.id} OLTC tap position` });
  });
}

/* ---------------------------------------------------------------- shared map layers */
/** Lines + substations as map layers. Every module adds its own point layers on top. */
export function networkLayers(net, { onLine, linesOn = true, showSubs = true, towers = false, towerColor, towerInfo, towerFilter, subsInfo } = {}) {
  const layers = [{
    id: 'lines', name: 'Transmission lines', color: '#3b82f6', shape: 'line', on: linesOn,
    lines: net.lines.map((l) => ({ id: l.id, coords: l.coords, color: l.color, weight: 4, casing: true, label: l.name, search: `${l.corridor} corridor`, tip: `${l.name} · ${l.lengthKm} km`, info: onLine ? () => onLine(l) : undefined })),
  }];
  if (showSubs) {
    layers.push({
      id: 'subs', name: 'Substations', color: '#0f172a', shape: 'sq',
      points: net.substations.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, size: 22, shape: 'sq', color: '#0f172a', icon: 'substation', label: s.short, z: 900, search: s.name, tip: `${s.name} · ${s.levels.join('/')} kV`, info: subsInfo ? () => subsInfo(s) : undefined })),
    });
  }
  if (towers) {
    const list = towerFilter ? net.towers.filter(towerFilter) : net.towers;
    layers.push({ id: 'towers', name: 'Towers', color: '#16a34a', points: list.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, size: t.band === 'poor' ? 14 : 10, color: towerColor ? towerColor(t) : '#16a34a', pulse: t.riskBand === 'critical', label: null, search: `${t.name} ${t.line}`, tip: `${t.name} · ${t.line} · HI ${t.hi ?? '—'}`, info: towerInfo ? () => towerInfo(t) : undefined })) });
  }
  return layers;
}
