#!/usr/bin/env python3
"""Build the ABA stats site.

  raw/<season>/*.csv        GameChanger Leaders Report exports (upload weekly, never delete)
  archive/<season>/stats.csv  Optional already-cleaned seasons (e.g. 25-26 exported from Airtable)
  config/divisions.json     File-name -> division mapping

Writes the finished site to --out (default _site): the files in site/, plus
  data/manifest.json and data/<season>/stats.csv

For each season and division only the NEWEST export is used (by the YYYY-MM-DD
date in its file name), so each week's files simply sit alongside last week's.
Cleaning rules: Section 2 of the ABA League Stats Master Reference.
Standard library only.
"""
import argparse
import collections
import csv
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MAPPING = [
    ("First Name", "First Name"), ("Last Name", "Last Name"), ("Jersey Number", "Jersey #"), ("Team", "Team"),
    ("Games Played", "GP"), ("Plate Appearances", "PA"),
    ("Batting Average", "AVG"), ("Batting Average (rank)", "AVG Rank"),
    ("Quality At-Bats", "QAB"), ("Quality At-Bats (rank)", "QAB Rank"),
    ("Runs Batted In", "RBI"), ("Runs Batted In (rank)", "RBI Rank"),
    ("Hits", "H"), ("Hits (rank)", "H Rank"),
    ("On-base Percentage", "OBP"), ("On-base Percentage (rank)", "OBP Rank"),
    ("Slugging Percentage", "SLG"), ("Slugging Percentage (rank)", "SLG Rank"),
    ("On-base Percentage + Slugging Percentage", "OPS"), ("On-base Percentage + Slugging Percentage (rank)", "OPS Rank"),
    ("Doubles", "2B"), ("Doubles (rank)", "2B Rank"),
    ("Triples", "3B"), ("Triples (rank)", "3B Rank"),
    ("Home Runs", "HR"), ("Home Runs (rank)", "HR Rank"),
    ("Innings Pitched", "IP"),
    ("Earned Run Average", "ERA"), ("Earned Run Average (rank)", "ERA Rank"),
    ("Wins", "W"), ("Wins (rank)", "W Rank"),
    ("Strikeouts", "K"), ("Strikeouts (rank)", "K Rank"),
    ("Walks Hits Innings Pitched", "WHIP"), ("Walks Hits Innings Pitched (rank)", "WHIP Rank"),
    ("Batting Average Against", "BAA"), ("Batting Average Against (rank)", "BAA Rank"),
    ("Fielding Percentage", "FPCT"), ("Fielding Percentage (rank)", "FPCT Rank"),
    ("Putouts", "PO"), ("Putouts (rank)", "PO Rank"),
]
OUT_COLS = ["Player", "Division", "Duplicate Flag"] + [a for _, a in MAPPING]
DATE_RE = re.compile(r"(20\d\d)-(\d\d)-(\d\d)")


def load_config():
    cfg = json.loads((ROOT / "config" / "divisions.json").read_text(encoding="utf-8"))
    return cfg


def division_for(name, cfg):
    if any(re.search(p, name, re.I) for p in cfg["exclude"]):
        return None
    for m in cfg["match"]:
        if re.search(m["pattern"], name, re.I):
            return m["division"]
    sys.exit(
        f"\nERROR: don't know which division '{name}' belongs to.\n"
        f"Add a line to config/divisions.json under \"match\", e.g.\n"
        f'    {{"pattern": "<part of the file name>", "division": "<one of {cfg["order"]}>"}},\n'
    )


def file_date(name):
    m = DATE_RE.search(name)
    return date(int(m[1]), int(m[2]), int(m[3])) if m else None


def clean_file(path, division):
    rows, notes = [], []
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        mapped = dict(MAPPING)
        extra = [h for h in fields if h not in mapped]
        missing = [g for g, _ in MAPPING if g not in fields]
        if extra:
            notes.append(f"{path.name}: columns not in the mapping were ignored: {extra}")
        if missing:
            notes.append(f"{path.name}: columns missing from this export: {missing}")
        for r in reader:
            if not any((v or "").strip() for v in r.values()):
                continue
            out = {"Division": division}
            for g, a in MAPPING:
                v = (r.get(g) or "").strip()
                if g.endswith("(rank)") and v == "":
                    v = "999"  # non-qualifier sorts last
                out[a] = v
            rows.append(out)
    return rows, notes


