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
  var TEAL = "#0f766e";
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

  function prov(title, body) {
    return ' data-prov-title="' + esc(title) + '" data-prov-body="' + esc(body) + '"';
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
    orders: icon('<rect x="3" y="2.5" width="12" height="13" rx="1.4" stroke="currentColor"/><path d="M6 7h6M6 10h6M6 13h3" stroke="currentColor"/>'),
    plan: icon('<path d="M3 14V4h8l4 4v6H3Z" stroke="currentColor"/><path d="M11 4v4h4" stroke="currentColor"/>'),
    crew: icon('<circle cx="6" cy="6" r="2" stroke="currentColor"/><circle cx="12" cy="6.5" r="1.6" stroke="currentColor"/><path d="M2.8 14c.4-2.2 1.8-3.3 3.2-3.3S8.8 11.8 9.2 14M10 14c.3-1.6 1.2-2.4 2.2-2.4 1 0 1.8.8 2.1 2.4" stroke="currentColor"/>'),
    check: icon('<circle cx="9" cy="9" r="6.2" stroke="currentColor"/><path d="M6.2 9.1 8.1 11l3.8-4" stroke="currentColor"/>'),
    field: icon('<path d="M4 14.5 9 3l5 11.5" stroke="currentColor"/><path d="M6 11h6" stroke="currentColor"/>'),
    grid: icon('<path d="M3 3h5v5H3zM10 3h5v5h-5zM3 10h5v5H3zM10 10h5v5h-5z" stroke="currentColor"/>'),
    bolt: icon('<path d="M10 2 4.5 10H9l-1 6 5.5-8H9l1-6Z" stroke="currentColor" stroke-linejoin="round"/>'),
    outage: icon('<path d="M9 2.5v6M5 8.5a4 4 0 1 0 8 0" stroke="currentColor" stroke-width="1.5"/><path d="M4 15h10" stroke="currentColor"/>'),
    loss: icon('<path d="M3 13 7 8l3 2 5-6" stroke="currentColor" stroke-width="1.6"/><path d="M3 15h12" stroke="currentColor"/>'),
    event: icon('<circle cx="9" cy="9" r="6" stroke="currentColor"/><path d="M9 6v3.2L11.2 11" stroke="currentColor"/>'),
    trend: icon('<path d="M3 12l4-3 3 2 5-5" stroke="currentColor" stroke-width="1.6"/><path d="M11 6h4v4" stroke="currentColor"/>'),
    parts: icon('<path d="M7 3h4l1 2H6l1-2ZM4 6h10v8H4V6Z" stroke="currentColor"/>'),
    boxes: icon('<path d="M3 6 9 3l6 3-6 3-6-3ZM3 6v6l6 3 6-3V6" stroke="currentColor"/>'),
    request: icon('<path d="M4 3h7l3 3v9H4V3Z" stroke="currentColor"/><path d="M11 3v3h3M6 9h6M6 12h4" stroke="currentColor"/>'),
    supplier: icon('<rect x="3" y="7" width="12" height="7" rx="1" stroke="currentColor"/><path d="M6 7V5h6v2M9 10v2" stroke="currentColor"/>'),
    cart: icon('<path d="M3 4h2l1.4 7h7.2L15 6H6" stroke="currentColor"/><circle cx="8" cy="14" r="1" fill="currentColor"/><circle cx="13" cy="14" r="1" fill="currentColor"/>'),
    forecast: icon('<path d="M3 13c2-1 3-5 6-5s3 3 6 2" stroke="currentColor" stroke-width="1.6"/><path d="M3 15h12" stroke="currentColor"/>'),
    inspect: icon('<circle cx="8" cy="8" r="4.2" stroke="currentColor"/><path d="M11.2 11.2 15 15" stroke="currentColor"/>'),
    demand: icon('<path d="M4 14V8M9 14V4M14 14v-5" stroke="currentColor" stroke-width="1.6"/>'),
    decay: icon('<path d="M3 5c3 1 4 6 6 6s3-4 6-3" stroke="currentColor" stroke-width="1.6"/>'),
    scenario: icon('<path d="M4 13c2-6 3-6 5-2s3 4 5-4" stroke="currentColor" stroke-width="1.5"/>'),
    cost: icon('<circle cx="9" cy="9" r="6" stroke="currentColor"/><path d="M9 6v6M7.4 7.4c.5-.6 2.2-.8 2.8.2.6 1-.2 1.5-1.6 1.8-1.4.3-2.2.8-1.6 1.8.6 1 2.3.8 2.8.2" stroke="currentColor"/>'),
    budget: icon('<rect x="3" y="4" width="12" height="10" rx="1.2" stroke="currentColor"/><path d="M3 7.5h12" stroke="currentColor"/>'),
    asset: icon('<rect x="3" y="8" width="12" height="6" rx="1" stroke="currentColor"/><path d="M6 8V6h6v2" stroke="currentColor"/>'),
    compare: icon('<path d="M4 12 8 5l4 4 2-2" stroke="currentColor" stroke-width="1.5"/><path d="M3 14h12" stroke="currentColor"/>'),
    capital: icon('<path d="M3 14h12M4 14V8l5-4 5 4v6" stroke="currentColor"/>'),
    people: icon('<circle cx="9" cy="6" r="2.2" stroke="currentColor"/><path d="M4 14.5c.6-2.6 2.4-3.8 5-3.8s4.4 1.2 5 3.8" stroke="currentColor"/>'),
    safety: icon('<path d="M9 2.5 15 5v4.2c0 3.2-2.4 5.4-6 6.3-3.6-.9-6-3.1-6-6.3V5l6-2.5Z" stroke="currentColor"/>'),
    permit: icon('<rect x="4" y="2.5" width="10" height="13" rx="1.2" stroke="currentColor"/><path d="M7 7h4M7 10h4M7 13h2" stroke="currentColor"/>'),
    phone: icon('<rect x="5" y="2" width="8" height="14" rx="1.6" stroke="currentColor"/><path d="M8 13.5h2" stroke="currentColor"/>'),
    audit: icon('<path d="M5 3h6l3 3v9H5V3Z" stroke="currentColor"/><path d="M11 3v3h3M7 9l1.2 1.2L11 7.5" stroke="currentColor"/>'),
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

  function kpis(items) {
    return '<div class="kpi4">' + items.map(function (item, index) {
      return '<div class="kpi card"' + tip(item.tip) + '><div class="k">' + esc(item.l) + '</div><div class="n">' + esc(item.v) + '</div><div class="sub">' + esc(item.s) + "</div>" + areaSpark(item.spark, "sp" + index + "-" + String(item.l).replace(/\W/g, "").slice(0, 8)) + "</div>";
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

  function hbars(items) {
    return items.map(function (item) {
      return '<div class="hbar"' + tip(item.tip) + "><span>" + esc(item.label) + '</span><div class="track"><div class="fill" style="width:' + item.pct + "%;background:" + (item.color || TEAL) + '"></div></div><b>' + esc(item.value) + "</b></div>";
    }).join("");
  }

  function heat(chart) {
    var cols = chart.cols;
    var head = '<div class="heat"><span></span>' + cols.map(function (col) { return '<span class="k">' + esc(col) + "</span>"; }).join("") + "</div>";
    var body = chart.rows.map(function (label, rowIndex) {
      var cells = chart.matrix[rowIndex].map(function (value, colIndex) {
        var color = value >= 75 ? "#0f766e" : value >= 55 ? "#14b8a6" : value >= 35 ? "#5eead4" : "#ccfbf1";
        var text = label + " · " + cols[colIndex] + " · " + value + (chart.unit ? " " + chart.unit : "");
        return '<i class="cell" style="background:' + color + '"' + tip(text) + "></i>";
      }).join("");
      return '<div class="heat"><b>' + esc(label) + "</b>" + cells + "</div>";
    }).join("");
    return head + body;
  }

  function chartBody(chart) {
    if (!chart) return "";
    var plot = "";
    if (chart.type === "area") plot = areaChart(chart.labels, chart.series);
    else if (chart.type === "bar" || chart.type === "grouped") plot = barChart(chart.labels, chart.series);
    else if (chart.type === "hbar") plot = hbars(chart.items);
    else if (chart.type === "heat") plot = heat(chart);
    return '<div class="k">' + esc(chart.title) + '</div><div class="chart-box">' + plot + "</div>" + legend(chart.series || chart.items);
  }

  function donut(parts) {
    var total = parts.reduce(function (sum, part) { return sum + part.value; }, 0) || 1;
    var angle = -Math.PI / 2;
    var paths = parts.map(function (part) {
      var sweep = (part.value / total) * Math.PI * 2;
      var end = angle + sweep;
      var large = sweep > Math.PI ? 1 : 0;
      var x0 = 80 + 52 * Math.cos(angle);
      var y0 = 80 + 52 * Math.sin(angle);
      var x1 = 80 + 52 * Math.cos(end);
      var y1 = 80 + 52 * Math.sin(end);
      var d = "M80 80 L " + x0.toFixed(2) + " " + y0.toFixed(2) + " A 52 52 0 " + large + " 1 " + x1.toFixed(2) + " " + y1.toFixed(2) + " Z";
      angle = end;
      return '<path d="' + d + '" fill="' + part.color + '"' + tip(part.tip || (part.name + " · " + part.value)) + "/>";
    }).join("");
    var key = parts.map(function (part) {
      return '<div class="legend"><span' + tip(part.tip || part.name) + '><i style="background:' + part.color + '"></i>' + esc(part.name) + " · " + esc(part.value) + "</span></div>";
    }).join("");
    return '<div class="gauge-row"><svg class="gauge" viewBox="0 0 160 160">' + paths + '<circle cx="80" cy="80" r="32" fill="#fff"/></svg></div>' + key;
  }

  function gauge(value, label, text) {
    var radius = 52;
    var circ = 2 * Math.PI * radius;
    var offset = circ * (1 - value / 100);
    return '<div class="gauge-row"><svg class="gauge" viewBox="0 0 140 140"' + tip(text) + '><circle cx="70" cy="70" r="52" fill="none" stroke="#e5e7eb" stroke-width="12"/>' +
      '<circle cx="70" cy="70" r="52" fill="none" stroke="' + BLUE + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" transform="rotate(-90 70 70)"/>' +
      '<text x="70" y="66" text-anchor="middle" font-size="22" font-weight="700" fill="#1b2430">' + value + '%</text><text x="70" y="86" text-anchor="middle" font-size="11" fill="#667085">' + esc(label) + "</text></svg></div>";
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

  function side(spec) {
    if (!spec) return "";
    if (spec.type === "donut") return '<div class="k">' + esc(spec.title) + "</div>" + donut(spec.parts);
    if (spec.type === "bars") return '<div class="k">' + esc(spec.title) + "</div>" + hbars(spec.items);
    var summary = spec.text ? '<div class="sum"><strong>' + esc(spec.kicker || "CASE") + "</strong>" + esc(spec.text) + "</div>" : "";
    return summary + (spec.gauge ? gauge(spec.gauge.value, spec.gauge.label, spec.gauge.tip) : "") + (spec.items ? hbars(spec.items) : "");
  }

  function rankValue(item) {
    var raw = item.value != null ? item.value : item.pct;
    var n = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function toRank(chart) {
    if (!chart) return [];
    if (chart.type === "hbar" && chart.items) return chart.items;
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
    if (spec.chart && (spec.chart.type === "heat" || spec.chart.type === "area" || spec.chart.type === "grouped")) {
      detail = '<div class="card chart-card">' + chartBody(spec.chart) + "</div>";
    }
    var summary = spec.side && spec.side.text ? '<div class="card side-card"><div class="sum"><strong>' + esc(spec.side.kicker || "CASE") + "</strong>" + esc(spec.side.text) + "</div></div>" : "";
    return '<div class="screen desk">' + filters(spec.filters) + '<div class="desk-main">' + kpis(spec.kpis) + metricStrip(spec) + summary + detail +
      '<div class="chart-pair">' + rankChart(leftTitle, leftItems) + rankChart(rightTitle, rightItems) + "</div>" +
      '<div class="pair-legend"><span><i></i>Higher bar is the larger value in this cut</span></div>' +
      (spec.columns ? '<div class="card table-card">' + table(spec.columns, spec.rows) + '<div class="empty-note">Nothing in this cut. Choose All to restore the corridor.</div></div>' : "") +
      "</div></div>";
  }

  function corridorMap(highlight) {
    var towers = [
      { x: 150, y: 360, name: "T-101", state: "Stable", tip: "T-101 · condition index 88 · no open finding", body: "In band across six aerial cycles." },
      { x: 300, y: 400, name: "T-103", state: "Watch", tip: "T-103 · foundation watch · not yet a verified defect", body: "Foundation watch from the prior flight. Included in the grouped visit." },
      { x: 470, y: 330, name: "T-104", state: "Review", tip: "T-104 · two verified structural findings · priority 0.69", body: "Leg B steel and a fitting cotter pin are verified. Engineering review is required." },
      { x: 640, y: 300, name: "T-105", state: "Confirm", tip: "T-105 side of span N-18 · displaced damper is still a visual finding", body: "Four frames, model score 0.93. Location still needs an engineer." },
      { x: 820, y: 350, name: "T-110", state: "Stable", tip: "T-110 · condition index 91 · stable", body: "No open finding this cycle." }
    ];
    var svg = '<svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="1000" height="640" fill="#d5e3da"/>' +
      '<ellipse cx="180" cy="160" rx="160" ry="46" fill="#c5d8cf"/>' +
      '<ellipse cx="760" cy="140" rx="200" ry="50" fill="#c5d8cf"/>' +
      '<path d="M40 470 C 200 430, 380 520, 620 470 S 900 520, 980 450" fill="none" stroke="#c4b59a" stroke-width="14"/>' +
      '<rect x="48" y="250" width="70" height="48" rx="4" fill="#fff" stroke="#94a3b8"/>' +
      '<text x="83" y="278" text-anchor="middle" font-size="11" fill="#334155">SS-North</text>' +
      '<path d="M90 340 C 220 300, 360 430, 520 340 S 800 250, 940 360" fill="none" stroke="#64748b" stroke-width="10"/>' +
      '<path d="M90 340 C 220 300, 360 430, 520 340 S 800 250, 940 360" fill="none" stroke="#1f6feb" stroke-width="2.4" stroke-dasharray="7 6"/>' +
      '<path d="M470 330 C 540 300, 580 292, 640 300" fill="none" stroke="#d97706" stroke-width="6" opacity="0.85"' + tip("Span N-18 · potential displaced vibration damper · score 0.93 · confirm location") + "/>" +
      '<path d="M700 390 C 760 360, 800 400, 860 380" fill="none" stroke="#65a30d" stroke-width="8" opacity="0.45"' + tip("Span N-19 · right-of-way vegetation watch") + "/>";
    towers.forEach(function (tower) {
      var ring = tower.name === highlight ? ' stroke="#fff" stroke-width="3"' : "";
      var fill = tower.state === "Review" ? "#9f1239" : tower.state === "Watch" || tower.state === "Confirm" ? "#b45309" : "#111827";
      svg += '<g class="node"' + tip(tower.tip) + prov(tower.name, tower.body) + '><circle cx="' + tower.x + '" cy="' + tower.y + '" r="12" fill="' + fill + '"' + ring + "/>" +
        '<text x="' + tower.x + '" y="' + (tower.y - 20) + '" text-anchor="middle" font-size="13" font-weight="700" fill="#1b2430">' + tower.name + "</text></g>";
    });
    svg += '<text x="560" y="250" text-anchor="middle" font-size="12" fill="#92400e">N-18 damper</text>';
    svg += '<text x="790" y="430" font-size="12" fill="#3f6212">N-19 ROW</text>';
    svg += "</svg>";
    return svg;
  }

  function atlas(spec) {
    var list = spec.towers.map(function (tower) {
      return '<button type="button" class="chip"' + tip(tower.tip) + prov(tower.name, tower.body) + "><b>" + esc(tower.name) + '</b><div class="k">' + esc(tower.meta) + "</div></button>";
    }).join("");
    return '<div class="screen"><div class="atlas card"><div class="baku-map" data-baku-map data-set="' + esc(spec.mapSet || "condition") + '"></div>' +
      '<div class="float left card"><h3>' + esc(spec.title) + "</h3>" + list + "</div>" +
      '<div class="float right card" id="prov"><h3>' + esc(spec.focusTitle) + "</h3><p>" + esc(spec.focus) + '</p><p class="k">Planning positions north of Baku. Not a surveyed tower file.</p></div></div></div>';
  }

  function mesh(spec) {
    var nodes = spec.nodes;
    var svg = '<svg class="mesh-svg" viewBox="0 0 760 520">';
    spec.edges.forEach(function (edge) {
      svg += '<line x1="' + nodes[edge[0]].x + '" y1="' + nodes[edge[0]].y + '" x2="' + nodes[edge[1]].x + '" y2="' + nodes[edge[1]].y + '" stroke="#cbd5e1" stroke-width="1.6"/>';
      if (edge[2]) {
        var mx = (nodes[edge[0]].x + nodes[edge[1]].x) / 2;
        var my = (nodes[edge[0]].y + nodes[edge[1]].y) / 2;
        svg += '<text x="' + mx + '" y="' + (my - 6) + '" text-anchor="middle" font-size="11" fill="#667085">' + esc(edge[2]) + "</text>";
      }
    });
    nodes.forEach(function (node) {
      svg += '<g class="node"' + tip(node.tip) + prov(node.title, node.body) + '><circle cx="' + node.x + '" cy="' + node.y + '" r="28" fill="' + node.color + '"/>' +
        '<text x="' + node.x + '" y="' + (node.y + 4) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">' + esc(node.short) + "</text>" +
        '<text x="' + node.x + '" y="' + (node.y + 48) + '" text-anchor="middle" font-size="12" fill="#1b2430">' + esc(node.title) + "</text></g>";
    });
    svg += "</svg>";
    var list = spec.list.map(function (item) {
      return '<button type="button" class="chip"' + tip(item.tip) + prov(item.title, item.body) + "><b>" + esc(item.title) + '</b><div class="k">' + esc(item.meta) + "</div></button>";
    }).join("");
    return '<div class="screen"><div class="mesh"><div class="card" style="padding:12px"><h3 style="margin:0 0 8px;font-size:13px">' + esc(spec.listTitle) + "</h3>" + list +
      '</div><div class="card canvas">' + svg + '</div><div class="card" id="prov" style="padding:14px"><h3 style="margin:0 0 8px;font-size:13px">' + esc(spec.focusTitle) + "</h3><p class=\"k\" style=\"font-size:13px;line-height:1.45;color:#1b2430\">" + esc(spec.focus) + "</p></div></div>" +
      (spec.columns ? '<div class="card table-card">' + table(spec.columns, spec.rows) + "</div>" : "") + "</div>";
  }

  function gantt(spec) {
    var ticks = spec.ticks.map(function (tick) { return "<span>" + esc(tick) + "</span>"; }).join("");
    var lanes = spec.lanes.map(function (lane) {
      var bars = lane.bars.map(function (bar) {
        return '<div class="bar" style="left:' + bar.left + "%;width:" + bar.width + "%;background:" + bar.color + '"' + tip(bar.tip) + ">" + esc(bar.label) + "</div>";
      }).join("");
      return '<div class="lane-name">' + esc(lane.name) + '</div><div class="lane">' + bars + "</div>";
    }).join("");
    return '<div class="screen">' + kpis(spec.kpis) + '<div class="card plan" style="padding:14px"><div class="k">' + esc(spec.title) + '</div><div class="gantt"><div></div><div class="hours">' + ticks + "</div>" + lanes + "</div></div>" +
      '<div class="card" style="padding:12px 14px"><div class="k">' + esc(spec.sideTitle) + "</div>" + hbars(spec.bars) + "</div></div>";
  }

  function scheduleBoard(spec) {
    var hours = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];
    var hourHtml = hours.map(function (hour) { return "<span>" + hour + "</span>"; }).join("");
    var rows = spec.lanes.map(function (lane) {
      var bars = lane.bars.map(function (bar) {
        return '<div class="job" style="left:' + bar.left + "%;width:" + bar.width + "%;background:" + bar.fill + '"' + tip(bar.tip) + ">" +
          '<i style="background:' + bar.ink + '"></i><div><b>' + esc(bar.id) + "</b><span>" + esc(bar.label) + "</span></div>" +
          (bar.flag ? '<em class="flag"></em>' : "") + "</div>";
      }).join("");
      var slots = [7, 20, 46, 76, 90].filter(function (slot) {
        return lane.bars.every(function (bar) { return slot < bar.left - 3 || slot > bar.left + bar.width + 3; });
      }).slice(0, 3);
      var downs = slots.map(function (slot) { return '<span class="down" style="left:' + slot + '%">Downtime</span>'; }).join("");
      return '<div class="res-name">' + esc(lane.name) + '</div><div class="res-lane">' + downs + bars + "</div>";
    }).join("");
    return '<div class="screen sched-screen"><div class="sched">' +
      '<div class="sched-tools">' +
      '<select class="sched-select" data-sched-name><option>Main Schedule</option><option>Visit window</option><option>Review queue</option></select>' +
      '<select class="sched-select" data-sched-session><option>Corridor_North_Main_Session</option><option>Coastal_Watch_Session</option><option>Inland_Age_Session</option></select>' +
      '<button type="button" class="scenario-btn">Create New Scenario</button></div>' +
      '<div class="sched-title-row"><div><h2 data-sched-heading>' + esc(spec.title || "Main Schedule") + "</h2>" +
      '<div class="sched-updated">Last updated: ' + esc(spec.updated || "Wednesday, 9:23 AM") + '</div><div class="sched-draft" data-sched-note></div></div>' +
      '<div class="sched-mini"><button type="button" data-tip="Filter this schedule">▦</button><button type="button" data-tip="Search jobs">⌕</button><button type="button" data-tip="Fit the day">⛶</button></div></div>' +
      '<div class="sched-board"><div class="res-head">Resources</div><div class="date-head">' + esc(spec.day || "Wednesday · planned visit") + "</div>" +
      '<div class="res-sub"></div><div class="hour-row">' + hourHtml + "</div>" + rows +
      '<div class="now-line" data-tip="15:00 · planning line. The visit has not started."></div></div></div></div>';
  }

  function bbIcon(kind) {
    var paths = {
      path: "M2 12V4h4l2 3h6",
      link: "M3 8h4M9 8h4",
      plus: "M8 3v10M3 8h10",
      x: "M4 4l8 8M12 4L4 12",
      undo: "M6 6H3v3M3.5 7.5A5 5 0 1 1 4 11",
      redo: "M10 6h3v3M12.5 7.5A5 5 0 1 0 12 11",
      user: "M8 8a2.2 2.2 0 1 0 0-4.4A2.2 2.2 0 0 0 8 8zM3.5 13c.6-2 2.2-3 4.5-3s3.9 1 4.5 3",
      tower: "M8 2l4 12H4z",
      file: "M5 2h4l3 3v9H5z"
    };
    var extra = kind === "link" ? '<circle cx="3" cy="8" r="2" fill="none" stroke="currentColor"/><circle cx="13" cy="8" r="2" fill="none" stroke="currentColor"/>' : "";
    return '<svg viewBox="0 0 16 16" aria-hidden="true">' + extra + '<path d="' + (paths[kind] || paths.link) + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  }

  function divergeChart(items, max) {
    var w = 420;
    var h = 210;
    var left = 54;
    var mid = 118;
    var half = 78;
    var gap = (w - left - 24) / items.length;
    var labels = [max, max / 2, 0, -max / 2, -max].map(function (tick, index) {
      var y = 24 + index * (half * 2 / 4);
      return '<text x="48" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#98a2b3">' + tick + '</text><line x1="54" y1="' + y + '" x2="' + (w - 12) + '" y2="' + y + '" stroke="#eef1f4"/>';
    }).join("");
    var bars = items.map(function (item, index) {
      var x = left + index * gap + gap * 0.28;
      var height = Math.max(4, Math.abs(item.value) / max * half);
      var y = item.value >= 0 ? mid - height : mid;
      return '<rect x="' + x + '" y="' + y + '" width="42" height="' + height + '" rx="3" fill="' + item.color + '"' + tip(item.tip) + '/>' +
        '<text x="' + (x + 21) + '" y="198" text-anchor="middle" font-size="10" fill="#667085">' + esc(item.label) + "</text>";
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="rec-svg">' + labels + '<line x1="54" y1="' + mid + '" x2="' + (w - 12) + '" y2="' + mid + '" stroke="#d0d5dd"/>' + bars + "</svg>";
  }

  function levelChart(labels, values, tipText) {
    var w = 420;
    var h = 210;
    var max = 100;
    var left = 36;
    var base = 168;
    var gap = (w - left - 16) / labels.length;
    var grid = [0, 25, 50, 75, 100].map(function (tick) {
      var y = base - tick / max * 140;
      return '<text x="30" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="#98a2b3">' + tick + '</text><line x1="36" y1="' + y + '" x2="' + (w - 8) + '" y2="' + y + '" stroke="#eef1f4"/>';
    }).join("");
    var bars = values.map(function (value, index) {
      var x = left + index * gap + 10;
      var height = value / max * 140;
      return '<rect x="' + x + '" y="' + (base - height) + '" width="18" height="' + height + '" rx="2" fill="#c5c9d4"' + tip(tipText) + '/>' +
        '<rect x="' + (x + 20) + '" y="' + (base - height * 0.92) + '" width="18" height="' + height * 0.92 + '" rx="2" fill="#7c6bb5"' + tip(labels[index] + " · " + value) + '/>' +
        '<circle cx="' + (x + 29) + '" cy="' + (base - height - 8) + '" r="4" fill="#3d9a78"' + tip("Latest mark · " + value) + '/>' +
        '<text x="' + (x + 20) + '" y="188" text-anchor="middle" font-size="10" fill="#667085">' + esc(labels[index]) + "</text>";
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="rec-svg">' + grid + bars + "</svg>";
  }

  function recRow(item) {
    return '<tr data-rec data-keys="' + esc(item.keys) + '" data-text="' + esc(item.item + " " + item.meta + " " + item.place + " " + item.text) + '">' +
      '<td><input type="checkbox" data-rec-box></td>' +
      '<td><b>' + esc(item.item) + '</b><div class="k">' + esc(item.meta) + "</div></td>" +
      '<td><b>' + esc(item.place) + '</b><div class="k">' + esc(item.placeMeta) + "</div></td>" +
      '<td class="rec-text">' + esc(item.text) + ' <span class="rec-state" data-rec-state>Open</span></td>' +
      '<td>' + esc(item.impact) + "</td><td>" + esc(item.level) + "</td><td>" + esc(item.check) + "</td><td>" + esc(item.date) + "</td></tr>";
  }

  var PLAN_FILTERS = [
    { label: "Corridor", options: ["All", "Corridor North", "Coastal", "Inland"] },
    { label: "Asset", options: ["All", "T-104", "T-103", "T-110", "Span N-18", "Span N-19"] },
    { label: "Voltage", options: ["All", "220 kV"] },
    { label: "Work", options: ["All", "Steel", "Cotter", "Damper", "Foundation", "ROW"] },
    { label: "State", options: ["All", "Review", "Watch", "Stable", "Hold"] },
    { label: "Source", options: ["All", "Inspection 6", "Historian", "EMS", "Warehouse", "Plan"] },
    { label: "Window", options: ["All", "This visit", "Next quarter"] }
  ];

  function planMetrics(items) {
    return '<div class="pln-metrics">' + items.map(function (item) {
      var extra = item.note ? '<em>' + esc(item.note) + "</em>" : "";
      return '<div class="pln-metric"><div class="k">' + esc(item.k) + "</div><strong>" + esc(item.v) + extra + "</strong></div>";
    }).join("") + "</div>";
  }

  function planTiles(items) {
    return '<div class="pln-tiles">' + items.map(function (item) {
      var tone = item.tone === "down" ? "down" : "up";
      var pill = item.pill ? '<span class="pln-pill ' + tone + '">' + esc(item.pill) + "</span>" : "";
      return '<div class="pln-tile"><div class="k">' + esc(item.k) + "</div><strong>" + esc(item.v) + pill + "</strong></div>";
    }).join("") + "</div>";
  }

  function planRing(view) {
    var radius = 58;
    var circ = 2 * Math.PI * radius;
    var numeric = view.ringSpan != null ? Number(view.ringSpan) : Number(view.ring);
    var span = isNaN(numeric) ? 0 : Math.max(0, Math.min(100, numeric));
    var offset = circ * (1 - span / 100);
    var unit = view.ringUnit == null ? "%" : view.ringUnit;
    return '<figure class="pln-ring"' + tip(view.ringTip) + '><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="58" fill="none" stroke="#e8eef5" stroke-width="14"/><circle cx="80" cy="80" r="58" fill="none" stroke="#1f6feb" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" transform="rotate(-90 80 80)"/><text x="80" y="88" text-anchor="middle" font-size="32" font-weight="700" fill="#1b2430">' + esc(String(view.ring)) + esc(unit) + "</text></svg><figcaption>" + esc(view.ringLabel) + "</figcaption></figure>";
  }

  function planChart(spec) {
    if (!spec || !spec.labels || !spec.labels.length) return "";
    var w = 860;
    var h = 260;
    var left = 48;
    var right = 12;
    var top = 16;
    var bottom = 32;
    var plotH = h - top - bottom;
    var plotW = w - left - right;
    var labels = spec.labels;
    var stacks = spec.stacks || [];
    var lines = spec.lines || [];
    var grouped = spec.mode === "group";
    var max = Number(spec.max) || 0;
    labels.forEach(function (_, index) {
      if (!spec.max) {
        if (grouped) {
          stacks.forEach(function (series) { max = Math.max(max, Number(series.values[index]) || 0); });
        } else {
          var sum = 0;
          stacks.forEach(function (series) { sum += Number(series.values[index]) || 0; });
          max = Math.max(max, sum);
        }
        lines.forEach(function (series) { max = Math.max(max, Number(series.values[index]) || 0); });
      }
    });
    if (!max) max = 1;
    function yOf(value) {
      return top + (1 - Math.max(0, value) / max) * plotH;
    }
    var grid = [0, 0.5, 1].map(function (step) {
      var y = top + (1 - step) * plotH;
      var label = max * step;
      var text = label >= 10 ? String(Math.round(label)) : String(Math.round(label * 10) / 10);
      return '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (w - right) + '" y2="' + y.toFixed(1) + '" stroke="#eef2f6"/><text x="6" y="' + (y + 4).toFixed(1) + '" font-size="11" fill="#98a2b3">' + text + "</text>";
    }).join("");
    var slot = plotW / labels.length;
    var seriesCount = Math.max(1, stacks.length);
    var groupW = Math.min(slot - 18, grouped ? 20 * seriesCount + 4 * (seriesCount - 1) : 48);
    var barW = grouped ? Math.max(8, (groupW - 4 * (seriesCount - 1)) / seriesCount) : groupW;
    var bars = labels.map(function (_, index) {
      var origin = left + index * slot + (slot - (grouped ? groupW : barW)) / 2;
      if (grouped) {
        return stacks.map(function (series, seriesIndex) {
          var value = Number(series.values[index]) || 0;
          var y = yOf(value);
          var x = origin + seriesIndex * (barW + 4);
          return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(0, top + plotH - y).toFixed(1) + '" rx="3" fill="' + series.color + '"><title>' + esc(series.name + " · " + value) + "</title></rect>";
        }).join("");
      }
      var cursor = 0;
      return stacks.map(function (series) {
        var value = Number(series.values[index]) || 0;
        var y0 = yOf(cursor);
        cursor += value;
        var y1 = yOf(cursor);
        return '<rect x="' + origin.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(0, y0 - y1).toFixed(1) + '" fill="' + series.color + '"><title>' + esc(series.name + " · " + value) + "</title></rect>";
      }).join("");
    }).join("");
    var paths = lines.map(function (series) {
      var points = series.values.map(function (value, index) {
        return [left + index * slot + slot / 2, yOf(Number(value) || 0)];
      });
      var d = points.map(function (point, index) {
        return (index ? "L" : "M") + point[0].toFixed(1) + " " + point[1].toFixed(1);
      }).join(" ");
      var dots = points.map(function (point) {
        return '<circle cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="4.5" fill="#fff" stroke="' + series.color + '" stroke-width="2"><title>' + esc(series.name) + "</title></circle>";
      }).join("");
      return '<path d="' + d + '" fill="none" stroke="' + series.color + '" stroke-width="2"' + (series.dash ? ' stroke-dasharray="5 4"' : "") + "/>" + dots;
    }).join("");
    var axis = labels.map(function (label, index) {
      return '<text x="' + (left + index * slot + slot / 2).toFixed(1) + '" y="' + (h - 10) + '" text-anchor="middle" font-size="11" fill="#667085">' + esc(label) + "</text>";
    }).join("");
    var legend = stacks.concat(lines).map(function (series) {
      return '<span><i style="background:' + series.color + '"></i>' + esc(series.name) + "</span>";
    }).join("");
    return '<div class="pln-chart"><h3>' + esc(spec.title) + '</h3><svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(spec.title) + '">' + grid + bars + paths + axis + '</svg><div class="pln-legend">' + legend + "</div></div>";
  }

  function planView(view, on, chart) {
    var hero = view.hero || (view.band && view.band[0] ? { v: view.band[0].v, k: view.band[0].k } : { v: "", k: "" });
    return '<section class="pln-view' + (on ? " is-on" : "") + '" data-pln-view data-when="' + esc(view.when || "") + '"><div class="pln-pair"><article class="pln-card"><div class="pln-card-h"><b>' + esc(view.leftTitle) + '</b><span class="pln-badge">' + esc(view.badge) + "</span></div>" + planMetrics(view.left) + '</article><article class="pln-card"><div class="pln-card-h"><b>' + esc(view.rightTitle) + "</b></div>" + planMetrics(view.right) + "</article></div>" +
      '<section class="pln-band"><div class="pln-band-h"><b>' + esc(view.bandTitle) + "</b><span>" + esc(view.bandNote) + "</span></div><div class=\"pln-band-body\">" + planTiles(view.band) +
      '<div class="pln-story"><div class="pln-hero"><strong>' + esc(hero.v) + "</strong><span>" + esc(hero.k) + '</span></div><div class="pln-summary"><b>Summary</b><p>' + esc(view.summary) + '</p><p class="pln-more" data-pln-more hidden>' + esc(view.more) + '</p><button type="button" data-pln-explain>Explain this in depth</button><div class="pln-actions"><button type="button" class="is-primary" data-pln-stage>Stage forecast</button><button type="button" class="is-ghost" data-pln-edit>Edit forecast</button></div></div>' +
      planRing(view) + "</div>" + planChart(view.chart || chart) + "</div></section></section>";
  }

  function planBoard(spec) {
    var filters = PLAN_FILTERS.map(function (field) {
      var options = field.options.map(function (option) { return "<option>" + esc(option) + "</option>"; }).join("");
      return "<label>" + esc(field.label) + '<select data-pln-filter="' + esc(field.label) + '">' + options + "</select></label>";
    }).join("");
    var views = spec.views.map(function (view, index) { return planView(view, index === 0, spec.chart); }).join("");
    return '<div class="screen pln-screen"><div class="pln" data-pln-quiet="' + esc((spec.quiet || []).join("|")) + '"><div class="pln-head"><div><h2>Forecast</h2><p class="pln-next">' + esc(spec.next) + '</p></div><div class="pln-dates"><label>Start date<input data-pln-date value="' + esc(spec.start) + '"></label><label>End date<input data-pln-date value="' + esc(spec.end) + '"></label></div></div>' +
      '<div class="pln-filters">' + filters + '<button type="button" class="pln-apply" data-pln-apply>Apply filter</button></div>' + views +
      '<p class="pln-note" data-pln-note></p></div></div>';
  }

  var optSeq = 0;

  function greenSpark(values, id) {
    var series = values && values.length > 1 ? values : [values && values.length ? values[0] : 0, values && values.length ? values[0] : 0];
    var max = Math.max.apply(null, series);
    var min = Math.min.apply(null, series);
    var span = max - min || 1;
    var w = 240;
    var h = 64;
    var flat = max === min;
    var pts = series.map(function (value, index) {
      var x = (index / (series.length - 1)) * w;
      var y = flat ? h * 0.42 : 8 + (1 - (value - min) / span) * (h - 18);
      return [x, y];
    });
    var line = pts.map(function (point, index) {
      return (index ? "L" : "M") + point[0].toFixed(1) + " " + point[1].toFixed(1);
    }).join(" ");
    return '<svg class="opt-spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86efac"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><path d="' + line + " L " + w + " " + h + " L 0 " + h + ' Z" fill="url(#' + id + ')"/><path d="' + line + '" fill="none" stroke="#16a34a" stroke-width="1.6"/></svg>';
  }

  function optChart(spec) {
    var w = 720;
    var h = 210;
    var left = 44;
    var right = 16;
    var top = 14;
    var bottom = 28;
    var max = spec.max || 100;
    var n = spec.labels.length;
    function X(index) {
      return left + (n === 1 ? (w - left - right) / 2 : (index / (n - 1)) * (w - left - right));
    }
    function Y(value) {
      return top + (1 - Math.max(0, value) / max) * (h - top - bottom);
    }
    var grid = [0, 0.5, 1].map(function (step) {
      var y = top + (1 - step) * (h - top - bottom);
      var label = step === 1 ? max : step === 0.5 ? max / 2 : 0;
      var text = label % 1 ? label.toFixed(1) : String(label);
      return '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (w - right) + '" y2="' + y.toFixed(1) + '" stroke="#eef2f6"/><text x="6" y="' + (y + 4).toFixed(1) + '" font-size="11" fill="#98a2b3">' + text + "</text>";
    }).join("");
    var paths = spec.series.map(function (series) {
      var d = series.values.map(function (value, index) {
        return (index ? "L" : "M") + X(index).toFixed(1) + " " + Y(value).toFixed(1);
      }).join(" ");
      return '<path d="' + d + '" fill="none" stroke="' + series.color + '" stroke-width="1.7"' + (series.dash ? ' stroke-dasharray="4 3"' : "") + "/>";
    }).join("");
    var labels = spec.labels.map(function (label, index) {
      return '<text x="' + X(index).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="11" fill="#98a2b3">' + esc(label) + "</text>";
    }).join("");
    return '<svg class="opt-svg" viewBox="0 0 ' + w + " " + h + '">' + grid + paths + labels + "</svg>";
  }

  var BAKU_POINTS = [
    { id: "ss", lat: 40.512, lon: 49.955, name: "SS-North", kind: "sub", note: "Planning substation, north Absheron." },
    { id: "t101", lat: 40.492, lon: 49.948, name: "T-101", kind: "stable", note: "Index 88. Stable." },
    { id: "t103", lat: 40.472, lon: 49.94, name: "T-103", kind: "watch", note: "Index 74. Foundation watch, not a verified defect." },
    { id: "t104", lat: 40.455, lon: 49.93, name: "T-104", kind: "review", note: "Index 61. Two verified structural findings." },
    { id: "n18", lat: 40.438, lon: 49.918, name: "Span N-18", kind: "watch", note: "Damper is visual. Location is not confirmed." },
    { id: "n19", lat: 40.428, lon: 49.905, name: "Span N-19", kind: "work", note: "ROW vegetation. Released to VEG-02." },
    { id: "t110", lat: 40.418, lon: 49.89, name: "T-110", kind: "stable", note: "Index 91. Stable and outside the package." }
  ];
  var BAKU_SETS = {
    condition: ["ss", "t101", "t103", "t104", "n18", "n19", "t110"],
    visit: ["t104", "t103", "n18", "n19"],
    line: ["ss", "t101", "t103", "t104", "t110"],
    crew: ["t104", "n19"]
  };
  var BAKU_VIEWS = {
    "Corridor North": null,
    Coastal: { center: [40.18, 49.48], zoom: 12 },
    Inland: { center: [40.41, 49.7], zoom: 11 }
  };

  function bakuPoints(setName) {
    var ids = BAKU_SETS[setName] || BAKU_SETS.condition;
    return ids.map(function (id) {
      var found = null;
      BAKU_POINTS.forEach(function (point) { if (point.id === id) found = point; });
      return found;
    }).filter(Boolean);
  }

  function ensureLeaflet(done) {
    if (window.L) { done(); return; }
    if (ensureLeaflet.waiting) { ensureLeaflet.waiting.push(done); return; }
    ensureLeaflet.waiting = [done];
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    var script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = function () {
      var queue = ensureLeaflet.waiting || [];
      ensureLeaflet.waiting = null;
      queue.forEach(function (fn) { fn(); });
    };
    document.head.appendChild(script);
  }

  function drawBaku(el) {
    if (!window.L || el.getAttribute("data-ready")) return;
    el.setAttribute("data-ready", "1");
    var points = bakuPoints(el.getAttribute("data-set"));
    var map = L.map(el, { scrollWheelZoom: false, zoomControl: false }).setView([40.47, 49.93], 12);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 18 }).addTo(map);
    var latlngs = points.map(function (point) { return [point.lat, point.lon]; });
    L.polyline(latlngs, { color: "#1f6feb", weight: 3 }).addTo(map);
    points.forEach(function (point) {
      var color = point.kind === "review" ? "#9f1239" : point.kind === "watch" ? "#d97706" : point.kind === "work" ? "#1f6feb" : point.kind === "sub" ? "#0f766e" : "#178a4c";
      L.circleMarker([point.lat, point.lon], { radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(point.name + " · " + point.lat.toFixed(3) + ", " + point.lon.toFixed(3) + " · " + point.note, { direction: "top" }).addTo(map);
    });
    if (latlngs.length) map.fitBounds(latlngs, { padding: [28, 28] });
    el._baku = map;
    el._bakuLine = latlngs;
    setTimeout(function () { map.invalidateSize(); }, 80);
  }

  function paintBakuMaps(root) {
    var nodes = (root || document).querySelectorAll("[data-baku-map]");
    if (!nodes.length) return;
    ensureLeaflet(function () { nodes.forEach(drawBaku); });
  }

  function towerMark(x, name, note, color) {
    return '<g><line x1="' + x + '" y1="78" x2="' + x + '" y2="168" stroke="#334155" stroke-width="3"/><line x1="' + (x - 28) + '" y1="96" x2="' + (x + 28) + '" y2="96" stroke="#334155" stroke-width="3"/><circle cx="' + (x - 16) + '" cy="96" r="4" fill="' + color + '"/><circle cx="' + (x + 16) + '" cy="96" r="4" fill="' + color + '"/><line x1="' + (x - 16) + '" y1="168" x2="' + (x + 16) + '" y2="188" stroke="#334155" stroke-width="3"/><line x1="' + (x + 16) + '" y1="168" x2="' + (x - 16) + '" y2="188" stroke="#334155" stroke-width="3"/><text x="' + x + '" y="214" text-anchor="middle" font-size="13" font-weight="700" fill="#1b2430">' + esc(name) + '</text><text x="' + x + '" y="232" text-anchor="middle" font-size="11" fill="#667085">' + esc(note) + "</text></g>";
  }

  function lineDiagram() {
    var marks = [
      towerMark(168, "T-101", "Index 88", "#178a4c"),
      towerMark(268, "T-103", "Index 74", "#d97706"),
      towerMark(378, "T-104", "Index 61", "#9f1239"),
      towerMark(488, "N-18", "Damper", "#d97706"),
      towerMark(588, "N-19", "ROW", "#1f6feb"),
      towerMark(688, "T-110", "Index 91", "#178a4c")
    ].join("");
    return '<svg class="rel-svg" viewBox="0 0 760 280" role="img" aria-label="Corridor North one-line"><rect x="24" y="36" width="92" height="84" rx="8" fill="#f0fdfa" stroke="#0f766e" stroke-width="2"/><text x="70" y="68" text-anchor="middle" font-size="12" font-weight="700" fill="#0f766e">SS-North</text><text x="70" y="88" text-anchor="middle" font-size="11" fill="#667085">220 kV</text><circle cx="58" cy="104" r="7" fill="none" stroke="#0f766e" stroke-width="2"/><circle cx="82" cy="104" r="7" fill="none" stroke="#0f766e" stroke-width="2"/><line x1="116" y1="78" x2="688" y2="78" stroke="#1f6feb" stroke-width="4"/>' + marks + "</svg>";
  }

  function flowDiagram(rows) {
    var items = rows.slice(0, 5);
    var w = 760;
    var gap = w / items.length;
    var boxes = items.map(function (row, index) {
      var x = index * gap + 18;
      var color = row.tone === "down" ? "#9f1239" : row.tone === "up" ? "#1f6feb" : "#0f766e";
      var next = index < items.length - 1 ? '<line x1="' + (x + gap - 28) + '" y1="120" x2="' + (x + gap + 8) + '" y2="120" stroke="#cbd5e1" stroke-width="2"/>' : "";
      return '<g><rect x="' + x + '" y="64" width="' + (gap - 36) + '" height="112" rx="10" fill="#fff" stroke="' + color + '" stroke-width="2"/><text x="' + (x + (gap - 36) / 2) + '" y="100" text-anchor="middle" font-size="13" font-weight="700" fill="#1b2430">' + esc(row.name) + '</text><text x="' + (x + (gap - 36) / 2) + '" y="126" text-anchor="middle" font-size="18" font-weight="700" fill="' + color + '">' + esc(row.current) + '</text><text x="' + (x + (gap - 36) / 2) + '" y="150" text-anchor="middle" font-size="11" fill="#667085">' + esc(row.change) + "</text></g>" + next;
    }).join("");
    return '<svg class="rel-svg" viewBox="0 0 ' + w + ' 250" role="img" aria-label="Recorded flow">' + boxes + "</svg>";
  }

  function optBoard(spec) {
    var gid = "og" + (++optSeq);
    var lead = spec.cards[0];
    var second = spec.cards[1];
    var stacked = spec.cards.slice(2, 4).map(function (card) {
      return '<div class="rel-mini"' + tip(card.tip) + '><div class="k">' + esc(card.k) + "</div><strong>" + esc(card.v) + '</strong><em class="' + esc(card.tone || "flat") + '">' + esc(card.delta) + "</em></div>";
    }).join("");
    var facts = spec.facts.map(function (fact) {
      return "<div><span>" + esc(fact.k) + "</span><b>" + esc(fact.v) + "</b></div>";
    }).join("");
    var rows = spec.rows.map(function (row, index) {
      var arrow = row.tone === "up" ? "↑ " : row.tone === "down" ? "↓ " : "";
      var zone = row.zone || (row.name === "Coastal" ? "Coastal" : row.name === "Inland" ? "Inland" : "Corridor North");
      return '<tr data-opt-row data-zone="' + esc(zone) + '" data-opt-note="' + esc(row.note) + '"' + (index === 0 ? ' class="is-on"' : "") + "><td><b>" + esc(row.name) + "</b></td><td>" + esc(row.unit) + "</td><td>" + esc(row.recorded) + "</td><td>" + esc(row.current) + '</td><td><span class="opt-delta ' + esc(row.tone || "flat") + '">' + arrow + esc(row.change) + "</span></td></tr>";
    }).join("");
    var count = spec.rows.length;
    var diagram = spec.map ? lineDiagram() : flowDiagram(spec.rows);
    var viewSelect = spec.map
      ? '<select data-opt-view><option value="diagram">Corridor one-line</option><option value="map">Baku map</option></select>'
      : '<select data-opt-view><option value="diagram">Recorded flow</option></select>';
    var map = spec.map ? '<div class="baku-map" data-baku-map data-set="' + esc(spec.map) + '" hidden></div>' : "";
    var caption = spec.map
      ? "Planning positions on the Absheron peninsula, north of Baku. Not a surveyed tower file."
      : "This cut has no corridor coordinates. The diagram is the record.";
    return '<div class="screen"><div class="opt rel"><div class="rel-pick"><span data-rel-count>' + count + " of " + count + ' records selected</span><label>Select corridor<select data-opt-place><option>Corridor North</option><option>Coastal</option><option>Inland</option></select></label></div><h2>Overview</h2>' +
      '<section class="rel-metrics"><article class="rel-lead"' + tip(lead.tip) + '><div class="k">' + esc(lead.k) + '</div><strong>' + esc(lead.v) + '</strong><em class="' + esc(lead.tone || "flat") + '">' + esc(lead.delta) + "</em>" + lilacSpark(lead.spark, gid + "lead") + "</article>" +
      '<article class="rel-figure"' + tip(second.tip) + '><div class="k">' + esc(second.k) + "</div><strong>" + esc(second.v) + '</strong><em class="' + esc(second.tone || "flat") + '">' + esc(second.delta) + "</em><span>" + esc(second.caption) + "</span></article>" +
      '<div class="rel-stack">' + stacked + '</div><aside class="rel-status"><h3>' + esc(spec.statusTitle || "Open work") + "</h3>" + facts + "</aside></section>" +
      '<section class="rel-main"><div class="rel-diagram"><div class="rel-diagram-h"><h3>Asset diagram</h3>' + viewSelect + '</div><div data-opt-diagram>' + diagram + '</div>' + map + '<p class="fac-caption" data-opt-place-note>' + caption + '</p></div>' +
      '<div class="rel-table"><div class="opt-recent-h"><h3>Most recent records</h3><div class="opt-actions"><button type="button" data-opt-detail>View detail</button><button type="button" data-opt-stage>Stage review</button></div></div><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Unit</th><th>Recorded</th><th>Current</th><th>Change</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="opt-pager"><span>Items per page</span><select data-opt-size><option>5</option><option>3</option></select><span data-opt-range>1–' + count + " of " + count + '</span></div><p class="opt-note" data-opt-note></p><p class="opt-empty" data-opt-empty hidden>No records in this cut.</p></div></div></section></div></div>';
  }

  function matrixGlyph(status) {
    if (status === "collected") return "✓";
    if (status === "unscheduled" || status === "held") return "×";
    return "";
  }

  function matrixPanel(name, basic, description, source) {
    var rows = (basic || []).map(function (pair) {
      return '<div class="mx-prop"><span>' + esc(pair[0]) + "</span><b>" + esc(pair[1]) + "</b></div>";
    }).join("");
    return "<h3>" + esc(name) + '</h3><div class="mx-k">Basic information</div>' + rows +
      '<div class="mx-k">Detailed information</div><div class="mx-k2">Description</div><p>' + esc(description || "") + "</p>" +
      (source ? '<p class="mx-src">' + esc(source) + "</p>" : "");
  }

  function matrixBoard(spec) {
    var chip = spec.chip || "";
    var focus = spec.nodes[0];
    spec.nodes.forEach(function (node) { if (node.id === spec.focus) focus = node; });
    var byId = {};
    spec.nodes.forEach(function (node) { byId[node.id] = node; });
    var lines = (spec.edges || []).map(function (edge) {
      var a = byId[edge[0]];
      var b = byId[edge[1]];
      if (!a || !b) return "";
      return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#d0d5dd" stroke-width="1.4" vector-effect="non-scaling-stroke"/>';
    }).join("");
    var nodes = spec.nodes.map(function (node) {
      var basic = (node.basic || []).map(function (pair) { return pair[0] + "=" + pair[1]; }).join("|");
      var mark = node.mark ? '<span class="mx-mark">' + esc(node.mark) + "</span>" : "";
      var dot = '<span class="mx-dot ' + esc(node.status) + '">' + (node.kind === "parent" ? esc(node.name) : matrixGlyph(node.status)) + "</span>";
      var inner = node.kind === "leaf" ? mark + '<span class="mx-name">' + esc(node.name) + "</span>" + dot : mark + dot;
      return '<button type="button" class="mx-node' + (node.id === focus.id ? " is-on" : "") + '" data-mx-node data-name="' + esc(node.name) + '" data-basic="' + esc(basic) + '" data-desc="' + esc(node.description || "") + '" data-source="' + esc(node.source || "") + '" data-tag="' + esc(node.tag || "") + '" style="left:' + node.x + "%;top:" + node.y + '%"' + tip(node.description || node.name) + ">" + inner + "</button>";
    }).join("");
    var metrics = spec.metrics.map(function (item, index) {
      var column = (index % 3) + 2;
      var row = index < 3 ? 1 : 2;
      return '<div class="mx-metric" style="grid-column:' + column + ";grid-row:" + row + '"' + tip(item.tip) + '><div class="k">' + esc(item.k) + "</div><strong>" + esc(item.v) + "</strong></div>";
    }).join("");
    var legend = (spec.legend || [
      ["agency", "Corridor"],
      ["collected", "Collected"],
      ["scheduled", "Scheduled"],
      ["unscheduled", "Unscheduled"],
      ["held", "Held"],
      ["risk", "At risk"]
    ]).map(function (item) {
      return "<span><i class=\"" + esc(item[0]) + "\"></i>" + esc(item[1]) + "</span>";
    }).join("");
    var tableRows = spec.nodes.map(function (node) {
      var basic = (node.basic || []).map(function (pair) { return pair[0] + "=" + pair[1]; }).join("|");
      return '<tr data-mx-node data-name="' + esc(node.name) + '" data-basic="' + esc(basic) + '" data-desc="' + esc(node.description || "") + '" data-source="' + esc(node.source || "") + '" data-tag="' + esc(node.tag || "") + '"><td><b>' + esc(node.name) + "</b></td><td>" + esc(node.status) + "</td><td>" + esc(node.description || "") + "</td></tr>";
    }).join("");
    return '<div class="screen"><div class="mx" data-filter="' + esc(chip) + '"><header class="mx-top"><div><h2>' + esc(spec.title) + '</h2><div class="mx-date">' + esc(spec.date) + '</div><div class="mx-op">' + esc(spec.operation) + '</div><div class="mx-actions"><button type="button" data-mx="modify">Modify</button><button type="button" data-mx="export">Export</button></div></div>' +
      '<div class="mx-stats"><div class="mx-conflict"' + tip(spec.conflict.tip) + '><div class="k">' + esc(spec.conflict.k) + '</div><b><i></i>' + esc(spec.conflict.v) + "</b></div>" + metrics +
      '<div class="mx-score"' + tip(spec.score.tip) + '><div class="mx-bar"><span style="width:' + Math.max(0, Math.min(100, Number(spec.score.value) || 0)) + '%"></span></div><div class="k">' + esc(spec.score.label) + "</div><strong>" + esc(String(spec.score.value)) + "</strong></div></div></header>" +
      '<div class="mx-tool"><button type="button" data-mx-view="table">Tabular view</button><button type="button" class="is-on" data-mx-view="tree">Hierarchical view</button><span class="mx-filter" data-mx-filter>Filter to <button type="button" class="mx-chip" data-mx-chip>' + esc(chip) + " ×</button></span>" +
      '<button type="button" class="mx-text" data-mx-clear>Clear</button><button type="button" class="mx-text" data-mx="save">Save</button><span class="mx-note" data-mx-note></span></div>' +
      '<div class="mx-body"><section class="mx-tree" data-mx-tree><h3>' + esc(spec.heading) + '</h3><div class="mx-legend">' + legend + '</div><div class="mx-canvas"><svg viewBox="0 0 100 100" preserveAspectRatio="none">' + lines + "</svg>" + nodes + '</div></section>' +
      '<section class="mx-table-wrap" data-mx-table hidden><table><thead><tr><th>Record</th><th>Status</th><th>Description</th></tr></thead><tbody>' + tableRows + "</tbody></table></section>" +
      '<aside class="mx-detail" data-mx-detail>' + matrixPanel(focus.name, focus.basic, focus.description, focus.source) + "</aside></div></div></div>";
  }

  function heatColor(value) {
    var alpha = 0.16 + (Math.max(0, Math.min(100, value)) / 100) * 0.84;
    return "rgba(14, 148, 158, " + alpha.toFixed(2) + ")";
  }

  function issueSquares(values, notes) {
    var html = "";
    values.forEach(function (value, index) {
      var note = notes[index] || "";
      var n;
      for (n = 0; n < 4; n++) {
        if (value == null) html += '<i class="iss-dot"' + tip(note) + "></i>";
        else html += '<i class="iss-cell" style="background:' + heatColor(value) + '"' + tip(note) + "></i>";
      }
    });
    return html;
  }

  function issueTrend(spec) {
    var w = 640;
    var h = 220;
    var max = spec.max || 100;
    var left = 36;
    var base = 180;
    var step = (w - left - 20) / Math.max(1, spec.labels.length - 1);
    var pts = spec.values.map(function (value, index) {
      var x = left + index * step;
      var y = base - (value / max) * 140;
      return x + "," + y;
    }).join(" ");
    var dots = spec.values.map(function (value, index) {
      var x = left + index * step;
      var y = base - (value / max) * 140;
      return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#0e949e"' + tip(spec.labels[index] + " · " + value) + "/>";
    }).join("");
    var labels = spec.labels.map(function (label, index) {
      var x = left + index * step;
      return '<text x="' + x + '" y="204" text-anchor="middle" font-size="11" fill="#98a2b3">' + esc(label) + "</text>";
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="iss-trend-svg"><line x1="36" y1="40" x2="' + (w - 16) + '" y2="40" stroke="#eef2f6"/><line x1="36" y1="110" x2="' + (w - 16) + '" y2="110" stroke="#eef2f6"/><line x1="36" y1="180" x2="' + (w - 16) + '" y2="180" stroke="#e4e7ec"/><polyline points="' + pts + '" fill="none" stroke="#0e949e" stroke-width="2"/>' + dots + labels + "</svg>";
  }

  function issueBoard(spec) {
    var cards = spec.cards.map(function (card, index) {
      var lines = card.lines.map(function (line) {
        return '<div class="iss-line"><span>' + esc(line[0]) + "</span><b>" + esc(line[1]) + "</b></div>";
      }).join("");
      return '<article class="iss-card' + (index === 0 ? " is-on" : "") + '"><div class="iss-card-h"><b>' + esc(card.name) + "</b><span>" + esc(card.score) + "</span></div>" + lines +
        '<button type="button" data-iss-detail="' + esc(card.detail) + '">Detail</button></article>';
    }).join("");
    var heads = spec.cols.map(function (col) { return "<span>" + esc(col) + "</span>"; }).join("");
    var groups = spec.groups.map(function (group) {
      var rows = group.rows.map(function (row) {
        return '<div class="iss-row"><span>' + esc(row.name) + '</span><div class="iss-cells">' + issueSquares(row.values, row.notes) + "</div></div>";
      }).join("");
      return '<div class="iss-group"><b>' + esc(group.name) + "</b>" + rows + "</div>";
    }).join("");
    return '<div class="screen iss-screen"><div class="iss"><h2>Top 5 recorded figures</h2><div class="iss-cards">' + cards + '</div><p class="iss-readout" data-iss-readout>' + esc(spec.cards[0].detail) + "</p>" +
      '<section class="iss-panel"><div class="iss-panel-h"><div><h3>' + esc(spec.heading) + '</h3><div class="k">Last updated: ' + esc(spec.updated) + '</div></div>' +
      '<div class="iss-switch"><button type="button" class="is-on" data-iss-tab="heat">Issue heatmap</button><button type="button" data-iss-tab="trend">Issue trend</button>' +
      '<label class="iss-lock"><input type="checkbox" data-iss-lock> Scroll lock</label></div></div>' +
      '<div class="iss-heat" data-iss-heat><p class="iss-note">' + esc(spec.note) + '</p><div class="iss-cols"><span></span><div>' + heads + "</div></div>" + groups + "</div>" +
      '<div class="iss-trend" data-iss-trend hidden><h3>' + esc(spec.trendTitle) + "</h3>" + issueTrend(spec.trend) + "</div></section></div></div>";
  }

  var ENT_TYPES = [
    { id: "tower", name: "Tower", color: "#9f1239" },
    { id: "span", name: "Span", color: "#d97706" },
    { id: "part", name: "Component", color: "#0f766e" },
    { id: "finding", name: "Finding", color: "#7c3aed" },
    { id: "line", name: "Line", color: "#1f6feb" },
    { id: "crew", name: "Crew", color: "#178a4c" },
    { id: "permit", name: "Permit", color: "#d14343" },
    { id: "report", name: "Report", color: "#334155" }
  ];

  function entityCard(node, typeName, color) {
    var props = (node.props || []).map(function (pair) {
      return '<div class="ent-prop"><span>' + esc(pair[0]) + "</span><b>" + esc(pair[1]) + "</b></div>";
    }).join("");
    return '<div class="ent-id"><i style="background:' + color + '"></i><div><b>' + esc(node.name) + '</b><div class="k">' + esc(typeName) + "</div></div></div>" +
      '<p class="ent-sum">' + esc(node.summary) + '</p><div class="ent-k">EVIDENCE</div><span class="ent-badge ' + esc(node.tone || "b") + '">' + esc(node.status) + "</span>" +
      '<div class="ent-k">PROPERTIES</div>' + props +
      '<div class="ent-k">SOURCES (1)</div><div class="ent-source"><b>' + esc(node.sourceTitle) + "</b><p>" + esc(node.source) + "</p></div>" +
      '<div class="ent-k">METADATA</div><div class="ent-meta"><span>Recorded</span><b>' + esc(node.recorded) + '</b></div><div class="ent-meta"><span>Updated</span><b>' + esc(node.updated) + "</b></div>";
  }

  function entityBoard(spec) {
    var types = {};
    spec.types.forEach(function (type) { types[type.id] = type; });
    var byId = {};
    spec.nodes.forEach(function (node) { byId[node.id] = node; });
    var focus = byId[spec.focus];
    var list = spec.types.map(function (type) {
      return '<button type="button" data-ent-type="' + esc(type.id) + '" data-label="' + esc(type.name) + '" data-color="' + esc(type.color) + '"><i style="background:' + type.color + '"></i>' + esc(type.name) + "</button>";
    }).join("");
    var lines = "";
    var tags = "";
    spec.edges.forEach(function (edge) {
      var a = byId[edge[0]];
      var b = byId[edge[1]];
      if (!a || !b) return;
      lines += '<line class="ent-edge" data-a="' + esc(a.id) + '" data-b="' + esc(b.id) + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      tags += '<span class="ent-tag" data-a="' + esc(a.id) + '" data-b="' + esc(b.id) + '" style="left:' + ((a.x + b.x) / 2) + "%;top:" + ((a.y + b.y) / 2) + '%">' + esc(edge[2]) + "</span>";
    });
    var nodes = spec.nodes.map(function (node) {
      var type = types[node.type];
      var props = (node.props || []).map(function (pair) { return pair[0] + "=" + pair[1]; }).join("|");
      return '<button type="button" class="ent-node' + (node.id === spec.focus ? " is-on" : "") + '" data-id="' + esc(node.id) + '" data-type="' + esc(node.type) + '" data-name="' + esc(node.name) + '" data-summary="' + esc(node.summary) + '" data-status="' + esc(node.status) + '" data-tone="' + esc(node.tone || "b") + '" data-source-title="' + esc(node.sourceTitle) + '" data-source="' + esc(node.source) + '" data-recorded="' + esc(node.recorded) + '" data-updated="' + esc(node.updated) + '" data-props="' + esc(props) + '" style="left:' + node.x + "%;top:" + node.y + '%"><span class="ent-bubble" style="background:' + type.color + '">' + esc(node.short) + '</span><span class="ent-name">' + esc(node.name) + "</span></button>";
    }).join("");
    return '<div class="screen ent-screen"><div class="ent" data-focus="' + esc(spec.focus) + '" data-zoom="100"><aside class="ent-side"><div class="ent-side-h">ENTITIES</div><input class="ent-filter" data-ent-q placeholder="Filter">' + list + '</aside>' +
      '<div class="ent-main"><div class="ent-top"><button type="button" class="is-on" data-ent-view="all">Entities</button><button type="button" data-ent-view="linked">Linked</button>' +
      '<span class="ent-zoom"><button type="button" data-ent-z="-10">−</button><b data-ent-pct>100%</b><button type="button" data-ent-z="10">+</button></span><button type="button" class="ent-export" data-ent-export>Export</button></div>' +
      '<div class="ent-canvas"><div class="ent-stage"><svg class="ent-lines" viewBox="0 0 100 100" preserveAspectRatio="none">' + lines + "</svg>" + tags + nodes + "</div></div></div>" +
      '<aside class="ent-prov"><div class="ent-side-h">PROVENANCE</div><div data-ent-detail>' + entityCard(focus, types[focus.type].name, types[focus.type].color) + '</div><p class="ent-note" data-ent-note></p></aside></div></div>';
  }

  function recGroups(assets, states) {
    return [
      { title: "Asset hierarchy", fields: [
        { label: "Corridor", options: ["All", "Corridor North", "Coastal", "Inland"] },
        { label: "Asset", options: ["All"].concat(assets) },
        { label: "State", options: ["All"].concat(states) }
      ] },
      { title: "Condition" },
      { title: "Work" },
      { title: "Crew" },
      { title: "Zone" },
      { title: "Permit" },
      { title: "Source" }
    ];
  }

  function recommendBoard(spec) {
    var groups = spec.groups.map(function (group) {
      var fields = (group.fields || []).map(function (field) {
        var options = field.options.map(function (option) { return "<option>" + esc(option) + "</option>"; }).join("");
        return "<label>" + esc(field.label) + '<select data-rec-filter data-group="' + esc(group.title) + '">' + options + "</select></label>";
      }).join("");
      return '<div class="rec-group"><div class="rec-group-h"><b>' + esc(group.title) + '</b><button type="button" data-rec-reset="' + esc(group.title) + '">Clear</button></div>' + fields + "</div>";
    }).join("");
    return '<div class="screen rec-screen"><div class="rec"><aside class="rec-side"><div class="rec-side-h"><b>Filter</b><button type="button" data-rec-reset="all">Clear</button></div>' +
      groups + '<div class="rec-actions"><button type="button" class="rec-go" data-rec-apply>Filter</button><button type="button" data-rec-reset="all">Clear</button></div></aside>' +
      '<div class="rec-main"><div class="rec-top"><div class="card rec-open"><div class="k">OPEN RECOMMENDATIONS</div><b data-rec-count>' + spec.rows.length + "</b>" +
      '<div class="rec-key"><i style="background:#3d9a78"></i>Open</div><div class="rec-key"><i style="background:#e07a3d"></i>Held</div></div>' +
      '<div class="card rec-chart"><h3>' + esc(spec.costTitle) + '</h3>' + divergeChart(spec.cost, spec.costMax) + "</div>" +
      '<div class="card rec-chart"><h3>' + esc(spec.levelTitle) + '</h3>' + levelChart(spec.levelLabels, spec.levelValues, spec.levelTip) + "</div></div>" +
      '<div class="card rec-table"><div class="rec-bar"><b>Recommendations</b><input data-rec-q placeholder="Search" class="rec-search">' +
      '<span data-rec-all>All ' + spec.rows.length + ' items are shown</span><button type="button" data-rec-clear-checks>Clear selection</button>' +
      '<button type="button" class="rec-go" data-rec-accept>Accept</button><button type="button" data-rec-reject>Reject</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th><input type="checkbox" data-rec-allbox></th><th>Asset</th><th>Location</th><th>Recommendation</th><th>Impact</th><th>Level</th><th>Evidence</th><th>Since</th></tr></thead><tbody>' +
      spec.rows.map(recRow).join("") + "</tbody></table></div></div></div></div></div>";
  }

  function relationPanel(asset) {
    var rows = asset.links.map(function (link) {
      return '<div class="bb-acc is-open"><button type="button" class="bb-acc-h">' + bbIcon("link") +
        "<span>" + esc(link.name) + '</span><span class="bb-acc-meta"><b>LINKED</b><strong>' + esc(link.short) + "</strong><small>" + esc(link.name) + "</small></span></button>" +
        '<div class="bb-acc-body">' + esc(link.tip) + "</div></div>";
    }).join("");
    var count = asset.links.length;
    return '<div class="bb-kicker">Selected asset</div><div class="bb-names"><div>' + esc(asset.name) + "</div></div>" +
      '<p class="bb-focus-copy">' + esc(asset.tip) + "</p>" +
      '<div class="bb-kicker">Connections</div><div class="bb-count">' + bbIcon("link") + count + " Connection" + (count === 1 ? "" : "s") + " Identified</div>" +
      (rows || '<p class="bb-focus-copy">No other asset is linked.</p>');
  }

  function blackboard(spec) {
    var byId = {};
    spec.nodes.forEach(function (node) { byId[node.id] = node; });
    if (spec.extra) byId[spec.extra.id] = spec.extra;
    var focus = {};
    spec.focus.forEach(function (id) { focus[id] = true; });
    var lines = "";
    var dots = "";
    spec.edges.forEach(function (edge) {
      var a = byId[edge[0]];
      var b = byId[edge[1]];
      if (!a || !b) return;
      var live = focus[a.id] && focus[b.id] ? " is-live" : "";
      var hiddenEdge = spec.extra && (a.id === spec.extra.id || b.id === spec.extra.id) ? " is-hidden" : "";
      lines += '<line class="bb-edge' + live + hiddenEdge + '" data-a="' + esc(a.id) + '" data-b="' + esc(b.id) + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
      if (edge[2]) {
        dots += '<i class="bb-dot' + live + hiddenEdge + '" data-a="' + esc(a.id) + '" data-b="' + esc(b.id) + '" style="left:' + ((a.x + b.x) / 2) + "%;top:" + ((a.y + b.y) / 2) + '%"></i>';
      }
    });
    function face(node, hidden) {
      return '<button type="button" class="bb-node' + (focus[node.id] ? " is-on" : "") + (hidden ? " is-hidden" : "") + '" data-id="' + esc(node.id) + '" data-name="' + esc(node.name) + '"' + (focus[node.id] ? " data-focus" : "") + (hidden ? " data-extra" : "") + ' style="left:' + node.x + "%;top:" + node.y + '%"' + tip(node.tip) + '><span class="bb-face" style="background:' + node.color + '">' + esc(node.short) + '</span><span class="bb-label">' + esc(node.name) + "</span></button>";
    }
    var nodes = spec.nodes.map(function (node) { return face(node, false); }).join("");
    if (spec.extra) nodes += face(spec.extra, true);
    var options = spec.nodes.concat(spec.extra ? [spec.extra] : []).map(function (node) {
      return '<option value="' + esc(node.id) + '">' + esc(node.name) + "</option>";
    }).join("");
    var primary = byId[spec.focus[0]];
    var linked = [];
    spec.edges.forEach(function (edge) {
      var other = edge[0] === primary.id ? edge[1] : edge[1] === primary.id ? edge[0] : "";
      if (!other || (spec.extra && other === spec.extra.id) || !byId[other]) return;
      linked.push({ name: byId[other].name, short: byId[other].short, tip: byId[other].tip });
    });
    return '<div class="screen bb-screen"><div class="bb" data-primary="' + esc(primary.id) + '"><div class="bb-bar"><h2>Blackboard</h2>' +
      '<select class="bb-search" data-bb-search><option value="">Search assets</option>' + options + "</select>" +
      '<button type="button" data-bb="paths">' + bbIcon("path") + "Find Paths</button>" +
      '<button type="button" data-bb="links">' + bbIcon("link") + "Find Connections</button>" +
      '<button type="button" data-bb="review">' + bbIcon("plus") + "Add to review</button>" +
      '<button type="button" data-bb="clear-sel">' + bbIcon("x") + "Clear Selected</button>" +
      '<button type="button" data-bb="undo">' + bbIcon("undo") + "Undo</button>" +
      '<button type="button" data-bb="redo">' + bbIcon("redo") + "Redo</button>" +
      '<button type="button" data-bb="add">' + bbIcon("user") + 'Add asset</button><span class="bb-spacer"></span>' +
      '<button type="button" class="bb-text" data-bb="clear">Clear Graph</button>' +
      '<button type="button" class="bb-text" data-bb="reset">Reset Graph</button></div>' +
      '<div class="bb-body"><div class="bb-canvas"><svg class="bb-lines" viewBox="0 0 100 100" preserveAspectRatio="none">' + lines + "</svg>" + dots + nodes +
      '</div><aside class="bb-rel"><div class="bb-rel-h"><b>Relationship</b><button type="button" data-bb="close" aria-label="Close">×</button></div>' +
      '<div class="bb-note" data-bb-note></div><div data-bb-results>' +
      relationPanel({ name: primary.name, tip: primary.tip, links: linked }) +
      "</div></aside></div></div></div>";
  }

  function formula(spec) {
    var cards = spec.factors.map(function (factor) {
      return '<div class="card"' + tip(factor.tip) + '><div class="k">' + esc(factor.label) + "</div><b>" + esc(factor.value) + '</b><div class="sub">' + esc(factor.note) + "</div></div>";
    }).join("");
    return '<div class="screen"><div class="eq">' + cards + "</div>" +
      '<div class="card formula" style="padding:12px 14px"><div class="k">' + esc(spec.chart.title) + '</div><div class="chart-box">' + barChart(spec.chart.labels, spec.chart.series) + "</div>" + legend(spec.chart.series) + "</div>" +
      '<div class="card table-card">' + table(spec.columns, spec.rows) + "</div></div>";
  }

  function lanes(spec) {
    var cols = spec.columns.map(function (column) {
      var cards = column.cards.map(function (card) {
        return '<div class="ticket"' + tip(card.tip) + "><b>" + esc(card.title) + '</b><span class="k">' + esc(card.meta) + "</span></div>";
      }).join("");
      return '<div class="card lane-col"><h3>' + esc(column.title) + "</h3>" + cards + "</div>";
    }).join("");
    return '<div class="screen">' + kpis(spec.kpis) + '<div class="lanes">' + cols + "</div></div>";
  }

  function phone(spec) {
    var checks = spec.checks.map(function (item) {
      return '<div class="check"' + tip(item.tip) + "><span>" + esc(item.label) + "</span><b>" + esc(item.state) + "</b></div>";
    }).join("");
    return '<div class="screen"><div class="phone-wrap"><div class="card"><div class="phone"><div class="bar">Field · Corridor North</div><h2>' + esc(spec.task) + "</h2>" +
      '<div class="shot"' + tip(spec.beforeTip) + ">Before · image on file</div>" +
      '<div class="shot"' + tip(spec.afterTip) + ">After · waiting closure</div>" + checks +
      '</div></div><div><div class="card chart-card">' + chartBody(spec.chart) + '</div><div class="card table-card" style="margin-top:12px">' + table(spec.columns, spec.rows) + "</div></div></div></div>";
  }

  var zone = "Corridor North";
  var kv = "220 kV Corridor North";

  var srcSeq = 0;

  function lilacSpark(values, id) {
    var series = values && values.length > 1 ? values : [values && values.length ? values[0] : 0, values && values.length ? values[0] : 0];
    var max = Math.max.apply(null, series);
    var min = Math.min.apply(null, series);
    var span = max - min || 1;
    var w = 180;
    var h = 48;
    var flat = max === min;
    var pts = series.map(function (value, index) {
      var x = (index / (series.length - 1)) * w;
      var y = flat ? h * 0.42 : 6 + (1 - (value - min) / span) * (h - 14);
      return [x, y];
    });
    var line = pts.map(function (point, index) {
      return (index ? "L" : "M") + point[0].toFixed(1) + " " + point[1].toFixed(1);
    }).join(" ");
    return '<svg class="src-spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddd6fe"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><path d="' + line + " L " + w + " " + h + " L 0 " + h + ' Z" fill="url(#' + id + ')"/><path d="' + line + '" fill="none" stroke="#7c3aed" stroke-width="1.6"/></svg>';
  }

  function sourceLegend(spec) {
    var items = (spec.bars || []).slice();
    if (spec.line) items.push(spec.line);
    return items.map(function (series) {
      return '<span><i style="background:' + series.color + '"></i>' + esc(series.name) + "</span>";
    }).join("");
  }

  function sourceChart(spec) {
    var w = 980;
    var h = 300;
    var left = 46;
    var right = 52;
    var top = 16;
    var bottom = 34;
    var labels = spec.labels;
    var bars = spec.bars || [];
    var line = spec.line;
    var leftMax = spec.leftMax || 1;
    var rightMax = spec.rightMax || leftMax;
    var plotW = w - left - right;
    var plotH = h - top - bottom;
    var slot = plotW / labels.length;
    function yFor(value, max) {
      return top + (1 - Math.max(0, Number(value) || 0) / max) * plotH;
    }
    var grid = [0, 0.5, 1].map(function (step) {
      var y = top + (1 - step) * plotH;
      var lv = leftMax * step;
      var rv = rightMax * step;
      var lt = lv >= 10 ? String(Math.round(lv)) : String(Math.round(lv * 10) / 10);
      var rt = rv >= 10 ? String(Math.round(rv)) : String(Math.round(rv * 10) / 10);
      return '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (w - right) + '" y2="' + y.toFixed(1) + '" stroke="#eef2f6"/><text x="4" y="' + (y + 4).toFixed(1) + '" font-size="11" fill="#98a2b3">' + lt + '</text><text x="' + (w - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#98a2b3">' + rt + "</text>";
    }).join("");
    var groups = labels.map(function (label, index) {
      var drawable = bars.filter(function (series) {
        return series.values[index] != null && Number(series.values[index]);
      });
      var barW = Math.min(18, (slot - 20) / Math.max(1, drawable.length));
      var total = drawable.length * barW + Math.max(0, drawable.length - 1) * 4;
      var origin = left + index * slot + (slot - total) / 2;
      var drawn = 0;
      var rects = bars.map(function (series) {
        var value = series.values[index];
        if (value == null || !Number(value)) return "";
        var max = series.axis === "right" ? rightMax : leftMax;
        var y = yFor(value, max);
        var x = origin + drawn * (barW + 4);
        drawn += 1;
        return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(0, top + plotH - y).toFixed(1) + '" rx="3" fill="' + series.color + '"><title>' + esc(series.name + " · " + value) + "</title></rect>";
      }).join("");
      var text = '<text x="' + (left + index * slot + slot / 2).toFixed(1) + '" y="' + (h - 12) + '" text-anchor="middle" font-size="11" fill="#667085">' + esc(label) + "</text>";
      return '<g data-src-col="' + esc(label) + '">' + rects + text + "</g>";
    }).join("");
    var path = "";
    if (line && line.values) {
      var pts = [];
      line.values.forEach(function (value, index) {
        if (value == null) return;
        pts.push([left + index * slot + slot / 2, yFor(value, line.axis === "left" ? leftMax : rightMax), index]);
      });
      var d = "";
      var dots = "";
      pts.forEach(function (point, index) {
        var prev = pts[index - 1];
        d += (prev && point[2] === prev[2] + 1 ? "L" : "M") + point[0].toFixed(1) + " " + point[1].toFixed(1);
        dots += '<circle data-src-col="' + esc(labels[point[2]]) + '" cx="' + point[0].toFixed(1) + '" cy="' + point[1].toFixed(1) + '" r="4.5" fill="#fff" stroke="' + line.color + '" stroke-width="2"><title>' + esc(line.name + " · " + line.values[point[2]]) + "</title></circle>";
      });
      path = '<path d="' + d + '" fill="none" stroke="' + line.color + '" stroke-width="2"' + (line.dash ? ' stroke-dasharray="5 4"' : "") + "/>" + dots;
    }
    return '<div class="src-chart"><svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(spec.chartTitle) + '">' + grid + groups + path + "</svg></div>";
  }

  function sourceBoard(spec) {
    var gid = "sg" + (++srcSeq);
    var cards = spec.cards.map(function (card, index) {
      return '<article class="src-card"' + tip(card.tip) + '><div class="k">' + esc(card.k) + "</div><strong>" + esc(card.v) + "</strong><em>" + esc(card.s) + "</em>" + lilacSpark(card.spark, gid + "s" + index) + "</article>";
    }).join("");
    var side = spec.side.rows.map(function (row) {
      return "<div><span>" + esc(row.k) + "</span><b>" + esc(row.v) + "</b></div>";
    }).join("");
    var options = ["All"].concat(spec.labels).map(function (label) {
      return "<option>" + esc(label) + "</option>";
    }).join("");
    return '<div class="screen src-screen"><div class="src"><div class="src-kpis">' + cards +
      '<aside class="src-side"><h3>' + esc(spec.side.title) + "</h3>" + side + "<p>" + esc(spec.side.foot) + "</p></aside></div>" +
      '<section class="src-panel"><div class="src-tool"><label>Sort by<select data-src-sort>' + options + '</select></label><button type="button" class="src-apply" data-src-apply>Apply</button><button type="button" class="src-reset" data-src-reset>Reset</button><span class="src-note" data-src-note></span></div><h3>' + esc(spec.chartTitle) + "</h3>" +
      sourceChart(spec) + '<div class="src-band">' + esc(spec.band) + '</div><div class="src-legend">' + sourceLegend(spec) + '</div><div class="src-foot"><span>Sort by <b data-src-shown>All</b></span><span>' + esc(spec.splitLabel || "Recorded split") + " <b>" + esc(spec.split) + "</b></span></div></section></div></div>";
  }

  function prodLegend(series) {
    return '<div class="prd-legend">' + (series || []).map(function (item) {
      return '<span><i style="background:' + item.color + '"></i>' + esc(item.name) + "</span>";
    }).join("") + "</div>";
  }

  function prodGrid(max, w, h, left, right, top, bottom) {
    var plotH = h - top - bottom;
    return [0, 0.5, 1].map(function (step) {
      var y = top + (1 - step) * plotH;
      var label = max * step;
      var text = label >= 10 ? String(Math.round(label)) : String(Math.round(label * 10) / 10);
      return '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (w - right) + '" y2="' + y.toFixed(1) + '" stroke="#eef2f6"/><text x="2" y="' + (y + 4).toFixed(1) + '" font-size="10" fill="#98a2b3">' + text + "</text>";
    }).join("");
  }

  function prodBars(spec) {
    var w = 560;
    var h = 200;
    var left = 32;
    var right = 8;
    var top = 12;
    var bottom = 28;
    var max = spec.max || 1;
    spec.values.forEach(function (value) { max = Math.max(max, Number(value) || 0); });
    var slot = (w - left - right) / spec.labels.length;
    var barW = Math.min(26, slot * 0.55);
    var plotH = h - top - bottom;
    var bars = spec.labels.map(function (label, index) {
      var value = Number(spec.values[index]) || 0;
      var bh = value / max * plotH;
      var x = left + index * slot + (slot - barW) / 2;
      return '<g data-prd-label="' + esc(label) + '"><rect x="' + x.toFixed(1) + '" y="' + (top + plotH - bh).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" rx="3" fill="#3b6fd8"><title>' + esc(label + " · " + value) + '</title></rect><text x="' + (x + barW / 2).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="#667085">' + esc(label) + "</text></g>";
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(spec.title) + '">' + prodGrid(max, w, h, left, right, top, bottom) + bars + "</svg>";
  }

  function prodLines(spec) {
    var w = 560;
    var h = 180;
    var left = 32;
    var right = 10;
    var top = 12;
    var bottom = 26;
    var max = spec.max || 1;
    spec.series.forEach(function (series) {
      series.values.forEach(function (value) { if (value != null) max = Math.max(max, Number(value) || 0); });
    });
    var plotH = h - top - bottom;
    var slot = (w - left - right) / Math.max(1, spec.labels.length - 1);
    function xOf(index) { return left + (spec.labels.length === 1 ? (w - left - right) / 2 : index * slot); }
    function yOf(value) { return top + (1 - (Number(value) || 0) / max) * plotH; }
    var paths = spec.series.map(function (series) {
      var d = "";
      var dots = "";
      series.values.forEach(function (value, index) {
        if (value == null) return;
        var x = xOf(index);
        var y = yOf(value);
        var prev = index > 0 && series.values[index - 1] != null;
        d += (prev && d ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
        dots += '<circle data-prd-label="' + esc(spec.labels[index]) + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5" fill="#fff" stroke="' + series.color + '" stroke-width="2"><title>' + esc(series.name + " · " + value) + "</title></circle>";
      });
      return '<path d="' + d + '" fill="none" stroke="' + series.color + '" stroke-width="2"/>' + dots;
    }).join("");
    var axis = spec.labels.map(function (label, index) {
      return '<text x="' + xOf(index).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="#667085">' + esc(label) + "</text>";
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(spec.title) + '">' + prodGrid(max, w, h, left, right, top, bottom) + paths + axis + "</svg>";
  }

  function prodStack(spec) {
    var w = 560;
    var h = 180;
    var left = 32;
    var right = 8;
    var top = 12;
    var bottom = 26;
    var max = spec.max || 1;
    spec.labels.forEach(function (_, index) {
      var sum = 0;
      spec.series.forEach(function (series) { sum += Number(series.values[index]) || 0; });
      max = Math.max(max, sum);
    });
    var slot = (w - left - right) / spec.labels.length;
    var barW = Math.min(28, slot * 0.5);
    var plotH = h - top - bottom;
    var cols = spec.labels.map(function (label, index) {
      var cursor = 0;
      var x = left + index * slot + (slot - barW) / 2;
      var rects = spec.series.map(function (series) {
        var value = Number(series.values[index]) || 0;
        if (!value) return "";
        var bh = value / max * plotH;
        var y = top + plotH - (cursor / max * plotH) - bh;
        cursor += value;
        return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + series.color + '"><title>' + esc(series.name + " · " + value) + "</title></rect>";
      }).join("");
      return '<g data-prd-label="' + esc(label) + '">' + rects + '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="#667085">' + esc(label) + "</text></g>";
    }).join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(spec.title) + '">' + prodGrid(max, w, h, left, right, top, bottom) + cols + "</svg>";
  }

  function prodRank(spec) {
    var max = 1;
    spec.rows.forEach(function (row) { max = Math.max(max, Number(row.value) || 0); });
    var rows = spec.rows.slice().sort(function (a, b) { return Number(b.value) - Number(a.value); });
    return '<div class="prd-rank" data-prd-rank>' + rows.map(function (row) {
      var width = (Number(row.value) || 0) / max * 100;
      return '<div class="prd-rank-row" data-prd-row data-value="' + esc(String(row.value)) + '" data-prd-label="' + esc(row.name) + '"><span>' + esc(row.name) + '</span><div class="prd-track"><i style="width:' + width.toFixed(1) + '%"></i></div><b>' + esc(String(row.value)) + "</b></div>";
    }).join("") + "</div>";
  }

  function prodBoard(spec) {
    var fields = [
      ["Corridor", ["All", "Corridor North", "Coastal", "Inland"]],
      ["Asset", ["All", "T-104", "T-103", "T-101", "T-110", "Span N-18", "Span N-19"]],
      ["Window", ["All", "This visit", "Next quarter", "Inspections 1–6"]]
    ].map(function (field) {
      return "<label>" + esc(field[0]) + "<select data-prd-filter>" + field[1].map(function (option) { return "<option>" + esc(option) + "</option>"; }).join("") + "</select></label>";
    }).join("");
    var kpis = spec.kpis.map(function (item) {
      return '<article class="prd-kpi"' + tip(item.tip) + '><div class="k">' + esc(item.k) + "</div><strong>" + esc(item.v) + "</strong></article>";
    }).join("");
    return '<div class="screen prd-screen"><div class="prd"><header class="prd-head"><h2>' + esc(spec.title) + "</h2><p>" + esc(spec.lede) + '</p><div class="prd-filters">' + fields + '</div><p class="prd-note" data-prd-note></p></header><div class="prd-kpis">' + kpis + '</div><div class="prd-grid"><section class="prd-card"><h3>' + esc(spec.bars.title) + '</h3><div class="sub">' + esc(spec.bars.unit) + "</div>" + prodBars(spec.bars) + '</section><section class="prd-card"><h3>' + esc(spec.lines.title) + '</h3><div class="sub">' + esc(spec.lines.unit) + "</div>" + prodLines(spec.lines) + prodLegend(spec.lines.series) + '</section><section class="prd-card"><h3>' + esc(spec.stack.title) + '</h3><div class="sub">' + esc(spec.stack.unit) + "</div>" + prodStack(spec.stack) + prodLegend(spec.stack.series) + '</section><section class="prd-card"><div class="prd-card-h"><div><h3>' + esc(spec.rank.title) + '</h3><div class="sub">' + esc(spec.rank.unit) + '</div></div><div class="prd-toggle"><button type="button" data-prd-sort="bottom">Bottom</button><button type="button" class="is-on" data-prd-sort="top">Top</button></div></div>' + prodRank(spec.rank) + "</section></div></div></div>";
  }

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
      screen("registry", "Asset Registry", "registry", [
        tab("Production", function () {
          return prodBoard({
            title: "Condition",
            lede: "Recorded condition on Corridor North. This is not a production total.",
            kpis: [
              { k: "Towers in view", v: "48", tip: "Registry cut for SS-North to the east angle." },
              { k: "Open findings", v: "12", tip: "Two are verified structural findings. One is visual." },
              { k: "T-104 index", v: "61", tip: "Down from 78. Lower is worse." },
              { k: "Linked evidence", v: "98%", tip: "Image, GPS, and tower id. Not a model score." }
            ],
            bars: { title: "Condition index by tower", unit: "Index. Higher is better.", labels: ["T-101", "T-103", "T-104", "T-110"], values: [88, 74, 61, 91], max: 100 },
            lines: { title: "Index across inspections", unit: "Inspections 1–6. Not a weekly production series.", max: 100, labels: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"], series: [
              { name: "T-104", color: "#3b6fd8", values: [78, 76, 74, 71, 66, 61] },
              { name: "T-101", color: "#3d9a78", values: [86, 87, 88, 88, 87, 88] }
            ] },
            stack: { title: "Open findings", unit: "Counts. The damper is not one of the two structural findings.", labels: ["Steel", "Cotter", "Damper"], series: [
              { name: "Verified", color: "#3d9a78", values: [1, 1, 0] },
              { name: "Visual", color: "#e07a3a", values: [0, 0, 1] }
            ] },
            rank: { title: "Towers by index", unit: "Lower index is worse.", rows: [
              { name: "T-110", value: 91 }, { name: "T-101", value: 88 }, { name: "T-103", value: 74 }, { name: "T-104", value: 61 }
            ] }
          });
        }),
        tab("Sourcing", function () {
          return sourceBoard({
            cards: [
              { k: "Condition index", v: "61", s: "From 78. Lower is worse.", spark: [78, 76, 74, 71, 66, 61], tip: "T-104 index across six inspections." },
              { k: "Priority", v: "0.69", s: "0.86 × 0.91 × 0.88", spark: [0.4, 0.44, 0.5, 0.55, 0.62, 0.69], tip: "18 days past the 0.60 line." },
              { k: "Verified findings", v: "2", s: "Both on T-104", spark: [2, 2, 2, 2], tip: "Leg B steel and a cotter pin." },
              { k: "Days past 0.60", v: "18", s: "Review is open", spark: [18, 18], tip: "The tower is already past the review line." },
              { k: "Linked evidence", v: "98%", s: "Not a model score", spark: [90, 92, 94, 95, 97, 98], tip: "Image, GPS, and tower id. Not accuracy." }
            ],
            side: { title: "Engineering review", rows: [{ k: "Steel", v: "Verified" }, { k: "Cotter", v: "Verified" }, { k: "Damper", v: "Visual" }], foot: "The damper is not one of the two structural findings." },
            chartTitle: "T-104 condition index",
            labels: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"],
            bars: [
              { name: "Condition index", color: "#6b5bd2", values: [78, 76, 74, 71, 66, 61] },
              { name: "Drop from 78", color: "#3d9a78", axis: "right", values: [0, 2, 4, 7, 12, 17] }
            ],
            line: { name: "Inspection 1", color: "#14b8a6", dash: true, axis: "left", values: [78, 78, 78, 78, 78, 78] },
            leftMax: 100, rightMax: 20,
            band: "Inspections 1–6",
            split: "Index 61. Two verified structural findings."
          });
        }),
        tab("Overview", function () {
          return optBoard({
            recent: "Most recent inspection",
            map: "condition",
            placeTitle: "Absheron peninsula, north of Baku",
            cards: [
              { k: "Condition index", v: "61", delta: "−17 from 78", tone: "down", spark: [78, 76, 74, 71, 66, 61], caption: "Inspections 1–6", tip: "T-104 index. Lower is worse." },
              { k: "Priority", v: "0.69", delta: "Past 0.60", tone: "down", spark: [0.4, 0.44, 0.5, 0.55, 0.62, 0.69], caption: "Review score", tip: "0.86 × 0.91 × 0.88. 18 days past the line." },
              { k: "Verified findings", v: "2", delta: "Both on T-104", tone: "flat", spark: [2, 2, 2, 2, 2, 2], caption: "Inspection 6", tip: "Leg B steel and a cotter pin." },
              { k: "Linked evidence", v: "98%", delta: "Not a model score", tone: "flat", spark: [90, 92, 94, 95, 97, 98], caption: "Image, GPS, tower id", tip: "Not a model-accuracy score." }
            ],
            facts: [
              { k: "Current status", v: "Open", dot: true },
              { k: "Recorded", v: "Inspection 6" },
              { k: "Latest input", v: "Inspection 6" },
              { k: "Priority", v: "0.69" },
              { k: "Index", v: "61" },
              { k: "Next step", v: "Engineering review" }
            ],
            rows: [
              { name: "T-104 index", unit: "Index", recorded: "78", current: "61", change: "Decrease 17", tone: "down", note: "The index moved from 78 to 61. Lower is worse." },
              { name: "Priority", unit: "Score", recorded: "0.60 line", current: "0.69", change: "Above the line", tone: "up", note: "Priority is 0.69. T-104 is 18 days past the 0.60 line." },
              { name: "Steel", unit: "Finding", recorded: "Verified", current: "In approval", change: "WO-104-A", tone: "flat", note: "Leg B steel is one of the two verified structural findings. The 6 hour task is in approval." },
              { name: "Cotter", unit: "Finding", recorded: "Verified", current: "In approval", change: "WO-104-B", tone: "flat", note: "The cotter pin is the second verified structural finding. The 2 hour task is in approval." },
              { name: "Damper", unit: "Visual", recorded: "0.93", current: "Location open", change: "Not structural", tone: "down", note: "Span N-18 damper is visual, from 4 frames. It is not one of the two structural findings." }
            ],
            slides: [
              "Tower T-104 has two verified structural findings and requires engineering review.",
              "The index moved from 78 to 61. Lower is worse. Priority is 0.69, and the tower is 18 days past 0.60.",
              "The span N-18 damper is visual, score 0.93, from 4 frames. The location is not confirmed.",
              "Linked evidence of 98% means an image, GPS, and tower id. It is not a model-accuracy score."
            ],
            chartTitle: "T-104 condition index",
            chart: { max: 100, labels: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"], series: [
              { name: "Condition index", color: "#2563eb", values: [78, 76, 74, 71, 66, 61] },
              { name: "Inspection 1", color: "#d14343", dash: true, values: [78, 78, 78, 78, 78, 78] }
            ] }
          });
        }),
        tab("Matrix", function () {
          return matrixBoard({
            title: "Evidence Collection Matrix",
            date: "Inspection 6",
            operation: "Corridor North · 220 kV",
            heading: "Evidence hierarchy",
            chip: "T-104",
            conflict: { k: "Schedule conflicts", v: "1 conflict", tip: "The damper location is open, so it is not scheduled with the two structural findings." },
            metrics: [
              { k: "Open findings", v: "12", tip: "Registry cut. Two are verified structural findings and one is visual." },
              { k: "Verified", v: "2", tip: "Leg B steel and a cotter pin, both on T-104." },
              { k: "Visual", v: "1", tip: "Span N-18 damper. Not one of the two structural findings." },
              { k: "Past 0.60", v: "1", tip: "T-104 is 18 days past the review line." },
              { k: "Location open", v: "1", tip: "Damper location is not confirmed." },
              { k: "Linked", v: "98%", tip: "Image, GPS, and tower id. Not a model-accuracy score." }
            ],
            score: { value: 98, label: "Linked evidence", tip: "Share of findings with an image, GPS, and tower id. Not a model-accuracy score." },
            focus: "t104",
            nodes: [
              { id: "line", kind: "rollup", name: "220 kV", mark: "98%", status: "agency", x: 50, y: 16, tag: "T-104", description: "98% of findings in this cut have an image, GPS, and tower id. That is not a model-accuracy score.", source: "Inspection 6", basic: [["Corridor", "North"], ["Voltage", "220 kV"], ["Linked", "98%"]] },
              { id: "t104", kind: "parent", name: "T-104", status: "parent", x: 50, y: 48, tag: "T-104", description: "Tower T-104 has two verified structural findings and requires engineering review.", source: "Index 61. Priority 0.69. 18 days past 0.60.", basic: [["Index", "61"], ["Priority", "0.69"], ["Findings", "2 verified"]] },
              { id: "steel", kind: "leaf", name: "Findings", mark: "Verified", status: "collected", x: 28, y: 80, tag: "T-104", description: "The two verified findings are leg B steel and a cotter pin.", source: "WO-104-A is 6 hours. WO-104-B is 2 hours. Both are in approval.", basic: [["Steel", "Leg B"], ["Cotter", "Pin"], ["State", "Collected"]] },
              { id: "damper", kind: "leaf", name: "Damper", mark: "Open", status: "risk", x: 72, y: 80, tag: "Span N-18", description: "Span N-18 damper is a visual finding. The location is not confirmed.", source: "4 frames. Score 0.93. Not one of the two structural findings.", basic: [["Score", "0.93"], ["Frames", "4"], ["Location", "Open"]] }
            ],
            edges: [["line", "t104"], ["t104", "steel"], ["t104", "damper"]]
          });
        }),
        tab("Forecast", function () {
          return planBoard({
            next: "T-104 is already 18 days past the 0.60 review line.",
            start: "Inspection 1",
            end: "Inspection 6",
            chart: {
              title: "T-104 condition index",
              max: 100,
              labels: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"],
              stacks: [{ name: "Condition index", color: "#6b5bd2", values: [78, 76, 74, 71, 66, 61] }],
              lines: [{ name: "Inspection 1", color: "#1f6feb", dash: true, values: [78, 78, 78, 78, 78, 78] }]
            },
            quiet: ["Corridor=Corridor North", "Voltage=220 kV", "Asset=T-104", "State=Review", "Source=Inspection 6", "Window=This visit"],
            views: [
              {
                when: "", badge: "Index 61", hero: { v: "61", k: "Condition index" }, leftTitle: "Recorded condition", rightTitle: "Other towers",
                left: [{ k: "Condition index", v: "61", note: "from 78" }, { k: "Verified findings", v: "2", note: "On T-104" }, { k: "Linked evidence", v: "98%", note: "Not accuracy" }],
                right: [{ k: "T-101 index", v: "88" }, { k: "T-103 index", v: "74" }, { k: "T-110 index", v: "91" }],
                bandTitle: "Engineering review", bandNote: "Recorded on inspection 6. Not a forecast confidence score.",
                band: [{ k: "Priority", v: "0.69", pill: "0.86 × 0.91 × 0.88" }, { k: "Days past 0.60", v: "18", pill: "Past the line", tone: "down" }, { k: "Damper score", v: "0.93", pill: "Visual" }],
                summary: "Tower T-104 has two verified structural findings and requires engineering review.",
                more: "The two findings are leg B steel and a cotter pin. The span N-18 damper is visual, from 4 frames, score 0.93, and its location is not confirmed. It is not one of the two structural findings. 98% means the finding has an image, GPS, and a tower id.",
                ring: 98, ringLabel: "Linked evidence", ringTip: "Image, GPS, and tower id. Not a model-accuracy score."
              },
              {
                when: "Asset=T-110", badge: "Outside the package", leftTitle: "T-110", rightTitle: "Neighbors",
                left: [{ k: "Condition index", v: "91" }, { k: "Open package", v: "No" }, { k: "State", v: "Stable" }],
                right: [{ k: "T-104 index", v: "61" }, { k: "T-103 index", v: "74" }, { k: "T-101 index", v: "88" }],
                bandTitle: "T-110", bandNote: "Stable. Not part of the open repair package.",
                band: [{ k: "Index", v: "91", pill: "Stable" }, { k: "Verified findings", v: "0", pill: "In this package" }, { k: "Linked evidence", v: "98%", pill: "Not accuracy" }],
                summary: "T-110 index is 91. It is stable and outside the open package.",
                more: "T-110 is a neighbor on Corridor North. It does not add a task to the Wednesday visit.",
                ring: 91, ringLabel: "Index", ringTip: "T-110 condition index. Higher is better. Not a confidence score."
              },
              {
                when: "Asset=T-103", badge: "Foundation watch", leftTitle: "T-103", rightTitle: "Neighbors",
                left: [{ k: "Condition index", v: "74" }, { k: "State", v: "Watch" }, { k: "Verified defect", v: "No" }],
                right: [{ k: "T-104 index", v: "61" }, { k: "T-110 index", v: "91" }, { k: "T-101 index", v: "88" }],
                bandTitle: "T-103", bandNote: "A watch inside the visit. Not a verified defect.",
                band: [{ k: "Index", v: "74", pill: "Watch" }, { k: "Check", v: "2h", pill: "In the visit" }, { k: "Verified findings", v: "0", pill: "Not a defect" }],
                summary: "T-103 index is 74. The foundation is a watch, not a verified defect.",
                more: "The visit includes a 2 hour foundation check. That check is not one of T-104's two verified structural findings.",
                ring: 74, ringLabel: "Index", ringTip: "T-103 condition index. Higher is better. Not a confidence score."
              },
              {
                when: "Asset=Span N-18", badge: "Visual only", leftTitle: "Span N-18 damper", rightTitle: "What is still open",
                left: [{ k: "Visual score", v: "0.93" }, { k: "Frames", v: "4" }, { k: "Verified structural", v: "No" }],
                right: [{ k: "Location", v: "Open" }, { k: "Part", v: "VD-220" }, { k: "Task", v: "Held" }],
                bandTitle: "Damper", bandNote: "A visual finding. Not one of the two structural findings.",
                band: [{ k: "Score", v: "0.93", pill: "4 frames" }, { k: "Structural findings", v: "0", pill: "Not T-104's two" }, { k: "Location", v: "Open", pill: "Unconfirmed", tone: "down" }],
                summary: "The span N-18 damper is a visual finding. The location is not confirmed.",
                more: "Score 0.93 comes from 4 frames. It is not one of T-104's two verified structural findings, and the task stays on hold.",
                ring: 93, ringLabel: "Visual", ringTip: "Visual score 0.93. Not a model-accuracy score and not a confirmed location."
              },
              {
                when: "Work=Damper", badge: "Visual only", leftTitle: "Span N-18 damper", rightTitle: "What is still open",
                left: [{ k: "Visual score", v: "0.93" }, { k: "Frames", v: "4" }, { k: "Verified structural", v: "No" }],
                right: [{ k: "Location", v: "Open" }, { k: "Part", v: "VD-220" }, { k: "Task", v: "Held" }],
                bandTitle: "Damper", bandNote: "A visual finding. Not one of the two structural findings.",
                band: [{ k: "Score", v: "0.93", pill: "4 frames" }, { k: "Structural findings", v: "0", pill: "Not T-104's two" }, { k: "Location", v: "Open", pill: "Unconfirmed", tone: "down" }],
                summary: "The span N-18 damper is a visual finding. The location is not confirmed.",
                more: "Score 0.93 comes from 4 frames. It is not one of T-104's two verified structural findings, and the task stays on hold.",
                ring: 93, ringLabel: "Visual", ringTip: "Visual score 0.93. Not a model-accuracy score and not a confirmed location."
              },
              {
                when: "Asset=Span N-19", badge: "Released", leftTitle: "Span N-19", rightTitle: "Crew",
                left: [{ k: "Work", v: "ROW" }, { k: "Hours", v: "4" }, { k: "Crew", v: "VEG-02" }],
                right: [{ k: "State", v: "Released" }, { k: "Tower work", v: "No" }, { k: "Field start", v: "0" }],
                bandTitle: "Vegetation", bandNote: "Released. Not a condition index.",
                band: [{ k: "Hours", v: "4", pill: "WO-19-V" }, { k: "Crew", v: "VEG-02", pill: "Assigned" }, { k: "Field start", v: "0", pill: "Not started", tone: "down" }],
                summary: "Span N-19 is vegetation. It is released to VEG-02 and is not a tower repair.",
                more: "VEG-02 must not take the T-104 steel or cotter work. The cut has not started in the field.",
                ring: 100, ringLabel: "Released", ringTip: "Released to VEG-02. Not started in the field."
              }
            ]
          });
        }),
        tab("Issues", function () {
          return issueBoard({
            heading: "Corridor issue review",
            updated: "Inspection 6",
            note: "Squares repeat the reading for that inspection. A dot means there is no separate history. Darker means further from a full index, unless the tip names another measure.",
            cols: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"],
            cards: [
              { name: "Linked evidence", score: "98", lines: [["Image", "Yes"], ["GPS", "Yes"], ["Tower id", "Yes"]], detail: "98% of findings in this cut have an image, GPS, and tower id. That is not a model-accuracy score." },
              { name: "Damper visual", score: "93", lines: [["Frames", "4"], ["Verified structural", "No"], ["Location", "Open"]], detail: "Span N-18 damper score is 0.93. It is a visual finding and not one of the two verified structural findings." },
              { name: "T-110 index", score: "91", lines: [["State", "Stable"], ["Open package", "No"], ["Neighbor", "Yes"]], detail: "T-110 index is 91. It is stable and outside the open package." },
              { name: "T-103 index", score: "74", lines: [["State", "Watch"], ["Verified defect", "No"], ["In the visit", "Check"]], detail: "T-103 index is 74. The foundation is a watch, not a verified defect." },
              { name: "T-104 priority", score: "69", lines: [["Severity", "0.86"], ["Criticality", "0.91"], ["Consequence", "0.88"]], detail: "T-104 priority is 0.69 from 0.86 × 0.91 × 0.88. Two verified structural findings need engineering review." }
            ],
            groups: [
              { name: "Structure", rows: [
                { name: "T-104 steel", values: [48, 53, 57, 64, 75, 86], notes: ["Index 78", "Index 76", "Index 74", "Index 71", "Index 66", "Index 61. Darker means further from 100."] },
                { name: "T-104 cotter", values: [null, null, null, null, null, 86], notes: ["No separate index", "No separate index", "No separate index", "No separate index", "No separate index", "Same package as the steel. Index 61."] },
                { name: "T-103 foundation", values: [null, null, null, null, null, 57], notes: ["No separate history", "No separate history", "No separate history", "No separate history", "No separate history", "Index 74. Watch, not a verified defect."] }
              ] },
              { name: "Span", rows: [
                { name: "N-18 damper", values: [null, null, null, null, null, 93], notes: ["No separate history", "No separate history", "No separate history", "No separate history", "No separate history", "Visual score 0.93. Location still open."] },
                { name: "N-19 ROW", values: [null, null, null, null, null, 40], notes: ["No separate history", "No separate history", "No separate history", "No separate history", "No separate history", "Released to VEG-02. Not a condition index."] }
              ] }
            ],
            trendTitle: "T-104 condition index. Lower is worse.",
            trend: { labels: ["1", "2", "3", "4", "5", "6"], values: [78, 76, 74, 71, 66, 61], max: 100 }
          });
        }),
        tab("Entities", function () {
          return entityBoard({
            focus: "t104",
            types: ENT_TYPES,
            nodes: [
              { id: "line", type: "line", name: "220 kV", short: "220", x: 50, y: 20, summary: "Corridor North line out of SS-North.", status: "IN SERVICE", tone: "b", props: [["Loading", "78% of rating"], ["Voltage", "219.4 kV"], ["Source", "Historian / EMS"]], sourceTitle: "Operating record", source: "Loading and voltage are not calculated from inspection images.", recorded: "Now", updated: "In band" },
              { id: "find", type: "finding", name: "Two findings", short: "2", x: 68, y: 26, summary: "Leg B steel and a cotter pin. Both verified.", status: "VERIFIED", tone: "r", props: [["Count", "2"], ["Tower", "T-104"], ["Review", "Required"]], sourceTitle: "Inspection 6", source: "Structural findings, separate from the visual damper.", recorded: "Inspection 6", updated: "Open" },
              { id: "t104", type: "tower", name: "T-104", short: "T104", x: 42, y: 48, summary: "Two verified structural findings. Needs engineering review.", status: "LINKED", tone: "g", props: [["Parent", "220 kV line"], ["Index", "61"], ["Priority", "0.69"], ["Evidence", "98% linked"]], sourceTitle: "Inspection 6", source: "Image, GPS, and tower id are linked. This is not a model score.", recorded: "Inspection 6", updated: "Review open" },
              { id: "n19", type: "span", name: "Span N-19", short: "N19", x: 24, y: 70, summary: "ROW vegetation. Released to VEG-02.", status: "RELEASED", tone: "g", props: [["Task", "WO-19-V"], ["Hours", "4"], ["Crew", "VEG-02"]], sourceTitle: "Visit plan", source: "Shares the corridor access. Not high-voltage work.", recorded: "Open", updated: "Released" },
              { id: "ss", type: "line", name: "SS-North", short: "SS", x: 48, y: 74, summary: "Source bus for Corridor North.", status: "IN BAND", tone: "b", props: [["Voltage", "219.4 kV"], ["Region", "North"]], sourceTitle: "EMS", source: "Bus voltage measured at SS-North.", recorded: "Now", updated: "In band" },
              { id: "n18", type: "span", name: "Span N-18", short: "N18", x: 74, y: 66, summary: "Damper is a visual finding. Location is not confirmed.", status: "HELD", tone: "a", props: [["Part", "VD-220"], ["Frames", "4"], ["Score", "0.93 visual"]], sourceTitle: "Inspection 6", source: "Not one of the two verified structural findings.", recorded: "Inspection 6", updated: "Location open" }
            ],
            edges: [["line", "t104", "feeds"], ["t104", "find", "verified"], ["t104", "n18", "carries"], ["t104", "ss", "from"], ["t104", "n19", "corridor"], ["n18", "ss", "same line"]]
          });
        }),
        tab("Recommendations", function () {
          return recommendBoard({
            costTitle: "Potential visit cost",
            costMax: 40,
            cost: [
              { label: "Visit $28.8k", value: 28.8, color: "#e07a3d", tip: "Cost if all five tasks run. Not a saving." },
              { label: "Held $6.1k", value: -6.1, color: "#3d9a78", tip: "Damper share stays held until the location is confirmed." }
            ],
            levelTitle: "T-104 condition index",
            levelLabels: ["1", "2", "3", "4", "5", "6"],
            levelValues: [78, 76, 74, 71, 66, 61],
            levelTip: "Lower is worse. The latest index is 61.",
            groups: recGroups(["T-104", "N-18", "N-19", "T-103", "T-110"], ["Review", "Hold", "Check", "Released", "Stable"]),
            rows: [
              { item: "T-104", meta: "Leg B steel", place: "Corridor North", placeMeta: "220 kV", text: "Engineering review before release. Two verified structural findings.", impact: "Priority 0.69", level: "Index 61", check: "98% linked", date: "Insp 6", keys: "Corridor North T-104 Review" },
              { item: "T-104", meta: "Cotter pin", place: "Corridor North", placeMeta: "Same package", text: "Travel with the steel. Approval is still open.", impact: "WO-104-B", level: "2 hours", check: "Verified", date: "Insp 6", keys: "Corridor North T-104 Review" },
              { item: "N-18", meta: "Damper", place: "Corridor North", placeMeta: "Span", text: "Hold the visual finding until the location is confirmed.", impact: "$6.1k held", level: "Score 0.93", check: "4 frames", date: "Insp 6", keys: "Corridor North N-18 Hold" },
              { item: "T-103", meta: "Foundation", place: "Corridor North", placeMeta: "Watch", text: "Include a check. This is not a verified defect.", impact: "Check", level: "Index 74", check: "Watch", date: "Insp 6", keys: "Corridor North T-103 Check" },
              { item: "N-19", meta: "ROW", place: "Corridor North", placeMeta: "Vegetation", text: "Released to VEG-02. Shares access, not the tower work.", impact: "WO-19-V", level: "4 hours", check: "Released", date: "Insp 6", keys: "Corridor North N-19 Released" },
              { item: "T-110", meta: "Neighbor", place: "Corridor North", placeMeta: "Stable", text: "No open package. Index 91.", impact: "None", level: "Index 91", check: "Stable", date: "Insp 6", keys: "Corridor North T-110 Stable" }
            ]
          });
        }),
        tab("Blackboard", function () {
          return blackboard({
            focus: ["t104", "n18"],
            nodes: [
              { id: "t103", name: "T-103", short: "T103", x: 14, y: 26, color: TEAL, tip: "Foundation watch. Not a verified defect." },
              { id: "ss", name: "SS-North", short: "SS", x: 30, y: 34, color: BLUE, tip: "Source bus. EMS voltage 219.4 kV." },
              { id: "t104", name: "T-104", short: "T104", x: 22, y: 54, color: "#9f1239", tip: "Two verified structural findings. Needs engineering review." },
              { id: "t105", name: "T-105", short: "T105", x: 16, y: 76, color: "#334155", tip: "Neighbor on the Span N-18 side." },
              { id: "find", name: "Findings", short: "2", x: 38, y: 74, color: PURPLE, tip: "Leg B steel and a cotter pin." },
              { id: "n18", name: "Span N-18", short: "N18", x: 68, y: 28, color: AMBER, tip: "Damper is visual. The location is not confirmed." },
              { id: "vd", name: "Damper", short: "VD", x: 82, y: 46, color: TEAL, tip: "VD-220. Not one of the two structural findings." },
              { id: "n19", name: "Span N-19", short: "N19", x: 64, y: 62, color: GREEN, tip: "ROW vegetation, released to VEG-02." }
            ],
            extra: { id: "t110", name: "T-110", short: "T110", x: 50, y: 14, color: "#64748b", tip: "Index 91. Stable, and outside this package." },
            edges: [["t103", "ss", true], ["ss", "t104", true], ["t104", "t105"], ["t105", "find", true], ["t104", "n18", true], ["n18", "vd", true], ["n18", "n19"], ["t110", "ss"]],
            types: [
              { icon: "link", title: "Same corridor", kicker: "LINK", value: "220 kV", sub: "Corridor North", body: "T-104 and Span N-18 are on the same line out of SS-North." },
              { icon: "tower", title: "Verified structure", kicker: "COUNT", value: "2", sub: "Engineering review", body: "Leg B steel and the cotter pin are the verified structural findings." },
              { icon: "file", title: "Component", kicker: "PART", value: "VD-220", sub: "Location open", body: "The damper is a visual finding. It is not one of those two." },
              { icon: "user", title: "Evidence", kicker: "LINKED", value: "98%", sub: "Image, GPS, id", body: "Linked evidence means an image, a GPS point, and a tower id." }
            ]
          });
        }),
        tab("Schedule", function () {
          return scheduleBoard({
            day: "Wednesday · planned visit",
            lanes: [
              { name: "T-104 steel", bars: [
                { left: 33.3, width: 20, fill: "#d9f2c8", ink: "#3f8f62", id: "0003", label: "Leg B plate", flag: true, tip: "WO-104-A · 6 hours · approval still open. Verified structural finding." },
                { left: 58.3, width: 10, fill: "#ddd4f7", ink: "#6d5bd0", id: "0004", label: "Cotter pin", tip: "WO-104-B · 2 hours · same tower package." }
              ] },
              { name: "Span N-18", bars: [
                { left: 41.7, width: 14, fill: "#f8e0b0", ink: "#e09a3e", id: "0018", label: "Damper hold", flag: true, tip: "WO-18-D · visual finding. Location is not confirmed, so it is not released." }
              ] },
              { name: "Span N-19", bars: [
                { left: 33.3, width: 16.7, fill: "#d9f2c8", ink: "#3f8f62", id: "0019", label: "ROW cut", tip: "WO-19-V · 4 hours · released to VEG-02." }
              ] },
              { name: "Tower T-103", bars: [
                { left: 62.5, width: 10, fill: "#c9efef", ink: "#3aabb0", id: "0103", label: "Foundation", tip: "2 hour check. Not a verified defect." }
              ] },
              { name: "Engineering", bars: [
                { left: 25, width: 12, fill: "#f8d0e3", ink: "#d56b9a", id: "0006", label: "Insp 6", tip: "Inspection 6 is already on file." },
                { left: 50, width: 14, fill: "#ddd4f7", ink: "#6d5bd0", id: "0007", label: "Two findings", flag: true, tip: "T-104 needs engineering review. Priority 0.69." }
              ] },
              { name: "Evidence desk", bars: [
                { left: 37.5, width: 12, fill: "#e7f0c8", ink: "#6aaa4a", id: "0098", label: "Linked 98%", tip: "Image, GPS, and tower id. Not a model-accuracy score." }
              ] },
              { name: "Tower T-105", bars: [
                { left: 66.7, width: 12, fill: "#f6d7bf", ink: "#d9893a", id: "0105", label: "Span side", tip: "Neighbor on the N-18 side. No new verified finding." }
              ] }
            ]
          });
        }),
        tab("Graph", function () {
          return mesh({
            listTitle: "Network",
            focusTitle: "T-104",
            focus: "Tower T-104 has two verified structural findings and requires engineering review.",
            list: [
              { title: "220 kV line", meta: "Corridor North", tip: "Line above SS-North", body: "Operating region North · substation SS-North." },
              { title: "T-104", meta: "Tower", tip: "Two verified structural findings", body: "Leg B steel and fitting cotter pin." },
              { title: "Span N-18", meta: "Span", tip: "Damper still needs a location confirm", body: "Four frames grouped as one physical observation." },
              { title: "Damper", meta: "Component", tip: "Visual finding · score 0.93", body: "Not one of the two verified structural findings." }
            ],
            nodes: [
              { x: 140, y: 250, color: BLUE, short: "LINE", title: "220 kV", tip: "Corridor North · SS-North", body: "Parent line for every tower in this cut." },
              { x: 320, y: 140, color: "#9f1239", short: "T104", title: "T-104", tip: "Priority 0.69 · engineering review", body: "Two verified structural findings." },
              { x: 520, y: 180, color: AMBER, short: "N18", title: "Span N-18", tip: "Damper · confirm asset location", body: "Potential displaced vibration damper." },
              { x: 360, y: 360, color: TEAL, short: "VD", title: "Damper", tip: "Component on span N-18", body: "Catalog item VD-220 once the location is confirmed." },
              { x: 590, y: 360, color: PURPLE, short: "2", title: "Findings", tip: "Steel and cotter pin, both verified", body: "Engineering review before the repair visit." }
            ],
            edges: [[0, 1, "tower"], [1, 2, "span"], [2, 3, "part"], [1, 4, "verified"]],
            columns: ["Asset", "Parent", "Finding", "State"],
            rows: [
              row(["T-104", "220 kV line", "Steel + cotter", tag("Review", "r")], "Bound to span N-18 and the damper component", kv),
              row(["N-18", "T-104 – T-105", "Damper offset", tag("Confirm", "a")], "Visual finding. RGB frames do not by themselves prove an electrical fault.", kv),
              row(["T-103", "220 kV line", "Foundation watch", tag("Watch", "a")], "Watch only. Not counted as a verified defect.", kv),
              row(["T-101", "220 kV line", "None", tag("Stable", "g")], "Condition index 88.", kv),
              row(["Coastal T-20", "132 kV", "None", tag("Stable", "g")], "Outside this corridor.", "Coastal")
            ]
          });
        }),
        tab("Register", function () {
          return pack({
            filters: ["Region", "Line", "Voltage"],
            kpis: k,
            chart: { type: "bar", title: "Open findings by asset family", labels: ["Steel", "Fitting", "Damper", "Foundation", "ROW"], series: [{ name: "Findings", color: BLUE, values: [2, 1, 1, 1, 1], tips: ["Both verified on T-104", "Cotter pin verified on T-104", "Visual only · span N-18", "Watch · T-103", "Vegetation · span N-19"] }] },
            side: { type: "donut", title: "Evidence class", parts: [
              { name: "Verified", value: 2, color: RED, tip: "Two structural findings on T-104" },
              { name: "Visual", value: 1, color: AMBER, tip: "Damper awaits location confirmation" },
              { name: "Watch", value: 2, color: TEAL, tip: "Foundation and right-of-way" },
              { name: "Clear", value: 7, color: "#93c5fd", tip: "Spans with no open finding" }
            ] },
            columns: ["Asset", "Type", "Linked finding", "State"],
            rows: [
              row(["T-104", "Tower", "2 structural", tag("Review", "r")], "Engineering review required", kv),
              row(["N-18", "Span", "Damper 0.93", tag("Confirm", "a")], "Grouped frames of one damper", kv),
              row(["N-19", "Span", "ROW vegetation", tag("Watch", "a")], "Clearance programs need their own inspection rules", kv),
              row(["T-110", "Tower", "None", tag("Stable", "g")], "Index 91", kv)
            ]
          });
        }),
        tab("Hierarchy", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Registry depth · this corridor", items: [
              { label: "Region North", pct: 100, value: "1", color: BLUE, tip: "Operating region" },
              { label: "SS-North", pct: 80, value: "1", color: BLUE, tip: "Feeding substation" },
              { label: "220 kV line", pct: 70, value: "1", color: TEAL, tip: "One circuit in this cut" },
              { label: "Towers", pct: 60, value: "48", color: TEAL, tip: "Corridor North towers" },
              { label: "Open spans", pct: 25, value: "3", color: AMBER, tip: "N-18, N-19, and the T-104 fittings" }
            ] },
            side: { kicker: "LINK", text: "Every finding hangs off one tower, span, or component. The damper is a component of span N-18, not a second tower.", gauge: { value: 98, label: "Linked", tip: "Image + GPS + tower id. Not model accuracy." } },
            columns: ["Level", "Record", "Child", "State"],
            rows: [
              row(["Utility", "North region", "SS-North", tag("Live", "b")], "Tenant operating region", zone),
              row(["Line", "220 kV", "48 towers", tag("Live", "b")], "Criticality 0.91", kv),
              row(["Tower", "T-104", "Span N-18", tag("Review", "r")], "Two verified findings", kv),
              row(["Component", "Damper", "4 frames", tag("Confirm", "a")], "Same physical observation grouped", kv)
            ]
          });
        })
      ]),
      screen("towers", "Tower Health", "tower", [
        tab("Scores", function () {
          return pack({
            kpis: [
              { l: "T-104 index", v: "61", s: "Lower is worse", tip: "Condition index after six cycles. Severity factor used in the score is 0.86.", spark: [78, 76, 74, 71, 66, 61], color: RED },
              { l: "T-103 index", v: "74", s: "Foundation watch", tip: "Watch, not a verified defect.", spark: [80, 79, 78, 76, 75, 74], color: AMBER },
              { l: "T-101 index", v: "88", s: "In band", tip: "No open finding.", spark: [86, 87, 88, 88, 87, 88], color: GREEN },
              { l: "Overdue review", v: "1", s: "T-104", tip: "Only T-104 is past the review threshold of 0.60.", spark: [0, 0, 0, 1, 1, 1], color: RED }
            ],
            chart: { type: "hbar", title: "Priority = severity × criticality × consequence", items: [
              { label: "T-104", pct: 69, value: "0.69", color: RED, tip: "0.86 × 0.91 × 0.88" },
              { label: "T-103", pct: 41, value: "0.41", color: AMBER, tip: "Watch. Below the 0.60 review line." },
              { label: "T-105", pct: 36, value: "0.36", color: AMBER, tip: "Adjacent to the unconfirmed damper." },
              { label: "T-101", pct: 22, value: "0.22", color: TEAL, tip: "Stable" },
              { label: "T-110", pct: 16, value: "0.16", color: TEAL, tip: "Stable" }
            ] },
            side: { kicker: "REVIEW", text: "Tower T-104 has two verified structural findings and requires engineering review.", gauge: { value: 69, label: "Priority", tip: "0.69 on a 0 to 1 scale. Review threshold is 0.60." } },
            columns: ["Tower", "Index", "Findings", "State"],
            rows: [
              row(["T-104", "61", "Steel, cotter", tag("Review", "r")], "Both findings verified by engineering", kv),
              row(["T-103", "74", "Foundation", tag("Watch", "a")], "Not verified as a defect", kv),
              row(["T-101", "88", "None", tag("Stable", "g")], "Six cycles in band", kv),
              row(["T-110", "91", "None", tag("Stable", "g")], "No open finding", kv)
            ]
          });
        }),
        tab("Heatmap", function () {
          return pack({
            kpis: k,
            chart: { type: "heat", title: "Severity by inspection cycle · higher is worse", unit: "severity", rows: ["T-104", "T-103", "T-105", "T-101", "T-110", "N-18"], cols: ["1", "2", "3", "4", "5", "6", "7", "8"], matrix: [
              [28, 30, 34, 40, 52, 70, 78, 86],
              [22, 24, 26, 30, 34, 38, 40, 44],
              [18, 18, 20, 22, 30, 36, 40, 42],
              [16, 16, 18, 18, 18, 20, 18, 18],
              [12, 14, 14, 12, 14, 16, 14, 14],
              [10, 12, 14, 20, 36, 55, 70, 74]
            ] },
            side: { type: "bars", title: "Latest cycle", items: [
              { label: "T-104", pct: 86, value: "86", color: "#0f766e", tip: "Cycle 8 severity 86 · review" },
              { label: "N-18", pct: 74, value: "74", color: "#14b8a6", tip: "Damper frames grouped from cycle 6" },
              { label: "T-101", pct: 18, value: "18", color: "#99f6e4", tip: "Still in band" }
            ] },
            columns: ["Tower", "Cycle 6 index", "Cycle 8 severity", "State"],
            rows: [
              row(["T-104", "61", "86", tag("Review", "r")], "Index fell while severity rose", kv),
              row(["N-18", "—", "74", tag("Confirm", "a")], "Component heat, not a tower index", kv)
            ]
          });
        }),
        tab("Trend", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "Condition index · lower is worse", labels: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"], series: [
              { name: "T-104", color: RED, values: [78, 76, 74, 71, 66, 61] },
              { name: "T-101", color: TEAL, values: [86, 87, 88, 88, 87, 88] }
            ] },
            side: { kicker: "HISTORY", text: "T-104 has been inspected six times. The last two cycles carry both verified structural findings.", gauge: { value: 61, label: "Index", tip: "Condition index 61. This is health, not the severity factor." } },
            columns: ["Cycle", "T-104 index", "New evidence", "State"],
            rows: [
              row(["Insp 5", "66", "Steel noted", tag("Review", "r")], "First of the two verified findings", kv),
              row(["Insp 6", "61", "Cotter verified", tag("Review", "r")], "Second verified finding", kv),
              row(["Insp 6", "88", "T-101 clear", tag("Stable", "g")], "Comparison tower", kv)
            ]
          });
        })
      ]),
      screen("lines", "Line Health", "line", [
        tab("Overview", function () {
          return pack({
            filters: ["Line", "Voltage"],
            kpis: [
              { l: "Spans in section", v: "18", s: "SS-North east", tip: "Eighteen spans on the 220 kV section.", spark: [18, 18, 18, 18, 18, 18] },
              { l: "Open on spans", v: "3", s: "Damper, ROW, watch", tip: "Span issues separate from the two tower findings.", spark: [1, 1, 1, 2, 2, 3], color: AMBER },
              { l: "Review backlog", v: "1", s: "Tower T-104", tip: "One tower is overdue for engineering review.", spark: [0, 0, 0, 1, 1, 1], color: RED },
              { l: "Loading context", v: "78%", s: "Of rating · historian", tip: "Latest historian sample. Not calculated from the image.", spark: [62, 66, 70, 74, 81, 78], color: PURPLE }
            ],
            chart: { type: "area", title: "Span condition index", labels: ["N-14", "N-15", "N-16", "N-17", "N-18", "N-19"], series: [{ name: "Index", color: BLUE, values: [90, 88, 86, 84, 70, 76] }] },
            side: { type: "donut", title: "Span state", parts: [
              { name: "Routine", value: 15, color: "#93c5fd", tip: "No open finding" },
              { name: "Confirm", value: 1, color: AMBER, tip: "N-18 damper" },
              { name: "Watch", value: 2, color: TEAL, tip: "N-19 ROW and T-103 foundation approach" }
            ] },
            columns: ["Span", "From – to", "Latest input", "State"],
            rows: [
              row(["N-17", "T-103 – T-104", "Insp 6", tag("Routine", "g")], "No verified defect", kv),
              row(["N-18", "T-104 – T-105", "4 frames", tag("Confirm", "a")], "Displaced damper · score 0.93", kv),
              row(["N-19", "T-105 – T-110", "ROW watch", tag("Watch", "a")], "Vegetation, not a steel defect", kv)
            ]
          });
        }),
        tab("Spans", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Finding pressure vs loading", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [
              { name: "Loading %", color: BLUE, values: [61, 66, 92, 74, 78, 78] },
              { name: "Open findings", color: AMBER, values: [6, 7, 8, 9, 11, 12] }
            ] },
            side: { kicker: "CONTEXT", text: "March loading reached 92% of rating on the same corridor as T-104. The image set does not calculate that loading.", items: [{ label: "March peak", pct: 92, value: "92%", color: RED, tip: "Historian · 12 Mar · 46 minutes" }] },
            columns: ["Month", "Loading", "Findings", "Note"],
            rows: [
              row(["Mar", "92%", "8", tag("Event", "a")], "Thermal window beside the high-priority tower", kv),
              row(["Jun", "78%", "12", tag("Now", "b")], "Current operating point", kv)
            ]
          });
        }),
        tab("Components", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Components with an open record", labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], series: [{ name: "Records", color: TEAL, values: [1, 1, 1, 1, 1] }] },
            side: { kicker: "CLASS", text: "An RGB frame can support a visual finding. It cannot, by itself, confirm an electrical short. Clearance may need a spatial measurement.", gauge: { value: 40, label: "Confirmed", tip: "Two of five open records are verified structural findings." } },
            columns: ["Component", "Asset", "Evidence", "State"],
            rows: [
              row(["Leg B steel", "T-104", "Verified", tag("Review", "r")], "Structural finding one", kv),
              row(["Cotter pin", "T-104", "Verified", tag("Review", "r")], "Structural finding two", kv),
              row(["Damper VD-220", "N-18", "Score 0.93", tag("Confirm", "a")], "Confirm the asset location", kv),
              row(["Foundation", "T-103", "Watch", tag("Watch", "a")], "Supplementary evidence still open", kv)
            ]
          });
        })
      ]),
      screen("map", "Risk Map", "map", [
        tab("Corridor", function () {
          return atlas({
            title: "Corridor North",
            highlight: "T-104",
            focusTitle: "T-104",
            focus: "Tower T-104 has two verified structural findings and requires engineering review.",
            towers: [
              { name: "T-104", meta: "Review · 0.69", tip: "Two verified structural findings", body: "Engineering review before the grouped visit." },
              { name: "N-18", meta: "Damper · confirm", tip: "Score 0.93 · four frames", body: "Potential displaced vibration damper. Confirm the asset location." },
              { name: "T-103", meta: "Foundation watch", tip: "Not a verified defect", body: "Stays on the visit as a check, not as a confirmed repair." },
              { name: "N-19", meta: "ROW watch", tip: "Vegetation on the span", body: "Right-of-way clearance is tracked beside the steel findings." },
              { name: "T-101", meta: "Stable · 88", tip: "In band", body: "No open finding." }
            ]
          });
        }),
        tab("Priority", function () {
          return formula({
            factors: [
              { label: "Condition severity", value: "0.86", note: "Higher is worse", tip: "Driven by two verified structural findings on T-104." },
              { label: "Criticality", value: "0.91", note: "220 kV circuit", tip: "Line criticality from the asset master." },
              { label: "Consequence", value: "0.88", note: "Corridor span", tip: "Loss of this span affects the SS-North corridor." },
              { label: "Priority", value: "0.69", note: "Review ≥ 0.60", tip: "0.86 × 0.91 × 0.88 = 0.69." }
            ],
            chart: { title: "Running product · T-104", labels: ["Severity", "× criticality", "× consequence"], series: [{ name: "Score", color: RED, values: [0.86, 0.78, 0.69], tips: ["0.86", "0.86 × 0.91 = 0.78", "0.78 × 0.88 = 0.69"] }] },
            columns: ["Asset", "Score", "Threshold", "State"],
            rows: [
              row(["T-104", "0.69", "0.60", tag("Review", "r")], "Overdue for engineering review", kv),
              row(["T-103", "0.41", "0.60", tag("Watch", "a")], "Below the review line", kv),
              row(["T-101", "0.22", "0.60", tag("Stable", "g")], "Hold the calendar", kv)
            ]
          });
        }),
        tab("Overdue", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Days past review threshold", labels: ["T-104", "T-103", "N-18", "T-101", "T-110"], series: [{ name: "Days", color: RED, values: [18, 0, 0, 0, 0], tips: ["18 days past the 0.60 line", "Below the line", "Waiting location confirm, not a priority breach", "Stable", "Stable"] }] },
            side: { kicker: "OVERDUE", text: "Only T-104 is overdue for engineering review. The damper stays in the confirm queue until the location is accepted.", gauge: { value: 18, label: "Days", tip: "18 days since T-104 crossed 0.60." } },
            columns: ["Asset", "Crossed", "Owner", "State"],
            rows: [
              row(["T-104", "18 days", "Reliability", tag("Review", "r")], "Two verified structural findings", kv),
              row(["N-18", "—", "Inspection", tag("Confirm", "a")], "Location not confirmed", kv)
            ]
          });
        })
      ]),
      screen("history", "Maintenance History", "calendar", [
        tab("Timeline", function () {
          return gantt({
            title: "Repeated inspections and the open review",
            ticks: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6", "Review", "Visit"],
            kpis: k,
            lanes: [
              { name: "T-104 index", bars: [{ left: 4, width: 70, color: RED, label: "78 → 61", tip: "Condition index declined across six inspections" }] },
              { name: "Steel finding", bars: [{ left: 58, width: 28, color: PURPLE, label: "Verified", tip: "Verified in inspection 5 and still open" }] },
              { name: "Cotter pin", bars: [{ left: 68, width: 20, color: "#db2777", label: "Verified", tip: "Second structural finding, inspection 6" }] },
              { name: "Damper", bars: [{ left: 62, width: 24, color: AMBER, label: "Visual", tip: "Grouped frames. Location not confirmed." }] }
            ],
            sideTitle: "Outcome still open",
            bars: [
              { label: "Findings closed", pct: 0, value: "0", color: TEAL, tip: "No closure evidence yet" },
              { label: "Still open", pct: 100, value: "3", color: AMBER, tip: "Two verified plus one visual" }
            ]
          });
        }),
        tab("Outcomes", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Inspection versus closure", labels: ["Insp 3", "Insp 4", "Insp 5", "Insp 6"], series: [
              { name: "Opened", color: AMBER, values: [1, 1, 2, 3] },
              { name: "Closed", color: TEAL, values: [1, 1, 0, 0] }
            ] },
            side: { kicker: "COMPARE", text: "Earlier hardware notes on this corridor were closed. The current T-104 pair has no closure record.", gauge: { value: 0, label: "Closed", tip: "Current verified findings are not closed." } },
            columns: ["Record", "Opened", "Closed", "State"],
            rows: [
              row(["T-104 steel", "Insp 5", "—", tag("Open", "r")], "Waiting engineering review", kv),
              row(["T-104 cotter", "Insp 6", "—", tag("Open", "r")], "Waiting engineering review", kv),
              row(["Prior hardware", "Insp 3", "Insp 4", tag("Closed", "g")], "Historical closure on a different fitting", kv)
            ]
          });
        }),
        tab("Compare", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "T-104 against the corridor median", labels: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"], series: [
              { name: "T-104", color: RED, values: [78, 76, 74, 71, 66, 61] },
              { name: "Median", color: TEAL, values: [86, 86, 87, 86, 87, 87] }
            ] },
            side: { type: "bars", title: "Gap to median", items: [
              { label: "Insp 6", pct: 26, value: "26", color: RED, tip: "Median 87 minus T-104 61" },
              { label: "Insp 1", pct: 8, value: "8", color: AMBER, tip: "Median 86 minus T-104 78" }
            ] },
            columns: ["Cycle", "T-104", "Median", "Gap"],
            rows: [
              row(["Insp 6", "61", "87", tag("26", "r")], "Widest gap of the six cycles", kv),
              row(["Insp 1", "78", "86", tag("8", "a")], "Already trailing, not yet in review", kv)
            ]
          });
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
    var lead = [];
    var rest = [];
    tabs.forEach(function (item) {
      if (item.name === "Production" && !lead.length) lead.push(item);
      else rest.push(item);
    });
    return { id: id, name: name, icon: ICONS[iconName], tabs: lead.concat(rest) };
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

    function render() {
      stopPidLive();
      var screenSpec = app.screens[current];
      titleEl.innerHTML = esc(app.product) + " <span>/ " + esc(screenSpec.name) + "</span>";
      tabsEl.innerHTML = screenSpec.tabs.map(function (item, index) {
        return '<button type="button" data-tab="' + index + '"' + (index === tabIndex ? ' class="is-on"' : "") + ">" + esc(item.name) + "</button>";
      }).join("");
      stage.innerHTML = screenSpec.tabs[tabIndex].render();
      var dwgCard = document.getElementById("dwg-card");
      if (dwgCard) dwgCard.hidden = true;
      paintBakuMaps(stage);
      paintDrawings(stage);
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

    var bbMemory = new WeakMap();

    function bbLinks(board, id) {
      var found = [];
      board.querySelectorAll(".bb-edge").forEach(function (edge) {
        var a = edge.getAttribute("data-a");
        var b = edge.getAttribute("data-b");
        if (a === id) found.push(b);
        if (b === id) found.push(a);
      });
      return found;
    }

    function bbMemoryFor(board) {
      var state = bbMemory.get(board);
      if (!state) {
        state = { past: [], future: [] };
        bbMemory.set(board, state);
      }
      return state;
    }

    function bbSnap(board) {
      var hidden = [];
      var on = [];
      board.querySelectorAll(".bb-node").forEach(function (node) {
        var id = node.getAttribute("data-id");
        if (node.classList.contains("is-hidden")) hidden.push(id);
        if (node.classList.contains("is-on")) on.push(id);
      });
      return {
        hidden: hidden,
        on: on,
        shut: board.querySelector(".bb-rel").classList.contains("is-shut"),
        note: board.querySelector("[data-bb-note]").textContent,
        primary: board.getAttribute("data-primary") || ""
      };
    }

    function bbRestore(board, snap) {
      board.querySelectorAll(".bb-node").forEach(function (node) {
        var id = node.getAttribute("data-id");
        node.classList.toggle("is-hidden", snap.hidden.indexOf(id) !== -1);
        node.classList.toggle("is-on", snap.on.indexOf(id) !== -1);
      });
      board.querySelector(".bb-rel").classList.toggle("is-shut", snap.shut);
      board.querySelector(".bb-body").classList.toggle("is-wide", snap.shut);
      board.querySelector("[data-bb-note]").textContent = snap.note;
      if (snap.primary) board.setAttribute("data-primary", snap.primary);
      else board.removeAttribute("data-primary");
      bbSync(board);
    }

    function bbSync(board) {
      var hidden = {};
      var on = {};
      board.querySelectorAll(".bb-node").forEach(function (node) {
        var id = node.getAttribute("data-id");
        if (node.classList.contains("is-hidden")) hidden[id] = true;
        if (node.classList.contains("is-on")) on[id] = true;
      });
      board.querySelectorAll(".bb-edge, .bb-dot").forEach(function (edge) {
        var a = edge.getAttribute("data-a");
        var b = edge.getAttribute("data-b");
        edge.classList.toggle("is-hidden", !!(hidden[a] || hidden[b]));
        edge.classList.toggle("is-live", !!(on[a] && on[b]));
      });
      var primary = board.getAttribute("data-primary");
      var node = primary ? board.querySelector('.bb-node[data-id="' + primary + '"]') : null;
      if (!node || node.classList.contains("is-hidden")) node = board.querySelector(".bb-node.is-on:not(.is-hidden)");
      var box = board.querySelector("[data-bb-results]");
      if (!box) return;
      if (!node) {
        box.innerHTML = '<div class="bb-kicker">Selected asset</div><div class="bb-names"><div>Select an asset</div></div>';
        return;
      }
      var links = bbLinks(board, node.getAttribute("data-id")).map(function (id) {
        var other = board.querySelector('.bb-node[data-id="' + id + '"]');
        if (!other || other.classList.contains("is-hidden")) return null;
        return {
          name: other.getAttribute("data-name"),
          short: other.querySelector(".bb-face").textContent,
          tip: other.getAttribute("data-tip") || ""
        };
      }).filter(Boolean);
      box.innerHTML = relationPanel({
        name: node.getAttribute("data-name"),
        tip: node.getAttribute("data-tip") || "",
        links: links
      });
    }

    function bbCommit(board, mutate) {
      var state = bbMemoryFor(board);
      state.past.push(bbSnap(board));
      if (state.past.length > 30) state.past.shift();
      state.future = [];
      mutate();
      bbSync(board);
    }

    function bbSelect(board, ids) {
      board.querySelectorAll(".bb-node").forEach(function (node) {
        node.classList.toggle("is-on", ids.indexOf(node.getAttribute("data-id")) !== -1);
      });
    }

    function bbPath(board, start, goal) {
      var prev = {};
      var queue = [start];
      var seen = {};
      seen[start] = true;
      while (queue.length) {
        var current = queue.shift();
        if (current === goal) break;
        bbLinks(board, current).forEach(function (next) {
          var node = board.querySelector('.bb-node[data-id="' + next + '"]');
          if (!node || node.classList.contains("is-hidden") || seen[next]) return;
          seen[next] = true;
          prev[next] = current;
          queue.push(next);
        });
      }
      if (start !== goal && !seen[goal]) return [start];
      var path = [goal];
      var walk = goal;
      while (walk !== start) {
        walk = prev[walk];
        if (!walk) return [start];
        path.push(walk);
      }
      return path;
    }

    function entLinked(board, a, b) {
    var hit = false;
    board.querySelectorAll(".ent-edge").forEach(function (edge) {
      var x = edge.getAttribute("data-a");
      var y = edge.getAttribute("data-b");
      if ((x === a && y === b) || (x === b && y === a)) hit = true;
    });
    return hit;
  }

  function paintEnt(board) {
    var id = board.getAttribute("data-focus");
    var view = board.getAttribute("data-view") || "all";
    var type = board.getAttribute("data-type") || "";
    var field = board.querySelector("[data-ent-q]");
    var q = field ? field.value.toLowerCase() : "";
    board.querySelectorAll(".ent-node").forEach(function (node) {
      var nid = node.getAttribute("data-id");
      var matchType = !type || node.getAttribute("data-type") === type;
      var matchQ = !q || (node.getAttribute("data-name") || "").toLowerCase().indexOf(q) !== -1;
      var matchView = view !== "linked" || nid === id || entLinked(board, id, nid);
      node.classList.toggle("is-dim", !(matchType && matchQ && matchView));
      node.classList.toggle("is-on", nid === id);
    });
    board.querySelectorAll(".ent-edge, .ent-tag").forEach(function (edge) {
      var a = edge.getAttribute("data-a");
      var b = edge.getAttribute("data-b");
      edge.classList.toggle("is-live", a === id || b === id);
      var nodeA = board.querySelector('.ent-node[data-id="' + a + '"]');
      var nodeB = board.querySelector('.ent-node[data-id="' + b + '"]');
      edge.classList.toggle("is-dim", !!((nodeA && nodeA.classList.contains("is-dim")) || (nodeB && nodeB.classList.contains("is-dim"))));
    });
    board.querySelectorAll("[data-ent-type]").forEach(function (btn) {
      btn.classList.toggle("is-on", !!type && btn.getAttribute("data-ent-type") === type);
      btn.hidden = !!(q && (btn.getAttribute("data-label") || "").toLowerCase().indexOf(q) === -1);
    });
    board.querySelectorAll("[data-ent-view]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-ent-view") === (view || "all"));
    });
  }

  function showEnt(board, id) {
    var node = board.querySelector('.ent-node[data-id="' + id + '"]');
    if (!node) return;
    board.setAttribute("data-focus", id);
    var typeBtn = board.querySelector('[data-ent-type="' + node.getAttribute("data-type") + '"]');
    var props = (node.getAttribute("data-props") || "").split("|").filter(Boolean).map(function (pair) {
      var bits = pair.split("=");
      return [bits[0], bits.slice(1).join("=")];
    });
    board.querySelector("[data-ent-detail]").innerHTML = entityCard({
      name: node.getAttribute("data-name"),
      summary: node.getAttribute("data-summary"),
      status: node.getAttribute("data-status"),
      tone: node.getAttribute("data-tone"),
      sourceTitle: node.getAttribute("data-source-title"),
      source: node.getAttribute("data-source"),
      recorded: node.getAttribute("data-recorded"),
      updated: node.getAttribute("data-updated"),
      props: props
    }, typeBtn ? typeBtn.getAttribute("data-label") : "", typeBtn ? typeBtn.getAttribute("data-color") : "#1f6feb");
    paintEnt(board);
  }

  function applyRec(board) {
      var tokens = [];
      board.querySelectorAll("[data-rec-filter]").forEach(function (select) {
        if (select.value && select.value !== "All") tokens.push(select.value);
      });
      var field = board.querySelector("[data-rec-q]");
      var query = field ? field.value.toLowerCase() : "";
      var shown = 0;
      board.querySelectorAll("tbody tr[data-rec]").forEach(function (row) {
        var keys = row.getAttribute("data-keys") || "";
        var text = (row.getAttribute("data-text") || "").toLowerCase();
        var ok = tokens.every(function (token) { return keys.indexOf(token) !== -1; }) && (!query || text.indexOf(query) !== -1);
        row.hidden = !ok;
        if (!ok) row.classList.remove("is-checked");
        if (ok) shown += 1;
      });
      var count = board.querySelector("[data-rec-count]");
      if (count) count.textContent = String(shown);
      var note = board.querySelector("[data-rec-all]");
      if (note) note.textContent = shown ? "All " + shown + " items are shown" : "Nothing in this cut";
    }

    function markRec(board, state) {
      board.querySelectorAll("tbody tr[data-rec]").forEach(function (row) {
        var box = row.querySelector("[data-rec-box]");
        if (row.hidden || !box || !box.checked) return;
        row.setAttribute("data-state", state);
        row.querySelector("[data-rec-state]").textContent = state === "accepted" ? "Accepted" : "Rejected";
      });
    }

    function showMatrix(mx, node) {
      mx.querySelectorAll("[data-mx-node]").forEach(function (item) {
        item.classList.toggle("is-on", item === node);
      });
      var basic = (node.getAttribute("data-basic") || "").split("|").filter(Boolean).map(function (pair) {
        var bits = pair.split("=");
        return [bits[0], bits.slice(1).join("=")];
      });
      mx.querySelector("[data-mx-detail]").innerHTML = matrixPanel(node.getAttribute("data-name"), basic, node.getAttribute("data-desc"), node.getAttribute("data-source"));
    }

    stage.addEventListener("click", function (event) {
      var sortBtn = event.target.closest("[data-prd-sort]");
      if (sortBtn) {
        var prd = sortBtn.closest(".prd");
        var rank = prd.querySelector("[data-prd-rank]");
        var desc = sortBtn.getAttribute("data-prd-sort") === "top";
        var items = [].slice.call(rank.querySelectorAll("[data-prd-row]"));
        items.sort(function (a, b) {
          var diff = Number(a.getAttribute("data-value")) - Number(b.getAttribute("data-value"));
          return desc ? -diff : diff;
        });
        items.forEach(function (item) { rank.appendChild(item); });
        prd.querySelectorAll("[data-prd-sort]").forEach(function (item) { item.classList.toggle("is-on", item === sortBtn); });
        return;
      }
      var src = event.target.closest(".src");
      if (src && (event.target.closest("[data-src-apply]") || event.target.closest("[data-src-reset]"))) {
        var reset = event.target.closest("[data-src-reset]");
        var select = src.querySelector("[data-src-sort]");
        if (reset && select) select.value = "All";
        var value = select ? select.value : "All";
        src.querySelectorAll("[data-src-col]").forEach(function (node) {
          node.classList.toggle("is-dim", value !== "All" && node.getAttribute("data-src-col") !== value);
        });
        var shown = src.querySelector("[data-src-shown]");
        if (shown) shown.textContent = value;
        var note = src.querySelector("[data-src-note]");
        if (note) note.textContent = value === "All" ? "" : "Showing " + value + ". Nothing is ordered.";
        return;
      }
      var opt = event.target.closest(".opt");
      if (opt) {
        var picked = event.target.closest("tr[data-opt-row]");
        if (picked) {
          opt.querySelectorAll("tr[data-opt-row]").forEach(function (row) { row.classList.toggle("is-on", row === picked); });
          opt.querySelector("[data-opt-note]").textContent = picked.getAttribute("data-opt-note");
          return;
        }
        if (event.target.closest("[data-opt-detail]")) {
          var current = opt.querySelector("tr.is-on") || opt.querySelector("tr[data-opt-row]");
          if (current) opt.querySelector("[data-opt-note]").textContent = current.getAttribute("data-opt-note");
          return;
        }
        if (event.target.closest("[data-opt-stage]")) {
          opt.querySelector("[data-opt-note]").textContent = "Nothing is released to the field.";
          return;
        }
      }
      var mx = event.target.closest(".mx");
      if (mx) {
        var node = event.target.closest("[data-mx-node]");
        if (node) {
          showMatrix(mx, node);
          return;
        }
        var viewBtn = event.target.closest("[data-mx-view]");
        if (viewBtn) {
          var which = viewBtn.getAttribute("data-mx-view");
          mx.querySelectorAll("[data-mx-view]").forEach(function (btn) { btn.classList.toggle("is-on", btn === viewBtn); });
          mx.querySelector("[data-mx-tree]").hidden = which !== "tree";
          mx.querySelector("[data-mx-table]").hidden = which !== "table";
          return;
        }
        if (event.target.closest("[data-mx-clear]") || event.target.closest("[data-mx-chip]")) {
          var filter = mx.querySelector("[data-mx-filter]");
          if (filter) filter.hidden = true;
          mx.setAttribute("data-filter", "");
          mx.querySelectorAll(".mx-node").forEach(function (item) { item.classList.remove("is-dim"); });
          mx.querySelectorAll("tr[data-mx-node]").forEach(function (row) { row.hidden = false; });
          mx.querySelector("[data-mx-note]").textContent = "";
          return;
        }
        var command = event.target.closest("[data-mx]");
        if (command) {
          var action = command.getAttribute("data-mx");
          var note = mx.querySelector("[data-mx-note]");
          if (action === "modify") note.textContent = "Nothing is released to the field.";
          if (action === "export" || action === "save") note.textContent = "Stays in this browser. Nothing is sent out.";
          return;
        }
      }
      var pln = event.target.closest(".pln");
      if (pln && event.target.closest("[data-pln-apply]")) {
        var selected = [];
        pln.querySelectorAll("[data-pln-filter]").forEach(function (select) {
          if (select.value && select.value !== "All") selected.push(select.getAttribute("data-pln-filter") + "=" + select.value);
        });
        var key = selected.slice().sort().join("|");
        var quiet = (pln.getAttribute("data-pln-quiet") || "").split("|").filter(Boolean);
        var views = pln.querySelectorAll("[data-pln-view]");
        var match = null;
        views.forEach(function (view) {
          var when = (view.getAttribute("data-when") || "").split("|").filter(Boolean).sort().join("|");
          if (when === key) match = view;
        });
        var quietHit = !match && key && selected.every(function (token) { return quiet.indexOf(token) !== -1; });
        if (quietHit) match = views[0];
        views.forEach(function (view) { view.classList.toggle("is-on", view === (match || views[0])); });
        var note = pln.querySelector("[data-pln-note]");
        if (note) note.textContent = match || !key ? "" : "No separate plan for this cut. Showing the recorded corridor plan.";
        return;
      }
      if (pln && event.target.closest("[data-pln-stage]")) {
        var stageNote = pln.querySelector("[data-pln-note]");
        if (stageNote) stageNote.textContent = "Stays in this browser. Nothing is released.";
        return;
      }
      if (pln && event.target.closest("[data-pln-edit]")) {
        var editNote = pln.querySelector("[data-pln-note]");
        if (editNote) editNote.textContent = "The recorded figures stay as they are. Nothing is rewritten.";
        return;
      }
      if (pln && event.target.closest("[data-pln-explain]")) {
        var summary = event.target.closest(".pln-summary");
        var more = summary.querySelector("[data-pln-more]");
        var explain = summary.querySelector("[data-pln-explain]");
        if (more) more.hidden = !more.hidden;
        if (explain) explain.textContent = more && !more.hidden ? "Hide the detail" : "Explain this in depth";
        return;
      }
      var iss = event.target.closest(".iss");
      if (iss) {
        var detailBtn = event.target.closest("[data-iss-detail]");
        if (detailBtn) {
          iss.querySelector("[data-iss-readout]").textContent = detailBtn.getAttribute("data-iss-detail");
          iss.querySelectorAll(".iss-card").forEach(function (card) {
            card.classList.toggle("is-on", card.contains(detailBtn));
          });
          return;
        }
        var tabBtn = event.target.closest("[data-iss-tab]");
        if (tabBtn) {
          var which = tabBtn.getAttribute("data-iss-tab");
          iss.querySelectorAll("[data-iss-tab]").forEach(function (btn) {
            btn.classList.toggle("is-on", btn === tabBtn);
          });
          iss.querySelector("[data-iss-heat]").hidden = which !== "heat";
          iss.querySelector("[data-iss-trend]").hidden = which !== "trend";
          return;
        }
      }
      var ent = event.target.closest(".ent");
      if (ent) {
        var picked = event.target.closest(".ent-node");
        if (picked) {
          ent.setAttribute("data-type", "");
          showEnt(ent, picked.getAttribute("data-id"));
          return;
        }
        var typeBtn = event.target.closest("[data-ent-type]");
        if (typeBtn) {
          var nextType = typeBtn.getAttribute("data-ent-type");
          var currentType = ent.getAttribute("data-type") || "";
          ent.setAttribute("data-type", currentType === nextType ? "" : nextType);
          if (currentType !== nextType) {
            var first = ent.querySelector('.ent-node[data-type="' + nextType + '"]:not(.is-dim)');
            if (!first) first = ent.querySelector('.ent-node[data-type="' + nextType + '"]');
            if (first) showEnt(ent, first.getAttribute("data-id"));
            else paintEnt(ent);
          } else paintEnt(ent);
          return;
        }
        var viewBtn = event.target.closest("[data-ent-view]");
        if (viewBtn) {
          ent.setAttribute("data-view", viewBtn.getAttribute("data-ent-view"));
          paintEnt(ent);
          return;
        }
        var zoomBtn = event.target.closest("[data-ent-z]");
        if (zoomBtn) {
          var scale = Math.max(70, Math.min(140, Number(ent.getAttribute("data-zoom") || "100") + Number(zoomBtn.getAttribute("data-ent-z"))));
          ent.setAttribute("data-zoom", String(scale));
          ent.querySelector("[data-ent-pct]").textContent = scale + "%";
          ent.querySelector(".ent-stage").style.transform = "scale(" + (scale / 100) + ")";
          return;
        }
        if (event.target.closest("[data-ent-export]")) {
          ent.querySelector("[data-ent-note]").textContent = "Stays in this browser. Nothing is sent out.";
          return;
        }
      }
      var rec = event.target.closest(".rec");
      if (rec) {
        var reset = event.target.closest("[data-rec-reset]");
        if (reset) {
          var group = reset.getAttribute("data-rec-reset");
          rec.querySelectorAll("[data-rec-filter]").forEach(function (select) {
            if (group === "all" || select.getAttribute("data-group") === group) select.value = "All";
          });
          if (group === "all") {
            var field = rec.querySelector("[data-rec-q]");
            if (field) field.value = "";
          }
          applyRec(rec);
          return;
        }
        if (event.target.closest("[data-rec-apply]")) {
          applyRec(rec);
          return;
        }
        if (event.target.closest("[data-rec-accept]")) {
          markRec(rec, "accepted");
          return;
        }
        if (event.target.closest("[data-rec-reject]")) {
          markRec(rec, "rejected");
          return;
        }
        if (event.target.closest("[data-rec-clear-checks]")) {
          rec.querySelectorAll("[data-rec-box], [data-rec-allbox]").forEach(function (box) { box.checked = false; });
          rec.querySelectorAll("tr.is-checked").forEach(function (row) { row.classList.remove("is-checked"); });
          return;
        }
        if (event.target.hasAttribute("data-rec-allbox")) {
          var on = event.target.checked;
          rec.querySelectorAll("tbody tr[data-rec]").forEach(function (row) {
            if (row.hidden) return;
            var box = row.querySelector("[data-rec-box]");
            if (box) box.checked = on;
            row.classList.toggle("is-checked", on);
          });
          return;
        }
      }
      var acc = event.target.closest(".bb-acc-h");
      if (acc) {
        acc.parentElement.classList.toggle("is-open");
        return;
      }
      var board = event.target.closest(".bb");
      var command = event.target.closest("[data-bb]");
      var picked = event.target.closest(".bb-node");
      if (board && (command || picked)) {
        var action = command ? command.getAttribute("data-bb") : "node";
        if (action === "undo" || action === "redo") {
          var state = bbMemoryFor(board);
          var stack = action === "undo" ? state.past : state.future;
          var other = action === "undo" ? state.future : state.past;
          var snap = stack.pop();
          if (snap) {
            other.push(bbSnap(board));
            bbRestore(board, snap);
          }
          return;
        }
        if (action === "close") {
          bbCommit(board, function () {
            board.querySelector(".bb-rel").classList.add("is-shut");
            board.querySelector(".bb-body").classList.add("is-wide");
          });
          return;
        }
        bbCommit(board, function () {
          if (action === "node") {
            var id = picked.getAttribute("data-id");
            board.setAttribute("data-primary", id);
            board.querySelector(".bb-rel").classList.remove("is-shut");
            board.querySelector(".bb-body").classList.remove("is-wide");
            var next = bbLinks(board, id).filter(function (link) {
              var node = board.querySelector('.bb-node[data-id="' + link + '"]');
              return node && !node.classList.contains("is-hidden");
            })[0];
            bbSelect(board, next ? [id, next] : [id]);
          } else if (action === "links") {
            var seed = board.getAttribute("data-primary");
            var seeded = seed && board.querySelector('.bb-node[data-id="' + seed + '"]');
            var id = seeded && !seeded.classList.contains("is-hidden") ? seed : board.querySelector(".bb-node:not(.is-hidden)").getAttribute("data-id");
            board.setAttribute("data-primary", id);
            bbSelect(board, [id].concat(bbLinks(board, id)));
          } else if (action === "paths") {
            var chosen = [];
            board.querySelectorAll(".bb-node.is-on").forEach(function (node) { chosen.push(node.getAttribute("data-id")); });
            if (chosen.length < 2) {
              var first = chosen[0] || board.querySelector(".bb-node:not(.is-hidden)").getAttribute("data-id");
              var last = board.querySelectorAll(".bb-node:not(.is-hidden)");
              chosen = [first, last[last.length - 1].getAttribute("data-id")];
            }
            bbSelect(board, bbPath(board, chosen[0], chosen[1]));
          } else if (action === "clear-sel") {
            board.removeAttribute("data-primary");
            bbSelect(board, []);
          } else if (action === "clear") {
            board.removeAttribute("data-primary");
            board.querySelectorAll(".bb-node").forEach(function (node) { node.classList.add("is-hidden"); node.classList.remove("is-on"); });
          } else if (action === "reset") {
            board.querySelectorAll(".bb-node").forEach(function (node) {
              node.classList.toggle("is-hidden", node.hasAttribute("data-extra"));
              node.classList.toggle("is-on", node.hasAttribute("data-focus"));
            });
            var focusNode = board.querySelector(".bb-node[data-focus]");
            if (focusNode) board.setAttribute("data-primary", focusNode.getAttribute("data-id"));
            board.querySelector(".bb-rel").classList.remove("is-shut");
            board.querySelector(".bb-body").classList.remove("is-wide");
            board.querySelector("[data-bb-note]").textContent = "";
            var search = board.querySelector("[data-bb-search]");
            if (search) search.value = "";
          } else if (action === "add") {
            var extra = board.querySelector(".bb-node[data-extra]");
            if (extra) {
              extra.classList.remove("is-hidden");
              var id = extra.getAttribute("data-id");
              board.setAttribute("data-primary", id);
              var next = bbLinks(board, id)[0];
              bbSelect(board, next ? [id, next] : [id]);
              board.querySelector("[data-bb-note]").textContent = extra.getAttribute("data-name") + " added. Nothing is released to the field.";
            }
          } else if (action === "review") {
            board.querySelector("[data-bb-note]").textContent = "Added to the engineering review. Nothing is released to the field.";
          }
        });
        return;
      }
      var scenario = event.target.closest(".scenario-btn");
      if (scenario) {
        var board = scenario.closest(".sched");
        var heading = board.querySelector("[data-sched-heading]");
        var note = board.querySelector("[data-sched-note]");
        if (heading) heading.textContent = "Scenario 2";
        if (note) note.textContent = "Draft copy. Nothing is released to the field.";
        return;
      }
      if (!event.target.classList.contains("clear-filters")) return;
      var panel = event.target.closest(".screen");
      if (!panel) return;
      panel.querySelectorAll("select").forEach(function (select) { select.value = "All"; });
      applyCut(panel);
    });

    stage.addEventListener("input", function (event) {
      if (event.target.hasAttribute("data-ent-q")) {
        paintEnt(event.target.closest(".ent"));
        return;
      }
      if (!event.target.hasAttribute("data-rec-q")) return;
      applyRec(event.target.closest(".rec"));
    });

    stage.addEventListener("change", function (event) {
      if (event.target.hasAttribute("data-prd-filter")) {
        var board = event.target.closest(".prd");
        var picks = board.querySelectorAll("[data-prd-filter]");
        var corridor = picks[0].value;
        var asset = picks[1].value;
        var windowName = picks[2].value;
        var nodes = board.querySelectorAll("[data-prd-label]");
        var hits = 0;
        nodes.forEach(function (node) {
          if (asset === "All" || node.getAttribute("data-prd-label") === asset) hits += 1;
        });
        var unmatched = asset !== "All" && hits === 0;
        nodes.forEach(function (node) {
          var label = node.getAttribute("data-prd-label");
          node.classList.toggle("is-dim", !unmatched && asset !== "All" && label !== asset);
        });
        var note = board.querySelector("[data-prd-note]");
        if (note) {
          if (unmatched) note.textContent = "No separate chart for " + asset + ". Showing the recorded corridor.";
          else if (corridor !== "All" && corridor !== "Corridor North") note.textContent = corridor + " has no separate production record. The charts stay on Corridor North.";
          else if (windowName !== "All") note.textContent = "The window stays a label. The charts are not recalculated.";
          else note.textContent = asset === "All" ? "" : "Showing " + asset + ".";
        }
        return;
      }
      if (event.target.hasAttribute("data-opt-view")) {
        var viewBoard = event.target.closest(".opt");
        var showMap = event.target.value === "map";
        var diagramEl = viewBoard.querySelector("[data-opt-diagram]");
        var mapElToggle = viewBoard.querySelector("[data-baku-map]");
        if (diagramEl) diagramEl.hidden = showMap;
        if (mapElToggle) {
          mapElToggle.hidden = !showMap;
          if (showMap && mapElToggle._baku) setTimeout(function () { mapElToggle._baku.invalidateSize(); }, 60);
        }
        return;
      }
      if (event.target.hasAttribute("data-opt-place")) {
        var placeBoard = event.target.closest(".opt");
        var place = event.target.value;
        var placeNote = placeBoard.querySelector("[data-opt-place-note]");
        var visibleRows = 0;
        var allRows = placeBoard.querySelectorAll("tr[data-opt-row]");
        allRows.forEach(function (row) {
          var zoneName = row.getAttribute("data-zone") || "";
          var show = zoneName.indexOf(place) !== -1;
          row.hidden = !show;
          if (show) visibleRows += 1;
        });
        var empty = placeBoard.querySelector("[data-opt-empty]");
        if (empty) empty.hidden = visibleRows !== 0;
        var range = placeBoard.querySelector("[data-opt-range]");
        if (range) range.textContent = (visibleRows ? "1–" + visibleRows : "0") + " of " + allRows.length;
        var countEl = placeBoard.querySelector("[data-rel-count]");
        if (countEl) countEl.textContent = visibleRows + " of " + allRows.length + " records selected";
        var mapEl = placeBoard.querySelector("[data-baku-map]");
        if (placeNote) {
          placeNote.textContent = !mapEl
            ? "This cut has no corridor coordinates. The diagram is the record."
            : place === "Corridor North"
              ? "Planning positions on the Absheron peninsula, north of Baku. Not a surveyed tower file."
              : place + " has no recorded tower coordinates. The Baku corridor stays the mapped line.";
        }
        if (mapEl && mapEl._baku) {
          if (place === "Corridor North" && mapEl._bakuLine && mapEl._bakuLine.length) mapEl._baku.fitBounds(mapEl._bakuLine, { padding: [28, 28] });
          else if (BAKU_VIEWS[place]) mapEl._baku.setView(BAKU_VIEWS[place].center, BAKU_VIEWS[place].zoom);
        }
        return;
      }
      if (event.target.hasAttribute("data-opt-size")) {
        var board = event.target.closest(".opt");
        var limit = Number(event.target.value) || 5;
        var optRows = board.querySelectorAll("tr[data-opt-row]");
        var shown = 0;
        optRows.forEach(function (row, index) {
          row.hidden = index >= limit;
          if (!row.hidden) shown += 1;
        });
        board.querySelector("[data-opt-range]").textContent = (shown ? "1–" + shown : "0") + " of " + optRows.length;
        return;
      }
      if (event.target.hasAttribute("data-pln-date")) {
        var dateNote = event.target.closest(".pln").querySelector("[data-pln-note]");
        if (dateNote) dateNote.textContent = "The dates stay in this browser. Nothing is rescheduled.";
        return;
      }
      if (event.target.hasAttribute("data-iss-lock")) {
        event.target.closest(".iss").querySelector("[data-iss-heat]").classList.toggle("is-locked", event.target.checked);
        return;
      }
      if (event.target.hasAttribute("data-rec-box")) {
        var row = event.target.closest("tr");
        if (row) row.classList.toggle("is-checked", event.target.checked);
        return;
      }
      if (event.target.hasAttribute("data-rec-filter")) {
        applyRec(event.target.closest(".rec"));
        return;
      }
      if (event.target.hasAttribute("data-bb-search")) {
        var board = event.target.closest(".bb");
        var id = event.target.value;
        if (!id) return;
        bbCommit(board, function () {
          board.setAttribute("data-primary", id);
          board.querySelector(".bb-rel").classList.remove("is-shut");
          board.querySelector(".bb-body").classList.remove("is-wide");
          var node = board.querySelector('.bb-node[data-id="' + id + '"]');
          if (node) node.classList.remove("is-hidden");
          var next = bbLinks(board, id).filter(function (link) {
            var other = board.querySelector('.bb-node[data-id="' + link + '"]');
            return other && !other.classList.contains("is-hidden");
          })[0];
          bbSelect(board, next ? [id, next] : [id]);
        });
        return;
      }
      if (event.target.hasAttribute("data-sched-name")) {
        var heading = event.target.closest(".sched").querySelector("[data-sched-heading]");
        if (heading) heading.textContent = event.target.value;
        return;
      }
      if (event.target.hasAttribute("data-sched-session")) {
        var note = event.target.closest(".sched").querySelector("[data-sched-note]");
        if (note) note.textContent = "Showing " + event.target.value + ". The Wednesday visit stays on Corridor North.";
        return;
      }
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
      var box = document.getElementById("prov");
      if (box && el.hasAttribute("data-prov-title")) {
        box.innerHTML = "<h3>" + esc(el.getAttribute("data-prov-title")) + "</h3><p>" + esc(el.getAttribute("data-prov-body")) + "</p>";
      }
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

    render();
  }

  window.NexusReliability = {
    open: function (id) {
      var app = APPS[id];
      if (!app) return;
      mount(app);
    }
  };
})();
