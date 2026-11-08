// Le fond animé : ciel, soleil/lune/étoiles, nuages, pluie, neige, brume, éclairs
(function () {
  const toile = document.getElementById('fond');
  const ctx = toile.getContext('2d');
  let L = 0, H = 0, dpr = 1;
  let amb = { ciel: 'NUAGEUX', intensite: 0, nuages: 0.6, vent: 10, versDroite: true, jour: true, bruine: false };
  let actif = true;

  function taille() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    L = innerWidth; H = innerHeight;
    toile.width = L * dpr; toile.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', taille); taille();

  // Particules créées une seule fois
  const hasard = (i) => { const v = Math.sin(i * 12.9898) * 43758.547; return v - Math.floor(v); };
  const part = (n, g, exp) => Array.from({ length: n }, (_, i) => ({
    x: hasard(i * 7 + g), y: hasard(i * 13 + g * 3), d: Math.pow(hasard(i * 17 + g * 5), exp),
    v: 0.85 + hasard(i * 19 + g) * 0.3, ph: hasard(i * 23 + g) * 6.28, f: 0.3 + hasard(i * 29 + g) * 0.6,
  }));
  const GOUTTES = part(520, 1, 1.6), FLOCONS = part(500, 2, 1.4), ETOILES = part(110, 3, 1);
  const NUAGES = Array.from({ length: 9 }, (_, i) => ({
    x: hasard(i * 3 + 40), y: -0.02 + hasard(i * 5 + 41) * 0.47, taille: 0.6 + hasard(i * 7 + 42) * 0.8,
    vit: 0.003 + hasard(i * 11 + 43) * 0.006,
    bosses: Array.from({ length: 6 }, (_, k) => ({ dx: (hasard(i * 31 + k) - .5) * .5, dy: (hasard(i * 37 + k) - .5) * .12, r: .1 + hasard(i * 41 + k) * .12 })),
  }));
  const frac = (v) => v - Math.floor(v);

  // Une tache floue préparée une fois (pour les nuages et la brume, léger à dessiner)
  const tache = document.createElement('canvas'); tache.width = tache.height = 128;
  (() => { const c = tache.getContext('2d'); const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); })();

  function couleursCiel(a) {
    if (a.jour) return ({ DEGAGE: ['#1C5BB8', '#79BEEF'], PARTIEL: ['#2E66AA', '#94BEE0'], NUAGEUX: ['#56687B', '#9AA9B8'],
      BROUILLARD: ['#6F7B87', '#A4ADB6'], PLUIE: ['#39475A', '#6A7A8B'], NEIGE: ['#66788B', '#AAB8C6'], ORAGE: ['#1C222D', '#434C5A'] })[a.ciel];
    if (a.ciel === 'DEGAGE' || a.ciel === 'PARTIEL') return ['#070B1E', '#213760'];
    if (a.ciel === 'NUAGEUX' || a.ciel === 'BROUILLARD') return ['#171C27', '#363F4E'];
    return ['#10141C', '#2A3341'];
  }

  function dessiner(ms) {
    if (!actif) { requestAnimationFrame(dessiner); return; }
    const t = ms / 1000, a = amb;
    const [haut, bas] = couleursCiel(a);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, haut); g.addColorStop(1, bas);
    ctx.fillStyle = g; ctx.fillRect(0, 0, L, H);
    const clair = a.ciel === 'DEGAGE' || a.ciel === 'PARTIEL';

    if (clair && a.jour) { // soleil
      const cx = L * .85, cy = H * .07, r = L * .75 * (1 + .03 * Math.sin(t * .6));
      const gs = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gs.addColorStop(0, 'rgba(255,246,213,.55)'); gs.addColorStop(.4, 'rgba(255,246,213,.18)'); gs.addColorStop(1, 'rgba(255,246,213,0)');
      ctx.fillStyle = gs; ctx.fillRect(0, 0, L, H);
    }
    if (clair && !a.jour) { // étoiles et lune
      ETOILES.forEach((e) => { ctx.globalAlpha = (.25 + .6 * e.d) * (.35 + .65 * (.5 + .5 * Math.sin(t * e.f * 2.5 + e.ph)));
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x * L, e.y * H * .7, .6 + 1.4 * e.d, 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1; ctx.fillStyle = '#F1F3F8'; ctx.beginPath(); ctx.arc(L * .78, H * .12, 22, 0, 7); ctx.fill();
    }
    // Nuages
    const nb = Math.min(NUAGES.length, Math.round(a.nuages * NUAGES.length));
    const [coul, op] = a.ciel === 'ORAGE' ? [[74, 81, 94], .75] : !a.jour ? [[125, 135, 152], .22] : a.ciel === 'PLUIE' ? [[154, 164, 176], .5]
      : a.ciel === 'NEIGE' ? [[213, 220, 228], .5] : (a.ciel === 'NUAGEUX' || a.ciel === 'BROUILLARD') ? [[221, 227, 234], .45] : [[255, 255, 255], .6];
    ctx.save(); ctx.globalAlpha = op;
    for (let i = 0; i < nb; i++) {
      const n = NUAGES[i], cx = (frac(n.x + t * n.vit * (1 + a.vent / 25)) * 1.8 - .4) * L, cy = n.y * H;
      n.bosses.forEach((b) => { const r = b.r * L * n.taille * 1.6;
        ctx.drawImage(tache, cx + b.dx * L * n.taille - r, cy + b.dy * L * n.taille - r, r * 2, r * 2); });
    }
    ctx.restore();
    // Teinte des nuages (on assombrit légèrement par-dessus)
    if (coul[0] < 200) { ctx.fillStyle = `rgba(${coul.join(',')},0.08)`; ctx.fillRect(0, 0, L, H * .5); }

    const pluie = a.ciel === 'PLUIE' || a.ciel === 'ORAGE', neige = a.ciel === 'NEIGE';
    const sens = a.versDroite ? 1 : -1;
    if (pluie) {
      const n = a.bruine ? 25 + 80 * a.intensite : 60 + 460 * a.intensite;
      const penche = Math.min(a.vent / 50, 1) * .45 * sens, lent = a.bruine ? .5 : 1, court = a.bruine ? .33 : 1, fin = a.bruine ? .6 : 1;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const p = GOUTTES[i], vit = (.9 + 1.7 * p.d) * p.v * lent, lg = H * (.022 + .06 * p.d) * court;
        const av = frac(p.y + t * vit), y = av * (H + lg * 2) - lg, x = frac(p.x + penche * av * H / L) * L;
        ctx.strokeStyle = `rgba(220,232,243,${(.1 + .4 * p.d) * fin})`; ctx.lineWidth = (.7 + 2.2 * p.d) * fin;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - penche * lg, y - lg); ctx.stroke();
      }
    }
    if (neige) {
      const ventF = Math.min(a.vent, 80) / 40, n = (50 + 270 * a.intensite) * (1 + Math.min(a.vent, 70) / 55);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < Math.min(n, FLOCONS.length); i++) {
        const f = FLOCONS[i], r = 1.1 + 4.5 * f.d, chute = (.025 + .075 * f.d) * f.v * (1 + .6 * ventF);
        const tour = 1 + ventF * 1.5;
        const y = frac(f.y + t * chute + Math.sin(t * f.f * 1.7 + f.ph) * .006 * tour) * (H + r * 4) - r * 2;
        const x = frac(f.x + Math.sin(t * f.f + f.ph) * (.008 + .02 * f.d) * tour + sens * ventF * (.1 + .45 * f.d) * f.v * t) * L;
        ctx.globalAlpha = .45 + .5 * f.d; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (a.ciel === 'BROUILLARD' || pluie || neige) { // brume
      const force = a.ciel === 'BROUILLARD' ? 1 : .35;
      const gb = ctx.createLinearGradient(0, 0, 0, H); gb.addColorStop(0, 'rgba(232,236,240,0)');
      gb.addColorStop(.6, `rgba(232,236,240,${.2 * force})`); gb.addColorStop(1, `rgba(232,236,240,${.35 * force})`);
      ctx.fillStyle = gb; ctx.fillRect(0, 0, L, H);
    }
    if (a.ciel === 'ORAGE') { // éclair de temps en temps
      const k = Math.floor(t / 7), loc = t - (k * 7 + hasard(k + 500) * 5);
      if (loc > 0 && loc < .6 && hasard(k + 99) > .25) {
        const f = loc < .12 ? 1 - loc / .12 : (loc > .2 && loc < .55 ? .7 * (1 - (loc - .2) / .35) : 0);
        ctx.fillStyle = `rgba(230,236,255,${.38 * f})`; ctx.fillRect(0, 0, L, H);
      }
    }
    requestAnimationFrame(dessiner);
  }
  requestAnimationFrame(dessiner);
  document.addEventListener('visibilitychange', () => { actif = !document.hidden; });

  window.Fond = {
    regler(a) { amb = Object.assign({}, amb, a); },
    afficher(oui) { toile.style.display = oui ? 'block' : 'none'; },
  };
})();
