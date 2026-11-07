(function () {
  var MODULES = [
    {
      num: "01",
      title: "Asset Reliability Intelligence",
      screens: [
        {
          title: "Asset Registry",
          lead: "Associate detected defects with towers, spans, and line components.",
          ai: "Computer-vision findings are written onto the shared transmission registry: tower, span, and component, not a loose image tag.",
          html: registry
        },
        {
          title: "Tower Health",
          lead: "Track asset condition history over repeated aerial inspections.",
          ai: "Repeated inspections build a condition history for each tower. Tower T-104 now carries two verified structural findings.",
          html: towerHealth
        },
        {
          title: "Line Health",
          lead: "See span condition along the line, not as isolated photographs.",
          ai: "Span-level health rolls verified findings up to the 220 kV circuit so a single displaced damper is read in the context of the line.",
          html: lineHealth
        },
        {
          title: "Risk Map",
          lead: "Calculate explainable risk-priority scores (Condition × Criticality × Consequence).",
          ai: "Priority is the product of condition, criticality, and consequence. The score can be opened and explained; it is not a black-box rank.",
          html: riskMap
        },
        {
          title: "Maintenance History",
          lead: "Compare inspection history and maintenance outcomes on the same asset.",
          ai: "Each inspection, confirmation, and intervention stays on the asset record so condition is read across time.",
          html: history
        },
        {
          title: "Reliability Dashboard",
          lead: "Identify transmission assets overdue for engineering review or intervention.",
          ai: "Assets whose verified findings have no current engineering review are surfaced here, with the operational evidence attached.",
          html: reliability
        }
      ]
    },
    {
      num: "02",
      title: "AI Inspection & Quality",
      screens: [
        {
          title: "Inspection Dashboard",
          lead: "Run the 23-category computer-vision model across drone, helicopter, and ground batches.",
          ai: "The model covers 23 defect categories: group sizes 3 + 7 + 8 + 2 + 3. Tower Structure & Components is the group of eight. Detection spans insulators, conductors, tower steel, and foundations.",
          html: inspectionDash
        },
        {
          title: "Upload & Processing",
          lead: "Upload drone, helicopter, or ground-inspection high-resolution batches.",
          ai: "Each batch keeps image metadata, tower IDs, and GPS so a detection can be placed on the network before an engineer opens it.",
          html: upload
        },
        {
          title: "Defect Explorer",
          lead: "Detect and localize supported defects, then group repeated observations of the same physical defect.",
          ai: "A potential displaced vibration damper on the 220 kV span is one finding, even when several frames see it. Confidence stays attached to the evidence.",
          html: explorer
        },
        {
          title: "AI Image Viewer",
          lead: "Display bounding boxes, confidence scores, and georeferenced image evidence.",
          ai: "The label states what the image can support. An ordinary RGB frame cannot confirm an electrical short by itself, and some clearance calls need LiDAR or a calibrated measurement. Human engineering confirmation stays mandatory where the class requires it.",
          html: imageViewer
        },
        {
          title: "Human Review Queue",
          lead: "Engineering review to confirm, correct, or reject model findings.",
          ai: "Unclassified images and uncertain predictions wait in this queue. The queue is not a 24th defect class.",
          html: reviewQueue
        },
        {
          title: "Inspection Reports",
          lead: "Generate asset-specific inspection reports from confirmed findings.",
          ai: "The report carries the image, the class, the reviewer decision, and the asset location an engineer confirmed.",
          html: reports
        }
      ]
    },
    {
      num: "03",
      title: "Field Operations Optimization",
      screens: [
        {
          title: "Operations Command Center",
          lead: "Turn approved defect cases into prioritized work and group nearby repairs.",
          ai: "Five maintenance tasks are grouped into one planned inspection-and-repair visit along Corridor North.",
          html: command
        },
        {
          title: "Work Orders",
          lead: "Direct bi-directional work-order synchronization with SAP PM and IBM Maximo.",
          ai: "Approved findings become work requests in the system of record, and closure status returns to the asset.",
          html: workOrders
        },
        {
          title: "Maintenance Planner",
          lead: "Group nearby repairs by line corridor or maintenance outage window.",
          ai: "The damper replacement, the second structural item on T-104, and three adjacent tasks share one outage window.",
          html: planner
        },
        {
          title: "Crew Scheduling",
          lead: "Schedule maintenance from priority and the crews who are actually available.",
          ai: "The visit is held until a qualified high-voltage crew and a clear corridor window exist together.",
          html: scheduling
        },
        {
          title: "Approval Workflows",
          lead: "Route the work request for technical approval before anyone is dispatched.",
          ai: "Only a confirmed finding, with its image evidence and risk score, can open an approval.",
          html: approvals
        },
        {
          title: "Field Execution",
          lead: "Track turnaround time from initial defect confirmation to field repair closure.",
          ai: "The clock starts at engineering confirmation and stops when field evidence closes the work order.",
          html: execution
        }
      ]
    },
    {
      num: "04",
      title: "Energy & Grid Performance",
      screens: [
        {
          title: "Grid Overview",
          lead: "Connect approved SCADA, EMS, and operational historian telemetry.",
          ai: "Imagery does not invent electrical state. Line loading, voltage, and trips come from approved operational systems.",
          html: gridOverview
        },
        {
          title: "Line Performance",
          lead: "Track line loading, voltage stability, current, and historical trip events.",
          ai: "The 220 kV corridor is read as an operating asset: loading, voltage, and current beside its confirmed physical findings.",
          html: linePerformance
        },
        {
          title: "Outage Analytics",
          lead: "Analyze outage frequency, duration, and operational network constraints.",
          ai: "Outage history is joined to the same spans that carry verified inspection defects.",
          html: outages
        },
        {
          title: "Loss Analysis",
          lead: "Investigate electrical loss only where network data exists.",
          ai: "Computer-vision imagery alone cannot calculate electrical losses or live line-loading risk. This screen uses grid and network data.",
          html: losses
        },
        {
          title: "Grid Events",
          lead: "Correlate confirmed physical defects with operating stress and weather exposure.",
          ai: "High-priority findings on the 220 kV corridor are shown with recent thermal loading operational events.",
          html: events
        },
        {
          title: "Reliability Trends",
          lead: "Investigate the relationship between asset condition and reliability.",
          ai: "Condition from repeated inspections is plotted against operating history so a physical finding is not read in isolation.",
          html: trends
        }
      ]
    },
    {
      num: "05",
      title: "Supply Chain & Inventory",
      screens: [
        {
          title: "Parts Catalog",
          lead: "Map defect categories directly to approved replacement-part catalog items.",
          ai: "Displaced vibration damper maps to the approved damper hardware for this conductor family, not to a free-text part guess.",
          html: catalog
        },
        {
          title: "Inventory Dashboard",
          lead: "Audit warehouse stock against planned maintenance work orders.",
          ai: "Replacement hardware requested for three approved repair jobs; warehouse availability is confirmed.",
          html: inventory
        },
        {
          title: "Material Requests",
          lead: "Generate automatic material reservations or procurement purchase requests.",
          ai: "The three approved Corridor North jobs reserve stock before the crew is dispatched.",
          html: materials
        },
        {
          title: "Supplier Management",
          lead: "Track vendor lead times and the suppliers behind approved hardware.",
          ai: "Lead time is visible before a shortage can delay the grouped visit.",
          html: suppliers
        },
        {
          title: "Procurement",
          lead: "Raise a purchase request when the warehouse cannot cover the approved repair.",
          ai: "Procurement is tied to the defect class and the approved bill of materials.",
          html: procurement
        },
        {
          title: "Stock Forecast",
          lead: "Flag potential hardware shortages before dispatch.",
          ai: "Forecast demand from approved repairs is compared with on-hand stock and supplier lead time.",
          html: stock
        }
      ]
    },
    {
      num: "06",
      title: "Risk & Maintenance Forecasting",
      screens: [
        {
          title: "Risk Forecast",
          lead: "Analyze historical defect recurrence across tower structures and environments.",
          ai: "Recurrence is learned from repeated inspections, not from a single flight.",
          html: riskForecast
        },
        {
          title: "Inspection Planning",
          lead: "Plan dynamic inspection frequency based on risk indicators rather than calendar intervals.",
          ai: "Forecast the number of inspections requiring manual engineering review next quarter.",
          html: inspectionPlan
        },
        {
          title: "Maintenance Demand",
          lead: "Forecast maintenance workload and crew demand by operating zone.",
          ai: "Zone demand combines open verified defects, asset age, and the work already released to the field.",
          html: demand
        },
        {
          title: "Asset Deterioration",
          lead: "Develop longitudinal asset deterioration models incorporating weather and age.",
          ai: "Deterioration uses inspection history, age, and environmental exposure once enough repeated observations exist.",
          html: deterioration
        },
        {
          title: "Scenario Analysis",
          lead: "Compare inspection and maintenance futures before the plan is locked.",
          ai: "Scenarios change review capacity and inspection intensity, then show the effect on next quarter’s engineering queue.",
          html: scenarios
        }
      ]
    },
    {
      num: "07",
      title: "Financial Intelligence",
      screens: [
        {
          title: "Maintenance Cost Dashboard",
          lead: "Calculate labor, equipment, and material costs of proposed repair plans.",
          ai: "Cost is built from the approved repair, its parts, and the crew time already planned.",
          html: costDash
        },
        {
          title: "Budget Planning",
          lead: "Compare approved maintenance budgets with the estimated cost of the remaining repair backlog.",
          ai: "The backlog is the set of approved repairs still open, priced from work orders and material cost.",
          html: budget
        },
        {
          title: "Cost per Asset",
          lead: "Track maintenance spending by region and transmission corridor.",
          ai: "Spend follows the corridor and the asset, so Corridor North can be compared with the rest of the region.",
          html: costAsset
        },
        {
          title: "Repair vs Replace",
          lead: "Data-driven repair versus replacement life-cycle scenario modeling.",
          ai: "The choice uses condition history, consequence, and the cost of the remaining life, not a single defect photo.",
          html: repairReplace
        },
        {
          title: "Capital Planning",
          lead: "Justify annual maintenance budgets and capital asset replacement programs.",
          ai: "Capital candidates are assets whose verified condition and consequence no longer fit inside the maintenance plan.",
          html: capital
        }
      ]
    },
    {
      num: "08",
      title: "Workforce & Safety",
      screens: [
        {
          title: "Workforce Dashboard",
          lead: "See qualifications, high-voltage certifications, and who can legally take the work.",
          ai: "A repair is not assignable until the crew’s high-voltage certification covers the asset.",
          html: workforce
        },
        {
          title: "Crew Assignment",
          lead: "Assign authorized crews based on qualifications and high-voltage certifications.",
          ai: "The Corridor North visit is assigned to a qualified high-voltage crew, not the next available name.",
          html: crew
        },
        {
          title: "Safety Management",
          lead: "Record hazards, incidents, right-of-way encroachments, and safety observations.",
          ai: "Right-of-way clearance and vegetation sit beside the structural finding so the visit brief is complete.",
          html: safety
        },
        {
          title: "Permit Tracking",
          lead: "Manage digital permit-to-work prerequisites, safety clearances, and approvals.",
          ai: "Work authorization, clearance, and the permit chain are prerequisites, not paperwork after the fact.",
          html: permits
        },
        {
          title: "Field Mobile App",
          lead: "Capture before-and-after photographic evidence from the span.",
          ai: "The crew closes the damper repair with a field photograph tied back to the original AI finding.",
          html: mobile
        },
        {
          title: "Compliance Records",
          lead: "Maintain the audit trail for maintenance and safety workflows.",
          ai: "Repair task verified: work authorization approved, qualified high-voltage crew assigned, permits cleared.",
          html: compliance
        }
      ]
    }
  ];

  function kpi(items) {
    return '<div class="nxp-kpis">' + items.map(function (item) {
      return '<div class="nxp-kpi"><span>' + item[0] + '</span><b>' + item[1] + '</b><em>' + item[2] + '</em></div>';
    }).join("") + "</div>";
  }

  function tag(kind, label) {
    return '<span class="nxp-tag ' + kind + '">' + label + "</span>";
  }

  function table(heads, rows) {
    return '<table class="nxp-table"><thead><tr>' + heads.map(function (h) {
      return "<th>" + h + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (row) {
      return '<tr class="' + (row.hot ? "is-hot" : "") + '">' + row.cells.map(function (cell) {
        return "<td>" + cell + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }

  function bars(rows) {
    return '<div class="nxp-bars">' + rows.map(function (row) {
      return '<div class="nxp-bar-row"><span>' + row[0] + '</span><div class="nxp-bar-track"><div class="nxp-bar-fill" style="width:' + row[1] + '%"></div></div><em>' + row[2] + "</em></div>";
    }).join("") + "</div>";
  }

  function chart(cols) {
    return '<div class="nxp-chart">' + cols.map(function (col) {
      return '<div class="nxp-col"><i style="height:' + col[0] + '%"></i><span>' + col[1] + "</span></div>";
    }).join("") + "</div>";
  }

  function registry() {
    return kpi([
      ["Linked findings", "2", "Both on tower T-104"],
      ["Span", "220 kV", "Corridor North"],
      ["Component", "Tower steel", "Plus one damper"],
      ["Registry state", "Bound", "Tower · span · component"]
    ]) + '<div class="nxp-split"><div class="nxp-panel"><h3>Transmission asset registry</h3>' + table(
      ["Asset", "Type", "Line", "Linked finding", "State"],
      [
        { hot: true, cells: ["T-104", "Tower", "220 kV Corridor North", "Structural steel · verified", tag("review", "Review")] },
        { hot: true, cells: ["Span N-18", "Span", "220 kV Corridor North", "Displaced vibration damper", tag("review", "Review")] },
        { cells: ["T-105", "Tower", "220 kV Corridor North", "None this cycle", tag("ok", "Stable")] },
        { cells: ["T-098", "Foundation", "220 kV Corridor North", "Watch item", tag("watch", "Watch")] },
        { cells: ["Insulator string B", "Component", "Span N-17", "No verified defect", tag("ok", "Clear")] }
      ]
    ) + '</div><div class="nxp-panel"><h3>How the finding is attached</h3><p class="nxp-quote">Tower T-104 has two verified structural findings and requires engineering review.</p><p class="nxp-note">The damper detection is not left on the image. It is associated with span N-18 and the damper component, and the structural finding is associated with tower T-104.</p></div></div>';
  }

  function towerHealth() {
    return kpi([
      ["Tower", "T-104", "220 kV Corridor North"],
      ["Inspections", "6", "Repeated aerial cycles"],
      ["Verified findings", "2", "Structural"],
      ["Condition trend", "Down", "Since the prior cycle"]
    ]) + '<div class="nxp-split"><div class="nxp-panel"><h3>Condition across repeated inspections</h3>' + chart([[78, "C1"], [76, "C2"], [74, "C3"], [71, "C4"], [66, "C5"], [61, "C6"]]) + '<p class="nxp-note">Each bar is one aerial inspection of the same tower. The latest cycle holds both verified structural findings.</p></div><div class="nxp-panel"><h3>What changed</h3><div class="nxp-timeline"><div class="nxp-tl"><time>Cycle 4</time><div class="rail"><div class="dot"></div></div><p><b>No structural finding.</b> Condition still inside the review band.</p></div><div class="nxp-tl"><time>Cycle 5</time><div class="rail"><div class="dot"></div></div><p><b>First structural finding verified</b> on tower steel.</p></div><div class="nxp-tl"><time>Cycle 6</time><div class="rail"><div class="dot"></div></div><p><b>Second finding verified.</b> Engineering review is now required.</p></div></div></div></div>';
  }

  function lineHealth() {
    var towers = ["T-099", "T-100", "T-101", "T-102", "T-103", "T-104", "T-105", "T-106"].map(function (name, index) {
      var hot = name === "T-104";
      return '<div class="nxp-tower' + (hot ? " is-hot" : "") + '"><b>' + name + "</b>" + (hot ? "2 verified findings" : (index === 1 ? "Watch" : "In band")) + "</div>";
    }).join("");
    return kpi([
      ["Circuit", "220 kV", "Corridor North"],
      ["Spans in view", "18", "This operating section"],
      ["Hot tower", "T-104", "Engineering review"],
      ["Adjacent span", "N-18", "Damper finding"]
    ]) + '<div class="nxp-panel"><h3>Line health along Corridor North</h3><div class="nxp-span">' + towers + '</div><p class="nxp-note" style="margin-top:0.8rem">Span health is the line, not a pile of images. T-104 and span N-18 are the assets that currently require review.</p></div>';
  }

  function riskMap() {
    return kpi([
      ["Score", "Explainable", "Condition × Criticality × Consequence"],
      ["Asset", "T-104", "Two verified findings"],
      ["Outcome", "Review", "Engineering, not a silent rank"],
      ["Corridor", "North", "220 kV"]
    ]) + '<div class="nxp-split"><div class="nxp-panel"><h3>Risk map · Corridor North</h3><div class="nxp-map"><svg viewBox="0 0 640 280" role="img" aria-label="Corridor North risk map">'+
      '<path d="M40 180 C 140 120, 220 200, 320 150 S 500 90, 600 140" fill="none" stroke="#EAE2FC" stroke-width="2" opacity="0.7"/>'+
      '<circle cx="90" cy="158" r="7" fill="#b7d8cc"/><circle cx="180" cy="156" r="7" fill="#e2c39a"/><circle cx="270" cy="168" r="7" fill="#b7d8cc"/>'+
      '<circle cx="360" cy="142" r="11" fill="#EAE2FC"/><circle cx="450" cy="118" r="7" fill="#b7d8cc"/><circle cx="560" cy="136" r="7" fill="#b7d8cc"/>'+
      '<text x="332" y="126" fill="#EAE2FC" font-size="13" font-family="inherit">T-104</text>'+
      '<text x="40" y="40" fill="#a89f92" font-size="12" font-family="inherit">220 kV · Corridor North</text></svg></div></div>'+
      '<div class="nxp-panel"><h3>Why T-104 is first</h3><p class="nxp-quote">Two verified structural findings on a 220 kV tower.</p><p class="nxp-note">Condition carries the findings. Criticality and consequence carry the circuit. The product is explainable, and it is why engineering review is required.</p></div></div>'+
      '<div class="nxp-panel" style="margin-top:0.75rem"><h3>Condition × Criticality × Consequence</h3><div class="nxp-factors"><div class="nxp-factor"><span>Condition</span><b>0.42</b></div><div class="nxp-op">×</div><div class="nxp-factor"><span>Criticality</span><b>0.91</b></div><div class="nxp-op">×</div><div class="nxp-factor"><span>Consequence</span><b>0.88</b></div><div class="nxp-op">=</div><div class="nxp-result"><span>Priority</span><b>Review</b></div></div></div>';
  }

  function history() {
    return '<div class="nxp-panel"><h3>T-104 maintenance and inspection history</h3><div class="nxp-timeline">'+
      item("Year 1", "Baseline aerial inspection. No structural finding recorded.") +
      item("Year 2", "Repeat inspection. Condition held. Hardware photographed for the registry.") +
      item("Year 3", "Damper position noted on span N-18. Not yet a verified defect.") +
      item("This cycle", "Two structural findings verified on T-104. Engineering review opened. No intervention closed yet.") +
      "</div></div>";
  }

  function item(when, text) {
    return '<div class="nxp-tl"><time>' + when + '</time><div class="rail"><div class="dot"></div></div><p><b>' + text + "</b></p></div>";
  }

  function reliability() {
    return kpi([
      ["Overdue review", "T-104", "Two verified findings"],
      ["Intervention open", "Span N-18", "Damper not yet repaired"],
      ["On watch", "T-098", "Foundation"],
      ["Closed this month", "4", "Review completed"]
    ]) + '<div class="nxp-split"><div class="nxp-panel"><h3>Assets overdue for engineering review or intervention</h3>' + table(
      ["Asset", "Why it is here", "Age of finding", "Next action"],
      [
        { hot: true, cells: ["T-104", "Two verified structural findings", "This cycle", tag("review", "Engineering review")] },
        { hot: true, cells: ["Span N-18", "Displaced vibration damper", "Awaiting confirmation", tag("watch", "Confirm location")] },
        { cells: ["T-098", "Foundation watch from prior flight", "Prior cycle", tag("muted", "Scheduled")] }
      ]
    ) + '</div><div class="nxp-panel"><h3>Operational evidence</h3><p class="nxp-quote">“Tower T-104 has two verified structural findings and requires engineering review.”</p><p class="nxp-note">Inputs on this screen: computer-vision findings, asset master data, line criticality, inspection history, and maintenance records.</p></div></div>';
  }

  function inspectionDash() {
    return kpi([
      ["Model", "23 categories", "3 + 7 + 8 + 2 + 3"],
      ["Tower structure", "8 classes", "One of the five groups"],
      ["Domains", "4", "Insulators, conductors, steel, foundations"],
      ["Queue", "Separate", "Not a 24th class"]
    ]) + '<div class="nxp-split"><div class="nxp-panel"><h3>23-category model</h3>' + bars([
      ["Group of 3", 13, "3 classes"],
      ["Group of 7", 30, "7 classes"],
      ["Tower structure & components", 35, "8 classes"],
      ["Group of 2", 9, "2 classes"],
      ["Group of 3", 13, "3 classes"]
    ]) + '<p class="nxp-note" style="margin-top:0.75rem">The model detects insulators, conductors, tower steel, and foundations. Tower Structure & Components contains eight categories.</p></div><div class="nxp-panel"><h3>This batch</h3><p class="nxp-quote">Potential displaced vibration damper detected on the 220 kV span.</p><p class="nxp-note">Review the image evidence and confirm the asset location on this span.</p></div></div>';
  }

  function upload() {
    return kpi([
      ["Drone batch", "Corridor North", "High resolution"],
      ["Helicopter", "Queued", "Same towers"],
      ["Ground", "Substation ends", "Foundations"],
      ["Metadata", "Kept", "Tower ID · GPS"]
    ]) + '<div class="nxp-panel"><h3>Batches in processing</h3>' + table(
      ["Source", "Coverage", "Images", "Tower IDs", "State"],
      [
        { hot: true, cells: ["Drone", "220 kV Corridor North", "1,284", "T-099 to T-112", tag("review", "CV running")] },
        { cells: ["Helicopter", "Same corridor, wider pass", "640", "Matched", tag("watch", "Queued")] },
        { cells: ["Ground", "Foundations at angle ends", "86", "T-104, T-098", tag("ok", "Catalogued")] }
      ]
    ) + "</div>";
  }

  function explorer() {
    return kpi([
      ["Open finding", "Damper", "Span N-18"],
      ["Frames grouped", "4", "One physical defect"],
      ["Confidence", "Shown", "With the box"],
      ["Class family", "Conductor hardware", "Existing category"]
    ]) + '<div class="nxp-panel"><h3>Defect explorer</h3>' + table(
      ["Finding", "Class", "Asset", "Evidence", "Confidence", "Status"],
      [
        { hot: true, cells: ["F-220-184", "Displaced vibration damper", "Span N-18", "4 frames, one defect", "0.93", tag("review", "Needs review")] },
        { cells: ["F-104-002", "Tower steel", "T-104", "Verified prior", "Confirmed", tag("ok", "Verified")] },
        { cells: ["F-104-007", "Tower steel", "T-104", "Second structural", "Confirmed", tag("ok", "Verified")] },
        { cells: ["F-098-014", "Foundation", "T-098", "Single frame", "0.61", tag("watch", "Uncertain")] }
      ]
    ) + "</div>";
  }

  function frameSvg() {
    return '<svg viewBox="0 0 640 360" role="img" aria-label="Georeferenced inspection frame of span N-18 with a localized damper">'+
      '<defs><linearGradient id="nxpSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2433"/><stop offset="1" stop-color="#0c1218"/></linearGradient></defs>'+
      '<rect width="640" height="360" fill="url(#nxpSky)"/>'+
      '<g stroke="#8d8378" stroke-width="1.2" fill="none" opacity="0.9">'+
      '<path d="M70 40 L110 300 M70 40 L30 300 M30 300 H110 M48 130 H92 M42 190 H98 M36 250 H104"/>'+
      '<path d="M70 40 L110 300 M90 40 L130 300" transform="translate(0 0)"/>'+
      '</g>'+
      '<path d="M100 168 C 220 150, 360 150, 560 188" fill="none" stroke="#d9d0c4" stroke-width="2.2"/>'+
      '<path d="M100 196 C 230 178, 370 178, 560 214" fill="none" stroke="#b7aea3" stroke-width="1.4" opacity="0.7"/>'+
      '<g transform="translate(372 146)"><rect x="-16" y="0" width="10" height="28" rx="2" fill="#EAE2FC"/><rect x="8" y="6" width="10" height="28" rx="2" fill="#c4b6f0"/><path d="M-6 8 H14" stroke="#EAE2FC" stroke-width="2"/></g>'+
      '<rect x="348" y="132" width="52" height="58" fill="none" stroke="#EAE2FC" stroke-width="2"/>'+
      '<rect x="348" y="112" width="118" height="18" fill="#EAE2FC"/><text x="354" y="125" fill="#080B11" font-size="11" font-family="inherit" font-weight="700">Damper · 0.93</text>'+
      '<text x="24" y="28" fill="#a89f92" font-size="12" font-family="inherit">Frame 184 · 220 kV · span N-18</text>'+
      '</svg>';
  }

  function imageViewer() {
    return '<div class="nxp-split"><div class="nxp-panel"><h3>AI image viewer · span N-18</h3><div class="nxp-photo">' + frameSvg() + '<div class="nxp-geo">220 kV span N-18<br>Tower T-104 side<br>GPS retained with the frame</div></div></div><div class="nxp-stack"><div class="nxp-panel"><h3>What this frame supports</h3><div class="nxp-evidence"><div class="nxp-ev"><b>Visual evidence</b><span>Damper body offset from the expected conductor position.</span></div><div class="nxp-ev"><b>Output type</b><span>Visual finding with object localization. Not yet a confirmed engineering defect.</span></div><div class="nxp-ev"><b>Confidence</b><span>0.93 on this frame. Severity waits for the reviewer.</span></div><div class="nxp-ev"><b>Reviewer</b><span>Engineering confirmation is required before the location is accepted.</span></div><div class="nxp-ev"><b>More evidence</b><span>An RGB frame cannot establish an electrical short. Clearance calls that need measurement stay on LiDAR or a calibrated method.</span></div></div></div><div class="nxp-panel"><p class="nxp-quote">“Potential displaced vibration damper detected on 220 kV span. Review image evidence and confirm asset location.”</p></div></div></div>';
  }

  function reviewQueue() {
    return kpi([
      ["Confirm", "Accept class and asset", "Engineer"],
      ["Correct", "Change class or location", "Engineer"],
      ["Reject", "Not a defect", "Engineer"],
      ["Unclassified", "Held apart", "Not a 24th class"]
    ]) + '<div class="nxp-split"><div class="nxp-panel"><h3>Human review queue</h3><div class="nxp-queue">'+
      queue("F-220-184", "Displaced vibration damper · span N-18 · confidence 0.93", "Confirm", "Correct", "Reject") +
      queue("F-098-014", "Foundation · uncertain prediction · confidence 0.61", "Confirm", "Correct", "Reject") +
      queue("U-441", "Unclassified image. Model could not produce a reliable class.", "Inspect", "Assign", "Return") +
      '</div></div><div class="nxp-panel"><h3>Queue rule</h3><p class="nxp-quote">Unclassified images and findings that need a person stay in this queue.</p><p class="nxp-note">That queue is not a 24th defect class. It holds images the 23-category model cannot reliably classify, or that still need manual inspection.</p></div></div>';
  }

  function queue(title, meta, a, b, c) {
    return '<div class="nxp-q"><div><b>' + title + "</b><span>" + meta + '</span></div><div class="nxp-actions"><i>' + a + "</i><i>" + b + "</i><i>" + c + "</i></div></div>";
  }

  function reports() {
    return '<div class="nxp-duo"><div class="nxp-panel"><h3>Asset inspection report · span N-18</h3><p class="nxp-quote">Potential displaced vibration damper. Location still requires engineer confirmation.</p>' + table(
      ["Section", "Contents"],
      [
        { cells: ["Asset", "220 kV Corridor North · span N-18 · tower T-104 side"] },
        { cells: ["Model", "23-category CV · conductor hardware"] },
        { cells: ["Evidence", "Bounding box, confidence 0.93, georeferenced frame"] },
        { cells: ["Decision", "Waiting in the human review queue"] },
        { cells: ["Related", "T-104 already has two verified structural findings"] }
      ]
    ) + '</div><div class="nxp-panel"><h3>Report rule</h3><p class="nxp-note">The report is asset-specific. It does not promote a model label into a confirmed defect until an engineer confirms, corrects, or rejects it.</p></div></div>';
  }

  function command() {
    return '<div class="nxp-groups"><div class="nxp-panel"><h3>Approved work ready to group</h3>'+
      job("1", "T-104 structural finding A", "Corridor North") +
      job("2", "T-104 structural finding B", "Same tower") +
      job("3", "Span N-18 damper, once confirmed", "Same visit") +
      job("4", "Adjacent hardware check", "Same outage") +
      job("5", "Foundation watch at T-098", "Same corridor") +
      '</div><div class="nxp-visit"><h3>One visit</h3><p>Five maintenance tasks grouped into one planned inspection-and-repair visit along Corridor North.</p></div></div>';
  }

  function job(n, title, meta) {
    return '<div class="nxp-job"><b>' + n + " · " + title + "</b><span>" + meta + "</span></div>";
  }

  function workOrders() {
    return kpi([
      ["SAP PM", "Linked", "Bi-directional"],
      ["IBM Maximo", "Linked", "Bi-directional"],
      ["From findings", "3 jobs", "Hardware requested"],
      ["Return path", "Closure", "Back to the asset"]
    ]) + '<div class="nxp-panel"><h3>Work orders</h3>' + table(
      ["Order", "Source finding", "System", "Direction", "State"],
      [
        { hot: true, cells: ["WO-441", "T-104 structural A", "SAP PM", "Out and back", tag("review", "Released")] },
        { cells: ["WO-442", "T-104 structural B", "SAP PM", "Out and back", tag("review", "Released")] },
        { cells: ["WO-450", "Damper hardware", "Maximo", "Reservation synced", tag("ok", "Stock confirmed")] }
      ]
    ) + "</div>";
  }

  function planner() {
    return kpi([
      ["Corridor", "North", "Grouping key"],
      ["Window", "One outage", "Shared"],
      ["Tasks inside", "5", "Inspection and repair"],
      ["Separate trips", "0", "For this cluster"]
    ]) + '<div class="nxp-panel"><h3>Planner · same corridor, same window</h3>' + bars([
      ["Corridor North window", 100, "5 tasks"],
      ["Corridor East window", 40, "2 tasks"],
      ["Unscheduled", 15, "Held for review"]
    ]) + "</div>";
  }

  function scheduling() {
    return '<div class="nxp-panel"><h3>Crew scheduling</h3>' + table(
      ["Crew", "Certification", "Window", "Assignment"],
      [
        { hot: true, cells: ["HV Crew A", "High-voltage authorized", "Corridor North outage", tag("ok", "Assigned")] },
        { cells: ["HV Crew C", "High-voltage authorized", "Following week", tag("muted", "Reserve")] },
        { cells: ["Survey pair", "Inspection only", "Not this repair", tag("watch", "Excluded")] }
      ]
    ) + "</div>";
  }

  function approvals() {
    return '<div class="nxp-panel"><h3>Approval path for the Corridor North visit</h3><div class="nxp-timeline">'+
      item("1", "Finding confirmed, or explicitly still awaiting confirmation for the damper.") +
      item("2", "Risk score attached: Condition × Criticality × Consequence.") +
      item("3", "Technical approval requested for the grouped visit.") +
      item("4", "Materials and crew cannot dispatch ahead of that approval.") +
      "</div></div>";
  }

  function execution() {
    return kpi([
      ["Clock start", "Confirmation", "Engineering"],
      ["Now", "Open", "Visit not closed"],
      ["End", "Field closure", "Evidence required"],
      ["Grouped tasks", "5", "One visit"]
    ]) + '<div class="nxp-panel"><h3>Turnaround</h3>' + table(
      ["Step", "T-104 structural", "Span N-18 damper"],
      [
        { cells: ["Detected", "Closed", "Closed"] },
        { cells: ["Confirmed", "Closed", "In review"] },
        { cells: ["Work released", "Yes", "Waiting on confirmation"] },
        { hot: true, cells: ["Field repair closed", "Open", "Open"] }
      ]
    ) + "</div>";
  }

  function gridOverview() {
    return kpi([
      ["SCADA", "Approved feed", "Connected"],
      ["EMS", "Approved feed", "Connected"],
      ["Historian", "Approved feed", "Connected"],
      ["From images", "Not used", "For electrical state"]
    ]) + '<div class="nxp-panel"><h3>Operational systems on the 220 kV corridor</h3><p class="nxp-note">These connections are the only source for loading, voltage, current, and trips. The inspection model contributes confirmed physical defects, which this module then places beside the operating record.</p></div>';
  }

  function linePerformance() {
    return kpi([
      ["Loading", "Elevated", "Recent thermal window"],
      ["Voltage", "Inside band", "220 kV"],
      ["Current", "Historian", "Same corridor"],
      ["Trips", "On record", "Separate from the photo"]
    ]) + '<div class="nxp-panel"><h3>Line performance · Corridor North</h3>' + chart([[40, "Mon"], [48, "Tue"], [62, "Wed"], [80, "Thu"], [74, "Fri"], [55, "Sat"], [46, "Sun"]]) + '<p class="nxp-note">Thursday’s thermal loading sits on the same corridor as the high-priority physical findings.</p></div>';
  }

  function outages() {
    return '<div class="nxp-panel"><h3>Outage analytics</h3>' + table(
      ["Event", "Frequency", "Duration", "Constraint", "Linked assets"],
      [
        { cells: ["Corridor North, prior year", "2", "Short", "Thermal", "Same 220 kV section"] },
        { hot: true, cells: ["Recent thermal window", "1", "Observed", "Loading", tag("review", "Findings open")] },
        { cells: ["Adjacent section", "1", "Longer", "Clearance work", "Not T-104"] }
      ]
    ) + "</div>";
  }

  function losses() {
    return kpi([
      ["Calculated from", "Network data", "Not from RGB"],
      ["Imagery", "Excluded", "Cannot price loss"],
      ["Loading risk", "SCADA", "Live state"],
      ["Use", "Context", "Beside verified defects"]
    ]) + '<div class="nxp-panel"><h3>Loss analysis boundary</h3><p class="nxp-quote">Computer-vision imagery alone cannot calculate electrical losses or live line-loading risk.</p><p class="nxp-note">Those figures require grid and network data. This screen stays dark on loss until that feed is approved, then shows it next to the confirmed defects.</p></div>';
  }

  function events() {
    return '<div class="nxp-split"><div class="nxp-panel"><h3>Grid events</h3>' + table(
      ["When", "Event", "Corridor", "Physical findings in view"],
      [
        { hot: true, cells: ["Recent", "Thermal loading", "220 kV North", "T-104 structural · span N-18 damper"] },
        { cells: ["Prior", "Trip on record", "220 kV North", "Shown as context only"] },
        { cells: ["Weather window", "Exposure noted", "Coastal segment", "Forecast input, not a defect"] }
      ]
    ) + '</div><div class="nxp-panel"><h3>Operational output</h3><p class="nxp-quote">“High-priority findings on 220 kV corridor correlated with recent thermal loading operational events.”</p></div></div>';
  }

  function trends() {
    return '<div class="nxp-panel"><h3>Reliability trends · condition against operating history</h3>' + chart([[30, "Q1"], [34, "Q2"], [36, "Q3"], [48, "Q4"], [52, "Q5"], [61, "Now"]]) + '<p class="nxp-note">The rising series is verified finding pressure on the corridor. It is read next to loading and outage history, not instead of them.</p></div>';
  }

  function catalog() {
    return '<div class="nxp-panel"><h3>Defect class to approved part</h3>' + table(
      ["Defect category", "Approved catalog item", "Fits", "Used on"],
      [
        { hot: true, cells: ["Displaced vibration damper", "Damper assembly, approved family", "This conductor", "Span N-18"] },
        { cells: ["Tower steel finding", "Steel repair kit, approved", "Lattice family", "T-104"] },
        { cells: ["Foundation watch", "No part until confirmed", "—", "T-098"] }
      ]
    ) + "</div>";
  }

  function inventory() {
    return kpi([
      ["Jobs asking", "3", "Approved repairs"],
      ["Damper hardware", "In warehouse", "Confirmed"],
      ["Steel kit", "In warehouse", "Confirmed"],
      ["Dispatch block", "None", "For these three"]
    ]) + '<div class="nxp-panel"><h3>Warehouse against the plan</h3><p class="nxp-quote">“Replacement hardware requested for three approved repair jobs; warehouse availability confirmed.”</p>' + bars([
      ["Damper assemblies", 80, "Available"],
      ["Steel repair kits", 70, "Available"],
      ["Unrelated stock", 40, "Not this visit"]
    ]) + "</div>";
  }

  function materials() {
    return '<div class="nxp-panel"><h3>Material requests</h3>' + table(
      ["Request", "Job", "Action", "Stock"],
      [
        { hot: true, cells: ["MR-19", "WO-441 steel", "Reservation", tag("ok", "Confirmed")] },
        { hot: true, cells: ["MR-20", "WO-442 steel", "Reservation", tag("ok", "Confirmed")] },
        { hot: true, cells: ["MR-21", "Damper job", "Reservation", tag("ok", "Confirmed")] }
      ]
    ) + "</div>";
  }

  function suppliers() {
    return '<div class="nxp-panel"><h3>Supplier lead times</h3>' + table(
      ["Supplier", "Hardware", "Lead time", "Risk to this visit"],
      [
        { cells: ["Approved damper vendor", "Damper assembly", "On hand", tag("ok", "No wait")] },
        { cells: ["Steel kit vendor", "Repair kit", "On hand", tag("ok", "No wait")] },
        { cells: ["Secondary vendor", "Same family", "6 weeks", tag("watch", "Not needed now")] }
      ]
    ) + "</div>";
  }

  function procurement() {
    return kpi([
      ["Purchase requests", "0 open", "These three jobs"],
      ["Reason", "Stock confirmed", "No buy yet"],
      ["Trigger", "Shortage", "Would raise a PR"],
      ["Tied to", "BOM", "Approved catalog"]
    ]) + '<div class="nxp-panel"><p class="nxp-note">A purchase request is created only when the reservation cannot be filled from the warehouse. For the three approved Corridor North jobs, procurement stays closed because availability is already confirmed.</p></div>';
  }

  function stock() {
    return '<div class="nxp-panel"><h3>Stock forecast before dispatch</h3>' + chart([[70, "Now"], [64, "Visit"], [58, "Next"], [52, "+2"], [49, "+3"]]) + '<p class="nxp-note">On-hand damper and steel stock covers the grouped visit. The forecast flags the later dip so a shortage is visible before a future dispatch, not after the crew is already assigned.</p></div>';
  }

  function riskForecast() {
    return '<div class="nxp-panel"><h3>Defect recurrence</h3>' + bars([
      ["Tower steel · inland", 46, "Repeat pattern"],
      ["Damper hardware · exposed spans", 62, "Higher recurrence"],
      ["Foundations · wet zones", 28, "Slower"],
      ["Insulators · this corridor", 22, "Watched"]
    ]) + '<p class="nxp-note">Recurrence is counted from repeated inspections of the same structures and environments.</p></div>';
  }

  function inspectionPlan() {
    return kpi([
      ["Basis", "Risk", "Not the calendar"],
      ["Next quarter", "Review load", "Forecast"],
      ["Manual review", "The queue", "Engineering"],
      ["T-104", "Already due", "This cycle"]
    ]) + '<div class="nxp-split"><div class="nxp-panel"><h3>Inspections that will need an engineer</h3>' + chart([[40, "This"], [55, "Next"], [72, "+1"], [64, "+2"]]) + '</div><div class="nxp-panel"><h3>Operational output</h3><p class="nxp-quote">“Forecast the number of inspections requiring manual engineering review next quarter.”</p><p class="nxp-note">Frequency moves when risk indicators move. A quiet span is not reflown only because the calendar says so.</p></div></div>';
  }

  function demand() {
    return '<div class="nxp-panel"><h3>Maintenance demand by zone</h3>' + table(
      ["Zone", "Open verified work", "Crew demand", "Driver"],
      [
        { hot: true, cells: ["Corridor North", "Grouped visit of 5", "One HV crew", "T-104 and span N-18"] },
        { cells: ["Coastal", "Rising damper pattern", "Inspection heavy", "Environment"] },
        { cells: ["Inland east", "Low", "Monitor", "Age only"] }
      ]
    ) + "</div>";
  }

  function deterioration() {
    return kpi([
      ["Age", "On the asset", "Registry"],
      ["Weather", "Exposure", "With the history"],
      ["Observations", "Repeated", "Required"],
      ["Model", "Longitudinal", "Not a single photo"]
    ]) + '<div class="nxp-panel"><h3>Deterioration · T-104 and exposed damper spans</h3>' + chart([[20, "Age"], [28, "+Wx"], [36, "C4"], [44, "C5"], [58, "C6"]]) + '<p class="nxp-note">The series combines age, weather exposure, and the condition recorded on successive inspections.</p></div>';
  }

  function scenarios() {
    return '<div class="nxp-compare"><div class="nxp-panel"><h3>Hold the calendar</h3><p class="nxp-money">Queue grows</p><p class="nxp-note">Same inspection interval. More of next quarter’s flights arrive with findings that still need an engineer.</p></div><div class="nxp-panel"><h3>Follow the risk indicators</h3><p class="nxp-money">Queue moves earlier</p><p class="nxp-note">Corridor North and exposed damper spans are brought forward. Quiet segments wait. Manual review is spent where the findings already are.</p></div></div>';
  }

  function costDash() {
    return kpi([
      ["Labor", "HV crew", "One visit"],
      ["Equipment", "Access", "Shared window"],
      ["Material", "3 jobs", "Warehouse confirmed"],
      ["Plan", "Grouped", "Not five mobilizations"]
    ]) + '<div class="nxp-panel"><h3>Cost of the proposed Corridor North plan</h3>' + bars([
      ["Labor", 46, "Largest share"],
      ["Materials", 34, "Reserved"],
      ["Equipment", 20, "One mobilization"]
    ]) + "</div>";
  }

  function budget() {
    return '<div class="nxp-compare"><div class="nxp-panel"><h3>Approved maintenance budget</h3><p class="nxp-money">In plan</p><p class="nxp-note">The annual maintenance budget already approved for this region.</p></div><div class="nxp-panel"><h3>Remaining repair backlog</h3><p class="nxp-money">Estimated</p><p class="nxp-note">Labor, equipment, and material for approved repairs that are still open, including the Corridor North visit.</p></div></div><div class="nxp-panel" style="margin-top:0.75rem"><p class="nxp-quote">“Compare approved maintenance budgets with the estimated cost of the remaining repair backlog.”</p></div>';
  }

  function costAsset() {
    return '<div class="nxp-panel"><h3>Spend by corridor</h3>' + bars([
      ["Corridor North", 68, "Open structural work"],
      ["Corridor East", 24, "Routine"],
      ["Coastal", 41, "Damper pattern"],
      ["Rest of region", 18, "Lower"]
    ]) + "</div>";
  }

  function repairReplace() {
    return '<div class="nxp-compare"><div class="nxp-panel"><h3>Repair</h3><p class="nxp-note">Close the two verified structural findings and the damper inside the grouped visit. Condition history still supports a repair if the consequence stays inside the maintenance plan.</p></div><div class="nxp-panel"><h3>Replace</h3><p class="nxp-note">Held as a life-cycle scenario if a later inspection shows the tower’s condition and consequence no longer fit repeated repair. The photo alone does not make that decision.</p></div></div>';
  }

  function capital() {
    return '<div class="nxp-panel"><h3>Capital planning</h3>' + table(
      ["Candidate", "Why it is, or is not, capital", "This year"],
      [
        { cells: ["T-104", "Still a maintenance repair: two verified findings, one visit", tag("ok", "Maintenance")] },
        { cells: ["Aged coastal run", "Recurrence plus age, reviewed for replacement program", tag("watch", "Program")] },
        { cells: ["T-098 foundation", "Not enough confirmed evidence", tag("muted", "Wait")] }
      ]
    ) + "</div>";
  }

  function workforce() {
    return kpi([
      ["HV certified", "Crew A", "Authorized"],
      ["Inspection only", "Survey pair", "Cannot take the repair"],
      ["Open visit", "Corridor North", "Needs HV"],
      ["Blocker", "None", "Certification matches"]
    ]) + '<div class="nxp-panel"><h3>Workforce</h3>' + table(
      ["Person", "Qualification", "High-voltage", "Available"],
      [
        { hot: true, cells: ["Crew A lead", "Line repair", tag("ok", "Certified"), "Window"] },
        { cells: ["Crew A tech", "Line repair", tag("ok", "Certified"), "Window"] },
        { cells: ["Survey pair", "Inspection", tag("muted", "Not HV repair"), "Other task"] }
      ]
    ) + "</div>";
  }

  function crew() {
    return '<div class="nxp-panel"><h3>Crew assignment</h3><p class="nxp-quote">Qualified high-voltage crew assigned to the Corridor North repair.</p>' + table(
      ["Visit", "Crew", "Why this crew", "State"],
      [
        { hot: true, cells: ["Five-task corridor visit", "HV Crew A", "Certification covers the 220 kV work", tag("ok", "Assigned")] }
      ]
    ) + "</div>";
  }

  function safety() {
    return '<div class="nxp-panel"><h3>Safety record for the visit</h3>' + table(
      ["Type", "Record", "Where"],
      [
        { cells: ["Hazard", "Live 220 kV work", "Span N-18 / T-104"] },
        { cells: ["Right-of-way", "Encroachment check included", "Corridor North"] },
        { cells: ["Observation", "No open incident on this job", "Visit file"] },
        { cells: ["Vegetation", "Clearance noted for the crew brief", "Same spans"] }
      ]
    ) + "</div>";
  }

  function permits() {
    return '<div class="nxp-panel"><h3>Permit to work</h3><div class="nxp-timeline">'+
      item("Authorization", "Work authorization approved.") +
      item("Clearance", "Safety clearance recorded.") +
      item("Permit", "Permit-to-work prerequisites cleared.") +
      item("Hold", "Nothing in the chain is still blocking dispatch.") +
      "</div></div>";
  }

  function mobile() {
    return '<div class="nxp-duo"><div class="nxp-phone"><div class="shot">' + frameSvg() + '</div><div class="nxp-steps"><div>Before: AI frame of the displaced damper</div><div>After: crew photograph on the same component</div><div>Both images stay on the work order and the asset</div></div></div><div class="nxp-panel"><h3>Field evidence</h3><p class="nxp-note">The mobile record does not replace the engineering review. It proves what the crew found and what they left, against the finding the model originally proposed.</p></div></div>';
  }

  function compliance() {
    return kpi([
      ["Authorization", "Approved", "On the task"],
      ["Crew", "HV Crew A", "Qualified"],
      ["Permits", "Cleared", "Before dispatch"],
      ["Audit", "Intact", "Finding to closure"]
    ]) + '<div class="nxp-panel"><p class="nxp-quote">“Repair task verified: work authorization approved, qualified high-voltage crew assigned, permits cleared.”</p><p class="nxp-note">The record for this task holds the authorization, the qualified crew, the cleared permits, and the safety observations.</p></div>';
  }

  var overlay;
  var activeModule = 0;
  var current = 0;

  function screenList(mi) {
    return MODULES[mi].screens.map(function (screen, si) {
      return '<button type="button" class="nxp-screen-btn" data-si="' + si + '">' + screen.title + "</button>";
    }).join("");
  }

  function shell() {
    overlay = document.createElement("div");
    overlay.className = "nxp";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Application screens");
    overlay.innerHTML =
      '<div class="nxp-top"><div class="nxp-brand"><div class="nxp-mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1.5 16 15H2L9 1.5Z" stroke="#080B11" stroke-width="1.4"/><path d="M9 6.5v5" stroke="#080B11" stroke-width="1.4"/></svg></div><div><h1 id="nxp-title"></h1><p id="nxp-sub"></p></div></div>' +
      '<button type="button" class="nxp-close">Close</button></div>' +
      '<div class="nxp-body"><nav class="nxp-nav" id="nxp-nav" aria-label="Screens in this application"></nav><div class="nxp-stage" id="nxp-stage"></div></div>';
    document.body.appendChild(overlay);

    overlay.querySelector(".nxp-close").addEventListener("click", close);
    overlay.addEventListener("click", function (event) {
      var screenBtn = event.target.closest(".nxp-screen-btn");
      if (!screenBtn) return;
      show(Number(screenBtn.getAttribute("data-si")));
    });
  }

  function show(si) {
    var mod = MODULES[activeModule];
    var total = mod.screens.length;
    current = (si + total) % total;
    var screen = mod.screens[current];
    var stage = overlay.querySelector("#nxp-stage");
    stage.innerHTML =
      '<div class="nxp-stage-head"><div><div class="nxp-kicker">' + mod.num + " · " + mod.title + "</div><h2>" + screen.title + "</h2><p class=\"nxp-lead\">" + screen.lead + "</p></div>" +
      '<div class="nxp-pager"><button type="button" id="nxp-prev" aria-label="Previous screen">←</button><button type="button" id="nxp-next" aria-label="Next screen">→</button></div></div>' +
      '<div class="nxp-ai"><div><strong>AI coverage</strong><p>' + screen.ai + "</p></div></div>" +
      screen.html();

    overlay.querySelectorAll(".nxp-screen-btn").forEach(function (btn) {
      var on = Number(btn.getAttribute("data-si")) === current;
      btn.classList.toggle("is-active", on);
      if (on) btn.scrollIntoView({ block: "nearest" });
    });
    stage.scrollTop = 0;
    overlay.querySelector("#nxp-prev").addEventListener("click", function () { show(current - 1); });
    overlay.querySelector("#nxp-next").addEventListener("click", function () { show(current + 1); });
  }

  function open(mi) {
    if (!overlay) shell();
    activeModule = mi;
    var mod = MODULES[mi];
    overlay.querySelector("#nxp-title").textContent = mod.title;
    overlay.querySelector("#nxp-sub").textContent = "Application " + mod.num;
    overlay.querySelector("#nxp-nav").innerHTML = screenList(mi);
    overlay.setAttribute("aria-label", mod.title);
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
    show(0);
    overlay.querySelector(".nxp-close").focus();
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  document.addEventListener("keydown", function (event) {
    if (!overlay || !overlay.classList.contains("is-open")) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowRight") show(current + 1);
    if (event.key === "ArrowLeft") show(current - 1);
  });

  function mount() {
    var cards = document.querySelectorAll("#platform-environments .layout353_content-item.module-card");
    cards.forEach(function (card, index) {
      if (card.querySelector(".nxp-view-btn") || index > 7) return;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "nxp-view-btn";
      button.innerHTML = '<span>View the project</span><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var title = card.querySelector(".module-card_title");
      var isInspection = title && title.textContent.replace(/\s+/g, " ").trim() === "AI Inspection & Quality";
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        function continueTo(url) {
          window.location.assign("/login/?next=" + encodeURIComponent(url));
        }
        if (isInspection) {
          continueTo("/dashboard");
          return;
        }
        var routeName = title ? title.textContent.replace(/\s+/g, " ").trim() : "";
        var routes = {
          "Asset Reliability Intelligence": "/reliability/index.html",
          "Field Operations Optimization": "/operations/index.html",
          "Energy & Grid Performance": "/grid/index.html",
          "Supply Chain & Inventory": "/inventory/index.html",
          "Risk & Maintenance Forecasting": "/forecast/index.html",
          "Financial Intelligence": "/finance/index.html",
          "Workforce & Safety": "/workforce/index.html"
        };
        if (routes[routeName]) {
          continueTo(routes[routeName]);
          return;
        }
        open(index);
      });
      var io = card.querySelector(".module-io_box");
      if (io) {
        var row = document.createElement("div");
        row.className = "nxp-io-side";
        io.parentNode.insertBefore(row, io);
        row.appendChild(io);
        row.appendChild(button);
      } else {
        card.appendChild(button);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
