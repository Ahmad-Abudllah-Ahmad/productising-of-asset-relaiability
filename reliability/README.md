# Asset Reliability workspace (`/reliability`)

One linked workspace for line assets, substation transformers and visual-inspection evidence, with explainable health and
risk scores. It is the `/reliability` page of the Nexus OS site: seven screens in the rail, an Asset 360 panel, a finding
viewer and a global filter bar. Everything runs in the browser from a deterministic demo data set; there is no backend.

The plan this was built from is `docs/reliability-plan.md` (kept out of git by `.gitignore`; ask for a copy). The audit of
the original page is `docs/reliability-audit.md`.

## Names and labels

The page is called **Asset Reliability**: health and risk, maintenance history, work orders, and inventory and parts. (Between the labelling phase and the inventory phase it was called Asset Health, because it covered less; ERP data is still to come, see `docs/management-feedback-plan.md`.) The URL (`/reliability`) and the code names did not change.

Two labels are used the same way everywhere:

- **Simulated**: the data was generated. A **Demo data** banner sits under the top bar of every screen while the data source is the built-in seed (`repository.source === 'seed'`). The simulated LiDAR, the generated thermal view and the demo images say so on the picture.
- **Experimental**: a model's output that has not been tested against suitable real data. An **Experimental** badge sits next to the health index, the risk score, the Risk Map title, the resemblance (match) scores and the AI finding class and confidence. Hover or focus it for the reason and the register entry. The badges read `reliability/js/domain/validation.js`, the **validation register**: each entry has a status (experimental or validated), what it was tested against, the result, the date and who approved it. All entries start experimental. To remove a label, record the test in the register; every badge for that entry goes. A unit test fails if an entry is "validated" without `testedAgainst` and `result`.

Real photographs (reference and own inspection images) carry no label; they are captioned with their source.

## What it does

| Screen | What you can do |
| --- | --- |
| **Asset Reliability Dashboard** | Four KPI cards, condition across campaigns, health index by category, the ten biggest risks, one row per line. Every number opens the list behind it. |
| **Drawing** | The original SS-North single-line sheets. A fixed reference; the filters do not change it. |
| **Asset Registry** | Lines, towers, spans, components, substations, transformers, and **Links** (the Link Review queue: accept, reject, merge duplicates, audit log). |
| **Tower Health** | One tower: schematic coloured by the condition of each scoring group, findings with thumbnails, campaign comparison. |
| **Line Health** | One line: every tower and span in order, an HI profile, the line score with its breakdown, not-assessed units. |
| **Risk Map** | Leaflet map: lines, towers, substations, finding clusters, layers, label highlight, a lasso that totals risk. |
| **Maintenance History** | Timeline (fleet, line or one asset), repairs with HI before and after and whether they held, work orders (including planned work raised by maintenance plans), open findings, and **Parts & Inventory** (work orders waiting on parts, low stock, open purchase order lines, stock by depot). |

Everywhere: **Asset 360** is six tabs in two groups. **Asset Health**: Health & Risk (breakdown and cap, open findings, transformer gas/oil/tests, linked assets at the foot), Components (the tower schematic and the components table), Condition Trends (campaign history, then the **12-month forecast**, labelled Experimental; see *Condition forecast* below). **Operations**: Maintenance History (defects over time with thumbnails, repairs), Work Orders (open, planned, completed) and Inventory & Parts (the parts for the asset's open and planned work, each reserved, available, on order with its date, or short). Towers and spans have a Schematic / LiDAR switch inside Components. The selected tab is in the URL (`atab=components|trends|maintenance|workorders|inventory`, and `atab=lidar` for the LiDAR view of Components; Health & Risk is the default), arrow keys move between tabs, and the Operations tabs say where their data comes from. Asset 360 (click any asset: score, breakdown, findings, history chart, linked assets, work orders; transformers
add DGA, Duval zone, oil, tests, loading) and the **finding viewer** (click any thumbnail: AI box, RGB and thermal,
campaign compare, confirm / correct / reject / revert with a review history, link to asset).

**Global filters** (the bar under the top bar): label, voltage, category and an "as of" date from the first campaign to today.
They are in the URL hash (`flabel`, `fkv`, `fcat`, `asof`), follow you from screen to screen, and every KPI, chart, table and
map respects them. Changing "as of" rescores everything for that date. A filter picks which assets are listed and counted; the
score of a line stays the line's own.

**Freshness**: each score shows how old its newest evidence is. A score older than the inspection interval (180 days for line
assets, 365 for transformers and substations) is greyed out and marked "stale". Move "as of" to 2026-09-30 to see some.

