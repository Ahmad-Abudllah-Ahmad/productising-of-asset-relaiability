(function () {
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function node(spec) {
    return spec;
  }

  var DRAWINGS = {
    reliability: {
      number: "NX-REL-SLD-0104",
      title: "CORRIDOR NORTH",
      subtitle: "220 kV · TOWER AND SPAN CONDITION",
      sheet: "Asset Reliability Intelligence",
      notes: [
        "Illustrative sheet for Corridor North. Not a construction drawing.",
        "Index falls as condition worsens. T-104 moved from 78 to 61.",
        "Two verified structural findings are both on T-104.",
        "The Span N-18 damper is visual. It is not one of those two findings."
      ],
      nodes: [
        node({ id: "ss", x: 70, y: 250, w: 150, h: 210, kind: "station", tag: "SS-North", name: "Substation North", status: "normal", count: 0, lines: [["Role", "Line origin"], ["Voltage", "220 kV"], ["Package", "Outside the findings"]] }),
        node({ id: "t101", x: 280, y: 250, w: 130, h: 210, kind: "tower", tag: "T-101", name: "Tower T-101", status: "normal", count: 0, lines: [["Index", "88"], ["Trend", "Stable"], ["Findings", "None in this package"]] }),
        node({ id: "t103", x: 470, y: 250, w: 130, h: 210, kind: "tower", tag: "T-103", name: "Tower T-103", status: "warning", count: 1, lines: [["Index", "74"], ["Watch", "Foundation"], ["Status", "Not a verified defect"]] }),
        node({ id: "t104", x: 680, y: 230, w: 150, h: 240, kind: "tower", tag: "T-104", name: "Tower T-104", status: "alarm", count: 2, lines: [["Index", "61, from 78"], ["Priority", "0.69"], ["Findings", "Leg B steel and cotter pin"], ["Review", "18 days past 0.60"]] }),
        node({ id: "n18", x: 910, y: 250, w: 150, h: 210, kind: "span", tag: "N-18", name: "Span N-18", status: "warning", count: 1, lines: [["Item", "Vibration damper"], ["Evidence", "4 frames, score 0.93"], ["Location", "Not confirmed"], ["Class", "Visual, not structural"]] }),
        node({ id: "n19", x: 1120, y: 250, w: 140, h: 210, kind: "span", tag: "N-19", name: "Span N-19", status: "data", count: 1, lines: [["Item", "ROW vegetation"], ["Order", "WO-19-V"], ["Crew", "VEG-02 only"], ["Hours", "4 h released"]] }),
        node({ id: "t110", x: 1340, y: 250, w: 130, h: 210, kind: "tower", tag: "T-110", name: "Tower T-110", status: "normal", count: 0, lines: [["Index", "91"], ["Trend", "Stable"], ["Package", "Outside this review"]] })
      ],
      links: [["ss", "t101"], ["t101", "t103"], ["t103", "t104"], ["t104", "n18"], ["n18", "n19"], ["n19", "t110"]]
    },
    operations: {
      number: "NX-OPS-PFD-0104",
      title: "ONE PLANNED VISIT",
      subtitle: "FIVE TASKS · ONE INSPECTION-AND-REPAIR WINDOW",
      sheet: "Field Operations Optimization",
      notes: [
        "Five maintenance tasks can be grouped into one planned visit.",
        "Field work has not started. The clock is 11 days since confirmation.",
        "CMMS payloads are staged. They are not a live write-back.",
        "Hours on the sheet sum to 17."
      ],
      nodes: [
        node({ id: "steel", x: 70, y: 180, w: 230, h: 150, kind: "job", tag: "WO-104-A", name: "Leg B steel", status: "alarm", count: 1, lines: [["Hours", "6"], ["State", "In approval"], ["Asset", "T-104"], ["Share", "Verified structural"]] }),
        node({ id: "cotter", x: 70, y: 370, w: 230, h: 150, kind: "job", tag: "WO-104-B", name: "Cotter pin", status: "alarm", count: 1, lines: [["Hours", "2"], ["State", "In approval"], ["Asset", "T-104"], ["Share", "Verified structural"]] }),
        node({ id: "damper", x: 70, y: 560, w: 230, h: 150, kind: "job", tag: "WO-18-D", name: "Damper, held", status: "warning", count: 1, lines: [["Hours", "3"], ["State", "Hold"], ["Asset", "Span N-18"], ["Reason", "Location unconfirmed"]] }),
        node({ id: "found", x: 360, y: 180, w: 230, h: 150, kind: "job", tag: "T-103", name: "Foundation check", status: "data", count: 1, lines: [["Hours", "2"], ["State", "Check"], ["Asset", "T-103"], ["Note", "Not a verified defect"]] }),
        node({ id: "row", x: 360, y: 370, w: 230, h: 150, kind: "job", tag: "WO-19-V", name: "ROW vegetation", status: "normal", count: 0, lines: [["Hours", "4"], ["State", "Released"], ["Crew", "VEG-02"], ["Limit", "N-19 only"]] }),
        node({ id: "visit", x: 760, y: 280, w: 280, h: 220, kind: "visit", tag: "VISIT", name: "One corridor visit", status: "warning", count: 1, lines: [["Tasks", "5"], ["Hours", "17"], ["Clock", "11 days, no field start"], ["After images", "None"]] }),
        node({ id: "cmms", x: 1160, y: 300, w: 250, h: 180, kind: "bin", tag: "CMMS", name: "Staged orders", status: "data", count: 1, lines: [["Write-back", "Not live"], ["Orders", "Staged"], ["Close", "None"], ["Field", "Not started"]] })
      ],
      links: [["steel", "visit"], ["cotter", "visit"], ["damper", "visit"], ["found", "visit"], ["row", "visit"], ["visit", "cmms"]]
    },
    grid: {
      number: "NX-GRD-SLD-0220",
      title: "SS-NORTH 220 kV",
      subtitle: "CORRIDOR BESIDE RECENT OPERATIONAL EVENTS",
      sheet: "Energy & Grid Performance",
      notes: [
        "Loading and voltage are historian and EMS readings, not image measurements.",
        "The 19 Jan and 02 Feb outages are not attributed to T-104.",
        "On 12 Mar the line reached 92% of rating for 46 min and stayed in service.",
        "The June loss index 1.8 is from EMS. It is not calculated from photographs."
      ],
      nodes: [
        node({ id: "bus", x: 80, y: 160, w: 280, h: 160, kind: "bus", tag: "BUS-220", name: "220 kV bus", status: "normal", count: 0, lines: [["Station", "SS-North"], ["Nominal", "220 kV"], ["Source", "EMS"]] }),
        node({ id: "volt", x: 430, y: 150, w: 200, h: 140, kind: "meter", tag: "V-220", name: "Voltage", status: "normal", count: 0, lines: [["Reading", "219.4 kV"], ["Point", "SS-North"], ["Source", "EMS"]] }),
        node({ id: "load", x: 700, y: 150, w: 220, h: 140, kind: "meter", tag: "LD-220", name: "Line loading", status: "warning", count: 1, lines: [["Now", "78% of rating"], ["Source", "Historian"], ["Images", "Not used"]] }),
        node({ id: "line", x: 1000, y: 150, w: 250, h: 150, kind: "span", tag: "CN-220", name: "Corridor North", status: "normal", count: 0, lines: [["Circuit", "220 kV"], ["Findings", "Physical, not electrical"], ["Service", "In service"]] }),
        node({ id: "jan", x: 120, y: 460, w: 280, h: 140, kind: "event", tag: "19 JAN", name: "Outage", status: "data", count: 1, lines: [["Duration", "22 min"], ["Link", "Not attributed to T-104"], ["Source", "Operations log"]] }),
        node({ id: "feb", x: 460, y: 460, w: 280, h: 140, kind: "event", tag: "02 FEB", name: "Outage", status: "data", count: 1, lines: [["Duration", "38 min"], ["Link", "Not attributed to T-104"], ["Source", "Operations log"]] }),
        node({ id: "mar", x: 800, y: 460, w: 300, h: 150, kind: "event", tag: "12 MAR", name: "Thermal excursion", status: "warning", count: 1, lines: [["Loading", "92% of rating"], ["Duration", "46 min"], ["Service", "Stayed in service"]] }),
        node({ id: "loss", x: 1160, y: 460, w: 250, h: 150, kind: "meter", tag: "LOSS", name: "Technical loss index", status: "normal", count: 0, lines: [["June", "1.8"], ["March", "2.1"], ["Source", "EMS, not images"]] })
      ],
      links: [["bus", "volt"], ["volt", "load"], ["load", "line"]]
    },
    inventory: {
      number: "NX-SUP-PFD-0104",
      title: "REPLACEMENT HARDWARE",
      subtitle: "THREE APPROVED REPAIR JOBS · WAREHOUSE STILL OPEN",
      sheet: "Supply Chain & Inventory",
      notes: [
        "Replacement hardware is requested for three approved repair jobs.",
        "Warehouse availability still requires confirmation on all three.",
        "The steel plate is not on hand. Lead time is 18 days. The order is draft, not placed.",
        "A damper in the bin does not confirm the Span N-18 location."
      ],
      nodes: [
        node({ id: "wh", x: 80, y: 300, w: 220, h: 180, kind: "bin", tag: "WH-N", name: "Corridor warehouse", status: "warning", count: 3, lines: [["Confirmations", "Open on 3"], ["Live issue", "No"], ["Jobs", "Steel, cotter, damper"]] }),
        node({ id: "plate", x: 460, y: 120, w: 280, h: 160, kind: "part", tag: "MR-104-A", name: "Plate PL-220-B", status: "alarm", count: 1, lines: [["Need", "1"], ["On hand", "0"], ["Lead", "18 days"], ["Order", "Draft, not placed"], ["Value", "$4.2k"]] }),
        node({ id: "pin", x: 460, y: 340, w: 280, h: 150, kind: "part", tag: "MR-104-B", name: "Cotter CP-12", status: "data", count: 1, lines: [["Need", "4"], ["On hand", "40"], ["Confirm", "Still open"], ["Job", "WO-104-B"]] }),
        node({ id: "vd", x: 460, y: 550, w: 280, h: 160, kind: "part", tag: "MR-18-D", name: "Damper VD-220", status: "warning", count: 1, lines: [["Need", "1"], ["On hand", "2"], ["Confirm", "Still open"], ["Hold", "Location unconfirmed"]] }),
        node({ id: "jobs", x: 920, y: 280, w: 280, h: 200, kind: "job", tag: "JOBS", name: "Three repair jobs", status: "warning", count: 3, lines: [["Steel", "Blocked on plate"], ["Cotter", "Bin can cover"], ["Damper", "Bin can cover"], ["Release", "None confirmed"]] })
      ],
      links: [["wh", "plate"], ["wh", "pin"], ["wh", "vd"], ["plate", "jobs"], ["pin", "jobs"], ["vd", "jobs"]]
    },
    forecast: {
      number: "NX-FCT-PFD-0104",
      title: "MANUAL REVIEWS",
      subtitle: "NEXT QUARTER · 18 INSPECTIONS NEED AN ENGINEER",
      sheet: "Risk & Maintenance Forecasting",
      notes: [
        "Forecast: 18 inspections require manual engineering review next quarter.",
        "North 11, Coastal 4, Inland 2, and Angle 1.",
        "Risk-based flights are 46 against a calendar of 22. T-104 is pulled 8 weeks forward.",
        "Review hours are 72. That is 18 reviews at 4 hours, not a cumulative ramp."
      ],
      nodes: [
        node({ id: "north", x: 80, y: 150, w: 230, h: 150, kind: "zone", tag: "NORTH", name: "Corridor North", status: "alarm", count: 11, lines: [["Reviews", "11"], ["Driver", "T-104"], ["Pull", "8 weeks forward"]] }),
        node({ id: "coast", x: 80, y: 340, w: 230, h: 140, kind: "zone", tag: "COAST", name: "Coastal", status: "data", count: 4, lines: [["Reviews", "4"], ["Overdue tower", "None"]] }),
        node({ id: "inland", x: 80, y: 520, w: 230, h: 140, kind: "zone", tag: "INLAND", name: "Inland", status: "data", count: 2, lines: [["Reviews", "2"], ["Overdue tower", "None"]] }),
        node({ id: "angle", x: 80, y: 700, w: 230, h: 130, kind: "zone", tag: "ANGLE", name: "East angle", status: "data", count: 1, lines: [["Reviews", "1"], ["Share", "Of the 18"]] }),
        node({ id: "queue", x: 480, y: 300, w: 280, h: 200, kind: "visit", tag: "Q-18", name: "Engineering queue", status: "alarm", count: 18, lines: [["Reviews", "18"], ["Hours", "72"], ["Basis", "18 × 4 h"], ["Flights", "46 risk-based vs 22 calendar"]] }),
        node({ id: "t104", x: 900, y: 180, w: 260, h: 170, kind: "tower", tag: "T-104", name: "Pulled forward", status: "alarm", count: 1, lines: [["Move", "8 weeks"], ["Index", "61"], ["Priority", "0.69"]] }),
        node({ id: "crew", x: 900, y: 430, w: 260, h: 160, kind: "person", tag: "DAYS", name: "Field days beside review", status: "warning", count: 1, lines: [["HV days", "14"], ["VEG days", "6"], ["Review hours", "72 flat"]] })
      ],
      links: [["north", "queue"], ["coast", "queue"], ["inland", "queue"], ["angle", "queue"], ["queue", "t104"], ["queue", "crew"]]
    },
    finance: {
      number: "NX-FIN-PFD-0104",
      title: "VISIT AND BUDGET",
      subtitle: "APPROVED BUDGET BESIDE THE REPAIR BACKLOG",
      sheet: "Financial Intelligence",
      notes: [
        "The visit estimate is $28.8k. It is not a recorded saving.",
        "Labor $8.3k, equipment $14.4k, and materials $6.2k.",
        "Approved budget is $4.80M. YTD actual is $2.15M. Remaining is $2.65M.",
        "Backlog estimate is $1.26M. Headroom of $1.39M holds only if the estimates hold. It is not a saving."
      ],
      nodes: [
        node({ id: "labor", x: 70, y: 160, w: 230, h: 140, kind: "money", tag: "LABOR", name: "Visit labor", status: "normal", count: 0, lines: [["Amount", "$8.3k"], ["In", "The $28.8k visit"]] }),
        node({ id: "equip", x: 70, y: 340, w: 230, h: 140, kind: "money", tag: "EQUIP", name: "Visit equipment", status: "normal", count: 0, lines: [["Amount", "$14.4k"], ["In", "The $28.8k visit"]] }),
        node({ id: "mat", x: 70, y: 520, w: 230, h: 140, kind: "money", tag: "MATL", name: "Visit materials", status: "warning", count: 1, lines: [["Amount", "$6.2k"], ["Plate", "Still a draft order"]] }),
        node({ id: "visit", x: 400, y: 300, w: 250, h: 180, kind: "visit", tag: "$28.8k", name: "One visit estimate", status: "data", count: 1, lines: [["Total", "$28.8k"], ["Meaning", "Estimate, not a saving"], ["Start", "Not in the field"]] }),
        node({ id: "t104", x: 740, y: 140, w: 240, h: 140, kind: "money", tag: "T-104", name: "T-104 share", status: "alarm", count: 1, lines: [["Amount", "$18.4k"], ["Covers", "Steel and cotter"]] }),
        node({ id: "n18", x: 740, y: 310, w: 240, h: 130, kind: "money", tag: "N-18", name: "Damper share, held", status: "warning", count: 1, lines: [["Amount", "$6.1k"], ["State", "Held"]] }),
        node({ id: "n19", x: 740, y: 470, w: 240, h: 120, kind: "money", tag: "N-19", name: "ROW share", status: "normal", count: 0, lines: [["Amount", "$3.2k"], ["Crew", "VEG-02"]] }),
        node({ id: "check", x: 740, y: 620, w: 240, h: 120, kind: "money", tag: "T-103", name: "Foundation check", status: "data", count: 1, lines: [["Amount", "$1.1k"], ["Class", "Check, not a defect"]] }),
        node({ id: "budget", x: 1080, y: 240, w: 280, h: 220, kind: "bin", tag: "BUDGET", name: "Corridor year", status: "normal", count: 0, lines: [["Approved", "$4.80M"], ["YTD actual", "$2.15M"], ["Remaining", "$2.65M"], ["Backlog", "$1.26M"], ["Headroom", "$1.39M if estimates hold"]] })
      ],
      links: [["labor", "visit"], ["equip", "visit"], ["mat", "visit"], ["visit", "t104"], ["visit", "n18"], ["visit", "n19"], ["visit", "check"], ["visit", "budget"]]
    },
    workforce: {
      number: "NX-WFS-PFD-0104",
      title: "AUTHORIZATION AND CREW",
      subtitle: "REPAIR HELD UNTIL PERMIT AND A QUALIFIED CREW",
      sheet: "Workforce & Safety",
      notes: [
        "The repair task is awaiting verified work authorization and a qualified crew.",
        "PTW-220-18 is requested. It is not authorized.",
        "HV-04 and HV-07 hold current 220 kV certificates and Wednesday time. Neither is assigned.",
        "VEG-02 is assigned only to the N-19 ROW. CIV-1 has no certificate and no time. Incidents this quarter: 0."
      ],
      nodes: [
        node({ id: "ptw", x: 80, y: 280, w: 250, h: 180, kind: "job", tag: "PTW-220-18", name: "Work authorization", status: "alarm", count: 1, lines: [["State", "Requested"], ["Signed", "No"], ["Effect", "T-104 cannot start"]] }),
        node({ id: "hv04", x: 460, y: 120, w: 250, h: 150, kind: "person", tag: "HV-04", name: "High-voltage crew", status: "warning", count: 1, lines: [["Cert", "220 kV current"], ["Time", "Wednesday"], ["Assigned", "No"]] }),
        node({ id: "hv07", x: 460, y: 300, w: 250, h: 150, kind: "person", tag: "HV-07", name: "High-voltage crew", status: "warning", count: 1, lines: [["Cert", "220 kV current"], ["Time", "Wednesday"], ["Assigned", "No"]] }),
        node({ id: "veg", x: 460, y: 490, w: 250, h: 150, kind: "person", tag: "VEG-02", name: "Vegetation crew", status: "normal", count: 0, lines: [["Assigned", "Span N-19"], ["Limit", "Not T-104"], ["Task", "WO-19-V"]] }),
        node({ id: "civ", x: 460, y: 680, w: 250, h: 140, kind: "person", tag: "CIV-1", name: "Civil", status: "data", count: 1, lines: [["Cert", "None for 220 kV"], ["Time", "None"], ["Use", "Not for this repair"]] }),
        node({ id: "task", x: 860, y: 250, w: 280, h: 190, kind: "tower", tag: "T-104", name: "Repair task", status: "alarm", count: 2, lines: [["Authorization", "Open"], ["Crew", "Unassigned"], ["Findings", "Two verified"], ["Incidents", "0 this quarter"]] }),
        node({ id: "row", x: 1220, y: 280, w: 240, h: 160, kind: "span", tag: "N-19", name: "ROW only", status: "normal", count: 0, lines: [["Crew", "VEG-02"], ["Start", "Released"], ["T-104", "Must not take it"]] })
      ],
      links: [["ptw", "task"], ["hv04", "task"], ["hv07", "task"], ["veg", "row"]]
    }
  };

  function symbol(kind, x, y, w, h) {
    var cx = x + w / 2;
    var ink = "#1b2433";
    if (kind === "tower") {
      return '<path d="M' + cx + " " + (y + 18) + " L" + (x + 18) + " " + (y + h - 36) + " H" + (x + w - 18) + ' Z" fill="none" stroke="' + ink + '" stroke-width="1.6"/>' +
        '<path d="M' + (x + 28) + " " + (y + h - 70) + " H" + (x + w - 28) + " M" + (x + 36) + " " + (y + h - 96) + " H" + (x + w - 36) + '" fill="none" stroke="' + ink + '"/>';
    }
    if (kind === "station" || kind === "bus") {
      return '<rect x="' + (x + 16) + '" y="' + (y + 28) + '" width="' + (w - 32) + '" height="' + (h - 78) + '" fill="none" stroke="' + ink + '" stroke-width="1.6"/>' +
        '<path d="M' + (x + 16) + " " + (y + 52) + " H" + (x + w - 16) + '" stroke="' + ink + '" stroke-width="3"/>';
    }
    if (kind === "span") {
      return '<path d="M' + (x + 16) + " " + (y + 48) + " Q" + cx + " " + (y + 8) + " " + (x + w - 16) + " " + (y + 48) + '" fill="none" stroke="' + ink + '" stroke-width="1.6"/>' +
        '<path d="M' + (cx - 8) + " " + (y + 40) + " v18 M" + (cx + 8) + " " + (y + 40) + ' v18" stroke="' + ink + '"/>';
    }
    if (kind === "meter") {
      return '<circle cx="' + cx + '" cy="' + (y + 42) + '" r="18" fill="none" stroke="' + ink + '" stroke-width="1.4"/>' +
        '<path d="M' + (cx - 8) + " " + (y + 46) + " L" + cx + " " + (y + 30) + " L" + (cx + 7) + " " + (y + 44) + '" fill="none" stroke="' + ink + '"/>';
    }
    if (kind === "person") {
      return '<circle cx="' + cx + '" cy="' + (y + 24) + '" r="8" fill="none" stroke="' + ink + '"/>' +
        '<path d="M' + (cx - 14) + ' ' + (y + 58) + ' v-8 q0 -12 14 -12 q14 0 14 12 v8" fill="none" stroke="' + ink + '"/>';
    }
    return '<rect x="' + (x + 16) + '" y="' + (y + 22) + '" width="' + (w - 32) + '" height="36" rx="3" fill="none" stroke="' + ink + '" stroke-width="1.4"/>';
  }

  function marker(status, count, x, y) {
    if (!status || status === "normal" || !count) return "";
    var tone = status === "alarm" ? "is-alarm" : status === "warning" ? "is-warning" : "is-data";
    var pulse = status === "alarm" ? '<circle class="dwg-pulse" cx="0" cy="0" r="13"/>' : "";
    var wide = String(count).length > 1;
    var shape = wide
      ? '<rect x="-13" y="-8" width="26" height="16" rx="8"/>'
      : status === "data"
        ? '<rect x="-6.5" y="-6.5" width="13" height="13" rx="1.5" transform="rotate(45)"/>'
        : '<path d="M0 -9.5 L9 7 H-9 Z"/>';
    var ty = wide ? 3.4 : status === "data" ? 3.2 : 4.2;
    return '<g class="dwg-marker ' + tone + '" transform="translate(' + (x + 18) + " " + (y + 16) + ')">' + pulse + shape + '<text y="' + ty + '" text-anchor="middle">' + count + "</text></g>";
  }

  function center(item) {
    return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  }

  function sheetSvg(doc) {
    var byId = {};
    doc.nodes.forEach(function (item) { byId[item.id] = item; });
    var wires = (doc.links || []).map(function (pair) {
      var a = center(byId[pair[0]]);
      var b = center(byId[pair[1]]);
      return '<path d="M' + a.x + " " + a.y + " L" + b.x + " " + b.y + '" class="wire"/>';
    }).join("");
    var nodes = doc.nodes.map(function (item) {
      var lines = (item.lines || []).map(function (pair) { return pair[0] + "|" + pair[1]; }).join("||");
      return '<g class="eq" data-eq="' + esc(item.id) + '" data-x="' + item.x + '" data-y="' + item.y + '" data-w="' + item.w + '" data-h="' + item.h + '" data-tag="' + esc(item.tag) + '" data-name="' + esc(item.name) + '" data-status="' + esc(item.status) + '" data-lines="' + esc(lines) + '">' +
        '<rect class="eq-card" x="' + item.x + '" y="' + item.y + '" width="' + item.w + '" height="' + item.h + '" rx="6"/>' +
        symbol(item.kind, item.x, item.y, item.w, item.h) +
        '<text class="eq-tag" x="' + (item.x + 14) + '" y="' + (item.y + item.h - 28) + '">' + esc(item.tag) + "</text>" +
        '<text class="eq-name" x="' + (item.x + 14) + '" y="' + (item.y + item.h - 12) + '">' + esc(item.name) + "</text>" +
        marker(item.status, item.count, item.x + item.w - 36, item.y) +
        '<rect class="eq-hit" x="' + item.x + '" y="' + item.y + '" width="' + item.w + '" height="' + item.h + '"/></g>';
    }).join("");
    var notes = doc.notes.map(function (text, index) {
      return '<text class="note" x="48" y="' + (958 + index * 18) + '">' + (index + 1) + ".  " + esc(text) + "</text>";
    }).join("");
    return '<svg class="dwg-svg" viewBox="0 0 1700 1100" data-w="1700" data-h="1100">' +
      "<style>" +
      ".sheet{fill:#fbfcfe;stroke:#1b2433;stroke-width:1.4}.sheet-in{fill:none;stroke:#1b2433;stroke-width:.6}" +
      ".wire{fill:none;stroke:#8b95a8;stroke-width:1.4}.eq-card{fill:#fff;stroke:#1b2433;stroke-width:1.1}" +
      ".eq-tag{font:600 13px ui-monospace,monospace;fill:#1b2433}.eq-name{font:500 11px ui-monospace,monospace;fill:#5b6578}" +
      ".note{font:500 11px ui-monospace,monospace;fill:#3d4656}.tb{font:500 10px ui-monospace,monospace;fill:#5b6578}" +
      ".tb-strong{font:700 13px ui-monospace,monospace;fill:#1b2433}.stamp{font:700 10px ui-monospace,monospace;fill:#9f1239}" +
      ".eq-hit{fill:transparent;stroke:none}.zone{font:600 11px ui-monospace,monospace;fill:#667085;letter-spacing:.12em}" +
      "</style>" +
      '<rect class="sheet" x="18" y="18" width="1664" height="1064"/>' +
      '<rect class="sheet-in" x="28" y="28" width="1644" height="1044"/>' +
      '<text class="zone" x="48" y="58">' + esc(doc.sheet.toUpperCase()) + "</text>" +
      '<text class="zone" x="48" y="78">CORRIDOR NORTH · 220 kV</text>' +
      wires + nodes +
      '<path class="sheet-in" d="M40 920 H1100"/>' +
      '<text class="tb-strong" x="48" y="942">GENERAL NOTES</text>' + notes +
      '<path class="sheet-in" d="M1120 900 H1654 V1054 H1120 Z"/>' +
      '<text class="tb-strong" x="1136" y="924">NEXUS OS</text>' +
      '<text class="tb" x="1136" y="942">ASSET RELIABILITY · ILLUSTRATIVE DRAWING</text>' +
      '<text class="tb-strong" x="1136" y="966">' + esc(doc.title) + "</text>" +
      '<text class="tb" x="1136" y="984">' + esc(doc.subtitle) + "</text>" +
      '<text class="tb" x="1136" y="1010">DRAWING NO.  ' + esc(doc.number) + "</text>" +
      '<text class="tb" x="1136" y="1028">REV A    SHEET 1 OF 1    SCALE NONE</text>' +
      '<text class="stamp" x="1136" y="1046">NOT FOR CONSTRUCTION</text>' +
      "</svg>";
  }

  function board(id) {
    var doc = DRAWINGS[id];
    if (!doc) return "";
    return '<div class="screen dwg-screen"><div class="dwg" data-dwg="' + esc(id) + '">' +
      '<div class="dwg-toolbar" role="toolbar" aria-label="Drawing view"><span class="dwg-number">' + esc(doc.number) + "</span>" +
      '<div class="dwg-zoom"><button type="button" data-zoom="out" aria-label="Zoom out">−</button><output data-zoom-read>100%</output>' +
      '<button type="button" data-zoom="0.5">50%</button><button type="button" data-zoom="1" class="is-on">100%</button><button type="button" data-zoom="2">200%</button>' +
      '<button type="button" data-zoom="fit" class="is-on">Fit</button></div></div>' +
      '<div class="dwg-host"><div class="dwg-stage">' + sheetSvg(doc) + '<svg class="dwg-overlay" viewBox="0 0 1700 1100"></svg></div>' +
      '<div class="dwg-card" hidden></div></div>' +
      '<ul class="dwg-legend" aria-label="Marker legend"><li><i class="is-alarm"></i>Alarm</li><li><i class="is-warning"></i>Warning</li><li><i class="is-data"></i>Data issue</li>' +
      '<li class="dwg-hint">Drag to pan · Ctrl + scroll to zoom · Click equipment to keep the reading</li></ul></div></div>';
  }

  function bind(root) {
    var dwg = root.querySelector(".dwg");
    if (!dwg || dwg.getAttribute("data-bound") === "1") return;
    dwg.setAttribute("data-bound", "1");
    var host = dwg.querySelector(".dwg-host");
    var stage = dwg.querySelector(".dwg-stage");
    var svg = dwg.querySelector(".dwg-svg");
    var overlay = dwg.querySelector(".dwg-overlay");
    var card = dwg.querySelector(".dwg-card");
    var read = dwg.querySelector("[data-zoom-read]");
    var view = { x: 0, y: 0, scale: 1 };
    var hoverId = "";
    var selectedId = "";
    var drag = null;

    function apply() {
      var vb = view.x + " " + view.y + " " + (1700 / view.scale) + " " + (1100 / view.scale);
      svg.setAttribute("viewBox", vb);
      overlay.setAttribute("viewBox", vb);
      read.textContent = Math.round(view.scale * 100) + "%";
      dwg.querySelectorAll(".dwg-zoom button").forEach(function (button) {
        var key = button.getAttribute("data-zoom");
        var on = key === "fit" ? view.scale === 1 && view.x === 0 && view.y === 0 : key === String(view.scale);
        if (key === "0.5" || key === "1" || key === "2" || key === "fit") button.classList.toggle("is-on", on);
      });
      paint();
    }

    function zoomBy(factor) {
      var cx = view.x + (1700 / view.scale) / 2;
      var cy = view.y + (1100 / view.scale) / 2;
      view.scale = Math.max(0.5, Math.min(2.5, view.scale * factor));
      view.x = cx - (1700 / view.scale) / 2;
      view.y = cy - (1100 / view.scale) / 2;
      apply();
    }

    function box(id, cls) {
      var item = svg.querySelector('[data-eq="' + id + '"]');
      if (!item) return "";
      var x = Number(item.getAttribute("data-x")) - 6;
      var y = Number(item.getAttribute("data-y")) - 6;
      var w = Number(item.getAttribute("data-w")) + 12;
      var h = Number(item.getAttribute("data-h")) + 12;
      return '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4"/>';
    }

    function paint() {
      var html = "";
      if (hoverId && hoverId !== selectedId) html += box(hoverId, "dwg-hover");
      if (selectedId) html += box(selectedId, "dwg-selected");
      overlay.innerHTML = html;
    }

    function fillCard(id) {
      var item = svg.querySelector('[data-eq="' + id + '"]');
      if (!item) {
        card.hidden = true;
        return;
      }
      var status = item.getAttribute("data-status") || "normal";
      var label = status === "alarm" ? "Alarm" : status === "warning" ? "Warning" : status === "data" ? "Data issue" : "In service";
      var rows = (item.getAttribute("data-lines") || "").split("||").filter(Boolean).map(function (pair) {
        var bits = pair.split("|");
        return "<li><span>" + esc(bits[0]) + "</span><b>" + esc(bits.slice(1).join("|")) + "</b></li>";
      }).join("");
      card.hidden = false;
      card.innerHTML = '<div class="dwg-card-h"><b>' + esc(item.getAttribute("data-tag")) + '</b><i class="is-' + esc(status) + '">' + label + "</i></div><div class=\"dwg-card-name\">" + esc(item.getAttribute("data-name")) + "</div><ul>" + rows + "</ul>";
    }

    function placeCard(event) {
      var bounds = host.getBoundingClientRect();
      var x = event.clientX - bounds.left + 18;
      var y = event.clientY - bounds.top + 18;
      if (x + 280 > bounds.width) x = event.clientX - bounds.left - 292;
      if (y + 180 > bounds.height) y = Math.max(8, bounds.height - 190);
      card.style.left = x + "px";
      card.style.top = y + "px";
    }

    function units(event) {
      var bounds = svg.getBoundingClientRect();
      return { x: (1700 / view.scale) / bounds.width, y: (1100 / view.scale) / bounds.height };
    }

    host.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      var eq = event.target.closest && event.target.closest("[data-eq]");
      drag = { x: event.clientX, y: event.clientY, moved: false, eq: eq ? eq.getAttribute("data-eq") : "" };
      host.setPointerCapture(event.pointerId);
    });
    host.addEventListener("pointermove", function (event) {
      if (drag) {
        var dx = event.clientX - drag.x;
        var dy = event.clientY - drag.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          var scale = units(event);
          view.x -= dx * scale.x;
          view.y -= dy * scale.y;
          drag.x = event.clientX;
          drag.y = event.clientY;
          apply();
        }
        return;
      }
      var eq = event.target.closest && event.target.closest("[data-eq]");
      var next = eq ? eq.getAttribute("data-eq") : "";
      host.classList.toggle("is-pointing", !!next);
      if (next !== hoverId) {
        hoverId = next;
        paint();
      }
      if (next) {
        fillCard(next);
        placeCard(event);
      } else if (!selectedId) {
        card.hidden = true;
      } else {
        fillCard(selectedId);
      }
    });
    host.addEventListener("pointerup", function (event) {
      if (!drag) return;
      if (!drag.moved && drag.eq) {
        selectedId = selectedId === drag.eq ? "" : drag.eq;
        fillCard(selectedId || hoverId);
        if (!selectedId && !hoverId) card.hidden = true;
        else placeCard(event);
        paint();
      }
      drag = null;
    });
    host.addEventListener("pointerleave", function () {
      hoverId = "";
      host.classList.remove("is-pointing");
      paint();
      if (selectedId) fillCard(selectedId);
      else card.hidden = true;
    });
    host.addEventListener("wheel", function (event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    dwg.querySelector(".dwg-zoom").addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) return;
      var key = button.getAttribute("data-zoom");
      if (key === "out") zoomBy(1 / 1.25);
      else if (key === "fit") { view.x = 0; view.y = 0; view.scale = 1; apply(); }
      else {
        var target = Number(key);
        zoomBy(target / view.scale);
      }
    });
    apply();
  }

  window.NexusDrawings = { board: board, bind: bind };
})();