def finish(rows):
    # Same name, team, division AND jersey number (blank counts as a value): two different
    # players can share a name on one team (e.g. surnames shortened to an initial).
    key = lambda r: (r["First Name"].lower(), r["Last Name"].lower(), r["Team"], r["Division"],
                     r.get("Jersey #", ""))
    counts = collections.Counter(key(r) for r in rows)
    for r in rows:
        n = counts[key(r)]
        r["Duplicate Flag"] = f"Check — {n} entries for this player/team/division" if n > 1 else ""

    def label(r):
        j = r.get("Jersey #", "")
        return f"{r['First Name']} {r['Last Name']}" + (f" #{j}" if j else "") + f" ({r['Division']})"

    labels = collections.Counter(label(r) for r in rows)
    seen = collections.Counter()
    for r in rows:
        base = label(r)
        if labels[base] > 1:
            seen[base] += 1
            r["Player"] = f"{base} [{seen[base]}]"
        else:
            r["Player"] = base
    return rows


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def build_season(season_dir, cfg):
    """Pick the newest export per division, clean and combine."""
    newest, clash = {}, {}
    for p in sorted(season_dir.glob("*.csv")):
        div = division_for(p.name, cfg)
        if div is None:
            print(f"  skipped (grade not published, see 'exclude' in config/divisions.json): {p.name}")
            continue
        d = file_date(p.name) or date.min
        if div not in newest or d > newest[div][0]:
            newest[div] = (d, p)
            clash.pop(div, None)
        elif d == newest[div][0]:
            clash.setdefault(div, [newest[div][1].name]).append(p.name)
    if clash:
        lines = "\n".join(f"  {div}: " + " | ".join(names) for div, names in clash.items())
        sys.exit(
            f"\nERROR: more than one export with the same date for a division:\n{lines}\n"
            "Delete the copies that shouldn't be used (e.g. a '(1)' re-download), keeping one per division.\n"
        )
    rows, notes, sources = [], [], {}
    for div in cfg["order"]:
        if div not in newest:
            continue
        d, p = newest[div]
        r, n = clean_file(p, div)
        rows += r
        notes += n
        sources[div] = {"file": p.name, "date": d.isoformat() if d != date.min else None, "rows": len(r)}
    dates = [s["date"] for s in sources.values() if s["date"]]
    return finish(rows), notes, sources, (max(dates) if dates else None)


def season_label(s):
    m = re.fullmatch(r"(\d\d)-(\d\d)", s)
    return f"{m[1]}/{m[2]} Season" if m else s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_site")
    out = (ROOT / ap.parse_args().out).resolve()
    cfg = load_config()

    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(ROOT / "site", out)

    seasons = {}
    for d in sorted((ROOT / "archive").glob("*/stats.csv")):
        s = d.parent.name
        with open(d, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        write_csv(out / "data" / s / "stats.csv", rows)
        seasons[s] = {"rows": rows, "updated": None, "final": True, "sources": {}}
        print(f"{s}: {len(rows)} rows from archive")

    for d in sorted(p for p in (ROOT / "raw").iterdir() if p.is_dir()):
        s = d.name
        print(f"{s}:")
        rows, notes, sources, updated = build_season(d, cfg)
        for n in notes:
            print("  note:", n)
        if not rows:
            print("  no data yet")
            continue
        write_csv(out / "data" / s / "stats.csv", rows)
        seasons[s] = {"rows": rows, "updated": updated, "final": False, "sources": sources}
        print(f"  {len(rows)} rows {dict(collections.Counter(r['Division'] for r in rows))}")
        dups = sorted({f"{r['First Name']} {r['Last Name']} ({r['Team']}, {r['Division']})"
                       for r in rows if r.get("Duplicate Flag")})
        for d in dups:
            print(f"  possible duplicate GameChanger profile, merge in GameChanger: {d}")

    site_cfg = json.loads((ROOT / "config" / "site.json").read_text(encoding="utf-8"))
    manifest = {
        "site": {k: v for k, v in site_cfg.items() if not k.startswith("_")},
        "divisions": cfg["order"],
        "seasons": [
            {
                "id": s,
                "label": season_label(s),
                "updated": v["updated"],
                "final": v["final"],
                "divisions": [d for d in cfg["order"] if any(r.get("Division") == d for r in v["rows"])],
                "sources": v["sources"],
            }
            for s, v in sorted(seasons.items(), reverse=True)
        ],
    }
    (out / "data").mkdir(parents=True, exist_ok=True)
    (out / "data" / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"site written to {out}")


if __name__ == "__main__":
    main()
