/*
 * Reliability dashboard engine and renderer (/reliability).
 *
 * Ported out of assets/custom/nexus-apps.js. This file is that script with the other six modules'
 * renderers (operations, grid, inventory, forecast, finance, workforce) removed and the global renamed
 * from NexusApps to NexusReliability. Everything else, including the shared helpers and the screen
 * shell, is a verbatim copy, so /reliability looks and behaves as it did. nexus-apps.js keeps its own
 * copy of the helpers for the other modules; only the Reliability renderer was removed from it.
 *
 * Loaded by reliability/index.html, which then calls NexusReliability.open("reliability").
 */
(function () {
  var BLUE = "#1f6feb";
  var AMBER = "#d97706";
  var RED = "#d14343";
  var PURPLE = "#7c3aed";
  var GREEN = "#178a4c";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tip(text) {
    return ' data-tip="' + esc(text) + '"';
  }

  function tag(text, tone) {
    return { tag: text, tone: tone };
  }

  function row(cells, text, zone) {
    return { cells: cells, tip: text, zone: zone || "" };
  }

  function icon(path) {
    return '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">' + path + "</svg>";
  }

  var ICONS = {
    registry: icon('<circle cx="4.5" cy="9" r="1.7" stroke="currentColor"/><circle cx="13" cy="4.5" r="1.7" stroke="currentColor"/><circle cx="13.5" cy="13.5" r="1.7" stroke="currentColor"/><path d="M6.2 8.3 11.2 5.4M6.3 9.7l5.4 2.8" stroke="currentColor"/>'),
    tower: icon('<path d="M9 2 15 16H3L9 2Z" stroke="currentColor"/><path d="M6.2 10h5.6M5.2 13h7.6" stroke="currentColor"/>'),
    line: icon('<path d="M2 12c3-4 5 2 8-1s4 1 6-2" stroke="currentColor" stroke-width="1.6"/>'),
    map: icon('<path d="M3 5.2 7 3l4 2.2L15 3v10l-4 2.2L7 13l-4 2.2V5.2Z" stroke="currentColor"/>'),
    calendar: icon('<rect x="3" y="4" width="12" height="11" rx="1.4" stroke="currentColor"/><path d="M3 8h12M7 2.5v3M11 2.5v3" stroke="currentColor"/>'),
    pulse: icon('<path d="M2 9h3l2-4 3 8 2-4h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
    sheet: icon('<rect x="3" y="2.5" width="12" height="13" rx="1.2" stroke="currentColor"/><path d="M6 6h6M6 9h6M6 12h4" stroke="currentColor"/>')
  };

  function filters(names) {
    var groups = names && names.length ? names : ["Region", "Line", "Voltage", "Corridor"];
    var options = ["All", "Corridor North", "Coastal", "Inland", "220 kV"].map(function (name) {
      return "<option>" + name + "</option>";
    }).join("");
    var location = groups.slice(0, 3);
    var rest = groups.slice(3);
    function block(title, items) {
      if (!items.length) return "";
      return '<div class="filter-label">' + esc(title) + "</div>" + items.map(function (name) {
        return "<label>" + esc(name) + "<select>" + options + "</select></label>";
      }).join("");
    }
    return '<aside class="filter-col"><div class="filter-head"><b>Filter</b><button class="linkish clear-filters" type="button">Clear</button></div>' +
      block("Location", location) + block("Asset", rest) +
      '<div class="banner" data-banner>All corridors</div></aside>';
  }

  function areaSpark(values, id) {
    var series = values && values.length > 1 ? values : [4, 6, 5, 7, 6, 8, 7, 9, 8];
    var max = Math.max.apply(null, series);
    var min = Math.min.apply(null, series);
    var span = max - min || 1;
    var w = 220;
    var h = 72;
    var flat = max === min;
    var pts = series.map(function (value, index) {
      var x = (index / (series.length - 1)) * w;
      var y = flat ? h * 0.38 : 6 + (1 - (value - min) / span) * (h - 20);
      return [x, y];
    });
    var line = pts.map(function (point, index) {
      return (index ? "L" : "M") + point[0].toFixed(1) + " " + point[1].toFixed(1);
    }).join(" ");
    var area = line + " L " + w + " " + h + " L 0 " + h + " Z";
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7bdd8"/><stop offset="1" stop-color="#e7eaf6"/></linearGradient></defs><path d="' + area + '" fill="url(#' + id + ')"/><path d="' + line + '" fill="none" stroke="#9aa3c7" stroke-width="1.5"/></svg>';
  }

  // A card's subtitle is green by default (the original look). A card can say what its subtitle means: tone is
  // "ok", "warn", "bad" or "neutral", and the old colour option maps to warn (amber) and bad (red), so a bad count is never green.
  function subTone(item) {
    var tone = item.tone || (item.color === RED ? "bad" : item.color === AMBER ? "warn" : "");
    return tone ? " sub-" + tone : "";
  }

  function kpis(items) {
    return '<div class="kpi4">' + items.map(function (item, index) {
      return '<div class="kpi card"' + tip(item.tip) + '><div class="k">' + esc(item.l) + '</div><div class="n">' + esc(item.v) + '</div><div class="sub' + subTone(item) + '">' + esc(item.s) + "</div>" + areaSpark(item.spark, "sp" + index + "-" + String(item.l).replace(/\W/g, "").slice(0, 8)) + "</div>";
    }).join("") + "</div>";
  }

  function legend(series) {
    if (!series) return "";
    return '<div class="legend">' + series.map(function (item) {
      var name = item.name || item.label;
      if (!name) return "";
      return '<span><i style="background:' + (item.color || "#94a3b8") + '"></i>' + esc(name) + "</span>";
    }).join("") + "</div>";
  }

  function gridLines(W, H, L, R, T, B) {
    var marks = "";
    for (var g = 0; g <= 4; g++) {
      var y = T + (g * (H - T - B)) / 4;
      marks += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" stroke="#eef2f6"/>';
    }
    return marks;
  }

  function scale(labels, values, W, H) {
    var L = 36, R = 16, T = 16, B = 32;
    var max = 1;
    values.forEach(function (set) {
      set.forEach(function (value) { if (value > max) max = value; });
    });
    var n = labels.length;
    function X(i) { return L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)); }
    function Y(v) { return T + (1 - v / max) * (H - T - B); }
    return { L: L, R: R, T: T, B: B, max: max, X: X, Y: Y, n: n, W: W, H: H };
  }

  function areaChart(labels, series) {
    var W = 680, H = 280;
    var sets = series.map(function (item) { return item.values; });
    var box = scale(labels, sets, W, H);
    var svg = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '">' + gridLines(W, H, box.L, box.R, box.T, box.B);
    series.forEach(function (item) {
      var line = item.values.map(function (value, index) {
        return (index ? "L" : "M") + box.X(index).toFixed(1) + " " + box.Y(value).toFixed(1);
      }).join(" ");
      var area = line + " L " + box.X(item.values.length - 1).toFixed(1) + " " + (H - box.B) + " L " + box.X(0).toFixed(1) + " " + (H - box.B) + " Z";
      svg += '<path d="' + area + '" fill="' + item.color + '" opacity="0.16"/>';
      svg += '<path d="' + line + '" fill="none" stroke="' + item.color + '" stroke-width="2.2"/>';
      item.values.forEach(function (value, index) {
        var text = (item.tips && item.tips[index]) || (labels[index] + " · " + item.name + " · " + value);
        svg += '<circle class="node" cx="' + box.X(index).toFixed(1) + '" cy="' + box.Y(value).toFixed(1) + '" r="5" fill="#fff" stroke="' + item.color + '" stroke-width="2"' + tip(text) + "/>";
      });
    });
    labels.forEach(function (label, index) {
      svg += '<text x="' + box.X(index).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#667085">' + esc(label) + "</text>";
    });
    return svg + "</svg>";
  }

  function barChart(labels, series) {
    var W = 680, H = 280, L = 36, R = 12, T = 16, B = 32;
    var max = 1;
    series.forEach(function (item) { item.values.forEach(function (value) { if (value > max) max = value; }); });
    var group = (W - L - R) / labels.length;
    var width = Math.min(28, (group - 16) / series.length);
    var svg = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '">' + gridLines(W, H, L, R, T, B);
    labels.forEach(function (label, index) {
      series.forEach(function (item, seriesIndex) {
        var value = item.values[index];
        var h = (value / max) * (H - T - B);
        var x = L + index * group + 8 + seriesIndex * (width + 4);
        var y = H - B - h;
        var text = (item.tips && item.tips[index]) || (label + " · " + item.name + " · " + value);
        svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + width.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + item.color + '"' + tip(text) + "/>";
      });
      svg += '<text x="' + (L + index * group + group / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="11" fill="#667085">' + esc(label) + "</text>";
    });
    return svg + "</svg>";
  }

  function chartBody(chart) {
    if (!chart) return "";
    var plot = "";
    if (chart.type === "area") plot = areaChart(chart.labels, chart.series);
    else if (chart.type === "bar" || chart.type === "grouped") plot = barChart(chart.labels, chart.series);
    return '<div class="k">' + esc(chart.title) + '</div><div class="chart-box">' + plot + "</div>" + legend(chart.series || chart.items);
  }

  function table(columns, rows) {
    var head = "<tr>" + columns.map(function (column) { return "<th>" + esc(column) + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (item) {
      var cells = item.cells.map(function (cell) {
        if (cell && typeof cell === "object") return '<td><span class="tag ' + esc(cell.tone) + '">' + esc(cell.tag) + "</span></td>";
        return "<td>" + esc(cell) + "</td>";
      }).join("");
      return "<tr" + tip(item.tip) + (item.zone ? ' data-zone="' + esc(item.zone) + '"' : "") + ">" + cells + "</tr>";
    }).join("");
    return "<table><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
  }

  function rankValue(item) {
    var raw = item.value != null ? item.value : item.pct;
    var n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function toRank(chart) {
    if (!chart) return [];
    if (chart.labels && chart.series && chart.series[0]) {
      var series = chart.series[0];
      var max = 1;
      series.values.forEach(function (value) { if (value > max) max = value; });
      return chart.labels.map(function (label, index) {
        var value = series.values[index];
        return {
          label: label,
          value: value,
          pct: Math.round((value / max) * 100),
          tip: (series.tips && series.tips[index]) || (label + " · " + series.name + " · " + value)
        };
      });
    }
    return [];
  }

  function toRankFromRows(rows) {
    if (!rows || !rows.length) return [];
    var items = rows.slice(0, 8).map(function (item) {
      var label = typeof item.cells[0] === "string" ? item.cells[0] : "Record";
      var shown = "";
      item.cells.forEach(function (cell) {
        if (!shown && typeof cell === "string" && /[0-9]/.test(cell)) shown = cell;
      });
      return { label: label, value: shown || "1", tip: item.tip, _n: parseFloat(String(shown).replace(/[^0-9.]/g, "")) || 1 };
    });
    var max = 1;
    items.forEach(function (item) { if (item._n > max) max = item._n; });
    items.forEach(function (item) { item.pct = Math.round((item._n / max) * 100); });
    return items;
  }

  function rankChart(title, items) {
    if (!items || !items.length) return "";
    var max = 1;
    items.forEach(function (item) {
      var n = rankValue(item);
      if (n > max) max = n;
    });
    var ticks = [0, 0.25, 0.5, 0.75, 1].map(function (part) {
      var n = max * part;
      return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
    });
    var rows = items.map(function (item) {
      var pct = item.pct != null ? item.pct : Math.round((rankValue(item) / max) * 100);
      pct = Math.max(2, Math.min(100, pct));
      return '<div class="rank"' + tip(item.tip || item.label) + "><span>" + esc(item.label) + '</span><div class="rank-track"><div class="rank-fill" style="width:' + pct + '%"></div></div></div>';
    }).join("");
    return '<div class="card rank-card"><div class="rank-title">' + esc(title) + '</div><div class="rank-rows">' + rows +
      '</div><div class="rank-axis"><span></span>' + ticks.map(function (tick) { return "<i>" + esc(tick) + "</i>"; }).join("") + "</div></div>";
  }

  function metricStrip(spec) {
    var cells = [];
    if (spec.side && spec.side.gauge) {
      cells.push({ l: spec.side.gauge.label, v: spec.side.gauge.value, tip: spec.side.gauge.tip });
    }
    if (spec.side && spec.side.items) {
      spec.side.items.slice(0, 4).forEach(function (item) {
        cells.push({ l: item.label, v: item.value, tip: item.tip });
      });
    }
    cells = cells.slice(0, 4);
    if (!cells.length) return "";
    return '<div class="metric-strip">' + cells.map(function (cell) {
      return "<div" + tip(cell.tip || cell.l) + '><div class="k">' + esc(cell.l) + "</div><b>" + esc(cell.v) + "</b></div>";
    }).join("") + "</div>";
  }

  function pack(spec) {
    var leftItems = toRank(spec.chart);
    if (!leftItems.length) leftItems = toRankFromRows(spec.rows);
    var rightItems = spec.side && spec.side.items && spec.side.items.length ? spec.side.items : toRankFromRows(spec.rows);
    var leftTitle = (spec.chart && spec.chart.title) || "Distribution";
    var rightTitle = (spec.side && (spec.side.title || spec.side.kicker)) || "Comparison";
    var detail = "";
    if (spec.chart && (spec.chart.type === "area" || spec.chart.type === "grouped")) {
      detail = '<div class="card chart-card">' + chartBody(spec.chart) + "</div>";
    }
    var summary = spec.side && spec.side.text ? '<div class="card side-card"><div class="sum"><strong>' + esc(spec.side.kicker || "CASE") + "</strong>" + esc(spec.side.text) + "</div></div>" : "";
    return '<div class="screen desk">' + filters(spec.filters) + '<div class="desk-main">' + kpis(spec.kpis) + metricStrip(spec) + summary + detail +
      '<div class="chart-pair">' + rankChart(leftTitle, leftItems) + rankChart(rightTitle, rightItems) + "</div>" +
      '<div class="pair-legend"><span><i></i>Higher bar is the larger value in this cut</span></div>' +
      (spec.columns ? '<div class="card table-card">' + table(spec.columns, spec.rows) + '<div class="empty-note">Nothing in this cut. Choose All to restore the corridor.</div></div>' : "") +
      "</div></div>";
  }

  function formula(spec) {
    var cards = spec.factors.map(function (factor) {
      return '<div class="card"' + tip(factor.tip) + '><div class="k">' + esc(factor.label) + "</div><b>" + esc(factor.value) + '</b><div class="sub">' + esc(factor.note) + "</div></div>";
    }).join("");
    return '<div class="screen"><div class="eq">' + cards + "</div>" +
      '<div class="card formula" style="padding:12px 14px"><div class="k">' + esc(spec.chart.title) + '</div><div class="chart-box">' + barChart(spec.chart.labels, spec.chart.series) + "</div>" + legend(spec.chart.series) + "</div>" +
      '<div class="card table-card">' + table(spec.columns, spec.rows) + "</div></div>";
  }

  var kv = "220 kV Corridor North";

  function reliability() {
    var k = [
      { l: "Towers in view", v: "48", s: "Corridor North · 220 kV", tip: "Registry cut for SS-North to the east angle.", spark: [48, 48, 48, 48, 48, 48] },
      { l: "Open findings", v: "12", s: "2 verified · 1 visual", tip: "Two verified structural findings are both on T-104. The damper is still visual.", spark: [6, 7, 8, 9, 11, 12], color: AMBER },
      { l: "Priority · T-104", v: "0.69", s: "0.86 × 0.91 × 0.88", tip: "Condition severity × criticality × consequence. Higher means review sooner.", spark: [0.4, 0.44, 0.5, 0.55, 0.62, 0.69], color: RED },
      { l: "Linked evidence", v: "98%", s: "Image, GPS, tower id", tip: "Share of findings with an image, GPS, and tower id. Not a model-accuracy score.", spark: [90, 92, 94, 95, 97, 98], color: GREEN }
    ];
    return [
      drawingScreen([
        { tab: "SS-North", src: "/pids/nx-ari-sld-0104-corridor-north.svg", kicker: "SS-North · 220 kV", note: "Corridor North. Illustrative. Not for construction." },
        { tab: "SS-East", src: "/pids/nx-ari-sld-0132-ss-east.svg", kicker: "SS-East · 132 kV", note: "Same corridor. T-104 still has the two verified findings." },
        { tab: "East angle", src: "/pids/nx-ari-sld-0230-east-angle.svg", kicker: "East angle", note: "Registry cut from SS-North to the east angle." },
        { tab: "T-110 side", src: "/pids/nx-ari-sld-0110-t110.svg", kicker: "T-110 side", note: "T-110 is stable and outside this package." }
      ]),
      // The Asset Registry tabs come from reliability/js/app (category tabs and Links) and are passed to
      // NexusReliability.open(). This single tab only shows if that code could not load.
      screen("registry", "Asset Registry", "registry", [
        tab("Registry", function () {
          return '<div class="screen"><div class="card" data-testid="registry-unavailable" style="padding:16px"><b>The asset registry could not be loaded.</b><div class="empty-note show">Reload the page. If it keeps failing, the data modules under reliability/js did not load.</div></div></div>';
        })
      ]),
      // Tower Health and Line Health come from reliability/js/app/healthScreens.js and are passed to NexusReliability.open().
      // These single tabs only show if that code could not load.
      screen("towers", "Tower Health", "tower", [
        tab("Condition", function () {
          return '<div class="screen"><div class="card" data-testid="tower-health-unavailable" style="padding:16px"><b>Tower Health could not be loaded.</b><div class="empty-note show">Reload the page. If it keeps failing, the scripts under /reliability/js/app did not start.</div></div></div>';
        })
      ]),
      screen("lines", "Line Health", "line", [
        tab("Overview", function () {
          return '<div class="screen"><div class="card" data-testid="line-health-unavailable" style="padding:16px"><b>Line Health could not be loaded.</b><div class="empty-note show">Reload the page. If it keeps failing, the scripts under /reliability/js/app did not start.</div></div></div>';
        })
      ]),
      // Risk Map and Maintenance History come from reliability/js/app (mapScreen.js, historyScreens.js). These single tabs
      // only show if that code could not load.
      screen("map", "Risk Map", "map", [
        tab("Map", function () {
          return '<div class="screen"><div class="card" data-testid="risk-map-unavailable" style="padding:16px"><b>The Risk Map could not be loaded.</b><div class="empty-note show">Reload the page. If it keeps failing, the scripts under /reliability/js/app did not start.</div></div></div>';
        })
      ]),
      screen("history", "Maintenance History", "calendar", [
        tab("Timeline", function () {
          return '<div class="screen"><div class="card" data-testid="maintenance-history-unavailable" style="padding:16px"><b>Maintenance History could not be loaded.</b><div class="empty-note show">Reload the page. If it keeps failing, the scripts under /reliability/js/app did not start.</div></div></div>';
        })
      ]),
      screen("home", "Reliability Dashboard", "pulse", [
        tab("Outlook", function () {
          return pack({
            filters: ["Region", "Line", "Voltage", "Corridor"],
            kpis: k,
            chart: { type: "area", title: "Findings next to the inspection plan", labels: ["Q1", "Q2", "Q3", "Q4", "Next", "Q+2"], series: [
              { name: "Open findings", color: AMBER, values: [6, 7, 8, 9, 12, 12] },
              { name: "Reviews due", color: RED, values: [0, 0, 1, 1, 1, 1] }
            ] },
            side: { kicker: "CASE", text: "Tower T-104 has two verified structural findings and requires engineering review.", gauge: { value: 98, label: "Evidence", tip: "Linked image, GPS, and tower id. Not a model-accuracy score." } },
            columns: ["Asset", "Finding", "Evidence", "State"],
            rows: [
              row(["T-104", "Leg B steel", "Verified", tag("Review", "r")], "Structural finding one", kv),
              row(["T-104", "Cotter pin", "Verified", tag("Review", "r")], "Structural finding two", kv),
              row(["N-18", "Damper", "4 frames · 0.93", tag("Confirm", "a")], "Confirm the asset location", kv),
              row(["Coastal", "None", "—", tag("Stable", "g")], "Shown when the Coastal cut is applied", "Coastal")
            ]
          });
        }),
        tab("Bridge", function () {
          return formula({
            factors: [
              { label: "Condition severity", value: "0.86", note: "Two findings", tip: "Higher means worse condition." },
              { label: "Criticality", value: "0.91", note: "220 kV", tip: "From the line master." },
              { label: "Consequence", value: "0.88", note: "Corridor", tip: "Span serves SS-North." },
              { label: "Priority", value: "0.69", note: "Review", tip: "Product of the three factors." }
            ],
            chart: { title: "How the three factors step down to 0.69", labels: ["0.86", "0.78", "0.69"], series: [{ name: "Running score", color: PURPLE, values: [86, 78, 69], tips: ["Severity × 100", "After criticality", "After consequence · review"] }] },
            columns: ["Factor", "Value", "Source", "State"],
            rows: [
              row(["Severity", "0.86", "Verified findings", tag("In", "r")], "Does not use an unpublished accuracy figure", kv),
              row(["Criticality", "0.91", "Line master", tag("In", "b")], "220 kV Corridor North", kv),
              row(["Consequence", "0.88", "Network role", tag("In", "b")], "Configurable", kv)
            ]
          });
        }),
        tab("Case", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "What is verified versus still visual", labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], series: [{ name: "Status code", color: BLUE, values: [3, 3, 2, 1, 1], tips: ["3 = verified structural", "3 = verified structural", "2 = visual, confirm location", "1 = watch", "1 = watch"] }] },
            side: { kicker: "OUTPUT", text: "Tower T-104 has two verified structural findings and requires engineering review.", items: [
              { label: "Verified", pct: 100, value: "2", color: RED, tip: "Steel and cotter pin" },
              { label: "Visual", pct: 50, value: "1", color: AMBER, tip: "Damper" }
            ] },
            columns: ["Record", "Class", "Needs", "State"],
            rows: [
              row(["Steel", "Verified defect", "Review", tag("Open", "r")], "Human confirmation already recorded", kv),
              row(["Cotter", "Verified defect", "Review", tag("Open", "r")], "Human confirmation already recorded", kv),
              row(["Damper", "Visual finding", "Location", tag("Open", "a")], "Not promoted to a confirmed electrical fault", kv)
            ]
          });
        })
      ])
    ];
  }

  function drawingBoard(src, kicker, note) {
    return '<section class="screen dwg-stage" data-dwg="' + esc(src) + '"><div class="dwg-bar"><b>' + esc(kicker) + '</b><span>' + esc(note) + '</span></div><div class="dwg-sheet"><p class="dwg-wait">Loading drawing…</p></div></section>';
  }

  var pidLive = null;
  var pidPaint = 0;

  var PID_SPECS = {
    PDT: { name: "Differential pressure", unit: "bar", lo: 0.2, hi: 1.1, digits: 2 },
    PT: { name: "Pressure", unit: "bar", lo: 6, hi: 58, digits: 1 },
    LT: { name: "Level", unit: "%", lo: 38, hi: 78, digits: 0 },
    VT: { name: "Vibration", unit: "mm/s", lo: 1.2, hi: 3.6, digits: 2 },
    TT: { name: "Temperature", unit: "°C", lo: 32, hi: 96, digits: 1 },
    IT: { name: "Current", unit: "A", lo: 86, hi: 340, digits: 0 },
    FT: { name: "Flow", unit: "m³/h", lo: 420, hi: 2360, digits: 0 },
    AT: { name: "Analyser", unit: "%", lo: 1.2, hi: 6.4, digits: 1 },
    ST: { name: "Speed", unit: "rpm", lo: 740, hi: 1490, digits: 0 },
    DT: { name: "Density", unit: "kg/m³", lo: 790, hi: 870, digits: 1 },
    FY: { name: "Flow balance", unit: "m³/h", lo: -1.4, hi: 1.6, digits: 1 }
  };

  function pidHash(text) {
    var hash = 2166136261;
    var i;
    for (i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0) / 4294967295;
  }

  function pidSpec(tag) {
    var prefix = (String(tag).match(/^[A-Z]+/) || [""])[0];
    return PID_SPECS[prefix] || { name: "Reading", unit: "", lo: 10, hi: 80, digits: 1 };
  }

  function pidFormat(spec, value) {
    var text = Number(value).toFixed(spec.digits);
    return spec.unit ? text + " " + spec.unit : text;
  }

  function pidWalk(value, base, spec) {
    var span = Math.max((spec.hi - spec.lo) * 0.018, 0.02);
    var next = value + (Math.random() - 0.48) * span + (base - value) * 0.12;
    return Math.min(base + span * 5, Math.max(base - span * 5, next));
  }

  function stopPidLive() {
    if (pidLive && pidLive.timer) clearInterval(pidLive.timer);
    pidLive = null;
  }

  function liveKey(node) {
    var prev = node.previousElementSibling;
    if (prev && prev.classList && (prev.classList.contains("pl-k") || prev.classList.contains("ol-k"))) return (prev.textContent || "").trim();
    return "";
  }

  function parseReading(text) {
    var raw = String(text || "").replace(/\u00a0/g, " ").trim();
    var match = raw.match(/^(-?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(.*)$/);
    if (!match) return null;
    var num = match[1].replace(/ /g, "");
    if (num.indexOf(",") > num.lastIndexOf(".")) num = num.replace(/\./g, "").replace(",", ".");
    else num = num.replace(/,/g, "");
    var value = Number(num);
    if (!isFinite(value)) return null;
    return { value: value, unit: match[2].trim(), digits: (num.split(".")[1] || "").length };
  }

  function recordWalk(value, base) {
    var span = Math.max(Math.abs(base) * 0.016, 0.02);
    var next = value + (Math.random() - 0.5) * span + (base - value) * 0.18;
    return Math.min(base + span * 3, Math.max(base - span * 3, next));
  }

  function startRecordLive(svg) {
    var tags = {};
    svg.querySelectorAll("[data-live]").forEach(function (node) {
      var tag = node.getAttribute("data-live");
      if (!tag || tags[tag]) return;
      var parsed = parseReading(node.textContent);
      var base = parsed ? parsed.value : 1;
      var value = base;
      var history = [];
      var i;
      for (i = 0; i < 36; i++) {
        value = parsed ? recordWalk(value, base) : base;
        history.push(value);
      }
      tags[tag] = {
        spec: { name: liveKey(node) || tag, unit: parsed ? parsed.unit : "", digits: parsed ? parsed.digits : 0 },
        base: base,
        value: value,
        history: history,
        node: node,
        raw: (node.textContent || "").trim(),
        locked: true,
        numeric: !!parsed
      };
    });
    if (!Object.keys(tags).length) return;
    pidLive = {
      tags: tags,
      mode: "record",
      timer: setInterval(function () {
        if (!pidLive) return;
        Object.keys(pidLive.tags).forEach(function (tag) {
          var item = pidLive.tags[tag];
          if (!item.numeric) return;
          item.value = recordWalk(item.value, item.base);
          item.history.push(item.value);
          if (item.history.length > 36) item.history.shift();
        });
        refreshPidCard();
      }, 900)
    };
  }

  function ensureDwgHits(svg) {
    svg.querySelectorAll(".pid-equipment, .pid-instrument").forEach(function (group) {
      if (group.querySelector(":scope > .pid-hit, :scope > .pl-hit, :scope > .ol-hit")) return;
      var box;
      try { box = group.getBBox(); } catch (err) { return; }
      if (box.width < 1 && box.height < 1) return;
      var pad = group.classList.contains("pid-instrument") ? 4 : 8;
      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("class", "pid-hit");
      rect.setAttribute("x", String(box.x - pad));
      rect.setAttribute("y", String(box.y - pad));
      rect.setAttribute("width", String(box.width + pad * 2));
      rect.setAttribute("height", String(box.height + pad * 2));
      rect.setAttribute("rx", "4");
      group.insertBefore(rect, group.firstChild);
    });
  }

  function startPidLive(sheet) {
    stopPidLive();
    var svg = sheet.querySelector("svg");
    if (!svg || !svg.querySelector("[data-live]")) return;
    if (!svg.querySelector(".pid-instrument")) {
      startRecordLive(svg);
      return;
    }
    var standby = /standby/i.test(svg.textContent || "");
    var tags = {};
    sheet.querySelectorAll("[data-live]").forEach(function (node) {
      var tag = node.getAttribute("data-live");
      if (!tag || tags[tag]) return;
      var spec = pidSpec(tag);
      var quiet = standby && /C$/.test(tag) && (spec === PID_SPECS.FT || spec === PID_SPECS.IT || spec === PID_SPECS.ST || spec === PID_SPECS.VT);
      var lo = quiet ? spec.lo * 0.04 : spec.lo;
      var hi = quiet ? spec.lo * 0.12 : spec.hi;
      var base = lo + (hi - lo) * (0.38 + pidHash(tag) * 0.24);
      var value = base;
      var history = [];
      var i;
      for (i = 0; i < 36; i++) {
        value = pidWalk(value, base, spec);
        history.push(value);
      }
      tags[tag] = { spec: spec, base: base, value: value, history: history, node: node };
      node.textContent = pidFormat(spec, value);
    });
    pidLive = {
      tags: tags,
      timer: setInterval(function () {
        if (!pidLive) return;
        Object.keys(pidLive.tags).forEach(function (tag) {
          var item = pidLive.tags[tag];
          item.value = pidWalk(item.value, item.base, item.spec);
          item.history.push(item.value);
          if (item.history.length > 36) item.history.shift();
          if (item.node && item.node.isConnected) item.node.textContent = pidFormat(item.spec, item.value);
        });
        refreshPidCard();
      }, 900)
    };
  }

  function pidSpark(values) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (max - min < 1e-6) {
      min -= 1;
      max += 1;
    }
    var pad = (max - min) * 0.18;
    min -= pad;
    max += pad;
    var width = 260;
    var height = 40;
    var line = values.map(function (value, index) {
      var x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      var y = height - ((value - min) / (max - min)) * (height - 2) - 1;
      return (index ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
    return { line: line, area: line + " L" + width + " " + height + " L0 " + height + " Z" };
  }

  function pidBox(node) {
    try { return node.getBBox(); } catch (err) { return null; }
  }

  function pidFocus(el) {
    if (el.hasAttribute("data-live")) {
      var tag = el.getAttribute("data-live");
      var inst = el.ownerSVGElement && el.ownerSVGElement.getElementById(tag);
      if (inst) return inst;
    }
    return el;
  }

  function pidRelated(el) {
    var focus = pidFocus(el);
    var svg = focus.ownerSVGElement;
    var box = pidBox(focus);
    if (!svg || !box) return [];
    var cx = box.x + box.width / 2;
    var cy = box.y + box.height / 2;
    var equipment = focus.classList.contains("pid-equipment") ? focus : null;
    if (!equipment) {
      var best = null;
      var bestD = 170;
      svg.querySelectorAll(".pid-equipment").forEach(function (item) {
        var itemBox = pidBox(item);
        if (!itemBox) return;
        var dist = Math.hypot((itemBox.x + itemBox.width / 2) - cx, (itemBox.y + itemBox.height / 2) - cy);
        if (dist < bestD) {
          bestD = dist;
          best = item;
        }
      });
      equipment = best;
    }
    var region = equipment ? pidBox(equipment) : box;
    if (!region) region = box;
    var tags = [];
    var primary = focus.id || el.getAttribute("data-live") || "";
    if (primary && pidLive && pidLive.tags[primary]) tags.push(primary);
    var found = [];
    svg.querySelectorAll("[data-live]").forEach(function (node) {
      var tag = node.getAttribute("data-live");
      var inst = svg.getElementById(tag) || node;
      var instBox = pidBox(inst);
      if (!instBox) return;
      var x = instBox.x + instBox.width / 2;
      var y = instBox.y + instBox.height / 2;
      if (x < region.x - 190 || x > region.x + region.width + 190) return;
      if (y < region.y - 96 || y > region.y + region.height + 96) return;
      found.push({ tag: tag, d: Math.hypot(x - (region.x + region.width / 2), y - (region.y + region.height / 2)) });
    });
    found.sort(function (a, b) { return a.d - b.d; });
    found.forEach(function (item) {
      if (tags.length >= 3 || tags.indexOf(item.tag) !== -1) return;
      tags.push(item.tag);
    });
    return tags;
  }

  function pidNames(svg, tag) {
    var names = [];
    svg.querySelectorAll("text.pid-tag").forEach(function (node) {
      if ((node.textContent || "").trim() !== tag) return;
      var next = node.nextElementSibling;
      while (next && next.classList && next.classList.contains("pid-name")) {
        names.push((next.textContent || "").trim());
        next = next.nextElementSibling;
      }
    });
    return names.filter(Boolean);
  }

  function refreshPidCard() {
    var card = document.getElementById("dwg-card");
    if (!card || card.hidden || !card.classList.contains("is-pid") || !pidLive) return;
    card.querySelectorAll(".dwg-graph").forEach(function (row) {
      var item = pidLive.tags[row.getAttribute("data-tag")];
      if (!item) return;
      var path = pidSpark(item.history);
      row.querySelector("b").textContent = item.locked ? item.raw : pidFormat(item.spec, item.value);
      row.querySelector(".dwg-area").setAttribute("d", path.area);
      row.querySelector(".dwg-line").setAttribute("d", path.line);
    });
  }

  function plainDwgCard(card, raw) {
    card.classList.remove("is-pid");
    card.removeAttribute("data-hover");
    if (!card.querySelector(":scope > b")) card.innerHTML = "<b></b><p></p>";
    var cut = raw.indexOf(" — ");
    card.querySelector("b").textContent = cut < 0 ? raw : raw.slice(0, cut);
    card.querySelector("p").textContent = cut < 0 ? "" : raw.slice(cut + 3);
  }

  function recordRelated(el) {
    var host = el.closest("[data-tip], .dwg-equipment") || el;
    if (!host.querySelector("[data-live]") && host.parentElement) host = host.parentElement.closest("[data-tip], .dwg-equipment") || host;
    var tags = [];
    var primary = el.getAttribute("data-live");
    if (primary) tags.push(primary);
    host.querySelectorAll("[data-live]").forEach(function (node) {
      var tag = node.getAttribute("data-live");
      if (!tag || tags.length >= 4 || tags.indexOf(tag) !== -1) return;
      tags.push(tag);
    });
    return tags;
  }

  function fillPidCard(card, el) {
    var svg = el.ownerSVGElement;
    if (!svg || !pidLive) return false;
    var isPid = !!svg.querySelector(".pid-instrument");
    var focus = pidFocus(el);
    var host = el.closest("[data-tip]") || focus.closest("[data-tip]") || el;
    var raw = host.getAttribute("data-tip") || el.getAttribute("data-tip") || "";
    var cut = raw.indexOf(" — ");
    var tag = isPid ? (focus.id || el.getAttribute("data-live") || el.getAttribute("data-own") || "") : (host.id || (cut < 0 ? raw : raw.slice(0, cut)));
    if (!tag) return false;
    if (card.getAttribute("data-hover") === tag && card.classList.contains("is-pid")) return true;
    var names = isPid ? pidNames(svg, tag) : [];
    var spec = pidSpec(tag);
    if (isPid && !names.length && spec.name !== "Reading") names = [spec.name];
    var title = isPid ? tag : (cut < 0 ? raw : raw.slice(0, cut));
    var note = cut < 0 ? (isPid ? raw : "") : raw.slice(cut + 3);
    var related = isPid ? pidRelated(el) : recordRelated(el);
    var graphs = related.map(function (itemTag) {
      var item = pidLive.tags[itemTag];
      if (!item) return "";
      var path = pidSpark(item.history);
      var label = item.locked ? item.spec.name : itemTag;
      var kind = item.locked ? "" : item.spec.name;
      var reading = item.locked ? item.raw : pidFormat(item.spec, item.value);
      return '<div class="dwg-graph" data-tag="' + esc(itemTag) + '"><div class="dwg-graph-h"><span>' + esc(label) + '</span><b>' + esc(reading) + '</b></div>' + (kind ? '<div class="dwg-graph-k">' + esc(kind) + '</div>' : '') + '<svg viewBox="0 0 260 40" preserveAspectRatio="none" aria-hidden="true"><path class="dwg-area" d="' + path.area + '"/><path class="dwg-line" d="' + path.line + '"/></svg></div>';
    }).join("");
    card.classList.add("is-pid");
    card.setAttribute("data-hover", tag);
    card.innerHTML = '<div class="dwg-card-top"><b>' + esc(title) + '</b><em class="dwg-live">Live</em></div><div class="dwg-card-name">' + esc(names.join(" · ")) + '</div><p>' + esc(note) + '</p><div class="dwg-graphs">' + (graphs || '<div class="dwg-empty">No reading is tied to this symbol.</div>') + '</div><div class="dwg-card-foot">' + (isPid ? "Simulated trace for this symbol. Not a historian feed." : "Trace around the reading printed on this symbol.") + '</div>';
    return true;
  }

  function drawingScreen(sheets) {
    return screen("drawing", "Drawing", "sheet", sheets.map(function (item) {
      return tab(item.tab, function () {
        return drawingBoard(item.src, item.kicker, item.note);
      });
    }));
  }

  function paintDrawings(root) {
    var host = root.querySelector("[data-dwg]");
    if (!host || host.getAttribute("data-loaded")) return;
    host.setAttribute("data-loaded", "1");
    var sheet = host.querySelector(".dwg-sheet");
    var token = ++pidPaint;
    stopPidLive();
    fetch(host.getAttribute("data-dwg")).then(function (res) {
      if (!res.ok) throw new Error("missing");
      return res.text();
    }).then(function (svg) {
      if (token !== pidPaint || !sheet.isConnected) return;
      sheet.innerHTML = svg;
      var drawing = sheet.querySelector("svg");
      if (drawing) ensureDwgHits(drawing);
      startPidLive(sheet);
    }).catch(function () {
      if (token !== pidPaint || !sheet.isConnected) return;
      sheet.innerHTML = '<p class="dwg-wait">The drawing file is not available.</p>';
    });
  }

  function placeDwgCard(card, event) {
    var width = card.offsetWidth || 280;
    var height = card.offsetHeight || 120;
    var x = event.clientX + 18;
    var y = event.clientY + 18;
    if (x + width + 12 > window.innerWidth) x = Math.max(8, event.clientX - width - 18);
    if (y + height + 12 > window.innerHeight) y = Math.max(8, event.clientY - height - 18);
    card.style.left = x + "px";
    card.style.top = y + "px";
  }

  function screen(id, name, iconName, tabs) {
    return { id: id, name: name, icon: ICONS[iconName], tabs: tabs };
  }

  function tab(name, render) {
    return { name: name, render: render };
  }

  var APPS = {
    reliability: { product: "Asset Reliability Intelligence", back: "/#module-card-01", screens: reliability() }
  };

  function brandMark() {
    return "";
  }

  function shell(app) {
    document.title = app.product;
    var rail = app.screens.map(function (item, index) {
      return '<button type="button" data-go="' + index + '"' + (index === 0 ? ' class="is-on"' : "") + ' aria-label="' + esc(item.name) + '">' + item.icon + "</button>";
    }).join("");
    document.body.innerHTML = '<div class="shell"><header class="top"><a class="brand" href="' + esc(app.back) + '" aria-label="NEXUS OS">' + brandMark() + '<span class="brand-name">NEXUS OS</span></a><h1 id="app-title"></h1><div class="tabs" id="tabs"></div><a class="back" href="' + esc(app.back) + '">Back to suite</a><button type="button" class="logout" id="logout">Log out</button></header><nav class="rail" aria-label="Applications">' + rail + '</nav><main class="work"><div class="stage" id="stage"></div></main></div><div class="tip" id="tip"></div><aside id="dwg-card" hidden><b></b><p></p></aside>';
  }

  function mount(app) {
    shell(app);
    document.getElementById("logout").addEventListener("click", function () {
      localStorage.removeItem("nexus-session");
      location.assign("/login/");
    });
    var current = 0;
    var tabIndex = 0;
    var titleEl = document.getElementById("app-title");
    var tabsEl = document.getElementById("tabs");
    var stage = document.getElementById("stage");
    var tipEl = document.getElementById("tip");

    var leaveTab = null;

    function render() {
      stopPidLive();
      if (leaveTab) { try { leaveTab(); } catch (error) { /* a tab's cleanup must not break navigation */ } leaveTab = null; }
      var screenSpec = app.screens[current];
      titleEl.innerHTML = esc(app.product) + " <span>/ " + esc(screenSpec.name) + "</span>";
      tabsEl.innerHTML = screenSpec.tabs.map(function (item, index) {
        return '<button type="button" data-tab="' + index + '"' + (index === tabIndex ? ' class="is-on"' : "") + ">" + esc(item.name) + "</button>";
      }).join("");
      stage.innerHTML = screenSpec.tabs[tabIndex].render();
      var dwgCard = document.getElementById("dwg-card");
      if (dwgCard) dwgCard.hidden = true;
      paintDrawings(stage);
      var tabSpec = screenSpec.tabs[tabIndex];
      if (tabSpec.mount) leaveTab = tabSpec.mount(stage) || null;
    }

    document.querySelector(".rail").addEventListener("click", function (event) {
      var button = event.target.closest("[data-go]");
      if (!button) return;
      current = Number(button.getAttribute("data-go"));
      tabIndex = 0;
      document.querySelectorAll("[data-go]").forEach(function (item) {
        item.classList.toggle("is-on", item === button);
      });
      render();
    });

    tabsEl.addEventListener("click", function (event) {
      var button = event.target.closest("[data-tab]");
      if (!button) return;
      tabIndex = Number(button.getAttribute("data-tab"));
      render();
    });

    function applyCut(panel) {
      var chosen = [];
      panel.querySelectorAll("select").forEach(function (select) {
        if (select.value !== "All") chosen.push(select.value);
      });
      var banner = panel.querySelector("[data-banner]");
      if (banner) banner.textContent = chosen.length ? chosen.join(" · ") : "All corridors";
      var shown = 0;
      var rows = panel.querySelectorAll("tbody tr[data-zone]");
      rows.forEach(function (line) {
        var zoneName = line.getAttribute("data-zone") || "";
        var ok = chosen.every(function (value) { return zoneName.indexOf(value) !== -1; });
        line.hidden = !ok;
        if (ok) shown += 1;
      });
      var note = panel.querySelector(".empty-note");
      if (note) note.classList.toggle("show", rows.length > 0 && shown === 0);
    }

    stage.addEventListener("click", function (event) {
      if (!event.target.classList.contains("clear-filters")) return;
      var panel = event.target.closest(".screen");
      if (!panel) return;
      panel.querySelectorAll("select").forEach(function (select) { select.value = "All"; });
      applyCut(panel);
    });

    stage.addEventListener("change", function (event) {
      if (event.target.tagName !== "SELECT") return;
      var panel = event.target.closest(".screen");
      if (panel) applyCut(panel);
    });

    document.addEventListener("click", function (event) {
      var gear = event.target.closest(".dwg-stage [data-tip]");
      if (!gear) return;
      var board = gear.closest(".dwg-stage");
      board.querySelectorAll("[data-tip].is-on").forEach(function (node) {
        if (node !== gear) node.classList.remove("is-on");
      });
      gear.classList.add("is-on");
    });

    document.addEventListener("mouseover", function (event) {
      var card = document.getElementById("dwg-card");
      var el = event.target.closest("[data-tip], .pid-instrument");
      if (!el) {
        var live = event.target.closest("[data-live]");
        if (live && live.ownerSVGElement && live.ownerSVGElement.querySelector(".pid-instrument")) el = live;
      }
      if (el && el.closest(".dwg-stage")) {
        tipEl.style.display = "none";
        if (!fillPidCard(card, el)) plainDwgCard(card, el.getAttribute("data-tip") || "");
        card.hidden = false;
        placeDwgCard(card, event);
        return;
      }
      if (card) {
        card.hidden = true;
        card.removeAttribute("data-hover");
      }
      if (!el) {
        tipEl.style.display = "none";
        return;
      }
      tipEl.textContent = el.getAttribute("data-tip");
      tipEl.style.display = "block";
    });

    document.addEventListener("mousemove", function (event) {
      var card = document.getElementById("dwg-card");
      if (card && !card.hidden) placeDwgCard(card, event);
      if (tipEl.style.display !== "block") return;
      var x = event.clientX + 14;
      var y = event.clientY + 16;
      if (x + 280 > window.innerWidth) x = event.clientX - 280;
      if (y + 90 > window.innerHeight) y = event.clientY - 80;
      tipEl.style.left = x + "px";
      tipEl.style.top = y + "px";
    });

    activeGo = function (screenId, tabName) {
      var index = app.screens.findIndex(function (item) { return item.id === screenId; });
      if (index < 0) return false;
      current = index;
      tabIndex = 0;
      if (tabName) {
        var found = app.screens[index].tabs.findIndex(function (item) { return item.name === tabName; });
        if (found >= 0) tabIndex = found;
      }
      document.querySelectorAll("[data-go]").forEach(function (item, position) { item.classList.toggle("is-on", position === index); });
      render();
      return true;
    };

    render();
  }

  // Screens can be replaced when the page opens: options.screens = { <screen id>: { tabs: [{ name, render, mount }] } }.
  // render() returns the tab's HTML. mount(stage), if present, runs after the HTML is in the page and may
  // return a function that is called when the tab is left.
  function withScreens(app, overrides) {
    return {
      product: app.product,
      back: app.back,
      screens: app.screens.map(function (item) {
        var next = overrides[item.id];
        return next ? { id: item.id, name: item.name, icon: item.icon, tabs: next.tabs } : item;
      })
    };
  }

  // set by mount(): switches the page to another screen and tab, as if the person had clicked there
  var activeGo = null;

  window.NexusReliability = {
    // the legacy rendering helpers, so new tabs keep the same look (KPI cards, tags, table markup)
    kit: { esc: esc, tip: tip, tag: tag, kpis: kpis, areaSpark: areaSpark, icon: icon },
    go: function (screenId, tabName) { return activeGo ? activeGo(screenId, tabName) : false; },
    open: function (id, options) {
      var app = APPS[id];
      if (!app) return;
      if (options && options.screens) app = withScreens(app, options.screens);
      mount(app);
    }
  };
})();
