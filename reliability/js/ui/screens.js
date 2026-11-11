// The ten screens of the plan's screen table. Only Link Review is built in Phase 3;
// the rest show a "coming in Phase 4" state that says what they will contain.

export const SCREENS = Object.freeze([
  { id: 'dashboard', title: 'Reliability Dashboard', purpose: 'Fleet status in one view',
    elements: 'KPI cards (assets by band, open critical findings, overdue reviews, links awaiting review); HI distribution by category; top-10 risk list; condition trend across campaigns; filter bar by label, voltage, category.' },
  { id: 'asset-registry', title: 'Asset Registry', purpose: 'Find any asset in any category',
    elements: 'One table across categories with category tabs, label chips, HI badge, last inspected, link status; saved filters; bulk label edit; CSV export.' },
  { id: 'asset-360', title: 'Asset 360', purpose: 'Everything about one asset',
    elements: 'Header (ID, class, HI, risk factors); tabs: Overview, Condition history, Inspections and evidence, Linked assets, Maintenance, Documents; HI breakdown drawer.' },
  { id: 'line-health', title: 'Line Health', purpose: 'Condition along a line',
    elements: 'Line strip: towers in order coloured by HI, spans between them with clearance and findings; profile chart of HI by tower; click-through to tower.' },
  { id: 'tower-health', title: 'Tower Health', purpose: 'Condition of one structure',
    elements: 'Tower schematic with component zones coloured by condition; findings list; campaign compare.' },
  { id: 'transformer-health', title: 'Transformer Health', purpose: 'Condition of substation transformers',
    elements: 'HI with five input bars; DGA gas trends and Duval triangle; oil quality and test results; loading; visual and thermal findings; linked lines and their risk.' },
  { id: 'visual-inspection', title: 'Visual Inspection Viewer', purpose: 'See the evidence',
    elements: 'Image with AI bounding boxes and confidence; RGB / thermal toggle; side-by-side compare across campaigns; confirm, correct or reject; link to asset with suggested matches.' },
  { id: 'risk-map', title: 'Risk Map', purpose: 'Where the risk is',
    elements: 'Map with lines coloured by HI, tower and substation markers, finding clusters, vegetation zones; layer toggles; label highlight; lasso to build a work package.' },
  { id: 'link-review', title: 'Link Review', purpose: 'Confirm proposed links', built: true,
    elements: 'Queue sorted by score; side-by-side of both records with matching reasons; accept, reject, merge; audit log.' },
  { id: 'maintenance-history', title: 'Maintenance History', purpose: 'What was done and did it help',
    elements: 'Timeline per asset of findings, work orders and repairs; HI before and after each repair.' },
]);

export const screenById = (id) => SCREENS.find((s) => s.id === id) ?? null;
export const DEFAULT_SCREEN = 'link-review';
