/* PronoBasket – paris d'équipe (vainqueur, total de points, quart-temps) pour toutes les ligues.
   Sources : ESPN (NBA, G League, NBL) et TheSportsDB (ligues européennes). */
(function () {
  'use strict';
  const LIGUES = [
    { c: 'nba', nom: 'NBA', src: 'espn', slug: 'nba', debut: 10, h: 2.5 },
    { c: 'el', nom: 'EuroLeague', src: 'tsdb', id: 4546, h: 3 },
    { c: 'ec', nom: 'EuroCup', src: 'tsdb', id: 4547, h: 3 },
    { c: 'bcl', nom: 'Champions League (basket)', src: 'tsdb', id: 4548, h: 3 },
    { c: 'lnb', nom: 'Betclic Élite (France)', src: 'tsdb', id: 4423, h: 3 },
    { c: 'acb', nom: 'Liga ACB (Espagne)', src: 'tsdb', id: 4408, h: 3 },
    { c: 'lba', nom: 'Lega Basket (Italie)', src: 'tsdb', id: 4433, h: 3 },
    { c: 'gl', nom: 'G League', src: 'espn', slug: 'nba-development', debut: 11, h: 2.5 },
    { c: 'nbl', nom: 'NBL (Australie)', src: 'espn', slug: 'nbl', debut: 9, h: 2.5 }
  ];
  const CLE = 'pb_equipes_v1';
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { return {}; } };
  const ecrire = st => { try { localStorage.setItem(CLE, JSON.stringify(st)); } catch (e) { } };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const getJ = async u => { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json(); };
  const ym = d => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0');

  /* ---------- Téléchargement ---------- */
  // Match stocké : [dateISO, état 'pre'|'in'|'post', dom, ext, ptsDom, ptsExt, quartsDom[], quartsExt[], détail, idEspn]
  async function espn(L, st) {
    const lg = st[L.c] = st[L.c] || { m: {}, e: {} };
    const now = new Date(), mois = [];
    let y = now.getUTCFullYear(); if (now.getUTCMonth() + 1 < L.debut) y--;
    for (let d = new Date(Date.UTC(y, L.debut - 1, 1)); d <= now; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) mois.push(ym(d));
    const fin = new Date(now.getTime() + 2 * 864e5); if (ym(fin) !== ym(now)) mois.push(ym(fin));
    const courant = ym(now);
    for (const mo of mois) {
      if (lg.m[mo]) continue;
      const j = await getJ(`https://site.api.espn.com/apis/site/v2/sports/basketball/${L.slug}/scoreboard?dates=${mo}&limit=1000`);
      (j.events || []).forEach(ev => {
        if (ev.season && ev.season.type === 1) return;   // présaison
        const c = ev.competitions[0], h = c.competitors.find(x => x.homeAway === 'home'), a = c.competitors.find(x => x.homeAway === 'away');
        if (!h || !a) return;
        const t = ev.status.type, q = x => (x.linescores || []).map(l => +l.value || 0);
        lg.e[ev.id] = [ev.date, t.state, h.team.shortDisplayName || h.team.displayName, a.team.shortDisplayName || a.team.displayName,
          h.score === '' || h.score == null ? null : +h.score, a.score === '' || a.score == null ? null : +a.score, q(h), q(a), t.shortDetail, ev.id];
      });
      if (mo < courant) lg.m[mo] = 1;
    }
  }
  async function tsdb(L, st, prog) {
    const lg = st[L.c] = st[L.c] || { r: {}, e: {} };
    if (!lg.s || lg.v !== 2 || Date.now() - (lg.ts || 0) > 864e5) {
      // La saison officielle de TheSportsDB est parfois fausse (EuroCup « 2026 » au lieu de « 2026-2027 ») :
      // on prend celle des derniers matchs joués, sinon celle des prochains, sinon la saison officielle.
      const saison = async u => { try { const e = (await getJ(u)).events || []; return e.length ? e[e.length - 1].strSeason : null; } catch (x) { return null; } };
      let s = await saison(`https://www.thesportsdb.com/api/v1/json/123/eventspastleague.php?id=${L.id}`);
      if (!s) { await pause(2500); s = await saison(`https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=${L.id}`); }
      if (!s) { await pause(2500); const j = await getJ(`https://www.thesportsdb.com/api/v1/json/123/lookupleague.php?id=${L.id}`); s = ((j.leagues || [])[0] || {}).strCurrentSeason; }
      if (s && s !== lg.s) { lg.s = s; lg.r = {}; lg.e = {}; }
      lg.ts = Date.now(); lg.v = 2; await pause(2500);
    }
    for (let r = 1; r <= 60; r++) {
      if (lg.r[r] === 2) continue;   // journée terminée, déjà gardée
      let j = null;
      for (let essai = 0; essai < 3 && !j; essai++) {
        try { j = await getJ(`https://www.thesportsdb.com/api/v1/json/123/eventsround.php?id=${L.id}&r=${r}&s=${encodeURIComponent(lg.s)}`); }
        catch (e) { await pause(20000); }
      }
      if (!j) throw new Error('tsdb');
      prog && prog();
      await pause(2500);
      const evs = j.events || [];
      if (!evs.length) { if (r > 3 && !Object.keys(lg.r).some(k => +k > r)) break; continue; }
      let joues = 0;
      evs.forEach(e => {
        const ok = e.intHomeScore != null && e.intHomeScore !== '' && e.intAwayScore != null && e.intAwayScore !== '';
        if (ok) joues++;
        const iso = e.strTimestamp ? (/Z|\+/.test(e.strTimestamp) ? e.strTimestamp : e.strTimestamp + 'Z') : e.dateEvent + 'T' + (e.strTime || '18:00:00') + 'Z';
        lg.e[e.idEvent] = [iso, ok ? 'post' : 'pre', e.strHomeTeam, e.strAwayTeam, ok ? +e.intHomeScore : null, ok ? +e.intAwayScore : null, [], [], '', null];
      });
      lg.r[r] = joues === evs.length ? 2 : 1;
      if (!joues) break;   // première journée encore à jouer : c'est la prochaine, on s'arrête
    }
  }

  let ETAT = lire(), occupe = false, avance = { fait: 0 };
  async function telecharger(force, quand) {
    if (occupe) return; occupe = true;
    try {
      // ESPN d'abord (rapide), puis TheSportsDB (lent : limite de requêtes)
      for (const L of LIGUES.filter(l => l.src === 'espn')) {
        if (!force && ETAT['t_' + L.c] && Date.now() - ETAT['t_' + L.c] < 10 * 60e3) continue;
        try { await espn(L, ETAT); ETAT['t_' + L.c] = Date.now(); ecrire(ETAT); quand && quand(); } catch (e) { }
      }
      for (const L of LIGUES.filter(l => l.src === 'tsdb')) {
        if (!force && ETAT['t_' + L.c] && (ETAT[L.c] || {}).v === 2 && Date.now() - ETAT['t_' + L.c] < 3 * 3600e3) continue;
        try { await tsdb(L, ETAT, () => { avance.fait++; }); ETAT['t_' + L.c] = Date.now(); ecrire(ETAT); quand && quand(); } catch (e) { }
      }
    } finally { occupe = false; }
  }

  /* ---------- Modèle ---------- */
  function phi(x) { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; }
  const MODELES = {};
  function modele(L) {
    const lg = ETAT[L.c]; if (!lg) return null;
    const tous = Object.values(lg.e);
    const fin = tous.filter(x => x[1] === 'post' && x[4] != null && x[5] != null && x[4] + x[5] > 40);
    const cle = fin.length + '|' + tous.length;
    if (MODELES[L.c] && MODELES[L.c].cle === cle) return MODELES[L.c];
    const eq = {};
    const E = n => eq[n] = eq[n] || { off: 0, def: 0, n: 0 };
    let tot = 0; fin.forEach(x => { tot += x[4] + x[5]; E(x[2]).n++; E(x[3]).n++; });
    const Lm = fin.length ? tot / (2 * fin.length) : 80;
    const n = fin.length;
    let H = n ? fin.reduce((s, x) => s + x[4] - x[5], 0) / n : L.h;
    H = (H * n + L.h * 30) / (n + 30);
    const K = 3;
    for (let it = 0; it < 12; it++) {
      const so = {}, sd = {};
      fin.forEach(x => {
        const d = E(x[2]), e = E(x[3]);
        so[x[2]] = (so[x[2]] || 0) + x[4] - (Lm + e.def + H / 2); sd[x[2]] = (sd[x[2]] || 0) + x[5] - (Lm + e.off - H / 2);
        so[x[3]] = (so[x[3]] || 0) + x[5] - (Lm + d.def - H / 2); sd[x[3]] = (sd[x[3]] || 0) + x[4] - (Lm + d.off + H / 2);
      });
      Object.keys(eq).forEach(k => { eq[k].off = (so[k] || 0) / (eq[k].n + K); eq[k].def = (sd[k] || 0) / (eq[k].n + K); });
    }
    let sm = 0, sT = 0;
    fin.forEach(x => {
      const d = eq[x[2]], e = eq[x[3]], mD = Lm + d.off + e.def + H / 2, mE = Lm + e.off + d.def - H / 2;
      sm += Math.pow((x[4] - x[5]) - (mD - mE), 2); sT += Math.pow((x[4] + x[5]) - (mD + mE), 2);
    });
    let sigM = n >= 25 ? Math.sqrt(sm / n) * 1.15 : 0.11 * Lm, sigT = n >= 25 ? Math.sqrt(sT / n) * 1.15 : 0.15 * Lm;
    sigM = Math.max(sigM, 0.1 * Lm); sigT = Math.max(sigT, 0.13 * Lm);
    // part de chaque quart-temps (temps réglementaire) quand la source les donne
    const qq = [0, 0, 0, 0]; let nq = 0;
    fin.forEach(x => { if (x[6].length >= 4 && x[7].length >= 4) { for (let i = 0; i < 4; i++) qq[i] += x[6][i] + x[7][i]; nq++; } });
    const sq = qq.reduce((a, b) => a + b, 0);
    const parts = nq >= 10 && sq ? qq.map(v => v / sq) : [0.25, 0.25, 0.25, 0.25];
    return MODELES[L.c] = { cle, eq, Lm, H, sigM, sigT, parts, n };
  }
  const demi = v => Math.floor(v) + 0.5;   // ligne en .5 juste sous v
  function prono(L, x) {
    const M = modele(L); if (!M) return null;
    const d = M.eq[x[2]], e = M.eq[x[3]];
    if (!d || !e || d.n < 2 || e.n < 2) return null;
    const mD = M.Lm + d.off + e.def + M.H / 2, mE = M.Lm + e.off + d.def - M.H / 2, mm = mD - mE, mT = mD + mE;
    const pD = phi(mm / M.sigM);
    const plus = (mu, sig, l) => 1 - phi((l - mu) / sig);
    const base = demi(mT);
    const totaux = [-15, -10, -5, 0, 5, 10].map(o => ({ l: base + o, p: plus(mT, M.sigT, base + o) }));
    const fav = mm >= 0 ? 'D' : 'E', am = Math.abs(mm);
    const ecarts = [5.5, 10.5, 15.5].map(k => ({ k, p: plus(am, M.sigM, k) }));
    const eqT = (mu) => [-5, 0, 5].map(o => ({ l: demi(mu) + o, p: plus(mu, M.sigT * 0.62, demi(mu) + o) }));
    const quarts = M.parts.map((s, i) => {
      const qd = mD * s, qe = mE * s, sm = M.sigM * 0.5, sT = M.sigT * 0.5, l = demi(qd + qe);
      return { i: i + 1, qd, qe, pD: phi((qd - qe) / sm), l, pPlus: plus(qd + qe, sT, l) };
    });
    const mt = [0, 1].map(h => {   // mi-temps
      const s = M.parts[2 * h] + M.parts[2 * h + 1], qd = mD * s, qe = mE * s, l = demi(qd + qe);
      return { i: h + 1, qd, qe, pD: phi((qd - qe) / (M.sigM * 0.7)), l, pPlus: plus(qd + qe, M.sigT * 0.7, l) };
    });
    // ligne « sûre » du total : ~80 % de chances
    const lSur = demi(mT - 0.84 * M.sigT), pSur = plus(mT, M.sigT, lSur);
    return { mD, mE, mm, mT, pD, pE: 1 - pD, totaux, fav, ecarts, totD: eqT(mD), totE: eqT(mE), quarts, mt, lSur, pSur,
      faible: Math.min(d.n, e.n) < 5, nMin: Math.min(d.n, e.n) };
  }

  /* Matchs d'une fenêtre (jour j : 08:00 heure locale → 08:00 le lendemain) avec leurs pronos */
  function matchs(j) {
    const t0 = new Date(); if (t0.getHours() < 8) t0.setDate(t0.getDate() - 1); t0.setHours(8, 0, 0, 0);
    const a = t0.getTime() + j * 864e5, b = a + 864e5, out = [];
    LIGUES.forEach(L => {
      const lg = ETAT[L.c]; if (!lg) return;
      Object.keys(lg.e).forEach(id => {
        const x = lg.e[id], t = new Date(x[0]).getTime();
        if (t < a || t >= b) return;
        out.push({ id: L.c + ':' + id, lig: L, x, date: x[0], etat: x[1], dom: x[2], ext: x[3], sd: x[4], se: x[5], detail: x[8], espnId: x[9], p: prono(L, x) });
      });
    });
    return out.sort((u, v) => u.date.localeCompare(v.date));
  }
  window.EQ = { LIGUES, telecharger, matchs, phi, occupe: () => occupe, charge: () => LIGUES.filter(L => ETAT[L.c] && ETAT['t_' + L.c]).length };
})();