**Simulated LiDAR**: Asset 360 of a tower or span has a LiDAR tab (`atab=lidar` in the URL), and a finding on a tower or span has a LiDAR tab in the viewer (`mode=lidar`). It draws a 3D point cloud (three.js 0.160.1, vendored, loaded only when a LiDAR view opens) coloured by class or by clearance, with orbit, zoom, reset and a point-size control, and a 2D profile (ground, vegetation tops, conductor sag, the minimum-clearance line, the lowest clearance marked). Every view says "Simulated LiDAR". The clouds are generated from the seed (`domain/lidar/simulate.js`, seeded, same every run) so that the clearance measured from the points equals the seed's span clearance shown in the registry, Line Health and the map; the limit is in `config.js` (A25). Without WebGL (or with `?webgl=off`) a table of clearance values is shown instead. To use a real scan, register a cloud provider in `app/lidarSource.js` (see its header: same shape, `cls` 1 ground, 2 vegetation, 3 structure, 4 conductor; `decimate()` thins big scans).

**Dark theme**: the toggle in the top bar; light is the default; the choice is remembered per browser.

## ERP integration (read-only)

The page reads work orders, maintenance plans, stock, suppliers and purchase orders from the demo seed, or from an ERP through a small server-side API. The switch is in the banner under the top bar (remembered in the browser; `?source=erp` / `?source=seed` for one visit). With nothing configured the API serves a **mock SAP adapter** that answers in SAP's OData V2 shapes, so the whole path is real and nothing needs an environment variable.

```
browser  ->  /api/erp/*  ->  adapter (mock-sap | sap-s4hana | maximo)  ->  the ERP
             server.js locally, api/erp.js on Vercel       field mapping (erp/mapping/*.json), ID mapping, cache
```

- `GET /api/erp/status`, `/records[?refresh=1]` (converted to the dashboard's records, plus the unmatched ones), `/raw/<entity>` (the adapter's own response: work-orders, notifications, assets, materials, stock, purchase-orders, suppliers, reservations, maintenance-plans), `/mapping`. Anything but GET is 405. Code: `reliability/js/erp/`.
- **Credentials** only ever come from environment variables, read by the adapter on the server; they are never returned or logged. `.env.example` lists the names only; `.env` is git-ignored. `ERP_ADAPTER` = `mock` (default) | `sap-s4hana` | `maximo`; `ERP_CACHE_SECONDS` (default 300). The SAP S/4HANA and Maximo adapters are stubs (interface and TODOs, no live calls): they answer 501 "not configured" or "not implemented".
- **Field mapping** is data (`erp/mapping/sap.json`): SAP field names, number ranges and status codes to the dashboard's records, so a customer's system changes a JSON file, not code. The mock's `ZZ_` fields stand for what a real system holds elsewhere (finding links, the plan's component list).
- **ID mapping** uses the registry's `external_ids.sap` (functional location or equipment number). An ERP location that matches no asset goes to **ERP records awaiting a match** at the top of the Links tab, with suggestions from the resemblance matcher; a person links it to an asset or ignores it, and the decision is in the audit log. Its work orders stay out of every screen until then.
- **Labels**: in ERP mode the Demo data banner is replaced by an "ERP data" banner, and every ERP-sourced panel shows "Source: SAP (mock) · synced 16 Nov, 09:10" (or "Source: demo data"). Findings, images, LiDAR and scores are still the seed's and say so. If the API cannot be reached the page shows the demo data and says why.

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
  ../assets/inspection/           reference photos and manifest.json (the only place the viewer gets pictures from)
  vendor/                         echarts 5.6.0, leaflet 1.9.4 and three 0.160.1, copied unchanged with their licences (no CDN)
  test/                           unit tests (node --test)          e2e/   browser tests (Playwright)
