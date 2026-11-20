// Robot GitHub : télécharge les matchs des ligues européennes de basket (TheSportsDB)
// et les range dans data/europe.json, lu ensuite par l'appli PronoBasket.
import fs from 'node:fs';
const LIGUES = { el: 4546, ec: 4547, bcl: 4548, fec: 5607, lnb: 4423, bbl: 4441, acb: 4408, lba: 4433 };
const F = 'data/europe.json';
let ancien = {}; try { ancien = JSON.parse(fs.readFileSync(F, 'utf8')); } catch (e) { }
const pause = ms => new Promise(r => setTimeout(r, ms));
let dernier = 0;
async function J(u) {
  for (let k = 0; k < 4; k++) {
    const w = dernier + 6500 - Date.now(); if (w > 0) await pause(w);
    dernier = Date.now();
    try { const r = await fetch('https://www.thesportsdb.com/api/v1/json/123/' + u); if (r.ok) return await r.json(); console.log('HTTP', r.status, u); }
    catch (e) { console.log('erreur', u, e.message); }
    await pause(65000);
  }
  throw new Error('abandon ' + u);
}
function garder(lg, evs) {
  let joues = 0;
  evs.forEach(e => {
    const ok = e.intHomeScore != null && e.intHomeScore !== '' && e.intAwayScore != null && e.intAwayScore !== '';
    if (ok) joues++;
    const iso = e.strTimestamp ? (/Z|\+/.test(e.strTimestamp) ? e.strTimestamp : e.strTimestamp + 'Z') : e.dateEvent + 'T' + (e.strTime || '18:00:00') + 'Z';
    lg.e[e.idEvent] = [iso, ok ? 'post' : 'pre', e.strHomeTeam, e.strAwayTeam, ok ? +e.intHomeScore : null, ok ? +e.intAwayScore : null, [], [], '', null];
  });
  return joues;
}
const sortie = { t: Date.now(), l: {} };
for (const [c, id] of Object.entries(LIGUES)) {
  const lg = (ancien.l && ancien.l[c]) || { r: {}, e: {} };
  try {
    let ev = ((await J('eventspastleague.php?id=' + id)).events || []).slice(-1)[0];
    if (!ev) ev = ((await J('eventsnextleague.php?id=' + id)).events || [])[0];
    if (ev) {
      if (ev.strSeason && ev.strSeason !== lg.s) { lg.s = ev.strSeason; lg.r = {}; lg.e = {}; }
      const cur = +ev.intRound || 1; lg.cur = cur;
      for (let r = 1; r <= cur + 2; r++) {
        if (lg.r[r] === 2) continue;
        const evs = (await J(`eventsround.php?id=${id}&r=${r}&s=${encodeURIComponent(lg.s)}`)).events || [];
        const joues = garder(lg, evs);
        lg.r[r] = evs.length && joues === evs.length ? 2 : evs.length ? 1 : 0;
      }
      lg.t = Date.now();
    }
    console.log(c, lg.s, 'journée', lg.cur, Object.keys(lg.e).length, 'matchs');
  } catch (e) { console.log('échec', c, e.message); }
  sortie.l[c] = lg;
}
/* ---------- Joueurs (moyennes par match) ---------- */
// EuroLeague (E) et EuroCup (U) : statistiques officielles. G League et NBL : moyennes calculées à partir des feuilles de match ESPN.
const nomPropre = n => { const [a, b] = n.split(', '); const cap = x => (x || '').toLowerCase().replace(/(^|[\s'-])\p{L}/gu, m => m.toUpperCase()); return b ? cap(b) + ' ' + cap(a) : cap(a); };
const r1 = v => Math.round(v * 10) / 10;
sortie.j = {}; sortie.acc = ancien.acc || {};
const maintenant = new Date(), annee = maintenant.getUTCMonth() >= 6 ? maintenant.getUTCFullYear() : maintenant.getUTCFullYear() - 1;
for (const [c, comp] of [['el', 'E'], ['ec', 'U']]) {
  try {
    const r = await fetch(`https://api-live.euroleague.net/v3/competitions/${comp}/statistics/players/traditional?seasonMode=Single&seasonCode=${comp}${annee}&statisticMode=perGame&limit=1000`);
    const j = await r.json();
    sortie.j[c] = (j.players || []).filter(x => x.gamesPlayed >= 1 && x.minutesPlayed >= 8).map(x => ({
      n: nomPropre(x.player.name), e: x.player.team.name, mj: x.gamesPlayed, min: r1(x.minutesPlayed), pts: r1(x.pointsScored), reb: r1(x.totalRebounds), ast: r1(x.assists) }));
    console.log('joueurs', c, sortie.j[c].length);
  } catch (e) { console.log('échec joueurs', c, e.message); if (ancien.j && ancien.j[c]) sortie.j[c] = ancien.j[c]; }
}
for (const [c, slug, debut] of [['gl', 'nba-development', 11], ['nbl', 'nbl', 9]]) {
  try {
    let y = maintenant.getUTCFullYear(); if (maintenant.getUTCMonth() + 1 < debut) y--;
    let acc = sortie.acc[c]; if (!acc || acc.y !== y) acc = sortie.acc[c] = { y, fait: [], p: {} };
    const evs = [];
    for (let d = new Date(Date.UTC(y, debut - 1, 1)); d <= maintenant; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const mo = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0');
      const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/${slug}/scoreboard?dates=${mo}&limit=1000`)).json();
      (j.events || []).forEach(ev => { if (ev.status.type.state === 'post' && !(ev.season && ev.season.type === 1)) evs.push(ev); });
    }
    evs.sort((a, b) => a.date.localeCompare(b.date));
    for (const ev of evs) {
      if (acc.fait.includes(ev.id)) continue;
      const s = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/${slug}/summary?event=${ev.id}`)).json();
      ((s.boxscore || {}).players || []).forEach(t => {
        const st = (t.statistics || [])[0]; if (!st) return;
        const ix = k => st.labels.indexOf(k);
        (st.athletes || []).forEach(a => {
          if (a.didNotPlay || !a.stats || !a.stats.length) return;
          const min = +a.stats[ix('MIN')] || 0; if (!min) return;
          const id = a.athlete.id, P = acc.p[id] = acc.p[id] || { n: a.athlete.displayName, mj: 0, min: 0, pts: 0, reb: 0, ast: 0 };
          P.e = t.team.shortDisplayName || t.team.displayName; P.mj++; P.min += min;
          P.pts += +a.stats[ix('PTS')] || 0; P.reb += +a.stats[ix('REB')] || 0; P.ast += +a.stats[ix('AST')] || 0;
        });
      });
      acc.fait.push(ev.id);
      await pause(300);
    }
    sortie.j[c] = Object.values(acc.p).filter(P => P.mj >= 1 && P.min / P.mj >= 8).map(P => ({
      n: P.n, e: P.e, mj: P.mj, min: r1(P.min / P.mj), pts: r1(P.pts / P.mj), reb: r1(P.reb / P.mj), ast: r1(P.ast / P.mj) }));
    console.log('joueurs', c, sortie.j[c].length, 'matchs lus', acc.fait.length);
  } catch (e) { console.log('échec joueurs', c, e.message); if (ancien.j && ancien.j[c]) sortie.j[c] = ancien.j[c]; }
}

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(F, JSON.stringify(sortie));
