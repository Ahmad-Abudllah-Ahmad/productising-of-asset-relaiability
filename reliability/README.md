# Asset Reliability workspace (`/reliability`)

One linked workspace for line assets, substation transformers and visual-inspection evidence, with explainable health and
risk scores. It is the `/reliability` page of the Nexus OS site: seven screens in the rail, an Asset 360 panel, a finding
viewer and a global filter bar. Everything runs in the browser from a deterministic demo data set; there is no backend.

The plan this was built from is `docs/reliability-plan.md` (kept out of git by `.gitignore`; ask for a copy). The audit of
the original page is `docs/reliability-audit.md`.

## What it does

| Screen | What you can do |
| --- | --- |
| **Reliability Dashboard** | Four KPI cards, condition across campaigns, health index by category, the ten biggest risks, one row per line. Every number opens the list behind it. |
| **Drawing** | The original SS-North single-line sheets. A fixed reference; the filters do not change it. |
| **Asset Registry** | Lines, towers, spans, components, substations, transformers, and **Links** (the Link Review queue: accept, reject, merge duplicates, audit log). |
| **Tower Health** | One tower: schematic coloured by the condition of each scoring group, findings with thumbnails, campaign comparison. |
| **Line Health** | One line: every tower and span in order, an HI profile, the line score with its breakdown, not-assessed units. |
| **Risk Map** | Leaflet map: lines, towers, substations, finding clusters, layers, label highlight, a lasso that totals risk. |
| **Maintenance History** | Timeline (fleet, line or one asset), repairs with HI before and after and whether they held, work orders, open findings. |

Everywhere: **Asset 360** (click any asset: score, breakdown, findings, history chart, linked assets, work orders; transformers
add DGA, Duval zone, oil, tests, loading) and the **finding viewer** (click any thumbnail: AI box, RGB and thermal,
campaign compare, confirm / correct / reject / revert with a review history, link to asset).

**Global filters** (the bar under the top bar): label, voltage, category and an "as of" date from the first campaign to today.
They are in the URL hash (`flabel`, `fkv`, `fcat`, `asof`), follow you from screen to screen, and every KPI, chart, table and
map respects them. Changing "as of" rescores everything for that date. A filter picks which assets are listed and counted; the
score of a line stays the line's own.

**Freshness**: each score shows how old its newest evidence is. A score older than the inspection interval (180 days for line
assets, 365 for transformers and substations) is greyed out and marked "stale". Move "as of" to 2026-09-30 to see some.

**Dark theme**: the toggle in the top bar; light is the default; the choice is remembered per browser.

## Run it

```
node server.js            # http://localhost:3000/reliability   (PORT=3100 to change the port)
npm test                  # unit tests: node --test, no dependencies
npm run test:e2e          # browser tests: Playwright with the Chrome that is installed; starts its own server on port 3100
npm run build             # static export for Vercel (scripts/export-static.js)
```

`npm install` is only needed for Playwright. Screenshots written by the browser tests go to `docs/screens/` (git-ignored).
Do not run two `test:e2e` runs at once: they share a port and an output folder.

Query switches for demos and tests: `?delay=800` / `?fail=1` (Link Review), `?paneldelay=` / `?panelfail=1` (Asset 360),
`?viewerdelay=` / `?viewerfail=1` (finding viewer), `?healthdelay=` / `?healthfail=1` (the data screens), `?tiles=off` (map
without a basemap).

## Where things are

