// Reliability module configuration.
//
// ASSUMPTIONS (taken from the plan's defaults because the open questions are unanswered).
// Change a value here and every module follows. Each item names the plan question it covers.
//
//  A1. "Labs" in the meeting notes means LABELS (shared tags from a managed list), not a separate
//      Labs feature area. [plan open question 1]
//  A2. Transformers are DEMO data. The seed generates DGA, oil and test values; there is no real
//      DGA or test data to load. [open question 4]
//  A3. Health-index weights are EQUAL for all eight line component groups and all five transformer
//      inputs until the client's engineering team supplies values. [open question 5]
//  A4. Health bands: normal at HI >= 70, moderate 40-69, poor < 40. The cut-offs are the plan's
//      examples, not client values. [open question 5]
//  A5. Link thresholds are placeholders: auto-link at score >= 0.90, review queue 0.60-0.90,
//      dropped below 0.60. To be tuned with Musharraf on real data. [open question 2]
//  A6. Proposed links are confirmed by reliability engineers (the plan leaves this open; the config
//      only records the role name used in audit fields). [open question 3]
//  A7. The mapping of the 23 line defect classes to the eight component groups below is a DRAFT
//      for review, not one-to-one by agreement. [open question 6]
//  A8. Four extra transformer visual/thermal defect classes (TX_DEFECT_CLASSES) are not among the
//      23 line classes. The plan wants transformer visual findings but names no classes for them.
//  A9. Inspection intervals for the freshness rule are 180 days for line assets and 365 for
//      transformers and substations. They are invented defaults.
//  A10. The condition scale is 1 (very poor) to 5 (very good); criticality and consequence are 1-5.
//
//  A11. UNREVIEWED FINDINGS COUNT. Findings that are confirmed or still AI-proposed (review_status
//      'pending') feed scores; rejected findings never do. Breakdowns flag the unreviewed ones.
//      Set scoring.countUnreviewedFindings to false to count confirmed findings only.
//  A12. A repair closes the findings it lists from its date onwards, and the repaired component is
//      scored as fully restored (condition 5) until new evidence says otherwise.
//  A13. NOT ASSESSED (confirmed by the project owner: flown with no findings = 100, never inspected = null). An asset with no evidence on or before asOf gets HI null and is left out of
//      roll-ups. Evidence is any finding (even a rejected one) or being flown in a completed
//      campaign. A transformer needs at least one of DGA, oil, tests or visual evidence; age alone
//      is not evidence. Review status is not time-versioned: the status in the data is used for
//      every asOf.
//      A campaign only counts as having flown an asset that existed when the campaign ended (install_date).
//  A14. WORST COMPONENT CAPS ITS GROUP with margin 0: a group scores the same as its worst
//      component. A margin above 0 lets the group average rise above the worst by that much.
//  A15. LINE HI is the length-weighted mean of assessed towers and spans. A tower's weight is half
//      the length of each adjoining span. It is not capped by the worst asset.
//  A16. TRANSFORMER SUB-SCORES. DGA limits are the IEEE C57.104-2008 condition 1-3 gas limits (ppm),
//      scored 100 at/below condition 1, 70 at condition 2, 35 at condition 3, 0 at twice the
//      condition 3 limit. Oil, age, test and trend settings are invented defaults for the demo.
//      The Duval triangle zone is reported as data and does not change the score.
//  A17. CONSEQUENCE comes from voltage level until safety, outage cost and environment data exist.
//      Criticality is the asset's own 1-5 value.
//  A18. LINKED UPLIFT. Over confirmed electrical links, each linked asset in the poor band adds 1 to
//      consequence (line assets look at the transformers they feed; transformers look at the lines
//      feeding them), at most +2, consequence capped at 5. Risk bands low/medium/high/critical at
//      200/500/1000 are invented defaults.
//  A19. CONDITION-LIMITING CAP (tower and span only). After the weighted group average, the score is
//      scaled into the band set by the worst group, so capped assets still differ by the rest of their
//      condition: condition 1 -> poor: capped = 39.9 x uncapped / 100; condition 2 -> moderate:
//      capped = 40 + (69.9 - 40) x uncapped / 100 (bands.poorBelow / bands.normalMin, minus
//      capStepBelowBandTop). The mapping is scoring.conditionCap. A cap never raises a score. Line HI is
//      not capped: it stays the length-weighted mean of the capped tower and span HIs.
//  A20. MANAGED LABELS (A1) are the fixed list in MANAGED_LABELS below. The seed may only use labels
//      from it; a typo throws. Failure-mode labels are the defect class ids.
//  A21. RESEMBLANCE. Four signals (identifier, attribute, spatial, visual) are combined as a weighted
//      mean of the signals that exist for a pair. Name-only identifier matches score 0.85, a shared
//      serial or external id 1.0. Records with clearly different identifiers (a differing short or
//      numeric token, such as string A and string B) are capped at 0.45, whatever else matches. Pairs
//      further apart than the spatial gate are not comparable. Visual similarity is a STUB over seeded
//      feature vectors, not an image model: it marks the place for Musharraf's model.
//  A22. RULE LINKS. A finding is linked to the nearest tower within 60 m, else the nearest span within
//      60 m. A line is linked to a substation when its end tower is within 500 m (spatial) or the line
//      lists it as an end substation (electrical). Rules only add links the data does not already have.
//
// Reference date for all seed data is fixed so screenshots and tests are stable.

