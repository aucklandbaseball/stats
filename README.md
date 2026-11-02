# ABA League Stats

Auckland Baseball Association league stats and leaderboards, built from GameChanger
exports and published free on GitHub Pages. One page covers every season, division and
stat category, so nothing has to be created by hand each season.

## Weekly update (about 2 minutes)

1. In GameChanger, export the **Leaders Report** CSV for each division (not 12U).
2. On GitHub, open the `raw/26-27` folder → **Add file → Upload files** → drag the CSVs in →
   **Commit changes**. Don't delete last week's files — for each division the newest export
   (by the date in its file name) is used automatically.
3. Within a couple of minutes the site updates. To check, open the **Actions** tab: a green tick
   means it's live; a red cross means something needs fixing (click it to see the message).

If a division didn't play that week you can skip its file; last week's stays in use.

## Folder layout

| Folder | What goes there |
|---|---|
| `raw/<season>/` | GameChanger exports as downloaded, e.g. `raw/26-27/ABA_LL_Intermediate_26_27_Leaders_Report_2026-11-02.csv` |
| `archive/<season>/stats.csv` | A finished season that's already cleaned (25-26 came from the Airtable export) |
| `config/divisions.json` | Which division each export belongs to, matched on its file name |
| `config/site.json` | Link back to the ABA website (`home_url`) |
| `scripts/build.py` | Cleans the exports and builds the site (no setup needed, runs on GitHub) |
| `site/` | The web page itself |

## One-off setup

1. Create a free ABA **organisation** on GitHub with at least two committee members as owners,
   so the site doesn't depend on one person's account. In it, create a **public** repository
   (e.g. `aba-stats`) and upload everything in this folder, keeping the folder structure
   (including the hidden `.github` folder).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Actions** tab → *Build and publish stats site* → **Run workflow** (first time only).
4. The site appears at `https://<your-username>.github.io/aba-stats/`.
5. Optional: put `home_url` in `config/site.json` so every page has a link back to the ABA site.
6. Optional, for an ABA address such as `stats.aucklandbaseball.co.nz`: **Settings → Pages →
   Custom domain**, and add the CNAME record GitHub shows you at the domain's DNS provider.

## Linking from the ABA website

Every view has its own link, so GameDay menu items can point straight at them:

```
https://<site>/#26-27-prems-stats          Player stats
https://<site>/#26-27-prems-batting        Batting leaders
https://<site>/#26-27-prems-pitching       Pitching leaders
https://<site>/#26-27-prems-fielding       Fielding leaders
```

Division codes: `prems`, `reserves`, `19u`, `16u`, `14u`, `13u`. A single "Stats" link to the
site's home page also works: it opens the latest season.

## New season

Upload the first exports into a new folder, e.g. `raw/27-28/`. The season menu picks it up and
becomes the default. Earlier seasons stay available from the menu.

## New or renamed grade

From 26-27 GameChanger uses Little League names, but the site keeps the ABA division names.
If an upload fails with "don't know which division …", edit `config/divisions.json` on GitHub
and add a line under `"match"`, for example:

```
{"pattern": "LL[_ ]?Juniors", "division": "14U"},
```

The `pattern` is part of the file name; `division` must be one of the names in `"order"`.
12U files (and LL Majors) are skipped automatically — ABA doesn't publish 12U individual stats.

## How the stats are cleaned

Same rules as the Airtable pipeline (ABA League Stats Master Reference, Section 2):
GameChanger columns are matched by name, blank ranks become 999 (non-qualifiers sort last),
and each player gets a unique label `First Last #Jersey (Division)` (no `#` if the jersey is
blank). Possible duplicate GameChanger profiles (same name and team twice in a division) are
listed in the Actions log rather than shown on the site; fix them by merging the profiles in
GameChanger.

Leaderboards use GameChanger's own ranks, show the top 10 positions, collapse ties of four or
more into one expandable row, and leave out zeros for counting stats (e.g. 0 home runs).

## Note on privacy

GitHub Pages is free for public repositories, so every uploaded export (with players' names)
stays in the repository history. The same names are already public on the site.
