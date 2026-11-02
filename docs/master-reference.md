# ABA League Stats — Master Reference

The complete reference for the ABA stats pipeline: GameChanger exports → GitHub →
public stats site. Paste this file into any future chat, along with new GameChanger
exports or the repository zip, and ask Claude to pick up where you left off.

**Live site:** https://aucklandbaseball.github.io/stats/ — repository `aucklandbaseball/stats`
(GitHub organisation `aucklandbaseball`). Live since 2 Nov 2026 with 25-26 (final) and
26-27 (all six divisions from the first round, 2 Nov 2026). Custom domain
stats.aucklandbaseball.co.nz (CNAME `stats` → aucklandbaseball.github.io at 1st Domains; the
apex aucklandbaseball.co.nz is already verified on the aucklandbaseball GitHub account).
The Claude GitHub app has access to the repository, so Claude can push fixes directly.

**From 26-27 the stats live on a GitHub Pages site, not Airtable.** Airtable was
dropped because it is extra infrastructure tied to one person's account and could
start costing money. See Section 6 for what remains of the Airtable setup.

---

## 1. How it works

1. Each week, export a **Leaders Report** CSV per division from GameChanger.
2. Upload them into `raw/<season>/` in the GitHub repository (Add file → Upload files →
   Commit). Never delete earlier weeks' files.
3. A GitHub Action (`.github/workflows/deploy.yml`) runs `scripts/build.py`, which picks
   the **newest export per division** (by the YYYY-MM-DD date in the file name), cleans
   it (Section 2), combines everything and publishes the site to GitHub Pages. This
   takes a couple of minutes. A green tick in the Actions tab means it's live; a red
   cross shows the reason.
4. Nothing else changes: no pages to create, no imports, no row counts to check.

A division that didn't play keeps last week's stats automatically. Two exports for the same
division with the same date stop the build with a message naming them.

### Repository layout

| Path | Contents |
|---|---|
| `raw/<season>/` | GameChanger exports as downloaded |
| `archive/<season>/stats.csv` | A finished, already-cleaned season (25-26 came from the Airtable export) |
| `config/divisions.json` | File-name → division mapping, division (menu) order, exclusions (LL Minor / 10U, Div W) |
| `config/site.json` | `home_url`: the link back to the ABA website shown on every page |
| `scripts/build.py` | Cleaning and build (Python standard library only) |
| `site/` | The page: `index.html`, `assets/app.js`, `assets/style.css` |
| `README.md` | Setup and weekly steps for whoever maintains it |

The build writes `data/manifest.json` (seasons, divisions with data, "stats to" date)
and `data/<season>/stats.csv` into the published site.

### Ownership

Host the repository under an **ABA GitHub organisation** (free) rather than a personal
account, with at least two committee members as owners. It must be **public** for free
GitHub Pages; every uploaded export therefore stays in the repository history (the same
names are public on the site anyway).

---

## 2. Cleaning rules (GameChanger export → stats.csv)

Implemented in `scripts/build.py`.

### Column mapping

Output columns, in order: `Player`, `Division`, `Duplicate Flag`, then:

| GameChanger column | Field |
|---|---|
| First Name | First Name |
| Last Name | Last Name |
| Jersey Number | Jersey # |
| Team | Team |
| Games Played | GP |
| Plate Appearances | PA |
| Batting Average | AVG |
| Batting Average (rank) | AVG Rank |
| Quality At-Bats | QAB |
| Quality At-Bats (rank) | QAB Rank |
| Runs Batted In | RBI |
| Runs Batted In (rank) | RBI Rank |
| Hits | H |
| Hits (rank) | H Rank |
| On-base Percentage | OBP |
| On-base Percentage (rank) | OBP Rank |
| Slugging Percentage | SLG |
| Slugging Percentage (rank) | SLG Rank |
| On-base Percentage + Slugging Percentage | OPS |
| On-base Percentage + Slugging Percentage (rank) | OPS Rank |
| Doubles | 2B |
| Doubles (rank) | 2B Rank |
| Triples | 3B |
| Triples (rank) | 3B Rank |
| Home Runs | HR |
| Home Runs (rank) | HR Rank |
| Innings Pitched | IP |
| Earned Run Average | ERA |
| Earned Run Average (rank) | ERA Rank |
| Wins | W |
| Wins (rank) | W Rank |
| Strikeouts | K |
| Strikeouts (rank) | K Rank |
| Walks Hits Innings Pitched | WHIP |
| Walks Hits Innings Pitched (rank) | WHIP Rank |
| Batting Average Against | BAA |
| Batting Average Against (rank) | BAA Rank |
| Fielding Percentage | FPCT |
| Fielding Percentage (rank) | FPCT Rank |
| Putouts | PO |
| Putouts (rank) | PO Rank |

