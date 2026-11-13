"""Normalize a locally captured public timetable; never modify game data.

Input: saves/research-tojo-holiday-web.txt (web reader's numbered factual rows).
Source: https://tabinomemo.jp/train/timetable/tobu/21, read 2026-11-10.
The local reference is not a licensed redistributable game dataset.
"""
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = ROOT / "saves/research-tojo-holiday"
source_path = Path(str(PREFIX) + "-web.txt")
raw = source_path.read_text(encoding="utf-8")
lines = {int(n): text for n, text in (line.split("\t", 1) for line in raw.splitlines())}
order = "池袋 北池袋 下板橋 大山 中板橋 ときわ台 上板橋 東武練馬 下赤塚 成増 和光市 朝霞 朝霞台 志木 柳瀬川 みずほ台 鶴瀬 ふじみ野 上福岡 新河岸 川越 川越市 霞ヶ関 鶴ヶ島 若葉 坂戸 北坂戸 高坂 東松山 森林公園 つきのわ 武蔵嵐山 小川町".split()
target = set(order)


def clock(value):
    hour, minute = int(value[:-2]), int(value[-2:])
    if minute >= 60 or hour > 26:
        raise ValueError(f"Invalid clock: {value}")
    # An explicit research convention, not an inferred train movement.
    total = hour * 60 + minute
    if total < 180:
        total += 1440
    return {"clock": f"{hour % 24:02}:{minute:02}", "dayOffset": total // 1440, "serviceMinute": total}


trains = []
source_checks = []
for direction, header_line, first_line, last_line, count in [
    ("down", 169, 171, 220, 409), ("up", 222, 224, 277, 418)
]:
    headers = [s.strip() for s in lines[header_line].split("|")][1:]
    if len(headers) != count:
        raise ValueError("Truncated header")
    rows = []
    station = None
    for n in range(first_line, last_line + 1):
        values = [s.strip() for s in lines[n].split("|")]
        if len(values) == count + 1:
            label, values = values[0], values[1:]
            station = label
            event = "unspecified"
        elif len(values) == count:
            label, event = station, "departure"
            if not rows or rows[-1]["station"] != label:
                raise ValueError("Orphan departure row")
            rows[-1]["event"] = "arrival"
        else:
            raise ValueError(f"Truncated source row {n}: {len(values)}")
        rows.append({"station": label, "event": event, "sourceLine": n, "values": values})
    cells = [v for r in rows if r["station"] not in ("前の路線", "次の路線") for v in r["values"]]
    timed_cells = [v for v in cells if re.fullmatch(r"\d{3,4}", v)]
    check = {"direction": direction, "timed": len(timed_cells), "passes": cells.count("レ"), "blank": cells.count(""), "sum": sum(map(int, timed_cells))}
    # Independently read from the rendered DOM on the retrieval date.
    expected = {"down": (7249, 2161, 10631, 10257338), "up": (7725, 2183, 12246, 10761492)}[direction]
    if tuple(check[k] for k in ("timed", "passes", "blank", "sum")) != expected:
        raise ValueError(f"Captured rows differ from browser DOM: {check}")
    source_checks.append(check)
    for i, header in enumerate(headers):
        match = re.fullmatch(r"(各停|準急|急行|快急|川特|TJ)\s+([A-Z0-9]+)(.+)", header)
        if not match:
            raise ValueError(f"Unrecognized header: {header}")
        kind, number, destination = match.groups()
        events, boundary = [], []
        for row in rows:
            value = row["values"][i]
            if row["station"] in ("前の路線", "次の路線"):
                if value:
                    boundary.append({"side": row["station"], "value": value})
                continue
            if not value:
                continue
            event = {k: row[k] for k in ("station", "event", "sourceLine")}
            event["raw"] = value
            if re.fullmatch(r"\d{3,4}", value):
                event.update(clock(value))
                event["status"] = "stop"
            elif value == "レ":
                event["status"] = "pass"
            else:
                event["status"] = "unresolved"
            events.append(event)
        timed = [e for e in events if "serviceMinute" in e]
        scoped = [e for e in events if e["station"] in target]
        scoped_timed = [e for e in scoped if "serviceMinute" in e]
        # A line-to-line link is direct evidence, not a number-prefix guess.
        if boundary:
            decision = "exclude-subway-through"
        elif len({e["station"] for e in scoped_timed}) < 2:
            decision = "exclude-no-target-segment"
        else:
            decision = "candidate"
        problems = []
        if any(b["serviceMinute"] < a["serviceMinute"] for a, b in zip(timed, timed[1:])):
            problems.append("nonmonotonic-times")
        if any(e["status"] == "unresolved" for e in events):
            problems.append("unknown-source-value")
        scoped_stations = list(dict.fromkeys(e["station"] for e in scoped))
        if scoped_stations:
            indices = sorted(order.index(s) for s in scoped_stations)
            missing = [s for s in order[indices[0]:indices[-1] + 1] if s not in scoped_stations]
            if missing:
                problems.append("internal-station-blanks:" + ",".join(missing))
        trains.append({
            "id": f"holiday-{direction}-{number}", "number": number,
            "direction": direction, "sourceColumn": i + 1,
            "type": {"各停": "普通", "快急": "快速急行", "川特": "川越特急", "TJ": "TJライナー"}.get(kind, kind),
            "advertisedDestination": destination,
            "observedOrigin": timed[0]["station"] if timed else None,
            "observedDestination": timed[-1]["station"] if timed else None,
            "scopedOrigin": scoped_timed[0]["station"] if scoped_timed else None,
            "scopedDestination": scoped_timed[-1]["station"] if scoped_timed else None,
            "decision": decision, "throughEvidence": boundary,
            "crossesOgawamachiBoundary": any(e["station"] not in target for e in events),
            "regularServiceVerified": False, "currentTimetableVerified": False,
            "events": scoped, "issues": problems,
        })

if len(trains) != 827 or len({t["id"] for t in trains}) != len(trains):
    raise ValueError("Missing or duplicate source columns")
included = [t for t in trains if t["decision"] == "candidate"]
metadata = {
    "sourceUrl": "https://tabinomemo.jp/train/timetable/tobu/21", "retrievedDate": "2026-11-10",
    "sourceKind": "secondary-public-display-derived-from-ODPT", "revisionDate": None,
    "status": "reference-candidates-not-verified-game-timetable",
    "rawSha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
    "distribution": "Local research only; ODPT Tobu data is challenge-limited; do not bundle with game.",
    "timeConvention": "Times before 03:00 are next calendar day; unspecified source events remain unspecified.",
    "stations": order,
}
Path(str(PREFIX) + ".json").write_text(json.dumps({"metadata": metadata, "trains": trains}, ensure_ascii=False, indent=2), encoding="utf-8")
with Path(str(PREFIX) + "-trains.csv").open("w", encoding="utf-8-sig", newline="") as f:
    fields = ["id", "number", "direction", "type", "observedOrigin", "observedDestination", "scopedOrigin", "scopedDestination", "advertisedDestination", "decision", "crossesOgawamachiBoundary", "firstTime", "firstDayOffset", "lastTime", "lastDayOffset", "stoppingStations", "issues"]
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    for t in trains:
        timed = [e for e in t["events"] if "clock" in e]
        row = {k: t[k] for k in fields if k in t}
        row.update(firstTime=timed[0]["clock"] if timed else "", firstDayOffset=timed[0]["dayOffset"] if timed else "", lastTime=timed[-1]["clock"] if timed else "", lastDayOffset=timed[-1]["dayOffset"] if timed else "", stoppingStations=";".join(dict.fromkeys(e["station"] for e in timed)), issues=";".join(t["issues"]))
        writer.writerow(row)
with Path(str(PREFIX) + "-events.csv").open("w", encoding="utf-8-sig", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["id", "decision", "station", "event", "status", "clock", "dayOffset", "serviceMinute", "raw", "sourceLine"])
    writer.writeheader()
    for t in trains:
        for e in t["events"]:
            writer.writerow({"id": t["id"], "decision": t["decision"], **e})
patterns = Counter((t["type"], tuple(dict.fromkeys(e["station"] for e in t["events"] if e["status"] == "stop"))) for t in included)
summary = {
    **metadata,
    "renderedDomCrossChecks": source_checks,
    "sourceColumns": len(trains), "decisions": dict(Counter(t["decision"] for t in trains)),
    "directions": {d: dict(Counter(t["type"] for t in included if t["direction"] == d)) for d in ("down", "up")},
    "candidateCount": len(included), "candidateEvents": sum(len(t["events"]) for t in included),
    "timedEvents": sum("clock" in e for t in included for e in t["events"]),
    "issues": [{"id": t["id"], "issues": t["issues"]} for t in included if t["issues"]],
    "boundaryCandidates": [{"id": t["id"], "origin": t["observedOrigin"], "destination": t["observedDestination"]} for t in included if t["crossesOgawamachiBoundary"]],
    "patterns": [{"type": k[0], "stops": list(k[1]), "trains": v} for k, v in patterns.items()],
    "firstLast": {d: {
        "first": min((e["serviceMinute"], t["number"], e["station"]) for t in included if t["direction"] == d for e in t["events"] if "serviceMinute" in e),
        "last": max((e["serviceMinute"], t["number"], e["station"]) for t in included if t["direction"] == d for e in t["events"] if "serviceMinute" in e),
    } for d in ("down", "up")},
}
Path(str(PREFIX) + "-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({k: summary[k] for k in ("sourceColumns", "decisions", "candidateCount", "directions", "timedEvents", "issues", "boundaryCandidates", "firstLast")}, ensure_ascii=False, indent=2))
