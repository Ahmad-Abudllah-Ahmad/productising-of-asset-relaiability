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

  function operations() {
    var k = [
      { l: "Approved tasks", v: "5", s: "One corridor visit", tip: "Five tasks grouped on Corridor North.", spark: [1, 2, 3, 4, 5, 5], color: BLUE },
      { l: "Visit window", v: "1", s: "Outage day", tip: "One planned inspection-and-repair visit.", spark: [3, 3, 2, 2, 1, 1], color: TEAL },
      { l: "Awaiting release", v: "1", s: "T-104 package", tip: "Technical approval is still open for the T-104 pair.", spark: [2, 2, 2, 1, 1, 1], color: AMBER },
      { l: "Days since confirm", v: "11", s: "Steel + cotter", tip: "Clock starts at engineering confirmation, not at the flight.", spark: [2, 4, 6, 8, 10, 11], color: RED }
    ];
    return [
      drawingScreen([
        { tab: "One visit", src: "/pids/nx-ops-pfd-0104-one-visit.svg", kicker: "One planned visit", note: "Five tasks. Orders are staged, not written back." },
        { tab: "Pumps", src: "/pids/nx-ops-pid-0301-pumps.svg", kicker: "Task package", note: "Steel, cotter, and the damper hold." },
        { tab: "Train", src: "/pids/nx-ops-pid-0201-visit.svg", kicker: "Visit sequence", note: "11 days since confirmation. No field start." },
        { tab: "Package", src: "/pids/nx-ops-pid-1001-package.svg", kicker: "Visit package", note: "The damper stays on hold until the location is confirmed." }
      ]),
      screen("command", "Operations Command Center", "pulse", [
        tab("Production", function () {
          return prodBoard({
            title: "Visit",
            lede: "Five tasks grouped into one Wednesday visit. Field work has not started.",
            kpis: [
              { k: "Tasks", v: "5", tip: "Steel, cotter, damper, foundation check, and ROW." },
              { k: "Hours", v: "17", tip: "6 + 2 + 3 + 2 + 4." },
              { k: "Released", v: "1", tip: "ROW only, to VEG-02." },
              { k: "Field start", v: "0", tip: "No task has started in the field." }
            ],
            bars: { title: "Hours by task", unit: "Planned hours.", labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], values: [6, 2, 3, 2, 4], max: 8 },
            lines: { title: "Running total of the 17 hours", unit: "The line adds the task hours. It is not a weekly output.", labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], series: [
              { name: "Running total", color: "#3b6fd8", values: [6, 8, 11, 13, 17] },
              { name: "Field start", color: "#d14343", values: [0, 0, 0, 0, 0] }
            ] },
            stack: { title: "Released and still open", unit: "Hours. The damper stays on hold.", labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], series: [
              { name: "Not started", color: "#3b6fd8", values: [6, 2, 3, 2, 0] },
              { name: "Released", color: "#3d9a78", values: [0, 0, 0, 0, 4] }
            ] },
            rank: { title: "Tasks by hours", unit: "Hours in the one visit.", rows: [
              { name: "Steel", value: 6 }, { name: "ROW", value: 4 }, { name: "Damper", value: 3 }, { name: "Cotter", value: 2 }, { name: "Foundation", value: 2 }
            ] }
          });
        }),
        tab("Sourcing", function () {
          return sourceBoard({
            cards: [
              { k: "Tasks in one visit", v: "5", s: "Not five trips", spark: [5, 5], tip: "Steel, cotter, damper, foundation check, and ROW." },
              { k: "Task hours", v: "17", s: "6 + 2 + 3 + 2 + 4", spark: [6, 8, 11, 13, 17], tip: "The hours add to 17. Field work has not started." },
              { k: "Released", v: "1", s: "ROW only", spark: [1, 1], tip: "VEG-02 has N-19 only." },
              { k: "Field start", v: "0", s: "Nothing has started", spark: [0, 0], tip: "No task has a field start." },
              { k: "Days since confirmation", v: "11", s: "No after images", spark: [11, 11], tip: "The clock is 11 days. The visit has not started." }
            ],
            side: { title: "One Wednesday visit", rows: [{ k: "Steel", v: "6h approval" }, { k: "Cotter", v: "2h approval" }, { k: "Damper", v: "3h hold" }, { k: "ROW", v: "4h released" }], foot: "The damper stays on hold. Nothing is released to the field except N-19." },
            chartTitle: "Hours in the one visit",
            labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"],
            bars: [
              { name: "Hours not started", color: "#6b5bd2", values: [6, 2, 3, 2, 0] },
              { name: "Released hours", color: "#3d9a78", values: [0, 0, 0, 0, 4] }
            ],
            line: { name: "Running total", color: "#14b8a6", values: [6, 8, 11, 13, 17] },
            leftMax: 8, rightMax: 20,
            band: "Planned hours. Field start is still 0.",
            split: "17 hours. One released task."
          });
        }),
        tab("Overview", function () {
          return optBoard({
            recent: "Most recent visit plan",
            map: "visit",
            placeTitle: "Wednesday visit, north of Baku",
            cards: [
              { k: "Tasks", v: "5", delta: "One visit", tone: "flat", spark: [5, 5, 5, 5, 5], caption: "Wednesday", tip: "Steel, cotter, damper, foundation check, and ROW." },
              { k: "Task hours", v: "17", delta: "6 + 2 + 3 + 2 + 4", tone: "flat", spark: [6, 2, 3, 2, 4], caption: "By task", tip: "Hours for the five tasks. Not hours already worked." },
              { k: "Released", v: "1", delta: "ROW only", tone: "flat", spark: [1, 1], caption: "VEG-02", tip: "The vegetation cut is the only released task." },
              { k: "Field start", v: "0", delta: "Not started", tone: "down", spark: [0, 0, 0, 0, 0], caption: "11 days open", tip: "No after images." }
            ],
            facts: [
              { k: "Current status", v: "Open", dot: true },
              { k: "Window", v: "Wednesday" },
              { k: "Clock", v: "11 days" },
              { k: "Released", v: "1 of 5" },
              { k: "Field start", v: "0" },
              { k: "Next step", v: "Still planned" }
            ],
            rows: [
              { name: "Steel", unit: "Hours", recorded: "6", current: "Approval", change: "WO-104-A", tone: "flat", note: "The steel task is 6 hours and still in approval." },
              { name: "Cotter", unit: "Hours", recorded: "2", current: "Approval", change: "WO-104-B", tone: "flat", note: "The cotter task is 2 hours and still in approval." },
              { name: "Damper", unit: "Hours", recorded: "3", current: "Hold", change: "Location open", tone: "down", note: "The damper task is 3 hours and on hold." },
              { name: "Foundation", unit: "Hours", recorded: "2", current: "Check", change: "T-103 watch", tone: "flat", note: "The T-103 check is 2 hours. It is a watch, not a verified defect." },
              { name: "ROW", unit: "Hours", recorded: "4", current: "Released", change: "VEG-02", tone: "up", note: "The vegetation cut is 4 hours and is released to VEG-02. It has not started." }
            ],
            slides: [
              "Five maintenance tasks can be grouped into one planned inspection-and-repair visit.",
              "Steel is 6 hours in approval. Cotter is 2 hours in approval. The damper is 3 hours and held.",
              "The ROW cut is 4 hours and released to VEG-02. The foundation check is 2 hours.",
              "It is 11 days since confirmation. Field work has not started, and there are no after images."
            ],
            chartTitle: "Task hours in the visit",
            chart: { max: 8, labels: ["Steel", "Cotter", "Damper", "Check", "ROW"], series: [
              { name: "Task hours", color: "#2563eb", values: [6, 2, 3, 2, 4] },
              { name: "Field start", color: "#d14343", dash: true, values: [0, 0, 0, 0, 0] }
            ] }
          });
        }),
        tab("Matrix", function () {
          return matrixBoard({
            title: "Visit Collection Matrix",
            date: "Wednesday",
            operation: "One inspection-and-repair visit",
            heading: "Visit hierarchy",
            chip: "T-104",
            conflict: { k: "Schedule conflicts", v: "1 conflict", tip: "The damper task is held, so the five-task visit is not fully released." },
            metrics: [
              { k: "Tasks", v: "5", tip: "Steel, cotter, damper, foundation check, and ROW." },
              { k: "Scheduled", v: "5", tip: "All five share one Wednesday visit." },
              { k: "At risk", v: "1", tip: "Damper remains on hold." },
              { k: "Released", v: "1", tip: "ROW only, to VEG-02." },
              { k: "In approval", v: "2", tip: "Steel 6 hours and cotter 2 hours." },
              { k: "Field start", v: "0", tip: "11 days since confirmation. No after images." }
            ],
            score: { value: 20, label: "Released", tip: "1 of 5 tasks is released. Field work has not started." },
            focus: "visit",
            nodes: [
              { id: "visit", kind: "rollup", name: "Visit", mark: "5 tasks", status: "agency", x: 50, y: 16, tag: "T-104", description: "Five maintenance tasks can be grouped into one planned inspection-and-repair visit.", source: "Nothing has started in the field.", basic: [["Tasks", "5"], ["Hours", "17"], ["Window", "Wednesday"]] },
              { id: "day", kind: "parent", name: "Wednesday", status: "parent", x: 50, y: 48, tag: "T-104", description: "Steel, cotter, damper, the T-103 check, and the ROW cut share one access window.", source: "The damper stays held.", basic: [["Access", "One"], ["Field start", "0"], ["Clock", "11 days"]] },
              { id: "steel", kind: "leaf", name: "Steel", mark: "6h", status: "scheduled", x: 28, y: 80, tag: "T-104", description: "The steel task is 6 hours and still in approval.", source: "WO-104-A. Not started in the field.", basic: [["Order", "WO-104-A"], ["State", "Approval"], ["Asset", "T-104"]] },
              { id: "damper", kind: "leaf", name: "Damper", mark: "Hold", status: "held", x: 72, y: 80, tag: "Span N-18", description: "The damper task is 3 hours and on hold. The location is not confirmed.", source: "WO-18-D. Score 0.93 from 4 frames.", basic: [["Hours", "3"], ["State", "Hold"], ["Location", "Open"]] }
            ],
            edges: [["visit", "day"], ["day", "steel"], ["day", "damper"]]
          });
        }),
        tab("Forecast", function () {
          return planBoard({
            next: "The grouped visit is planned for Wednesday. Field work has not started.",
            start: "Confirmation",
            end: "Wednesday",
            chart: {
              title: "Hours in the one visit",
              max: 8,
              labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"],
              stacks: [
                { name: "Steel", color: "#6b5bd2", values: [6, 0, 0, 0, 0] },
                { name: "Cotter", color: "#e07a9a", values: [0, 2, 0, 0, 0] },
                { name: "Damper", color: "#f0a05a", values: [0, 0, 3, 0, 0] },
                { name: "Foundation", color: "#6aa6e8", values: [0, 0, 0, 2, 0] },
                { name: "ROW", color: "#3d9a78", values: [0, 0, 0, 0, 4] }
              ],
              lines: [{ name: "Field start", color: "#d14343", dash: true, values: [0, 0, 0, 0, 0] }]
            },
            quiet: ["Corridor=Corridor North", "Voltage=220 kV", "Window=This visit", "Asset=T-104", "Source=Plan"],
            views: [
              {
                when: "", badge: "5 tasks, 1 trip", hero: { v: "5", k: "Tasks in one visit" }, leftTitle: "Grouped visit", rightTitle: "If left separate",
                left: [{ k: "Tasks", v: "5" }, { k: "Task hours", v: "17" }, { k: "Window", v: "Wednesday" }],
                right: [{ k: "Trips", v: "5" }, { k: "Same hours", v: "17" }, { k: "Field start", v: "0" }],
                bandTitle: "This visit", bandNote: "Planned. Nothing has started in the field.",
                band: [{ k: "Released", v: "1", pill: "ROW only" }, { k: "Held", v: "1", pill: "Damper", tone: "down" }, { k: "Field start", v: "0", pill: "Not started", tone: "down" }],
                summary: "Five maintenance tasks can be grouped into one planned inspection-and-repair visit.",
                more: "Steel WO-104-A is 6 hours and in approval. Cotter WO-104-B is 2 hours and in approval. Damper WO-18-D is 3 hours and on hold. The T-103 foundation check is 2 hours. ROW N-19 is 4 hours and released to VEG-02. It is 11 days since confirmation, with no field start and no after images.",
                ring: 0, ringLabel: "Field start", ringTip: "No task in this visit has started in the field."
              },
              {
                when: "Work=Steel", badge: "In approval", leftTitle: "Steel", rightTitle: "Still open",
                left: [{ k: "Hours", v: "6" }, { k: "Order", v: "WO-104-A" }, { k: "State", v: "Approval" }],
                right: [{ k: "Asset", v: "T-104" }, { k: "Crew", v: "None" }, { k: "Field start", v: "0" }],
                bandTitle: "Steel task", bandNote: "Part of the one visit. Not released to the field.",
                band: [{ k: "Hours", v: "6", pill: "WO-104-A" }, { k: "Approval", v: "Open", pill: "Not released", tone: "down" }, { k: "Field start", v: "0", pill: "Not started", tone: "down" }],
                summary: "The steel task is 6 hours and still in approval. It has not started in the field.",
                more: "This is one of the two verified structural findings on T-104. It shares the Wednesday visit with the other four tasks.",
                ring: 0, ringLabel: "Field start", ringTip: "Steel work has not started."
              },
              {
                when: "Work=Damper", badge: "On hold", leftTitle: "Damper", rightTitle: "Why it is held",
                left: [{ k: "Hours", v: "3" }, { k: "Order", v: "WO-18-D" }, { k: "State", v: "Hold" }],
                right: [{ k: "Score", v: "0.93" }, { k: "Frames", v: "4" }, { k: "Location", v: "Open" }],
                bandTitle: "Damper task", bandNote: "Visual finding. Location is not confirmed.",
                band: [{ k: "Hours", v: "3", pill: "Held", tone: "down" }, { k: "Verified structural", v: "No", pill: "Not T-104's two" }, { k: "Field start", v: "0", pill: "Not started", tone: "down" }],
                summary: "The damper task is 3 hours and on hold. The location is not confirmed.",
                more: "The score of 0.93 is from 4 frames. It is not one of the two verified structural findings.",
                ring: 0, ringLabel: "Released", ringTip: "The damper task is held. It is not released."
              },
              {
                when: "Work=ROW", badge: "Released", leftTitle: "ROW", rightTitle: "Limit",
                left: [{ k: "Hours", v: "4" }, { k: "Order", v: "WO-19-V" }, { k: "Crew", v: "VEG-02" }],
                right: [{ k: "Asset", v: "Span N-19" }, { k: "Tower work", v: "No" }, { k: "Field start", v: "0" }],
                bandTitle: "Vegetation", bandNote: "Released to VEG-02. Not started.",
                band: [{ k: "Hours", v: "4", pill: "Released" }, { k: "Crew", v: "VEG-02", pill: "N-19 only" }, { k: "Field start", v: "0", pill: "Not started", tone: "down" }],
                summary: "The vegetation cut is 4 hours and is released to VEG-02. It has not started in the field.",
                more: "VEG-02 is assigned only to span N-19. That assignment does not cover T-104.",
                ring: 100, ringLabel: "Released", ringTip: "Released to VEG-02. Not a field start, and not the tower repair."
              },
              {
                when: "Work=Foundation", badge: "Watch", leftTitle: "Foundation check", rightTitle: "What it is not",
                left: [{ k: "Hours", v: "2" }, { k: "Asset", v: "T-103" }, { k: "Index", v: "74" }],
                right: [{ k: "Verified defect", v: "No" }, { k: "State", v: "Watch" }, { k: "Field start", v: "0" }],
                bandTitle: "T-103 check", bandNote: "Inspection time inside the same visit.",
                band: [{ k: "Hours", v: "2", pill: "Check" }, { k: "Verified defect", v: "No", pill: "Watch" }, { k: "Field start", v: "0", pill: "Not started", tone: "down" }],
                summary: "The T-103 foundation check is 2 hours. It is a watch, not a verified defect.",
                more: "The check rides with the Wednesday visit. It does not add a structural finding to T-104.",
                ring: 0, ringLabel: "Field start", ringTip: "The foundation check has not started."
              }
            ]
          });
        }),
        tab("Issues", function () {
          return issueBoard({
            heading: "Visit issue review",
            updated: "Open package",
            note: "100 means that step is done. 40 means it is open. A dot means the step does not apply.",
            cols: ["Request", "Approval", "Hold", "Release", "Crew", "Field"],
            cards: [
              { name: "Steel hours", score: "6", lines: [["Order", "WO-104-A"], ["State", "Approval"], ["Field", "Not started"]], detail: "The steel repair is 6 hours. It is staged and not released." },
              { name: "Tasks in visit", score: "5", lines: [["Window", "One"], ["Corridor", "North"], ["Started", "No"]], detail: "Five tasks can share one inspection-and-repair visit." },
              { name: "ROW hours", score: "4", lines: [["Order", "WO-19-V"], ["Crew", "VEG-02"], ["State", "Released"]], detail: "The vegetation cut is 4 hours and is released to VEG-02." },
              { name: "Damper hold", score: "3", lines: [["Order", "WO-18-D"], ["State", "Hold"], ["Location", "Open"]], detail: "The damper is 3 hours and stays out of the release until the location is confirmed." },
              { name: "Cotter hours", score: "2", lines: [["Order", "WO-104-B"], ["With", "Steel"], ["State", "Approval"]], detail: "The cotter pin is 2 hours and travels with the steel." }
            ],
            groups: [
              { name: "Package", rows: [
                { name: "Steel", values: [100, 40, null, null, null, 0], notes: ["Finding recorded", "Approval open", "Not a hold", "Not released", "No crew named", "No field start"] },
                { name: "Cotter", values: [100, 40, null, null, null, 0], notes: ["Same package", "Approval open", "Not a hold", "Not released", "No crew named", "No field start"] },
                { name: "Damper", values: [40, null, 100, 0, null, 0], notes: ["Visual finding", "Not in approval", "Held for location", "Not released", "No HV crew", "No field start"] },
                { name: "ROW", values: [100, 100, null, 100, 100, 0], notes: ["Requested", "Clear", "Not held", "Released", "VEG-02", "Not started in the field"] }
              ] }
            ],
            trendTitle: "Hours in the visit.",
            trend: { labels: ["Steel", "Cotter", "Damper", "Check", "ROW"], values: [6, 2, 3, 2, 4], max: 8 }
          });
        }),
        tab("Entities", function () {
          return entityBoard({
            focus: "visit",
            types: ENT_TYPES,
            nodes: [
              { id: "steel", type: "tower", name: "WO-104-A", short: "104A", x: 50, y: 20, summary: "6 hour steel repair. Approval is still open.", status: "STAGED", tone: "a", props: [["Asset", "T-104"], ["Hours", "6"], ["Release", "Not yet"]], sourceTitle: "Work package", source: "Staged for approval. Not a live write-back.", recorded: "Open", updated: "Approval open" },
              { id: "cotter", type: "part", name: "WO-104-B", short: "104B", x: 68, y: 26, summary: "2 hour cotter task. Same package as the steel.", status: "STAGED", tone: "a", props: [["Asset", "T-104"], ["Hours", "2"]], sourceTitle: "Work package", source: "Travels with the steel in the same outage.", recorded: "Open", updated: "Approval open" },
              { id: "visit", type: "report", name: "One visit", short: "VISIT", x: 42, y: 48, summary: "Five tasks grouped into one inspection-and-repair visit.", status: "PLANNED", tone: "b", props: [["Tasks", "5"], ["Window", "Wednesday"], ["Corridor", "North"]], sourceTitle: "Operations plan", source: "One access window. The damper stays held.", recorded: "Open", updated: "Not started" },
              { id: "row", type: "crew", name: "WO-19-V", short: "19V", x: 24, y: 70, summary: "4 hour ROW cut. Released to VEG-02.", status: "RELEASED", tone: "g", props: [["Crew", "VEG-02"], ["Hours", "4"], ["Asset", "N-19"]], sourceTitle: "Crew plan", source: "Vegetation only. Not the tower repair.", recorded: "Open", updated: "Released" },
              { id: "check", type: "tower", name: "T-103 check", short: "T103", x: 48, y: 74, summary: "2 hour foundation check. Not a confirmed repair.", status: "CHECK", tone: "b", props: [["Hours", "2"], ["Finding", "None verified"]], sourceTitle: "Visit plan", source: "Included because the crew is already on the corridor.", recorded: "Open", updated: "Check only" },
              { id: "hold", type: "span", name: "WO-18-D", short: "18D", x: 74, y: 66, summary: "Damper held until the location is confirmed.", status: "HELD", tone: "a", props: [["Asset", "N-18"], ["Hours", "3"], ["State", "Not released"]], sourceTitle: "Work package", source: "Enters the visit only after confirmation.", recorded: "Open", updated: "Held" }
            ],
            edges: [["steel", "visit", "task"], ["visit", "cotter", "same package"], ["visit", "hold", "held"], ["visit", "row", "released"], ["visit", "check", "check"], ["hold", "check", "same corridor"]]
          });
        }),
        tab("Recommendations", function () {
          return recommendBoard({
            costTitle: "Hours in the one visit",
            costMax: 8,
            cost: [
              { label: "Steel 6h", value: 6, color: "#e07a3d", tip: "WO-104-A is staged. Approval is still open." },
              { label: "Damper hold", value: -3, color: "#3d9a78", tip: "3 hours stay held until the location is confirmed." }
            ],
            levelTitle: "Tasks in the visit",
            levelLabels: ["Steel", "Cotter", "Damper", "Check", "ROW"],
            levelValues: [60, 20, 30, 20, 40],
            levelTip: "Hours scaled for the chart. Steel is 6, cotter 2, damper 3, check 2, ROW 4.",
            groups: recGroups(["T-104", "N-18", "N-19", "T-103"], ["Approval", "Hold", "Check", "Released"]),
            rows: [
              { item: "WO-104-A", meta: "Steel", place: "T-104", placeMeta: "Corridor North", text: "Keep the steel in the visit. Do not release it yet.", impact: "6 hours", level: "Approval", check: "Staged", date: "Open", keys: "Corridor North T-104 Approval" },
              { item: "WO-104-B", meta: "Cotter", place: "T-104", placeMeta: "Same outage", text: "Pair the cotter with the steel.", impact: "2 hours", level: "Approval", check: "Staged", date: "Open", keys: "Corridor North T-104 Approval" },
              { item: "WO-18-D", meta: "Damper", place: "N-18", placeMeta: "Corridor North", text: "Leave the damper out until the location is confirmed.", impact: "3 hours", level: "Hold", check: "Not released", date: "Open", keys: "Corridor North N-18 Hold" },
              { item: "T-103", meta: "Foundation", place: "T-103", placeMeta: "Corridor North", text: "Add the check because the crew is already on the corridor.", impact: "2 hours", level: "Check", check: "Not a defect", date: "Open", keys: "Corridor North T-103 Check" },
              { item: "WO-19-V", meta: "ROW", place: "N-19", placeMeta: "Corridor North", text: "VEG-02 can travel with the access window.", impact: "4 hours", level: "Released", check: "Assigned", date: "Open", keys: "Corridor North N-19 Released" }
            ]
          });
        }),
        tab("Blackboard", function () {
          return blackboard({
            focus: ["visit", "hold"],
            nodes: [
              { id: "steel", name: "WO-104-A", short: "104A", x: 14, y: 26, color: "#9f1239", tip: "6 hour steel repair. Approval is still open." },
              { id: "cotter", name: "WO-104-B", short: "104B", x: 30, y: 34, color: PURPLE, tip: "2 hour cotter task. Same package as the steel." },
              { id: "visit", name: "One visit", short: "VISIT", x: 22, y: 54, color: BLUE, tip: "Five tasks grouped into one inspection-and-repair visit." },
              { id: "check", name: "T-103 check", short: "T103", x: 16, y: 76, color: TEAL, tip: "2 hour foundation check. Not a confirmed repair." },
              { id: "row", name: "WO-19-V", short: "19V", x: 38, y: 74, color: GREEN, tip: "4 hour ROW cut. Released to VEG-02." },
              { id: "hold", name: "WO-18-D", short: "18D", x: 68, y: 28, color: AMBER, tip: "Damper held until the location is confirmed." },
              { id: "kit", name: "Kit", short: "KIT", x: 82, y: 46, color: "#334155", tip: "Not issued. The splice plate is short." },
              { id: "window", name: "Access", short: "WIN", x: 64, y: 62, color: TEAL, tip: "The outage window covers the corridor visit." }
            ],
            extra: { id: "stage", name: "Staged order", short: "SAP", x: 50, y: 14, color: "#64748b", tip: "Payload is staged. This is not a live write-back." },
            edges: [["steel", "cotter", true], ["cotter", "visit", true], ["visit", "check"], ["check", "row", true], ["visit", "hold", true], ["hold", "kit", true], ["hold", "window"], ["stage", "cotter"]],
            types: [
              { icon: "link", title: "Same visit", kicker: "WINDOW", value: "1", sub: "Wednesday", body: "Steel, cotter, damper, foundation check, and ROW share one access." },
              { icon: "file", title: "Approval", kicker: "STATE", value: "Open", sub: "WO-104-A", body: "The steel order is staged. Technical release is still open." },
              { icon: "tower", title: "Hold", kicker: "TASK", value: "WO-18-D", sub: "Not released", body: "The damper enters the visit only after the location is confirmed." },
              { icon: "user", title: "Released", kicker: "CREW", value: "VEG-02", sub: "ROW only", body: "Vegetation can travel with the outage. It does not take the tower work." }
            ]
          });
        }),
        tab("Schedule", function () {
          return scheduleBoard({
            day: "Wednesday · one visit",
            lanes: [
              { name: "HV steel", bars: [
                { left: 33.3, width: 25, fill: "#d9f2c8", ink: "#3f8f62", id: "104A", label: "WO-104-A", flag: true, tip: "6 hours on T-104. Staged for approval. Not released." }
              ] },
              { name: "HV fitting", bars: [
                { left: 58.3, width: 10, fill: "#ddd4f7", ink: "#6d5bd0", id: "104B", label: "WO-104-B", tip: "2 hour cotter task. Travels with the steel." }
              ] },
              { name: "Damper crew", bars: [
                { left: 41.7, width: 12.5, fill: "#f8e0b0", ink: "#e09a3e", id: "018D", label: "WO-18-D", flag: true, tip: "3 hours held until the damper location is confirmed." }
              ] },
              { name: "Foundation", bars: [
                { left: 62.5, width: 10, fill: "#c9efef", ink: "#3aabb0", id: "0103", label: "T-103 check", tip: "2 hours. The crew is already on the corridor." }
              ] },
              { name: "VEG-02", bars: [
                { left: 33.3, width: 16.7, fill: "#d9f2c8", ink: "#3f8f62", id: "019V", label: "WO-19-V", tip: "4 hour ROW cut. Released. Shares the access, not the high-voltage work." }
              ] },
              { name: "Outage desk", bars: [
                { left: 29.2, width: 41.6, fill: "#f8d0e3", ink: "#d56b9a", id: "WIN", label: "Access window", tip: "One planned inspection-and-repair visit for the five tasks." }
              ] },
              { name: "Kit line", bars: [
                { left: 25, width: 10, fill: "#f6d7bf", ink: "#d9893a", id: "KIT", label: "Not issued", flag: true, tip: "Warehouse has not confirmed the kit. The plate is short." }
              ] }
            ]
          });
        }),
        tab("Graph", function () {
          return mesh({
            listTitle: "Visit",
            focusTitle: "One visit",
            focus: "Five maintenance tasks can be grouped into one planned inspection-and-repair visit.",
            list: [
              { title: "T-104 steel", meta: "Approval", tip: "Verified structural finding", body: "WO-104-A is staged. Technical release is still open." },
              { title: "T-104 cotter", meta: "Approval", tip: "Same tower package", body: "WO-104-B travels with the steel in the same outage." },
              { title: "N-18 damper", meta: "Hold", tip: "Location not confirmed", body: "The slot is reserved. It is not released." },
              { title: "N-19 ROW", meta: "Released", tip: "Vegetation shares the access", body: "VEG-02 can travel with the corridor outage." }
            ],
            nodes: [
              { x: 150, y: 260, color: BLUE, short: "VISIT", title: "Corridor", tip: "One outage window", body: "All five tasks sit on Corridor North." },
              { x: 340, y: 130, color: "#9f1239", short: "T104", title: "Steel", tip: "6 hours · approval", body: "Leg B repair. Not yet released." },
              { x: 540, y: 180, color: AMBER, short: "N18", title: "Damper", tip: "Held for location", body: "Enters the visit only after confirmation." },
              { x: 360, y: 360, color: TEAL, short: "T103", title: "Foundation", tip: "Check, not a rebuild", body: "Included because the crew is already on the corridor." },
              { x: 580, y: 370, color: GREEN, short: "ROW", title: "N-19", tip: "Released", body: "Vegetation task. Shares the access." }
            ],
            edges: [[0, 1, "task"], [0, 2, "hold"], [0, 3, "check"], [0, 4, "released"]],
            columns: ["Task", "Asset", "Window", "State"],
            rows: [
              row(["Steel repair", "T-104", "Visit day", tag("Approval", "a")], "Verified finding, not yet a released order", kv),
              row(["Cotter pin", "T-104", "Visit day", tag("Approval", "a")], "Same package as the steel", kv),
              row(["Damper", "N-18", "Visit day", tag("Hold", "a")], "Enters the visit only after location confirm", kv),
              row(["Foundation", "T-103", "Visit day", tag("Check", "b")], "Inspection task, not a confirmed repair", kv),
              row(["ROW cut", "N-19", "Visit day", tag("Released", "g")], "Vegetation crew can travel with the outage", kv)
            ]
          });
        }),
        tab("Live", function () {
          return pack({
            filters: ["Region", "Line"],
            kpis: k,
            chart: { type: "bar", title: "Tasks in the Corridor North visit", labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], series: [{ name: "Hours", color: BLUE, values: [6, 2, 3, 2, 4], tips: ["T-104 leg B", "T-104 fitting", "N-18 after location confirm", "T-103 check", "N-19 vegetation"] }] },
            side: { kicker: "OUTPUT", text: "Five maintenance tasks can be grouped into one planned inspection-and-repair visit.", gauge: { value: 40, label: "Released", tip: "Two of five tasks are released. The T-104 pair is still in approval. The damper waits on location." } },
            columns: ["Task", "Asset", "Window", "State"],
            rows: [
              row(["Steel repair", "T-104", "Visit day", tag("Approval", "a")], "Verified finding, not yet a released order", kv),
              row(["Cotter pin", "T-104", "Visit day", tag("Approval", "a")], "Same package as the steel", kv),
              row(["Damper", "N-18", "Visit day", tag("Hold", "a")], "Enters the visit only after location confirm", kv),
              row(["Foundation", "T-103", "Visit day", tag("Check", "b")], "Inspection task, not a confirmed repair", kv),
              row(["ROW cut", "N-19", "Visit day", tag("Released", "g")], "Vegetation crew can travel with the outage", kv)
            ]
          });
        }),
        tab("Corridor", function () {
          return atlas({
            title: "Grouped visit",
            highlight: "T-104",
            focusTitle: "One visit",
            focus: "Five maintenance tasks can be grouped into one planned inspection-and-repair visit.",
            towers: [
              { name: "T-104", meta: "2 tasks", tip: "Steel and cotter", body: "Both sit inside the same outage." },
              { name: "N-18", meta: "Damper hold", tip: "Location first", body: "The visit slot is reserved. Release waits on confirmation." },
              { name: "T-103", meta: "Check", tip: "Foundation", body: "Included because the crew is already on the corridor." },
              { name: "N-19", meta: "ROW", tip: "Released", body: "Vegetation task shares the access." }
            ]
          });
        }),
        tab("Turnaround", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "Days from confirmation to today", labels: ["Day 1", "Day 3", "Day 5", "Day 7", "Day 9", "Day 11"], series: [{ name: "T-104 package", color: RED, values: [1, 3, 5, 7, 9, 11] }] },
            side: { type: "bars", title: "Clock", items: [
              { label: "Confirmed", pct: 100, value: "Day 0", color: TEAL, tip: "Engineering verification date" },
              { label: "Still open", pct: 70, value: "11 d", color: AMBER, tip: "No field closure yet" }
            ] },
            columns: ["Step", "Reached", "Owner", "State"],
            rows: [
              row(["Confirm", "Day 0", "Reliability", tag("Done", "g")], "Two structural findings verified", kv),
              row(["Work request", "Day 2", "Operations", tag("Done", "g")], "Package created", kv),
              row(["Release", "—", "Approver", tag("Open", "a")], "Still in the queue", kv),
              row(["Repair close", "—", "Field", tag("Open", "r")], "No closure evidence", kv)
            ]
          });
        })
      ]),
      screen("orders", "Work Orders", "orders", [
        tab("Board", function () {
          return lanes({
            kpis: k,
            columns: [
              { title: "Request", cards: [{ title: "N-18 damper", meta: "Hold for location", tip: "Not released. Slot reserved on the visit." }] },
              { title: "Approval", cards: [{ title: "T-104 steel", meta: "WO-104-A", tip: "Verified structural finding." }, { title: "T-104 cotter", meta: "WO-104-B", tip: "Same tower package." }] },
              { title: "Released", cards: [{ title: "N-19 ROW", meta: "WO-19-V", tip: "Vegetation. Shares the outage." }] },
              { title: "In field", cards: [{ title: "None today", meta: "Visit not started", tip: "No crew is on the corridor yet." }] },
              { title: "Closed", cards: [{ title: "None this package", meta: "No after-image", tip: "Closure needs field evidence." }] }
            ]
          });
        }),
        tab("CMMS", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Orders staged for SAP PM and IBM Maximo", labels: ["WO-104-A", "WO-104-B", "WO-18-D", "WO-03-F", "WO-19-V"], series: [{ name: "Stage", color: PURPLE, values: [2, 2, 1, 2, 3], tips: ["Staged · steel", "Staged · cotter", "Held · damper", "Staged · foundation check", "Released · ROW"] }] },
            side: { kicker: "CHANNEL", text: "Orders are staged for SAP PM and IBM Maximo. This view is the handoff queue, not a live write-back.", gauge: { value: 80, label: "Staged", tip: "Four of five records have a CMMS payload. The damper is held." } },
            columns: ["Order", "System", "Payload", "State"],
            rows: [
              row(["WO-104-A", "SAP PM · Maximo", "Steel", tag("Staged", "b")], "Waiting release before dispatch", kv),
              row(["WO-104-B", "SAP PM · Maximo", "Cotter", tag("Staged", "b")], "Same package", kv),
              row(["WO-18-D", "Held", "Damper", tag("Hold", "a")], "No dispatch until location is confirmed", kv),
              row(["WO-19-V", "SAP PM · Maximo", "ROW", tag("Released", "g")], "Can travel with the outage", kv)
            ]
          });
        }),
        tab("Detail", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Hours inside the one visit", items: [
              { label: "Steel", pct: 86, value: "6 h", color: PURPLE, tip: "WO-104-A" },
              { label: "ROW", pct: 57, value: "4 h", color: GREEN, tip: "WO-19-V" },
              { label: "Damper", pct: 43, value: "3 h", color: AMBER, tip: "Only if confirmed" },
              { label: "Cotter", pct: 28, value: "2 h", color: BLUE, tip: "WO-104-B" },
              { label: "Foundation", pct: 28, value: "2 h", color: TEAL, tip: "Check, not a rebuild" }
            ] },
            side: { kicker: "VISIT", text: "Five maintenance tasks can be grouped into one planned inspection-and-repair visit.", gauge: { value: 17, label: "Hours", tip: "17 crew-hours if the damper is included." } },
            columns: ["Order", "Hours", "Depends on", "State"],
            rows: [
              row(["WO-104-A", "6", "Review", tag("Approval", "a")], "Steel", kv),
              row(["WO-104-B", "2", "Review", tag("Approval", "a")], "Cotter", kv),
              row(["WO-18-D", "3", "Location", tag("Hold", "a")], "Damper", kv)
            ]
          });
        })
      ]),
      screen("planner", "Maintenance Planner", "plan", [
        tab("Grouping", function () {
          return gantt({
            title: "One outage window · Corridor North",
            ticks: ["06", "08", "10", "12", "14", "16", "18", "20"],
            kpis: k,
            lanes: [
              { name: "Access", bars: [{ left: 8, width: 78, color: "#334155", label: "Corridor", tip: "Single access for all five tasks" }] },
              { name: "T-104 steel", bars: [{ left: 18, width: 28, color: PURPLE, label: "6 h", tip: "Starts after switching" }] },
              { name: "Cotter", bars: [{ left: 46, width: 12, color: "#db2777", label: "2 h", tip: "Same tower, after steel" }] },
              { name: "Damper", bars: [{ left: 58, width: 14, color: AMBER, label: "Hold", tip: "Drawn on the plan, released only after confirm" }] },
              { name: "T-103", bars: [{ left: 30, width: 12, color: TEAL, label: "2 h", tip: "Foundation check while steel is underway" }] },
              { name: "N-19 ROW", bars: [{ left: 22, width: 22, color: GREEN, label: "4 h", tip: "Vegetation beside the outage" }] }
            ],
            sideTitle: "Why these five travel together",
            bars: [
              { label: "Same corridor", pct: 100, value: "5", color: BLUE, tip: "All on Corridor North" },
              { label: "Same outage", pct: 80, value: "4", color: TEAL, tip: "ROW can run at the edge of the window" }
            ]
          });
        }),
        tab("Window", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "Outage hours requested", labels: ["Mon", "Tue", "Wed", "Thu", "Fri"], series: [{ name: "Hours", color: BLUE, values: [0, 0, 17, 0, 0] }] },
            side: { kicker: "WINDOW", text: "Wednesday carries the whole visit. The other weekdays stay clear.", gauge: { value: 17, label: "Hours", tip: "One day, 17 hours of task time." } },
            columns: ["Day", "Outage", "Tasks", "State"],
            rows: [
              row(["Wednesday", "06–20", "5", tag("Planned", "b")], "Single visit", kv),
              row(["Other days", "None", "0", tag("Clear", "g")], "No second mobilization", kv)
            ]
          });
        }),
        tab("Route", function () {
          return atlas({
            title: "Visit order",
            highlight: "T-104",
            focusTitle: "Route",
            focus: "Crew enters at SS-North, works T-104, then moves east through N-18, T-103, and N-19.",
            towers: [
              { name: "SS-North", meta: "Entry", tip: "Switching point", body: "Access starts here." },
              { name: "T-104", meta: "First work", tip: "Steel then cotter", body: "Longest task on the route." },
              { name: "N-18", meta: "If confirmed", tip: "Damper", body: "Skipped if the location is still open." },
              { name: "N-19", meta: "Last", tip: "ROW", body: "Vegetation on the way out." }
            ]
          });
        })
      ]),
      screen("crew", "Crew Scheduling", "crew", [
        tab("Week", function () {
          return gantt({
            title: "Crews against the Wednesday visit",
            ticks: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", ""],
            kpis: [
              { l: "HV crews free", v: "2", s: "Wednesday", tip: "HV-04 and HV-07 have no other 220 kV job.", spark: [1, 1, 2, 2, 2, 2], color: GREEN },
              { l: "Assigned", v: "1", s: "VEG-02 on N-19", tip: "Vegetation crew is assigned. HV crew is not.", spark: [0, 0, 1, 1, 1, 1], color: AMBER },
              { l: "Clash", v: "0", s: "This corridor", tip: "No double-booked outage.", spark: [1, 1, 0, 0, 0, 0], color: TEAL },
              { l: "Permit", v: "Open", s: "PTW-220-18", tip: "Scheduling does not clear the permit.", spark: [1, 1, 1, 1, 1, 1], color: RED }
            ],
            lanes: [
              { name: "HV-04", bars: [{ left: 28, width: 12, color: "#475467", label: "Open", tip: "Qualified, not assigned. Authorization still open." }] },
              { name: "HV-07", bars: [{ left: 28, width: 12, color: "#475467", label: "Open", tip: "Second qualified crew. Also unassigned." }] },
              { name: "VEG-02", bars: [{ left: 28, width: 12, color: GREEN, label: "N-19", tip: "Assigned to the vegetation task." }] }
            ],
            sideTitle: "Qualification match",
            bars: [
              { label: "220 kV cert", pct: 100, value: "2", color: GREEN, tip: "HV-04 and HV-07" },
              { label: "Assigned HV", pct: 0, value: "0", color: RED, tip: "Waiting work authorization" }
            ]
          });
        }),
        tab("Availability", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Crew hours that week", labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"], series: [
              { name: "Booked", color: AMBER, values: [12, 18, 8, 20] },
              { name: "Free Wed", color: TEAL, values: [10, 8, 8, 0] }
            ] },
            side: { type: "donut", title: "Wednesday", parts: [
              { name: "HV free", value: 2, color: TEAL, tip: "Can take T-104 once authorized" },
              { name: "HV booked", value: 0, color: AMBER, tip: "None booked on this corridor" },
              { name: "VEG assigned", value: 1, color: GREEN, tip: "N-19" }
            ] },
            columns: ["Crew", "Wednesday", "Cert", "State"],
            rows: [
              row(["HV-04", "Free", "220 kV", tag("Open", "a")], "Not assigned. Authorization missing.", kv),
              row(["HV-07", "Free", "220 kV", tag("Open", "a")], "Alternate crew", kv),
              row(["VEG-02", "N-19", "ROW", tag("Set", "g")], "Vegetation only", kv),
              row(["Coast crew", "Booked", "132 kV", tag("Busy", "b")], "Not used on this corridor", "Coastal")
            ]
          });
        }),
        tab("Skills", function () {
          return pack({
            kpis: k,
            chart: { type: "heat", title: "Certification coverage · 1 = held", rows: ["HV-04", "HV-07", "VEG-02", "CIV-1"], cols: ["220 kV", "Switch", "Steel", "ROW", "First aid", "Heights", "Permit", "Driver"], matrix: [
              [100, 100, 100, 20, 100, 100, 80, 100],
              [100, 100, 80, 20, 100, 100, 80, 100],
              [20, 20, 20, 100, 100, 40, 60, 100],
              [20, 20, 40, 40, 100, 20, 40, 100]
            ] },
            side: { kicker: "MATCH", text: "HV-04 can take the steel and cotter work. VEG-02 cannot. No high-voltage crew is assigned while PTW-220-18 is open.", gauge: { value: 50, label: "Matched", tip: "Skills match. Assignment does not." } },
            columns: ["Crew", "Can do", "Assigned", "State"],
            rows: [
              row(["HV-04", "T-104", "No", tag("Waiting", "a")], "Authorization open", kv),
              row(["VEG-02", "N-19", "Yes", tag("Set", "g")], "ROW only", kv)
            ]
          });
        })
      ]),
      screen("approvals", "Approval Workflows", "check", [
        tab("Queue", function () {
          return lanes({
            kpis: [
              { l: "In queue", v: "2", s: "T-104 pair", tip: "Steel and cotter share one technical approval.", spark: [4, 3, 3, 2, 2, 2], color: AMBER },
              { l: "Released", v: "1", s: "ROW", tip: "N-19 does not need the steel approver.", spark: [0, 0, 1, 1, 1, 1], color: GREEN },
              { l: "Held", v: "1", s: "Damper", tip: "Cannot be approved until the location is confirmed.", spark: [1, 1, 1, 1, 1, 1], color: RED },
              { l: "Median age", v: "6 d", s: "Since request", tip: "Approval age, not flight age.", spark: [1, 2, 3, 4, 5, 6], color: BLUE }
            ],
            columns: [
              { title: "Submitted", cards: [{ title: "WO-18-D damper", meta: "Blocked", tip: "Location unconfirmed." }] },
              { title: "Technical", cards: [{ title: "WO-104-A steel", meta: "6 days", tip: "Needs a reliability approver." }, { title: "WO-104-B cotter", meta: "6 days", tip: "Same decision." }] },
              { title: "Safety", cards: [{ title: "PTW-220-18", meta: "Not started", tip: "Permit follows technical release." }] },
              { title: "Released", cards: [{ title: "WO-19-V", meta: "ROW", tip: "Already released." }] },
              { title: "Rejected", cards: [{ title: "None", meta: "This week", tip: "No rejection on this package." }] }
            ]
          });
        }),
        tab("Path", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "T-104 package · step reached", items: [
              { label: "Request", pct: 100, value: "Done", color: TEAL, tip: "Day 2" },
              { label: "Technical", pct: 55, value: "Now", color: AMBER, tip: "Sitting with the approver" },
              { label: "Permit", pct: 15, value: "Wait", color: "#cbd5e1", tip: "PTW-220-18 not started" },
              { label: "Dispatch", pct: 0, value: "—", color: "#cbd5e1", tip: "No crew assigned" }
            ] },
            side: { kicker: "PATH", text: "A work request exists. Technical approval, permit, and crew assignment are still ahead of the visit.", gauge: { value: 40, label: "Path", tip: "Request done. Approval not done." } },
            columns: ["Step", "Record", "Age", "State"],
            rows: [
              row(["Technical", "WO-104-A", "6 d", tag("Now", "a")], "Steel", kv),
              row(["Technical", "WO-104-B", "6 d", tag("Now", "a")], "Cotter", kv),
              row(["Hold", "WO-18-D", "—", tag("Block", "r")], "Damper", kv)
            ]
          });
        }),
        tab("Decisions", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Decisions this month on Corridor North", labels: ["Release", "Return", "Hold", "Reject"], series: [{ name: "Count", color: BLUE, values: [4, 1, 1, 0] }] },
            side: { type: "donut", title: "This package", parts: [
              { name: "In approval", value: 2, color: AMBER, tip: "Steel and cotter" },
              { name: "Released", value: 1, color: GREEN, tip: "ROW" },
              { name: "Held", value: 1, color: RED, tip: "Damper" },
              { name: "Check", value: 1, color: TEAL, tip: "Foundation" }
            ] },
            columns: ["Decision", "Order", "By", "State"],
            rows: [
              row(["Pending", "WO-104-A", "Reliability", tag("Open", "a")], "Not decided", kv),
              row(["Released", "WO-19-V", "Vegetation", tag("Done", "g")], "ROW", kv),
              row(["Held", "WO-18-D", "Inspection", tag("Hold", "r")], "Location", kv)
            ]
          });
        })
      ]),
      screen("field", "Field Execution", "field", [
        tab("Visit", function () {
          return gantt({
            title: "Planned execution · not started",
            ticks: ["06", "08", "10", "12", "14", "16", "18", "20"],
            kpis: [
              { l: "On site", v: "0", s: "Crews", tip: "No crew has mobilized.", spark: [0, 0, 0, 0, 0, 0], color: RED },
              { l: "Tasks planned", v: "5", s: "One visit", tip: "The plan is set. Execution has not started.", spark: [5, 5, 5, 5, 5, 5] },
              { l: "Evidence due", v: "5", s: "Before / after", tip: "Each task needs a close-out image.", spark: [0, 0, 0, 0, 0, 5], color: AMBER },
              { l: "Closed", v: "0", s: "This package", tip: "Nothing is closed.", spark: [0, 0, 0, 0, 0, 0], color: TEAL }
            ],
            lanes: [
              { name: "Mobilize", bars: [{ left: 8, width: 10, color: "#334155", label: "Plan", tip: "Not started" }] },
              { name: "T-104", bars: [{ left: 20, width: 36, color: PURPLE, label: "Plan", tip: "Steel and cotter, if released" }] },
              { name: "N-18", bars: [{ left: 56, width: 12, color: AMBER, label: "Hold", tip: "Only after confirm" }] },
              { name: "Close-out", bars: [{ left: 74, width: 12, color: TEAL, label: "Plan", tip: "After images still empty" }] }
            ],
            sideTitle: "Execution",
            bars: [
              { label: "Started", pct: 0, value: "0", color: RED, tip: "No field start" },
              { label: "Planned", pct: 100, value: "5", color: BLUE, tip: "Five tasks on the sheet" }
            ]
          });
        }),
        tab("Evidence", function () {
          return phone({
            task: "T-104 · not released",
            beforeTip: "Before image from inspection 6 is on the finding. It is not a repair photo.",
            afterTip: "After image is empty until the crew closes the order.",
            checks: [
              { label: "Technical release", state: "Open", tip: "WO-104-A and WO-104-B" },
              { label: "Permit PTW-220-18", state: "Open", tip: "Authorization not verified" },
              { label: "HV crew", state: "Open", tip: "HV-04 is free but not assigned" },
              { label: "After image", state: "Empty", tip: "Required at closure" }
            ],
            chart: { type: "bar", title: "Close-out evidence on hand", labels: ["Before", "Permit", "Crew", "After"], series: [{ name: "Ready", color: TEAL, values: [1, 0, 0, 0], tips: ["Inspection image exists", "Permit open", "Crew not assigned", "No repair photo"] }] },
            columns: ["Task", "Before", "After", "State"],
            rows: [
              row(["Steel", "Yes", "No", tag("Open", "a")], "Inspection photo only", kv),
              row(["Cotter", "Yes", "No", tag("Open", "a")], "Inspection photo only", kv),
              row(["ROW", "Yes", "No", tag("Ready", "b")], "Released, not executed", kv)
            ]
          });
        }),
        tab("Closure", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Closure checklist", items: [
              { label: "Work done", pct: 0, value: "0/5", color: RED, tip: "Visit not started" },
              { label: "After image", pct: 0, value: "0/5", color: RED, tip: "None" },
              { label: "CMMS close", pct: 0, value: "0/5", color: AMBER, tip: "Staged orders stay open" },
              { label: "Confirmed", pct: 40, value: "2/5", color: TEAL, tip: "Only the two structural findings are confirmed" }
            ] },
            side: { kicker: "CLOCK", text: "Time from defect confirmation to repair is 11 days and still running. Closure has not started.", gauge: { value: 11, label: "Days", tip: "Open clock from confirmation." } },
            columns: ["Order", "Field", "Image", "State"],
            rows: [
              row(["WO-104-A", "Not started", "Before only", tag("Open", "r")], "Steel", kv),
              row(["WO-19-V", "Not started", "Before only", tag("Released", "a")], "ROW", kv)
            ]
          });
        })
      ])
    ];
  }

  function grid() {
    var k = [
      { l: "Loading now", v: "78%", s: "Of rating · historian", tip: "SCADA / historian sample. Not derived from inspection images.", spark: [62, 70, 92, 74, 80, 78], color: BLUE },
      { l: "Voltage", v: "219.4", s: "kV at SS-North", tip: "EMS voltage on the 220 kV bus.", spark: [220, 219.8, 218.6, 219.2, 219.6, 219.4], color: TEAL },
      { l: "Outages YTD", v: "2", s: "22 min · 38 min", tip: "19 Jan and 02 Feb. Neither is attributed to T-104.", spark: [0, 1, 1, 2, 2, 2], color: AMBER },
      { l: "Linked findings", v: "1", s: "T-104 beside March", tip: "High-priority findings sit next to the 12 Mar thermal window.", spark: [0, 0, 1, 1, 1, 1], color: RED }
    ];
    return [
      drawingScreen([
        { tab: "Operating", src: "/pids/nx-grd-sld-0220-corridor-north.svg", kicker: "SS-North · operating record", note: "Loading and voltage are from the historian and the EMS." },
        { tab: "GIS yard", src: "/pids/nx-grd-sld-0400-gis.svg", kicker: "SS-North · 220 kV", note: "Loading is 78% of rating." },
        { tab: "Distribution", src: "/pids/nx-grd-sld-0132-distribution.svg", kicker: "SS-North yard", note: "219.4 kV at SS-North." },
        { tab: "Corridor bus", src: "/pids/nx-grd-sld-0330-corridor.svg", kicker: "Corridor bus", note: "12 March reached 92% of rating for 46 min. The line stayed in service." },
        { tab: "Outages", src: "/pids/nx-grd-sld-0110-yard.svg", kicker: "Outage record", note: "19 January, 22 min, and 02 February, 38 min. Neither is attributed to T-104." }
      ]),
      screen("overview", "Grid Overview", "grid", [
        tab("Production", function () {
          return prodBoard({
            title: "Operating record",
            lede: "Loading and outages from the historian and EMS. Not read from an image, and not a cause.",
            kpis: [
              { k: "Loading now", v: "78%", tip: "Percent of rating." },
              { k: "12 Mar peak", v: "92%", tip: "46 minutes. The line stayed in service." },
              { k: "Outages", v: "2", tip: "19 Jan, 22 min. 02 Feb, 38 min. Neither is T-104." },
              { k: "June loss index", v: "1.8", tip: "EMS. March was 2.1. Not a percent." }
            ],
            bars: { title: "Loading, percent of rating", unit: "Two recorded samples.", labels: ["12 Mar", "Now"], values: [92, 78], max: 100 },
            lines: { title: "Loading samples", unit: "Not a 12-week series. Only the two recorded points.", max: 100, labels: ["12 Mar", "Now"], series: [
              { name: "Loading", color: "#3b6fd8", values: [92, 78] }
            ] },
            stack: { title: "Recorded minutes", unit: "Outage minutes and the 12 Mar thermal sample.", labels: ["19 Jan", "02 Feb", "12 Mar", "Now"], series: [
              { name: "Outage minutes", color: "#d14343", values: [22, 38, 0, 0] },
              { name: "Thermal minutes", color: "#e07a3a", values: [0, 0, 46, 0] }
            ] },
            rank: { title: "Events by minutes", unit: "12 Mar stayed in service.", rows: [
              { name: "12 Mar", value: 46 }, { name: "02 Feb", value: 38 }, { name: "19 Jan", value: 22 }
            ] }
          });
        }),
        tab("Sourcing", function () {
          return sourceBoard({
            cards: [
              { k: "Loading now", v: "78%", s: "Of rating", spark: [92, 78], tip: "Historian. Not read from an image." },
              { k: "12 Mar peak", v: "92%", s: "46 min, in service", spark: [92, 92], tip: "The line stayed in service. Not an outage." },
              { k: "Outages YTD", v: "2", s: "Neither is T-104", spark: [1, 2], tip: "19 Jan, 22 min. 02 Feb, 38 min." },
              { k: "Voltage", v: "219.4", s: "kV at SS-North", spark: [219.4, 219.4], tip: "EMS voltage. Not an image measurement." },
              { k: "June loss index", v: "1.8", s: "March was 2.1", spark: [2.1, 1.8], tip: "EMS loss index. Not a percent and not from images." }
            ],
            side: { title: "Beside the findings", rows: [{ k: "19 Jan", v: "22 min" }, { k: "02 Feb", v: "38 min" }, { k: "12 Mar", v: "In service" }], foot: "These events sit beside the findings. They are not a cause." },
            chartTitle: "Operating record",
            labels: ["19 Jan", "02 Feb", "12 Mar", "Now"],
            bars: [
              { name: "Outage minutes", color: "#6b5bd2", values: [22, 38, 0, 0] },
              { name: "Thermal minutes", color: "#3d9a78", values: [0, 0, 46, 0] }
            ],
            line: { name: "Loading, % of rating", color: "#14b8a6", values: [null, null, 92, 78] },
            leftMax: 50, rightMax: 100,
            band: "Minutes on the left. Loading on the right.",
            split: "Two outages. 12 Mar stayed in service."
          });
        }),
        tab("Overview", function () {
          return optBoard({
            recent: "Most recent operating picture",
            map: "line",
            placeTitle: "220 kV line north of Baku",
            cards: [
              { k: "Loading now", v: "78%", delta: "Of rating", tone: "flat", spark: [92, 78], caption: "Historian", tip: "Percent of rating. Not from images." },
              { k: "12 Mar", v: "92%", delta: "46 min, in service", tone: "flat", spark: [92, 92], caption: "Not an outage", tip: "The line stayed in service." },
              { k: "Outages", v: "2", delta: "Not T-104", tone: "flat", spark: [0, 1, 2], caption: "22 min and 38 min", tip: "19 Jan and 02 Feb. Neither is attributed to T-104." },
              { k: "Loss index", v: "1.8", delta: "June, from EMS", tone: "flat", spark: [2.1, 1.8], caption: "March was 2.1", tip: "Not derived from inspection images." }
            ],
            facts: [
              { k: "Current status", v: "In service", dot: true },
              { k: "Source", v: "Historian and EMS" },
              { k: "Voltage", v: "219.4 kV" },
              { k: "Loading", v: "78%" },
              { k: "Loss index", v: "1.8" },
              { k: "T-104 cause", v: "Not claimed" }
            ],
            rows: [
              { name: "Loading", unit: "% of rating", recorded: "92 on 12 Mar", current: "78", change: "Decrease 14", tone: "down", note: "Loading is 78% of rating now. The 12 Mar sample was 92%." },
              { name: "12 Mar", unit: "Sample", recorded: "46 min", current: "In service", change: "Not an outage", tone: "flat", note: "The line reached 92% of rating for 46 minutes and stayed in service." },
              { name: "19 Jan", unit: "Outage", recorded: "22 min", current: "Not T-104", change: "No cause", tone: "flat", note: "The 19 Jan outage is not attributed to T-104." },
              { name: "02 Feb", unit: "Outage", recorded: "38 min", current: "Not T-104", change: "No cause", tone: "flat", note: "The 02 Feb outage is not attributed to T-104." },
              { name: "Loss index", unit: "EMS", recorded: "2.1 March", current: "1.8 June", change: "From EMS", tone: "flat", note: "Both loss figures come from EMS, not from inspection images." }
            ],
            slides: [
              "High-priority findings on the 220 kV corridor sit alongside its recent operational events.",
              "Loading is 78% of rating now. On 12 Mar it reached 92% for 46 minutes and stayed in service.",
              "Outages were 22 minutes on 19 Jan and 38 minutes on 02 Feb. Neither is attributed to T-104.",
              "The June loss index is 1.8, from EMS. March was 2.1. These figures do not come from images."
            ],
            chartTitle: "Loading, percent of rating",
            chart: { max: 100, labels: ["12 Mar", "Now"], series: [
              { name: "Loading", color: "#2563eb", values: [92, 78] }
            ] }
          });
        }),
        tab("Matrix", function () {
          return matrixBoard({
            title: "Operating Collection Matrix",
            date: "Now",
            operation: "220 kV Corridor North",
            heading: "Operating hierarchy",
            chip: "220 kV",
            conflict: { k: "Schedule conflicts", v: "0 conflicts", tip: "Neither outage is attributed to T-104." },
            metrics: [
              { k: "Signals", v: "6", tip: "Two outages, the 12 Mar sample, loading, voltage, and the loss index." },
              { k: "Outages", v: "2", tip: "19 Jan, 22 min. 02 Feb, 38 min." },
              { k: "Attributed", v: "0", tip: "Neither outage is attributed to T-104." },
              { k: "Loading now", v: "78%", tip: "Percent of rating from the historian." },
              { k: "12 Mar", v: "92%", tip: "46 minutes. The line stayed in service." },
              { k: "Loss index", v: "1.8", tip: "June, from EMS. March was 2.1. Not from images." }
            ],
            score: { value: 78, label: "Loading", tip: "Percent of rating now, from the historian. Not from images." },
            focus: "line",
            nodes: [
              { id: "line", kind: "rollup", name: "220 kV", mark: "78%", status: "agency", x: 50, y: 16, tag: "220 kV", description: "High-priority findings on the 220 kV corridor sit alongside its recent operational events.", source: "Loading 78% of rating. Voltage 219.4 kV at SS-North.", basic: [["Loading", "78%"], ["Voltage", "219.4 kV"], ["Cause", "Not claimed"]] },
              { id: "bus", kind: "parent", name: "SS-North", status: "parent", x: 50, y: 48, tag: "220 kV", description: "The substation reading is the operating context for the corridor.", source: "EMS and the historian. Not inspection images.", basic: [["Voltage", "219.4 kV"], ["In service", "Yes"], ["T-104", "Not a cause"]] },
              { id: "mar", kind: "leaf", name: "12 Mar", mark: "92%", status: "collected", x: 28, y: 80, tag: "220 kV", description: "Loading reached 92% of rating for 46 minutes. The line stayed in service. This was not an outage.", source: "Historian.", basic: [["Loading", "92%"], ["Duration", "46 min"], ["Outage", "No"]] },
              { id: "t104", kind: "leaf", name: "T-104", mark: "No cause", status: "scheduled", x: 72, y: 80, tag: "220 kV", description: "The findings sit beside the operating events. Neither outage is attributed to T-104.", source: "19 Jan was 22 min. 02 Feb was 38 min.", basic: [["19 Jan", "22 min"], ["02 Feb", "38 min"], ["Attributed", "No"]] }
            ],
            edges: [["line", "bus"], ["bus", "mar"], ["bus", "t104"]]
          });
        }),
        tab("Forecast", function () {
          return planBoard({
            next: "Loading and outage figures come from the historian and EMS.",
            start: "19 Jan",
            end: "Now",
            chart: {
              title: "Loading, percent of rating",
              max: 100,
              labels: ["12 Mar", "Now"],
              stacks: [{ name: "Loading", color: "#6b5bd2", values: [92, 78] }],
              lines: [{ name: "Rating", color: "#98a2b3", dash: true, values: [100, 100] }]
            },
            quiet: ["Corridor=Corridor North", "Voltage=220 kV", "Source=Historian", "Window=This visit"],
            views: [
              {
                when: "", badge: "In service", hero: { v: "78%", k: "Loading now" }, leftTitle: "Loading now", rightTitle: "12 Mar sample",
                left: [{ k: "Loading", v: "78%", note: "of rating" }, { k: "Voltage", v: "219.4 kV" }, { k: "Loss index", v: "1.8", note: "June, EMS" }],
                right: [{ k: "Loading", v: "92%", note: "of rating" }, { k: "Duration", v: "46 min" }, { k: "Outage", v: "No" }],
                bandTitle: "Recent events", bandNote: "These sit beside the findings. They are not a cause.",
                band: [{ k: "19 Jan", v: "22 min", pill: "Outage" }, { k: "02 Feb", v: "38 min", pill: "Outage" }, { k: "12 Mar", v: "In service", pill: "Not an outage" }],
                summary: "High-priority findings on the 220 kV corridor sit alongside its recent operational events.",
                more: "Neither outage is attributed to T-104. On 12 Mar the line reached 92% of rating for 46 minutes and stayed in service. The June loss index is 1.8, against 2.1 in March. Both loss figures come from EMS, not from inspection images.",
                ring: 78, ringLabel: "Loading", ringTip: "Percent of rating from the historian. Not from images."
              },
              {
                when: "Source=EMS", badge: "EMS", leftTitle: "Technical loss index", rightTitle: "Not from images",
                left: [{ k: "June", v: "1.8" }, { k: "March", v: "2.1" }, { k: "Source", v: "EMS" }],
                right: [{ k: "Loading now", v: "78%" }, { k: "12 Mar", v: "92%" }, { k: "From images", v: "No" }],
                bandTitle: "Loss index", bandNote: "EMS figures. Not derived from inspection photos.",
                band: [{ k: "June", v: "1.8", pill: "EMS" }, { k: "March", v: "2.1", pill: "EMS" }, { k: "From images", v: "No", pill: "Separate" }],
                summary: "The technical loss index is 1.8 in June and 2.1 in March. Both come from EMS.",
                more: "Inspection images do not produce the loss index, the loading, or the outage minutes.",
                ring: "1.8", ringSpan: 18, ringUnit: "", ringLabel: "June loss index", ringTip: "June loss index 1.8 from EMS, against 2.1 in March. The arc is only a drawing scale. It is not a percent and not a confidence score."
              }
            ]
          });
        }),
        tab("Issues", function () {
          return issueBoard({
            heading: "Operating picture",
            updated: "Historian and EMS",
            note: "Each row is one signal. The strong cells are the recorded values. They are not a cause chain.",
            cols: ["19 Jan", "02 Feb", "12 Mar", "Now", "Loss", "T-104"],
            cards: [
              { name: "12 Mar peak", score: "92", lines: [["Of rating", "92%"], ["Duration", "46 min"], ["Outage", "No"]], detail: "On 12 Mar the line reached 92% of rating for 46 minutes and stayed in service." },
              { name: "Loading now", score: "78", lines: [["Of rating", "78%"], ["Source", "Historian"], ["From images", "No"]], detail: "Current loading is 78% of rating. Inspection images did not calculate it." },
              { name: "T-104 priority", score: "69", lines: [["Role", "Context"], ["Cause", "No"], ["Source", "Reliability"]], detail: "Priority 0.69 sits beside the operating events. It is not an attributed cause." },
              { name: "02 Feb outage", score: "38", lines: [["Minutes", "38"], ["Finding link", "None"], ["Source", "Outage log"]], detail: "The 02 Feb outage was 38 minutes and is not linked to the structural findings." },
              { name: "19 Jan outage", score: "22", lines: [["Minutes", "22"], ["Finding link", "None"], ["Source", "Outage log"]], detail: "The 19 Jan outage was 22 minutes and is not attributed to T-104." }
            ],
            groups: [
              { name: "Signals", rows: [
                { name: "Loading", values: [null, null, 92, 78, null, null], notes: ["Not this signal", "Not this signal", "92% for 46 min", "78% of rating now", "Not a loading figure", "Not a loading figure"] },
                { name: "Outages", values: [22, 38, null, null, null, null], notes: ["22 min, unlinked", "38 min, unlinked", "12 Mar was not an outage", "No outage now", "Not an outage", "Not an outage"] },
                { name: "Context", values: [null, null, null, null, 18, 69], notes: ["Not this signal", "Not this signal", "Not this signal", "Not this signal", "June loss index 1.8, shown ×10", "Priority 0.69, not a cause"] }
              ] }
            ],
            trendTitle: "Loading, percent of rating. Outage minutes stay in the heatmap.",
            trend: { labels: ["12 Mar", "Now"], values: [92, 78], max: 100 }
          });
        }),
        tab("Entities", function () {
          return entityBoard({
            focus: "line",
            types: ENT_TYPES,
            nodes: [
              { id: "ss", type: "line", name: "SS-North", short: "SS", x: 50, y: 20, summary: "Source bus. 219.4 kV.", status: "IN BAND", tone: "b", props: [["Voltage", "219.4 kV"], ["Source", "EMS"]], sourceTitle: "EMS", source: "Bus measurement. Not read from an image.", recorded: "Now", updated: "In band" },
              { id: "t104", type: "tower", name: "T-104", short: "T104", x: 68, y: 26, summary: "Priority 0.69, shown beside the events. Not a cause.", status: "CONTEXT", tone: "a", props: [["Priority", "0.69"], ["Link", "Not an outage cause"]], sourceTitle: "Reliability file", source: "Physical findings. They do not explain the outages.", recorded: "Inspection 6", updated: "Open" },
              { id: "line", type: "line", name: "220 kV", short: "220", x: 42, y: 48, summary: "Historian loading is 78% of rating.", status: "IN SERVICE", tone: "g", props: [["Loading", "78%"], ["Peak", "92% on 12 Mar"], ["Loss index", "1.8 June"]], sourceTitle: "Historian", source: "Operating point. Images do not calculate loading or losses.", recorded: "Now", updated: "In service" },
              { id: "jan", type: "finding", name: "19 Jan", short: "JAN", x: 24, y: 70, summary: "22 minute outage. Not attributed to T-104.", status: "UNLINKED", tone: "a", props: [["Duration", "22 min"], ["Finding link", "None"]], sourceTitle: "Outage log", source: "Same corridor. No confirmed defect link.", recorded: "19 Jan", updated: "Closed outage" },
              { id: "feb", type: "finding", name: "02 Feb", short: "FEB", x: 48, y: 74, summary: "38 minute outage. No confirmed finding link.", status: "UNLINKED", tone: "a", props: [["Duration", "38 min"], ["Finding link", "None"]], sourceTitle: "Outage log", source: "Second outage. Not attributed to the structural findings.", recorded: "02 Feb", updated: "Closed outage" },
              { id: "mar", type: "report", name: "12 Mar", short: "MAR", x: 74, y: 66, summary: "92% of rating for 46 minutes. The line stayed in service.", status: "THERMAL", tone: "a", props: [["Loading", "92%"], ["Duration", "46 min"], ["Outage", "No"]], sourceTitle: "Historian", source: "A thermal window, not an outage.", recorded: "12 Mar", updated: "In service" }
            ],
            edges: [["ss", "line", "feeds"], ["line", "t104", "context"], ["line", "mar", "thermal"], ["line", "jan", "unlinked"], ["line", "feb", "unlinked"], ["jan", "feb", "same log"]]
          });
        }),
        tab("Recommendations", function () {
          return recommendBoard({
            costTitle: "Operating point",
            costMax: 100,
            cost: [
              { label: "Loading 78%", value: 78, color: "#3d9a78", tip: "Historian loading now. Below the March peak." },
              { label: "Outages", value: -60, color: "#e07a3d", tip: "60 minutes YTD. Neither outage is attributed to T-104." }
            ],
            levelTitle: "Corridor signals",
            levelLabels: ["Load", "March", "Jan", "Feb", "Loss", "T-104"],
            levelValues: [78, 92, 22, 38, 18, 69],
            levelTip: "Loading and the March peak are percent of rating. Outages are minutes. Loss index is shown times 10. Priority is 0.69.",
            groups: recGroups(["Line", "T-104", "SS-North"], ["In service", "Thermal", "Unlinked"]),
            rows: [
              { item: "220 kV", meta: "Loading", place: "SS-North", placeMeta: "Corridor North", text: "Show the historian point beside the findings. Images did not calculate it.", impact: "78% of rating", level: "In band", check: "Historian", date: "Now", keys: "Corridor North Line In service" },
              { item: "SS-North", meta: "Voltage", place: "SS-North", placeMeta: "EMS", text: "Bus voltage is in band.", impact: "219.4 kV", level: "In band", check: "EMS", date: "Now", keys: "Corridor North SS-North In service" },
              { item: "12 Mar", meta: "Thermal", place: "Corridor North", placeMeta: "Same line", text: "46 minutes at 92% of rating. The line stayed in service.", impact: "92%", level: "Thermal", check: "Historian", date: "12 Mar", keys: "Corridor North Line Thermal" },
              { item: "19 Jan", meta: "Outage", place: "Corridor North", placeMeta: "22 min", text: "Do not attribute this outage to T-104.", impact: "22 min", level: "Unlinked", check: "No finding", date: "19 Jan", keys: "Corridor North Line Unlinked" },
              { item: "02 Feb", meta: "Outage", place: "Corridor North", placeMeta: "38 min", text: "Second outage. No confirmed finding link.", impact: "38 min", level: "Unlinked", check: "No finding", date: "02 Feb", keys: "Corridor North Line Unlinked" },
              { item: "T-104", meta: "Context", place: "Corridor North", placeMeta: "Priority 0.69", text: "Keep the physical priority next to the events. It is not a cause.", impact: "0.69", level: "Review", check: "Not electrical", date: "Insp 6", keys: "Corridor North T-104 In service" }
            ]
          });
        }),
        tab("Blackboard", function () {
          return blackboard({
            focus: ["line", "t104"],
            nodes: [
              { id: "ems", name: "EMS", short: "EMS", x: 14, y: 26, color: TEAL, tip: "Bus voltage and the loss index come from EMS." },
              { id: "ss", name: "SS-North", short: "SS", x: 30, y: 34, color: BLUE, tip: "219.4 kV on the source bus." },
              { id: "line", name: "220 kV", short: "220", x: 22, y: 54, color: TEAL, tip: "Historian loading is 78% of rating." },
              { id: "jan", name: "19 Jan", short: "JAN", x: 16, y: 76, color: PURPLE, tip: "22 minute outage. Not attributed to T-104." },
              { id: "feb", name: "02 Feb", short: "FEB", x: 38, y: 74, color: "#334155", tip: "38 minute outage. No confirmed finding link." },
              { id: "t104", name: "T-104", short: "T104", x: 68, y: 28, color: "#9f1239", tip: "Priority 0.69. Shown for context, not as a cause." },
              { id: "mar", name: "12 Mar", short: "MAR", x: 82, y: 46, color: AMBER, tip: "92% of rating for 46 minutes. The line stayed in service." },
              { id: "loss", name: "Loss index", short: "1.8", x: 64, y: 62, color: GREEN, tip: "June index 1.8 from EMS. Images do not calculate losses." }
            ],
            extra: { id: "hist", name: "Historian", short: "HST", x: 50, y: 14, color: "#64748b", tip: "Loading samples. Not an inspection result." },
            edges: [["ems", "ss", true], ["ss", "line", true], ["line", "jan"], ["jan", "feb", true], ["line", "t104", true], ["t104", "mar", true], ["t104", "loss"], ["hist", "ss"]],
            types: [
              { icon: "link", title: "Same corridor", kicker: "LINE", value: "220 kV", sub: "SS-North", body: "The findings sit on the corridor that these operating events belong to." },
              { icon: "tower", title: "Thermal window", kicker: "12 MAR", value: "92%", sub: "46 minutes", body: "A loading peak. The line stayed in service, and it is not an outage." },
              { icon: "file", title: "Outages", kicker: "YTD", value: "60 min", sub: "No finding link", body: "19 Jan and 02 Feb are not attributed to T-104." },
              { icon: "user", title: "Context", kicker: "PRIORITY", value: "0.69", sub: "Not a cause", body: "The physical priority is shown beside the events. It does not explain them." }
            ]
          });
        }),
        tab("Schedule", function () {
          return scheduleBoard({
            title: "Main Schedule",
            day: "Reference day · historian and EMS",
            lanes: [
              { name: "SS-North", bars: [
                { left: 25, width: 50, fill: "#c9efef", ink: "#3aabb0", id: "0219", label: "219.4 kV", tip: "EMS bus voltage. In band. Not read from an image." }
              ] },
              { name: "220 kV line", bars: [
                { left: 58.3, width: 12, fill: "#d9f2c8", ink: "#3f8f62", id: "0078", label: "78% rating", tip: "Current historian loading. Below the March peak." }
              ] },
              { name: "12 Mar thermal", bars: [
                { left: 50, width: 8, fill: "#f8e0b0", ink: "#e09a3e", id: "0092", label: "46 min", flag: true, tip: "92% of rating for 46 minutes. The line stayed in service. Not an outage." }
              ] },
              { name: "19 Jan outage", bars: [
                { left: 37.5, width: 8, fill: "#f8d0e3", ink: "#d56b9a", id: "0022", label: "22 min", tip: "Outage on the corridor. Not attributed to T-104." }
              ] },
              { name: "02 Feb outage", bars: [
                { left: 45.8, width: 8, fill: "#ddd4f7", ink: "#6d5bd0", id: "0038", label: "38 min", tip: "Second outage. No confirmed link to the structural findings." }
              ] },
              { name: "EMS losses", bars: [
                { left: 33.3, width: 14, fill: "#e7f0c8", ink: "#6aaa4a", id: "0018", label: "Index 1.8", tip: "June technical loss index from EMS. Images do not calculate losses." }
              ] },
              { name: "T-104 context", bars: [
                { left: 54.2, width: 12, fill: "#f6d7bf", ink: "#d9893a", id: "0069", label: "Priority", flag: true, tip: "Physical priority 0.69, shown beside the operating events. Not a cause." }
              ] }
            ]
          });
        }),
        tab("Graph", function () {
          return mesh({
            listTitle: "Circuit",
            focusTitle: "220 kV",
            focus: "High-priority findings on the 220 kV corridor sit alongside its recent operational events.",
            list: [
              { title: "SS-North", meta: "219.4 kV", tip: "EMS bus voltage", body: "Source bus for Corridor North." },
              { title: "Line", meta: "78% of rating", tip: "Historian sample", body: "Not calculated from inspection images." },
              { title: "12 Mar", meta: "92% · 46 min", tip: "Thermal window", body: "Same corridor as T-104. The line stayed in service." },
              { title: "Outages", meta: "No finding link", tip: "19 Jan and 02 Feb", body: "Neither outage is attributed to T-104." }
            ],
            nodes: [
              { x: 150, y: 250, color: BLUE, short: "SS", title: "SS-North", tip: "219.4 kV", body: "EMS measurement on the bus." },
              { x: 340, y: 140, color: TEAL, short: "220", title: "Line", tip: "78% of rating", body: "Current historian operating point." },
              { x: 560, y: 190, color: "#9f1239", short: "T104", title: "T-104", tip: "Priority 0.69", body: "Physical findings shown for context, not as a calculated loss." },
              { x: 400, y: 370, color: RED, short: "MAR", title: "12 Mar", tip: "92% for 46 min", body: "Thermal window from the historian." },
              { x: 600, y: 360, color: AMBER, short: "OUT", title: "Outages", tip: "60 minutes YTD", body: "No confirmed defect link." }
            ],
            edges: [[0, 1, "feeds"], [1, 2, "asset"], [1, 3, "thermal"], [1, 4, "unlinked"]],
            columns: ["Signal", "Now", "Source", "State"],
            rows: [
              row(["Loading", "78%", "Historian", tag("Normal", "g")], "Below the March peak", kv),
              row(["Voltage", "219.4 kV", "EMS", tag("In band", "g")], "SS-North bus", kv),
              row(["T-104", "Priority 0.69", "Reliability", tag("Review", "r")], "Physical finding, shown for context", kv),
              row(["12 Mar", "92%", "Historian", tag("Thermal", "a")], "46 minutes, line stayed in service", kv)
            ]
          });
        }),
        tab("Corridor", function () {
          return pack({
            filters: ["Region", "Voltage"],
            kpis: k,
            chart: { type: "area", title: "Corridor North loading · percent of rating", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [
              { name: "Loading", color: BLUE, values: [61, 66, 92, 74, 78, 78], tips: ["January average", "February, includes the 38 min outage", "12 Mar peak 92% for 46 min", "April", "May", "Current 78%"] }
            ] },
            side: { kicker: "OUTPUT", text: "High-priority findings on the 220 kV corridor sit alongside its recent operational events.", gauge: { value: 78, label: "Loading", tip: "Historian. Inspection images are not an input." } },
            columns: ["Signal", "Now", "Source", "State"],
            rows: [
              row(["Loading", "78%", "Historian", tag("Normal", "g")], "Below the March peak", kv),
              row(["Voltage", "219.4 kV", "EMS", tag("In band", "g")], "SS-North bus", kv),
              row(["T-104", "Priority 0.69", "Reliability", tag("Review", "r")], "Physical finding, shown for context", kv),
              row(["Coastal load", "54%", "Historian", tag("Quiet", "b")], "Other corridor", "Coastal")
            ]
          });
        }),
        tab("Topology", function () {
          return mesh({
            listTitle: "Network",
            focusTitle: "220 kV",
            focus: "SS-North feeds Corridor North. T-104 is the high-priority physical finding on that circuit.",
            list: [
              { title: "SS-North", meta: "Substation", tip: "Bus voltage 219.4 kV", body: "EMS measurement." },
              { title: "Corridor North", meta: "220 kV", tip: "Loading 78%", body: "Historian." },
              { title: "T-104", meta: "Finding", tip: "Priority 0.69", body: "Not an electrical calculation." }
            ],
            nodes: [
              { x: 140, y: 260, color: BLUE, short: "SS", title: "SS-North", tip: "219.4 kV", body: "Source bus for this corridor." },
              { x: 360, y: 160, color: TEAL, short: "220", title: "Line", tip: "78% of rating", body: "Current operating point." },
              { x: 560, y: 240, color: "#9f1239", short: "T104", title: "T-104", tip: "Two verified findings", body: "Shown beside the line, not as a calculated loss." },
              { x: 400, y: 380, color: AMBER, short: "Mar", title: "12 Mar", tip: "92% for 46 min", body: "Thermal window from the historian." }
            ],
            edges: [[0, 1, "feeds"], [1, 2, "asset"], [1, 3, "event"]],
            columns: ["Node", "Measure", "Source", "State"],
            rows: [
              row(["SS-North", "219.4 kV", "EMS", tag("Live", "b")], "Bus", kv),
              row(["Line", "78%", "Historian", tag("Live", "g")], "Loading", kv),
              row(["12 Mar", "92%", "Historian", tag("Past", "a")], "Thermal", kv)
            ]
          });
        }),
        tab("Context", function () {
          return atlas({
            title: "Findings on the circuit",
            highlight: "T-104",
            focusTitle: "Context",
            focus: "High-priority findings on the 220 kV corridor sit alongside its recent operational events.",
            towers: [
              { name: "T-104", meta: "Priority 0.69", tip: "Physical findings", body: "Engineering review. Not a SCADA alarm." },
              { name: "12 Mar", meta: "92% · 46 min", tip: "Thermal window", body: "Historian event on the same corridor." },
              { name: "02 Feb", meta: "Outage 38 min", tip: "No finding link", body: "Not attributed to T-104." }
            ]
          });
        })
      ]),
      screen("performance", "Line Performance", "bolt", [
        tab("Loading", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "Percent of thermal rating", labels: ["00", "04", "08", "12", "16", "20"], series: [{ name: "Today", color: BLUE, values: [64, 61, 72, 78, 76, 70] }, { name: "12 Mar", color: RED, values: [70, 74, 84, 92, 88, 76] }] },
            side: { kicker: "RATING", text: "Today peaks at 78%. The 12 Mar trace peaked at 92% for 46 minutes.", gauge: { value: 78, label: "Now", tip: "Historian percent of rating." } },
            columns: ["Trace", "Peak", "Duration", "State"],
            rows: [
              row(["Today", "78%", "—", tag("Normal", "g")], "Current day", kv),
              row(["12 Mar", "92%", "46 min", tag("Thermal", "a")], "Same corridor as T-104", kv)
            ]
          });
        }),
        tab("Voltage", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "SS-North bus · kV", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [{ name: "kV", color: TEAL, values: [220.1, 219.4, 218.6, 219.2, 219.6, 219.4] }] },
            side: { type: "bars", title: "Band", items: [
              { label: "Now", pct: 88, value: "219.4", color: TEAL, tip: "Inside the operating band used by this desk" },
              { label: "March low", pct: 70, value: "218.6", color: AMBER, tip: "Lowest monthly average" }
            ] },
            columns: ["Month", "kV", "Band", "State"],
            rows: [
              row(["Jun", "219.4", "In band", tag("Normal", "g")], "Current", kv),
              row(["Mar", "218.6", "In band", tag("Low", "a")], "Same month as the thermal peak", kv)
            ]
          });
        }),
        tab("Current", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Current as percent of the monitored rating", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [{ name: "% rating", color: PURPLE, values: [61, 66, 92, 74, 78, 78] }] },
            side: { kicker: "SOURCE", text: "Current and rating come from the historian. The inspection image is not used to compute amperes or losses.", gauge: { value: 78, label: "Current", tip: "78% of the monitored rating." } },
            columns: ["Month", "% rating", "Source", "State"],
            rows: [
              row(["Mar", "92%", "Historian", tag("Peak", "a")], "Thermal window", kv),
              row(["Jun", "78%", "Historian", tag("Now", "g")], "Operating point", kv)
            ]
          });
        })
      ]),
      screen("outage", "Outage Analytics", "outage", [
        tab("Frequency", function () {
          return pack({
            kpis: [
              { l: "Events YTD", v: "2", s: "This corridor", tip: "Two outages. A thermal exceedance is counted separately.", spark: [0, 1, 1, 2, 2, 2], color: AMBER },
              { l: "Customers of record", v: "—", s: "Not in this feed", tip: "This cut has duration and asset context, not a customer count.", spark: [0, 0, 0, 0, 0, 0] },
              { l: "Linked to T-104", v: "0", s: "No attribution", tip: "Neither outage is tied to the verified findings.", spark: [0, 0, 0, 0, 0, 0], color: TEAL },
              { l: "Thermal events", v: "1", s: "12 Mar", tip: "Not an outage. Shown because it shares the corridor.", spark: [0, 0, 1, 1, 1, 1], color: RED }
            ],
            chart: { type: "bar", title: "Outages by month", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [{ name: "Outages", color: AMBER, values: [1, 1, 0, 0, 0, 0] }] },
            side: { type: "donut", title: "Link to findings", parts: [
              { name: "Unlinked", value: 2, color: "#93c5fd", tip: "19 Jan and 02 Feb" },
              { name: "Linked", value: 0, color: RED, tip: "None attributed to T-104" }
            ] },
            columns: ["Date", "Minutes", "Finding link", "State"],
            rows: [
              row(["19 Jan", "22", "None", tag("Outage", "a")], "Momentary, restored", kv),
              row(["02 Feb", "38", "None", tag("Outage", "a")], "No confirmed defect link", kv),
              row(["12 Mar", "46", "T-104 nearby", tag("Thermal", "r")], "Loading event, not an outage", kv)
            ]
          });
        }),
        tab("Duration", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Minutes", labels: ["19 Jan", "02 Feb", "12 Mar thermal"], series: [{ name: "Minutes", color: RED, values: [22, 38, 46], tips: ["Outage 22 min", "Outage 38 min", "Thermal window 46 min, line stayed in service"] }] },
            side: { kicker: "DURATION", text: "The two outages total 60 minutes. The March thermal window is longer and is not an outage.", gauge: { value: 60, label: "Min", tip: "22 + 38 minutes of outage." } },
            columns: ["Event", "Minutes", "In service", "State"],
            rows: [
              row(["19 Jan", "22", "No", tag("Outage", "a")], "Restored", kv),
              row(["02 Feb", "38", "No", tag("Outage", "a")], "Restored", kv),
              row(["12 Mar", "46", "Yes", tag("Thermal", "b")], "Loading only", kv)
            ]
          });
        }),
        tab("Assets", function () {
          return atlas({
            title: "Events",
            highlight: "T-104",
            focusTitle: "No outage link",
            focus: "T-104 is the high-priority physical finding. The two outages are not attributed to it.",
            towers: [
              { name: "19 Jan", meta: "22 min", tip: "Outage", body: "No finding link." },
              { name: "02 Feb", meta: "38 min", tip: "Outage", body: "No finding link." },
              { name: "T-104", meta: "Review", tip: "Physical", body: "Correlated in time with March loading, not with the outages." }
            ]
          });
        })
      ]),
      screen("loss", "Loss Analysis", "loss", [
        tab("Technical", function () {
          return pack({
            kpis: [
              { l: "Technical loss index", v: "1.8", s: "EMS study · June", tip: "Index from the EMS study. Not computed from drone images.", spark: [1.6, 1.7, 2.1, 1.9, 1.8, 1.8], color: PURPLE },
              { l: "March index", v: "2.1", s: "Thermal month", tip: "Highest index in the half year, same month as 92% loading.", spark: [1.6, 1.7, 2.1, 2.1, 2.1, 2.1], color: RED },
              { l: "Image input", v: "None", s: "By design", tip: "CV imagery cannot calculate electrical losses.", spark: [0, 0, 0, 0, 0, 0] },
              { l: "Constraint hours", v: "46", s: "12 Mar", tip: "Minutes above 90% of rating.", spark: [0, 0, 46, 46, 46, 46], color: AMBER }
            ],
            chart: { type: "area", title: "Technical loss index · EMS / historian", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [{ name: "Index", color: PURPLE, values: [1.6, 1.7, 2.1, 1.9, 1.8, 1.8] }] },
            side: { kicker: "SOURCE", text: "Losses and loading come from SCADA, EMS, and the historian. Inspection images are not an input to this chart.", gauge: { value: 18, label: "Index", tip: "Displayed as 1.8. Gauge uses 18 so the ring matches the index × 10." } },
            columns: ["Month", "Index", "Source", "State"],
            rows: [
              row(["Mar", "2.1", "EMS", tag("High", "a")], "Thermal month", kv),
              row(["Jun", "1.8", "EMS", tag("Now", "g")], "Current study point", kv)
            ]
          });
        }),
        tab("Trend", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Loss index beside loading", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [
              { name: "Loss index × 10", color: PURPLE, values: [16, 17, 21, 19, 18, 18] },
              { name: "Loading %", color: BLUE, values: [61, 66, 92, 74, 78, 78] }
            ] },
            side: { type: "bars", title: "March", items: [
              { label: "Loading", pct: 92, value: "92%", color: BLUE, tip: "Historian" },
              { label: "Loss index", pct: 70, value: "2.1", color: PURPLE, tip: "EMS study" }
            ] },
            columns: ["Series", "March", "June", "Source"],
            rows: [
              row(["Loading", "92%", "78%", tag("Historian", "b")], "Not from images", kv),
              row(["Loss index", "2.1", "1.8", tag("EMS", "b")], "Not from images", kv)
            ]
          });
        }),
        tab("Constraints", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Minutes above 90% of rating", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [{ name: "Minutes", color: RED, values: [0, 0, 46, 0, 0, 0] }] },
            side: { kicker: "CONSTRAINT", text: "The only constraint window in this half year is 46 minutes on 12 Mar, on the same corridor as T-104.", gauge: { value: 46, label: "Min", tip: "Above 90% of rating." } },
            columns: ["Window", "Minutes", "Asset context", "State"],
            rows: [
              row(["12 Mar", "46", "T-104 on corridor", tag("Open", "a")], "Correlation, not a cause claim", kv)
            ]
          });
        })
      ]),
      screen("events", "Grid Events", "event", [
        tab("Timeline", function () {
          return gantt({
            title: "Operational events beside the finding",
            ticks: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "", ""],
            kpis: k,
            lanes: [
              { name: "Outages", bars: [{ left: 6, width: 8, color: AMBER, label: "22m", tip: "19 Jan · 22 min · no finding link" }, { left: 18, width: 8, color: AMBER, label: "38m", tip: "02 Feb · 38 min · no finding link" }] },
              { name: "Thermal", bars: [{ left: 32, width: 10, color: RED, label: "92%", tip: "12 Mar · 92% of rating · 46 min" }] },
              { name: "T-104", bars: [{ left: 48, width: 40, color: PURPLE, label: "Review", tip: "Verified findings open from inspection 5 onward" }] }
            ],
            sideTitle: "What is linked",
            bars: [
              { label: "Outage link", pct: 0, value: "None", color: TEAL, tip: "No outage attributed to T-104" },
              { label: "Thermal context", pct: 80, value: "12 Mar", color: RED, tip: "Same corridor, same season" }
            ]
          });
        }),
        tab("Correlation", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Events and open findings", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [
              { name: "Events", color: RED, values: [1, 1, 1, 0, 0, 0] },
              { name: "Open findings", color: AMBER, values: [6, 7, 8, 9, 11, 12] }
            ] },
            side: { kicker: "READ", text: "High-priority findings on the 220 kV corridor sit alongside its recent operational events. The chart does not claim the findings caused the outages.", gauge: { value: 92, label: "Mar", tip: "Peak loading in the thermal window." } },
            columns: ["Event", "Finding", "Claim", "State"],
            rows: [
              row(["12 Mar thermal", "T-104 on corridor", "Context", tag("Shown", "a")], "Same corridor", kv),
              row(["02 Feb outage", "None", "No link", tag("Clear", "g")], "Not attributed", kv),
              row(["19 Jan outage", "None", "No link", tag("Clear", "g")], "Not attributed", kv)
            ]
          });
        }),
        tab("List", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Event minutes", labels: ["19 Jan", "02 Feb", "12 Mar"], series: [{ name: "Minutes", color: BLUE, values: [22, 38, 46] }] },
            side: { type: "donut", title: "Type", parts: [
              { name: "Outage", value: 2, color: AMBER, tip: "January and February" },
              { name: "Thermal", value: 1, color: RED, tip: "March" }
            ] },
            columns: ["When", "What", "Minutes", "State"],
            rows: [
              row(["19 Jan", "Outage", "22", tag("Restored", "g")], "No finding", kv),
              row(["02 Feb", "Outage", "38", tag("Restored", "g")], "No finding", kv),
              row(["12 Mar", "Thermal", "46", tag("Context", "a")], "T-104 corridor", kv)
            ]
          });
        })
      ]),
      screen("trends", "Reliability Trends", "trend", [
        tab("Quarter", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "Outage minutes and open findings", labels: ["Q1", "Q2", "Q3", "Q4", "Q1", "Q2"], series: [
              { name: "Outage min", color: RED, values: [40, 22, 18, 30, 60, 0] },
              { name: "Open findings", color: AMBER, values: [4, 5, 5, 6, 8, 12] }
            ] },
            side: { kicker: "TREND", text: "Findings rose through the latest inspections. Outage minutes did not rise with them in the current quarter.", gauge: { value: 12, label: "Open", tip: "12 open findings now." } },
            columns: ["Quarter", "Outage min", "Findings", "State"],
            rows: [
              row(["This Q", "0", "12", tag("Open", "a")], "Findings without a new outage", kv),
              row(["Prior Q", "60", "8", tag("Past", "b")], "Two outages", kv)
            ]
          });
        }),
        tab("Defect link", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Findings with an operational context", items: [
              { label: "T-104 steel", pct: 90, value: "12 Mar", color: RED, tip: "Same corridor as the thermal window" },
              { label: "T-104 cotter", pct: 90, value: "12 Mar", color: RED, tip: "Same package" },
              { label: "N-18 damper", pct: 30, value: "None", color: AMBER, tip: "No operational event linked" },
              { label: "Outages", pct: 10, value: "0", color: TEAL, tip: "No finding attribution" }
            ] },
            side: { kicker: "LINK", text: "Only the T-104 pair is shown beside the March thermal window. Outages stay unlinked.", gauge: { value: 2, label: "Linked", tip: "Two findings with operational context." } },
            columns: ["Finding", "Event", "Attributed cause", "State"],
            rows: [
              row(["Steel", "12 Mar thermal", "No", tag("Context", "a")], "Shown together", kv),
              row(["02 Feb", "Outage", "No", tag("Clear", "g")], "No finding", kv)
            ]
          });
        }),
        tab("Zones", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Loading and open findings by zone", labels: ["North", "Coastal", "Inland"], series: [
              { name: "Loading %", color: BLUE, values: [78, 54, 49] },
              { name: "Open findings", color: AMBER, values: [12, 3, 2] }
            ] },
            side: { type: "bars", title: "Review priority", items: [
              { label: "North", pct: 69, value: "0.69", color: RED, tip: "T-104" },
              { label: "Coastal", pct: 28, value: "0.28", color: TEAL, tip: "No overdue tower" },
              { label: "Inland", pct: 22, value: "0.22", color: TEAL, tip: "No overdue tower" }
            ] },
            columns: ["Zone", "Loading", "Findings", "State"],
            rows: [
              row(["Corridor North", "78%", "12", tag("Review", "r")], "T-104", kv),
              row(["Coastal", "54%", "3", tag("Quiet", "g")], "No review breach", "Coastal"),
              row(["Inland", "49%", "2", tag("Quiet", "g")], "No review breach", "Inland")
            ]
          });
        })
      ])
    ];
  }

  function inventory() {
    var k = [
      { l: "Jobs requesting", v: "3", s: "Steel, cotter, damper", tip: "Three approved repair jobs have a hardware request.", spark: [1, 1, 2, 2, 3, 3], color: BLUE },
      { l: "Lines short", v: "1", s: "Splice plate", tip: "On hand 0, need 1. Lead time 18 days.", spark: [0, 0, 0, 1, 1, 1], color: RED },
      { l: "Confirmation", v: "Open", s: "All three", tip: "Warehouse availability still requires confirmation.", spark: [1, 1, 1, 1, 1, 1], color: AMBER },
      { l: "Ready to reserve", v: "2", s: "Cotter, damper", tip: "Stock exists. Reservation is not confirmed.", spark: [0, 1, 1, 2, 2, 2], color: TEAL }
    ];
    return [
      drawingScreen([
        { tab: "Hardware", src: "/pids/nx-inv-pfd-0104-hardware.svg", kicker: "Replacement hardware", note: "Warehouse confirmation is still open." },
        { tab: "Stock", src: "/pids/nx-inv-pfd-1002-stock.svg", kicker: "On hand", note: "Plate is short. Cotter and damper are in stock." },
        { tab: "Requests", src: "/pids/nx-inv-pid-4001-requests.svg", kicker: "Three requests", note: "The plate order is draft and has not been placed." },
        { tab: "Stores", src: "/pids/nx-inv-sld-0011-stores.svg", kicker: "Stores", note: "Lead time on the plate is 18 days." }
      ]),
      screen("catalog", "Parts Catalog", "parts", [
        tab("Production", function () {
          return prodBoard({
            title: "Materials",
            lede: "Three open requests. Confirmation is still open, and no order is placed.",
            kpis: [
              { k: "Open requests", v: "3", tip: "Plate, pins, and a damper." },
              { k: "Plate on hand", v: "0", tip: "Need 1. Quote $4.2k is a draft." },
              { k: "Pins on hand", v: "40", tip: "Need 4." },
              { k: "Plate lead", v: "18 days", tip: "North Steel. The order is not placed." }
            ],
            bars: { title: "On hand", unit: "Pieces in the bin.", labels: ["Plate", "Pins", "Damper"], values: [0, 40, 2], max: 40 },
            lines: { title: "On hand and needed", unit: "Needed is the request, not a forecast of sales.", max: 40, labels: ["Plate", "Pins", "Damper"], series: [
              { name: "On hand", color: "#3b6fd8", values: [0, 40, 2] },
              { name: "Needed", color: "#e07a3a", values: [1, 4, 1] }
            ] },
            stack: { title: "Covered and still short", unit: "Covered means the requested count the bin can fill.", labels: ["Plate", "Pins", "Damper", "Plate next", "Damper next"], series: [
              { name: "Still to cover", color: "#d14343", values: [1, 0, 0, 3, 2] },
              { name: "Covered", color: "#3d9a78", values: [0, 4, 1, 0, 2] }
            ] },
            rank: { title: "On hand", unit: "Pieces.", rows: [
              { name: "Pins", value: 40 }, { name: "Damper", value: 2 }, { name: "Plate", value: 0 }
            ] }
          });
        }),
        tab("Sourcing", function () {
          return sourceBoard({
            cards: [
              { k: "Open requests", v: "3", s: "Confirmation still open", spark: [3, 3, 3], tip: "Plate, cotter pins, and a damper. None is placed." },
              { k: "Plate quote", v: "$4.2k", s: "Draft, not placed", spark: [4.2, 4.2], tip: "PL-220-B. Need 1. On hand 0. Lead 18 days." },
              { k: "Pins on hand", v: "40", s: "Need 4", spark: [40, 40], tip: "CP-12. The bin covers the request. Confirmation is still open." },
              { k: "Dampers on hand", v: "2", s: "Need 1 now", spark: [2, 2], tip: "VD-220. Next quarter forecasts 4, so the bin is tight." },
              { k: "Plate lead", v: "18 days", s: "North Steel", spark: [18, 18], tip: "The plate is the long lead. The order is not placed." }
            ],
            side: { title: "Open confirmation", rows: [{ k: "Plate", v: "Short" }, { k: "Pins", v: "40 on hand" }, { k: "Damper", v: "2 on hand" }, { k: "Orders", v: "Not placed" }], foot: "Quotes are drafts. Nothing is sent to a vendor." },
            chartTitle: "Requests against the bin",
            labels: ["Plate", "Pins", "Damper", "Plate next", "Damper next"],
            bars: [
              { name: "Still to cover", color: "#6b5bd2", values: [1, 0, 0, 3, 2] },
              { name: "Covered by stock", color: "#3d9a78", values: [0, 4, 1, 0, 2] }
            ],
            line: { name: "Quote, $k", color: "#14b8a6", values: [4.2, 0.3, 1.7, null, null] },
            leftMax: 5, rightMax: 6,
            band: "Covered means the requested count the bin can fill, not the whole bin.",
            splitLabel: "Sourcing split",
            split: "Three open requests. Plate is the shortage."
          });
        }),
        tab("Overview", function () {
          return optBoard({
            recent: "Most recent material check",
            cards: [
              { k: "Jobs", v: "3", delta: "Confirm open", tone: "flat", spark: [3, 3, 3], caption: "Plate, pins, damper", tip: "Warehouse confirmation is open on all three." },
              { k: "Plate on hand", v: "0", delta: "Need 1", tone: "down", spark: [0, 0], caption: "PL-220-B", tip: "None of the requested splice plate is in the bin." },
              { k: "Pins on hand", v: "40", delta: "Need 4", tone: "up", spark: [40, 40], caption: "CP-12", tip: "On hand covers the need. Confirmation is still open." },
              { k: "Lead", v: "18 days", delta: "Draft, not placed", tone: "down", spark: [18, 18], caption: "North Steel", tip: "The $4.2k quote is a draft." }
            ],
            facts: [
              { k: "Current status", v: "Confirm open", dot: true },
              { k: "Jobs", v: "3" },
              { k: "Plate", v: "0 on hand" },
              { k: "Quote", v: "$4.2k draft" },
              { k: "Placed", v: "No" },
              { k: "Visit", v: "Wednesday" }
            ],
            rows: [
              { name: "Plate", unit: "PL-220-B", recorded: "Need 1", current: "0", change: "Short", tone: "down", note: "The splice plate is not on hand. Lead time is 18 days." },
              { name: "Pins", unit: "CP-12", recorded: "Need 4", current: "40", change: "Covers", tone: "up", note: "Forty pins are on hand. Confirmation is still open." },
              { name: "Damper", unit: "VD-220", recorded: "Need 1", current: "2", change: "Covers", tone: "up", note: "Two dampers are on hand. The finding location is still open." },
              { name: "Quote", unit: "Plate", recorded: "$4.2k", current: "Draft", change: "Not placed", tone: "down", note: "The plate quote is a draft. The order has not been placed." },
              { name: "Confirm", unit: "Warehouse", recorded: "3 jobs", current: "Open", change: "Not reserved", tone: "down", note: "Confirmation is open on all three. Covered stock is not a reservation." }
            ],
            slides: [
              "Replacement hardware requested for three approved repair jobs; warehouse availability requires confirmation.",
              "The splice plate needs 1 and none are on hand. Lead time is 18 days. The $4.2k quote is a draft and is not placed.",
              "Cotter pins need 4 and 40 are on hand. Dampers need 1 and 2 are on hand.",
              "Confirmation is open on all three. Covered stock is not a reservation."
            ],
            chartTitle: "On hand",
            chart: { max: 40, labels: ["Plate", "Pins", "Damper"], series: [
              { name: "On hand", color: "#2563eb", values: [0, 40, 2] }
            ] }
          });
        }),
        tab("Matrix", function () {
          return matrixBoard({
            title: "Material Collection Matrix",
            date: "Requests open",
            operation: "Three approved repair jobs",
            heading: "Material hierarchy",
            chip: "Plate",
            legend: [["agency", "Request"], ["collected", "On hand"], ["scheduled", "Quoted"], ["unscheduled", "Short"], ["held", "Held"], ["risk", "Confirm open"]],
            conflict: { k: "Schedule conflicts", v: "1 conflict", tip: "The plate lead is 18 days, and the visit is planned for Wednesday." },
            metrics: [
              { k: "Jobs", v: "3", tip: "Plate, cotter pins, and damper." },
              { k: "On hand", v: "2", tip: "Pins and damper are in the bin. The plate is not." },
              { k: "Short", v: "1", tip: "PL-220-B. Need 1, on hand 0." },
              { k: "Confirm open", v: "3", tip: "Warehouse confirmation is open on all three." },
              { k: "Plate on hand", v: "0", tip: "None of the requested splice plate is in the bin." },
              { k: "Lead", v: "18 days", tip: "North Steel. The $4.2k quote is a draft and is not placed." }
            ],
            score: { value: 0, label: "Plate filled", tip: "On hand 0 against a need of 1." },
            focus: "jobs",
            nodes: [
              { id: "jobs", kind: "rollup", name: "Jobs", mark: "3", status: "agency", x: 50, y: 16, tag: "Plate", description: "Replacement hardware requested for three approved repair jobs; warehouse availability requires confirmation.", source: "No order is placed.", basic: [["Jobs", "3"], ["Confirm", "Open"], ["Placed", "No"]] },
              { id: "kit", kind: "parent", name: "Visit kit", status: "parent", x: 50, y: 48, tag: "Plate", description: "The Wednesday visit cannot assume the splice plate is in the bin.", source: "Pins and the damper are on hand. Confirmation is still open.", basic: [["Plate", "0"], ["Pins", "40"], ["Dampers", "2"]] },
              { id: "plate", kind: "leaf", name: "Plate", mark: "0", status: "unscheduled", x: 28, y: 80, tag: "Plate", description: "The splice plate is not on hand. The $4.2k quote is a draft and has not been placed.", source: "PL-220-B. Need 1. Lead 18 days. Vendor North Steel.", basic: [["Need", "1"], ["On hand", "0"], ["Lead", "18 days"]] },
              { id: "pins", kind: "leaf", name: "Pins", mark: "40", status: "collected", x: 72, y: 80, tag: "Cotter", description: "Forty cotter pins are on hand against a need of 4. Confirmation is still open.", source: "CP-12. Covered is not the same as reserved.", basic: [["Need", "4"], ["On hand", "40"], ["Confirm", "Open"]] }
            ],
            edges: [["jobs", "kit"], ["kit", "plate"], ["kit", "pins"]]
          });
        }),
        tab("Forecast", function () {
          return planBoard({
            next: "Warehouse confirmation is still open on all three requests.",
            start: "Request",
            end: "Wednesday",
            chart: {
              title: "On hand against the request",
              max: 40,
              labels: ["Plate", "Pins", "Damper"],
              stacks: [{ name: "On hand", color: "#6b5bd2", values: [0, 40, 2] }],
              lines: [{ name: "Needed", color: "#e07a9a", values: [1, 4, 1] }]
            },
            quiet: ["Corridor=Corridor North", "Voltage=220 kV", "Window=This visit", "Source=Warehouse"],
            views: [
              {
                when: "", badge: "Confirm open", hero: { v: "0", k: "Plates on hand" }, leftTitle: "Requested for the visit", rightTitle: "Bin",
                left: [{ k: "Jobs", v: "3" }, { k: "Plate on hand", v: "0", note: "Need 1" }, { k: "Lead", v: "18 days" }],
                right: [{ k: "Pins on hand", v: "40" }, { k: "Dampers on hand", v: "2" }, { k: "Plate on hand", v: "0" }],
                bandTitle: "Three requests", bandNote: "Draft quotes are not placed orders.",
                band: [{ k: "Plate", v: "0", pill: "Short", tone: "down" }, { k: "Pins", v: "40", pill: "Need 4" }, { k: "Damper", v: "2", pill: "Need 1" }],
                summary: "Replacement hardware requested for three approved repair jobs; warehouse availability requires confirmation.",
                more: "Plate PL-220-B needs 1, on hand 0, lead 18 days, vendor North Steel, $4.2k draft, not placed. Cotter CP-12 needs 4, on hand 40. Damper VD-220 needs 1, on hand 2. Confirmation is open on all three.",
                ring: 0, ringLabel: "Plate filled", ringTip: "None of the requested splice plate is on hand."
              },
              {
                when: "Work=Steel", badge: "Short", leftTitle: "Splice plate", rightTitle: "Quote",
                left: [{ k: "Part", v: "PL-220-B" }, { k: "Need", v: "1" }, { k: "On hand", v: "0" }],
                right: [{ k: "Lead", v: "18 days" }, { k: "Quote", v: "$4.2k" }, { k: "Placed", v: "No" }],
                bandTitle: "Plate", bandNote: "Draft only. The vendor order is not placed.",
                band: [{ k: "On hand", v: "0", pill: "Short", tone: "down" }, { k: "Lead", v: "18d", pill: "North Steel" }, { k: "Order", v: "Draft", pill: "Not placed", tone: "down" }],
                summary: "The splice plate is not on hand. The $4.2k quote is a draft and has not been placed.",
                more: "Lead time is 18 days. The planned Wednesday visit sits inside that lead time, so the plate cannot be assumed for this visit.",
                ring: 0, ringLabel: "Plate filled", ringTip: "On hand 0. Need 1."
              },
              {
                when: "Work=Cotter", badge: "In the bin", leftTitle: "Cotter pins", rightTitle: "Still open",
                left: [{ k: "Part", v: "CP-12" }, { k: "Need", v: "4" }, { k: "On hand", v: "40" }],
                right: [{ k: "After issue", v: "36" }, { k: "Confirm", v: "Open" }, { k: "Quote", v: "$0.3k" }],
                bandTitle: "Pins", bandNote: "The bin covers the need. Confirmation is still open.",
                band: [{ k: "Need", v: "4", pill: "CP-12" }, { k: "On hand", v: "40", pill: "Covers" }, { k: "Confirm", v: "Open", pill: "Not reserved", tone: "down" }],
                summary: "Forty cotter pins are on hand against a need of 4. Warehouse confirmation is still open.",
                more: "Covered stock is not a reservation. The pin line is one of the three jobs waiting on confirmation.",
                ring: 100, ringLabel: "In the bin", ringTip: "40 on hand covers the 4 needed. Confirmation is still open."
              },
              {
                when: "Work=Damper", badge: "In the bin", leftTitle: "Damper", rightTitle: "Separate hold",
                left: [{ k: "Part", v: "VD-220" }, { k: "Need", v: "1" }, { k: "On hand", v: "2" }],
                right: [{ k: "Location", v: "Open" }, { k: "Confirm", v: "Open" }, { k: "Quote", v: "$1.7k" }],
                bandTitle: "Damper stock", bandNote: "The part is in the bin. The finding location is not confirmed.",
                band: [{ k: "Need", v: "1", pill: "VD-220" }, { k: "On hand", v: "2", pill: "Covers" }, { k: "Location", v: "Open", pill: "Held", tone: "down" }],
                summary: "Two dampers are on hand against a need of 1. The finding location is still unconfirmed.",
                more: "Stock does not confirm where the visual damper finding sits. The task remains held.",
                ring: 100, ringLabel: "In the bin", ringTip: "2 on hand covers the 1 needed. Location of the finding is still open."
              }
            ]
          });
        }),
        tab("Issues", function () {
          return issueBoard({
            heading: "Material position",
            updated: "Requests open",
            note: "Intensity follows the recorded count or lead time. The plate row is the shortage.",
            cols: ["Need", "On hand", "Lead", "Quote", "Issued", "Confirm"],
            cards: [
              { name: "Pins on hand", score: "40", lines: [["Need", "4"], ["Catalog", "CP-12"], ["Confirmed", "No"]], detail: "CP-12 on hand is 40 against a need of 4. The reservation is not confirmed." },
              { name: "Plate lead", score: "18", lines: [["On hand", "0"], ["Catalog", "PL-220-B"], ["Order", "Not placed"]], detail: "The splice plate lead time is 18 days. On hand is 0 and the $4.2k quote is not placed." },
              { name: "Jobs", score: "3", lines: [["Steel", "Yes"], ["Cotter", "Yes"], ["Damper", "Yes"]], detail: "Three approved repair jobs are waiting on warehouse confirmation." },
              { name: "Damper on hand", score: "2", lines: [["Need", "1"], ["Catalog", "VD-220"], ["Task", "Held"]], detail: "VD-220 on hand is 2 against a need of 1. Confirmation is open and the task is held." },
              { name: "Plate on hand", score: "0", lines: [["Need", "1"], ["Kit", "Blocked"], ["Bin", "North"]], detail: "PL-220-B on hand is 0. The steel cannot be kitted this week." }
            ],
            groups: [
              { name: "Requests", rows: [
                { name: "PL-220-B", values: [10, 0, 90, 70, 0, 40], notes: ["Need 1", "On hand 0", "Lead 18 days", "$4.2k draft", "Not issued", "Confirmation open"] },
                { name: "CP-12", values: [20, 100, null, null, 0, 40], notes: ["Need 4", "On hand 40", "No lead issue", "No quote", "Not issued", "Not confirmed"] },
                { name: "VD-220", values: [10, 40, null, null, 0, 40], notes: ["Need 1", "On hand 2", "No lead issue", "No quote", "Not issued", "Not confirmed"] }
              ] }
            ],
            trendTitle: "On hand against the request.",
            trend: { labels: ["Plate", "Pins", "Damper"], values: [0, 40, 2], max: 40 }
          });
        }),
        tab("Entities", function () {
          return entityBoard({
            focus: "jobs",
            types: ENT_TYPES,
            nodes: [
              { id: "plate", type: "part", name: "PL-220-B", short: "PL", x: 50, y: 20, summary: "Need 1 splice plate. On hand is 0. Lead time 18 days.", status: "SHORT", tone: "r", props: [["Need", "1"], ["On hand", "0"], ["Quote", "$4.2k draft"]], sourceTitle: "North Steel quote", source: "The purchase is not placed.", recorded: "Open", updated: "Short" },
              { id: "pins", type: "part", name: "CP-12", short: "CP", x: 68, y: 26, summary: "Need 4. On hand 40. Reservation is not confirmed.", status: "STOCK", tone: "g", props: [["Need", "4"], ["On hand", "40"]], sourceTitle: "North bin", source: "Stock covers the cotter kit. Nothing has been issued.", recorded: "Open", updated: "Unconfirmed" },
              { id: "jobs", type: "report", name: "Three jobs", short: "3", x: 42, y: 48, summary: "Hardware requested for steel, cotter, and damper. Warehouse confirmation is open.", status: "OPEN", tone: "a", props: [["Jobs", "3"], ["Issued", "None"]], sourceTitle: "Request file", source: "Availability still needs confirmation.", recorded: "Open", updated: "Not kitted" },
              { id: "quote", type: "report", name: "North Steel", short: "NS", x: 24, y: 70, summary: "$4.2k quote for the plate. Draft only.", status: "DRAFT", tone: "a", props: [["Amount", "$4.2k"], ["Order", "Not placed"]], sourceTitle: "Vendor quote", source: "A draft. No purchase order is placed.", recorded: "Open", updated: "Draft" },
              { id: "bin", type: "line", name: "North bin", short: "BIN", x: 48, y: 74, summary: "Issuing warehouse. Nothing has left the bin.", status: "NOT ISSUED", tone: "a", props: [["Issued", "0"]], sourceTitle: "Warehouse", source: "Confirm the bin before dispatch.", recorded: "Open", updated: "Open" },
              { id: "vd", type: "part", name: "VD-220", short: "VD", x: 74, y: 66, summary: "Need 1 damper. On hand 2. Confirmation is open.", status: "STOCK", tone: "g", props: [["Need", "1"], ["On hand", "2"], ["Task", "Held"]], sourceTitle: "North bin", source: "Stock exists. The damper task is still held.", recorded: "Open", updated: "Unconfirmed" }
            ],
            edges: [["jobs", "plate", "short"], ["jobs", "pins", "stock"], ["jobs", "vd", "stock"], ["plate", "quote", "quoted"], ["jobs", "bin", "confirm"], ["vd", "bin", "on hand"]]
          });
        }),
        tab("Recommendations", function () {
          return recommendBoard({
            costTitle: "Material position",
            costMax: 40,
            cost: [
              { label: "Plate short", value: -18, color: "#e07a3d", tip: "PL-220-B on hand is 0. Quoted lead is 18 days. Purchase is not placed." },
              { label: "Pins covered", value: 40, color: "#3d9a78", tip: "CP-12 on hand is 40. Need is 4. Reservation is not confirmed." }
            ],
            levelTitle: "On hand against need",
            levelLabels: ["Plate", "Pins", "Damper"],
            levelValues: [0, 100, 50],
            levelTip: "Plate 0 of 1. Pins are covered. Damper on hand is 2 against a need of 1.",
            groups: recGroups(["PL-220-B", "CP-12", "VD-220"], ["Short", "Stock", "Open"]),
            rows: [
              { item: "PL-220-B", meta: "Splice plate", place: "T-104", placeMeta: "Corridor North", text: "Do not kit the steel this week. On hand is 0 and the quote is not placed.", impact: "Need 1", level: "Lead 18 days", check: "Short", date: "Open", keys: "Corridor North PL-220-B Short" },
              { item: "CP-12", meta: "Cotter kit", place: "T-104", placeMeta: "North bin", text: "Stock covers the need. Confirm the reservation before dispatch.", impact: "Need 4", level: "On hand 40", check: "Stock", date: "Open", keys: "Corridor North CP-12 Stock" },
              { item: "VD-220", meta: "Damper", place: "N-18", placeMeta: "North bin", text: "Stock exists. Confirmation is still open, and the task is held.", impact: "Need 1", level: "On hand 2", check: "Stock", date: "Open", keys: "Corridor North VD-220 Open" },
              { item: "North Steel", meta: "Quote", place: "Corridor North", placeMeta: "Vendor", text: "Keep the $4.2k plate quote as a draft.", impact: "$4.2k", level: "Not placed", check: "Draft", date: "Open", keys: "Corridor North PL-220-B Short" }
            ]
          });
        }),
        tab("Blackboard", function () {
          return blackboard({
            focus: ["jobs", "plate"],
            nodes: [
              { id: "pins", name: "CP-12", short: "CP", x: 14, y: 26, color: TEAL, tip: "Need 4. On hand 40. Not confirmed." },
              { id: "vd", name: "VD-220", short: "VD", x: 30, y: 34, color: AMBER, tip: "Need 1. On hand 2. Not confirmed." },
              { id: "jobs", name: "Three jobs", short: "3", x: 22, y: 54, color: BLUE, tip: "Steel, cotter, and damper requests." },
              { id: "bin", name: "North bin", short: "BIN", x: 16, y: 76, color: "#334155", tip: "Issuing warehouse. Nothing has been issued." },
              { id: "quote", name: "North Steel", short: "NS", x: 38, y: 74, color: PURPLE, tip: "$4.2k quote. The purchase is not placed." },
              { id: "plate", name: "PL-220-B", short: "PL", x: 68, y: 28, color: RED, tip: "Need 1 splice plate. On hand 0. Lead 18 days." },
              { id: "confirm", name: "Confirm", short: "CF", x: 82, y: 46, color: AMBER, tip: "Confirmation is open on all three lines." },
              { id: "kit", name: "Kit", short: "KIT", x: 64, y: 62, color: GREEN, tip: "The visit cannot be kitted while the plate is short." }
            ],
            extra: { id: "draft", name: "Draft PO", short: "PO", x: 50, y: 14, color: "#64748b", tip: "Draft only. No order has been placed." },
            edges: [["pins", "vd", true], ["vd", "jobs", true], ["jobs", "bin"], ["bin", "quote", true], ["jobs", "plate", true], ["plate", "confirm", true], ["plate", "kit"], ["draft", "vd"]],
            types: [
              { icon: "link", title: "Three jobs", kicker: "REQUESTS", value: "3", sub: "Approved repairs", body: "Hardware was requested. Warehouse availability still needs confirmation." },
              { icon: "tower", title: "Short", kicker: "PLATE", value: "0", sub: "On hand", body: "PL-220-B is the line that stops the kit. Quoted lead time is 18 days." },
              { icon: "file", title: "In stock", kicker: "PINS", value: "40", sub: "Need 4", body: "Cotter kits and one damper are on hand. Neither reservation is confirmed." },
              { icon: "user", title: "Not placed", kicker: "VENDOR", value: "$4.2k", sub: "Quote only", body: "North Steel has a draft quote. The purchase has not been placed." }
            ]
          });
        }),
        tab("Schedule", function () {
          return scheduleBoard({
            day: "Wednesday · kit window",
            lanes: [
              { name: "PL-220-B", bars: [
                { left: 66.7, width: 16, fill: "#f8d0e3", ink: "#d56b9a", id: "PL", label: "On hand 0", flag: true, tip: "Need 1 splice plate. Lead time 18 days. North Steel quote is not placed." }
              ] },
              { name: "CP-12 pins", bars: [
                { left: 33.3, width: 14, fill: "#d9f2c8", ink: "#3f8f62", id: "CP", label: "On hand 40", tip: "Need 4. Stock covers the cotter kit. Reservation is not confirmed." }
              ] },
              { name: "VD-220", bars: [
                { left: 50, width: 12, fill: "#c9efef", ink: "#3aabb0", id: "VD", label: "On hand 2", tip: "Need 1 damper. Stock exists. Confirmation is still open." }
              ] },
              { name: "North bin", bars: [
                { left: 37.5, width: 18, fill: "#f8e0b0", ink: "#e09a3e", id: "BIN", label: "Not issued", flag: true, tip: "Nothing has left the warehouse." }
              ] },
              { name: "North Steel", bars: [
                { left: 62.5, width: 14, fill: "#ddd4f7", ink: "#6d5bd0", id: "NS", label: "Quote only", tip: "$4.2k draft. The purchase is not placed." }
              ] },
              { name: "Three jobs", bars: [
                { left: 29.2, width: 16, fill: "#e7f0c8", ink: "#6aaa4a", id: "0003", label: "Repair jobs", tip: "Steel, cotter, and damper. Warehouse availability still needs confirmation." }
              ] },
              { name: "Confirm desk", bars: [
                { left: 45.8, width: 14, fill: "#f6d7bf", ink: "#d9893a", id: "CF", label: "Open", flag: true, tip: "Confirmation is open on all three requests." }
              ] }
            ]
          });
        }),
        tab("Graph", function () {
          return mesh({
            listTitle: "Requests",
            focusTitle: "Three jobs",
            focus: "Replacement hardware requested for three approved repair jobs; warehouse availability requires confirmation.",
            list: [
              { title: "PL-220-B", meta: "On hand 0", tip: "Splice plate · lead 18 days", body: "The steel task cannot be kitted this week." },
              { title: "CP-12", meta: "On hand 40", tip: "Cotter kit", body: "Stock exists. The reservation is not confirmed." },
              { title: "VD-220", meta: "On hand 2", tip: "Damper assembly", body: "Stock exists. Confirmation is still open." },
              { title: "North bin", meta: "Issuing warehouse", tip: "Nothing has been issued", body: "Confirm the bin before dispatch." }
            ],
            nodes: [
              { x: 160, y: 250, color: BLUE, short: "3", title: "Jobs", tip: "Steel, cotter, damper", body: "Three approved repair jobs." },
              { x: 360, y: 130, color: RED, short: "PL", title: "Plate", tip: "Need 1 · on hand 0", body: "Quoted lead time is 18 days." },
              { x: 560, y: 190, color: TEAL, short: "CP", title: "Pins", tip: "Need 4 · on hand 40", body: "Covered, not confirmed." },
              { x: 400, y: 370, color: AMBER, short: "VD", title: "Damper", tip: "Need 1 · on hand 2", body: "Covered, not confirmed." },
              { x: 600, y: 360, color: "#334155", short: "BIN", title: "Warehouse", tip: "Confirmation open", body: "No reservation has been issued." }
            ],
            edges: [[0, 1, "short"], [0, 2, "stock"], [0, 3, "stock"], [1, 4, "confirm"], [2, 4, "confirm"], [3, 4, "confirm"]],
            columns: ["Finding", "Catalog", "Need", "State"],
            rows: [
              row(["T-104 steel", "PL-220-B", "1", tag("Short", "r")], "On hand 0 · lead 18 days", kv),
              row(["T-104 cotter", "CP-12", "4", tag("Stock", "a")], "On hand 40 · not confirmed", kv),
              row(["N-18 damper", "VD-220", "1", tag("Stock", "a")], "On hand 2 · not confirmed", kv)
            ]
          });
        }),
        tab("Map", function () {
          return pack({
            filters: ["Line", "Corridor"],
            kpis: k,
            chart: { type: "bar", title: "Defect record to catalog item", labels: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], series: [{ name: "Catalog hits", color: TEAL, values: [1, 1, 1, 0, 0], tips: ["PL-220-B splice plate", "CP-12 pin kit", "VD-220 damper", "No hardware, check only", "No hardware, vegetation"] }] },
            side: { kicker: "MAP", text: "Replacement hardware is requested for three approved repair jobs. Warehouse availability requires confirmation.", gauge: { value: 3, label: "Jobs", tip: "Steel, cotter, damper." } },
            columns: ["Finding", "Catalog", "Need", "State"],
            rows: [
              row(["T-104 steel", "PL-220-B", "1", tag("Short", "r")], "On hand 0 · lead 18 days", kv),
              row(["T-104 cotter", "CP-12", "4", tag("Stock", "a")], "On hand 40 · not confirmed", kv),
              row(["N-18 damper", "VD-220", "1", tag("Stock", "a")], "On hand 2 · not confirmed", kv),
              row(["T-103", "—", "0", tag("None", "g")], "Check only", kv)
            ]
          });
        }),
        tab("Families", function () {
          return pack({
            kpis: k,
            chart: { type: "donut" },
            side: { type: "donut", title: "Request value mix", parts: [
              { name: "Steel", value: 4200, color: RED, tip: "PL-220-B · one plate" },
              { name: "Damper", value: 1680, color: AMBER, tip: "VD-220 · one assembly" },
              { name: "Cotter", value: 300, color: TEAL, tip: "CP-12 · four pins" }
            ] },
            chart: { type: "hbar", title: "Catalog families touched", items: [
              { label: "Tower steel", pct: 80, value: "1", color: RED, tip: "PL-220-B" },
              { label: "Hardware", pct: 50, value: "1", color: BLUE, tip: "CP-12" },
              { label: "Span fittings", pct: 60, value: "1", color: AMBER, tip: "VD-220" },
              { label: "Foundation", pct: 0, value: "0", color: "#cbd5e1", tip: "No part" }
            ] },
            columns: ["Family", "Item", "Jobs", "State"],
            rows: [
              row(["Tower steel", "PL-220-B", "1", tag("Short", "r")], "Lead 18 days", kv),
              row(["Hardware", "CP-12", "1", tag("Stock", "g")], "On hand", kv),
              row(["Span fittings", "VD-220", "1", tag("Stock", "g")], "On hand", kv)
            ]
          });
        }),
        tab("Fit", function () {
          return pack({
            kpis: k,
            chart: { type: "heat", title: "Approved fit · 100 = catalog match", rows: ["PL-220-B", "CP-12", "VD-220", "Generic"], cols: ["T-104", "N-18", "T-103", "N-19", "T-101", "T-105", "T-110", "Other"], matrix: [
              [100, 10, 10, 10, 10, 10, 10, 10],
              [100, 20, 10, 10, 10, 20, 10, 10],
              [20, 100, 10, 10, 10, 40, 10, 10],
              [10, 10, 10, 10, 10, 10, 10, 10]
            ] },
            side: { kicker: "FIT", text: "Each verified or visual finding maps to one approved item. Foundation and ROW do not.", gauge: { value: 100, label: "Fit", tip: "The three hardware jobs have a single approved item each." } },
            columns: ["Item", "Fits", "Does not fit", "State"],
            rows: [
              row(["PL-220-B", "T-104 steel", "Damper", tag("Match", "g")], "Approved plate", kv),
              row(["VD-220", "N-18", "Steel", tag("Match", "g")], "Approved damper", kv)
            ]
          });
        })
      ]),
      screen("stock", "Inventory Dashboard", "boxes", [
        tab("Position", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "On hand versus need", labels: ["PL-220-B", "CP-12", "VD-220"], series: [
              { name: "On hand", color: TEAL, values: [0, 40, 2] },
              { name: "Need", color: RED, values: [1, 4, 1] }
            ] },
            side: { kicker: "OUTPUT", text: "Replacement hardware requested for three approved repair jobs; warehouse availability requires confirmation.", gauge: { value: 33, label: "Short", tip: "One of three lines is short." } },
            columns: ["Item", "On hand", "Need", "State"],
            rows: [
              row(["PL-220-B", "0", "1", tag("Short", "r")], "18 day lead", kv),
              row(["CP-12", "40", "4", tag("Covered", "a")], "Confirmation still open", kv),
              row(["VD-220", "2", "1", tag("Covered", "a")], "Confirmation still open", kv)
            ]
          });
        }),
        tab("Warehouses", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Units at the north warehouse", labels: ["PL-220-B", "CP-12", "VD-220"], series: [{ name: "Units", color: BLUE, values: [0, 40, 2] }] },
            side: { type: "bars", title: "Bin", items: [
              { label: "Steel bay", pct: 4, value: "0", color: RED, tip: "Empty" },
              { label: "Hardware", pct: 90, value: "40", color: TEAL, tip: "CP-12" },
              { label: "Span", pct: 30, value: "2", color: AMBER, tip: "VD-220" }
            ] },
            columns: ["Warehouse", "Item", "Units", "State"],
            rows: [
              row(["North", "PL-220-B", "0", tag("Short", "r")], "No alternate bin", kv),
              row(["North", "CP-12", "40", tag("In bin", "g")], "Unconfirmed reservation", kv),
              row(["Coast depot", "VD-220", "6", tag("Other", "b")], "Not the issuing warehouse", "Coastal")
            ]
          });
        }),
        tab("Alerts", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Alerts before dispatch", items: [
              { label: "Splice short", pct: 100, value: "18 d", color: RED, tip: "Cannot issue what is not in the bin" },
              { label: "Confirm cotter", pct: 60, value: "Open", color: AMBER, tip: "Stock exists" },
              { label: "Confirm damper", pct: 60, value: "Open", color: AMBER, tip: "Stock exists" },
              { label: "ROW material", pct: 0, value: "None", color: TEAL, tip: "No part" }
            ] },
            side: { kicker: "ALERT", text: "Do not dispatch the steel task on stock that is not in the warehouse. The plate is the blocker.", gauge: { value: 18, label: "Days", tip: "Supplier lead time for PL-220-B." } },
            columns: ["Alert", "Item", "Effect", "State"],
            rows: [
              row(["Shortage", "PL-220-B", "Blocks steel", tag("Open", "r")], "Lead 18 days", kv),
              row(["Unconfirmed", "CP-12", "Holds issue", tag("Open", "a")], "Bin has stock", kv),
              row(["Unconfirmed", "VD-220", "Holds issue", tag("Open", "a")], "Bin has stock", kv)
            ]
          });
        })
      ]),
      screen("requests", "Material Requests", "request", [
        tab("Three jobs", function () {
          return lanes({
            kpis: k,
            columns: [
              { title: "Requested", cards: [
                { title: "PL-220-B", meta: "Need 1 · on hand 0", tip: "T-104 steel" },
                { title: "CP-12", meta: "Need 4 · on hand 40", tip: "T-104 cotter" },
                { title: "VD-220", meta: "Need 1 · on hand 2", tip: "N-18 damper" }
              ] },
              { title: "Warehouse", cards: [{ title: "Confirmation", meta: "Open", tip: "Availability is not confirmed for the batch." }] },
              { title: "Reserved", cards: [{ title: "None", meta: "No issue yet", tip: "Reservations wait on confirmation." }] },
              { title: "Purchase", cards: [{ title: "PL-220-B", meta: "Lead 18 days", tip: "Only the short line needs a buy." }] },
              { title: "Issued", cards: [{ title: "None", meta: "Visit not released", tip: "Nothing has left the bin." }] }
            ]
          });
        }),
        tab("Reservations", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Requested, reserved, issued", labels: ["PL-220-B", "CP-12", "VD-220"], series: [
              { name: "Requested", color: BLUE, values: [1, 4, 1] },
              { name: "Reserved", color: TEAL, values: [0, 0, 0] },
              { name: "Issued", color: GREEN, values: [0, 0, 0] }
            ] },
            side: { kicker: "HOLD", text: "Replacement hardware requested for three approved repair jobs; warehouse availability requires confirmation.", gauge: { value: 0, label: "Issued", tip: "No reservation is confirmed." } },
            columns: ["Request", "Job", "Qty", "State"],
            rows: [
              row(["MR-104-A", "Steel", "1", tag("Confirm", "r")], "Short", kv),
              row(["MR-104-B", "Cotter", "4", tag("Confirm", "a")], "In bin", kv),
              row(["MR-18-D", "Damper", "1", tag("Confirm", "a")], "In bin", kv)
            ]
          });
        }),
        tab("Status", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Request age", items: [
              { label: "MR-104-A", pct: 70, value: "7 d", color: RED, tip: "Steel · short" },
              { label: "MR-104-B", pct: 70, value: "7 d", color: AMBER, tip: "Cotter" },
              { label: "MR-18-D", pct: 40, value: "4 d", color: AMBER, tip: "Damper · raised after the frames were grouped" }
            ] },
            side: { type: "donut", title: "Batch", parts: [
              { name: "Short", value: 1, color: RED, tip: "Plate" },
              { name: "In bin", value: 2, color: TEAL, tip: "Cotter and damper" }
            ] },
            columns: ["Request", "Age", "Bin", "State"],
            rows: [
              row(["MR-104-A", "7 d", "Empty", tag("Short", "r")], "Buy", kv),
              row(["MR-104-B", "7 d", "40", tag("Confirm", "a")], "Do not assume issued", kv),
              row(["MR-18-D", "4 d", "2", tag("Confirm", "a")], "Do not assume issued", kv)
            ]
          });
        })
      ]),
      screen("supplier", "Supplier Management", "supplier", [
        tab("Lead time", function () {
          return pack({
            kpis: [
              { l: "PL-220-B lead", v: "18 d", s: "Quoted", tip: "Only short line.", spark: [21, 20, 18, 18, 18, 18], color: RED },
              { l: "VD-220 lead", v: "12 d", s: "Not needed now", tip: "Stock covers the one assembly.", spark: [14, 14, 12, 12, 12, 12], color: AMBER },
              { l: "CP-12 lead", v: "5 d", s: "Not needed now", tip: "Bin covers the pins.", spark: [7, 6, 5, 5, 5, 5], color: TEAL },
              { l: "Late orders", v: "0", s: "Open buys", tip: "The plate purchase is not placed yet.", spark: [0, 0, 0, 0, 0, 0], color: GREEN }
            ],
            chart: { type: "bar", title: "Quoted lead time · days", labels: ["PL-220-B", "VD-220", "CP-12"], series: [{ name: "Days", color: PURPLE, values: [18, 12, 5] }] },
            side: { kicker: "CLOCK", text: "The splice plate needs 18 days after the purchase is placed. The visit cannot assume it is on the shelf.", gauge: { value: 18, label: "Days", tip: "Quoted lead for PL-220-B." } },
            columns: ["Item", "Vendor", "Lead", "State"],
            rows: [
              row(["PL-220-B", "North Steel", "18 d", tag("Buy", "r")], "Not on hand", kv),
              row(["VD-220", "Span Fittings", "12 d", tag("Hold", "a")], "Stock covers this job", kv),
              row(["CP-12", "Hardware Co", "5 d", tag("Hold", "g")], "Stock covers this job", kv)
            ]
          });
        }),
        tab("Vendors", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "On-time receipts · last four buys", items: [
              { label: "North Steel", pct: 75, value: "3/4", color: AMBER, tip: "One late plate in the prior year" },
              { label: "Span Fittings", pct: 100, value: "4/4", color: TEAL, tip: "Dampers on time" },
              { label: "Hardware Co", pct: 100, value: "4/4", color: TEAL, tip: "Pins on time" }
            ] },
            side: { type: "donut", title: "This request", parts: [
              { name: "Must buy", value: 1, color: RED, tip: "North Steel" },
              { name: "No buy", value: 2, color: TEAL, tip: "Other two vendors" }
            ] },
            columns: ["Vendor", "Item", "On time", "State"],
            rows: [
              row(["North Steel", "PL-220-B", "3/4", tag("Watch", "a")], "Needed", kv),
              row(["Span Fittings", "VD-220", "4/4", tag("Quiet", "g")], "Not buying", kv)
            ]
          });
        }),
        tab("Risk", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Shortage risk if the visit stays on the current week", labels: ["Plate", "Pin", "Damper"], series: [{ name: "Risk", color: RED, values: [90, 10, 15], tips: ["Will miss a visit inside 18 days", "Bin covers", "Bin covers"] }] },
            side: { kicker: "RISK", text: "Flag the plate before dispatch. The other two lines are a confirmation task, not a shortage.", gauge: { value: 90, label: "Plate", tip: "High chance the current week cannot be supplied." } },
            columns: ["Line", "If dispatched now", "Action", "State"],
            rows: [
              row(["Plate", "Missing", "Buy or move the visit", tag("Block", "r")], "18 days", kv),
              row(["Pin", "Available", "Confirm bin", tag("Check", "a")], "On hand", kv),
              row(["Damper", "Available", "Confirm bin", tag("Check", "a")], "On hand", kv)
            ]
          });
        })
      ]),
      screen("buy", "Procurement", "cart", [
        tab("Requests", function () {
          return pack({
            kpis: [
              { l: "Purchase lines", v: "1", s: "PL-220-B", tip: "Only the short item is a purchase.", spark: [0, 0, 1, 1, 1, 1], color: RED },
              { l: "Value", v: "$4.2k", s: "Plate only", tip: "One splice plate.", spark: [0, 0, 4.2, 4.2, 4.2, 4.2], color: BLUE },
              { l: "Placed", v: "0", s: "Not issued", tip: "The request is drafted, not sent.", spark: [0, 0, 0, 0, 0, 0] },
              { l: "Need-by", v: "Visit", s: "Wednesday plan", tip: "The planned visit is inside the lead time.", spark: [1, 1, 1, 1, 1, 1], color: AMBER }
            ],
            chart: { type: "bar", title: "Draft purchase value", labels: ["Plate", "Pin", "Damper"], series: [{ name: "USD k", color: BLUE, values: [4.2, 0, 0] }] },
            side: { kicker: "DRAFT", text: "One purchase request is ready to raise for the splice plate. Pins and the damper stay as warehouse confirmations.", gauge: { value: 4, label: "$k", tip: "$4.2k draft." } },
            columns: ["Line", "Vendor", "Value", "State"],
            rows: [
              row(["PL-220-B", "North Steel", "$4.2k", tag("Draft", "a")], "Not placed", kv),
              row(["CP-12", "—", "$0", tag("No buy", "g")], "Use the bin after confirmation", kv),
              row(["VD-220", "—", "$0", tag("No buy", "g")], "Use the bin after confirmation", kv)
            ]
          });
        }),
        tab("Pipeline", function () {
          return lanes({
            kpis: k,
            columns: [
              { title: "Draft", cards: [{ title: "PR-220-B", meta: "$4.2k · 18 days", tip: "Splice plate" }] },
              { title: "Approval", cards: [{ title: "None", meta: "Not submitted", tip: "Buyer has not sent it." }] },
              { title: "Sent", cards: [{ title: "None", meta: "—", tip: "No open PO for this visit." }] },
              { title: "In transit", cards: [{ title: "None", meta: "—", tip: "Nothing shipping." }] },
              { title: "Received", cards: [{ title: "None", meta: "This package", tip: "Bin still empty for the plate." }] }
            ]
          });
        }),
        tab("Need-by", function () {
          return gantt({
            title: "Lead time against the planned Wednesday",
            ticks: ["Now", "+3d", "+6d", "+9d", "+12d", "+15d", "+18d", "Visit"],
            kpis: k,
            lanes: [
              { name: "Plate", bars: [{ left: 4, width: 78, color: RED, label: "18 d", tip: "Arrives after the current visit date if ordered today" }] },
              { name: "Visit", bars: [{ left: 18, width: 8, color: BLUE, label: "Wed", tip: "Current plan sits inside the lead time" }] }
            ],
            sideTitle: "Choice",
            bars: [
              { label: "Move visit", pct: 80, value: "+18 d", color: AMBER, tip: "Wait for the plate" },
              { label: "Drop steel", pct: 40, value: "4 tasks", color: TEAL, tip: "Other tasks do not need the plate" }
            ]
          });
        })
      ]),
      screen("forecast", "Stock Forecast", "forecast", [
        tab("Quarter", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "Projected on-hand · splice plates", labels: ["Now", "W2", "W4", "W6", "W8", "W10"], series: [
              { name: "If ordered now", color: TEAL, values: [0, 0, 1, 1, 1, 1] },
              { name: "If not ordered", color: RED, values: [0, 0, 0, 0, 0, 0] }
            ] },
            side: { kicker: "FORECAST", text: "Without a purchase, the plate stays at zero through the quarter. Pins and dampers stay covered.", gauge: { value: 0, label: "Plates", tip: "On hand today." } },
            columns: ["Item", "Now", "Week 8", "State"],
            rows: [
              row(["PL-220-B", "0", "1 if ordered", tag("Short", "r")], "Lead 18 days", kv),
              row(["CP-12", "40", "36", tag("Covered", "g")], "After issuing 4", kv),
              row(["VD-220", "2", "1", tag("Covered", "g")], "After issuing 1", kv)
            ]
          });
        }),
        tab("Shortage", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Lines that miss the current visit", labels: ["Plate", "Pin", "Damper", "Grout", "ROW"], series: [{ name: "Miss", color: RED, values: [1, 0, 0, 0, 0] }] },
            side: { kicker: "FLAG", text: "One hardware shortage is visible before dispatch: the splice plate.", gauge: { value: 1, label: "Line", tip: "PL-220-B." } },
            columns: ["Line", "Misses visit", "Reason", "State"],
            rows: [
              row(["PL-220-B", "Yes", "Lead 18 days", tag("Flag", "r")], "Buy or move the day", kv),
              row(["CP-12", "No", "On hand", tag("Ok", "g")], "Still confirm", kv),
              row(["VD-220", "No", "On hand", tag("Ok", "g")], "Still confirm", kv)
            ]
          });
        }),
        tab("Jobs", function () {
          return pack({
            kpis: k,
            chart: { type: "heat", title: "Can the job be kitted this week", rows: ["Steel", "Cotter", "Damper", "Foundation", "ROW"], cols: ["Part", "Bin", "Confirm", "Lead", "Kit", "Visit", "Spare", "Block"], matrix: [
              [100, 8, 40, 90, 8, 20, 8, 100],
              [100, 90, 40, 10, 70, 80, 80, 20],
              [100, 80, 40, 20, 70, 60, 70, 30],
              [10, 80, 80, 10, 80, 80, 70, 10],
              [10, 90, 90, 10, 90, 90, 80, 10]
            ] },
            side: { kicker: "KIT", text: "Cotter and damper can be kitted after a warehouse confirm. Steel cannot.", gauge: { value: 40, label: "Ready", tip: "Two of three hardware jobs are bin-ready, none are confirmed." } },
            columns: ["Job", "Kit this week", "Blocker", "State"],
            rows: [
              row(["Steel", "No", "Plate", tag("Block", "r")], "18 days", kv),
              row(["Cotter", "After confirm", "None", tag("Check", "a")], "Bin has pins", kv),
              row(["Damper", "After confirm", "Location", tag("Check", "a")], "Bin has a damper. Location is a separate hold.", kv)
            ]
          });
        })
      ])
    ];
  }

  function forecastApp() {
    var k = [
      { l: "Reviews next quarter", v: "18", s: "Manual engineering", tip: "Forecast of inspections that need a person, not a calendar count.", spark: [8, 10, 12, 14, 16, 18], color: RED },
      { l: "Inspections", v: "46", s: "Risk-based plan", tip: "Flights pulled by indicators. A pure calendar would schedule 22.", spark: [22, 24, 28, 32, 40, 46], color: BLUE },
      { l: "Pulled forward", v: "T-104", s: "Already due", tip: "T-104 is in the 18 because severity crossed 0.60.", spark: [0, 0, 1, 1, 1, 1], color: AMBER },
      { l: "Zones", v: "4", s: "11 · 4 · 2 · 1", tip: "North 11, Coastal 4, Inland 2, angle towers 1.", spark: [4, 4, 4, 4, 4, 4], color: TEAL }
    ];
    return [
      drawingScreen([
        { tab: "Reviews", src: "/pids/nx-fct-pfd-0018-reviews.svg", kicker: "Next quarter", note: "18 inspections need manual engineering review." },
        { tab: "Zones", src: "/pids/nx-fct-pfd-1001-zones.svg", kicker: "By zone", note: "North 11, Coastal 4, Inland 2, Angle 1." },
        { tab: "Flights", src: "/pids/nx-fct-pfd-1001-flights.svg", kicker: "Risk flights", note: "46 risk-based flights. A calendar would schedule 22." }
      ]),
      screen("risk", "Risk Forecast", "forecast", [
        tab("Production", function () {
          return prodBoard({
            title: "Review forecast",
            lede: "18 inspections are forecast to need manual review next quarter. This is not a completed count.",
            kpis: [
              { k: "Reviews", v: "18", tip: "North 11, Coastal 4, Inland 2, Angle 1." },
              { k: "North", v: "11", tip: "11 of 18. Not a confidence score." },
              { k: "Risk flights", v: "46", tip: "Against 22 on the calendar plan." },
              { k: "Review hours", v: "72", tip: "18 × 4h. Not yet worked." }
            ],
            bars: { title: "Reviews by zone", unit: "A forecast, not inspections already done.", labels: ["North", "Coastal", "Inland", "Angle"], values: [11, 4, 2, 1], max: 12 },
            lines: { title: "Flight plans", unit: "Two plans. Not a weekly trend.", labels: ["Risk plan", "Calendar"], series: [
              { name: "Flights", color: "#3b6fd8", values: [46, 22] }
            ] },
            stack: { title: "Same review split", unit: "Zones are not weeks.", labels: ["North", "Coastal", "Inland", "Angle"], series: [
              { name: "Reviews", color: "#3b6fd8", values: [11, 4, 2, 1] }
            ] },
            rank: { title: "Zones by reviews", unit: "Of the 18.", rows: [
              { name: "North", value: 11 }, { name: "Coastal", value: 4 }, { name: "Inland", value: 2 }, { name: "Angle", value: 1 }
            ] }
          });
        }),
        tab("Sourcing", function () {
          return sourceBoard({
            cards: [
              { k: "Reviews next quarter", v: "18", s: "A forecast, not a count done", spark: [11, 4, 2, 1], tip: "North 11, Coastal 4, Inland 2, Angle 1." },
              { k: "North share", v: "11", s: "Of the 18", spark: [11, 11], tip: "11 of 18 are Corridor North. Not a confidence score." },
              { k: "Risk flights", v: "46", s: "Calendar is 22", spark: [22, 46], tip: "Risk-based flights against the calendar plan." },
              { k: "Pulled forward", v: "8 wk", s: "T-104 only", spark: [8, 8], tip: "T-104 is pulled 8 weeks forward." },
              { k: "Review hours", v: "72", s: "18 × 4h, not yet worked", spark: [72, 72], tip: "The hours are reserved. They are not hours already worked." }
            ],
            side: { title: "Next quarter", rows: [{ k: "North", v: "11" }, { k: "Coastal", v: "4" }, { k: "Inland", v: "2" }, { k: "Angle", v: "1" }], foot: "This is a forecast. It is not a completed inspection count." },
            chartTitle: "Manual reviews next quarter",
            labels: ["North", "Coastal", "Inland", "Angle"],
            bars: [
              { name: "Reviews", color: "#6b5bd2", values: [11, 4, 2, 1] },
              { name: "Weeks pulled forward", color: "#3d9a78", axis: "right", values: [8, 0, 0, 0] }
            ],
            leftMax: 12, rightMax: 10,
            band: "Zones are not a time series. The green bar is only T-104.",
            split: "18 reviews. North is 11."
          });
        }),
        tab("Overview", function () {
          return optBoard({
            recent: "Most recent forecast",
            cards: [
              { k: "Reviews", v: "18", delta: "Not completed", tone: "flat", spark: [11, 4, 2, 1], caption: "By zone", tip: "North 11, Coastal 4, Inland 2, angle 1. A forecast, not a completed count." },
              { k: "Flights", v: "46", delta: "Calendar has 22", tone: "up", spark: [22, 46], caption: "Risk plan", tip: "46 risk-based flights against 22 on the calendar. Not flown." },
              { k: "North", v: "11", delta: "Of 18", tone: "flat", spark: [11, 11], caption: "Includes T-104", tip: "Pulled 8 weeks forward." },
              { k: "Review hours", v: "72", delta: "Not worked", tone: "flat", spark: [72, 72], caption: "18 × 4h", tip: "A forecast of review time." }
            ],
            facts: [
              { k: "Current status", v: "Forecast", dot: true },
              { k: "Window", v: "Next quarter" },
              { k: "Reviews", v: "18" },
              { k: "Flights", v: "46 vs 22" },
              { k: "Pull", v: "8 weeks" },
              { k: "Flown", v: "No" }
            ],
            rows: [
              { name: "North", unit: "Reviews", recorded: "11", current: "Forecast", change: "Includes T-104", tone: "flat", note: "11 of the 18 reviews are Corridor North." },
              { name: "Coastal", unit: "Reviews", recorded: "4", current: "Forecast", change: "Separate", tone: "flat", note: "Coastal is 4 of the 18. It is not this corridor." },
              { name: "Inland", unit: "Reviews", recorded: "2", current: "Forecast", change: "Age", tone: "flat", note: "Inland is 2 of the 18. Age is the driver." },
              { name: "Angle", unit: "Reviews", recorded: "1", current: "Forecast", change: "Completes 18", tone: "flat", note: "One angle tower. 11 + 4 + 2 + 1 = 18." },
              { name: "Calendar", unit: "Flights", recorded: "22", current: "46 risk", change: "Not the same list", tone: "up", note: "The calendar has 22 flights. The risk plan has 46. Neither set has been flown." }
            ],
            slides: [
              "Forecast: 18 inspections require manual engineering review next quarter.",
              "North is 11, Coastal 4, Inland 2, and one angle tower. T-104 is pulled 8 weeks forward.",
              "The risk plan has 46 flights. The calendar has 22. The 72 review hours have not been worked.",
              "This is a forecast, not a completed inspection count."
            ],
            chartTitle: "Reviews next quarter",
            chart: { max: 12, labels: ["North", "Coastal", "Inland", "Angle"], series: [
              { name: "Reviews", color: "#2563eb", values: [11, 4, 2, 1] }
            ] }
          });
        }),
        tab("Matrix", function () {
          return matrixBoard({
            title: "Review Collection Matrix",
            date: "Next quarter",
            operation: "Manual engineering reviews",
            heading: "Review hierarchy",
            chip: "North",
            conflict: { k: "Schedule conflicts", v: "1 conflict", tip: "The risk plan has 46 flights. The calendar still has 22." },
            metrics: [
              { k: "Reviews", v: "18", tip: "A forecast, not a completed count." },
              { k: "North", v: "11", tip: "Includes T-104, pulled 8 weeks forward." },
              { k: "Other zones", v: "7", tip: "Coastal 4, Inland 2, angle 1." },
              { k: "Flights", v: "46", tip: "Risk-based plan. Not flown." },
              { k: "Calendar", v: "22", tip: "The smaller calendar set." },
              { k: "Hours", v: "72", tip: "18 reviews at about 4 hours. Not yet worked." }
            ],
            score: { value: 61, label: "North share", tip: "11 of 18 reviews. Not a confidence score." },
            focus: "all",
            nodes: [
              { id: "all", kind: "rollup", name: "Reviews", mark: "18", status: "agency", x: 50, y: 16, tag: "North", description: "Forecast: 18 inspections require manual engineering review next quarter.", source: "Not a completed inspection count.", basic: [["Total", "18"], ["Hours", "72"], ["Flown", "No"]] },
              { id: "quarter", kind: "parent", name: "Quarter", status: "parent", x: 50, y: 48, tag: "North", description: "North 11, Coastal 4, Inland 2, and one angle tower.", source: "An alternate threshold of 0.50 would list 27 reviews. That is not this plan.", basic: [["North", "11"], ["Other", "7"], ["Pull", "8 weeks"]] },
              { id: "north", kind: "leaf", name: "North", mark: "11", status: "scheduled", x: 28, y: 80, tag: "North", description: "11 of the 18 reviews are Corridor North. T-104 is pulled 8 weeks forward.", source: "Priority 0.69 is already past 0.60.", basic: [["Reviews", "11"], ["HV days", "14"], ["Vegetation days", "6"]] },
              { id: "calendar", kind: "leaf", name: "Calendar", mark: "22", status: "held", x: 72, y: 80, tag: "Calendar", description: "The calendar still shows 22 flights. The risk plan is 46.", source: "The 22 are not the same list as the 18 reviews.", basic: [["Flights", "22"], ["Risk plan", "46"], ["Completed", "No"]] }
            ],
            edges: [["all", "quarter"], ["quarter", "north"], ["quarter", "calendar"]]
          });
        }),
        tab("Forecast", function () {
          return planBoard({
            next: "18 inspections are forecast to need manual review next quarter.",
            start: "This quarter",
            end: "Next quarter",
            chart: {
              title: "Manual reviews next quarter",
              max: 12,
              labels: ["North", "Coastal", "Inland", "Angle"],
              stacks: [
                { name: "North", color: "#6b5bd2", values: [11, 0, 0, 0] },
                { name: "Coastal", color: "#e07a9a", values: [0, 4, 0, 0] },
                { name: "Inland", color: "#f0a05a", values: [0, 0, 2, 0] },
                { name: "Angle", color: "#6aa6e8", values: [0, 0, 0, 1] }
              ]
            },
            quiet: ["Voltage=220 kV", "Window=Next quarter", "Source=Plan", "State=Review"],
            views: [
              {
                when: "", badge: "Above the calendar", hero: { v: "18", k: "Reviews next quarter" }, leftTitle: "Risk plan", rightTitle: "Calendar plan",
                left: [{ k: "Reviews", v: "18", note: "Forecast" }, { k: "Flights", v: "46", note: "vs 22" }, { k: "Review hours", v: "72", note: "18 × 4h" }],
                right: [{ k: "Flights", v: "22" }, { k: "Same review list", v: "No" }, { k: "Pull", v: "None" }],
                bandTitle: "Next quarter", bandNote: "A forecast, not a completed inspection count.",
                band: [{ k: "North", v: "11", pill: "of 18" }, { k: "Other zones", v: "7", pill: "4 + 2 + 1" }, { k: "Pulled forward", v: "8 wk", pill: "T-104" }],
                summary: "Forecast: 18 inspections require manual engineering review next quarter.",
                more: "North 11, Coastal 4, Inland 2, and one angle tower. Risk-based flights are 46 against 22 on the calendar. T-104 is pulled 8 weeks forward because priority is 0.69. Corridor North has 14 high-voltage days and 6 vegetation days in the forecast. The 72 hours have not been worked. An alternate threshold of 0.50 would list 27 reviews, and that alternate is not the plan shown here.",
                ring: 61, ringLabel: "North share", ringTip: "11 of the 18 reviews are Corridor North. Not a confidence score."
              },
              {
                when: "Corridor=Corridor North", badge: "11 of 18", leftTitle: "Corridor North", rightTitle: "Rest of the forecast",
                left: [{ k: "Reviews", v: "11" }, { k: "Includes", v: "T-104" }, { k: "Pull", v: "8 weeks" }],
                right: [{ k: "Coastal", v: "4" }, { k: "Inland", v: "2" }, { k: "Angle", v: "1" }],
                bandTitle: "Corridor North", bandNote: "Forecast only. These reviews are not completed.",
                band: [{ k: "Reviews", v: "11", pill: "of 18" }, { k: "HV days", v: "14", pill: "Forecast" }, { k: "Vegetation days", v: "6", pill: "Forecast" }],
                summary: "11 of the 18 reviews are Corridor North. T-104 is pulled 8 weeks forward.",
                more: "The pull follows priority 0.69, which is already past the 0.60 line. The flights in this cut have not been flown.",
                ring: 61, ringLabel: "North share", ringTip: "11 of 18. Not a confidence score."
              },
              {
                when: "Corridor=Coastal", badge: "Separate", leftTitle: "Coastal", rightTitle: "Not this corridor",
                left: [{ k: "Reviews", v: "4" }, { k: "Driver", v: "Exposure" }, { k: "Completed", v: "No" }],
                right: [{ k: "North", v: "11" }, { k: "Inland", v: "2" }, { k: "Angle", v: "1" }],
                bandTitle: "Coastal", bandNote: "Kept separate from the 220 kV corridor.",
                band: [{ k: "Reviews", v: "4", pill: "of 18" }, { k: "T-104", v: "No", pill: "Other corridor" }, { k: "Completed", v: "0", pill: "Forecast", tone: "down" }],
                summary: "Coastal accounts for 4 of the 18 reviews. They are not the 220 kV corridor.",
                more: "Exposure is the driver. None of these 4 are a completed inspection.",
                ring: 22, ringLabel: "Share of 18", ringTip: "4 of 18 reviews. Not a confidence score."
              },
              {
                when: "Corridor=Inland", badge: "Separate", leftTitle: "Inland", rightTitle: "Not this corridor",
                left: [{ k: "Reviews", v: "2" }, { k: "Driver", v: "Age" }, { k: "Completed", v: "No" }],
                right: [{ k: "North", v: "11" }, { k: "Coastal", v: "4" }, { k: "Angle", v: "1" }],
                bandTitle: "Inland", bandNote: "Lower rate than Corridor North.",
                band: [{ k: "Reviews", v: "2", pill: "of 18" }, { k: "T-104", v: "No", pill: "Other corridor" }, { k: "Completed", v: "0", pill: "Forecast", tone: "down" }],
                summary: "Inland accounts for 2 of the 18 reviews. Age is the driver.",
                more: "These two are a forecast. They are not finished work and they are not T-104.",
                ring: 11, ringLabel: "Share of 18", ringTip: "2 of 18 reviews. Not a confidence score."
              }
            ]
          });
        }),
        tab("Issues", function () {
          return issueBoard({
            heading: "Next-quarter forecast",
            updated: "Planning cut",
            note: "Review cells are the share of 18. Flight and hour cells use their own counts in the tip. Nothing here is a completed inspection.",
            cols: ["North", "Coastal", "Inland", "Angle", "Flights", "Hours"],
            cards: [
              { name: "Review hours", score: "72", lines: [["Reviews", "18"], ["Each", "About 4h"], ["Done", "No"]], detail: "72 hours is the forecast for 18 reviews. Those hours have not been performed." },
              { name: "Risk flights", score: "46", lines: [["Calendar", "22"], ["Basis", "Risk"], ["Flown", "No"]], detail: "46 flights are the risk-based plan, against 22 on the calendar." },
              { name: "Calendar flights", score: "22", lines: [["Compared with", "46"], ["Zone", "All"], ["Status", "Plan"]], detail: "The calendar still shows 22 flights. The risk plan is the larger set." },
              { name: "Reviews", score: "18", lines: [["North", "11"], ["Other", "7"], ["Status", "Forecast"]], detail: "18 inspections are forecast to need manual engineering review next quarter." },
              { name: "Corridor North", score: "11", lines: [["Includes", "T-104"], ["Pull", "8 weeks"], ["Threshold", "0.60"]], detail: "11 of the 18 reviews are Corridor North. T-104 is pulled forward because priority is 0.69." }
            ],
            groups: [
              { name: "Forecast", rows: [
                { name: "Reviews", values: [61, 22, 11, 6, null, null], notes: ["11 of 18", "4 of 18", "2 of 18", "1 of 18", "Not a review count", "Not a review count"] },
                { name: "Flying", values: [null, null, null, null, 64, 100], notes: ["Not a flight count", "Not a flight count", "Not a flight count", "Not a flight count", "46 risk flights", "72 review hours"] }
              ] }
            ],
            trendTitle: "Reviews by zone. Total 18.",
            trend: { labels: ["North", "Coast", "Inland", "Angle"], values: [11, 4, 2, 1], max: 12 }
          });
        }),
        tab("Entities", function () {
          return entityBoard({
            focus: "all",
            types: ENT_TYPES,
            nodes: [
              { id: "north", type: "line", name: "North 11", short: "11", x: 50, y: 20, summary: "11 of the 18 reviews, including T-104.", status: "FORECAST", tone: "a", props: [["Reviews", "11"], ["Driver", "T-104"]], sourceTitle: "Risk plan", source: "A forecast, not a completed count.", recorded: "Next quarter", updated: "Not performed" },
              { id: "coast", type: "line", name: "Coastal 4", short: "4", x: 68, y: 26, summary: "4 reviews. Exposure, separate from this corridor.", status: "FORECAST", tone: "b", props: [["Reviews", "4"], ["Driver", "Exposure"]], sourceTitle: "Risk plan", source: "Not the 220 kV corridor.", recorded: "Next quarter", updated: "Not performed" },
              { id: "all", type: "report", name: "18 reviews", short: "18", x: 42, y: 48, summary: "Manual engineering reviews forecast for next quarter.", status: "FORECAST", tone: "a", props: [["Total", "18"], ["Split", "11 + 4 + 2 + 1"], ["Hours", "72"]], sourceTitle: "Risk plan", source: "Not a completed inspection count.", recorded: "Next quarter", updated: "Open" },
              { id: "t104", type: "tower", name: "T-104", short: "T104", x: 24, y: 70, summary: "Pulled 8 weeks forward. Priority 0.69.", status: "PULL", tone: "r", props: [["Shift", "8 weeks"], ["Priority", "0.69"], ["Threshold", "0.60"]], sourceTitle: "Risk plan", source: "Ahead of the calendar because the index is 61.", recorded: "Next quarter", updated: "Not flown" },
              { id: "inland", type: "line", name: "Inland 2", short: "2", x: 48, y: 74, summary: "2 reviews. Age is the driver.", status: "FORECAST", tone: "g", props: [["Reviews", "2"]], sourceTitle: "Risk plan", source: "Lower rate than Corridor North.", recorded: "Next quarter", updated: "Not performed" },
              { id: "angle", type: "tower", name: "Angle 1", short: "1", x: 74, y: 66, summary: "One angle-tower review.", status: "FORECAST", tone: "b", props: [["Reviews", "1"]], sourceTitle: "Risk plan", source: "Completes the 18.", recorded: "Next quarter", updated: "Not performed" }
            ],
            edges: [["all", "north", "11"], ["all", "coast", "4"], ["all", "inland", "2"], ["all", "angle", "1"], ["north", "t104", "pulls"], ["all", "t104", "includes"]]
          });
        }),
        tab("Recommendations", function () {
          return recommendBoard({
            costTitle: "Reviews next quarter",
            costMax: 18,
            cost: [
              { label: "North 11", value: 11, color: "#e07a3d", tip: "Corridor North, including T-104. A forecast, not a completed count." },
              { label: "Other 7", value: -7, color: "#3d9a78", tip: "Coastal 4, Inland 2, Angle 1. Separate from this corridor." }
            ],
            levelTitle: "Where the 18 reviews sit",
            levelLabels: ["North", "Coast", "Inland", "Angle"],
            levelValues: [61, 22, 11, 6],
            levelTip: "Share of the 18. North is 11.",
            groups: recGroups(["T-104", "North", "Coastal", "Inland", "Angle"], ["Forecast", "Pull"]),
            rows: [
              { item: "Corridor North", meta: "11 reviews", place: "Corridor North", placeMeta: "220 kV", text: "Plan these from risk, not from the calendar.", impact: "11", level: "Forecast", check: "Includes T-104", date: "Next quarter", keys: "Corridor North North Forecast" },
              { item: "T-104", meta: "Pull forward", place: "Corridor North", placeMeta: "Priority 0.69", text: "Bring the tower forward 8 weeks. Threshold is 0.60.", impact: "8 weeks", level: "Pull", check: "Index 61", date: "Next quarter", keys: "Corridor North T-104 Pull" },
              { item: "Coastal", meta: "4 reviews", place: "Coastal", placeMeta: "Exposure", text: "Keep this band separate from the 220 kV corridor.", impact: "4", level: "Forecast", check: "Exposure", date: "Next quarter", keys: "Coastal Coastal Forecast" },
              { item: "Inland", meta: "2 reviews", place: "Inland", placeMeta: "Age", text: "Lower rate. Age is the driver.", impact: "2", level: "Forecast", check: "Age", date: "Next quarter", keys: "Inland Inland Forecast" },
              { item: "Angle", meta: "1 review", place: "Corridor North", placeMeta: "Structure", text: "One angle tower. 11 + 4 + 2 + 1 = 18.", impact: "1", level: "Forecast", check: "Structure", date: "Next quarter", keys: "Corridor North Angle Forecast" },
              { item: "Flights", meta: "Risk plan", place: "Corridor North", placeMeta: "Vs calendar", text: "46 risk-based flights against 22 on the calendar.", impact: "46 vs 22", level: "Forecast", check: "Not flown", date: "Next quarter", keys: "Corridor North North Forecast" }
            ]
          });
        }),
        tab("Blackboard", function () {
          return blackboard({
            focus: ["all", "north"],
            nodes: [
              { id: "coast", name: "Coastal", short: "4", x: 14, y: 26, color: AMBER, tip: "4 reviews. Exposure, separate from this corridor." },
              { id: "inland", name: "Inland", short: "2", x: 30, y: 34, color: TEAL, tip: "2 reviews. Age is the driver." },
              { id: "all", name: "18 reviews", short: "18", x: 22, y: 54, color: RED, tip: "Forecast for next quarter. Not a completed count." },
              { id: "angle", name: "Angle", short: "1", x: 16, y: 76, color: PURPLE, tip: "1 angle-tower review. 11 + 4 + 2 + 1." },
              { id: "hours", name: "72 hours", short: "72", x: 38, y: 74, color: GREEN, tip: "About 4 hours for each of the 18 reviews." },
              { id: "north", name: "Corridor North", short: "11", x: 68, y: 28, color: "#9f1239", tip: "11 reviews, including T-104." },
              { id: "t104", name: "T-104", short: "T104", x: 82, y: 46, color: AMBER, tip: "Pulled 8 weeks forward. Priority 0.69." },
              { id: "flights", name: "46 flights", short: "46", x: 64, y: 62, color: BLUE, tip: "Risk-based flights, against 22 on the calendar." }
            ],
            extra: { id: "alt", name: "Threshold 0.50", short: "0.50", x: 50, y: 14, color: "#64748b", tip: "An alternate threshold would be 27 reviews. The plan uses 0.60." },
            edges: [["coast", "inland", true], ["inland", "all", true], ["all", "angle"], ["angle", "hours", true], ["all", "north", true], ["north", "t104", true], ["north", "flights"], ["alt", "inland"]],
            types: [
              { icon: "link", title: "Zone split", kicker: "TOTAL", value: "18", sub: "Next quarter", body: "North 11, Coastal 4, Inland 2, Angle 1. This is a forecast." },
              { icon: "tower", title: "Pull forward", kicker: "T-104", value: "8 wk", sub: "Priority 0.69", body: "The tower is ahead of the calendar because it is past the 0.60 threshold." },
              { icon: "file", title: "Flights", kicker: "PLAN", value: "46", sub: "Calendar 22", body: "Risk-based flights are the larger set. The calendar still shows 22." },
              { icon: "user", title: "Review time", kicker: "HOURS", value: "72", sub: "Not performed", body: "18 reviews at about 4 hours. None of these hours are completed work." }
            ]
          });
        }),
        tab("Schedule", function () {
          return scheduleBoard({
            day: "Next quarter · forecast",
            lanes: [
              { name: "Corridor North", bars: [
                { left: 33.3, width: 22, fill: "#f8d0e3", ink: "#d56b9a", id: "0011", label: "11 reviews", flag: true, tip: "Includes T-104. A forecast, not a completed count." }
              ] },
              { name: "Coastal", bars: [
                { left: 50, width: 12, fill: "#f8e0b0", ink: "#e09a3e", id: "0004", label: "4 reviews", tip: "Exposure band. Separate from this 220 kV corridor." }
              ] },
              { name: "Inland", bars: [
                { left: 62.5, width: 10, fill: "#c9efef", ink: "#3aabb0", id: "0002", label: "2 reviews", tip: "Lower rate. Age is the driver." }
              ] },
              { name: "Angle towers", bars: [
                { left: 70.8, width: 8, fill: "#ddd4f7", ink: "#6d5bd0", id: "0001", label: "1 review", tip: "Angle structures. 11 + 4 + 2 + 1 = 18." }
              ] },
              { name: "T-104 pull", bars: [
                { left: 25, width: 16, fill: "#f6d7bf", ink: "#d9893a", id: "T104", label: "8 weeks early", flag: true, tip: "Pulled forward because priority is 0.69. Threshold is 0.60." }
              ] },
              { name: "Flight plan", bars: [
                { left: 37.5, width: 18, fill: "#d9f2c8", ink: "#3f8f62", id: "0046", label: "46 flights", tip: "Risk-based flights next quarter, against 22 on the calendar." }
              ] },
              { name: "Review hours", bars: [
                { left: 45.8, width: 14, fill: "#e7f0c8", ink: "#6aaa4a", id: "0072", label: "72 hours", tip: "18 reviews at about 4 hours each. Not yet performed." }
              ] }
            ]
          });
        }),
        tab("Graph", function () {
          return mesh({
            listTitle: "Next quarter",
            focusTitle: "18 reviews",
            focus: "Forecast: 18 inspections require manual engineering review next quarter.",
            list: [
              { title: "Corridor North", meta: "11 reviews", tip: "Includes T-104", body: "Pulled forward because priority is 0.69." },
              { title: "Coastal", meta: "4 reviews", tip: "Exposure band", body: "Separate from the 220 kV corridor." },
              { title: "Inland", meta: "2 reviews", tip: "Age", body: "Lower rate." },
              { title: "Angle", meta: "1 review", tip: "Structure", body: "Angle towers." }
            ],
            nodes: [
              { x: 160, y: 250, color: RED, short: "18", title: "Reviews", tip: "Manual engineering next quarter", body: "A forecast, not a completed count. 11 + 4 + 2 + 1." },
              { x: 370, y: 130, color: "#9f1239", short: "N", title: "North", tip: "11 · T-104", body: "Risk plan, not the calendar." },
              { x: 570, y: 190, color: AMBER, short: "C", title: "Coastal", tip: "4 reviews", body: "Exposure, not this corridor." },
              { x: 390, y: 370, color: TEAL, short: "I", title: "Inland", tip: "2 reviews", body: "Lower demand." },
              { x: 590, y: 360, color: PURPLE, short: "A", title: "Angle", tip: "1 review", body: "Angle structures." }
            ],
            edges: [[0, 1, "11"], [0, 2, "4"], [0, 3, "2"], [0, 4, "1"]],
            columns: ["Zone", "Reviews", "Driver", "State"],
            rows: [
              row(["Corridor North", "11", "T-104 and neighbors", tag("High", "r")], "Risk indicators, not the calendar", kv),
              row(["Coastal", "4", "Exposure", tag("Watch", "a")], "Separate zone", "Coastal"),
              row(["Inland", "2", "Age", tag("Low", "g")], "Lower rate", "Inland"),
              row(["Angle", "1", "Structure", tag("Watch", "a")], "Angle towers", zone)
            ]
          });
        }),
        tab("Next quarter", function () {
          return pack({
            filters: ["Region", "Zone"],
            kpis: k,
            chart: { type: "bar", title: "Inspections forecast to need manual review", labels: ["North", "Coastal", "Inland", "Angle"], series: [{ name: "Reviews", color: RED, values: [11, 4, 2, 1], tips: ["Includes T-104", "Coastal exposure", "Inland", "Angle towers"] }] },
            side: { kicker: "OUTPUT", text: "Forecast: 18 inspections require manual engineering review next quarter.", gauge: { value: 18, label: "Reviews", tip: "11 + 4 + 2 + 1. A forecast, not a completed count." } },
            columns: ["Zone", "Reviews", "Driver", "State"],
            rows: [
              row(["Corridor North", "11", "T-104 and neighbors", tag("High", "r")], "Risk indicators, not the calendar", kv),
              row(["Coastal", "4", "Exposure", tag("Watch", "a")], "Separate zone", "Coastal"),
              row(["Inland", "2", "Age", tag("Low", "g")], "Lower rate", "Inland"),
              row(["Angle", "1", "Structure", tag("Watch", "a")], "Angle towers", zone)
            ]
          });
        }),
        tab("Zones", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Calendar plan versus risk plan", labels: ["North", "Coastal", "Inland", "Angle"], series: [
              { name: "Calendar", color: "#93c5fd", values: [10, 6, 4, 2] },
              { name: "Risk plan", color: RED, values: [22, 10, 8, 6] }
            ] },
            side: { type: "donut", title: "The 18 reviews", parts: [
              { name: "North", value: 11, color: RED, tip: "Corridor North" },
              { name: "Coastal", value: 4, color: AMBER, tip: "Coast" },
              { name: "Inland", value: 2, color: TEAL, tip: "Inland" },
              { name: "Angle", value: 1, color: PURPLE, tip: "Angle" }
            ] },
            columns: ["Zone", "Calendar flights", "Risk flights", "Reviews"],
            rows: [
              row(["North", "10", "22", tag("11", "r")], "Pulls T-104 forward", kv),
              row(["Coastal", "6", "10", tag("4", "a")], "Exposure", "Coastal")
            ]
          });
        }),
        tab("Drivers", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "What moves the 18", items: [
              { label: "Open severity", pct: 86, value: "0.86", color: RED, tip: "T-104 condition severity" },
              { label: "Repeat findings", pct: 70, value: "6", color: AMBER, tip: "Six inspections on T-104" },
              { label: "Age", pct: 55, value: "28 y", color: PURPLE, tip: "In service since 1998" },
              { label: "Weather band", pct: 40, value: "Wind", color: TEAL, tip: "Seasonal wind on the corridor. Not a climate study." }
            ] },
            side: { kicker: "DRIVER", text: "The forecast uses repeated inspections, open findings, age, and a coarse weather band. It is not a published failure probability.", gauge: { value: 18, label: "Reviews", tip: "Next quarter." } },
            columns: ["Driver", "T-104", "Used", "State"],
            rows: [
              row(["Severity", "0.86", "Yes", tag("In", "r")], "From verified findings", kv),
              row(["Age", "28 years", "Yes", tag("In", "b")], "1998", kv),
              row(["Accuracy score", "—", "No", tag("Out", "g")], "Unpublished class metrics are not inputs", kv)
            ]
          });
        })
      ]),
      screen("plan", "Inspection Planning", "inspect", [
        tab("Risk vs calendar", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Flights next quarter", labels: ["North", "Coastal", "Inland", "Angle"], series: [
              { name: "Calendar", color: "#93c5fd", values: [10, 6, 4, 2] },
              { name: "Risk-based", color: BLUE, values: [22, 10, 8, 6] }
            ] },
            side: { kicker: "PLAN", text: "A calendar would fly 22 times and still be late on T-104. The risk plan flies 46 and puts 18 in front of an engineer.", gauge: { value: 46, label: "Flights", tip: "22 + 10 + 8 + 6." } },
            columns: ["Plan", "Flights", "Reviews", "State"],
            rows: [
              row(["Calendar", "22", "Late on T-104", tag("Weak", "a")], "Interval only", zone),
              row(["Risk", "46", "18", tag("Set", "b")], "Indicators", zone)
            ]
          });
        }),
        tab("Calendar", function () {
          return gantt({
            title: "Where the calendar misses T-104",
            ticks: ["W1", "W3", "W5", "W7", "W9", "W11", "W13", ""],
            kpis: k,
            lanes: [
              { name: "Calendar", bars: [{ left: 40, width: 12, color: "#2563eb", label: "Due", tip: "Next calendar visit is mid-quarter" }] },
              { name: "Risk", bars: [{ left: 8, width: 14, color: RED, label: "T-104", tip: "Pulled to the first weeks because priority is 0.69" }] },
              { name: "Others", bars: [{ left: 20, width: 60, color: BLUE, label: "45 flights", tip: "Rest of the risk plan" }] }
            ],
            sideTitle: "Pull-forward",
            bars: [
              { label: "T-104", pct: 100, value: "Now", color: RED, tip: "Already over 0.60" },
              { label: "Quiet spans", pct: 20, value: "Later", color: TEAL, tip: "Not every tower moves up" }
            ]
          });
        }),
        tab("Pull-forward", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Towers moved ahead of their calendar date", labels: ["T-104", "T-103", "T-105", "T-101", "T-110"], series: [{ name: "Weeks early", color: AMBER, values: [8, 2, 2, 0, 0] }] },
            side: { kicker: "EARLY", text: "T-104 moves eight weeks forward. Neighbors move two weeks because they share the visit. Stable towers stay on the calendar.", gauge: { value: 8, label: "Weeks", tip: "T-104 only." } },
            columns: ["Tower", "Weeks early", "Why", "State"],
            rows: [
              row(["T-104", "8", "Priority 0.69", tag("Now", "r")], "Review", kv),
              row(["T-103", "2", "Same visit", tag("With", "a")], "Watch", kv),
              row(["T-101", "0", "In band", tag("Hold", "g")], "Calendar", kv)
            ]
          });
        })
      ]),
      screen("demand", "Maintenance Demand", "demand", [
        tab("Crew", function () {
          return pack({
            kpis: [
              { l: "HV days", v: "14", s: "Next quarter", tip: "Forecast crew-days for high-voltage work, North zone.", spark: [6, 8, 9, 11, 12, 14], color: BLUE },
              { l: "VEG days", v: "6", s: "ROW", tip: "Vegetation days, separate from steel.", spark: [2, 3, 4, 4, 5, 6], color: GREEN },
              { l: "Review hours", v: "72", s: "18 cases × 4 h", tip: "Engineering time, not field time.", spark: [32, 40, 48, 56, 64, 72], color: PURPLE },
              { l: "This visit", v: "17 h", s: "If damper included", tip: "The grouped Corridor North visit.", spark: [8, 10, 12, 14, 16, 17], color: AMBER }
            ],
            chart: { type: "grouped", title: "Crew-days by zone", labels: ["North", "Coastal", "Inland", "Angle"], series: [
              { name: "HV", color: BLUE, values: [14, 5, 3, 2] },
              { name: "VEG", color: GREEN, values: [6, 4, 2, 1] }
            ] },
            side: { kicker: "DEMAND", text: "Most high-voltage days sit on Corridor North, with T-104 inside that zone.", gauge: { value: 14, label: "HV d", tip: "North zone next quarter." } },
            columns: ["Zone", "HV days", "VEG days", "State"],
            rows: [
              row(["North", "14", "6", tag("High", "r")], "Includes the five-task visit", kv),
              row(["Coastal", "5", "4", tag("Mid", "a")], "Lower", "Coastal"),
              row(["Inland", "3", "2", tag("Low", "g")], "Lower", "Inland")
            ]
          });
        }),
        tab("Materials", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Forecast issue quantity", labels: ["Plates", "Pin kits", "Dampers"], series: [{ name: "Units", color: TEAL, values: [3, 12, 4], tips: ["Includes the one PL-220-B already short", "Pin kits across the zone", "Dampers including VD-220"] }] },
            side: { kicker: "STOCK", text: "The current plate shortage is the near-term hole. The quarter needs two more plates beyond it.", gauge: { value: 3, label: "Plates", tip: "Forecast issues." } },
            columns: ["Item", "Forecast", "On hand", "State"],
            rows: [
              row(["PL-220-B", "3", "0", tag("Short", "r")], "Buy before the quarter stacks up", kv),
              row(["CP-12", "12", "40", tag("Covered", "g")], "Bin covers the quarter", kv),
              row(["VD-220", "4", "2", tag("Tight", "a")], "Covers the one job, not the quarter", kv)
            ]
          });
        }),
        tab("Windows", function () {
          return gantt({
            title: "Demand piled into outage weeks",
            ticks: ["W1", "W3", "W5", "W7", "W9", "W11", "W13", ""],
            kpis: k,
            lanes: [
              { name: "North", bars: [{ left: 6, width: 18, color: RED, label: "T-104", tip: "First window, because the review is already due" }, { left: 40, width: 30, color: BLUE, label: "Rest", tip: "Other North work" }] },
              { name: "Coastal", bars: [{ left: 24, width: 20, color: TEAL, label: "4", tip: "Four review cases" }] },
              { name: "Inland", bars: [{ left: 55, width: 14, color: "#2563eb", label: "2", tip: "Two review cases" }] }
            ],
            sideTitle: "Peak",
            bars: [
              { label: "Week 1–2", pct: 90, value: "T-104", color: RED, tip: "Do not leave it on the calendar date" },
              { label: "Mid quarter", pct: 50, value: "Coast", color: TEAL, tip: "Lower" }
            ]
          });
        })
      ]),
      screen("decay", "Asset Deterioration", "decay", [
        tab("T-104", function () {
          return pack({
            kpis: [
              { l: "Index now", v: "61", s: "Was 78", tip: "Six aerial cycles. Lower is worse.", spark: [78, 76, 74, 71, 66, 61], color: RED },
              { l: "Drop", v: "17", s: "Points", tip: "78 to 61.", spark: [0, 2, 4, 7, 12, 17], color: AMBER },
              { l: "Age", v: "28 y", s: "Since 1998", tip: "Age is a model input once the history is long enough.", spark: [23, 24, 25, 26, 27, 28] },
              { l: "Model", v: "Early", s: "Six points", tip: "Longitudinal model is started, not a certified life curve.", spark: [2, 3, 4, 5, 6, 6], color: PURPLE }
            ],
            chart: { type: "area", title: "Condition index · T-104", labels: ["Insp 1", "Insp 2", "Insp 3", "Insp 4", "Insp 5", "Insp 6"], series: [
              { name: "T-104", color: RED, values: [78, 76, 74, 71, 66, 61] },
              { name: "If slope holds", color: "#fca5a5", values: [78, 76, 74, 71, 66, 61] }
            ] },
            side: { kicker: "EARLY", text: "Six inspections are enough to see the drop. They are not enough to publish a life curve. The next point is the one that tests the slope.", gauge: { value: 61, label: "Index", tip: "Current condition index." } },
            columns: ["Cycle", "Index", "Severity", "State"],
            rows: [
              row(["Insp 1", "78", "28", tag("Then", "g")], "Start of the series", kv),
              row(["Insp 6", "61", "86", tag("Now", "r")], "Two verified findings", kv)
            ]
          });
        }),
        tab("Environment", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Coarse exposure band used in the model", labels: ["Wind", "Coast salt", "Inland", "Age > 25"], series: [
              { name: "North", color: BLUE, values: [60, 20, 70, 80] },
              { name: "Coastal", color: TEAL, values: [50, 90, 10, 40] }
            ] },
            side: { kicker: "BAND", text: "Weather enters as a band, not as a site-specific climate study. Coastal salt is high on the coast and low on Corridor North.", gauge: { value: 60, label: "Wind", tip: "Seasonal wind band for Corridor North." } },
            columns: ["Factor", "North", "Coast", "State"],
            rows: [
              row(["Wind", "Seasonal", "Seasonal", tag("Band", "b")], "Coarse", zone),
              row(["Salt", "Low", "High", tag("Band", "a")], "Coastal is the salt case", "Coastal"),
              row(["Age", "28 y on T-104", "Mixed", tag("In", "b")], "Asset age", kv)
            ]
          });
        }),
        tab("Age", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Age of towers with an open record", labels: ["T-104", "T-103", "T-105", "T-101", "T-110"], series: [{ name: "Years", color: PURPLE, values: [28, 28, 28, 21, 21] }] },
            side: { type: "bars", title: "Same age, different index", items: [
              { label: "T-104", pct: 61, value: "61", color: RED, tip: "Age 28, index 61" },
              { label: "T-103", pct: 74, value: "74", color: AMBER, tip: "Age 28, index 74" },
              { label: "T-101", pct: 88, value: "88", color: TEAL, tip: "Age 21, index 88" }
            ] },
            columns: ["Tower", "Year in service", "Index", "State"],
            rows: [
              row(["T-104", "1998", "61", tag("Review", "r")], "Age alone does not explain the gap to T-103", kv),
              row(["T-103", "1998", "74", tag("Watch", "a")], "Same year, better index", kv)
            ]
          });
        })
      ]),
      screen("scenario", "Scenario Analysis", "scenario", [
        tab("Base", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Base forecast · manual reviews", labels: ["North", "Coastal", "Inland", "Angle"], series: [{ name: "Reviews", color: BLUE, values: [11, 4, 2, 1] }] },
            side: { kicker: "BASE", text: "Forecast: 18 inspections require manual engineering review next quarter.", gauge: { value: 18, label: "Base", tip: "Current indicators." } },
            columns: ["Zone", "Reviews", "Flights", "State"],
            rows: [
              row(["North", "11", "22", tag("Base", "b")], "Includes T-104", kv),
              row(["All zones", "18", "46", tag("Base", "b")], "Sum", zone)
            ]
          });
        }),
        tab("More reviews", function () {
          return pack({
            kpis: [
              { l: "Reviews", v: "27", s: "If threshold drops to 0.50", tip: "More towers cross the line.", spark: [18, 20, 22, 24, 26, 27], color: RED },
              { l: "Added", v: "+9", s: "Mostly neighbors", tip: "T-105 and similar move in.", spark: [0, 2, 4, 6, 8, 9], color: AMBER },
              { l: "Engineer hours", v: "108", s: "27 × 4 h", tip: "Review time, not field time.", spark: [72, 80, 88, 96, 100, 108], color: PURPLE },
              { l: "T-104", v: "Still in", s: "Either threshold", tip: "0.69 clears both 0.60 and 0.50.", spark: [1, 1, 1, 1, 1, 1], color: RED }
            ],
            chart: { type: "grouped", title: "Threshold 0.60 versus 0.50", labels: ["North", "Coastal", "Inland", "Angle"], series: [
              { name: "0.60", color: BLUE, values: [11, 4, 2, 1] },
              { name: "0.50", color: RED, values: [16, 6, 3, 2] }
            ] },
            side: { kicker: "IF", text: "Lowering the review line from 0.60 to 0.50 adds 9 cases. T-104 is in both.", gauge: { value: 27, label: "Reviews", tip: "Alternate threshold." } },
            columns: ["Threshold", "Reviews", "Hours", "State"],
            rows: [
              row(["0.60", "18", "72", tag("Base", "b")], "Current rule", zone),
              row(["0.50", "27", "108", tag("Alt", "a")], "More engineer time", zone)
            ]
          });
        }),
        tab("Deferred", function () {
          return pack({
            kpis: [
              { l: "If T-104 waits", v: "+8 w", s: "Back on calendar", tip: "Returns to the calendar date.", spark: [0, 2, 4, 6, 8, 8], color: RED },
              { l: "Index if slope holds", v: "54", s: "Not a promise", tip: "Another 7 points if the recent slope continued. Early model only.", spark: [61, 59, 58, 56, 55, 54], color: AMBER },
              { l: "Visit still groups", v: "4", s: "Without steel", tip: "Plate shortage can force steel off this week.", spark: [5, 5, 4, 4, 4, 4] },
              { l: "Review queue", v: "18", s: "Unchanged", tip: "Deferring the visit does not remove the review.", spark: [18, 18, 18, 18, 18, 18], color: PURPLE }
            ],
            chart: { type: "area", title: "Index path if the recent slope continued", labels: ["Now", "+2w", "+4w", "+6w", "+8w"], series: [{ name: "Illustrative", color: RED, values: [61, 59, 57, 55, 54], tips: ["Now", "Not a certified forecast point", "Not a certified forecast point", "Not a certified forecast point", "Calendar date, illustrative only"] }] },
            side: { kicker: "DEFER", text: "Leaving T-104 on the calendar does not clear the review. The slope line is illustrative from six points, not a life certificate.", gauge: { value: 8, label: "Weeks", tip: "Delay back to the calendar." } },
            columns: ["Choice", "Review", "Visit", "State"],
            rows: [
              row(["Pull forward", "This month", "5 tasks", tag("Base", "b")], "Current plan", kv),
              row(["Wait for plate", "Still due", "Steel slips", tag("Alt", "a")], "18 day lead", kv),
              row(["Ignore", "Still due", "Calendar", tag("Weak", "r")], "Priority stays 0.69", kv)
            ]
          });
        })
      ])
    ];
  }

  function finance() {
    var k = [
      { l: "Approved budget", v: "$4.80M", s: "Corridor North year", tip: "Approved maintenance budget for the corridor.", spark: [4.8, 4.8, 4.8, 4.8, 4.8, 4.8], color: BLUE },
      { l: "Spent YTD", v: "$2.15M", s: "Actual", tip: "Labor, equipment, and materials posted.", spark: [0.4, 0.8, 1.2, 1.6, 1.9, 2.15], color: TEAL },
      { l: "Left in budget", v: "$2.65M", s: "4.80 − 2.15", tip: "Unspent approved budget.", spark: [4.4, 4.0, 3.6, 3.2, 2.9, 2.65], color: GREEN },
      { l: "Repair backlog", v: "$1.26M", s: "Estimated", tip: "Estimated cost of the remaining repair backlog, including this visit.", spark: [0.9, 1.0, 1.1, 1.15, 1.2, 1.26], color: AMBER }
    ];
    return [
      drawingScreen([
        { tab: "Budget", src: "/pids/nx-fin-pfd-0480-budget.svg", kicker: "Corridor North budget", note: "Headroom is unspent budget minus the backlog. It is not a saving." },
        { tab: "Cost flow", src: "/pids/nx-fin-pfd-1001-cost.svg", kicker: "This visit", note: "Labor $8.3k, equipment $14.4k, materials $6.2k. Visit $28.8k." }
      ]),
      screen("cost", "Maintenance Cost Dashboard", "cost", [
        tab("Production", function () {
          return prodBoard({
            title: "Cost picture",
            lede: "Approved budget against the recorded spend and the visit estimate. The visit is not a saving.",
            kpis: [
              { k: "Approved", v: "$4.80M", tip: "Corridor North budget." },
              { k: "Spent", v: "$2.15M", tip: "About 45% of the approved budget." },
              { k: "Backlog", v: "$1.26M", tip: "Estimated remaining repair backlog." },
              { k: "Visit", v: "$28.8k", tip: "Labor $8.3k, equipment $14.4k, materials $6.2k. Not a saving." }
            ],
            bars: { title: "Visit estimate, $k", unit: "The three cost types sum to $28.8k.", labels: ["Labor", "Equipment", "Materials"], values: [8.3, 14.4, 6.2], max: 30 },
            lines: { title: "Running share of the visit", unit: "Adds to $28.8k. Not a recorded saving.", max: 30, labels: ["T-104", "Held", "N-19", "Check"], series: [
              { name: "Running share, $k", color: "#3b6fd8", values: [18.4, 24.5, 27.7, 28.8] }
            ] },
            stack: { title: "Two cuts of the same $28.8k", unit: "Do not add the colors together.", labels: ["Labor", "Equipment", "Materials", "T-104", "Held", "N-19", "Check"], series: [
              { name: "Cost type", color: "#3b6fd8", values: [8.3, 14.4, 6.2, 0, 0, 0, 0] },
              { name: "Package share", color: "#3d9a78", values: [0, 0, 0, 18.4, 6.1, 3.2, 1.1] }
            ] },
            rank: { title: "Visit lines, $k", unit: "Largest first when Top is selected.", rows: [
              { name: "T-104", value: 18.4 }, { name: "Equipment", value: 14.4 }, { name: "Labor", value: 8.3 }, { name: "Materials", value: 6.2 }, { name: "Held", value: 6.1 }, { name: "N-19", value: 3.2 }, { name: "Check", value: 1.1 }
            ] }
          });
        }),
        tab("Sourcing", function () {
          return sourceBoard({
            cards: [
              { k: "Approved budget", v: "$4.80M", s: "Corridor North", spark: [4.8, 4.8], tip: "Approved. Not a saving." },
              { k: "Spent year to date", v: "$2.15M", s: "About 45%", spark: [2.15, 2.15], tip: "$2.15M of $4.80M." },
              { k: "Repair backlog", v: "$1.26M", s: "Estimate", spark: [1.26, 1.26], tip: "Estimated remaining repair backlog." },
              { k: "Visit estimate", v: "$28.8k", s: "Not a saving", spark: [8.3, 14.4, 6.2], tip: "Labor $8.3k, equipment $14.4k, materials $6.2k." },
              { k: "Headroom", v: "$1.39M", s: "Only if estimates hold", spark: [1.39, 1.39], tip: "$2.65M remaining minus the $1.26M backlog. Not a recorded saving." }
            ],
            side: { title: "Not a recorded saving", rows: [{ k: "Labor", v: "$8.3k" }, { k: "Equipment", v: "$14.4k" }, { k: "Materials", v: "$6.2k" }, { k: "T-104", v: "$18.4k" }], foot: "The visit is about 2% of the backlog. Orders are staged, not placed." },
            chartTitle: "Two cuts of the $28.8k visit",
            labels: ["Labor", "Equipment", "Materials", "T-104", "Held", "N-19", "Check"],
            bars: [
              { name: "Cost type, $k", color: "#6b5bd2", values: [8.3, 14.4, 6.2, 0, 0, 0, 0] },
              { name: "Package share, $k", color: "#3d9a78", values: [0, 0, 0, 18.4, 6.1, 3.2, 1.1] }
            ],
            line: { name: "Running share of $28.8k", color: "#14b8a6", values: [null, null, null, 18.4, 24.5, 27.7, 28.8] },
            leftMax: 30, rightMax: 30,
            band: "The two bar colors are two cuts of the same visit, not an extra total.",
            split: "$28.8k visit. No recorded saving."
          });
        }),
        tab("Overview", function () {
          return optBoard({
            recent: "Most recent cost picture",
            cards: [
              { k: "Approved", v: "$4.80M", delta: "Corridor North", tone: "flat", spark: [4.8, 4.8, 4.8, 4.8], caption: "Full year", tip: "Approved maintenance budget." },
              { k: "Spent", v: "$2.15M", delta: "About 45%", tone: "flat", spark: [0.4, 0.8, 1.2, 1.6, 1.9, 2.15], caption: "Year to date", tip: "Actual spend against $4.80M." },
              { k: "Backlog", v: "$1.26M", delta: "Estimate", tone: "flat", spark: [1.26, 1.26], caption: "Remaining repair", tip: "Estimated. Not a recorded saving." },
              { k: "Visit", v: "$28.8k", delta: "Not a saving", tone: "flat", spark: [8.3, 14.4, 6.2], caption: "About 2% of the backlog", tip: "Not spent." }
            ],
            facts: [
              { k: "Current status", v: "Estimate", dot: true },
              { k: "Approved", v: "$4.80M" },
              { k: "Spent", v: "$2.15M" },
              { k: "Remaining", v: "$2.65M" },
              { k: "Backlog", v: "$1.26M" },
              { k: "Orders", v: "Staged" }
            ],
            rows: [
              { name: "Labor", unit: "$k", recorded: "96h", current: "$8.3k", change: "In the visit", tone: "flat", note: "Labor is $8.3k of the $28.8k visit. It is not spent." },
              { name: "Equipment", unit: "$k", recorded: "Visit", current: "$14.4k", change: "In the visit", tone: "flat", note: "Equipment is $14.4k of the visit estimate." },
              { name: "Materials", unit: "$k", recorded: "Quote", current: "$6.2k", change: "Not placed", tone: "down", note: "Materials are $6.2k. The plate quote is still a draft." },
              { name: "T-104", unit: "$k", recorded: "Visit", current: "$18.4k", change: "Share of $28.8k", tone: "flat", note: "T-104 is $18.4k of the visit. Repair versus replace remains a planning scenario." },
              { name: "Held", unit: "$k", recorded: "Damper", current: "$6.1k", change: "Held", tone: "down", note: "The damper share is $6.1k and stays held." }
            ],
            slides: [
              "Approved budget is $4.80M. Estimated remaining repair backlog is $1.26M. The visit is $28.8k.",
              "Spent year to date is $2.15M. Remaining approved budget is $2.65M.",
              "Labor is $8.3k, equipment $14.4k, and materials $6.2k. T-104 is $18.4k. The damper share of $6.1k is held.",
              "Headroom of $1.39M only exists if the estimates hold. It is not a recorded saving. Orders are staged, not placed."
            ],
            chartTitle: "Visit estimate, $k",
            chart: { max: 30, labels: ["Labor", "Equipment", "Materials", "T-104", "Held"], series: [
              { name: "Visit, $k", color: "#2563eb", values: [8.3, 14.4, 6.2, 18.4, 6.1] }
            ] }
          });
        }),
        tab("Matrix", function () {
          return matrixBoard({
            title: "Budget Collection Matrix",
            date: "Year to date",
            operation: "Corridor North maintenance budget",
            heading: "Budget hierarchy",
            chip: "Visit",
            legend: [["agency", "Budget"], ["collected", "Posted"], ["scheduled", "Estimated"], ["unscheduled", "Not spent"], ["held", "Held"], ["risk", "Open"]],
            conflict: { k: "Schedule conflicts", v: "1 hold", tip: "The damper share of $6.1k stays inside the visit estimate and is not released." },
            metrics: [
              { k: "Approved", v: "$4.80M", tip: "Full-year Corridor North maintenance budget." },
              { k: "Spent", v: "$2.15M", tip: "Year-to-date actual." },
              { k: "Remaining", v: "$2.65M", tip: "Approved minus year-to-date actual." },
              { k: "Backlog", v: "$1.26M", tip: "Estimated remaining repair backlog." },
              { k: "Visit", v: "$28.8k", tip: "About 2% of the backlog. Not a saving." },
              { k: "Headroom", v: "$1.39M", tip: "Remaining budget minus the backlog estimate, if both hold. Not a saving." }
            ],
            score: { value: 45, label: "Spent", tip: "Year-to-date $2.15M of the $4.80M approved budget." },
            focus: "budget",
            nodes: [
              { id: "budget", kind: "rollup", name: "Budget", mark: "$4.80M", status: "agency", x: 50, y: 16, tag: "Visit", description: "Approved budget is $4.80M. Spent year to date is $2.15M.", source: "Remaining approved budget is $2.65M.", basic: [["Approved", "$4.80M"], ["Spent", "$2.15M"], ["Remaining", "$2.65M"]] },
              { id: "year", kind: "parent", name: "This year", status: "parent", x: 50, y: 48, tag: "Visit", description: "Estimated remaining repair backlog is $1.26M. Headroom is $1.39M only if those estimates hold.", source: "Headroom is not a recorded saving.", basic: [["Backlog", "$1.26M"], ["Headroom", "$1.39M"], ["Orders", "Staged"]] },
              { id: "visit", kind: "leaf", name: "Visit", mark: "$28.8k", status: "scheduled", x: 28, y: 80, tag: "Visit", description: "The five-task visit is estimated at $28.8k. It is not spent.", source: "Labor $8.3k, equipment $14.4k, materials $6.2k. T-104 is $18.4k.", basic: [["Visit", "$28.8k"], ["T-104", "$18.4k"], ["Held", "$6.1k"]] },
              { id: "backlog", kind: "leaf", name: "Backlog", mark: "$1.26M", status: "held", x: 72, y: 80, tag: "Backlog", description: "The backlog is an estimate of remaining repair work, including this visit.", source: "About 2% of it is the $28.8k visit.", basic: [["Estimate", "$1.26M"], ["Visit share", "About 2%"], ["Spent", "No"]] }
            ],
            edges: [["budget", "year"], ["year", "visit"], ["year", "backlog"]]
          });
        }),
        tab("Forecast", function () {
          return planBoard({
            next: "The visit estimate is not spent, and it is not a recorded saving.",
            start: "Year start",
            end: "Year to date",
            chart: {
              title: "Visit estimate, $k",
              max: 30,
              labels: ["Labor", "Equipment", "Materials"],
              stacks: [
                { name: "Labor", color: "#6b5bd2", values: [8.3, 0, 0] },
                { name: "Equipment", color: "#e07a9a", values: [0, 14.4, 0] },
                { name: "Materials", color: "#f0a05a", values: [0, 0, 6.2] }
              ]
            },
            quiet: ["Corridor=Corridor North", "Voltage=220 kV", "Window=This visit", "Source=Plan"],
            views: [
              {
                when: "", badge: "About 2% of the backlog", hero: { v: "$28.8k", k: "Visit estimate" }, leftTitle: "Visit estimate", rightTitle: "Approved budget",
                left: [{ k: "Visit", v: "$28.8k" }, { k: "T-104 share", v: "$18.4k" }, { k: "Held", v: "$6.1k" }],
                right: [{ k: "Approved", v: "$4.80M" }, { k: "Spent YTD", v: "$2.15M" }, { k: "Remaining", v: "$2.65M" }],
                bandTitle: "Corridor North", bandNote: "Estimates are not recorded savings. Orders are staged, not placed.",
                band: [{ k: "Backlog", v: "$1.26M", pill: "Estimate" }, { k: "Headroom", v: "$1.39M", pill: "If estimates hold" }, { k: "Materials", v: "$6.2k", pill: "In the visit" }],
                summary: "Approved budget is $4.80M. Estimated remaining repair backlog is $1.26M. The visit is $28.8k.",
                more: "Labor is $8.3k, equipment $14.4k, and materials $6.2k. T-104 is $18.4k of the visit, span N-18 is $6.1k and held, N-19 is $3.2k, and the T-103 check is $1.1k. Headroom if the estimates hold is $2.65M minus $1.26M, which is $1.39M. That is not a saving. Repair versus replace is a planning scenario: repair $18.4k over 8 years, or replace the member at $64k over 30 years. The capital ask of $0.64M is a draft and excludes T-104.",
                ring: 45, ringLabel: "Spent", ringTip: "Year-to-date actual $2.15M of the $4.80M approved budget."
              },
              {
                when: "Corridor=Coastal", badge: "Separate budget", leftTitle: "Coastal", rightTitle: "Not T-104",
                left: [{ k: "Approved", v: "$1.80M" }, { k: "Spent YTD", v: "$0.84M" }, { k: "T-104", v: "No" }],
                right: [{ k: "North approved", v: "$4.80M" }, { k: "North spent", v: "$2.15M" }, { k: "This visit", v: "$28.8k" }],
                bandTitle: "Coastal budget", bandNote: "A separate budget. It does not fund T-104.",
                band: [{ k: "Approved", v: "$1.80M", pill: "Coastal" }, { k: "Spent", v: "$0.84M", pill: "YTD" }, { k: "T-104", v: "No", pill: "Other corridor" }],
                summary: "The Coastal budget is $1.80M, with $0.84M spent year to date. It does not include T-104.",
                more: "Corridor North remains the $4.80M budget. The visit estimate stays on North.",
                ring: 47, ringLabel: "Spent", ringTip: "Year-to-date $0.84M of the $1.80M Coastal budget."
              },
              {
                when: "Corridor=Inland", badge: "Separate budget", leftTitle: "Inland", rightTitle: "Not T-104",
                left: [{ k: "Approved", v: "$0.90M" }, { k: "Spent YTD", v: "$0.46M" }, { k: "T-104", v: "No" }],
                right: [{ k: "North approved", v: "$4.80M" }, { k: "North spent", v: "$2.15M" }, { k: "This visit", v: "$28.8k" }],
                bandTitle: "Inland budget", bandNote: "A separate budget. It does not fund T-104.",
                band: [{ k: "Approved", v: "$0.90M", pill: "Inland" }, { k: "Spent", v: "$0.46M", pill: "YTD" }, { k: "T-104", v: "No", pill: "Other corridor" }],
                summary: "The Inland budget is $0.90M, with $0.46M spent year to date. It does not include T-104.",
                more: "Corridor North remains the $4.80M budget. The visit estimate stays on North.",
                ring: 51, ringLabel: "Spent", ringTip: "Year-to-date $0.46M of the $0.90M Inland budget."
              },
              {
                when: "Work=Steel", badge: "In the visit", leftTitle: "T-104 share", rightTitle: "Visit",
                left: [{ k: "T-104", v: "$18.4k" }, { k: "Repair case", v: "$18.4k", note: "8 years" }, { k: "Replace case", v: "$64k", note: "30 years" }],
                right: [{ k: "Full visit", v: "$28.8k" }, { k: "Held damper", v: "$6.1k" }, { k: "Spent", v: "No" }],
                bandTitle: "Planning scenario", bandNote: "Repair and replace are scenarios. Neither is spent.",
                band: [{ k: "Repair", v: "$18.4k", pill: "8 years" }, { k: "Replace", v: "$64k", pill: "30 years" }, { k: "Capital ask", v: "$0.64M", pill: "Excludes T-104", tone: "down" }],
                summary: "T-104's share of the visit is $18.4k. The replace case is $64k and is only a planning scenario.",
                more: "The $0.64M capital ask is a draft for other members and does not include T-104. Nothing in this card has been spent.",
                ring: 64, ringLabel: "Of the visit", ringTip: "$18.4k is about 64% of the $28.8k visit estimate. Not spent."
              }
            ]
          });
        }),
        tab("Issues", function () {
          return issueBoard({
            heading: "Visit cost inside the budget",
            updated: "Estimate, not spent",
            note: "Cell strength is the share of the $28.8k visit, except the budget row, which is the share of $4.80M.",
            cols: ["Labor", "Equipment", "Materials", "T-104", "Held", "Visit"],
            cards: [
              { name: "Visit", score: "28.8", lines: [["Unit", "$k"], ["Share of backlog", "About 2%"], ["Spent", "No"]], detail: "The five-task visit is estimated at $28.8k. It is not a recorded saving." },
              { name: "T-104 share", score: "18.4", lines: [["Covers", "Steel and cotter"], ["Unit", "$k"], ["Spent", "No"]], detail: "T-104 is $18.4k of the visit." },
              { name: "Equipment", score: "14.4", lines: [["Unit", "$k"], ["Largest slice", "Yes"], ["Spent", "No"]], detail: "Equipment is $14.4k, the largest slice of this visit." },
              { name: "Labor", score: "8.3", lines: [["Hours", "96"], ["Rate", "$86"], ["Unit", "$k"]], detail: "Labor is $8.3k from 96 hours at $86." },
              { name: "Materials", score: "6.2", lines: [["Plate", "$4.2k"], ["Damper", "$1.7k"], ["Pins", "$0.3k"]], detail: "Materials are $6.2k. The plate quote is included and the purchase is not placed." }
            ],
            groups: [
              { name: "Money", rows: [
                { name: "This visit", values: [29, 50, 22, 64, 21, 100], notes: ["Labor $8.3k", "Equipment $14.4k", "Materials $6.2k", "T-104 $18.4k", "Damper held $6.1k", "Visit $28.8k"] },
                { name: "Full year", values: [45, null, null, 26, null, 100], notes: ["Spent $2.15M of $4.80M", "Not a year figure", "Not a year figure", "Backlog $1.26M of $4.80M", "Not a year figure", "Approved $4.80M"] }
              ] }
            ],
            trendTitle: "Visit slices, $ thousands.",
            trend: { labels: ["Labor", "Equip", "Material", "T-104", "Held"], values: [8.3, 14.4, 6.2, 18.4, 6.1], max: 30 }
          });
        }),
        tab("Entities", function () {
          return entityBoard({
            focus: "budget",
            types: ENT_TYPES,
            nodes: [
              { id: "spent", type: "report", name: "Spent", short: "2.15", x: 50, y: 20, summary: "$2.15M posted year to date.", status: "POSTED", tone: "g", props: [["Amount", "$2.15M"], ["Through", "June"]], sourceTitle: "Actuals", source: "Labor, equipment, and materials already posted.", recorded: "YTD", updated: "Posted" },
              { id: "backlog", type: "report", name: "Backlog", short: "1.26", x: 68, y: 26, summary: "$1.26M estimated remaining repair backlog.", status: "ESTIMATE", tone: "a", props: [["Amount", "$1.26M"], ["Unspent", "$2.65M"]], sourceTitle: "Planning estimate", source: "Fits inside what is still unspent, if the estimates hold.", recorded: "Now", updated: "Open" },
              { id: "budget", type: "report", name: "Budget", short: "4.80", x: 42, y: 48, summary: "Approved maintenance budget is $4.80M.", status: "SET", tone: "b", props: [["Approved", "$4.80M"], ["Corridor", "North"]], sourceTitle: "Budget file", source: "Full-year Corridor North maintenance budget.", recorded: "Year", updated: "Set" },
              { id: "held", type: "part", name: "N-18 held", short: "6.1", x: 24, y: 70, summary: "$6.1k damper share stays held.", status: "HELD", tone: "a", props: [["Amount", "$6.1k"], ["Release", "No"]], sourceTitle: "Visit estimate", source: "In the estimate. Not released.", recorded: "Now", updated: "Held" },
              { id: "t104", type: "tower", name: "T-104 share", short: "18.4", x: 48, y: 74, summary: "$18.4k of the visit. Steel and cotter.", status: "IN VISIT", tone: "a", props: [["Amount", "$18.4k"]], sourceTitle: "Visit estimate", source: "Most of the $28.8k visit.", recorded: "Now", updated: "Not spent" },
              { id: "visit", type: "report", name: "Visit", short: "28.8", x: 74, y: 66, summary: "$28.8k if all five tasks run. About 2% of the backlog.", status: "ESTIMATE", tone: "b", props: [["Labor", "$8.3k"], ["Equipment", "$14.4k"], ["Materials", "$6.2k"]], sourceTitle: "Visit estimate", source: "Not a recorded saving.", recorded: "Now", updated: "Not spent" }
            ],
            edges: [["budget", "spent", "spent"], ["budget", "backlog", "open"], ["backlog", "visit", "part"], ["visit", "t104", "tower"], ["visit", "held", "held"], ["budget", "visit", "within"]]
          });
        }),
        tab("Recommendations", function () {
          return recommendBoard({
            costTitle: "Visit against the backlog",
            costMax: 30,
            cost: [
              { label: "Visit $28.8k", value: 28.8, color: "#e07a3d", tip: "About 2% of the $1.26M remaining repair estimate." },
              { label: "Held $6.1k", value: -6.1, color: "#3d9a78", tip: "Damper dollars stay in the estimate and are not released." }
            ],
            levelTitle: "Budget use, $M",
            levelLabels: ["Approved", "Spent", "Left", "Backlog"],
            levelValues: [100, 45, 55, 26],
            levelTip: "Approved $4.80M. Spent $2.15M. Backlog estimate $1.26M, shown against the $4.80M scale.",
            groups: recGroups(["T-104", "N-18", "N-19", "Budget"], ["Open", "Held", "Set"]),
            rows: [
              { item: "Budget", meta: "Approved", place: "Corridor North", placeMeta: "Full year", text: "Approved maintenance budget is $4.80M. Spent year to date is $2.15M.", impact: "$4.80M", level: "Set", check: "Posted $2.15M", date: "YTD", keys: "Corridor North Budget Set" },
              { item: "Backlog", meta: "Estimate", place: "Corridor North", placeMeta: "Remaining", text: "The $1.26M repair estimate fits inside the $2.65M still unspent.", impact: "$1.26M", level: "Open", check: "Estimate", date: "Now", keys: "Corridor North Budget Open" },
              { item: "Visit", meta: "Five tasks", place: "Corridor North", placeMeta: "Wednesday", text: "Carry $28.8k for the visit. T-104 is $18.4k of it.", impact: "$28.8k", level: "Open", check: "Not spent", date: "Now", keys: "Corridor North T-104 Open" },
              { item: "N-18", meta: "Damper", place: "N-18", placeMeta: "Held", text: "Keep $6.1k in the estimate and do not release it.", impact: "$6.1k", level: "Held", check: "Not issued", date: "Now", keys: "Corridor North N-18 Held" },
              { item: "N-19", meta: "ROW", place: "N-19", placeMeta: "Released", text: "Vegetation share of the same visit is $3.2k.", impact: "$3.2k", level: "Open", check: "In the visit", date: "Now", keys: "Corridor North N-19 Open" }
            ]
          });
        }),
        tab("Blackboard", function () {
          return blackboard({
            focus: ["budget", "backlog"],
            nodes: [
              { id: "spent", name: "Spent", short: "2.15", x: 14, y: 26, color: TEAL, tip: "$2.15M posted year to date." },
              { id: "labor", name: "Labor", short: "8.3", x: 30, y: 34, color: GREEN, tip: "$8.3k of the visit. 96 hours at $86." },
              { id: "budget", name: "Budget", short: "4.80", x: 22, y: 54, color: BLUE, tip: "$4.80M approved for Corridor North." },
              { id: "equip", name: "Equipment", short: "14.4", x: 16, y: 76, color: PURPLE, tip: "$14.4k. Largest slice of the visit." },
              { id: "mat", name: "Materials", short: "6.2", x: 38, y: 74, color: AMBER, tip: "Plate $4.2k, damper $1.7k, pins $0.3k." },
              { id: "backlog", name: "Backlog", short: "1.26", x: 68, y: 28, color: AMBER, tip: "$1.26M estimated remaining repair backlog." },
              { id: "t104", name: "T-104", short: "18.4", x: 82, y: 46, color: "#9f1239", tip: "$18.4k of the visit. Steel and cotter." },
              { id: "visit", name: "Visit", short: "28.8", x: 64, y: 62, color: PURPLE, tip: "$28.8k if all five tasks run. About 2% of the backlog." }
            ],
            extra: { id: "head", name: "Headroom", short: "1.39", x: 50, y: 14, color: "#64748b", tip: "$2.65M still unspent minus the $1.26M backlog, if the estimates hold." },
            edges: [["spent", "labor", true], ["labor", "budget", true], ["budget", "equip"], ["equip", "mat", true], ["budget", "backlog", true], ["backlog", "t104", true], ["backlog", "visit"], ["head", "labor"]],
            types: [
              { icon: "link", title: "Approved", kicker: "YEAR", value: "$4.80M", sub: "Corridor North", body: "The full-year maintenance budget. Spent year to date is $2.15M." },
              { icon: "file", title: "Backlog", kicker: "ESTIMATE", value: "$1.26M", sub: "Still open", body: "The remaining repair estimate fits inside the $2.65M that is still unspent." },
              { icon: "tower", title: "This visit", kicker: "NOW", value: "$28.8k", sub: "Five tasks", body: "T-104 is $18.4k of that. The damper share stays held." },
              { icon: "user", title: "Materials", kicker: "PARTS", value: "$6.2k", sub: "Not all issued", body: "The plate quote is included. The purchase is not placed." }
            ]
          });
        }),
        tab("Schedule", function () {
          return scheduleBoard({
            day: "Wednesday · visit cost",
            lanes: [
              { name: "Labor", bars: [
                { left: 33.3, width: 14, fill: "#d9f2c8", ink: "#3f8f62", id: "LAB", label: "$8.3k", tip: "96 hours × $86. Part of the $28.8k visit." }
              ] },
              { name: "Equipment", bars: [
                { left: 48, width: 16, fill: "#ddd4f7", ink: "#6d5bd0", id: "EQP", label: "$14.4k", tip: "Largest slice of this visit." }
              ] },
              { name: "Materials", bars: [
                { left: 64, width: 12, fill: "#f8e0b0", ink: "#e09a3e", id: "MAT", label: "$6.2k", tip: "Plate $4.2k, damper $1.7k, pins $0.3k." }
              ] },
              { name: "T-104 share", bars: [
                { left: 33.3, width: 20, fill: "#f8d0e3", ink: "#d56b9a", id: "104", label: "$18.4k", flag: true, tip: "Steel and cotter. Most of the visit cost." }
              ] },
              { name: "N-18 held", bars: [
                { left: 54.2, width: 10, fill: "#f6d7bf", ink: "#d9893a", id: "018", label: "$6.1k", flag: true, tip: "Damper cost stays in the estimate and is not released." }
              ] },
              { name: "N-19 ROW", bars: [
                { left: 41.7, width: 10, fill: "#c9efef", ink: "#3aabb0", id: "019", label: "$3.2k", tip: "Vegetation share of the same visit." }
              ] },
              { name: "Budget", bars: [
                { left: 25, width: 50, fill: "#e7f0c8", ink: "#6aaa4a", id: "4.8", label: "$4.80M approved", tip: "Full-year Corridor North budget. Spent $2.15M. Backlog estimate $1.26M." }
              ] }
            ]
          });
        }),
        tab("Graph", function () {
          return mesh({
            listTitle: "Corridor North",
            focusTitle: "Budget",
            focus: "Approved maintenance budget is $4.80M. Estimated cost of the remaining repair backlog is $1.26M.",
            list: [
              { title: "Approved", meta: "$4.80M", tip: "Full-year maintenance budget", body: "Corridor North." },
              { title: "Spent", meta: "$2.15M", tip: "Year to date", body: "Labor, equipment, and materials posted." },
              { title: "Backlog", meta: "$1.26M", tip: "Remaining repair estimate", body: "Fits inside the $2.65M still unspent." },
              { title: "This visit", meta: "$28.8k", tip: "Five tasks if all run", body: "About 2% of the backlog. T-104 carries most of it." }
            ],
            nodes: [
              { x: 150, y: 250, color: BLUE, short: "4.8", title: "Budget", tip: "$4.80M approved", body: "Corridor North full year." },
              { x: 360, y: 130, color: TEAL, short: "2.2", title: "Spent", tip: "$2.15M YTD", body: "Posted actuals through June." },
              { x: 560, y: 180, color: AMBER, short: "1.3", title: "Backlog", tip: "$1.26M estimate", body: "Remaining repair backlog." },
              { x: 390, y: 370, color: "#9f1239", short: "T104", title: "T-104", tip: "$18.4k share", body: "Steel and cotter inside the visit." },
              { x: 590, y: 360, color: PURPLE, short: "28", title: "Visit", tip: "$28.8k", body: "Labor, equipment, and the three material lines." }
            ],
            edges: [[0, 1, "spent"], [0, 2, "open"], [2, 4, "part"], [4, 3, "tower"]],
            columns: ["Line", "Amount", "Meaning", "State"],
            rows: [
              row(["Approved", "$4.80M", "Full year", tag("Set", "b")], "Corridor North", kv),
              row(["Spent", "$2.15M", "YTD actual", tag("Posted", "g")], "Through June", kv),
              row(["Backlog", "$1.26M", "Estimate", tag("Open", "a")], "Includes the $28.8k visit", kv),
              row(["Visit", "$28.8k", "This outage", tag("Now", "r")], "T-104 is most of the visit cost", kv)
            ]
          });
        }),
        tab("Visit", function () {
          return pack({
            filters: ["Region", "Corridor"],
            kpis: [
              { l: "This visit", v: "$28.8k", s: "If all five run", tip: "Labor $8.3k, equipment $14.4k, materials $6.2k.", spark: [12, 16, 20, 24, 27, 28.8], color: BLUE },
              { l: "Labor", v: "$8.3k", s: "96 h × $86", tip: "Blended field rate.", spark: [4, 5, 6, 7, 8, 8.3], color: TEAL },
              { l: "Equipment", v: "$14.4k", s: "Outage plant", tip: "Access and outage equipment.", spark: [8, 10, 12, 13, 14, 14.4], color: PURPLE },
              { l: "Materials", v: "$6.2k", s: "Includes the plate", tip: "Plate $4.2k, damper $1.7k, pins $0.3k.", spark: [1, 2, 3, 4, 5, 6.2], color: AMBER }
            ],
            chart: { type: "bar", title: "Visit cost mix · $ thousands", labels: ["Labor", "Equipment", "Plate", "Damper", "Pins"], series: [{ name: "$k", color: BLUE, values: [8.3, 14.4, 4.2, 1.7, 0.3] }] },
            side: { kicker: "VISIT", text: "The five-task visit is estimated at $28.8k. It is one piece of the $1.26M backlog, not the whole backlog.", gauge: { value: 29, label: "$k", tip: "$28.8k rounded on the ring." } },
            columns: ["Piece", "Amount", "Basis", "State"],
            rows: [
              row(["Labor", "$8.3k", "96 h × $86", tag("Est.", "b")], "Not yet posted", kv),
              row(["Equipment", "$14.4k", "Outage day", tag("Est.", "b")], "Not yet posted", kv),
              row(["Materials", "$6.2k", "Three lines", tag("Est.", "a")], "Plate not in the bin", kv),
              row(["Coast job", "$6k", "Other", tag("Other", "g")], "Not this visit", "Coastal")
            ]
          });
        }),
        tab("Mix", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "YTD spend · $ millions", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [
              { name: "Labor", color: TEAL, values: [0.12, 0.25, 0.4, 0.55, 0.7, 0.82] },
              { name: "Equipment", color: PURPLE, values: [0.1, 0.2, 0.32, 0.45, 0.55, 0.68] },
              { name: "Material", color: AMBER, values: [0.08, 0.16, 0.28, 0.4, 0.52, 0.65] }
            ] },
            side: { type: "donut", title: "YTD $2.15M", parts: [
              { name: "Labor", value: 0.82, color: TEAL, tip: "$0.82M" },
              { name: "Equipment", value: 0.68, color: PURPLE, tip: "$0.68M" },
              { name: "Material", value: 0.65, color: AMBER, tip: "$0.65M" }
            ] },
            columns: ["Bucket", "YTD", "Share", "State"],
            rows: [
              row(["Labor", "$0.82M", "38%", tag("Posted", "g")], "Actual", kv),
              row(["Equipment", "$0.68M", "32%", tag("Posted", "g")], "Actual", kv),
              row(["Material", "$0.65M", "30%", tag("Posted", "g")], "Actual", kv)
            ]
          });
        }),
        tab("Corridor", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Spend by corridor · $ millions YTD", labels: ["North", "Coastal", "Inland"], series: [
              { name: "Actual", color: BLUE, values: [2.15, 0.84, 0.46] },
              { name: "Budget pro-rata", color: "#93c5fd", values: [2.4, 0.9, 0.5] }
            ] },
            side: { type: "bars", title: "North versus plan", items: [
              { label: "Budget", pct: 100, value: "4.80", color: BLUE, tip: "Full year" },
              { label: "YTD", pct: 45, value: "2.15", color: TEAL, tip: "Posted" },
              { label: "Backlog", pct: 26, value: "1.26", color: AMBER, tip: "Estimated remaining repairs" }
            ] },
            columns: ["Corridor", "YTD", "Full budget", "State"],
            rows: [
              row(["North", "$2.15M", "$4.80M", tag("On pace", "g")], "Backlog $1.26M fits the remainder", kv),
              row(["Coastal", "$0.84M", "$1.80M", tag("On pace", "g")], "Separate budget", "Coastal"),
              row(["Inland", "$0.46M", "$0.90M", tag("On pace", "g")], "Separate budget", "Inland")
            ]
          });
        })
      ]),
      screen("budget", "Budget Planning", "budget", [
        tab("Year", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Approved budget against backlog · $ millions", labels: ["Approved", "Spent", "Remaining", "Backlog"], series: [{ name: "$M", color: BLUE, values: [4.8, 2.15, 2.65, 1.26], tips: ["Approved maintenance budget", "Actual YTD", "4.80 − 2.15", "Estimated remaining repair backlog"] }] },
            side: { kicker: "OUTPUT", text: "Approved maintenance budget is $4.80M. Estimated cost of the remaining repair backlog is $1.26M. Remaining budget is $2.65M.", gauge: { value: 26, label: "Backlog", tip: "1.26 is 26% of the 4.80 approved budget." } },
            columns: ["Line", "Amount", "Meaning", "State"],
            rows: [
              row(["Approved", "$4.80M", "Full year", tag("Set", "b")], "Corridor North", kv),
              row(["Spent", "$2.15M", "YTD actual", tag("Posted", "g")], "Through June", kv),
              row(["Backlog", "$1.26M", "Estimate", tag("Open", "a")], "Includes the $28.8k visit", kv)
            ]
          });
        }),
        tab("Variance", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Monthly actual versus pro-rata · $ millions", labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], series: [
              { name: "Actual", color: TEAL, values: [0.30, 0.31, 0.44, 0.40, 0.37, 0.33] },
              { name: "Pro-rata", color: "#93c5fd", values: [0.40, 0.40, 0.40, 0.40, 0.40, 0.40] }
            ] },
            side: { kicker: "VARIANCE", text: "March is the only month above the monthly pro-rata, in the same month as the thermal window. Year-to-date is still under the half-year mark.", gauge: { value: 45, label: "YTD", tip: "2.15 / 4.80." } },
            columns: ["Month", "Actual", "Pro-rata", "State"],
            rows: [
              row(["Mar", "$0.44M", "$0.40M", tag("Over", "a")], "Thermal month", kv),
              row(["Jun", "$0.33M", "$0.40M", tag("Under", "g")], "Latest", kv)
            ]
          });
        }),
        tab("Regions", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Full-year approved budgets · $ millions", items: [
              { label: "North", pct: 100, value: "4.80", color: BLUE, tip: "This corridor" },
              { label: "Coastal", pct: 38, value: "1.80", color: TEAL, tip: "Separate" },
              { label: "Inland", pct: 19, value: "0.90", color: "#93c5fd", tip: "Separate" }
            ] },
            side: { type: "donut", title: "Company maintenance budgets", parts: [
              { name: "North", value: 4.8, color: BLUE, tip: "$4.80M" },
              { name: "Coastal", value: 1.8, color: TEAL, tip: "$1.80M" },
              { name: "Inland", value: 0.9, color: PURPLE, tip: "$0.90M" }
            ] },
            columns: ["Region", "Budget", "YTD", "State"],
            rows: [
              row(["North", "$4.80M", "$2.15M", tag("Open", "b")], "Backlog $1.26M", kv),
              row(["Coastal", "$1.80M", "$0.84M", tag("Open", "g")], "No T-104", "Coastal"),
              row(["Inland", "$0.90M", "$0.46M", tag("Open", "g")], "No T-104", "Inland")
            ]
          });
        })
      ]),
      screen("per", "Cost per Asset", "asset", [
        tab("Towers", function () {
          return pack({
            kpis: [
              { l: "T-104 package", v: "$18.4k", s: "Steel + cotter share", tip: "Visit labor and equipment split, plus the plate and pins.", spark: [8, 10, 12, 14, 16, 18.4], color: RED },
              { l: "N-18 if run", v: "$6.1k", s: "Damper share", tip: "Held until location is confirmed.", spark: [2, 3, 4, 5, 6, 6.1], color: AMBER },
              { l: "N-19 ROW", v: "$3.2k", s: "Released", tip: "Vegetation share of the visit.", spark: [1, 1.5, 2, 2.4, 2.8, 3.2], color: GREEN },
              { l: "T-103 check", v: "$1.1k", s: "Not a repair", tip: "Inspection time only.", spark: [0.4, 0.6, 0.7, 0.8, 1, 1.1], color: TEAL }
            ],
            chart: { type: "bar", title: "Estimated $ thousands on the visit", labels: ["T-104", "N-18", "N-19", "T-103"], series: [{ name: "$k", color: BLUE, values: [18.4, 6.1, 3.2, 1.1] }] },
            side: { kicker: "ASSET", text: "T-104 carries most of the visit cost because of the steel and the outage plant.", gauge: { value: 64, label: "T-104", tip: "18.4 / 28.8." } },
            columns: ["Asset", "Estimate", "In backlog", "State"],
            rows: [
              row(["T-104", "$18.4k", "Yes", tag("Open", "r")], "Two findings", kv),
              row(["N-18", "$6.1k", "Held", tag("Hold", "a")], "Location", kv),
              row(["N-19", "$3.2k", "Yes", tag("Open", "b")], "ROW", kv),
              row(["T-101", "$0", "No", tag("None", "g")], "Stable", kv)
            ]
          });
        }),
        tab("Spans", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Open $ on spans", items: [
              { label: "N-18", pct: 70, value: "$6.1k", color: AMBER, tip: "Damper, if confirmed" },
              { label: "N-19", pct: 36, value: "$3.2k", color: GREEN, tip: "ROW" },
              { label: "N-17", pct: 0, value: "$0", color: TEAL, tip: "Clear" }
            ] },
            side: { type: "donut", title: "Visit $28.8k", parts: [
              { name: "T-104", value: 18.4, color: RED, tip: "Tower" },
              { name: "N-18", value: 6.1, color: AMBER, tip: "Span" },
              { name: "N-19", value: 3.2, color: GREEN, tip: "ROW" },
              { name: "T-103", value: 1.1, color: TEAL, tip: "Check" }
            ] },
            columns: ["Span", "Estimate", "Part", "State"],
            rows: [
              row(["N-18", "$6.1k", "VD-220", tag("Hold", "a")], "Not issued", kv),
              row(["N-19", "$3.2k", "None", tag("Open", "b")], "Labor and access", kv)
            ]
          });
        }),
        tab("Rank", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Backlog rank · $ thousands", labels: ["Other North", "T-104", "N-18", "N-19", "T-103"], series: [{ name: "$k", color: PURPLE, values: [1231, 18.4, 6.1, 3.2, 1.1], tips: ["Rest of the $1.26M corridor backlog", "This tower", "Damper", "ROW", "Check"] }] },
            side: { kicker: "RANK", text: "This visit is visible and urgent. It is not most of the $1.26M. The rest of the corridor backlog is the larger number.", gauge: { value: 2, label: "%", tip: "28.8k is about 2% of 1.26M." } },
            columns: ["Rank", "Amount", "Share of backlog", "State"],
            rows: [
              row(["Rest of North", "$1.23M", "98%", tag("Backlog", "a")], "Other open work", kv),
              row(["This visit", "$28.8k", "2%", tag("Now", "r")], "T-104 drives the urgency", kv)
            ]
          });
        })
      ]),
      screen("replace", "Repair vs Replace", "compare", [
        tab("T-104", function () {
          return formula({
            factors: [
              { label: "Repair now", value: "$18.4k", note: "Steel share", tip: "Member repair inside the visit." },
              { label: "Replace member", value: "$64k", note: "Planning", tip: "New member, longer outage." },
              { label: "Repair horizon", value: "8 y", note: "Planning", tip: "Planning assumption, not a test certificate." },
              { label: "Replace horizon", value: "30 y", note: "Planning", tip: "Planning assumption for a new member." }
            ],
            chart: { title: "Cash in the first year · $ thousands", labels: ["Repair", "Replace"], series: [{ name: "$k", color: BLUE, values: [18.4, 64], tips: ["Repair the verified steel now", "Replace the member"] }] },
            columns: ["Option", "Year-1 cash", "Horizon used", "State"],
            rows: [
              row(["Repair", "$18.4k", "8 years", tag("Plan", "b")], "Fits the current visit", kv),
              row(["Replace", "$64k", "30 years", tag("Plan", "a")], "Capital case, not this outage", kv)
            ]
          });
        }),
        tab("Scenarios", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Five-year cash · $ thousands", labels: ["Y1", "Y2", "Y3", "Y4", "Y5"], series: [
              { name: "Repair", color: TEAL, values: [18.4, 4, 4, 4, 4] },
              { name: "Replace", color: PURPLE, values: [64, 1, 1, 1, 1] }
            ] },
            side: { kicker: "PLAN", text: "Repair spends less this year and keeps a follow-up allowance. Replace spends more now. Both are planning scenarios.", gauge: { value: 64, label: "Rep.", tip: "Replace year-1 cash, $64k." } },
            columns: ["Path", "5-year cash", "This outage", "State"],
            rows: [
              row(["Repair", "$34.4k", "Yes", tag("Fit", "g")], "18.4 + four follow-ups", kv),
              row(["Replace", "$68k", "No", tag("Capital", "a")], "Needs a capital slot", kv)
            ]
          });
        }),
        tab("Life", function () {
          return pack({
            kpis: k,
            chart: { type: "area", title: "Illustrative index after each choice", labels: ["Now", "Y2", "Y4", "Y6", "Y8"], series: [
              { name: "Repair", color: TEAL, values: [61, 74, 72, 70, 68] },
              { name: "Replace", color: PURPLE, values: [61, 90, 88, 87, 86] }
            ] },
            side: { kicker: "LIFE", text: "The lines are planning sketches from the current index. They are not a certified remaining-life study.", gauge: { value: 61, label: "Now", tip: "Both paths start at index 61." } },
            columns: ["Path", "Index now", "Sketch at Y8", "State"],
            rows: [
              row(["Repair", "61", "68", tag("Sketch", "b")], "Not a certificate", kv),
              row(["Replace", "61", "86", tag("Sketch", "a")], "Not a certificate", kv)
            ]
          });
        })
      ]),
      screen("capital", "Capital Planning", "capital", [
        tab("Program", function () {
          return pack({
            kpis: [
              { l: "Capital ask", v: "$0.64M", s: "Member replacements", tip: "Ten members at the $64k planning figure, not yet approved.", spark: [0.2, 0.3, 0.4, 0.5, 0.6, 0.64], color: PURPLE },
              { l: "Maintenance room", v: "$2.65M", s: "Unspent", tip: "Can hold the repair backlog estimate.", spark: [4.4, 4, 3.6, 3.2, 2.9, 2.65], color: GREEN },
              { l: "Backlog", v: "$1.26M", s: "Repairs", tip: "Stays on the maintenance side in the base plan.", spark: [1, 1.1, 1.15, 1.2, 1.24, 1.26], color: AMBER },
              { l: "T-104", v: "Repair", s: "Not in the ask", tip: "Base plan repairs T-104. It is not one of the ten replacements.", spark: [0, 0, 0, 0, 0, 0], color: TEAL }
            ],
            chart: { type: "bar", title: "Where the money sits · $ millions", labels: ["Unspent maint.", "Repair backlog", "Capital ask"], series: [{ name: "$M", color: BLUE, values: [2.65, 1.26, 0.64] }] },
            side: { kicker: "SPLIT", text: "Compare the approved maintenance budget with the repair backlog first. The capital ask is a separate list and does not include T-104.", gauge: { value: 64, label: "Ask", tip: "$0.64M draft capital." } },
            columns: ["Pot", "Amount", "Includes T-104", "State"],
            rows: [
              row(["Maintenance", "$4.80M", "Repair", tag("Approved", "g")], "Backlog fits the remainder", kv),
              row(["Capital", "$0.64M", "No", tag("Draft", "a")], "Other members", zone)
            ]
          });
        }),
        tab("Backlog", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Backlog versus what is left", items: [
              { label: "Remaining budget", pct: 100, value: "$2.65M", color: GREEN, tip: "4.80 − 2.15" },
              { label: "Repair backlog", pct: 48, value: "$1.26M", color: AMBER, tip: "Estimate" },
              { label: "Headroom", pct: 52, value: "$1.39M", color: BLUE, tip: "2.65 − 1.26, if the estimate holds" }
            ] },
            side: { kicker: "COMPARE", text: "Approved budget remaining is $2.65M. Estimated remaining repair backlog is $1.26M.", gauge: { value: 48, label: "Used", tip: "Backlog as a share of what is left." } },
            columns: ["Compare", "Left", "Backlog", "State"],
            rows: [
              row(["North", "$2.65M", "$1.26M", tag("Covers", "g")], "On these estimates", kv),
              row(["Visit inside it", "$28.8k", "Part of 1.26", tag("In", "b")], "Not extra", kv)
            ]
          });
        }),
        tab("Timing", function () {
          return gantt({
            title: "When the cash would move",
            ticks: ["Q3", "Q4", "Q1", "Q2", "Q3", "Q4", "", ""],
            kpis: k,
            lanes: [
              { name: "T-104 repair", bars: [{ left: 4, width: 14, color: TEAL, label: "$18k", tip: "Maintenance, this quarter if released" }] },
              { name: "Other backlog", bars: [{ left: 16, width: 50, color: AMBER, label: "$1.24M", tip: "Rest of the repair estimate" }] },
              { name: "Capital ask", bars: [{ left: 40, width: 36, color: PURPLE, label: "$0.64M", tip: "Draft. Not approved. Excludes T-104." }] }
            ],
            sideTitle: "This quarter",
            bars: [
              { label: "Repair", pct: 70, value: "$18.4k", color: TEAL, tip: "If the plate and the permit clear" },
              { label: "Capital", pct: 0, value: "Later", color: PURPLE, tip: "Not this outage" }
            ]
          });
        })
      ])
    ];
  }

  function workforce() {
    var k = [
      { l: "HV crews free", v: "2", s: "HV-04 · HV-07", tip: "Both hold a 220 kV certification. Neither is assigned.", spark: [1, 1, 2, 2, 2, 2], color: TEAL },
      { l: "Assigned", v: "1", s: "VEG-02 · N-19", tip: "Vegetation only.", spark: [0, 0, 1, 1, 1, 1], color: GREEN },
      { l: "Permit", v: "Open", s: "PTW-220-18", tip: "Work authorization is not verified.", spark: [1, 1, 1, 1, 1, 1], color: RED },
      { l: "Incidents", v: "0", s: "This quarter", tip: "No recorded incident on Corridor North this quarter.", spark: [0, 0, 0, 0, 0, 0], color: GREEN }
    ];
    return [
      drawingScreen([
        { tab: "Authorization", src: "/pids/nx-wfs-pfd-0220-authorization.svg", kicker: "Work authorization", note: "PTW-220-18 is requested. HV-04 and HV-07 are not assigned." },
        { tab: "Crew", src: "/pids/nx-wfs-pfd-1002-crew.svg", kicker: "Qualified crew", note: "VEG-02 is assigned to span N-19 only." }
      ]),
      screen("home", "Workforce Dashboard", "people", [
        tab("Production", function () {
          return prodBoard({
            title: "Crew",
            lede: "The repair is waiting on a verified permit and a qualified crew. A certificate is not an assignment.",
            kpis: [
              { k: "Qualified and free", v: "2", tip: "HV-04 and HV-07 have a current 220 kV certificate and Wednesday time." },
              { k: "Assigned to T-104", v: "0", tip: "No high-voltage crew is assigned." },
              { k: "VEG-02", v: "N-19", tip: "Assigned to the ROW only." },
              { k: "Incidents", v: "0", tip: "None recorded this quarter." }
            ],
            bars: { title: "Cleared for the named job", unit: "1 means cleared. CIV-1 has no certificate.", labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"], values: [1, 1, 1, 0], max: 1 },
            lines: { title: "Assignment", unit: "Only VEG-02 is assigned, and only to N-19.", labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"], series: [
              { name: "Assigned", color: "#3d9a78", values: [0, 0, 1, 0] },
              { name: "Cleared", color: "#3b6fd8", values: [1, 1, 1, 0] }
            ] },
            stack: { title: "Cleared and assigned", unit: "HV-04 and HV-07 are clear and not assigned.", labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"], series: [
              { name: "Cleared", color: "#3b6fd8", values: [1, 1, 1, 0] },
              { name: "Assigned", color: "#3d9a78", values: [0, 0, 1, 0] }
            ] },
            rank: { title: "Assigned", unit: "1 means assigned.", rows: [
              { name: "VEG-02", value: 1 }, { name: "HV-04", value: 0 }, { name: "HV-07", value: 0 }, { name: "CIV-1", value: 0 }
            ] }
          });
        }),
        tab("Sourcing", function () {
          return sourceBoard({
            cards: [
              { k: "Qualified and free", v: "2", s: "HV-04 and HV-07", spark: [2, 2], tip: "Both have a current 220 kV certificate and Wednesday time. Neither is assigned." },
              { k: "Assigned to T-104", v: "0", s: "No crew yet", spark: [0, 0], tip: "A certificate is not an assignment." },
              { k: "VEG-02", v: "N-19", s: "Not the tower", spark: [1, 1], tip: "Assigned to the ROW only. Must not take T-104." },
              { k: "Permit", v: "Open", s: "PTW-220-18", spark: [0, 0], tip: "Requested, not authorized." },
              { k: "Incidents", v: "0", s: "This quarter", spark: [0, 0], tip: "No incident is recorded this quarter." }
            ],
            side: { title: "Authorization", rows: [{ k: "HV-04", v: "Free" }, { k: "HV-07", v: "Free" }, { k: "VEG-02", v: "N-19" }, { k: "CIV-1", v: "No cert" }], foot: "The repair is waiting on a verified permit and a qualified crew." },
            chartTitle: "Cleared for the named job, and assigned",
            labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"],
            bars: [
              { name: "Cleared for the named job", color: "#6b5bd2", values: [1, 1, 1, 0] },
              { name: "Assigned", color: "#3d9a78", values: [0, 0, 1, 0] }
            ],
            leftMax: 1, rightMax: 1,
            band: "HV-04 and HV-07 are clear for T-104 and not assigned. VEG-02 is assigned to N-19 only.",
            split: "Permit open. No crew on T-104."
          });
        }),
        tab("Overview", function () {
          return optBoard({
            recent: "Most recent crew check",
            map: "crew",
            placeTitle: "Crew sites north of Baku",
            cards: [
              { k: "Qualified", v: "2", delta: "HV-04 and HV-07", tone: "flat", spark: [2, 2], caption: "220 kV certs", tip: "Both are free on Wednesday. Neither is assigned." },
              { k: "Assigned", v: "0", delta: "Not assigned", tone: "down", spark: [0, 0], caption: "T-104", tip: "No qualified crew is assigned to T-104." },
              { k: "Permit", v: "Open", delta: "Requested", tone: "down", spark: [1, 1], caption: "PTW-220-18", tip: "Not authorized." },
              { k: "Incidents", v: "0", delta: "This quarter", tone: "flat", spark: [0, 0, 0, 0], caption: "Corridor North", tip: "No recorded incident this quarter." }
            ],
            facts: [
              { k: "Current status", v: "Open", dot: true },
              { k: "Permit", v: "Requested" },
              { k: "HV-04", v: "Free" },
              { k: "HV-07", v: "Free" },
              { k: "VEG-02", v: "N-19 only" },
              { k: "Field start", v: "0" }
            ],
            rows: [
              { name: "HV-04", unit: "Crew", recorded: "Certified", current: "Free", change: "Not assigned", tone: "down", note: "HV-04 has a current 220 kV certificate and Wednesday availability. Not assigned." },
              { name: "HV-07", unit: "Crew", recorded: "Certified", current: "Free", change: "Not assigned", tone: "down", note: "HV-07 has a current 220 kV certificate and Wednesday availability. Not assigned." },
              { name: "VEG-02", unit: "Crew", recorded: "ROW", current: "N-19", change: "Assigned", tone: "up", note: "VEG-02 is assigned to span N-19 only and must not take T-104." },
              { name: "CIV-1", unit: "Crew", recorded: "No cert", current: "No time", change: "Not available", tone: "down", note: "CIV-1 has no 220 kV certificate and no time." },
              { name: "Permit", unit: "PTW-220-18", recorded: "Requested", current: "Open", change: "Not authorized", tone: "down", note: "The permit is requested, not authorized." }
            ],
            slides: [
              "Repair task is awaiting verified work authorization and qualified crew assignment.",
              "HV-04 and HV-07 have current 220 kV certificates and are free on Wednesday. Neither is assigned.",
              "VEG-02 is assigned only to the span N-19 vegetation. PTW-220-18 is requested, not authorized.",
              "Incidents this quarter are 0. Field work has not started."
            ],
            chartTitle: "Assignment",
            chart: { max: 1, labels: ["HV-04", "HV-07", "VEG-02", "Field"], series: [
              { name: "Assigned", color: "#2563eb", values: [0, 0, 1, 0] }
            ] }
          });
        }),
        tab("Matrix", function () {
          return matrixBoard({
            title: "Crew Collection Matrix",
            date: "Wednesday",
            operation: "PTW-220-18 requested",
            heading: "Crew hierarchy",
            chip: "T-104",
            legend: [["agency", "Window"], ["collected", "Assigned"], ["scheduled", "Free"], ["unscheduled", "No cert"], ["held", "Other task"], ["risk", "Permit open"]],
            conflict: { k: "Schedule conflicts", v: "1 conflict", tip: "HV-04 and HV-07 are free and certified, but the permit is open, so neither is assigned." },
            metrics: [
              { k: "Qualified", v: "2", tip: "HV-04 and HV-07 have current 220 kV certificates." },
              { k: "Assigned", v: "0", tip: "No qualified crew is assigned to T-104." },
              { k: "VEG-02", v: "1", tip: "Assigned to span N-19 only." },
              { k: "Permit", v: "Open", tip: "PTW-220-18 is requested, not authorized." },
              { k: "Incidents", v: "0", tip: "None on Corridor North this quarter." },
              { k: "Field start", v: "0", tip: "No after images." }
            ],
            score: { value: 0, label: "Assigned", tip: "No qualified crew is assigned to T-104." },
            focus: "t104",
            nodes: [
              { id: "window", kind: "rollup", name: "Wednesday", mark: "Open", status: "agency", x: 50, y: 16, tag: "T-104", description: "Repair task is awaiting verified work authorization and qualified crew assignment.", source: "Incidents this quarter: 0.", basic: [["Window", "Wednesday"], ["Permit", "PTW-220-18"], ["Assigned", "0"]] },
              { id: "t104", kind: "parent", name: "T-104", status: "parent", x: 50, y: 48, tag: "T-104", description: "Two qualified crews are free. Neither is assigned while the permit is open.", source: "VEG-02 must not take this tower.", basic: [["HV-04", "Free"], ["HV-07", "Free"], ["Crew", "None"]] },
              { id: "hv", kind: "leaf", name: "HV-04", mark: "Free", status: "scheduled", x: 28, y: 80, tag: "T-104", description: "HV-04 has a current 220 kV certificate and Wednesday availability. HV-07 is the same. Neither is assigned.", source: "A certificate is not an assignment.", basic: [["Cert", "220 kV"], ["Wednesday", "Free"], ["Assigned", "No"]] },
              { id: "permit", kind: "leaf", name: "Permit", mark: "Open", status: "risk", x: 72, y: 80, tag: "T-104", description: "PTW-220-18 is requested, not authorized.", source: "Open hazards are the live line and the ROW vegetation.", basic: [["Permit", "PTW-220-18"], ["State", "Requested"], ["Field start", "0"]] }
            ],
            edges: [["window", "t104"], ["t104", "hv"], ["t104", "permit"]]
          });
        }),
        tab("Forecast", function () {
          return planBoard({
            next: "PTW-220-18 is requested. No high-voltage crew is assigned.",
            start: "This quarter",
            end: "Wednesday",
            chart: {
              title: "Cleared for the named job, and assigned",
              max: 1,
              mode: "group",
              labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"],
              stacks: [
                { name: "Cleared for the named job", color: "#6b5bd2", values: [1, 1, 1, 0] },
                { name: "Assigned", color: "#3d9a78", values: [0, 0, 1, 0] }
              ]
            },
            quiet: ["Corridor=Corridor North", "Voltage=220 kV", "Asset=T-104", "Window=This visit", "State=Review"],
            views: [
              {
                when: "", badge: "Not assigned", hero: { v: "0", k: "Crew assigned to T-104" }, leftTitle: "Qualified and free", rightTitle: "Already assigned",
                left: [{ k: "HV-04", v: "Free" }, { k: "HV-07", v: "Free" }, { k: "Certificate", v: "220 kV" }],
                right: [{ k: "VEG-02", v: "N-19" }, { k: "CIV-1", v: "No cert" }, { k: "T-104 crew", v: "None" }],
                bandTitle: "Authorization", bandNote: "A certificate is not an assignment.",
                band: [{ k: "Permit", v: "Open", pill: "PTW-220-18", tone: "down" }, { k: "Assigned to T-104", v: "0", pill: "None", tone: "down" }, { k: "Incidents", v: "0", pill: "This quarter" }],
                summary: "Repair task is awaiting verified work authorization and qualified crew assignment.",
                more: "HV-04 and HV-07 have current 220 kV certificates and Wednesday availability. Neither is assigned. VEG-02 is assigned only to the N-19 vegetation and must not take T-104. CIV-1 has no certificate and no time. PTW-220-18 is requested, not authorized. Incidents this quarter are 0. Open hazards are the live line and the ROW vegetation. Before images are from inspection 6. After images are empty.",
                ring: 0, ringLabel: "Assigned", ringTip: "No qualified crew is assigned to T-104."
              },
              {
                when: "Work=ROW", badge: "Assigned", leftTitle: "Vegetation crew", rightTitle: "Not the tower",
                left: [{ k: "Crew", v: "VEG-02" }, { k: "Asset", v: "Span N-19" }, { k: "Hours", v: "4" }],
                right: [{ k: "T-104", v: "No" }, { k: "HV-04", v: "Unassigned" }, { k: "HV-07", v: "Unassigned" }],
                bandTitle: "ROW assignment", bandNote: "VEG-02 is assigned to vegetation only.",
                band: [{ k: "Crew", v: "VEG-02", pill: "Assigned" }, { k: "Tower", v: "No", pill: "Not T-104" }, { k: "Field start", v: "0", pill: "Not started", tone: "down" }],
                summary: "VEG-02 is assigned to the span N-19 vegetation cut only.",
                more: "That assignment does not authorize VEG-02 to repair T-104. The cut has not started in the field.",
                ring: 100, ringLabel: "Assigned", ringTip: "Assigned to N-19 only, not to T-104."
              }
            ]
          });
        }),
        tab("Issues", function () {
          return issueBoard({
            heading: "Who can start T-104",
            updated: "Permit still open",
            note: "100 means the person is ready for that item. A low cell means the gate is still open. Zero means it has not happened.",
            cols: ["Permit", "HV-04", "HV-07", "VEG-02", "Brief", "Field"],
            cards: [
              { name: "HV-04 ready", score: "100", lines: [["Cert", "220 kV"], ["Wednesday", "Free"], ["Named", "No"]], detail: "HV-04 has a current 220 kV certificate and is free. The order does not name them." },
              { name: "HV-07 ready", score: "100", lines: [["Cert", "220 kV"], ["Role", "Alternate"], ["Named", "No"]], detail: "HV-07 is also qualified and unassigned." },
              { name: "VEG-02 task", score: "100", lines: [["Task", "N-19"], ["HV cert", "No"], ["T-104", "No"]], detail: "VEG-02 is fully assigned to the ROW task and must not take the tower repair." },
              { name: "Permit progress", score: "20", lines: [["Number", "PTW-220-18"], ["Requested", "Yes"], ["Signed", "No"]], detail: "The permit is requested only. Authorization is not verified." },
              { name: "Field start", score: "0", lines: [["Brief", "No"], ["After images", "0"], ["Incidents", "0"]], detail: "The repair has not started. After images are empty. Incidents this quarter are 0." }
            ],
            groups: [
              { name: "Gates", rows: [
                { name: "T-104 start", values: [20, 0, 0, 0, 0, 0], notes: ["Requested, not signed", "Not named", "Not named", "Wrong certificate", "No brief", "No field start"] },
                { name: "People", values: [null, 100, 100, 40, null, null], notes: ["Not a person", "HV-04 current and free", "HV-07 current and free", "VEG-02 on N-19 only", "Not a person", "Not a person"] }
              ] }
            ],
            trendTitle: "Ready versus still open. 100 is ready.",
            trend: { labels: ["Permit", "HV-04", "HV-07", "VEG", "Brief", "Field"], values: [20, 100, 100, 40, 0, 0], max: 100 }
          });
        }),
        tab("Entities", function () {
          return entityBoard({
            focus: "t104",
            types: ENT_TYPES,
            nodes: [
              { id: "ptw", type: "permit", name: "PTW-220-18", short: "PTW", x: 50, y: 20, summary: "Requested. Authorization is not verified.", status: "OPEN", tone: "r", props: [["Requested", "Yes"], ["Signed", "No"]], sourceTitle: "Permit file", source: "The tower task cannot start while this is open.", recorded: "Open", updated: "Not signed" },
              { id: "hv04", type: "crew", name: "HV-04", short: "04", x: 68, y: 26, summary: "Current 220 kV certificate. Not assigned.", status: "FREE", tone: "g", props: [["Cert", "220 kV current"], ["Wednesday", "Free"], ["Named", "No"]], sourceTitle: "Crew record", source: "Best skill match. Availability is not an assignment.", recorded: "Current", updated: "Unassigned" },
              { id: "t104", type: "tower", name: "T-104", short: "T104", x: 42, y: 48, summary: "Repair is waiting on authorization and a qualified crew.", status: "BLOCKED", tone: "r", props: [["Permit", "Open"], ["Crew", "None"], ["Start", "No"]], sourceTitle: "Work package", source: "Nothing has started in the field. After images are empty.", recorded: "Inspection 6", updated: "Not released" },
              { id: "veg", type: "crew", name: "VEG-02", short: "VEG", x: 24, y: 70, summary: "Assigned to N-19 only. Wrong certificate for T-104.", status: "ROW", tone: "a", props: [["Task", "N-19"], ["HV cert", "No"]], sourceTitle: "Crew record", source: "Must stay off the high-voltage repair.", recorded: "Set", updated: "Assigned" },
              { id: "brief", type: "report", name: "Briefing", short: "BR", x: 48, y: 74, summary: "Nobody is named, so the brief has not happened.", status: "NOT DONE", tone: "a", props: [["Signed", "No"]], sourceTitle: "Field record", source: "Needs a crew before a brief.", recorded: "Open", updated: "Empty" },
              { id: "hv07", type: "crew", name: "HV-07", short: "07", x: 74, y: 66, summary: "Alternate crew. Also qualified and unassigned.", status: "FREE", tone: "g", props: [["Cert", "220 kV current"], ["Named", "No"]], sourceTitle: "Crew record", source: "Can be named only after authorization.", recorded: "Current", updated: "Unassigned" }
            ],
            edges: [["t104", "ptw", "blocked"], ["ptw", "hv04", "then"], ["ptw", "hv07", "then"], ["t104", "veg", "not HV"], ["t104", "brief", "waiting"], ["hv04", "hv07", "both free"]]
          });
        }),
        tab("Recommendations", function () {
          return recommendBoard({
            costTitle: "Who can take T-104",
            costMax: 2,
            cost: [
              { label: "Qualified", value: 2, color: "#3d9a78", tip: "HV-04 and HV-07 have current 220 kV certificates and are not assigned." },
              { label: "Named", value: -0, color: "#e07a3d", tip: "The tower order has no crew name. A zero bar means nobody is assigned." }
            ],
            levelTitle: "Readiness",
            levelLabels: ["Permit", "HV-04", "HV-07", "VEG", "Brief"],
            levelValues: [10, 100, 100, 40, 0],
            levelTip: "Permit is requested only. Both HV certificates are current. VEG-02 is the wrong certificate. The brief has not happened.",
            groups: recGroups(["T-104", "HV-04", "HV-07", "VEG-02"], ["Wait", "Free", "ROW"]),
            rows: [
              { item: "T-104", meta: "Repair", place: "Corridor North", placeMeta: "Not released", text: "Wait for verified authorization and a qualified crew.", impact: "Blocked", level: "Wait", check: "PTW-220-18", date: "Open", keys: "Corridor North T-104 Wait" },
              { item: "HV-04", meta: "Best match", place: "Corridor North", placeMeta: "Free Wednesday", text: "Current 220 kV certificate. Do not treat availability as an assignment.", impact: "Unassigned", level: "Free", check: "Cert current", date: "Wednesday", keys: "Corridor North HV-04 Free" },
              { item: "HV-07", meta: "Alternate", place: "Corridor North", placeMeta: "Free Wednesday", text: "Also qualified. The order still has no name.", impact: "Unassigned", level: "Free", check: "Cert current", date: "Wednesday", keys: "Corridor North HV-07 Free" },
              { item: "VEG-02", meta: "ROW only", place: "N-19", placeMeta: "Assigned", text: "Keep this crew on vegetation. Wrong certificate for T-104.", impact: "N-19", level: "ROW", check: "Not HV", date: "Set", keys: "Corridor North VEG-02 ROW" },
              { item: "CIV-1", meta: "No certificate", place: "Corridor North", placeMeta: "No time", text: "Leave CIV-1 off the tower.", impact: "Excluded", level: "Wait", check: "No 220 kV", date: "Open", keys: "Corridor North T-104 Wait" }
            ]
          });
        }),
        tab("Blackboard", function () {
          return blackboard({
            focus: ["t104", "ptw"],
            nodes: [
              { id: "hv04", name: "HV-04", short: "04", x: 14, y: 26, color: TEAL, tip: "220 kV certification is current. Not assigned." },
              { id: "hv07", name: "HV-07", short: "07", x: 30, y: 34, color: BLUE, tip: "Alternate crew. Also free on Wednesday." },
              { id: "t104", name: "T-104", short: "T104", x: 22, y: 54, color: "#9f1239", tip: "Repair is waiting on authorization and a qualified crew." },
              { id: "brief", name: "Briefing", short: "BR", x: 16, y: 76, color: PURPLE, tip: "Nobody is named, so the brief has not happened." },
              { id: "civ", name: "CIV-1", short: "CIV", x: 38, y: 74, color: "#334155", tip: "No 220 kV certification. Kept off the tower." },
              { id: "ptw", name: "PTW-220-18", short: "PTW", x: 68, y: 28, color: RED, tip: "Requested. Authorization is not verified." },
              { id: "veg", name: "VEG-02", short: "VEG", x: 82, y: 46, color: GREEN, tip: "Assigned to N-19 only. Wrong certificate for T-104." },
              { id: "open", name: "Open hold", short: "HOLD", x: 64, y: 62, color: AMBER, tip: "Live line and ROW vegetation are the open hazards." }
            ],
            extra: { id: "after", name: "After images", short: "0", x: 50, y: 14, color: "#64748b", tip: "Before images exist from inspection 6. After images are empty." },
            edges: [["hv04", "hv07", true], ["hv07", "t104", true], ["t104", "brief"], ["brief", "civ", true], ["t104", "ptw", true], ["ptw", "veg", true], ["ptw", "open"], ["after", "hv07"]],
            types: [
              { icon: "file", title: "Authorization", kicker: "PERMIT", value: "Open", sub: "PTW-220-18", body: "The permit is requested. It is not signed, so the tower task cannot start." },
              { icon: "user", title: "Qualified crew", kicker: "FREE", value: "HV-04", sub: "Not named", body: "HV-04 and HV-07 have current 220 kV certificates. Neither is on the order." },
              { icon: "tower", title: "Wrong certificate", kicker: "ROW", value: "VEG-02", sub: "N-19 only", body: "Vegetation is assigned and must stay off the high-voltage repair." },
              { icon: "link", title: "Not started", kicker: "FIELD", value: "No", sub: "No after images", body: "There is no field start. The before frames are from the inspection." }
            ]
          });
        }),
        tab("Schedule", function () {
          return scheduleBoard({
            day: "Wednesday · crew window",
            lanes: [
              { name: "HV-04", bars: [
                { left: 33.3, width: 22, fill: "#d9f2c8", ink: "#3f8f62", id: "HV04", label: "Free", flag: true, tip: "Current 220 kV certification. Wednesday is open. Not named on the order." }
              ] },
              { name: "HV-07", bars: [
                { left: 50, width: 16, fill: "#c9efef", ink: "#3aabb0", id: "HV07", label: "Alternate", tip: "Also qualified and unassigned." }
              ] },
              { name: "VEG-02", bars: [
                { left: 33.3, width: 16.7, fill: "#d9f2c8", ink: "#3f8f62", id: "VEG", label: "N-19 ROW", tip: "Assigned to vegetation only. Cannot take the T-104 repair." }
              ] },
              { name: "PTW desk", bars: [
                { left: 29.2, width: 40, fill: "#f8d0e3", ink: "#d56b9a", id: "PTW", label: "PTW-220-18", flag: true, tip: "Requested. Authorization is not verified, so the tower task cannot start." }
              ] },
              { name: "T-104 repair", bars: [
                { left: 37.5, width: 18, fill: "#f6d7bf", ink: "#d9893a", id: "0104", label: "Blocked", flag: true, tip: "Waiting on verified work authorization and a qualified crew." }
              ] },
              { name: "Briefing", bars: [
                { left: 66.7, width: 10, fill: "#ddd4f7", ink: "#6d5bd0", id: "BR", label: "Not done", tip: "No crew has been named, so there is nobody to brief." }
              ] },
              { name: "CIV-1", bars: [
                { left: 58.3, width: 10, fill: "#f8e0b0", ink: "#e09a3e", id: "CIV", label: "No cert", tip: "No 220 kV certification and no time. Kept off T-104." }
              ] }
            ]
          });
        }),
        tab("Graph", function () {
          return mesh({
            listTitle: "T-104 hold",
            focusTitle: "Authorization",
            focus: "Repair task is awaiting verified work authorization and qualified crew assignment.",
            list: [
              { title: "PTW-220-18", meta: "Not signed", tip: "Work authorization is open", body: "The tower task cannot start." },
              { title: "HV-04", meta: "220 kV · free", tip: "Best skill match", body: "Qualified. Not assigned." },
              { title: "HV-07", meta: "220 kV · free", tip: "Alternate crew", body: "Also qualified and unassigned." },
              { title: "VEG-02", meta: "On N-19", tip: "ROW only", body: "Cannot take the high-voltage repair." }
            ],
            nodes: [
              { x: 160, y: 240, color: "#9f1239", short: "T104", title: "Repair", tip: "Not released", body: "Steel and cotter wait on the permit and a crew." },
              { x: 370, y: 120, color: RED, short: "PTW", title: "Permit", tip: "PTW-220-18 open", body: "Requested. Authorization is not verified." },
              { x: 570, y: 190, color: TEAL, short: "04", title: "HV-04", tip: "Free Wednesday", body: "Current 220 kV certification. Name is blank on the order." },
              { x: 400, y: 370, color: BLUE, short: "07", title: "HV-07", tip: "Alternate", body: "Current certification. Not assigned." },
              { x: 600, y: 360, color: GREEN, short: "VEG", title: "VEG-02", tip: "N-19 only", body: "Assigned to vegetation. Wrong certificate for T-104." }
            ],
            edges: [[0, 1, "blocked"], [1, 2, "then"], [1, 3, "then"], [0, 4, "not HV"]],
            columns: ["Need", "Who", "Ready", "State"],
            rows: [
              row(["T-104 steel", "Unassigned", "No", tag("Wait", "r")], "Needs HV cert and PTW-220-18", kv),
              row(["T-104 cotter", "Unassigned", "No", tag("Wait", "r")], "Same crew package", kv),
              row(["N-19 ROW", "VEG-02", "Yes", tag("Set", "g")], "Not high-voltage work", kv),
              row(["HV-04", "Free", "Cert yes", tag("Open", "a")], "Not named on the order", kv)
            ]
          });
        }),
        tab("Today", function () {
          return pack({
            filters: ["Region", "Corridor"],
            kpis: k,
            chart: { type: "bar", title: "People against the visit", labels: ["HV free", "HV assigned", "VEG assigned", "Permit clear"], series: [{ name: "Count", color: BLUE, values: [2, 0, 1, 0], tips: ["HV-04 and HV-07", "No HV crew on the order", "VEG-02 on N-19", "PTW-220-18 still open"] }] },
            side: { kicker: "OUTPUT", text: "Repair task is awaiting verified work authorization and qualified crew assignment.", gauge: { value: 25, label: "Ready", tip: "Only the vegetation crew is assigned. Authorization is open." } },
            columns: ["Need", "Who", "Ready", "State"],
            rows: [
              row(["T-104 steel", "Unassigned", "No", tag("Wait", "r")], "Needs HV cert and PTW-220-18", kv),
              row(["T-104 cotter", "Unassigned", "No", tag("Wait", "r")], "Same crew package", kv),
              row(["N-19 ROW", "VEG-02", "Yes", tag("Set", "g")], "Not high-voltage work", kv),
              row(["Coast crew", "Booked", "No", tag("Other", "b")], "132 kV work", "Coastal")
            ]
          });
        }),
        tab("Qualifications", function () {
          return pack({
            kpis: k,
            chart: { type: "heat", title: "Certification · darker means held", rows: ["HV-04", "HV-07", "VEG-02", "CIV-1"], cols: ["220 kV", "Switch", "Steel", "ROW", "Aid", "Heights", "Auth.", "Drive"], matrix: [
              [100, 100, 100, 15, 100, 100, 20, 100],
              [100, 100, 80, 15, 100, 100, 20, 100],
              [10, 10, 10, 100, 100, 40, 70, 100],
              [10, 10, 30, 30, 100, 20, 20, 100]
            ] },
            side: { kicker: "CERT", text: "HV-04 and HV-07 can do the tower work. Authorization for this permit is not on their record yet.", gauge: { value: 2, label: "HV", tip: "Two qualified crews, zero assigned." } },
            columns: ["Person", "220 kV", "This permit", "State"],
            rows: [
              row(["HV-04", "Yes", "Not signed", tag("Free", "a")], "Best skill match", kv),
              row(["HV-07", "Yes", "Not signed", tag("Free", "a")], "Alternate", kv),
              row(["VEG-02", "No", "ROW only", tag("Set", "g")], "Cannot take T-104", kv)
            ]
          });
        }),
        tab("Load", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Booked hours this week", labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"], series: [
              { name: "Booked", color: AMBER, values: [12, 18, 8, 20] },
              { name: "This visit", color: BLUE, values: [0, 0, 4, 0] }
            ] },
            side: { type: "bars", title: "Room on Wednesday", items: [
              { label: "HV-04", pct: 80, value: "10 h", color: TEAL, tip: "Enough for the steel block" },
              { label: "HV-07", pct: 60, value: "8 h", color: TEAL, tip: "Enough as alternate" },
              { label: "CIV-1", pct: 0, value: "0", color: RED, tip: "No room and no 220 kV cert" }
            ] },
            columns: ["Crew", "Free Wed", "Cert", "State"],
            rows: [
              row(["HV-04", "10 h", "220 kV", tag("Open", "a")], "Not assigned", kv),
              row(["VEG-02", "8 h", "ROW", tag("Used", "g")], "4 h on N-19", kv)
            ]
          });
        })
      ]),
      screen("assign", "Crew Assignment", "crew", [
        tab("Match", function () {
          return lanes({
            kpis: k,
            columns: [
              { title: "Unassigned", cards: [{ title: "WO-104-A", meta: "Needs HV-04 or HV-07", tip: "Steel" }, { title: "WO-104-B", meta: "Same crew", tip: "Cotter" }] },
              { title: "Skill match", cards: [{ title: "HV-04", meta: "220 kV · steel", tip: "Free Wednesday" }, { title: "HV-07", meta: "220 kV · steel", tip: "Free Wednesday" }] },
              { title: "Assigned", cards: [{ title: "VEG-02", meta: "WO-19-V", tip: "ROW only" }] },
              { title: "Blocked", cards: [{ title: "PTW-220-18", meta: "No authorization", tip: "Stops the HV assignment" }] },
              { title: "Rejected fit", cards: [{ title: "VEG-02 on T-104", meta: "No 220 kV cert", tip: "Do not assign" }, { title: "CIV-1", meta: "No cert, no time", tip: "Do not assign" }] }
            ]
          });
        }),
        tab("HV certs", function () {
          return pack({
            kpis: k,
            chart: { type: "bar", title: "Crews with a current 220 kV certification", labels: ["HV-04", "HV-07", "VEG-02", "CIV-1"], series: [{ name: "Cert", color: TEAL, values: [1, 1, 0, 0] }] },
            side: { kicker: "RULE", text: "The tower repair can only go to a crew with a current high-voltage certification.", gauge: { value: 2, label: "Crews", tip: "HV-04 and HV-07." } },
            columns: ["Crew", "Cert", "Expires", "State"],
            rows: [
              row(["HV-04", "220 kV", "In date", tag("Free", "g")], "Not assigned", kv),
              row(["HV-07", "220 kV", "In date", tag("Free", "g")], "Not assigned", kv),
              row(["VEG-02", "None", "—", tag("ROW", "a")], "Wrong certificate for T-104", kv)
            ]
          });
        }),
        tab("Gaps", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "What is still missing", items: [
              { label: "Authorization", pct: 100, value: "Open", color: RED, tip: "PTW-220-18" },
              { label: "HV assignment", pct: 100, value: "Open", color: AMBER, tip: "Skills exist, name is blank" },
              { label: "ROW crew", pct: 0, value: "Set", color: TEAL, tip: "VEG-02" },
              { label: "Switching lead", pct: 80, value: "Open", color: PURPLE, tip: "Named only after the permit" }
            ] },
            side: { kicker: "GAP", text: "Repair task is awaiting verified work authorization and qualified crew assignment.", gauge: { value: 0, label: "HV", tip: "Zero high-voltage crew assigned." } },
            columns: ["Gap", "Blocks", "Owner", "State"],
            rows: [
              row(["PTW-220-18", "T-104", "Safety", tag("Open", "r")], "Authorization", kv),
              row(["Crew name", "T-104", "Operations", tag("Open", "a")], "Pick HV-04 or HV-07 after the permit", kv)
            ]
          });
        })
      ]),
      screen("safety", "Safety Management", "safety", [
        tab("Hazards", function () {
          return pack({
            kpis: [
              { l: "Open hazards", v: "2", s: "Live line · ROW", tip: "The circuit is in service until the outage. Vegetation is a separate hazard.", spark: [1, 1, 2, 2, 2, 2], color: AMBER },
              { l: "Incidents", v: "0", s: "This quarter", tip: "No incident recorded on this corridor.", spark: [0, 0, 0, 0, 0, 0], color: GREEN },
              { l: "Observations", v: "3", s: "Open", tip: "Access track, signage, and the damper frames.", spark: [1, 1, 2, 2, 3, 3], color: BLUE },
              { l: "Stopped work", v: "1", s: "T-104", tip: "No authorization, so the tower task cannot start.", spark: [1, 1, 1, 1, 1, 1], color: RED }
            ],
            chart: { type: "bar", title: "Open safety records", labels: ["Live line", "ROW", "Access", "Signage", "Incident"], series: [{ name: "Open", color: AMBER, values: [1, 1, 1, 1, 0] }] },
            side: { kicker: "HOLD", text: "The tower task stays stopped until authorization, a qualified crew, and the outage are all true.", gauge: { value: 0, label: "Incidents", tip: "Zero this quarter." } },
            columns: ["Record", "Where", "Control", "State"],
            rows: [
              row(["Live line", "220 kV", "Outage + permit", tag("Open", "r")], "Stops T-104", kv),
              row(["Vegetation", "N-19", "ROW crew", tag("Open", "a")], "Separate from the steel", kv),
              row(["Incident", "Corridor", "—", tag("None", "g")], "Nothing recorded", kv)
            ]
          });
        }),
        tab("ROW", function () {
          return atlas({
            title: "Right of way",
            highlight: "T-105",
            focusTitle: "N-19",
            focus: "Vegetation on span N-19 is a right-of-way watch. It is not one of the two verified structural findings.",
            towers: [
              { name: "N-19", meta: "Vegetation", tip: "ROW watch", body: "VEG-02 is assigned. Clearance rules depend on the jurisdiction." },
              { name: "T-104", meta: "Not ROW", tip: "Structural", body: "Steel and cotter pin. Different hazard." },
              { name: "Access", meta: "Track", tip: "Observation", body: "Track note from the last visit. Not an incident." }
            ]
          });
        }),
        tab("Observations", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Observations still open", items: [
              { label: "Access track", pct: 50, value: "Open", color: AMBER, tip: "Noted, not an incident" },
              { label: "Signage", pct: 40, value: "Open", color: AMBER, tip: "Corridor sign" },
              { label: "Damper frames", pct: 70, value: "Open", color: BLUE, tip: "Evidence for the visual finding" }
            ] },
            side: { type: "donut", title: "Quarter", parts: [
              { name: "Observations", value: 3, color: BLUE, tip: "Open notes" },
              { name: "Incidents", value: 0, color: TEAL, tip: "None" },
              { name: "Stopped jobs", value: 1, color: RED, tip: "T-104" }
            ] },
            columns: ["Note", "Type", "Incident", "State"],
            rows: [
              row(["Track", "Observation", "No", tag("Open", "a")], "Access", kv),
              row(["Sign", "Observation", "No", tag("Open", "a")], "Corridor", kv),
              row(["Damper", "Evidence", "No", tag("Open", "b")], "Supports the visual finding", kv)
            ]
          });
        })
      ]),
      screen("permit", "Permit Tracking", "permit", [
        tab("PTW-220-18", function () {
          return formula({
            factors: [
              { label: "Requested", value: "Yes", note: "On file", tip: "Permit number PTW-220-18." },
              { label: "Safety review", value: "Open", note: "Not signed", tip: "Prerequisite." },
              { label: "Authorization", value: "Open", note: "Not verified", tip: "This is the hold in the operational line." },
              { label: "Crew", value: "None", note: "HV not named", tip: "Assignment waits on authorization." }
            ],
            chart: { title: "Prerequisites reached", labels: ["Request", "Review", "Authorization", "Crew", "Clear"], series: [{ name: "Reached", color: RED, values: [1, 0, 0, 0, 0], tips: ["Requested", "Not signed", "Not verified", "Not assigned", "Not cleared"] }] },
            columns: ["Step", "PTW-220-18", "Owner", "State"],
            rows: [
              row(["Request", "Filed", "Operations", tag("Done", "g")], "Number issued", kv),
              row(["Authorization", "Blank", "Safety", tag("Open", "r")], "Not verified", kv),
              row(["Crew", "Blank", "Operations", tag("Open", "a")], "Waiting", kv)
            ]
          });
        }),
        tab("Board", function () {
          return lanes({
            kpis: k,
            columns: [
              { title: "Requested", cards: [{ title: "PTW-220-18", meta: "T-104", tip: "Filed, not authorized" }] },
              { title: "Review", cards: [{ title: "Safety", meta: "Not signed", tip: "Prerequisite" }] },
              { title: "Authorized", cards: [{ title: "None", meta: "This package", tip: "No verified authorization" }] },
              { title: "Cleared", cards: [{ title: "ROW access", meta: "N-19", tip: "Vegetation permit is clear" }] },
              { title: "Closed", cards: [{ title: "None", meta: "Visit not started", tip: "Nothing to close" }] }
            ]
          });
        }),
        tab("Prerequisites", function () {
          return pack({
            kpis: k,
            chart: { type: "heat", title: "Prerequisite grid · 100 = satisfied", rows: ["T-104 steel", "T-104 cotter", "N-18 damper", "N-19 ROW"], cols: ["Request", "Review", "Auth.", "Crew", "Outage", "Brief", "Image", "Close"], matrix: [
              [100, 20, 10, 10, 40, 10, 80, 0],
              [100, 20, 10, 10, 40, 10, 80, 0],
              [40, 10, 10, 10, 40, 10, 80, 0],
              [100, 100, 100, 100, 70, 80, 80, 0]
            ] },
            side: { kicker: "CLEARANCE", text: "N-19 is the only task with authorization and a crew. T-104 has a request and an inspection image, and stops there.", gauge: { value: 20, label: "T-104", tip: "Request exists. Authorization does not." } },
            columns: ["Task", "Auth.", "Crew", "State"],
            rows: [
              row(["Steel", "No", "No", tag("Stop", "r")], "PTW-220-18", kv),
              row(["Cotter", "No", "No", tag("Stop", "r")], "Same permit", kv),
              row(["ROW", "Yes", "VEG-02", tag("Clear", "g")], "Different permit", kv)
            ]
          });
        })
      ]),
      screen("mobile", "Field Mobile App", "phone", [
        tab("Task", function () {
          return phone({
            task: "T-104 is not released",
            beforeTip: "Inspection image is on the finding. It is the before, not a repair.",
            afterTip: "After frame stays empty until closure.",
            checks: [
              { label: "Authorization", state: "Open", tip: "PTW-220-18" },
              { label: "HV crew", state: "Unassigned", tip: "HV-04 is the skill match" },
              { label: "Outage", state: "Planned", tip: "Wednesday window, not taken" },
              { label: "Brief", state: "Not done", tip: "No crew to brief" }
            ],
            chart: { type: "bar", title: "Mobile checklist", labels: ["Auth.", "Crew", "Brief", "Before", "After"], series: [{ name: "Ready", color: TEAL, values: [0, 0, 0, 1, 0] }] },
            columns: ["Check", "On device", "Blocks start", "State"],
            rows: [
              row(["Auth.", "No", "Yes", tag("Stop", "r")], "Cannot start", kv),
              row(["Before", "Yes", "No", tag("On file", "g")], "From inspection 6", kv),
              row(["After", "No", "At close", tag("Empty", "a")], "Captured in the field", kv)
            ]
          });
        }),
        tab("Evidence", function () {
          return pack({
            kpis: k,
            chart: { type: "grouped", title: "Images on the package", labels: ["Steel", "Cotter", "Damper", "ROW"], series: [
              { name: "Before", color: BLUE, values: [1, 1, 4, 1] },
              { name: "After", color: TEAL, values: [0, 0, 0, 0] }
            ] },
            side: { kicker: "TRAIL", text: "Before images exist from inspection. After images do not, because the repair has not happened.", gauge: { value: 0, label: "After", tip: "Zero repair photos." } },
            columns: ["Task", "Before", "After", "State"],
            rows: [
              row(["Steel", "1", "0", tag("Open", "a")], "Inspection frame", kv),
              row(["Damper", "4", "0", tag("Grouped", "b")], "Same physical observation", kv),
              row(["ROW", "1", "0", tag("Open", "a")], "Not executed", kv)
            ]
          });
        }),
        tab("Checklist", function () {
          return pack({
            kpis: k,
            chart: { type: "hbar", title: "Start checklist", items: [
              { label: "Permit verified", pct: 10, value: "No", color: RED, tip: "PTW-220-18" },
              { label: "Crew named", pct: 10, value: "No", color: RED, tip: "HV assignment blank" },
              { label: "Brief signed", pct: 0, value: "No", color: AMBER, tip: "Needs a crew" },
              { label: "Isolation", pct: 20, value: "Plan", color: BLUE, tip: "Outage is planned, not taken" }
            ] },
            side: { kicker: "START", text: "The device will not offer a start on T-104 while authorization and crew are blank.", gauge: { value: 0, label: "Start", tip: "Blocked." } },
            columns: ["Gate", "T-104", "N-19", "State"],
            rows: [
              row(["Start", "Blocked", "Allowed", tag("Split", "a")], "Different permits", kv),
              row(["Close", "No", "No", tag("Later", "b")], "Neither task is in the field", kv)
            ]
          });
        })
      ]),
      screen("audit", "Compliance Records", "audit", [
        tab("Audit", function () {
          return pack({
            kpis: [
              { l: "Trail rows", v: "7", s: "This package", tip: "Request, two findings, four damper frames counted as one group, permit, crew gap, ROW assignment.", spark: [2, 3, 4, 5, 6, 7] },
              { l: "Missing sign-off", v: "2", s: "Auth. and crew", tip: "The two blanks that stop the repair.", spark: [2, 2, 2, 2, 2, 2], color: RED },
              { l: "Training in date", v: "2", s: "HV-04 · HV-07", tip: "Both certifications current.", spark: [2, 2, 2, 2, 2, 2], color: GREEN },
              { l: "Incidents", v: "0", s: "Quarter", tip: "Nothing to attach to the audit as an incident.", spark: [0, 0, 0, 0, 0, 0], color: TEAL }
            ],
            chart: { type: "bar", title: "Audit rows by type", labels: ["Finding", "Permit", "Crew", "Image", "Incident"], series: [{ name: "Rows", color: PURPLE, values: [2, 1, 1, 2, 0], tips: ["Two verified findings", "PTW-220-18 open", "Assignment gap", "Before images, no after", "None"] }] },
            side: { kicker: "AUDIT", text: "The record shows a verified finding, an open permit, and no assigned high-voltage crew. That is the whole hold.", gauge: { value: 2, label: "Gaps", tip: "Authorization and crew." } },
            columns: ["Row", "Who", "When", "State"],
            rows: [
              row(["Findings verified", "Reliability", "Insp 6", tag("Done", "g")], "Two structural", kv),
              row(["PTW-220-18", "Safety", "Open", tag("Blank", "r")], "Not signed", kv),
              row(["Crew", "Operations", "Open", tag("Blank", "a")], "No name", kv),
              row(["VEG-02", "Operations", "Set", tag("Done", "g")], "ROW only", kv)
            ]
          });
        }),
        tab("Training", function () {
          return pack({
            kpis: k,
            chart: { type: "heat", title: "Training currency", rows: ["HV-04", "HV-07", "VEG-02", "CIV-1"], cols: ["HV", "Switch", "First aid", "Heights", "ROW", "Drive", "Refresh", "Fit"], matrix: [
              [100, 100, 100, 100, 20, 100, 90, 100],
              [100, 100, 100, 100, 20, 100, 80, 100],
              [10, 10, 100, 40, 100, 100, 85, 70],
              [10, 10, 100, 20, 30, 100, 40, 40]
            ] },
            side: { kicker: "CURRENCY", text: "Both high-voltage certifications are in date. Currency is not the reason the crew line is blank.", gauge: { value: 100, label: "HV", tip: "HV-04 and HV-07 current." } },
            columns: ["Person", "220 kV", "Blocker", "State"],
            rows: [
              row(["HV-04", "Current", "Permit", tag("Free", "g")], "Can be named after authorization", kv),
              row(["HV-07", "Current", "Permit", tag("Free", "g")], "Alternate", kv),
              row(["VEG-02", "None", "Cert", tag("ROW", "a")], "Correctly kept off T-104", kv)
            ]
          });
        }),
        tab("Trail", function () {
          return gantt({
            title: "What is already written down",
            ticks: ["Flight", "Verify", "Request", "Permit", "Crew", "Field", "Close", ""],
            kpis: k,
            lanes: [
              { name: "Finding", bars: [{ left: 2, width: 22, color: TEAL, label: "Verified", tip: "Two structural findings recorded" }] },
              { name: "Permit", bars: [{ left: 34, width: 16, color: RED, label: "Open", tip: "PTW-220-18 requested, not authorized" }] },
              { name: "Crew", bars: [{ left: 50, width: 12, color: AMBER, label: "Blank", tip: "No qualified crew assigned" }] },
              { name: "Field", bars: [{ left: 64, width: 20, color: "#64748b", label: "Empty", tip: "No execution and no after image" }] }
            ],
            sideTitle: "Hold",
            bars: [
              { label: "Authorization", pct: 100, value: "Open", color: RED, tip: "Not verified" },
              { label: "Qualified crew", pct: 100, value: "Open", color: AMBER, tip: "Not assigned" }
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
    operations: { product: "Field Operations Optimization", back: "/#module-card-03", screens: operations() },
    grid: { product: "Energy & Grid Performance", back: "/#module-card-04", screens: grid() },
    inventory: { product: "Supply Chain & Inventory", back: "/#module-card-05", screens: inventory() },
    forecast: { product: "Risk & Maintenance Forecasting", back: "/#module-card-06", screens: forecastApp() },
    finance: { product: "Financial Intelligence", back: "/#module-card-07", screens: finance() },
    workforce: { product: "Workforce & Safety", back: "/#module-card-08", screens: workforce() }
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

  window.NexusApps = {
    open: function (id) {
      var app = APPS[id];
      if (!app) return;
      mount(app);
    }
  };
})();