Columns are matched by **name**, so column order in the export doesn't matter (26-27
moved Innings Pitched up after Plate Appearances). Unmapped columns are ignored and
missing ones are left blank; both are reported in the build log.

### Player label

`{First Name} {Last Name} #{Jersey Number} ({Division})` — e.g. "Messiah Tuhoro
#29 (Reserves)". If the jersey number is blank, drop the `#` — e.g. "Xavier Marck
(13U)". If two entries still collide, append a tiebreak counter: `[1]`, `[2]`. The
label is also the player's page address on the site, so it must be unique per season.

A player appearing in two grades (e.g. both 13U and 14U) gets two separate rows, by
design — their stats are genuinely different per grade. Never merge them.

### Duplicate Flag

Set to `Check — N entries for this player/team/division` when the same
First+Last+Team+Division appears more than once. This catches accidental duplicate
GameChanger profiles. Never auto-merged — GameChanger's rate stats are pre-calculated,
so a correct merge isn't possible from this data. The fix is merging the profiles in
GameChanger. The build log lists flagged players; the public site doesn't show the flag.
Same name, team *and* jersey number is the strongest signal of a genuine duplicate.

### Rank fix

Every "X Rank" column: if GameChanger left it blank (player didn't qualify — not enough
PA/IP), output **999**. The site treats 999 as "not ranked".

### Standing policies

- **12U stats are published from 26-27** (decided 2 Nov 2026). Before that, ABA did not
  publish 12U individual stats, so 25-26 has none.
- **Divisions (menu order):** Prems, Reserves, Upper Divisional, Lower Divisional, 19U,
  16U, 14U, 13U, 12U. Upper and Lower Divisional added 2 Nov 2026.
- **No Div W stats.** Div W games aren't scored in GameChanger (only final scores are
  entered), so there are no player stats to publish. Div W files are skipped (2 Nov 2026). A finished season's
  menu shows only the divisions it has stats for. (Div1 was mentioned once but
  never appeared in a real export — confirm before adding it.)
- **Little League grade names (from 26-27).** GameChanger exports use LL names; the site
  keeps the ABA division names. Mapping lives in `config/divisions.json`:
  - LL Major → `12U`, LL Intermediate → `13U`, LL Junior → `14U`, LL Senior → `16U`,
    Big League (19U) → `19U`, Premier → `Prems`, Reserves → `Reserves`,
    Div 1 → `Upper Divisional`, Div 3 → `Lower Divisional` (the draw project's
    "ABA Upper Divisional (1/2)" and "ABA Lower Divisional (3)"; Div 1 = Upper confirmed by
    Andrew 2 Nov 2026). Div 2 isn't mapped: a Div 2 file stops the build.
  - LL Minor (10U) and Div W are skipped. Any other new name stops the build with a message
    saying exactly what line to add.

---

## 3. The site

One page for every season, division and category; nothing is created by hand.

- **Menus:** season (newest first, the default), division pills (grades with no data
  yet show dashed), category tabs: Player Stats / Batting / Pitching / Fielding Leaders.
- **Links:** every view has its own address for GameDay menus or sharing:
  `#<season>-<division>-<view>`, e.g. `#26-27-prems-batting`. Views: `stats`,
  `batting`, `pitching`, `fielding`; division codes `prems`, `reserves`, `upper-divisional`, `lower-divisional`, `19u`, `16u`,
  `14u`, `13u`, `12u`. Player pages: `#26-27-13u-player-<label as lowercase-hyphens>`.