scripts/build-reliability-dark.py regenerates ui/reliability-dark.css from assets/custom/nexus-apps.css
```

Three rules keep it testable: the **domain** never touches the DOM or the clock; a screen's **model** is a plain function of
the snapshot (so tests read numbers, not pixels); a screen's **state** is in the URL hash.

Local state: reviewer decisions are in `localStorage` under `nexus.reliability.demo.v1` (the Links tab has "Reset demo data");
the theme is under `nexus.reliability.theme`.

## Condition forecast (Experimental)

**Condition Trends** projects each tower's, span's and transformer's health index 12 months ahead: the history so far is a solid line, the forecast a dashed line with a shaded range, and the text above the chart gives the date the projection falls into the next band, or "Stays in the normal band for 12 months". Hover the heading for the method; the **Experimental** badge reads the validation register entry `forecast`. The **Dashboard** has a small card, "Projected to drop a band within 12 months": the count opens the list (soonest first), and a row opens that asset's Condition Trends. The filters and the "as of" date apply: the forecast uses only what was known on that date.

The method (`domain/forecast.js`, parameters in `CONFIG.forecast`, assumptions A27 to A33):

| Part | How it works |
| --- | --- |
| **Towers and spans: trend** | A straight line through the health index at each campaign, using only the history since the last completed repair (the repair date counts as the first point, scored as restored). The line never rises, and its decline is damped (each month's drift is 0.9 of the month before) so a steep fall over a few months is not assumed to continue at full speed for a year. |
| **Recurrence** | Each repair whose defect came back (the Maintenance History's "did not hold" repairs) adds 3 points a year of extra decline, up to 9. |
| **Open findings** | Each open critical or serious finding adds 1.5 points a year, up to 6. |
| **Transformers** | The DGA trend is the main driver: each gas is carried forward at its observed generation rate (ppm a day over the last year), and the transformer is scored again each month with the same rules as today (gas limits, rising-gas penalty, age). Campaign findings do not drive the line. |
| **Range** | The 10th and 90th percentile of the changes in health index actually observed across the fleet for the same asset class (consecutive campaigns, intervals with a repair left out), taken relative to the median change and applied for the time ahead. Not invented: with fewer than 8 observed changes there is no range, and the screen says so. |
| **Not enough history** | An asset with fewer than two assessed campaigns (two DGA samples for a transformer) shows "Not enough history to forecast" and no line or date. A never-inspected asset is the same case. |

The method values (3 points, 1.5 points, 0.9 damping, 12 months, the percentiles) are invented defaults, not fitted. The shipped seed has only three campaigns and the transformers' range rests on about ten observed changes, so treat the output as a way of ordering assets, not as a prediction. It stays Experimental until someone records what it was tested against: compare the forecast made at an earlier "as of" date with what the next campaign found.

## Demo data, and what needs real inputs

**Everything you see is generated.** Replace these to go beyond a demo:

| In the demo | What a real deployment needs |
| --- | --- |
| **Seed** (`data/seed.js`): 3 lines (132, 220, 500 kV), 159 towers, 151 spans, 2 substations, 7 transformers, 3 campaigns, about 400 findings, work orders and repairs, deliberate duplicates and repeat sightings, a newly built never-inspected section | Asset master (SAP, Maximo, GIS), inspection campaigns and findings from the detector, work orders and repairs from the maintenance system, a repository that reads an API instead of the seed |
| **Images** (`assets/inspection/manifest.json`): real reference photographs of the same kind of defect from other sources (BGI dataset, Wikimedia Commons; CC BY / CC BY-SA), none from the asset shown; 20 defect classes are still "Placeholder – no real image yet"; vegetation, structure encroachment and sag are LiDAR-only | Real captures: replace a manifest entry's file, box and credit (see `assets/inspection/README.md`). Boxes are fractions of the image, so any resolution works |
| **Thermal view** (`app/demoImage.js`) | Real radiometric data. The false-colour picture and the temperatures are generated from the photo and the finding id; they mean nothing |
| **DGA, oil tests, loading** (generated per transformer) | The real DGA, oil and electrical test results and a loading feed |
| **Forecast method values** (`config.js`, A27 to A33: damping, recurrence and open-finding decline, range percentiles) | Values fitted and checked against later inspections of the client's own assets; then the `forecast` register entry can move to validated |
| **Health-index weights and bands** (`config.js`: equal weights, 70 / 40 cut-offs) | The client's engineering weights (AHP or their own) and cut-offs. Open question in the plan |
| **Criticality and consequence** (invented from voltage, customers and redundancy rules) | The client's criticality and consequence model |
| **Inspection intervals** (180 / 365 days, A9) | The client's inspection policy |
| **LiDAR** (`domain/lidar/simulate.js`): simulated point clouds, catenary conductors, generated vegetation | Real scans per span (LAS/LAZ converted by a provider), the client's clearance standard (limits in `config.js`), real tower geometry |
| **Inventory** (`data/inventory.js`, `domain/inventory.js`): 40 materials, stock in two depots, 5 suppliers, purchase order lines, reservations, maintenance plans and the planned work orders they raise, all generated in the shape of SAP/Maximo records, with a few deliberate shortages. The defect-to-parts table is in `config.js` (A26) | The ERP's material master, stock, purchase orders, reservations and maintenance plans, and its bill of materials or task lists instead of the defect-to-parts table (the integration layer is the next phase) |
| **ERP** (`erp/mockSap.js`): a mock SAP adapter built from the seed | A customer's SAP S/4HANA or Maximo: credentials in environment variables, the live adapter (stubbed), the field mapping for their field names and number ranges, and the asset master's `external_ids` |
| **Resemblance model** (`domain/linking/resemblance.js`): identifier, attribute and spatial signals, plus a visual stub on seeded feature vectors | Musharraf's model: `scorePair(a, b) -> { score, reasons[] }` is the interface; image embeddings replace `visualStub.js`. Thresholds (auto-link 0.90, review 0.60) are in `config.js` |
| **Map tiles** (OpenStreetMap, the only request that leaves the site; each tile request reveals the viewed area) | A tile source the client approves, in `CONFIG.map` |

Known limits: findings carry no position on the tower, so the schematic colours zones by scoring group, not by where on the
tower; the transformer Duval zone is shown for the reader and does not change the score (A-numbers in `config.js`); the
lasso has no touch support.
