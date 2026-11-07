#!/usr/bin/env python3
"""Regenerate seven Corridor North drawings from the saved sheet geometry."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIDS = ROOT / "pids"
SLD = (PIDS / "SSN-E-SLD-0001-substation-north.svg").read_text()
PFD = (PIDS / "UTL-P-PFD-1001-steam-plant.svg").read_text()


def text(svg, old, new):
    needle = ">" + old + "<"
    count = svg.count(needle)
    if count == 0:
        raise SystemExit("missing text: " + old)
    return svg.replace(needle, ">" + new + "<")


def text_each(svg, old, values):
    needle = ">" + old + "<"
    if svg.count(needle) < len(values):
        raise SystemExit("not enough %r (%s)" % (old, svg.count(needle)))
    for value in values:
        svg = svg.replace(needle, ">" + value + "<", 1)
    return svg


def set_live(svg, key, value, state=None):
    pat = re.compile(r'(data-live="' + re.escape(key) + r'")([^>]*)(>)([^<]*)')

    def repl(match):
        attrs = match.group(2)
        if state:
            attrs = re.sub(r'data-state="[^"]*"', 'data-state="%s"' % state, attrs)
        return match.group(1) + attrs + match.group(3) + value

    svg, count = pat.subn(repl, svg, count=1)
    if count != 1:
        raise SystemExit("missing live " + key)
    return svg


def add_tip(svg, element_id, tip):
    safe = (
        tip.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
    )
    needle = 'id="%s"' % element_id
    if needle not in svg:
        raise SystemExit("missing id " + element_id)
    return svg.replace(needle, needle + ' data-tip="%s"' % safe, 1)


def finish(svg, tips):
    if "pl-hit" in svg:
        svg = sweep_units(svg)
    svg = svg.replace('preserveAspectRatio="xMinYMin meet"', 'preserveAspectRatio="xMidYMid meet"', 1)
    svg = svg.replace("var(--k-font)", "'DM Sans', sans-serif")
    svg = svg.replace("var(--k-mono)", "ui-monospace, monospace")
    svg = re.sub(r"<title>.*?</title>", "", svg)
    svg = re.sub(r"<script\b[^>]*>.*?</script>", "", svg, flags=re.I | re.S)
    for element_id, tip in tips.items():
        svg = add_tip(svg, element_id, tip)
    return svg


def sld_common(svg, drawing, subtitle, org):
    svg = text(svg, "HELIX", "NEXUS OS")
    svg = text(svg, "HLX", "NXS")
    svg = text(svg, "ASSET RELIABILITY · ILLUSTRATIVE DRAWING", org)
    svg = text(svg, "SUBSTATION NORTH · 400/132 kV · Northern transmission area", "SS-NORTH · 220 kV · Corridor North")
    svg = text(svg, "SUBSTATION NORTH", "SS-NORTH")
    svg = text(svg, "400/132 kV SWITCHYARD · SINGLE-LINE DIAGRAM", subtitle)
    svg = text(svg, "SSN-E-SLD-0001", drawing)
    svg = text(svg, "400 kV BUSBAR", "220 kV BUS")
    svg = text(svg, "BB-400 · 4000 A", "BB-220 · SS-North")
    svg = text(svg, "132 kV BUSBAR", "110 kV BUS")
    svg = text(svg, "BB-132 · 3150 A", "BB-110 · yard")
    svg = text(svg, "240 MVA · YNyn0", "220 kV bank")
    svg = text(svg, "400/132 kV", "220/110 kV")
    svg = text(svg, "T1 MONITOR", "TR-1 YARD")
    svg = text(svg, "T2 MONITOR", "TR-2 YARD")
    svg = text(svg, "T1", "TR-1")
    svg = text(svg, "T2", "TR-2")
    svg = text(svg, "LIVE DATA BLOCK (SIMULATED)", "CORRIDOR RECORD")
    svg = text(svg, "3.  DATA BLOCKS SHOW SIMULATED READINGS.", "3.  DATA BLOCKS ARE THE CORRIDOR RECORD.")
    return svg


def reliability():
    svg = sld_common(
        SLD,
        "NX-ARI-SLD-0104",
        "CORRIDOR NORTH · STRUCTURAL REVIEW",
        "ASSET RELIABILITY · ILLUSTRATIVE DRAWING",
    )
    svg = text(svg, "NORTH–WEST", "SPAN N-18")
    svg = text(svg, "400 kV OHL · L-401", "DAMPER · VISUAL")
    svg = text(svg, "NORTH–SOUTH", "SPAN N-19")
    svg = text(svg, "400 kV OHL · L-402", "ROW · VEG-02")
    svg = text(svg, "LINE L-131", "TOWER T-101")
    svg = text(svg, "L-131", "T-101")
    svg = text(svg, "LINE L-132", "TOWER T-103")
    svg = text(svg, "L-132", "T-103")
    svg = text(svg, "LINE L-133", "TOWER T-104")
    svg = text(svg, "L-133", "T-104")
    svg = text(svg, "LINE L-134", "TOWER T-110")
    svg = text(svg, "L-134", "T-110")
    svg = text(svg, "Q0-L133 · L-133", "T-104 · review")
    svg = svg.replace('x="1253" y="725">P<', 'x="1253" y="725">INDEX<')
    svg = svg.replace('x="1253" y="738">I<', 'x="1253" y="738">FINDS<')
    svg = svg.replace('x="1253" y="751">T OPEN<', 'x="1253" y="751">DAYS<')
    svg = set_live(svg, "SSN.L-133.MW", "61", "threshold")
    svg = set_live(svg, "SSN.L-133.CURRENT", "2", "threshold")
    svg = set_live(svg, "SSN.Q0-L133.OP_TIME", "18 d", "threshold")
    svg = text(svg, "P", "STAT")
    svg = text(svg, "I", "NOTE")
    svg = text(svg, "T OPEN", "STATE")
    svg = text(svg, "L-401", "N-18")
    svg = text(svg, "Q0-L401", "Q0-N18")
    svg = text(svg, "L-402", "N-19")
    svg = text(svg, "Q0-L402", "Q0-N19")
    svg = text(svg, "Q0-L131 · L-131", "T-101 · 88")
    svg = text(svg, "Q0-L132 · L-132", "T-103 · 74")
    svg = text(svg, "Q0-L134 · L-134", "T-110 · 91")
    svg = text(svg, "Q0-T1-HV", "Q0-TR1-HV")
    svg = text(svg, "Q0-T1-LV", "Q0-TR1-LV")
    svg = text(svg, "Q0-T2-HV", "Q0-TR2-HV")
    svg = text(svg, "Q0-T2-LV", "Q0-TR2-LV")
    for key, value, state in [
        ("SSN.L-401.MW", "visual", "threshold"), ("SSN.L-401.CURRENT", "0.93", "threshold"),
        ("SSN.Q0-L401.OP_TIME", "4 frm", "threshold"), ("SSN.Q0-L401.SF6_DENSITY", "hold", "threshold"),
        ("SSN.L-402.MW", "row", "normal"), ("SSN.L-402.CURRENT", "VEG", "normal"),
        ("SSN.Q0-L402.OP_TIME", "go", "normal"), ("SSN.Q0-L402.SF6_DENSITY", "N-19", "normal"),
        ("SSN.L-131.MW", "88", "normal"), ("SSN.L-131.CURRENT", "stable", "normal"), ("SSN.Q0-L131.OP_TIME", "—", "normal"),
        ("SSN.L-132.MW", "74", "normal"), ("SSN.L-132.CURRENT", "watch", "normal"), ("SSN.Q0-L132.OP_TIME", "—", "normal"),
        ("SSN.L-134.MW", "91", "normal"), ("SSN.L-134.CURRENT", "stable", "normal"), ("SSN.Q0-L134.OP_TIME", "out", "normal"),
    ]:
        svg = set_live(svg, key, value, state)
    tips = {
        "L-401": "Span N-18 — Displaced vibration damper is visual. 4 frames, score 0.93. Location needs an engineer. Not one of T-104's two structural findings.",
        "L-402": "Span N-19 — ROW vegetation. Released to VEG-02. VEG-02 must not take T-104.",
        "L-131": "T-101 — Index 88. Stable. No verified finding.",
        "L-132": "T-103 — Index 74. Foundation watch. Not a verified defect.",
        "L-133": "T-104 — Index 61. Two verified structural findings: leg B steel and cotter pin. 18 days past the review threshold.",
        "L-134": "T-110 — Index 91. Stable. Outside this package.",
        "T1": "TR-1 — SS-North transformer bay. Illustrative single line for Corridor North.",
        "T2": "TR-2 — SS-North transformer bay. Illustrative single line for Corridor North.",
        "BB-400": "220 kV bus — SS-North. Corridor North.",
        "BB-132": "110 kV bus — Yard side of SS-North.",
    }
    return finish(svg, bay_tips(tips))


def grid():
    svg = sld_common(
        SLD,
        "NX-GRD-SLD-0220",
        "CORRIDOR NORTH · OPERATING RECORD",
        "ENERGY AND GRID · ILLUSTRATIVE DRAWING",
    )
    svg = text(svg, "NORTH–WEST", "SS-NORTH")
    svg = text(svg, "400 kV OHL · L-401", "219.4 kV · EMS")
    svg = text(svg, "NORTH–SOUTH", "12 MARCH")
    svg = text(svg, "400 kV OHL · L-402", "92% · 46 MIN")
    svg = text(svg, "LINE L-131", "19 JANUARY")
    svg = text(svg, "L-131", "22 MIN")
    svg = text(svg, "LINE L-132", "02 FEBRUARY")
    svg = text(svg, "L-132", "38 MIN")
    svg = text(svg, "LINE L-133", "CORRIDOR")
    svg = text(svg, "L-133", "78% LOAD")
    svg = text(svg, "LINE L-134", "STILL IN")
    svg = text(svg, "L-134", "SERVICE")
    svg = text(svg, "Q0-L133 · L-133", "220 kV · load")
    svg = svg.replace('x="1253" y="725">P<', 'x="1253" y="725">LOAD<')
    svg = svg.replace('x="1253" y="738">I<', 'x="1253" y="738">kV<')
    svg = svg.replace('x="1253" y="751">T OPEN<', 'x="1253" y="751">STATE<')
    svg = set_live(svg, "SSN.L-133.MW", "78%", "normal")
    svg = set_live(svg, "SSN.L-133.CURRENT", "219.4", "normal")
    svg = set_live(svg, "SSN.Q0-L133.OP_TIME", "in svc", "normal")
    svg = text(svg, "P", "LOAD")
    svg = text(svg, "I", "NOTE")
    svg = text(svg, "T OPEN", "STATE")
    svg = text(svg, "L-401", "220 kV")
    svg = text(svg, "Q0-L401", "Q0-220")
    svg = text(svg, "L-402", "12 MAR")
    svg = text(svg, "Q0-L402", "Q0-MAR")
    svg = text(svg, "Q0-L131 · L-131", "19 JAN")
    svg = text(svg, "Q0-L132 · L-132", "02 FEB")
    svg = text(svg, "Q0-L134 · L-134", "IN SVC")
    svg = text(svg, "Q0-T1-HV", "Q0-TR1-HV")
    svg = text(svg, "Q0-T1-LV", "Q0-TR1-LV")
    svg = text(svg, "Q0-T2-HV", "Q0-TR2-HV")
    svg = text(svg, "Q0-T2-LV", "Q0-TR2-LV")
    for key, value, state in [
        ("SSN.L-401.MW", "219.4", "normal"), ("SSN.L-401.CURRENT", "EMS", "normal"),
        ("SSN.Q0-L401.OP_TIME", "bus", "normal"), ("SSN.Q0-L401.SF6_DENSITY", "kV", "normal"),
        ("SSN.L-402.MW", "92%", "threshold"), ("SSN.L-402.CURRENT", "46 m", "threshold"),
        ("SSN.Q0-L402.OP_TIME", "in", "normal"), ("SSN.Q0-L402.SF6_DENSITY", "thermal", "threshold"),
        ("SSN.L-131.MW", "22 m", "normal"), ("SSN.L-131.CURRENT", "19 Jan", "normal"), ("SSN.Q0-L131.OP_TIME", "out", "normal"),
        ("SSN.L-132.MW", "38 m", "normal"), ("SSN.L-132.CURRENT", "02 Feb", "normal"), ("SSN.Q0-L132.OP_TIME", "out", "normal"),
        ("SSN.L-134.MW", "in", "normal"), ("SSN.L-134.CURRENT", "svc", "normal"), ("SSN.Q0-L134.OP_TIME", "line", "normal"),
    ]:
        svg = set_live(svg, key, value, state)
    tips = {
        "L-401": "SS-North — Voltage 219.4 kV from the EMS. Not derived from inspection images.",
        "L-402": "12 March — Thermal window reached 92% of rating for 46 min. The line stayed in service.",
        "L-131": "19 January — Outage, 22 minutes. Not attributed to T-104.",
        "L-132": "02 February — Outage, 38 minutes. Not attributed to T-104.",
        "L-133": "Corridor loading — 78% of rating from the historian. Voltage 219.4 kV at SS-North.",
        "L-134": "In service — The 12 March thermal window did not take the line out.",
        "T1": "TR-1 — SS-North bank. Operating record is from the historian and EMS.",
        "T2": "TR-2 — SS-North bank. Operating record is from the historian and EMS.",
        "BB-400": "220 kV bus — SS-North. 219.4 kV.",
        "BB-132": "110 kV bus — Yard side of SS-North.",
    }
    return finish(svg, bay_tips(tips))


def bay_tips(tips):
    extra = {}
    for key, tip in tips.items():
        if key.startswith("L-"):
            extra["BAY-" + key] = tip
            extra["Q0-" + key.replace("-", "")] = tip
        if key in ("T1", "T2"):
            extra["BAY-" + key] = tip
            extra["Q0-" + key + "-HV"] = tip
            extra["Q0-" + key + "-LV"] = tip
    tips.update(extra)
    return tips


def pfd_common(svg, drawing, place, flow, org):
    svg = text(svg, "HELIX", "NEXUS OS")
    svg = text(svg, "HLX", "NXS")
    svg = text(svg, "ASSET RELIABILITY · ILLUSTRATIVE DRAWING", org)
    svg = text(svg, "BOILER HOUSE", place)
    svg = text(svg, "UTL-P-PFD-1001", drawing)
    svg = text(svg, "STEAM PLANT · STM-HSE", flow)
    svg = text(svg, "FEEDWATER TO STEAM", flow)
    svg = text(svg, "DEMINERALISED WATER, BOILERS AND STEAM HEADER · PROCESS FLOW", flow + " · PROCESS FLOW")
    svg = text(svg, "BOILER HOUSE AND AIR PLANT · Steam, compressed air and cooling", "CORRIDOR NORTH · 220 kV")
    svg = text(svg, "2.  DATA BLOCKS SHOW SIMULATED READINGS.", "2.  FIGURES ARE THE CORRIDOR RECORD.")
    svg = text(svg, "MACHINE, WITH ITS LIVE READINGS", "EQUIPMENT, WITH ITS RECORD")
    svg = text(svg, "READOUT CARD (SIMULATED DATA)", "READOUT CARD")
    return svg


def sweep_units(svg):
    def repl(match):
        if re.search(r"bar|psi|°C|t/h|mm/s|kW|µS", match.group(1)):
            return ">—<"
        return match.group(0)

    return re.sub(r">([^<]*)<", repl, svg)


def retitle_machines(svg, names, tags, feeds, motors):
    for old, new in names.items():
        svg = text(svg, old, new)
    for old, new in tags.items():
        svg = text(svg, old, new)
    svg = text_each(svg, "Feed pu…", feeds)
    svg = text_each(svg, "Pump mo…", motors)
    return svg


def operations():
    svg = pfd_common(PFD, "NX-OPS-PFD-0104", "CORRIDOR NORTH", "FIVE TASKS, ONE VISIT", "FIELD OPERATIONS · ILLUSTRATIVE DRAWING")
    svg = retitle_machines(
        svg,
        {
            "Demin filter A": "Steel plate",
            "Demin filter B": "Cotter pin",
            "Boiler 1": "Damper",
            "Boiler 2": "T-103",
            "Boiler 3": "ROW N-19",
            "Boiler 4": "Visit pack",
            "Steam header": "One visit",
        },
        {"DM-A": "104A", "DM-B": "104B", "BLR-1": "18-D", "BLR-2": "T103", "BLR-3": "19-V", "BLR-4": "PACK", "SH-1": "11 D"},
        ["6 h", "2 h", "3 h", "4 h"],
        ["Open", "Open", "Hold", "Crew"],
    )
    for old, new in {
        "DP": "HRS", "COND": "GATE", "STM P": "HRS", "STM FLOW": "GATE", "T FLUE": "NOTE",
        "DRUM": "PACK", "O2": "SRC", "DISCH P": "ROLE", "T BRG": "CERT", "VIB": "DAY",
        "P": "ROLE", "T WIND": "DAY", "PRESS": "DAYS", "TEMP": "START",
    }.items():
        svg = text(svg, old, new)
    lives = {
        "PDT-9401": ("6 h", "normal"), "AT-9411": ("open", "normal"),
        "PDT-9402": ("2 h", "normal"), "AT-9412": ("open", "normal"),
        "PT-9111": ("3 h", "threshold"), "FT-9112": ("hold", "threshold"),
        "TT-9113": ("visual", "threshold"), "LT-9114": ("0.93", "threshold"), "AT-9115": ("4 frm", "threshold"),
        "PT-9121": ("2 h", "normal"), "FT-9122": ("watch", "normal"), "TT-9123": ("base", "normal"),
        "LT-9124": ("no def", "normal"), "AT-9125": ("check", "normal"),
        "PT-9131": ("4 h", "normal"), "FT-9132": ("VEG-02", "normal"), "TT-9133": ("N-19", "normal"),
        "LT-9134": ("go", "normal"), "AT-9135": ("row", "normal"),
        "PT-9141": ("17 h", "normal"), "FT-9142": ("5 task", "normal"), "TT-9143": ("staged", "normal"),
        "LT-9144": ("11 d", "threshold"), "AT-9145": ("no go", "threshold"),
        "PT-9501": ("11 d", "threshold"), "TT-9502": ("no img", "threshold"),
        "FP-1": ("6 h", None), "FP-2": ("2 h", None), "FP-3": ("3 h", None), "FP-4": ("4 h", None),
    }
    for key, pair in lives.items():
        if key.startswith("FP-"):
            svg = set_live(svg, "PT-92" + key[-1] + "1", pair[0])
        else:
            svg = set_live(svg, key, pair[0], pair[1])
    tips = {
        "DM-A": "WO-104-A — Leg B steel. 6 hours. Approval. The order is staged, not written back.",
        "DM-B": "WO-104-B — Cotter pin. 2 hours. Approval. Staged, not written back.",
        "BLR-1": "WO-18-D — Damper. 3 hours. On hold. Visual, 4 frames, score 0.93. Location unconfirmed.",
        "BLR-2": "T-103 check — Foundation. 2 hours. Not a verified defect.",
        "BLR-3": "WO-19-V — ROW on span N-19. 4 hours. Released to VEG-02.",
        "BLR-4": "Visit pack — Five tasks, 17 hours, one planned visit.",
        "SH-1": "One visit — 11 days since confirmation. No field start and no after images.",
        "FP-1": "Steel hours — 6 hours inside the grouped visit.",
        "FP-2": "Cotter hours — 2 hours inside the grouped visit.",
        "FP-3": "Damper hours — 3 hours. Still on hold.",
        "FP-4": "ROW hours — 4 hours. Released to VEG-02.",
        "STM-HSE": "Corridor North — Five maintenance tasks grouped into one inspection-and-repair visit.",
    }
    return finish(svg, tips)


def inventory():
    svg = pfd_common(PFD, "NX-INV-PFD-0104", "WAREHOUSE", "THREE HARDWARE REQUESTS", "SUPPLY CHAIN · ILLUSTRATIVE DRAWING")
    svg = retitle_machines(
        svg,
        {
            "Demin filter A": "Plate PL-220",
            "Demin filter B": "Cotter CP-12",
            "Boiler 1": "Damper VD",
            "Boiler 2": "Confirm",
            "Boiler 3": "North Steel",
            "Boiler 4": "Draft order",
            "Steam header": "Short line",
        },
        {"DM-A": "PL-B", "DM-B": "CP12", "BLR-1": "VD22", "BLR-2": "OPEN", "BLR-3": "VEND", "BLR-4": "DRFT", "SH-1": "18 D"},
        ["Need 1", "Need 4", "Need 1", "Lead"],
        ["Hand 0", "Hand 40", "Hand 2", "Open"],
    )
    for old, new in {
        "DP": "NEED", "COND": "HAND", "STM P": "NEED", "STM FLOW": "HAND", "T FLUE": "LEAD",
        "DRUM": "PO", "O2": "CONF", "DISCH P": "NEED", "T BRG": "HAND", "VIB": "LEAD",
        "P": "COST", "T WIND": "PO", "PRESS": "LEAD", "TEMP": "CONF",
    }.items():
        svg = text(svg, old, new)
    for key, value, state in [
        ("PDT-9401", "1", "threshold"), ("AT-9411", "0", "threshold"),
        ("PDT-9402", "4", "normal"), ("AT-9412", "40", "normal"),
        ("PT-9111", "1", "normal"), ("FT-9112", "2", "normal"), ("TT-9113", "stock", "normal"),
        ("LT-9114", "open", "threshold"), ("AT-9115", "open", "threshold"),
        ("PT-9121", "3", "threshold"), ("FT-9122", "open", "threshold"), ("TT-9123", "all", "threshold"),
        ("PT-9131", "$4.2k", "normal"), ("FT-9132", "draft", "normal"), ("TT-9133", "18 d", "threshold"),
        ("PT-9141", "draft", "normal"), ("FT-9142", "not", "normal"), ("TT-9143", "placed", "normal"),
        ("PT-9501", "18 d", "threshold"), ("TT-9502", "open", "threshold"),
        ("PT-9211", "1", None), ("PT-9221", "4", None), ("PT-9231", "1", None), ("PT-9241", "18 d", None),
    ]:
        svg = set_live(svg, key, value, state)
    tips = {
        "DM-A": "MR-104-A — Plate PL-220-B. Need 1, on hand 0. Lead time 18 days. Draft, not placed.",
        "DM-B": "MR-104-B — Cotter CP-12. Need 4, on hand 40.",
        "BLR-1": "MR-18-D — Damper VD-220. Need 1, on hand 2.",
        "BLR-2": "Confirmation — Open on all three requests.",
        "BLR-3": "North Steel — Vendor for the plate. $4.2k draft. Not placed.",
        "BLR-4": "Draft order — The plate order is draft. It has not been placed.",
        "SH-1": "Plate lead — 18 days. Warehouse availability still needs confirmation.",
        "FP-1": "Plate — Need 1.",
        "FP-2": "Cotter — Need 4, on hand 40.",
        "FP-3": "Damper — Need 1, on hand 2.",
        "FP-4": "Lead — 18 days on the plate.",
        "STM-HSE": "Hardware — Replacement hardware for three approved repair jobs. Availability needs confirmation.",
    }
    return finish(svg, tips)


def forecast():
    svg = pfd_common(PFD, "NX-FCT-PFD-0018", "NEXT QUARTER", "18 MANUAL REVIEWS", "RISK FORECAST · ILLUSTRATIVE DRAWING")
    svg = retitle_machines(
        svg,
        {
            "Demin filter A": "Risk flights",
            "Demin filter B": "Calendar",
            "Boiler 1": "North",
            "Boiler 2": "Coastal",
            "Boiler 3": "Inland",
            "Boiler 4": "Angle",
            "Steam header": "Reviews",
        },
        {"DM-A": "46", "DM-B": "22", "BLR-1": "11", "BLR-2": "4", "BLR-3": "2", "BLR-4": "1", "SH-1": "18"},
        ["North", "Coast", "Inland", "Angle"],
        ["11", "4", "2", "1"],
    )
    for old, new in {
        "DP": "PLAN", "COND": "BASE", "STM P": "REV", "STM FLOW": "ZONE", "T FLUE": "PULL",
        "DRUM": "HRS", "O2": "CREW", "DISCH P": "REV", "T BRG": "ZONE", "VIB": "NOTE",
        "P": "DAYS", "T WIND": "CREW", "PRESS": "REV", "TEMP": "HRS",
    }.items():
        svg = text(svg, old, new)
    for key, value, state in [
        ("PDT-9401", "46", "normal"), ("AT-9411", "22", "normal"),
        ("PDT-9402", "22", "normal"), ("AT-9412", "cal", "normal"),
        ("PT-9111", "11", "threshold"), ("FT-9112", "North", "threshold"), ("TT-9113", "T-104", "threshold"),
        ("LT-9114", "8 wk", "threshold"), ("AT-9115", "due", "threshold"),
        ("PT-9121", "4", "normal"), ("FT-9122", "Coast", "normal"),
        ("PT-9131", "2", "normal"), ("FT-9132", "Inland", "normal"),
        ("PT-9141", "1", "normal"), ("FT-9142", "Angle", "normal"),
        ("PT-9501", "18", "threshold"), ("TT-9502", "72 h", "normal"),
    ]:
        svg = set_live(svg, key, value, state)
    tips = {
        "DM-A": "Risk-based flights — 46. A pure calendar would schedule 22.",
        "DM-B": "Calendar — 22 inspections if nothing is pulled forward.",
        "BLR-1": "North — 11 of the 18 reviews. T-104 is already due and was pulled 8 weeks forward.",
        "BLR-2": "Coastal — 4 reviews next quarter.",
        "BLR-3": "Inland — 2 reviews next quarter.",
        "BLR-4": "Angle — 1 review next quarter.",
        "SH-1": "18 reviews — Manual engineering review next quarter. Review hours are 72.",
        "FP-1": "North — 11 reviews.",
        "FP-2": "Coastal — 4 reviews.",
        "FP-3": "Inland — 2 reviews.",
        "FP-4": "Angle — 1 review.",
        "STM-HSE": "Forecast — 18 inspections require manual engineering review next quarter.",
    }
    return finish(svg, tips)


def finance():
    svg = pfd_common(PFD, "NX-FIN-PFD-0480", "CORRIDOR NORTH", "BUDGET AND THIS VISIT", "FINANCIAL INTELLIGENCE · ILLUSTRATIVE DRAWING")
    svg = retitle_machines(
        svg,
        {
            "Demin filter A": "Labor",
            "Demin filter B": "Equipment",
            "Boiler 1": "Materials",
            "Boiler 2": "T-104 share",
            "Boiler 3": "N-18 held",
            "Boiler 4": "N-19",
            "Steam header": "This visit",
        },
        {"DM-A": "8.3k", "DM-B": "14.4", "BLR-1": "6.2k", "BLR-2": "18.4", "BLR-3": "6.1k", "BLR-4": "3.2k", "SH-1": "28.8"},
        ["$8.3k", "$14k", "$6.2k", "$1.1k"],
        ["Labor", "Equip", "Matl", "Check"],
    )
    for old, new in {
        "DP": "COST", "COND": "POST", "STM P": "COST", "STM FLOW": "SHARE", "T FLUE": "NOTE",
        "DRUM": "HELD", "O2": "NOTE", "DISCH P": "COST", "T BRG": "SHARE", "VIB": "NOTE",
        "P": "POST", "T WIND": "NOTE", "PRESS": "VISIT", "TEMP": "SPLIT",
    }.items():
        svg = text(svg, old, new)
    for key, value, state in [
        ("PDT-9401", "$8.3k", "normal"), ("AT-9411", "labor", "normal"),
        ("PDT-9402", "$14.4k", "normal"), ("AT-9412", "equip", "normal"),
        ("PT-9111", "$6.2k", "normal"), ("FT-9112", "matl", "normal"),
        ("PT-9121", "$18.4k", "normal"), ("FT-9122", "T-104", "normal"),
        ("PT-9131", "$6.1k", "threshold"), ("FT-9132", "held", "threshold"),
        ("PT-9141", "$3.2k", "normal"), ("FT-9142", "N-19", "normal"),
        ("PT-9211", "$1.1k", "normal"),
        ("PT-9501", "$28.8k", "normal"), ("TT-9502", "visit", "normal"),
    ]:
        svg = set_live(svg, key, value, state)
    tips = {
        "DM-A": "Labor — $8.3k of the $28.8k visit. Not a saving.",
        "DM-B": "Equipment — $14.4k of the visit.",
        "BLR-1": "Materials — $6.2k of the visit.",
        "BLR-2": "T-104 share — $18.4k of the visit.",
        "BLR-3": "Span N-18 — $6.1k held with the damper.",
        "BLR-4": "Span N-19 — $3.2k. The T-103 check is $1.1k.",
        "SH-1": "This visit — $28.8k. Approved budget $4.80M. Spent $2.15M. Remaining $2.65M. Backlog $1.26M. Headroom $1.39M is not a saving.",
        "FP-1": "Labor — $8.3k.",
        "FP-2": "Equipment — $14.4k.",
        "FP-3": "Materials — $6.2k.",
        "FP-4": "T-103 check — $1.1k.",
        "STM-HSE": "Budget — $4.80M approved. $2.15M spent. $2.65M left. Backlog $1.26M. Headroom is not a saving.",
    }
    return finish(svg, tips)


def workforce():
    svg = pfd_common(PFD, "NX-WFS-PFD-0220", "CORRIDOR NORTH", "AUTHORIZATION AND CREW", "WORKFORCE AND SAFETY · ILLUSTRATIVE DRAWING")
    svg = retitle_machines(
        svg,
        {
            "Demin filter A": "HV-04",
            "Demin filter B": "HV-07",
            "Boiler 1": "VEG-02",
            "Boiler 2": "CIV-1",
            "Boiler 3": "PTW-220-18",
            "Boiler 4": "Incidents",
            "Steam header": "Waiting",
        },
        {"DM-A": "HV04", "DM-B": "HV07", "BLR-1": "VEG2", "BLR-2": "CIV1", "BLR-3": "PTW", "BLR-4": "0", "SH-1": "OPEN"},
        ["Free", "Free", "N-19", "None"],
        ["Cert", "Cert", "VEG", "No"],
    )
    for old, new in {
        "DP": "CERT", "COND": "DUTY", "STM P": "CERT", "STM FLOW": "DUTY", "T FLUE": "DAY",
        "DRUM": "TASK", "O2": "NOTE", "DISCH P": "CERT", "T BRG": "DUTY", "VIB": "DAY",
        "P": "ROLE", "T WIND": "DAY", "PRESS": "PTW", "TEMP": "CREW",
    }.items():
        svg = text(svg, old, new)
    for key, value, state in [
        ("PDT-9401", "yes", "normal"), ("AT-9411", "free", "normal"),
        ("PDT-9402", "yes", "normal"), ("AT-9412", "free", "normal"),
        ("PT-9111", "veg", "normal"), ("FT-9112", "N-19", "normal"), ("TT-9113", "only", "threshold"),
        ("PT-9121", "no", "threshold"), ("FT-9122", "none", "threshold"),
        ("PT-9131", "open", "threshold"), ("FT-9132", "asked", "threshold"), ("TT-9133", "not ok", "threshold"),
        ("PT-9141", "0", "normal"), ("FT-9142", "qtr", "normal"),
        ("PT-9501", "open", "threshold"), ("TT-9502", "wait", "threshold"),
    ]:
        svg = set_live(svg, key, value, state)
    tips = {
        "DM-A": "HV-04 — Current 220 kV certification and Wednesday availability. Not assigned.",
        "DM-B": "HV-07 — Current 220 kV certification and Wednesday availability. Not assigned.",
        "BLR-1": "VEG-02 — Assigned to span N-19 only. Must not take T-104.",
        "BLR-2": "CIV-1 — No certification and no time.",
        "BLR-3": "PTW-220-18 — Requested. Not authorized.",
        "BLR-4": "Incidents — 0 this quarter on Corridor North.",
        "SH-1": "Waiting — Repair task is awaiting verified work authorization and a qualified crew.",
        "FP-1": "HV-04 — Qualified. Not assigned.",
        "FP-2": "HV-07 — Qualified. Not assigned.",
        "FP-3": "VEG-02 — N-19 only.",
        "FP-4": "CIV-1 — No certification.",
        "STM-HSE": "Authorization — PTW-220-18 is open. HV-04 and HV-07 are qualified and not assigned.",
    }
    return finish(svg, tips)


FILES = {
    "nx-ari-sld-0104-corridor-north.svg": reliability(),
    "nx-grd-sld-0220-corridor-north.svg": grid(),
    "nx-ops-pfd-0104-one-visit.svg": operations(),
    "nx-inv-pfd-0104-hardware.svg": inventory(),
    "nx-fct-pfd-0018-reviews.svg": forecast(),
    "nx-fin-pfd-0480-budget.svg": finance(),
    "nx-wfs-pfd-0220-authorization.svg": workforce(),
}

BANNED = ("HELIX", "Boiler", "Demin", "STEAM", "400 kV", "400/132", "CRUDE", "Dyehouse", "Weaving")
for name, body in FILES.items():
    path = PIDS / name
    path.write_text(body)
    for word in BANNED:
        if word in body:
            raise SystemExit("%s still contains %s" % (name, word))
    print(name, len(body))


def safe_text(svg, old, new):
    needle = ">" + old + "<"
    if needle not in svg:
        print("  skip", old[:72])
        return svg
    return svg.replace(needle, ">" + new + "<")


def tip_equipment(svg, blurb):
    ids = re.findall(r'<g id="([^"]+)" class="[^"]*(?:dwg-equipment|pid-equipment)', svg)
    for eid in ids:
        if ('id="%s" data-tip=' % eid) in svg:
            continue
        svg = add_tip(svg, eid, eid + " — " + blurb)
    return svg


def publish(src, dest, pairs, blurb):
    svg = (PIDS / src).read_text()
    for old, new in pairs:
        svg = safe_text(svg, old, new)
    svg = svg.replace('preserveAspectRatio="xMinYMin meet"', 'preserveAspectRatio="xMidYMid meet"', 1)
    svg = svg.replace("var(--k-font)", "'DM Sans', sans-serif")
    svg = svg.replace("var(--k-mono)", "ui-monospace, monospace")
    svg = re.sub(r"<title>.*?</title>", "", svg)
    svg = tip_equipment(svg, blurb)
    for word in ("HELIX", "CRUDE", "DYEHOUSE", "WEAVING", "SPINNING", "BOILER"):
        if word in svg:
            print("  warn", dest, word)
    (PIDS / dest).write_text(svg)
    print(dest, len(svg))


REL = "T-104 index is 61, with two verified structural findings. Span N-18 damper is visual. Span N-19 is ROW vegetation."
GRD = "Corridor loading is 78% of rating. Voltage is 219.4 kV at SS-North. The January and February outages are not attributed to T-104."
OPS = "Five tasks are grouped into one visit. The orders are staged, not written back. 11 days since confirmation, with no field start."
INV = "Plate PL-220-B needs 1 and has 0 on hand, lead 18 days. Cotter CP-12 needs 4 and has 40. Damper VD-220 needs 1 and has 2. Confirmation is open."
FCT = "18 inspections need manual engineering review next quarter: North 11, Coastal 4, Inland 2, Angle 1."
FIN = "Approved budget is $4.80M. Spent $2.15M. This visit is $28.8k. Headroom is not a saving."
WFS = "PTW-220-18 is requested, not authorized. HV-04 and HV-07 are qualified and not assigned. VEG-02 is on span N-19 only."

RU = [
    ("HELIX", "NEXUS OS"),
    ("HLX", "NXS"),
    ("ОБЩИЕ УКАЗАНИЯ", "GENERAL NOTES"),
    ("УСЛОВНЫЕ ОБОЗНАЧЕНИЯ", "LEGEND"),
    ("ВЫКЛЮЧАТЕЛЬ (Q)", "CIRCUIT BREAKER (Q)"),
    ("РАЗЪЕДИНИТЕЛЬ (QS2)", "DISCONNECTOR"),
    ("ТРАНСФОРМАТОР ТОКА", "CURRENT TRANSFORMER"),
    ("ТРАНСФОРМАТОР НАПРЯЖЕНИЯ", "VOLTAGE TRANSFORMER"),
    ("ФУНКЦИЯ ЗАЩИТЫ", "PROTECTION"),
    ("БЛОК ТЕКУЩИХ ДАННЫХ (МОДЕЛИРУЕМЫХ)", "CORRIDOR RECORD"),
    ("ДОБАВЛЕН ОНЛАЙН-МОНИТОРИНГ", "CORRIDOR RECORD ADDED"),
    ("ВЫПУЩЕНО ДЛЯ ИНФОРМАЦИИ", "ISSUED FOR INFORMATION"),
    ("ОДНОЛИНЕЙНАЯ СХЕМА", "SINGLE-LINE DIAGRAM"),
    ("НОМЕР ЧЕРТЕЖА", "DRAWING NO."),
    ("НЕ ДЛЯ СТРОИТЕЛЬСТВА", "NOT FOR CONSTRUCTION"),
    ("ВЫПУЩЕНО", "ISSUED"),
    ("БЕЗ МАСШТАБА", "NONE"),
    ("МАСШТАБ", "SCALE"),
    ("ЛИСТ", "SHEET"),
    ("СТАТУС", "STATUS"),
    ("3.  БЛОКИ ДАННЫХ ПОКАЗЫВАЮТ МОДЕЛИРУЕМЫЕ ЗНАЧЕНИЯ.", "3.  DATA BLOCKS ARE THE CORRIDOR RECORD."),
    ("5.  НЕ ДЛЯ СТРОИТЕЛЬСТВА.", "5.  NOT FOR CONSTRUCTION."),
]

COMMON = [
    ("HELIX", "NEXUS OS"),
    ("HLX", "NXS"),
    ("LIVE DATA BLOCK (SIMULATED)", "CORRIDOR RECORD"),
    ("3.  DATA BLOCKS SHOW SIMULATED READINGS.", "3.  DATA BLOCKS ARE THE CORRIDOR RECORD."),
    ("2.  DATA BLOCKS SHOW SIMULATED READINGS.", "2.  FIGURES ARE THE CORRIDOR RECORD."),
    ("MACHINE, WITH ITS LIVE READINGS", "EQUIPMENT, WITH ITS RECORD"),
    ("READOUT CARD (SIMULATED DATA)", "READOUT CARD"),
    ("LIVE VALUE (SIMULATED)", "CORRIDOR RECORD"),
]

EXTRA = [
    ("SSE-E-SLD-0001-substation-east.svg", "nx-ari-sld-0132-ss-east.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "ASSET RELIABILITY · ILLUSTRATIVE DRAWING"),
        ("SUBSTATION EAST · 132/33 kV · Eastern distribution area", "SS-EAST · 132 kV · Corridor North"),
        ("SUBSTATION EAST", "SS-EAST"),
        ("132/33 kV SWITCHYARD · SINGLE-LINE DIAGRAM", "CORRIDOR NORTH · SINGLE-LINE DIAGRAM"),
        ("SSE-E-SLD-0001", "NX-ARI-SLD-0132"),
    ], REL),
    ("CED-E-OL-0001-cedar-substation.svg", "nx-ari-sld-0230-east-angle.svg", COMMON + [
        ("CEDAR SUBSTATION · 230/69 kV · North Service Territory", "EAST ANGLE · 220 kV · Corridor North"),
        ("CEDAR SUBSTATION", "EAST ANGLE"),
        ("230/69 kV SWITCHYARD · SINGLE-LINE DIAGRAM", "CORRIDOR NORTH · SINGLE-LINE DIAGRAM"),
        ("CED-E-OL-0001", "NX-ARI-SLD-0230"),
        ("CEDAR–NORTH", "T-104 SIDE"),
        ("CEDAR–SUMMIT", "SPAN N-18"),
    ], REL),
    ("RDG-E-OL-0001-ridgeway-substation.svg", "nx-ari-sld-0110-t110.svg", COMMON + [
        ("RIDGEWAY SUBSTATION · 230/138 kV · North Service Territory", "T-110 SIDE · 220 kV · Corridor North"),
        ("RIDGEWAY SUBSTATION", "T-110 SIDE"),
        ("230/138 kV SWITCHYARD · SINGLE-LINE DIAGRAM", "CORRIDOR NORTH · SINGLE-LINE DIAGRAM"),
        ("RDG-E-OL-0001", "NX-ARI-SLD-0110"),
        ("SUMMIT–RIDGEWAY", "SPAN N-19"),
        ("NORTH–RIDGEWAY", "T-101 SIDE"),
    ], REL),
    ("S12-E-SLD-001-substation-s12.svg", "nx-grd-sld-0400-gis.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "ENERGY AND GRID · ILLUSTRATIVE DRAWING"),
        ("SUBSTATION S12 · 400/132 kV · Grid substation", "SS-NORTH · 220 kV · Corridor North"),
        ("400/132 kV SUBSTATION S12", "SS-NORTH 220 kV"),
        ("GIS SWITCHYARD · SINGLE-LINE DIAGRAM", "CORRIDOR NORTH · SINGLE-LINE DIAGRAM"),
        ("S12-E-SLD-001", "NX-GRD-SLD-0400"),
    ], GRD),
    ("S27-E-SLD-001-substation-s27.svg", "nx-grd-sld-0132-distribution.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "ENERGY AND GRID · ILLUSTRATIVE DRAWING"),
        ("SUBSTATION S27 · 132/11 kV · Distribution substation", "SS-NORTH YARD · 220 kV · Corridor North"),
        ("132/11 kV SUBSTATION S27", "SS-NORTH YARD"),
        ("SWITCHGEAR · SINGLE-LINE DIAGRAM", "CORRIDOR NORTH · SINGLE-LINE DIAGRAM"),
        ("S27-E-SLD-001", "NX-GRD-SLD-0132"),
    ], GRD),
    ("PS1-EL-SLD-001-substation-ps-1.svg", "nx-grd-sld-0330-corridor.svg", RU + [
        ("НАДЁЖНОСТЬ ОБОРУДОВАНИЯ · ИЛЛЮСТРАТИВНАЯ СХЕМА", "ENERGY AND GRID · ILLUSTRATIVE DRAWING"),
        ("ПС-1 · 330/110 кВ · Опорная подстанция", "SS-NORTH · 220 kV · Corridor North"),
        ("ПОДСТАНЦИЯ ПС-1 330/110 кВ", "SS-NORTH 220 kV"),
        ("PS1-EL-SLD-001", "NX-GRD-SLD-0330"),
        ("ПС-1 – ПС-4", "CORRIDOR"),
        ("ПС-1 – ПС-9", "12 MARCH"),
    ], GRD),
    ("PS7-EL-SLD-001-substation-ps-7.svg", "nx-grd-sld-0110-yard.svg", RU + [
        ("НАДЁЖНОСТЬ ОБОРУДОВАНИЯ · ИЛЛЮСТРАТИВНАЯ СХЕМА", "ENERGY AND GRID · ILLUSTRATIVE DRAWING"),
        ("ПС-7 · 110/35 кВ · Районная подстанция", "SS-NORTH YARD · 220 kV · Corridor North"),
        ("ПОДСТАНЦИЯ ПС-7 110/35 кВ", "SS-NORTH YARD"),
        ("PS7-EL-SLD-001", "NX-GRD-SLD-0110"),
        ("ПС-7 – ПС-1", "19 JANUARY"),
        ("ПС-7 – ПС-12", "02 FEBRUARY"),
    ], GRD),
    ("PS3-ML-PID-3001-mainline-pumping.svg", "nx-ops-pid-0301-pumps.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "FIELD OPERATIONS · ILLUSTRATIVE DRAWING"),
        ("CRUDE OIL TRUNK PIPELINE · PUMP STATION 3", "CORRIDOR NORTH · 220 kV"),
        ("MAINLINE PUMPING", "ONE PLANNED VISIT"),
        ("PS3-ML-PID-3001", "NX-OPS-PID-0301"),
        ("MAINLINE PUMP A · DUTY", "STEEL WO-104-A"),
        ("MAINLINE PUMP B · DUTY", "COTTER WO-104-B"),
        ("MAINLINE PUMP C · STANDBY", "DAMPER WO-18-D"),
        ("CRUDE FROM", "FROM T-104"),
        ("PUMP STATION 2", "LEG B STEEL"),
        ("CRUDE TO", "TO SPAN"),
        ("PUMP STATION 4", "ROW VEG-02"),
    ], OPS),
    ("NF-OPT-1-PID-2001-oil-processing-train-1.svg", "nx-ops-pid-0201-visit.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "FIELD OPERATIONS · ILLUSTRATIVE DRAWING"),
        ("NORTH FIELD · CENTRAL PROCESSING FACILITY", "CORRIDOR NORTH · 220 kV"),
        ("OIL PROCESSING TRAIN 1", "ONE PLANNED VISIT"),
        ("NF-OPT-1-PID-2001", "NX-OPS-PID-0201"),
        ("ASSOCIATED GAS COMPRESSOR", "DAMPER ON HOLD"),
        ("CRUDE HEATER", "STEEL PLATE"),
        ("CRUDE STORAGE TANK", "COTTER PIN"),
        ("CRUDE EXPORT", "ONE VISIT"),
        ("PRODUCED WATER PUMP", "ROW N-19"),
        ("CRUDE TO EXPORT", "TO THE VISIT"),
        ("ASSOCIATED GAS", "THE DAMPER"),
        ("TO GAS EXPORT", "TO THE VISIT"),
        ("K-2400 GAS COMPRESSION ADDED", "DAMPER HOLD ADDED"),
        ("2.  LINE NUMBER: SIZE-SERVICE-SEQUENCE-CLASS. PO PRODUCED OIL, CR CRUDE, PG GAS, PW WATER.", "2.  FIVE TASKS, ONE VISIT. ORDERS ARE STAGED, NOT WRITTEN BACK."),
    ], OPS),
    ("PA-GCT-A-PID-1001-gas-compression-train-a.svg", "nx-ops-pid-1001-package.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "FIELD OPERATIONS · ILLUSTRATIVE DRAWING"),
        ("PLATFORM A · BLOCK 7 · GAS COMPRESSION", "CORRIDOR NORTH · 220 kV"),
        ("GAS COMPRESSION TRAIN A", "VISIT PACKAGE"),
        ("PA-GCT-A-PID-1001", "NX-OPS-PID-1001"),
        ("EXPORT COMPRESSOR", "STEEL TASK"),
        ("FLASH COMPRESSOR", "COTTER TASK"),
        ("GAS GENERATOR", "DAMPER HOLD"),
        ("EXPORT GAS", "ONE VISIT"),
        ("FLASH GAS FROM", "FROM N-18"),
        ("FLASH GAS", "DAMPER"),
        ("FUEL GAS", "STEEL"),
        ("SEAL GAS SUPPLY", "COTTER PIN"),
        ("WET GAS FROM", "FROM T-104"),
        ("X-1340  DRY GAS SEAL PANEL", "WO-18-D DAMPER HOLD"),
        ("X-1350  LUBE OIL CONSOLE", "WO-104-A STEEL"),
        ("ADDED FLASH GAS RETURN; ONLINE TAGS", "DAMPER HOLD NOTED"),
        ("DRY GAS SEAL PANEL X-1340 ADDED", "DAMPER HOLD ADDED"),
        ("2.  LINE NUMBER: SIZE-SERVICE-SEQUENCE-CLASS. PG PROCESS GAS, FG FUEL GAS, HC CONDENSATE.", "2.  FIVE TASKS, ONE VISIT. ORDERS ARE STAGED, NOT WRITTEN BACK."),
        ("3.  ANTI-SURGE RECYCLE LOOPS AND SEAL GAS DETAIL ARE SHOWN ON PA-GCT-A-PID-1002.", "3.  THE DAMPER STAYS ON HOLD UNTIL THE LOCATION IS CONFIRMED."),
    ], OPS),
    ("UTL-P-PFD-1002-compressed-air-and-cooling.svg", "nx-inv-pfd-1002-stock.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "SUPPLY CHAIN · ILLUSTRATIVE DRAWING"),
        ("BOILER HOUSE AND AIR PLANT · Steam, compressed air and cooling", "CORRIDOR NORTH · 220 kV"),
        ("AIR PLANT AND COOLING", "HARDWARE STOCK"),
        ("COMPRESSORS, DRYER, RECEIVER AND COOLING TOWERS · PROCESS FLOW", "THREE REQUESTS · PROCESS FLOW"),
        ("COMPRESSED AIR AND COOLING PLANT · AIR-HSE", "PLATE, COTTER, DAMPER"),
        ("UTL-P-PFD-1002", "NX-INV-PFD-1002"),
        ("Compressor 1", "Plate PL-220"),
        ("Compressor 2", "Cotter CP-12"),
        ("Compressor 3", "Damper VD"),
        ("Compressor 4", "Confirm"),
        ("Air dryer", "Lead 18 d"),
        ("Air receiver", "On hand"),
        ("Cooling tower 1", "North Steel"),
        ("Cooling tower 2", "Draft order"),
    ], INV),
    ("CR-CDU-1-PID-4001-crude-distillation-unit-1.svg", "nx-inv-pid-4001-requests.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "SUPPLY CHAIN · ILLUSTRATIVE DRAWING"),
        ("CRUDE DISTILLATION UNIT 1", "HARDWARE REQUESTS"),
        ("CR-CDU-1-PID-4001", "NX-INV-PID-4001"),
        ("CRUDE CHARGE", "PLATE PL-220"),
        ("CRUDE FROM", "FROM T-104"),
        ("RESIDUE PUMP", "DAMPER VD"),
        ("REFLUX PUMP", "COTTER CP-12"),
        ("FUEL GAS", "PLATE"),
    ], INV),
    ("MSS-E-SLD-0001-mill-main-substation.svg", "nx-inv-sld-0011-stores.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "SUPPLY CHAIN · ILLUSTRATIVE DRAWING"),
        ("MILL MAIN SUBSTATION · 11/0.415 kV · Mill power distribution", "STORES · CORRIDOR NORTH"),
        ("MILL MAIN SUBSTATION", "STORES"),
        ("11/0.415 kV SWITCHBOARD · SINGLE-LINE DIAGRAM", "HARDWARE · SINGLE-LINE DIAGRAM"),
        ("MSS-E-SLD-0001", "NX-INV-SLD-0011"),
        ("SPINNING", "PLATE"),
        ("WEAVING", "COTTER"),
    ], INV),
    ("SPN-P-PFD-1001-ring-spinning.svg", "nx-fct-pfd-1001-zones.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "RISK FORECAST · ILLUSTRATIVE DRAWING"),
        ("SPINNING HALL · Ring spinning · 6 frames · 30s Ne cotton", "NEXT QUARTER · 18 REVIEWS"),
        ("SPINNING HALL", "FOUR ZONES"),
        ("RING SPINNING LINE · PROCESS FLOW", "18 REVIEWS · PROCESS FLOW"),
        ("RING SPINNING LINE · SPN-LN", "NORTH, COASTAL, INLAND, ANGLE"),
        ("SPN-P-PFD-1001", "NX-FCT-PFD-1001"),
        ("Blowroom line", "North 11"),
        ("Card 1", "Coastal"),
        ("RING SPINNING", "18 REVIEWS"),
    ], FCT),
    ("WVG-P-PFD-1001-air-jet-weaving.svg", "nx-fct-pfd-1001-flights.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "RISK FORECAST · ILLUSTRATIVE DRAWING"),
        ("WEAVING SHED · Air-jet weaving · 8 looms", "RISK FLIGHTS · 46 VERSUS 22"),
        ("WEAVING SHED", "FLIGHT PLAN"),
        ("WARP PREPARATION AND AIR-JET WEAVING · PROCESS FLOW", "46 FLIGHTS · PROCESS FLOW"),
        ("AIR-JET WEAVING LINE · WVG-LN", "T-104 PULLED 8 WEEKS"),
        ("WVG-P-PFD-1001", "NX-FCT-PFD-1008"),
        ("Warping machine", "Flights 46"),
        ("Sizing machine", "Calendar"),
        ("WEAVING, LOOMS 1 TO 4", "NORTH AND COASTAL"),
        ("WEAVING, LOOMS 5 TO 8", "INLAND AND ANGLE"),
        ("Loom 1", "North"),
        ("Loom 2", "Coastal"),
        ("Loom 3", "Inland"),
        ("Loom 4", "Angle"),
        ("Loom 5", "T-104"),
        ("Loom 6", "Flights"),
        ("Loom 7", "Calendar"),
        ("Loom 8", "Reviews"),
    ], FCT),
    ("WET-P-PFD-1001-dyehouse.svg", "nx-fin-pfd-1001-cost.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "FINANCIAL INTELLIGENCE · ILLUSTRATIVE DRAWING"),
        ("WET PROCESSING · Dyehouse and finishing hall", "CORRIDOR NORTH · BUDGET"),
        ("WET PROCESSING · DYEHOUSE", "VISIT COST"),
        ("PRE-TREATMENT AND JET DYEING · PROCESS FLOW", "BUDGET AND VISIT · PROCESS FLOW"),
        ("DYEHOUSE · DYE-LN", "LABOR, EQUIPMENT, MATERIALS"),
        ("WET-P-PFD-1001", "NX-FIN-PFD-1001"),
        ("Bleaching range", "Labor"),
        ("Mercerizer", "Equipment"),
        ("Jet dyeing 1", "Materials"),
        ("Jet dyeing 2", "T-104 share"),
        ("Jet dyeing 3", "N-18 held"),
        ("Jet dyeing 4", "This visit"),
        ("DYEING", "VISIT"),
    ], FIN),
    ("WET-P-PFD-1002-finishing-hall.svg", "nx-wfs-pfd-1002-crew.svg", COMMON + [
        ("ASSET RELIABILITY · ILLUSTRATIVE DRAWING", "WORKFORCE AND SAFETY · ILLUSTRATIVE DRAWING"),
        ("WET PROCESSING · Dyehouse and finishing hall", "CORRIDOR NORTH · CREW"),
        ("WET PROCESSING · FINISHING HALL", "AUTHORIZATION"),
        ("PRINTING, STENTERS AND EFFLUENT · PROCESS FLOW", "CREW AND PERMIT · PROCESS FLOW"),
        ("FINISHING HALL · FIN-LN", "HV-04, HV-07, VEG-02"),
        ("WET-P-PFD-1002", "NX-WFS-PFD-1002"),
        ("Rotary printing", "HV-04"),
        ("Stenter 1", "HV-07"),
    ], WFS),
]

for src, dest, pairs, blurb in EXTRA:
    publish(src, dest, pairs, blurb)