/** Eight line component groups used in transmission-line health-index studies. */
export const LINE_GROUPS = Object.freeze([
  'conductor', 'conductor_accessories', 'insulators', 'steel_structure',
  'foundation', 'lightning_protection', 'tower_accessories', 'right_of_way',
]);

/** Five transformer health inputs: the four standard ones plus visual/thermal findings. */
export const TX_INPUTS = Object.freeze(['dga', 'oil', 'age', 'tests', 'visual']);

/** The 23 line defect classes with their draft component group (assumption A7). */
export const DEFECT_CLASSES = Object.freeze([
  { id: 'broken_strand', label: 'Broken strand', group: 'conductor' },
  { id: 'conductor_corrosion', label: 'Conductor corrosion', group: 'conductor' },
  { id: 'sag_excessive', label: 'Excessive sag', group: 'conductor' },
  { id: 'damper_displaced', label: 'Damper displaced', group: 'conductor_accessories' },
  { id: 'damper_damaged', label: 'Damper damaged', group: 'conductor_accessories' },
  { id: 'spacer_damaged', label: 'Spacer damaged', group: 'conductor_accessories' },
  { id: 'clamp_loose', label: 'Clamp loose or hot', group: 'conductor_accessories' },
  { id: 'insulator_cracked', label: 'Insulator cracked', group: 'insulators' },
  { id: 'insulator_contaminated', label: 'Insulator contaminated', group: 'insulators' },
  { id: 'insulator_flashover_mark', label: 'Insulator flashover mark', group: 'insulators' },
  { id: 'insulator_missing_disc', label: 'Insulator disc missing', group: 'insulators' },
  { id: 'steel_corrosion', label: 'Steel corrosion', group: 'steel_structure' },
  { id: 'bent_member', label: 'Bent member', group: 'steel_structure' },
  { id: 'missing_bolt', label: 'Missing bolt', group: 'steel_structure' },
  { id: 'cotter_pin_missing', label: 'Cotter pin missing', group: 'steel_structure' },
  { id: 'foundation_cracked', label: 'Foundation cracked', group: 'foundation' },
  { id: 'foundation_erosion', label: 'Foundation erosion', group: 'foundation' },
  { id: 'earthwire_damaged', label: 'Earthwire damaged', group: 'lightning_protection' },
  { id: 'arrester_damaged', label: 'Arrester damaged', group: 'lightning_protection' },
  { id: 'bird_nest', label: 'Bird nest', group: 'tower_accessories' },
  { id: 'sign_missing', label: 'Sign or plate missing', group: 'tower_accessories' },
  { id: 'vegetation_encroachment', label: 'Vegetation encroachment', group: 'right_of_way' },
  { id: 'structure_encroachment', label: 'Structure encroachment', group: 'right_of_way' },
]);

/** Transformer visual/thermal defect classes (assumption A8). */
export const TX_DEFECT_CLASSES = Object.freeze([
  { id: 'oil_leak', label: 'Oil leak', group: 'tx_visual' },
  { id: 'bushing_hotspot', label: 'Bushing hot spot', group: 'tx_visual' },
  { id: 'radiator_corrosion', label: 'Radiator corrosion', group: 'tx_visual' },
  { id: 'tank_damage', label: 'Tank damage', group: 'tx_visual' },
]);

function deepFreeze(obj) {
  Object.values(obj).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(obj);
}

const equal = (keys) => Object.fromEntries(keys.map((k) => [k, 1]));

/** Label kinds (assumption A1: labels, not a Labs feature area). */
export const LABEL_KINDS = Object.freeze([
  'corridor', 'circuit', 'substation', 'region', 'corrosion_zone', 'criticality_class', 'manufacturer', 'design_family', 'failure_mode',
]);

