/* ABA League Stats — single-page viewer for data/<season>/stats.csv.
 * Views are addressed by a plain hash so every page can be linked to directly:
 *   #26-27-prems-stats | -batting | -pitching | -fielding | -player-<id>
 */
(() => {
  'use strict';

  const TABS = [
    { id: 'stats', label: 'Player Stats' },
    { id: 'batting', label: 'Batting Leaders' },
    { id: 'pitching', label: 'Pitching Leaders' },
    { id: 'fielding', label: 'Fielding Leaders' },
  ];
  const LEADERS = {
    batting: ['AVG', 'OBP', 'SLG', 'OPS', 'RBI', 'HR', 'H', '2B', '3B', 'QAB'],
    pitching: ['ERA', 'WHIP', 'BAA', 'W', 'K'],
    fielding: ['FPCT', 'PO'],
  };
  const COL_GROUPS = [
    { label: 'Batting', keys: ['GP', 'PA', 'AVG', 'OBP', 'SLG', 'OPS', 'H', '2B', '3B', 'HR', 'RBI', 'QAB'] },
    { label: 'Pitching', keys: ['IP', 'ERA', 'WHIP', 'BAA', 'W', 'K'] },
    { label: 'Fielding', keys: ['FPCT', 'PO'] },
  ];
  const PLAYER_SECTIONS = [
    { label: 'Batting', keys: ['GP', 'PA', 'AVG', 'OBP', 'SLG', 'OPS', 'H', '2B', '3B', 'HR', 'RBI', 'QAB'] },
    { label: 'Pitching', keys: ['IP', 'ERA', 'WHIP', 'BAA', 'W', 'K'] },
    { label: 'Fielding', keys: ['FPCT', 'PO'] },
  ];
  const NAMES = {
    GP: 'Games Played', PA: 'Plate Appearances', AVG: 'Batting Average', OBP: 'On-Base Percentage',
    SLG: 'Slugging Percentage', OPS: 'On-Base Plus Slugging', H: 'Hits', '2B': 'Doubles', '3B': 'Triples',
    HR: 'Home Runs', RBI: 'Runs Batted In', QAB: 'Quality At-Bats', IP: 'Innings Pitched',
    ERA: 'Earned Run Average', WHIP: 'Walks + Hits per Inning', BAA: 'Batting Average Against',
    W: 'Wins', K: 'Strikeouts', FPCT: 'Fielding Percentage', PO: 'Putouts',
  };
  const RATE3 = new Set(['AVG', 'OBP', 'SLG', 'OPS', 'BAA', 'FPCT']);
  const RATE2 = new Set(['ERA', 'WHIP']);
  const LOWER_IS_BETTER = new Set(['ERA', 'WHIP', 'BAA']);
  const COUNTING = new Set(['RBI', 'HR', 'H', '2B', '3B', 'QAB', 'W', 'K', 'PO']);
  const UNRANKED = new Set(['GP', 'PA', 'IP']);
  const TOP = 10;          // leaderboard shows ranks 1..TOP
  const COLLAPSE_AT = 4;   // ties this large collapse into one "N players tied" row
  const NO_RANK = 999;     // set by the build for non-qualifiers

  const $ = (sel) => document.querySelector(sel);
  const state = { manifest: null, seasons: new Map(), table: { sort: null, query: '', team: '' }, lastView: '' };

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const num = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const rankOf = (r, key) => { const n = num(r[key + ' Rank']); return n === null || n >= NO_RANK ? null : n; };
  const nameOf = (r) => `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim() || r.Player;
  const playerId = (r) => slug(r.Player || nameOf(r));
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  function fmt(key, v) {
    const n = num(v);
    if (n === null) return '–';
    if (RATE3.has(key)) { const s = n.toFixed(3); return n >= 0 && n < 1 ? s.replace(/^0/, '') : s; }
    if (RATE2.has(key)) return n.toFixed(2);
    if (key === 'IP') return n === 0 ? '–' : String(v).trim();
    return Number.isInteger(n) ? String(n) : String(v).trim();
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', i = 0, q = false;
    text = text.replace(/^﻿/, '');
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const [head, ...body] = rows;
    return body.filter((r) => r.some((x) => x.trim() !== '')).map((r) => Object.fromEntries(head.map((h, j) => [h.trim(), (r[j] ?? '').trim()])));
  }

  async function getJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json();
  }
  async function loadSeason(id) {
    if (!state.seasons.has(id)) {
      state.seasons.set(id, (async () => {
        const res = await fetch(`data/${id}/stats.csv`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`stats for ${id}: ${res.status}`);
        return parseCSV(await res.text());
      })());
    }
    return state.seasons.get(id);
  }

  /* ---------- routing ---------- */
  function link(seasonId, division, tab, pid) {
    return '#' + seasonId + '-' + slug(division) + '-' + (pid ? 'player-' + pid : tab);
  }

  function resolveRoute() {
    const m = state.manifest;
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    // Division codes can contain hyphens (e.g. upper-divisional), so match them lazily.
    let mm = h.match(/^(\d\d-\d\d)-([a-z0-9-]+?)-player-([a-z0-9-]+)$/);
    let route = mm ? { season: mm[1], div: mm[2], tab: 'player', player: mm[3] } : null;
    if (!route) {
      mm = h.match(/^(\d\d-\d\d)-([a-z0-9-]+?)-(stats|batting|pitching|fielding)$/);
      if (mm) route = { season: mm[1], div: mm[2], tab: mm[3] };
    }
    const season = m.seasons.find((s) => s.id === route?.season) || m.seasons[0];
    const visible = visibleDivisions(season);
    const division = visible.find((d) => slug(d) === route?.div)
      || season.divisions[0] || visible[0];
    return { season, division, tab: route?.tab || 'stats', player: route?.player || null };
  }

  // A finished season shows only the divisions it has stats for; the current
  // season shows every division, with ones that have no stats yet greyed out.
  function visibleDivisions(season) {
    return season.final ? season.divisions : state.manifest.divisions;
  }

  /* ---------- chrome ---------- */
  function renderChrome(r) {
    const sel = $('#season');
    sel.innerHTML = state.manifest.seasons.map((s) => `<option value="${esc(s.id)}"${s.id === r.season.id ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
    sel.onchange = () => {
      const s = state.manifest.seasons.find((x) => x.id === sel.value);
      const tab = r.tab === 'player' ? 'stats' : r.tab;
      location.hash = link(s.id, r.division, tab);
    };

    $('#divisions').innerHTML = visibleDivisions(r.season).map((d) => {
      const has = r.season.divisions.includes(d);
      const tab = r.tab === 'player' ? 'stats' : r.tab;
      const cur = d === r.division ? ' aria-current="page"' : '';
      return `<a class="pill${has ? '' : ' empty'}" href="${link(r.season.id, d, tab)}"${cur}${has ? '' : ' title="No stats yet"'}>${esc(d)}</a>`;
    }).join('');

    $('#tabs').innerHTML = TABS.map((t) => {
      const cur = (r.tab === t.id || (r.tab === 'player' && t.id === 'stats')) ? ' aria-current="page"' : '';
      return `<a class="tab" href="${link(r.season.id, r.division, t.id)}"${cur}>${esc(t.label)}</a>`;
    }).join('');

    const site = state.manifest.site || {};
    const home = site.home_url ? `<a href="${esc(site.home_url)}">← ${esc(site.home_label || 'Back to the main site')}</a><br><br>` : '';
    $('#footer').innerHTML = `${home}Stats from GameChanger${r.season.final ? '' : ', updated weekly during the season'}. Leaderboards use GameChanger's rankings, which only include players with at least one plate appearance (batting) or one inning pitched (pitching) per game their team has played.<br><br>Innings pitched (IP) shows completed innings only, as GameChanger currently exports it (e.g. 2⅔ innings shows as 2). ERA, WHIP and other pitching stats are calculated by GameChanger from the full innings, so they are correct.`;
  }

  function statusLine(season) {
    if (season.final) return `${esc(season.label)} · final stats`;
    if (season.updated) {
      const d = new Date(season.updated + 'T12:00:00');
      return `${esc(season.label)} · stats to ${d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }
    return esc(season.label);
  }

  function head(title, season) {
    return `<div class="page-head"><h1>${esc(title)}</h1><span class="status">${statusLine(season)}</span></div>`;
  }

  /* ---------- leaderboards ---------- */
  function leaderGroups(rows, key) {
    let q = rows.filter((r) => rankOf(r, key) !== null && num(r[key]) !== null);
    if (COUNTING.has(key)) q = q.filter((r) => num(r[key]) > 0);
    q.sort((a, b) => rankOf(a, key) - rankOf(b, key) || nameOf(a).localeCompare(nameOf(b)));
    const groups = [];
    for (const r of q) {
      const rk = rankOf(r, key), g = groups[groups.length - 1];
      if (g && g.rank === rk) g.rows.push(r); else groups.push({ rank: rk, rows: [r] });
    }
    return groups.filter((g) => g.rank <= TOP);
  }

  function leaderCard(r, rows, key) {
    const groups = leaderGroups(rows, key);
    const who = (p) => `<a href="${link(r.season.id, r.division, null, playerId(p))}">${esc(nameOf(p))}</a><span class="lb-team">${esc(p.Team)}</span>`;
    let items = '';
    for (const g of groups) {
      const tied = g.rows.length > 1;
      const rankTxt = (tied ? '=' : '') + g.rank;
      const cls = 'lb-row' + (g.rank === 1 ? ' first' : '');
      if (g.rows.length >= COLLAPSE_AT) {
        items += `<li class="${cls}"><span class="lb-rank">${rankTxt}</span><details><summary><span class="tied">${g.rows.length} players tied</span><span class="lb-val">${fmt(key, g.rows[0][key])}</span></summary><ul class="tie-list">${g.rows.map((p) => `<li>${who(p)}</li>`).join('')}</ul></details></li>`;
      } else {
        for (const p of g.rows) {
          items += `<li class="${cls}"><span class="lb-rank">${rankTxt}</span><span class="lb-who">${who(p)}</span><span class="lb-val">${fmt(key, p[key])}</span></li>`;
        }
      }
    }
    const body = items ? `<ol class="lb">${items}</ol>` : '<p class="lb-none">No qualifying players yet.</p>';
    return `<section class="card leader"><h2>${esc(NAMES[key])}<span class="abbr">${esc(key)}</span></h2>${body}</section>`;
  }

  function renderLeaders(r, rows) {
    const label = TABS.find((t) => t.id === r.tab).label;
    $('#main').innerHTML = head(`${r.division} ${label}`, r.season)
      + `<div class="leader-grid">${LEADERS[r.tab].map((k) => leaderCard(r, rows, k)).join('')}</div>`
      + (r.tab === 'pitching' ? '<p class="footnote">ERA, WHIP and BAA: lower is better.</p>' : '');
  }

  /* ---------- player stats table ---------- */
  function renderTable(r, rows) {
    const t = state.table;
    const teams = [...new Set(rows.map((x) => x.Team))].sort((a, b) => a.localeCompare(b));
    if (t.team && !teams.includes(t.team)) t.team = '';
    const allKeys = COL_GROUPS.flatMap((g) => g.keys);

    $('#main').innerHTML = head(`${r.division} Player Stats`, r.season) + `
      <div class="toolbar">
        <label class="sr-only" for="q">Search players</label>
        <input id="q" type="search" placeholder="Search player or team" value="${esc(t.query)}" autocomplete="off">
        <label class="sr-only" for="team">Team</label>
        <select id="team"><option value="">All teams</option>${teams.map((x) => `<option${x === t.team ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <button class="reset" id="reset" type="button" hidden>Group by team</button>
        <span class="count" id="count"></span>
      </div>
      <div class="table-scroll"><table class="stats">
        <thead>
          <tr class="groups"><th class="name" scope="col"></th><th></th>${COL_GROUPS.map((g) => `<th class="gs" colspan="${g.keys.length}" scope="colgroup">${g.label}</th>`).join('')}</tr>
          <tr>
            <th class="name" scope="col" data-key="Player"><button class="sort-btn" type="button">Player</button></th>
            <th class="jersey" scope="col">#</th>
            ${COL_GROUPS.map((g) => g.keys.map((k, i) => `<th scope="col" class="${i === 0 ? 'gs' : ''}" data-key="${k}"><button class="sort-btn" type="button" title="${esc(NAMES[k])}">${k}</button></th>`).join('')).join('')}
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table></div>`;

    const ncols = allKeys.length + 2;
    const rowHtml = (p) => `<tr><td class="name"><a href="${link(r.season.id, r.division, null, playerId(p))}">${esc(nameOf(p))}</a></td><td class="jersey">${esc(p['Jersey #'] || '')}</td>${COL_GROUPS.map((g) => g.keys.map((k, i) => {
      const v = fmt(k, p[k]);
      return `<td class="num${i === 0 ? ' gs' : ''}${v === '–' ? ' dim' : ''}">${v}</td>`;
    }).join('')).join('')}</tr>`;

    const update = () => {
      const q = t.query.trim().toLowerCase();
      let list = rows.filter((p) => (!t.team || p.Team === t.team) && (!q || `${nameOf(p)} ${p.Team} ${p['Jersey #']}`.toLowerCase().includes(q)));
      let html = '';
      if (t.sort) {
        const { key, dir } = t.sort;
        list = [...list].sort((a, b) => {
          if (key === 'Player') return dir * nameOf(a).localeCompare(nameOf(b));
          const x = num(a[key]), y = num(b[key]);
          if (x === null && y === null) return nameOf(a).localeCompare(nameOf(b));
          if (x === null) return 1;
          if (y === null) return -1;
          return dir * (x - y) || nameOf(a).localeCompare(nameOf(b));
        });
        html = list.map(rowHtml).join('');
      } else {
        const byTeam = new Map();
        for (const p of list) { if (!byTeam.has(p.Team)) byTeam.set(p.Team, []); byTeam.get(p.Team).push(p); }
        for (const team of [...byTeam.keys()].sort((a, b) => a.localeCompare(b))) {
          const ps = byTeam.get(team).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
          html += `<tr class="team-row"><th colspan="${ncols}" scope="colgroup"><span>${esc(team)}<small>${ps.length} player${ps.length === 1 ? '' : 's'}</small></span></th></tr>` + ps.map(rowHtml).join('');
        }
      }
      $('#tbody').innerHTML = html || `<tr><td class="name" colspan="${ncols}">No players match.</td></tr>`;
      $('#count').textContent = `${list.length} of ${rows.length} players`;
      $('#reset').hidden = !t.sort;
      document.querySelectorAll('.stats thead th[data-key]').forEach((th) => {
        if (t.sort && th.dataset.key === t.sort.key) th.setAttribute('aria-sort', t.sort.dir > 0 ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });
    };

    $('#q').addEventListener('input', (e) => { t.query = e.target.value; update(); });
    $('#team').addEventListener('change', (e) => { t.team = e.target.value; update(); });
    $('#reset').addEventListener('click', () => { t.sort = null; update(); });
    document.querySelectorAll('.stats thead th[data-key] .sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.parentElement.dataset.key;
        const first = key === 'Player' || LOWER_IS_BETTER.has(key) ? 1 : -1;
        t.sort = t.sort && t.sort.key === key ? { key, dir: -t.sort.dir } : { key, dir: first };
        update();
      });
    });
    update();
  }

  /* ---------- player page ---------- */
  function renderPlayer(r, rows) {
    const p = rows.find((x) => playerId(x) === r.player);
    const back = `<a class="back" href="${link(r.season.id, r.division, 'stats')}">← ${esc(r.division)} Player Stats</a>`;
    if (!p) {
      $('#main').innerHTML = back + '<p class="notice">That player isn’t in this season’s stats.</p>';
      return;
    }
    const rankCell = (k) => {
      if (UNRANKED.has(k)) return '<td class="r"></td>';
      const rk = rankOf(p, k);
      if (rk === null || num(p[k]) === null || (COUNTING.has(k) && num(p[k]) === 0)) return '<td class="r">–</td>';
      const tied = rows.filter((x) => rankOf(x, k) === rk).length > 1;
      return `<td class="r${rk <= 3 ? ' top' : ''}">${tied ? '=' : ''}${ordinal(rk)}</td>`;
    };
    const pitched = num(p.IP) > 0 || num(p.ERA) !== null;
    const fielded = num(p.FPCT) !== null || num(p.PO) > 0;
    const sections = PLAYER_SECTIONS.filter((s) => s.label === 'Batting' || (s.label === 'Pitching' && pitched) || (s.label === 'Fielding' && fielded));
    $('#main').innerHTML = back + `
      <div class="card player-head">
        <h1>${esc(nameOf(p))}</h1>${p['Jersey #'] ? `<span class="jersey-big">#${esc(p['Jersey #'])}</span>` : ''}
        <div class="meta">${esc(p.Team)} · ${esc(r.division)} · ${statusLine(r.season)}</div>
      </div>
      <div class="player-grid">${sections.map((s) => `
        <section class="card player-sec"><h2>${s.label}</h2>
          <table class="kv"><thead class="sr-only"><tr><th>Stat</th><th>Value</th><th>Rank in ${esc(r.division)}</th></tr></thead><tbody>
          ${s.keys.map((k) => `<tr><th scope="row">${esc(NAMES[k])}<abbr title="${esc(NAMES[k])}">${k}</abbr></th><td class="v">${fmt(k, p[k])}</td>${rankCell(k)}</tr>`).join('')}
          </tbody></table>
        </section>`).join('')}
      </div>
      <p class="footnote">Rank is within ${esc(r.division)} for ${esc(r.season.label.replace(' Season', ''))}; “=” means tied, “–” means not ranked.</p>`;
  }

  /* ---------- main ---------- */
  async function render() {
    const r = resolveRoute();
    renderChrome(r);
    const view = `${r.season.id}|${r.division}`;
    if (view !== state.lastView) { state.table = { sort: null, query: '', team: '' }; state.lastView = view; }
    const tabLabel = r.tab === 'player' ? 'Player' : TABS.find((t) => t.id === r.tab).label;
    document.title = `${r.division} ${tabLabel} · ${r.season.label} · ABA League Stats`;

    let rows;
    try {
      rows = (await loadSeason(r.season.id)).filter((x) => x.Division === r.division);
    } catch (e) {
      $('#main').innerHTML = '<p class="notice">Couldn’t load the stats. Please refresh the page.</p>';
      return;
    }
    if (!rows.length) {
      $('#main').innerHTML = head(`${r.division} ${tabLabel}`, r.season) + `<p class="notice">No ${esc(r.division)} stats for the ${esc(r.season.label.replace(' Season', ''))} season yet.</p>`;
      return;
    }
    if (r.tab === 'player') renderPlayer(r, rows);
    else if (r.tab === 'stats') renderTable(r, rows);
    else renderLeaders(r, rows);
    if (r.tab === 'player') window.scrollTo(0, 0);
  }

  async function init() {
    try {
      state.manifest = await getJSON('data/manifest.json');
    } catch (e) {
      $('#main').innerHTML = '<p class="notice">Couldn’t load the stats. Please refresh the page.</p>';
      return;
    }
    if (!state.manifest.seasons.length) {
      $('#main').innerHTML = '<p class="notice">No stats published yet.</p>';
      return;
    }
    window.addEventListener('hashchange', render);
    render();
  }

  init();
})();
