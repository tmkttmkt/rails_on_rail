"""Cross-check local research results against the official TJ timetable."""
import csv
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / "saves/research-tojo-holiday.json").read_text(encoding="utf-8"))
page = BeautifulSoup((ROOT / "saves/research-tojo-official-tj.html").read_text(encoding="utf-8"), "html.parser")
tables = page.select("table")
if len(tables) != 4:
    raise ValueError("Official TJ timetable layout changed")
checks = []
for direction, table in [("up", tables[2]), ("down", tables[3])]:
    rows = [[c.get_text("", strip=True) for c in r.find_all(["th", "td"])] for r in table.select("tr")]
    numbers = [re.fullmatch(r"(\d+)号", v).group(1) for v in rows[0][2:]]
    for i, number in enumerate(numbers):
        train = next(t for t in data["trains"] if t["id"] == f"holiday-{direction}-{number}")
        if train["type"] != "TJライナー" or train["decision"] != "candidate":
            raise ValueError("TJ classification wrong")
        for row in rows[1:]:
            station, tag, value = row[0], row[1], row[i + 2]
            event = "departure" if tag == "発" else "arrival"
            candidates = [e for e in train["events"] if e["station"] == station and e["event"] in (event, "unspecified") and "clock" in e]
            expected = f"{int(value.split(':')[0]):02}:{value.split(':')[1]}"
            explicit = [e for e in candidates if e["event"] == event]
            same_clock = any(e["clock"] == expected for e in candidates)
            checks.append({"id": train["id"], "station": station, "event": event, "expected": expected, "observed": [e["clock"] for e in candidates], "sourceEventTypes": [e["event"] for e in candidates], "matches": same_clock, "classification": "same-clock" if same_clock else "explicit-event-conflict" if explicit else "source-event-unspecified"})

# Official 2026-03-14 holiday correction: Kawagoeshi 15:00 is now Ebina-bound.
corrected = [t for t in data["trains"] if t["direction"] == "up" and t["advertisedDestination"] == "海老名" and any(e["station"] == "川越市" and e.get("clock") == "15:00" for e in t["events"])]
verification = {
    "sourceUrl": "https://www.tobu.co.jp/railway/tj/timetable/", "officialTjRevision": "2025-03-15", "retrievedDate": "2026-11-10",
    "trains": 14, "checkedEvents": len(checks),
    "sameClock": sum(c["matches"] for c in checks),
    "explicitEventConflicts": [c for c in checks if c["classification"] == "explicit-event-conflict"],
    "unspecifiedEventDifferences": [c for c in checks if c["classification"] == "source-event-unspecified"],
    "correctionSourceUrl": "https://www.tobu.co.jp/cms-pdf/news/20260122113116tgiTEDm8uu3JVCF5qWgJww.pdf",
    "holiday20260314Correction": [{"number": t["number"], "destination": t["advertisedDestination"], "decision": t["decision"]} for t in corrected],
    "checks": checks,
    "officialEvents": [{"id": c["id"], "station": c["station"], "event": c["event"], "clock": c["expected"], "sourceUrl": "https://www.tobu.co.jp/railway/tj/timetable/"} for c in checks],
}
(ROOT / "saves/research-tojo-official-verification.json").write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"officialTjTrains": 14, "checkedEvents": len(checks), "sameClock": verification["sameClock"], "explicitEventConflicts": len(verification["explicitEventConflicts"]), "unspecifiedEventDifferences": len(verification["unspecifiedEventDifferences"]), "holiday20260314Correction": verification["holiday20260314Correction"]}, ensure_ascii=False, indent=2))

infra = json.loads((ROOT / "saves/research-tojo-infrastructure.json").read_text(encoding="utf-8"))
state = json.loads((ROOT / "saves/osm-tobu-tojo-areas.json").read_text(encoding="utf-8"))["state"]
with (ROOT / "saves/research-tojo-stations.csv").open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["station", "stationId", "rangeId", "trackId", "lengthM", "fits200mByLength", "realPlatformNumberVerified"])
    for s in infra["stations"]:
        for p in s["platforms"]:
            w.writerow([s["name"], s["id"], p["id"], p["trackId"], round(p["lengthM"], 3), p["fits200mByLength"], False])
groups = {g["id"]: g["name"] for g in state["stationComplexes"]}
areas_by_station = {a["stationId"]: a for a in state["stationAreas"] if a.get("stationId")}
facility_rows = []
for facility in infra["facilities"]:
    area = areas_by_station.get(facility["id"], {})
    group_name = groups.get(area.get("complexId"), "ungrouped")
    for span in facility["ranges"]:
        facility_rows.append({"group": group_name, "facility": facility["name"], "role": area.get("role", "unresolved"), "trackId": span["trackId"], "rangeId": span["id"], "lengthM": round(span["lengthM"], 3), "fits200mByLength": span["lengthM"] >= 200, "metroReference": "東京メトロ" in facility["name"] or "和光検車区" in group_name, "placementAndAccessVerified": False})
with (ROOT / "saves/research-tojo-stabling.csv").open("w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(facility_rows[0]))
    w.writeheader()
    w.writerows(facility_rows)
summary = {
    "stationRows": [{"name": s["name"], "tracks": len(s["platforms"]), "minM": round(min(p["lengthM"] for p in s["platforms"]), 2), "maxM": round(max(p["lengthM"] for p in s["platforms"]), 2)} for s in infra["stations"]],
    "facilities": [{"group": name, "ranges": len(rows), "length200m": sum(r["fits200mByLength"] for r in rows), "stablingRole200m": sum(r["fits200mByLength"] and r["role"] == "stabling" for r in rows), "metroReference": any(r["metroReference"] for r in rows)} for name in dict.fromkeys(r["group"] for r in facility_rows) for rows in [[r for r in facility_rows if r["group"] == name]]],
}
(ROOT / "saves/research-tojo-infrastructure-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"stations": len(summary["stationRows"]), "facilities": summary["facilities"]}, ensure_ascii=False, indent=2))