/** The managed label list (A20). A label id is `${kind}:${slug(value)}`. */
export const MANAGED_LABELS = deepFreeze({
  corridor: ['Corridor North', 'Corridor Coastal', 'Corridor Inland'],
  circuit: ['L-132-01', 'L-220-03', 'L-500-01'],
  substation: ['Substation S-1', 'Substation S-2'],
  region: ['Region North', 'Region Central', 'Region East'],
  corrosion_zone: ['C2', 'C3', 'C4'],
  criticality_class: ['A', 'B', 'C', 'D'],
  manufacturer: [
    'Northwind Ceramics', 'Kestrel Glassworks', 'Halden Polymer', 'Vortex Dynamics', 'Stockline Fittings', 'Aurelian Power', 'Brandt Transformers',
  ],
  design_family: ['Lattice-Y1', 'Lattice-Z2', 'Lattice-X5', 'AP-150', 'BT-150', 'AP-400', 'BT-400'],
  failure_mode: [...DEFECT_CLASSES, ...TX_DEFECT_CLASSES].map((d) => d.id),
});

export const CONFIG = deepFreeze({
  labels: MANAGED_LABELS,
  condition: { min: 1, max: 5 },

  // A3: equal weights. Weights are relative, not required to sum to 1.
  weights: {
    lineGroups: equal(LINE_GROUPS),
    txInputs: equal(TX_INPUTS),
  },

  // A4: normal >= normalMin, poor < poorBelow, moderate in between.
  bands: { normalMin: 70, poorBelow: 40 },

  scoring: {
    countUnreviewedFindings: true,       // A11
    groupCapMargin: 0,                   // A14
    // A19: group condition (rounded) -> band the asset's score is scaled into. Bands come from `bands`.
    conditionCap: { 1: 'poor', 2: 'moderate' },
    capStepBelowBandTop: 0.1,            // top of a band = its upper bound minus this step
    // Groups scored for each kind of owner. A span owns its conductor, spacers and corridor.
    ownerGroups: {
      tower: ['insulators', 'steel_structure', 'foundation', 'conductor_accessories', 'lightning_protection', 'tower_accessories'],
      span: ['conductor', 'conductor_accessories', 'right_of_way'],
    },
    // The owner itself counts as a component of these groups.
    ownerSelfGroups: { tower: ['steel_structure', 'tower_accessories'], span: [] },
    // Which group each component class belongs to (used to count components with no findings).
    componentGroupByClass: {
      insulator_string: 'insulators', damper: 'conductor_accessories', spacer: 'conductor_accessories',
      clamp: 'conductor_accessories', jumper: 'conductor_accessories', conductor: 'conductor',
      earthwire: 'lightning_protection', arrester: 'lightning_protection', bird_diverter: 'tower_accessories',
      foundation: 'foundation', span_corridor_segment: 'right_of_way',
    },
  },

  // A16
  transformer: {
    dga: {
      gases: ['h2', 'ch4', 'c2h6', 'c2h4', 'c2h2', 'co'],
      // [condition 1 max, condition 2 max, condition 3 max] in ppm
      limits: { h2: [100, 700, 1800], ch4: [120, 400, 1000], c2h6: [65, 100, 150], c2h4: [50, 100, 200], c2h2: [1, 9, 35], co: [350, 570, 1400] },
      scoreAtLimits: [100, 70, 35],
      zeroAtTimesLimit3: 2,
      trend: { windowDays: 365, minGrowthRatio: 1.25, fullPenaltyRatio: 3, maxPenalty: 30, floorPpm: 1, minLevelFractionOfLimit1: 0.25 },
    },
    oil: {
      moisture_ppm: { good: 10, poor: 35 },
      acidity_mgkoh_g: { good: 0.05, poor: 0.2 },
      breakdown_kv: { good: 60, poor: 30 },
    },
    age: { fullScoreUntilYears: 15, zeroAtYears: 50 },
    tests: { pass: 100, watch: 60, fail: 20 },
  },

  // A17, A18. Risk = (100 - HI) x criticality x consequence, both 1-5.
  risk: {
    criticalityRange: [1, 5],
    consequenceRange: [1, 5],
    consequenceByVoltageKv: [[500, 5], [220, 4], [132, 3], [0, 2]],   // first row whose kV <= asset kV
    linkedUplift: {
      enabled: true,
      linkTypes: ['electrical'],
      maxHops: 2,
      linkedBand: 'poor',
      perPoorLinkedAsset: 1,
      maxUplift: 2,
      maxConsequence: 5,
    },
    bands: { mediumAtOrAbove: 200, highAtOrAbove: 500, criticalAtOrAbove: 1000 },
  },

  // The Risk Map. Tiles are the one thing fetched from outside the site; if they fail to load (offline, blocked) the map
  // shows lines and towers on a plain background. clusterPx: findings closer than this on screen share a marker.
  map: { tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', tileErrorLimit: 3, clusterPx: 36 },

  // A5, A6, A21, A22.
  linking: {
    autoLinkAtOrAbove: 0.9,       // score >= this: linked automatically and logged
    dropBelow: 0.6,               // score below this: dropped; in between: Link Review queue
    spatialMaxMeters: { findingToTower: 60, findingToSpan: 60, lineEndToSubstation: 500 },
    confirmerRole: 'reliability_engineer',
    blocking: { cellMeters: 100 },
    // Asset suggestions for "Link to asset" in the finding viewer: which assets could this finding be about?
    suggest: {
      gateMeters: 60,            // candidates must be this close to the finding's GPS (the current asset is always listed)
      maxResults: 6,
      weights: { spatial: 0.5, classFit: 0.5 },
      ownerFit: 0.4,             // a tower, span or transformer when the exact component is not identified
      // where each kind of defect is recorded: the asset classes it can belong to
      defectTargets: {
        broken_strand: ['conductor'], conductor_corrosion: ['conductor'], sag_excessive: ['conductor'], spacer_damaged: ['conductor'],
        damper_displaced: ['damper'], damper_damaged: ['damper'], clamp_loose: ['insulator_string'],
        insulator_cracked: ['insulator_string'], insulator_contaminated: ['insulator_string'], insulator_flashover_mark: ['insulator_string'], insulator_missing_disc: ['insulator_string'],
        steel_corrosion: ['tower'], bent_member: ['tower'], missing_bolt: ['tower'], cotter_pin_missing: ['tower'], arrester_damaged: ['tower'], bird_nest: ['tower'], sign_missing: ['tower'],
        foundation_cracked: ['foundation'], foundation_erosion: ['foundation'], earthwire_damaged: ['earthwire'],
        vegetation_encroachment: ['span_corridor_segment'], structure_encroachment: ['span_corridor_segment'],
        oil_leak: ['tank_oil'], bushing_hotspot: ['bushing'], radiator_corrosion: ['cooling'], tank_damage: ['tank_oil'],
      },
    },
    resemblance: {
      weights: {
        asset: { identifier: 0.4, attribute: 0.3, spatial: 0.3 },
        finding: { identifier: 0.3, attribute: 0.15, spatial: 0.25, visual: 0.3 },
      },
      nameOnlyIdentifierScore: 0.85,
      distinctIdentifierCap: 0.45,
      spatialGateMeters: { asset: 50, finding: 40 },   // farther apart than this: not comparable
      visual: { minCosine: 0.3, fullCosine: 0.9 },     // STUB mapping from cosine to 0-1
    },
  },

  // A9: days after which a score is shown as stale.
  freshness: {
    inspectionIntervalDays: {
      line_network: 180, structure: 180, line_component: 180, right_of_way: 180,
      substation: 365, transformer: 365,
    },
  },

  // Seed generator parameters (plan, Technical approach: Seed data).
  seed: {
    seed: 20261111,
    referenceDate: '2026-11-11',
    lines: [
      { id: 'L-132-01', kv: 132, towers: 40, corridor: 'Coastal', region: 'North', spacingM: 300 },
      { id: 'L-220-03', kv: 220, towers: 60, corridor: 'North', region: 'Central', spacingM: 380 },
      { id: 'L-500-01', kv: 500, towers: 50, corridor: 'Inland', region: 'East', spacingM: 450 },
    ],
    campaigns: [
      { id: 'CMP-2026-Q1', name: '2026 Q1', start: '2026-02-02', days: 24 },
      { id: 'CMP-2026-Q2', name: '2026 Q2', start: '2026-05-04', days: 24 },
      { id: 'CMP-2026-Q4', name: '2026 Q4', start: '2026-10-05', days: 24 },
    ],
    lineFindingSightings: 376,
    transformerFindingSightings: 24,   // 376 + 24 = 400 findings in total
    dgaSamplesPerTransformer: 8,
    duplicateAssets: { towers: 5, transformers: 1, insulatorStrings: 2 },
    towerInspectionCoverage: 0.85,
  },
});