- **Player Stats:** grouped by team; search, team filter, sort by any column (ERA, WHIP,
  BAA sort lowest first). Name column stays fixed while scrolling on phones.
- **Leaderboards:** GameChanger's own ranks; top 10 positions; ties shown as "=5"; ties
  of four or more collapse into one expandable "N players tied" row; zeros left out of
  counting stats (RBI, HR, H, 2B, 3B, QAB, W, K, PO).
  - Batting: AVG, OBP, SLG, OPS, RBI, HR, H, 2B, 3B, QAB
  - Pitching: ERA, WHIP, BAA, W, K
  - Fielding: FPCT, PO
- **Player pages:** every stat with the player's rank in their division.
- **Status line:** "stats to <date of newest export>" for the current season, "final
  stats" for archived seasons.
- **Style:** ABA navy `#1e3778`, Anton headings, Barlow text (Google Fonts), navy pills
  matching the main site.

---

## 4. New season (e.g. 27/28)

1. Upload the first exports into a new folder, `raw/27-28/`. The season menu picks it
   up and makes it the default; earlier seasons stay in the menu.
2. Add any new LL grade names to `config/divisions.json` if the build asks.
3. Add the new season's links to the GameDay menu ("Stats → 27/28 Season → Prems" etc.),
   or keep a single "Stats" link to the site's home page.

Optionally, at season end, move the final cleaned `stats.csv` into
`archive/<season>/` so the page shows "final stats".

---

## 5. Setup checklist (one-off)

1. Create a free ABA organisation on GitHub (two or more owners) and a **public**
   repository in it, e.g. `aba-stats`.
2. Upload the repository contents, keeping the folder structure (including `.github`).
3. Settings → Pages → Build and deployment → **Source: GitHub Actions**.
4. Actions → *Build and publish stats site* → **Run workflow** (first time only).
5. Set `home_url` in `config/site.json`.
6. Optional: custom domain (e.g. `stats.<ABA domain>`): Settings → Pages → Custom domain,
   plus the CNAME record GitHub shows, at the DNS provider. Worth doing — links then
   survive any future move of the repository.
7. Point the GameDay menu at the site (see Section 3 for link formats).

---

## 6. Retiring the Airtable setup

| Item | Status | Action |
|---|---|---|
| 25-26 Airtable base `appHK82xWGyTe0t2v` | Its data is now in the GitHub site (`archive/25-26`, exported 2 Nov 2026, 564 rows) | Keep until the GameDay 25-26 pages are switched over, then delete |
| 24 GameDay pages `/…-25-26/` embedding that base | Live on the ABA site | Repoint the menu to the GitHub site's 25-26 season; then remove or redirect the pages |
| 26-27 Airtable base `appaEtgC1thoz9jH1` | Created 2 Nov 2026, never used | Delete |
| 26-27 page pack (`aba-stats-pages-full-pack-26-27.md`) | Never used | Discard |

### Why it changed (history)

- 25-26: Airtable + embeds were chosen after custom HTML/JavaScript pasted into WordPress
  was repeatedly corrupted (`wpautop`, Wordfence). Airtable won over Notion, Glide,
  AppSheet, Datawrapper and Power BI for free public sharing, click-to-expand records
  and server-side sorting (with the 999 rank fix).
- 26-27: moved to GitHub Pages. The code lives on GitHub, so WordPress only needs a
  link — the original corruption problem doesn't arise. It also removes the Airtable
  account dependency and possible cost, the 1,000-record-per-base limit and trash
  workaround, the 24 manual pages per season, and Airtable's mobile limitations, and
  adds proper tie display and player pages.
- GameChanger data can't feed BNZ's WBSC/BallClubz stats platform (it needs live
  pitch-by-pitch scoring, not CSV import) — supporting evidence for ABA staying on
  GameChanger.
