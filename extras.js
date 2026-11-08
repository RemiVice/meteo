// Les extras : alertes, extérieur (sol mouillé), Lune, marées, radar, caméras, collecte
(function () {
  'use strict';
  const A = window.App;
  const r = () => A.reglages;
  const distanceKm = (a1, o1, a2, o2) => { const p = Math.PI / 180, a = Math.sin((a2 - a1) * p / 2) ** 2 + Math.cos(a1 * p) * Math.cos(a2 * p) * Math.sin((o2 - o1) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(a)); };
  const extra = { alertes: [], sol: null, marees: null, collectes: null, cameras: null };

  // ======================= Alertes d'Environnement Canada =======================
  function dansZone(x, y, geo) {
    const anneau = (a) => { let d = false; for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i], [xj, yj] = a[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; };
    if (geo.type === 'Polygon') return anneau(geo.coordinates[0]);
    if (geo.type === 'MultiPolygon') return geo.coordinates.some((p) => anneau(p[0]));
    return true;
  }
  async function chargerAlertes(v) {
    const b = 0.05, u = `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&lang=fr&limit=50&bbox=${v.lon - b},${v.lat - b},${v.lon + b},${v.lat + b}`;
    const d = await fetch(u).then((x) => x.json()), vus = {}, l = [];
    (d.features || []).forEach((f) => {
      const p = f.properties; if (p.status_en === 'ended') return;
      if (p.expiration_datetime && new Date(p.expiration_datetime) < new Date()) return;
      if (f.geometry && !dansZone(v.lon, v.lat, f.geometry)) return;
      const nom = A.maj(p.alert_name_fr || ''); if (vus[nom]) return; vus[nom] = 1;
      l.push({ nom, couleur: (p.risk_colour_fr || '').toLowerCase(), texte: p.alert_text_fr || '', fin: p.event_end_datetime });
    });
    return l;
  }
  A.alertesHtml = () => extra.alertes.map((a, i) => {
    const c = a.couleur === 'rouge' ? '#C62828' : a.couleur === 'orange' ? '#EF6C00' : a.couleur === 'jaune' ? '#F9A825' : '#546E7A';
    const fin = a.fin ? new Date(a.fin) : null;
    return `<details class="alerte" style="background:${c}"><summary>⚠️ ${a.nom}${fin ? `<small>Jusqu'au ${fin.getDate()}/${fin.getMonth() + 1} à ${fin.getHours()} h</small>` : ''}<small>Touche pour lire les détails</small></summary><p>${a.texte.replace(/\n/g, '<br>')}</p></details>`;
  }).join('');

  // ======================= Extérieur et sol mouillé =======================
  async function chargerSol(v) {
    const o = (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}&hourly=precipitation,et0_fao_evapotranspiration,temperature_2m,snow_depth&past_days=2&forecast_days=2&timezone=auto`).then((x) => x.json())).hourly;
    const maint = new Date(); maint.setMinutes(0, 0, 0);
    let f = 0, na = 0, etat = null, sec = null;
    for (let i = 0; i < o.time.length; i++) {
      const m = A.dateDe(o.time[i]), p = o.precipitation[i] || 0, e = o.et0_fao_evapotranspiration[i] || 0, t = o.temperature_2m[i], n = o.snow_depth[i] || 0;
      if (t > 0.5) f += p; if (t > 0.5 && n < na) f += (na - n) * 100; na = n;
      f = Math.min(1.5, Math.max(0, f * 0.88 - e * 1.3));
      if (!etat && m >= maint) {
        etat = n >= .01 ? ['❄️ Enneigé', `Neige au sol (environ ${Math.round(n * 100)} cm).`] : (f >= .05 && t <= .5) ? ['🧊 Glissant', 'Sol mouillé et froid : attention à la glace noire.']
          : f >= .6 ? ['🔵 Mouillé', 'Flaques possibles.'] : f >= .1 ? ['🟡 Humide', 'Il a mouillé, ça sèche.'] : ['🟢 Sec', ''];
        if (f < .1 || n >= .01) break;
      } else if (etat && f < .1) { sec = m; break; }
    }
    if (etat && sec) etat[1] += ` Sec vers ${A.memeJour(sec, new Date()) ? '' : 'demain '}${sec.getHours()} h.`;
    return etat;
  }
  A.rendusCartes.exterieur = function (m) {
    const a = m.actuelle, mois = a.moment.getMonth() + 1;
    const moust = (mois < 5 || mois > 9 || a.temp < 10) ? 'Pas en saison' : (a.temp >= 18 && a.humidite >= 60 && a.vent < 15) ? 'Élevé' : a.temp >= 14 ? 'Modéré' : 'Faible';
    const neige = m.heures.reduce((s, h) => s + h.neige, 0);
    const deneige = neige < 2 ? "Rien à déneiger d'ici 24 h" : 'Prévoir de déneiger : ' + A.neigeArr(neige);
    const verglas = m.heures.find((h) => [56, 57, 66, 67].includes(h.code));
    const uvT = (u) => u < 3 ? 'Faible' : u < 6 ? 'Modéré' : u < 8 ? 'Élevé' : u < 11 ? 'Très élevé' : 'Extrême';
    const airT = (q) => q <= 50 ? 'Bonne' : q <= 100 ? 'Acceptable' : q <= 150 ? 'Mauvaise (sensibles)' : 'Mauvaise';
    const l = [];
    if (m.uv != null) l.push(['☀️ Indice UV', Math.round(m.uv) + ' · ' + uvT(m.uv)]);
    if (m.iqa != null) l.push(["🍃 Qualité de l'air", airT(m.iqa)]);
    l.push(['🦟 Moustiques', moust], ['❄️ Déneigement', deneige]);
    if (verglas) l.push(['🧊 Verglas', 'Risque à partir de ' + verglas.moment.getHours() + ' h']);
    if (extra.sol) l.push(['👟 Sol (estimé)', extra.sol[0] + (extra.sol[1] ? `<small>${extra.sol[1]}</small>` : '')]);
    return A.carte('Extérieur', l.map(([t, v]) => `<div class="ext"><span>${t}</span><b>${v}</b></div>`).join(''));
  };

  // ======================= La Lune =======================
  const CYCLE = 29.530588853, REF = 2451550.26;
  const fraction = (d) => { const jj = d.getTime() / 86400000 + 2440587.5; let a = (jj - REF) % CYCLE; if (a < 0) a += CYCLE; return a / CYCLE; };
  const eclairage = (f) => Math.round((1 - Math.cos(2 * Math.PI * f)) / 2 * 100);
  const nomPhase = (f) => f < .03 || f >= .97 ? 'Nouvelle lune' : f < .22 ? 'Premier croissant' : f < .28 ? 'Premier quartier' : f < .47 ? 'Gibbeuse croissante'
    : f < .53 ? 'Pleine lune' : f < .72 ? 'Gibbeuse décroissante' : f < .78 ? 'Dernier quartier' : 'Dernier croissant';
  const prochaine = (cible, depuis) => { const f = fraction(depuis); let rr = (cible - f + 1) % 1; if (rr < .02) rr += 1; return new Date(depuis.getTime() + rr * CYCLE * 86400000); };
  const NOMS_PLEINES = ['Lune du loup', 'Lune de neige', 'Lune des vers', 'Lune rose', 'Lune des fleurs', 'Lune des fraises', 'Lune du cerf', "Lune de l'esturgeon", 'Lune des récoltes', 'Lune du chasseur', 'Lune du castor', 'Lune froide'];
  function svgLune(f, taille) {
    const k = Math.cos(2 * Math.PI * f), cote = f < .5 ? 1 : -1, n = 32;
    let d = '';
    for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; d += (i ? 'L' : 'M') + (50 + cote * 46 * Math.sin(a)).toFixed(1) + ' ' + (50 - 46 * Math.cos(a)).toFixed(1); }
    for (let i = n; i >= 0; i--) { const a = Math.PI * i / n; d += 'L' + (50 + cote * k * 46 * Math.sin(a)).toFixed(1) + ' ' + (50 - 46 * Math.cos(a)).toFixed(1); }
    return `<svg width="${taille}" height="${taille}" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#3A4150"/><path d="${d}Z" fill="#F1F3F8"/></svg>`;
  }
  const dateLune = (d) => A.JOURS[d.getDay()] + ' ' + A.dateLongue(d);
  A.rendusCartes.lune = function () {
    const f = fraction(new Date());
    return A.carte('La Lune', `<div class="lune" data-action="lune">${svgLune(f, 64)}<div><b>${nomPhase(f)}</b><small>Éclairée à ${eclairage(f)} %</small>` +
      `<small>🌕 Pleine lune : ${dateLune(prochaine(.5, new Date()))}</small><small>🌑 Nouvelle lune : ${dateLune(prochaine(0, new Date()))}</small></div></div>`, 'lune');
  };
  A.actions.lune = function () {
    let mois = new Date(); mois.setDate(1);
    const e = A.ouvrirEcran('Calendrier de la Lune', '');
    const evenement = (d) => { const a = new Date(d); a.setHours(0); const b = new Date(d); b.setHours(23); const fa = fraction(a), fb = fraction(b);
      return fb < fa ? 'Nouv.' : (fa < .25 && fb >= .25) ? '1er q.' : (fa < .5 && fb >= .5) ? 'Pleine' : (fa < .75 && fb >= .75) ? 'Dern. q.' : ''; };
    const dessiner = () => {
      const an = mois.getFullYear(), mo = mois.getMonth(), nbj = new Date(an, mo + 1, 0).getDate(), dec = new Date(an, mo, 1).getDay(), auj = new Date();
      let g = '<div class="cal">' + ['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((x) => `<b>${x}</b>`).join('');
      for (let i = 0; i < dec; i++) g += '<span></span>';
      for (let j = 1; j <= nbj; j++) {
        const d = new Date(an, mo, j, 12), ev = evenement(d);
        g += `<span class="${ev === 'Pleine' ? 'pleine' : ev === 'Nouv.' ? 'nouv' : ''} ${A.memeJour(d, auj) ? 'auj' : ''}">${j}${svgLune(fraction(d), 24)}<i>${ev}</i></span>`;
      }
      g += '</div>';
      let liste = '', d = new Date();
      for (let i = 0; i < 6; i++) { const p = prochaine(.5, d); liste += `<div class="item-ville">${svgLune(.5, 26)}<div><b>${dateLune(p)} ${p.getFullYear()}</b><small>${NOMS_PLEINES[p.getMonth()]}</small></div></div>`; d = new Date(p.getTime() + 2 * 86400000); }
      e.querySelector('.corps').innerHTML = `<div class="mois"><button data-m="-1">‹</button><b>${A.maj(A.MOIS[mo])} ${an}</b><button data-m="1">›</button></div>${g}` +
        `<section class="carte"><h2>Prochaines pleines lunes</h2>${liste}<p class="note">Dates calculées (précision d'environ une demi-journée).</p></section>`;
      e.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { mois = new Date(an, mo + +b.dataset.m, 1); dessiner(); });
    };
    dessiner();
  };

  // ======================= Marées (Pêches et Océans Canada) =======================
  const API_MAREES = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';
  async function chargerMarees(v) {
    const cle = 'station-' + v.lat.toFixed(2) + ',' + v.lon.toFixed(2);
    let st = A.lireMem(cle, null);
    if (!st) {
      const stations = await fetch(API_MAREES + '/stations').then((x) => x.json());
      let best = null;
      stations.forEach((s) => { if (!(s.timeSeries || []).some((t) => t.code === 'wlp-hilo')) return;
        const dk = distanceKm(v.lat, v.lon, s.latitude, s.longitude); if (dk <= 60 && (!best || dk < best.km)) best = { id: s.id, nom: s.officialName, km: dk }; });
      st = best || { aucune: true }; A.ecrireMem(cle, st);
    }
    if (st.aucune) return null;
    const de = new Date(Date.now() - 86400000).toISOString().slice(0, 13) + ':00:00Z', a = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 13) + ':00:00Z';
    const d = await fetch(`${API_MAREES}/stations/${st.id}/data?time-series-code=wlp-hilo&from=${de}&to=${a}`).then((x) => x.json());
    const b = d.map((o) => ({ t: new Date(o.eventDate), h: o.value })).sort((x, y) => x.t - y.t);
    b.forEach((e, i) => { e.haute = e.h > (i ? b[i - 1].h : b[i + 1].h); });
    return { station: st, liste: b };
  }
  const hauteurA = (M, t) => { const l = M.liste; let i = -1; l.forEach((e, k) => { if (e.t <= t) i = k; });
    if (i < 0) return l[0].h; if (i >= l.length - 1) return l[l.length - 1].h;
    const a = l[i], b = l[i + 1], f = (t - a.t) / (b.t - a.t); return a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2; };
  const monte = (M, t) => { const p = M.liste.find((e) => e.t > t); return p && p.haute; };
  const proch = (M, t, haute) => M.liste.find((e) => e.t > t && e.haute === haute);
  const hM = (m) => r().uniteMaree === 'pi' ? A.nb(m * 3.28084, 1) + ' pi' : A.nb(m, 1) + ' m';
  const quandM = (t) => (A.memeJour(t, new Date()) ? '' : A.nomJour(t).toLowerCase() + ' ') + A.heure(t);

  A.rendusCartes.marees = function () {
    const M = extra.marees; if (!M) return A.carte('Marées', `<p class="note">${extra.mareesEtat || 'Chargement…'}</p>`);
    const t = new Date(), h = hauteurA(M, t), H = proch(M, t, true), B = proch(M, t, false);
    return A.carte('Marées', `<div data-action="marees"><div class="gros">${hM(h)} ${monte(M, t) ? '↑ monte' : '↓ descend'}</div>` +
      (H ? `<div>Marée haute : ${quandM(H.t)} (${hM(H.h)})</div>` : '') + (B ? `<div class="pale">Marée basse : ${quandM(B.t)} (${hM(B.h)})</div>` : '') +
      `<canvas class="courbe"></canvas><p class="note">Station ${M.station.nom} (à ${Math.round(M.station.km)} km) · Pêches et Océans Canada · Touche pour voir le quai</p></div>`, 'marees');
  };
  function dessinerCourbe() {
    const cv = document.querySelector('.courbe'), M = extra.marees; if (!cv || !M) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 90; cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const t0 = Date.now() - 3 * 3600000, duree = 24 * 3600000, hmax = Math.max(...M.liste.map((e) => e.h)) * 1.1;
    const y = (v) => h - v / hmax * h * .9;
    const anim = (ms) => {
      if (!document.body.contains(cv)) return;
      c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(0, 0, w, h);
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(110,193,245,.8)'); g.addColorStop(1, 'rgba(30,111,192,.93)');
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) c.lineTo(x, y(hauteurA(M, new Date(t0 + x / w * duree))) + 1.5 * Math.sin(x / 18 + ms / 500));
      c.lineTo(w, h); c.fillStyle = g; c.fill();
      const xm = 3 * 3600000 / duree * w; c.strokeStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(xm, 0); c.lineTo(xm, h); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(xm, y(hauteurA(M, new Date())), 5, 0, 7); c.fill();
      c.font = '10px sans-serif'; M.liste.filter((e) => e.t > t0 && e.t < t0 + duree).forEach((e) => {
        const x = (e.t - t0) / duree * w; c.fillText(A.heure(e.t), Math.min(Math.max(x - 14, 0), w - 40), e.haute ? y(e.h) - 4 : h - 4); });
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  // L'écran du quai : looks dessinés, bonhomme, échelle, eau qui monte et descend
  const LOOKS = [['Quai de bois', 'BOIS', 'JOUR'], ['Vieux port en pierre', 'PIERRE', 'JOUR'], ['Marina', 'PONTON', 'JOUR'], ['Phare sur les rochers', 'PHARE', 'COUCHER'],
    ['Battures de Montmagny', 'BATTURE', 'JOUR'], ['Hiver sur le fleuve', 'BOIS', 'HIVER'], ['Brume matinale', 'PIERRE', 'GRIS'], ['Coucher de soleil', 'BOIS', 'COUCHER'], ['Marina la nuit', 'PONTON', 'NUIT']];
  A.actions.marees = function () {
    const M = extra.marees; if (!M) return;
    let decalage = 0, lecture = false, niveau = null, choix = false;
    const e = A.ouvrirEcran('Marées · ' + M.station.nom, '', { plein: true, droite: '<button class="pilule" data-look>🎨 Look</button>' });
    e.querySelector('.corps').innerHTML = `<canvas class="scene"></canvas><div class="infos-maree"></div><div class="bas-maree"><div class="looks" hidden></div>` +
      `<div class="lecteur"><button data-play>▶</button><input type="range" min="-6" max="30" step="0.1" value="0"><button data-maint>Maint.</button></div></div>`;
    const cv = e.querySelector('.scene'), ctx = cv.getContext('2d'), infos = e.querySelector('.infos-maree'), curseur = e.querySelector('input'), looks = e.querySelector('.looks');
    const dessinerLooks = () => { looks.innerHTML = LOOKS.map((l, i) => `<button class="${r().lookMaree === i ? 'oui' : ''}" data-l="${i}">${l[0]}</button>`).join('');
      looks.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { r().lookMaree = +b.dataset.l; A.ecrireMem('reglages', r()); dessinerLooks(); }); };
    dessinerLooks();
    e.querySelector('[data-look]').onclick = () => { choix = !choix; looks.hidden = !choix; };
    e.querySelector('[data-play]').onclick = (ev) => { lecture = !lecture; ev.target.textContent = lecture ? '⏸' : '▶'; };
    e.querySelector('[data-maint]').onclick = () => { lecture = false; decalage = 0; curseur.value = 0; };
    curseur.oninput = () => { lecture = false; decalage = +curseur.value; };
    const hmax = Math.max(7, Math.max(...M.liste.map((x) => x.h)) + 1.5), h0 = (i) => { const v = Math.sin(i * 12.9898) * 43758.547; return v - Math.floor(v); };
    const boucle = (ms) => {
      if (!document.body.contains(cv)) return;
      if (lecture) { decalage += 0.03; if (decalage > 30) decalage = -6; curseur.value = decalage; }
      const moment = new Date(Date.now() + decalage * 3600000), cible = hauteurA(M, moment);
      niveau = niveau == null ? cible : niveau + (cible - niveau) * 0.15;
      const H = proch(M, moment, true), B = proch(M, moment, false);
      infos.innerHTML = `<b>${A.nomJour(moment)} ${A.heure(moment)} · ${hM(hauteurA(M, moment))} ${monte(M, moment) ? '↑ monte' : '↓ descend'}</b>` +
        (H ? `<small>Prochaine haute : ${quandM(H.t)} · ${hM(H.h)}</small>` : '') + (B ? `<small>Prochaine basse : ${quandM(B.t)} · ${hM(B.h)}</small>` : '');
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, Hh = cv.clientHeight;
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = Hh * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const reserve = infos.getBoundingClientRect().bottom - cv.getBoundingClientRect().top;
      scene(ctx, W, Hh, niveau, hmax, ms / 1000, LOOKS[r().lookMaree] || LOOKS[0], moment, reserve, h0);
      requestAnimationFrame(boucle);
    };
    requestAnimationFrame(boucle);
  };

  function scene(c, w, h, niveau, hmax, t, look, moment, reserve, hz) {
    let [, structure, ciel] = look;
    const heure = moment.getHours();
    if (ciel === 'JOUR' && (heure < 7 || heure >= 17)) ciel = 'NUIT';
    const nuit = ciel === 'NUIT', hiver = ciel === 'HIVER';
    const fond = h * .88, haut = Math.max(h * .34, reserve + 80), y = (m) => fond - m / hmax * (fond - haut), surf = y(niveau);
    const deg = (cols, y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col)); return g; };
    c.fillStyle = deg({ JOUR: ['#2E6FC0', '#A9D3F2'], COUCHER: ['#3B2F6B', '#E0735A', '#F7C77A'], NUIT: ['#070B1E', '#1F3560'], GRIS: ['#8E9AA6', '#CBD3DA'], HIVER: ['#7FA3C6', '#E3EEF6'] }[ciel], 0, fond);
    c.fillRect(0, 0, w, h);
    if (nuit) { for (let i = 0; i < 50; i++) { c.globalAlpha = .3 + .6 * (.5 + .5 * Math.sin(t * (1 + hz(i)) + i)); c.fillStyle = '#fff'; c.beginPath(); c.arc(hz(i + 3) * w, hz(i + 5) * fond * .6, .6 + hz(i + 7) * 1.2, 0, 7); c.fill(); }
      c.globalAlpha = 1; c.fillStyle = '#F1F3F8'; c.beginPath(); c.arc(w * .2, fond * .18, 14, 0, 7); c.fill(); }
    if (ciel === 'COUCHER') { const s = [w * .3, y(hmax * .62) - 6]; const g = c.createRadialGradient(s[0], s[1], 0, s[0], s[1], w * .4);
      g.addColorStop(0, 'rgba(255,224,160,.6)'); g.addColorStop(1, 'rgba(255,224,160,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#FFD27A'; c.beginPath(); c.arc(s[0], s[1], 22, 0, 7); c.fill(); }
    // Rive au loin
    c.fillStyle = { NUIT: '#14202E', COUCHER: '#4A3B4F', GRIS: '#8A969E', HIVER: '#DCE6EE' }[ciel] || '#5E7D5A';
    c.beginPath(); c.moveTo(0, y(hmax * .62)); c.bezierCurveTo(w * .3, y(hmax * .7), w * .6, y(hmax * .6), w, y(hmax * .66)); c.lineTo(w, fond); c.lineTo(0, fond); c.fill();
    // Structure
    const quaiX = w * .6, plancher = y(hmax - .3);
    let echX = quaiX + 8, piedX = w * .84, piedY = plancher - 10;
    const rect = (col, x, yy, ww, hh) => { c.fillStyle = col; c.fillRect(x, yy, ww, hh); };
    if (structure === 'BOIS') {
      [.62, .78, .94].forEach((p) => rect('#5D4A3A', w * p - 6, plancher, 12, fond - plancher + 10));
      rect('#8A6B4F', quaiX, plancher - 10, w - quaiX, 12);
      for (let x = quaiX; x < w; x += 18) rect('#6E5440', x, plancher - 10, 1, 12);
      if (hiver) rect('#fff', quaiX, plancher - 13, w - quaiX, 4);
      echX = w * .62 + 8;
    } else if (structure === 'PIERRE') {
      const hp = 22; let rang = 0;
      for (let yy = plancher - 10; yy < fond + hp; yy += hp, rang++) { let x = quaiX - (rang % 2 ? 18 : 0), k = 0;
        while (x < w) { const lp = 30 + hz(rang * 31 + k) * 22, ton = .75 + hz(rang * 17 + k * 3) * .25;
          c.fillStyle = `rgb(${140 * ton | 0},${129 * ton | 0},${114 * ton | 0})`; const x0 = Math.max(x, quaiX); c.fillRect(x0, yy, lp - 2 - (x0 - x), hp - 2); x += lp; k++; } }
    } else if (structure === 'PONTON') {
      [.66, .92].forEach((p) => { rect('#6D6D6D', w * p - 5, y(hmax - .2), 10, fond - y(hmax - .2)); });
      const py = surf - 8 + Math.sin(t * 1.5); rect('#263238', quaiX, py + 8, w - quaiX, 6); rect('#B0895E', quaiX, py, w - quaiX, 9);
      piedY = py; echX = w * .66 + 7;
      const vx = w * .42, vy = surf + 2 * Math.sin(t * 1.2 + 1);
      c.save(); c.translate(vx, vy); c.rotate(.07 * Math.sin(t * 1.1));
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-42, -10); c.lineTo(42, -10); c.lineTo(30, 6); c.lineTo(-34, 6); c.fill();
      c.fillStyle = '#616161'; c.fillRect(-1, -90, 2, 80); c.fillStyle = '#F5F5F5'; c.beginPath(); c.moveTo(2, -88); c.lineTo(2, -16); c.lineTo(34, -16); c.fill();
      if (nuit) { c.fillStyle = '#FF5252'; c.beginPath(); c.arc(0, -90, 2.5, 0, 7); c.fill(); }
      c.restore();
    } else if (structure === 'PHARE') {
      c.fillStyle = deg(['#6B6259', '#3A342F'], plancher, fond); c.beginPath(); c.moveTo(quaiX - 20, fond + 10); c.lineTo(quaiX, y(hmax * .55)); c.lineTo(quaiX + 30, y(hmax * .8));
      c.lineTo(w * .78, plancher); c.lineTo(w * .9, y(hmax * .85)); c.lineTo(w, y(hmax * .8)); c.lineTo(w, fond + 10); c.fill();
      const px = w * .9, base = y(hmax * .85);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(px - 14, base); c.lineTo(px - 9, base - 120); c.lineTo(px + 9, base - 120); c.lineTo(px + 14, base); c.fill();
      for (let b = 0; b < 3; b++) rect('#D32F2F', px - 13 + b * 1.5, base - (30 + b * 36), 26 - b * 3, 12);
      rect('#37474F', px - 11, base - 136, 22, 16); c.fillStyle = '#FFF59D'; c.beginPath(); c.arc(px, base - 128, 6, 0, 7); c.fill();
      if (ciel !== 'JOUR') { c.save(); c.translate(px, base - 128); c.rotate(t * .7); const g = c.createLinearGradient(-w, 0, 0, 0);
        g.addColorStop(0, 'rgba(255,245,157,0)'); g.addColorStop(1, 'rgba(255,245,157,.35)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(-w, -40); c.lineTo(-w, 40); c.fill(); c.restore(); }
      piedX = w * .76; piedY = plancher + 2; echX = quaiX + 10; rect('#5D4A3A', echX - 3, y(hmax - .5), 6, fond - y(hmax - .5));
    } else if (structure === 'BATTURE') {
      const top = y(hmax - .8);
      c.fillStyle = deg(['#CDB98D', '#7A6A4E'], top, fond); c.beginPath(); c.moveTo(w * .35, fond + 10); c.lineTo(w, top); c.lineTo(w, fond + 10); c.fill();
      c.strokeStyle = '#7C8B3C'; c.lineWidth = 1.5;
      for (let i = 0; i < 26; i++) { const gx = w * (.62 + hz(i) * .38), gy = top + (w - gx) / (w * .65) * (fond - top) + 2;
        c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 3 * Math.sin(t * 1.3 + i), gy - 8 - hz(i + 4) * 10); c.stroke(); }
      echX = w * .52; rect('#5D4A3A', echX - 3, y(hmax - .5), 6, fond - y(hmax - .5));
      piedX = w * .9; piedY = top + (w - piedX) / (w * .65) * (fond - top);
      const ox = (t * 25) % (w + 200) - 100; c.strokeStyle = '#263238';
      for (let k = -3; k <= 3; k++) { const oxk = ox - Math.abs(k) * 14, oyk = haut - 30 + k * 8, b = 3 * Math.sin(t * 6 + k);
        c.beginPath(); c.moveTo(oxk - 6, oyk - b); c.lineTo(oxk, oyk); c.lineTo(oxk + 6, oyk - b); c.stroke(); }
    }
    // Échelle graduée
    const pieds = r().uniteMaree === 'pi', pas = pieds ? .6096 : 1;
    rect('rgba(245,245,245,.9)', echX, y(hmax - .5), 5, fond - y(hmax - .5));
    c.font = 'bold 12px sans-serif'; c.shadowColor = '#000'; c.shadowBlur = 3;
    for (let k = 0; k * pas <= hmax - .5; k++) { const yy = y(k * pas), gros = pieds ? k % 5 === 0 : true;
      rect('#D32F2F', echX, yy - 1, gros ? 12 : 7, 2); if (gros) { c.fillStyle = '#fff'; c.fillText(pieds ? k * 2 + ' pi' : k + ' m', echX + 15, yy + 4); } }
    c.shadowBlur = 0;
    // Bonhomme
    const u = 4, bx = piedX, p = piedY, manteau = hiver ? '#1565C0' : '#E53935';
    c.lineCap = 'round'; c.lineWidth = 2.5; c.strokeStyle = '#263238';
    c.beginPath(); c.moveTo(bx - u, p); c.lineTo(bx, p - 4 * u); c.lineTo(bx + u, p); c.stroke();
    c.fillStyle = manteau; c.fillRect(bx - 1.6 * u, p - 9 * u, 3.2 * u, 5.5 * u);
    const s = Math.sin(t * 4) * .5; c.strokeStyle = manteau; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(bx + 1.2 * u, p - 8.2 * u); c.lineTo(bx + 1.2 * u + 3 * u * Math.cos(-1.1 + s), p - 8.2 * u + 3 * u * Math.sin(-1.1 + s)); c.stroke();
    c.beginPath(); c.moveTo(bx - 1.2 * u, p - 8.2 * u); c.lineTo(bx - 2.2 * u, p - 5 * u); c.stroke();
    c.fillStyle = '#FFCC80'; c.beginPath(); c.arc(bx, p - 10.8 * u, 1.6 * u, 0, 7); c.fill();
    c.fillStyle = hiver ? '#E53935' : '#1565C0'; c.beginPath(); c.arc(bx, p - 11.3 * u, 1.8 * u, Math.PI, 0); c.fill();
    // L'eau
    const eau = { NUIT: ['rgba(30,58,92,.67)', '#07131F'], COUCHER: ['rgba(142,106,122,.67)', '#2B2440'], GRIS: ['rgba(125,140,150,.67)', '#3B4A55'], HIVER: ['rgba(157,183,201,.67)', '#2F4A5E'] }[ciel] || ['rgba(95,168,211,.67)', 'rgba(27,79,122,.87)'];
    for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) c.lineTo(x, surf + 3 * Math.sin(x / 40 + t * (1.4 + k * .6) + k) + 1.5 * Math.sin(x / 13 - t * 2.1) + k * 5);
      c.lineTo(w, h); c.fillStyle = deg(eau, surf, h); c.fill(); }
    if (ciel === 'COUCHER' || nuit) for (let i = 0; i < 10; i++) { const lg = (30 - i * 2) * (.7 + .3 * Math.sin(t * 2 + i));
      c.fillStyle = nuit ? `rgba(241,243,248,${.5 - i * .04})` : `rgba(255,210,122,${.5 - i * .04})`; c.fillRect((nuit ? w * .2 : w * .3) - lg, surf + 6 + i * 9, lg * 2, 2); }
    if (hiver) for (let i = 0; i < 9; i++) { const gx = (hz(i) * w + t * (8 + hz(i + 2) * 10)) % (w + 120) - 60, lg = 24 + hz(i + 5) * 40, gy = surf + 2 + hz(i + 8) * 30;
      c.fillStyle = '#EFF6FB'; c.beginPath(); c.ellipse(gx + lg / 2, gy, lg / 2, 4.5, 0, 0, 7); c.fill(); }
    if (structure !== 'BATTURE') { const bx2 = w * .22, by = surf + 2 * Math.sin(t * 1.8); c.save(); c.translate(bx2, by); c.rotate(.14 * Math.sin(t * 1.3));
      c.fillStyle = '#E53935'; c.fillRect(-7, -18, 14, 18); c.fillStyle = '#fff'; c.fillRect(-7, -12, 14, 4); c.restore(); }
    if (ciel === 'GRIS') for (let i = 0; i < 6; i++) { const bx3 = (hz(i) * w + t * 12) % (w * 1.6) - w * .3, by3 = surf - 10 - hz(i + 3) * 60;
      const g = c.createRadialGradient(bx3 + w * .25, by3, 0, bx3 + w * .25, by3, w * .3); g.addColorStop(0, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(bx3, by3 - 30, w * .5, 60); }
  }

  // ======================= Collecte des bacs (Montmagny) =======================
  // Le fichier collectes.json est mis à jour chaque jour par un robot GitHub (lecture du calendrier de la Ville).
  const COUL_BACS = { BLEU: '#1E88E5', VERT: '#2E7D32', BRUN: '#8D5A2B', RESIDUS: '#C0CA33', MONSTRES: '#5C7CFA' };
  const NOMS_BACS = { BLEU: 'Bac bleu', VERT: 'Bac vert', BRUN: 'Bac brun', RESIDUS: 'Résidus verts', MONSTRES: 'Monstres (encombrants)' };
  function lireType(nom) {
    if (nom.includes('reportee')) return { bacs: [], reportee: true };
    const b = [];
    if (nom.includes('residus')) b.push('RESIDUS');
    else { if (nom.includes('bleus')) b.push('BLEU'); if (nom.includes('verts')) b.push('VERT'); if (nom.includes('bruns')) b.push('BRUN'); }
    if (nom.includes('encombrants')) b.push('MONSTRES');
    return { bacs: b, reportee: false };
  }
  async function chargerCollectes() {
    const lignes = await fetch('collectes.json?' + new Date().toDateString()).then((x) => x.json());
    const par = {};
    lignes.forEach((l) => { const m = /(\d{4})\/(\d{2})\/(\d{2})\/([a-z0-9-]+)/.exec(l); if (!m || !m[4].includes('collecte')) return;
      const d = new Date(+m[1], +m[2] - 1, +m[3]), k = d.toDateString(), t = lireType(m[4]);
      par[k] = par[k] || { date: d, bacs: [], reportee: false }; par[k].bacs = [...new Set(par[k].bacs.concat(t.bacs))]; par[k].reportee = par[k].reportee || t.reportee; });
    return Object.values(par).sort((a, b) => a.date - b.date);
  }
  const debutRecherche = () => { const d = new Date(); if (d.getHours() >= 18) d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d; };
  function prochaines(l, n) {
    const jour = r().jourCollecte % 7, dep = debutRecherche(), res = [];
    l.filter((c) => c.date >= dep && c.date.getDay() === jour).forEach((c) => {
      if (res.length >= n) return;
      if (c.reportee) { const lend = l.find((x) => A.memeJour(x.date, new Date(c.date.getTime() + 86400000))); if (lend) res.push([lend, true]); }
      else if (c.bacs.filter((b) => b !== 'MONSTRES').length) res.push([c, false]);
    });
    return res;
  }
  function svgBac(type, taille) {
    const col = COUL_BACS[type];
    if (type === 'RESIDUS') return `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24"><path d="M12 21C2 15 4 5 20 3C21 14 17 20 12 21Z" fill="${col}"/></svg>`;
    if (type === 'MONSTRES') return `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="7" rx="2" fill="${col}"/><rect x="2" y="11" width="20" height="6" rx="2" fill="${col}" opacity=".85"/><path d="M4 17v3M20 17v3" stroke="${col}" stroke-width="1.6"/></svg>`;
    return `<svg width="${taille}" height="${taille}" viewBox="0 0 24 24"><path d="M5 7H19L17.5 21H6.5Z" fill="${col}"/><rect x="3.5" y="4" width="17" height="3.5" rx="1.2" fill="${col}"/><circle cx="16.5" cy="21.5" r="1.8" fill="#222"/></svg>`;
  }
  A.rendusCartes.collecte = function () {
    const l = extra.collectes; if (!l) return A.carte('Collecte des bacs', '<p class="note">Chargement…</p>');
    const p = prochaines(l, 2), auj = new Date();
    let h = p.length ? p.map(([c, rep], i) => `<div class="${i ? 'pale' : 'gros'}">${A.nomJour(c.date, auj)} ${A.dateLongue(c.date)}${rep ? ' (reportée)' : ''}</div>` +
      (rep ? '<div class="note">⚠️ Collecte reportée à cause d\'un congé.</div>' : '') +
      `<div class="bacs">${c.bacs.filter((b) => b !== 'MONSTRES').map((b) => svgBac(b, i ? 24 : 32) + `<span>${NOMS_BACS[b]}</span>`).join('')}</div>`).join('')
      : '<p class="note">Le calendrier de la Ville n\'est pas encore disponible pour les prochaines semaines.</p>';
    const mo = l.find((c) => c.date >= debutRecherche() && c.bacs.includes('MONSTRES'));
    if (mo) { const res = new Date(mo.date); do { res.setDate(res.getDate() - 1); } while (res.getDay() !== 5);
      h += `<div class="bacs">${svgBac('MONSTRES', 30)}<div><b>Monstres : ${A.nomJour(mo.date, auj).toLowerCase()} ${A.dateLongue(mo.date)}</b><small class="note">${new Date() > res ? 'Réservation fermée pour cette collecte.' : 'Réserver avant 11 h, ' + A.nomJour(res, auj).toLowerCase() + ' ' + A.dateLongue(res) + ' : ville.montmagny.qc.ca/encombrant ou 418 248-3361'}</small></div></div>`; }
    return A.carte('Collecte des bacs', h + '<p class="note">Source : Ville de Montmagny · le jour se règle dans les Paramètres</p>');
  };
  function miniBacs() {
    const z = document.getElementById('mini-bacs'); if (!z || !extra.collectes) return;
    const p = prochaines(extra.collectes, 1)[0];
    z.innerHTML = p ? p[0].bacs.filter((b) => b !== 'MONSTRES' && b !== 'RESIDUS').slice(0, 3).map((b) => svgBac(b, 14)).join('') : '';
  }

  // ======================= Carte glissable (Leaflet, chargée au besoin) =======================
  let leafletPret = null;
  function chargerLeaflet() {
    if (leafletPret) return leafletPret;
    leafletPret = new Promise((ok, non) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l);
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = ok; s.onerror = non; document.head.appendChild(s);
    });
    return leafletPret;
  }
  function carteDeBase(div, lat, lon, zoom) {
    const m = L.map(div, { zoomControl: false, attributionControl: true }).setView([lat, lon], zoom);
    const esri = (s) => `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/${s}/MapServer/tile/{z}/{y}/{x}`;
    L.tileLayer(esri('World_Dark_Gray_Base'), { maxZoom: 16, attribution: 'Carte © Esri' }).addTo(m);
    m.createPane('noms'); m.getPane('noms').style.zIndex = 450; m.getPane('noms').style.pointerEvents = 'none';
    L.tileLayer(esri('World_Dark_Gray_Reference'), { maxZoom: 16, pane: 'noms' }).addTo(m);
    L.circleMarker([lat, lon], { radius: 7, color: '#fff', weight: 2.5, fillColor: '#1565C0', fillOpacity: 1, pane: 'noms' }).addTo(m)
      .bindTooltip(A.ville().nom, { permanent: true, direction: 'right', className: 'etiquette' });
    return m;
  }

  // ======================= Radar d'Environnement Canada =======================
  A.actions.radar = async function () {
    const v = A.ville();
    const e = A.ouvrirEcran('Radar', '<div class="carte-pleine"></div><div class="lecteur radar"><button data-play>⏸</button><input type="range" min="0" max="9" value="9"><span class="hre"></span></div><p class="note legende">Radar · Environnement Canada · pluie et neige · glisse et pince</p>', { plein: true });
    try { await chargerLeaflet(); } catch (err) { e.querySelector('.carte-pleine').innerHTML = '<p class="note">Impossible de charger la carte.</p>'; return; }
    const carte = carteDeBase(e.querySelector('.carte-pleine'), v.lat, v.lon, 7);
    let fin = null;
    try { const cap = await fetch('https://geo.weather.gc.ca/geomet?service=WMS&version=1.3.0&request=GetCapabilities&layer=RADAR_1KM_RRAI').then((x) => x.text());
      const m = /<Dimension name="time"[^>]*>[^/<]+\/([^/<]+)\//.exec(cap); if (m) fin = new Date(m[1]); } catch (err) {}
    if (!fin || isNaN(fin)) { fin = new Date(Date.now() - 12 * 60000); fin.setUTCMinutes(Math.floor(fin.getUTCMinutes() / 6) * 6, 0, 0); }
    const temps = Array.from({ length: 10 }, (_, i) => new Date(fin.getTime() - (9 - i) * 360000));
    const couches = temps.map((t) => ['RADAR_1KM_RRAI', 'RADAR_1KM_RSNO'].map((nom) => L.tileLayer.wms('https://geo.weather.gc.ca/geomet', {
      layers: nom, format: 'image/png', transparent: true, version: '1.3.0', time: t.toISOString().replace('.000', ''), opacity: 0 }).addTo(carte)));
    let i = 9, marche = true;
    const montrer = (k) => { couches.forEach((p, j) => p.forEach((c) => c.setOpacity(j === k ? .8 : 0))); i = k;
      e.querySelector('input').value = k; e.querySelector('.hre').textContent = A.heure(temps[k]); };
    montrer(9);
    const bouton = e.querySelector('[data-play]');
    bouton.onclick = () => { marche = !marche; bouton.textContent = marche ? '⏸' : '▶'; };
    e.querySelector('input').oninput = (ev) => { marche = false; bouton.textContent = '▶'; montrer(+ev.target.value); };
    const tic = () => { if (!document.body.contains(e)) return; if (marche) montrer((i + 1) % 10); setTimeout(tic, i === 9 ? 1500 : 500); };
    setTimeout(tic, 2500);
  };

  // ======================= Caméras 511 (ministère des Transports) =======================
  async function chargerCameras(v) {
    let d = A.lireMem('cameras', null);
    if (!d || Date.now() - d.lu > 86400000) {
      const g = await fetch('https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:infos_cameras&srsname=EPSG:4326&outputformat=geojson').then((x) => x.json());
      d = { lu: Date.now(), l: g.features.map((f) => ({ id: f.properties.IDEcamera, desc: (f.properties.DescriptionLocalisationFr || '').trim(),
        route: (f.properties.NumeroRoute || '').replace(/^0+/, ''), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], url: f.properties.URL_FLUX_DONNEE })) };
      A.ecrireMem('cameras', d);
    }
    return d.l.map((c) => Object.assign({ km: distanceKm(v.lat, v.lon, c.lat, c.lon) }, c)).filter((c) => c.km <= 65 && /^https:/.test(c.url)).sort((a, b) => a.km - b.km);
  }
  const favoris = () => A.lireMem('camerasFavorites', []);
  const nomRoute = (c) => !c.route ? 'Autres' : c.desc.startsWith('Aut.') ? 'Autoroute ' + c.route : 'Route ' + c.route;
  const ligneCam = (c) => `<div class="item-ville"><span>📷</span><div data-action="camera:${c.id}"><b>${c.desc}</b><small>${nomRoute(c)} · à ${Math.round(c.km)} km</small></div>` +
    `<span class="etoile" data-action="favori:${c.id}">${favoris().includes(c.id) ? '★' : '☆'}</span></div>`;
  const trier = (l) => l.slice().sort((a, b) => (!favoris().includes(a.id)) - (!favoris().includes(b.id)) || a.km - b.km);
  A.rendusCartes.routes = function () {
    const l = extra.cameras; if (!l) return A.carte('Routes · caméras', '<p class="note">Chargement…</p>');
    if (!l.length) return A.carte('Routes · caméras', '<p class="note">Aucune caméra à moins de 65 km.</p>');
    return A.carte('Routes · caméras', trier(l).slice(0, 4).map(ligneCam).join('') + '<p class="note">Source : ministère des Transports du Québec (Québec 511)</p>', 'cameras');
  };
  A.actions.favori = function (id) {
    const f = favoris(); A.ecrireMem('camerasFavorites', f.includes(id) ? f.filter((x) => x !== id) : f.concat(id));
    A.afficher(); document.querySelectorAll(`[data-action="favori:${id}"]`).forEach((s) => { s.textContent = favoris().includes(id) ? '★' : '☆'; });
  };
  A.actions.camera = function (id) {
    const c = (extra.cameras || []).find((x) => x.id === id); if (c) window.open(c.url, '_blank');
  };
  A.actions.cameras = async function () {
    const l = extra.cameras || [];
    let onglet = 0;
    const e = A.ouvrirEcran('Caméras près de ' + A.ville().nom, '');
    const dessiner = async () => {
      const tabs = `<div class="onglets"><button class="${onglet === 0 ? 'oui' : ''}" data-o="0">Par route</button><button class="${onglet === 1 ? 'oui' : ''}" data-o="1">Carte</button></div>`;
      if (onglet === 0) {
        const groupes = {}; l.forEach((c) => { (groupes[nomRoute(c)] = groupes[nomRoute(c)] || []).push(c); });
        const favs = l.filter((c) => favoris().includes(c.id));
        e.querySelector('.corps').innerHTML = tabs + '<p class="note">Touche une caméra pour la voir (page officielle de Québec 511). ☆ = favori.</p>' +
          (favs.length ? '<div class="entete">★ Mes favoris</div>' + favs.map(ligneCam).join('') : '') +
          Object.entries(groupes).sort((a, b) => a[1][0].km - b[1][0].km).map(([n, cs]) => `<div class="entete">${n} <span>${cs.length}</span></div>` + cs.map(ligneCam).join('')).join('');
      } else {
        e.querySelector('.corps').innerHTML = tabs + '<div class="carte-pleine moyenne"></div><p class="note">Glisse, pince, touche une pastille.</p>';
        await chargerLeaflet();
        const carte = carteDeBase(e.querySelector('.carte-pleine'), A.ville().lat, A.ville().lon, 9);
        l.forEach((c) => L.circleMarker([c.lat, c.lon], { radius: 7, color: '#fff', weight: 2, fillColor: favoris().includes(c.id) ? '#FFD54F' : '#FF8A3D', fillOpacity: 1 })
          .addTo(carte).bindPopup(`<b>${c.desc}</b><br>${nomRoute(c)} · à ${Math.round(c.km)} km<br><a href="${c.url}" target="_blank">Voir la caméra ›</a>`));
      }
      e.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => { onglet = +b.dataset.o; dessiner(); });
    };
    dessiner();
  };

  // ======================= Chargements, après la météo =======================
  A.apresChargement = function () {
    const v = A.ville();
    extra.marees = null; extra.mareesEtat = 'Chargement…'; extra.cameras = null; extra.sol = null;
    chargerAlertes(v).then((l) => { extra.alertes = l; A.afficher(); }).catch(() => {});
    chargerSol(v).then((s) => { extra.sol = s; A.afficher(); }).catch(() => {});
    chargerMarees(v).then((M) => { extra.marees = M; if (!M) extra.mareesEtat = 'Aucune station de marées à moins de 60 km.'; A.afficher(); })
      .catch(() => { extra.mareesEtat = 'Impossible de charger les marées.'; A.afficher(); });
    chargerCameras(v).then((l) => { extra.cameras = l; A.afficher(); }).catch(() => { extra.cameras = []; });
    chargerCollectes().then((l) => { extra.collectes = l; A.afficher(); }).catch(() => {});
  };
  A.apresAffichage = function () { dessinerCourbe(); miniBacs(); };
})();
