// Robot GitHub : télécharge les matchs des ligues européennes de basket (TheSportsDB)
// et les range dans data/europe.json, lu ensuite par l'appli PronoBasket.
import fs from 'node:fs';
const LIGUES = { el: 4546, ec: 4547, bcl: 4548, lnb: 4423, bbl: 4441, acb: 4408, lba: 4433 };
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
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(F, JSON.stringify(sortie));