```
reliability/index.html            the page: loads the legacy shell, then js/app/boot.js
reliability/js/
  domain/                         the engine: pure functions, no DOM, no clock; every function takes an asOf date
    config.js                     ALL assumptions (A1-A24 at the top), weights, bands, thresholds, intervals, map settings
    health/                       lineHi.js (tower, span, line), txHi.js (transformer), common.js (bands, freshness), healthIndex.js
    risk.js                       risk = (100 - HI) x criticality x consequence, plus linked-asset uplift
    context.js                    indexes over the data so scoring is fast
    labels.js                     the managed label list
    linking/                      resemblance.js (scorePair), rules.js, candidates.js (blocking), suggest.js (link a finding), geo.js, visualStub.js
    types.js                      JSDoc typedefs
  data/
    seed.js                       the deterministic demo data generator (fixed random seed, ground truth for the tests)
    repository.js                 async reads of frozen data; reviewer decisions in an overlay (memory + localStorage), audit log
  app/                            the screens (each screen: a *Model.js with no DOM, a *Screen.js that draws it)
    boot.js  snapshot.js          loads the data, applies the global filters and the as-of date, tells the screens
    scope.js  filterBar.js        the global filters
    registryModel/Tabs.js  assetModel/Panel.js  findingModel/Viewer.js  healthModel/Screens.js
    historyModel/Screens.js  mapModel/Screen.js  dashboardModel/Screen.js
    freshness.js  palette.js  charts.js  hashState.js  navigation.js  screenKit.js  demoImage.js  theme.js
  ui/                             reliability.css (tokens, both themes, every screen), reliability-dark.css (generated), linkReview.js, dom.js
  legacy/nexus-reliability.js     the page shell, the rail, tooltips, KPI-card and tag helpers, and the Drawing screen
  vendor/                         echarts 5.6.0 and leaflet 1.9.4, copied unchanged with their licences (no CDN)
  test/                           unit tests (node --test)          e2e/   browser tests (Playwright)
scripts/build-reliability-dark.py regenerates ui/reliability-dark.css from assets/custom/nexus-apps.css
```

Three rules keep it testable: the **domain** never touches the DOM or the clock; a screen's **model** is a plain function of
the snapshot (so tests read numbers, not pixels); a screen's **state** is in the URL hash.

Local state: reviewer decisions are in `localStorage` under `nexus.reliability.demo.v1` (the Links tab has "Reset demo data");
the theme is under `nexus.reliability.theme`.

## Demo data, and what needs real inputs

**Everything you see is generated.** Replace these to go beyond a demo:

| In the demo | What a real deployment needs |
| --- | --- |
| **Seed** (`data/seed.js`): 3 lines (132, 220, 500 kV), 159 towers, 151 spans, 2 substations, 7 transformers, 3 campaigns, about 400 findings, work orders and repairs, deliberate duplicates and repeat sightings, a newly built never-inspected section | Asset master (SAP, Maximo, GIS), inspection campaigns and findings from the detector, work orders and repairs from the maintenance system, a repository that reads an API instead of the seed |
| **Images** (`/assets/...` site photos) | Real captures. Every image says "Demo image". Boxes are stored as fractions of the image, so any resolution works |
| **Thermal view** (`app/demoImage.js`) | Real radiometric data. The false-colour picture and the temperatures are generated from the photo and the finding id; they mean nothing |
| **DGA, oil tests, loading** (generated per transformer) | The real DGA, oil and electrical test results and a loading feed |
| **Health-index weights and bands** (`config.js`: equal weights, 70 / 40 cut-offs) | The client's engineering weights (AHP or their own) and cut-offs. Open question in the plan |
| **Criticality and consequence** (invented from voltage, customers and redundancy rules) | The client's criticality and consequence model |
| **Inspection intervals** (180 / 365 days, A9) | The client's inspection policy |
| **Resemblance model** (`domain/linking/resemblance.js`): identifier, attribute and spatial signals, plus a visual stub on seeded feature vectors | Musharraf's model: `scorePair(a, b) -> { score, reasons[] }` is the interface; image embeddings replace `visualStub.js`. Thresholds (auto-link 0.90, review 0.60) are in `config.js` |
| **Map tiles** (OpenStreetMap, the only request that leaves the site; each tile request reveals the viewed area) | A tile source the client approves, in `CONFIG.map` |

Known limits: findings carry no position on the tower, so the schematic colours zones by scoring group, not by where on the
tower; the transformer Duval zone is shown for the reader and does not change the score (A-numbers in `config.js`); the
lasso has no touch support.
