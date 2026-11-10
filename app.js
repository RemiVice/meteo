// Météo — version Web (iPhone, ou n'importe quel navigateur)
// Ce fichier : la base (données, cartes, écrans, onglets, organiser). Les extras sont dans extras.js.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const A = (window.App = {});

  // ---------------- Mémoire (dans le navigateur) ----------------
  const MONTMAGNY = { nom: 'Montmagny', region: 'Québec', lat: 46.9803, lon: -70.5543 };
  A.lireMem = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  A.ecrireMem = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  A.reglages = Object.assign({ temp: 'C', pluie: 'mm', neige: 'cm', vent: 'kmh', fondAnime: true, opacite: 0.45,
    jourCollecte: 1, uniteMaree: 'm', lookMaree: 0 }, A.lireMem('reglages', {}));
  A.villes = A.lireMem('villes', [MONTMAGNY]);
  A.choix = Math.min(A.lireMem('choix', 0), A.villes.length - 1);
  A.ville = () => A.villes[A.choix] || MONTMAGNY;
  A.meteo = null;
  let derniereMaj = 0;

  // Les cartes de l'écran principal (ordre, taille, cachées)
  const CARTES = [['actuel', 'Météo actuelle'], ['resume', 'Résumé'], ['heures', 'Heure par heure'], ['tempete', 'Précipitations à venir'],
    ['periodes', '7 jours'], ['jours14', '14 jours'], ['exterieur', 'Extérieur'], ['details', "Plus d'infos"], ['lune', 'La Lune'],
    ['marees', 'Marées'], ['collecte', 'Collecte des bacs'], ['routes', 'Routes · caméras']];
  A.disposition = A.lireMem('disposition', null);
  if (!A.disposition) A.disposition = { ordre: CARTES.map((c) => c[0]), tailles: {}, caches: [] };
  CARTES.forEach((c) => { if (!A.disposition.ordre.includes(c[0])) A.disposition.ordre.push(c[0]); });

  // ---------------- Unités ----------------
  const r = () => A.reglages;
  A.nb = (v, d) => v.toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d });
  A.T = (c) => Math.round(r().temp === 'C' ? c : c * 9 / 5 + 32) + '°';
  A.ventT = (k) => r().vent === 'kmh' ? Math.round(k) + ' km/h' : r().vent === 'mph' ? Math.round(k / 1.609) + ' mi/h' : Math.round(k / 1.852) + ' nd';
  A.pluieT = (mm) => r().pluie === 'mm' ? A.nb(mm, mm < 10 ? 1 : 0) + ' mm' : r().pluie === 'cm' ? A.nb(mm / 10, 1) + ' cm' : A.nb(mm / 25.4, 2) + ' po';
  A.neigeT = (cm) => r().neige === 'cm' ? A.nb(cm, cm < 10 ? 1 : 0) + ' cm' : A.nb(cm / 2.54, 1) + ' po';
  A.pluieArr = (mm) => mm < 0.2 ? null : r().pluie !== 'mm' ? '~' + A.pluieT(mm) : mm < 1 ? '<1 mm' : mm < 3 ? '1-3 mm' : '~' + Math.round(mm) + ' mm';
  A.neigeArr = (cm) => cm < 0.1 ? null : r().neige !== 'cm' ? '~' + A.neigeT(cm) : cm < 1 ? '<1 cm' : cm < 3 ? '1-3 cm' : '~' + Math.round(cm) + ' cm';
  A.quantite = (p, n) => (n >= 0.1 && n * 10 >= p) ? (A.neigeArr(n) && '❄ ' + A.neigeArr(n)) : (A.pluieArr(p) && '💧 ' + A.pluieArr(p));

  A.JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  A.MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  A.dateDe = (s) => new Date(s.length <= 10 ? s + 'T00:00' : s);
  A.memeJour = (a, b) => a.toDateString() === b.toDateString();
  A.maj = (s) => s[0].toUpperCase() + s.slice(1);
  A.heure = (d) => d.getHours() + ' h' + (d.getMinutes() ? ' ' + String(d.getMinutes()).padStart(2, '0') : '');
  A.nomJour = function (d, auj) {
    auj = auj || new Date(); const dem = new Date(auj); dem.setDate(dem.getDate() + 1);
    if (A.memeJour(d, auj)) return "Aujourd'hui";
    if (A.memeJour(d, dem)) return 'Demain';
    return A.maj(A.JOURS[d.getDay()]);
  };
  A.dateLongue = (d) => d.getDate() + ' ' + A.MOIS[d.getMonth()];
  A.jourCourt = (d, auj) => A.memeJour(d, auj) ? 'Auj.' : A.maj(A.JOURS[d.getDay()].slice(0, 3)) + '. ' + d.getDate();

  // ---------------- Données (modèle canadien GEM, complété au-delà de 10 jours) ----------------
  const adresse = (v, modele) => 'https://api.open-meteo.com/v1/forecast?latitude=' + v.lat + '&longitude=' + v.lon +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,pressure_msl,is_day' +
    '&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,rain,showers,snowfall,wind_speed_10m,wind_gusts_10m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,rain_sum,showers_sum,snowfall_sum,sunrise,sunset' +
    '&forecast_days=16&models=' + modele + '&timezone=auto';

  async function charger(v) {
    const [gem, sec] = await Promise.all([
      fetch(adresse(v, 'gem_seamless')).then((x) => x.json()),
      fetch(adresse(v, 'best_match')).then((x) => x.json()).catch(() => null),
    ]);
    const val = (sect, nom, i, def = 0) => {
      const a = gem[sect] && gem[sect][nom]; if (a && a[i] != null) return a[i];
      const b = sec && sec[sect] && sec[sect][nom]; if (b && b[i] != null) return b[i];
      return def;
    };
    const c = gem.current;
    const actuelle = { temp: c.temperature_2m, ressenti: c.apparent_temperature, humidite: c.relative_humidity_2m, code: c.weather_code,
      vent: c.wind_speed_10m, rafales: c.wind_gusts_10m, dir: c.wind_direction_10m, nuages: c.cloud_cover, pression: c.pressure_msl,
      jour: c.is_day === 1, moment: A.dateDe(c.time) };
    const toutes = gem.hourly.time.map((t, i) => ({ moment: A.dateDe(t), temp: val('hourly', 'temperature_2m', i), ressenti: val('hourly', 'apparent_temperature', i),
      code: val('hourly', 'weather_code', i, 3), prob: val('hourly', 'precipitation_probability', i),
      pluie: val('hourly', 'rain', i) + val('hourly', 'showers', i), neige: val('hourly', 'snowfall', i),
      vent: val('hourly', 'wind_speed_10m', i), rafales: val('hourly', 'wind_gusts_10m', i), jour: val('hourly', 'is_day', i, 1) === 1 }));
    const jours = gem.daily.time.slice(0, 14).map((t, i) => ({ date: A.dateDe(t), code: val('daily', 'weather_code', i, 3),
      max: val('daily', 'temperature_2m_max', i), min: val('daily', 'temperature_2m_min', i), prob: val('daily', 'precipitation_probability_max', i),
      pluie: val('daily', 'rain_sum', i) + val('daily', 'showers_sum', i), neige: val('daily', 'snowfall_sum', i),
      lever: gem.daily.sunrise[i] || (sec && sec.daily.sunrise[i]), coucher: gem.daily.sunset[i] || (sec && sec.daily.sunset[i]),
      tendance: gem.daily.weather_code[i] == null }));
    let uv = null, iqa = null;
    try {
      const air = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + v.lat + '&longitude=' + v.lon + '&current=us_aqi,uv_index&timezone=auto').then((x) => x.json());
      uv = air.current.uv_index; iqa = air.current.us_aqi;
    } catch (e) {}
    const debut = new Date(actuelle.moment); debut.setMinutes(0, 0, 0);
    const fin7 = new Date(actuelle.moment); fin7.setHours(0, 0, 0, 0); fin7.setDate(fin7.getDate() + 7);
    return { actuelle, toutes, heures: toutes.filter((h) => h.moment >= debut).slice(0, 24),
      semaine: toutes.filter((h) => h.moment >= debut && h.moment < fin7), jours, uv, iqa };
  }

  // ---------------- Ambiance du fond ----------------
  function ambiance(m) {
    const a = m.actuelle, c = a.code;
    let ciel = 'NUAGEUX', int = 0;
    if (c <= 1) ciel = 'DEGAGE'; else if (c === 2) ciel = 'PARTIEL'; else if (c === 45 || c === 48) { ciel = 'BROUILLARD'; int = .7; }
    else if ([51, 53, 55, 56, 57].includes(c)) { ciel = 'PLUIE'; int = .2; }
    else if ([61, 66, 80].includes(c)) { ciel = 'PLUIE'; int = .4; } else if ([63, 81].includes(c)) { ciel = 'PLUIE'; int = .65; }
    else if ([65, 67, 82].includes(c)) { ciel = 'PLUIE'; int = 1; } else if ([71, 77, 85].includes(c)) { ciel = 'NEIGE'; int = .35; }
    else if (c === 73) { ciel = 'NEIGE'; int = .6; } else if ([75, 86].includes(c)) { ciel = 'NEIGE'; int = 1; }
    else if (c >= 95) { ciel = 'ORAGE'; int = c === 95 ? .75 : 1; }
    const couv = a.nuages / 100;
    return { ciel, intensite: int, nuages: ciel === 'DEGAGE' ? Math.min(couv, .15) : ciel === 'PARTIEL' ? Math.max(.3, Math.min(couv, .6)) : Math.max(couv, .8),
      vent: a.vent, versDroite: a.dir >= 180, jour: a.jour, bruine: [51, 53, 55, 56, 57].includes(c) };
  }

  // ---------------- Calculs : résumé, moments de la journée, tempête ----------------
  A.resume = function (m) {
    const a = m.actuelle, p = m.heures.slice(0, 12), morceaux = [descriptionMeteo(a.code)];
    const mouill = p.filter((h) => h.prob >= 40 && (h.pluie >= .1 || h.neige >= .1));
    if (mouill.length) {
      const n = mouill.reduce((s, h) => s + h.neige, 0), pl = mouill.reduce((s, h) => s + h.pluie, 0);
      const quoi = n >= pl / 10 ? 'neige' : 'pluie', quand = mouill[0] === p[0] ? 'en ce moment' : 'à partir de ' + mouill[0].moment.getHours() + ' h';
      const q = quoi === 'neige' ? A.neigeArr(n) : A.pluieArr(pl);
      morceaux.push(quoi + ' ' + quand + (q ? ' (' + q + " d'ici 12 h)" : ''));
    } else morceaux.push('pas de précipitations prévues dans les 12 prochaines heures');
    const raf = Math.max(...p.map((h) => h.rafales)); if (raf >= 50) morceaux.push("venteux, rafales jusqu'à " + A.ventT(raf));
    return A.maj(morceaux.join('; ')) + '.';
  };
  const poids = (c) => c >= 95 ? 9 : [66, 67, 56, 57].includes(c) ? 8 : [71, 73, 75, 77, 85, 86].includes(c) ? 7 : [61, 63, 65, 80, 81, 82].includes(c) ? 6 : [51, 53, 55].includes(c) ? 5 : c === 45 || c === 48 ? 4 : c;
  A.dominant = (l) => l.reduce((b, c) => (poids(c) * 100 + c > poids(b) * 100 + b ? c : b), l[0]);
  A.periodes = function (m, date) {
    const maint = new Date(m.actuelle.moment); maint.setMinutes(0, 0, 0);
    return [['Matin', 6, 12], ['Après-midi', 12, 18], ['Soirée', 18, 24], ['Nuit', 24, 30]].map(([nom, de, a]) => {
      const d0 = new Date(date); d0.setHours(de, 0, 0, 0); const d1 = new Date(date); d1.setHours(a, 0, 0, 0);
      const hs = m.toutes.filter((h) => h.moment >= d0 && h.moment < d1 && h.moment >= maint);
      if (!hs.length) return null;
      const mi = hs[Math.floor(hs.length / 2)];
      return { nom, date, code: A.dominant(hs.map((h) => h.code)), jour: mi.jour, temp: mi.temp, ressenti: mi.ressenti,
        prob: Math.max(...hs.map((h) => h.prob)), pluie: hs.reduce((s, h) => s + h.pluie, 0), neige: hs.reduce((s, h) => s + h.neige, 0) };
    }).filter(Boolean);
  };
  A.codeNuit = function (m, j) {
    const d0 = new Date(j.date); d0.setHours(18); const d1 = new Date(j.date); d1.setHours(30);
    const hs = m.toutes.filter((h) => h.moment >= d0 && h.moment < d1);
    return hs.length ? A.dominant(hs.map((h) => h.code)) : j.code;
  };
  A.evenement = function (m, neige) {
    const debut = new Date(m.actuelle.moment); debut.setMinutes(0, 0, 0);
    const l = m.toutes.filter((h) => h.moment >= debut).slice(0, 72), q = (h) => neige ? h.neige : h.pluie, seuil = neige ? .1 : .2;
    const i0 = l.findIndex((h) => q(h) >= seuil); if (i0 < 0) return null;
    let fin = i0, sec = 0, total = 0;
    for (let i = i0; i < l.length; i++) { const v = q(l[i]); if (v >= seuil) { fin = i; sec = 0; } else if (++sec >= 6) break; total += v; }
    if (total < (neige ? 2 : 10)) return null;
    const f = new Date(l[fin].moment); f.setHours(f.getHours() + 1);
    return { total, debut: l[i0].moment, fin: f };
  };

  // ---------------- Les cartes ----------------
  function colonne(titre, code, jour, t, sous, prob, pluie, neige, petitTitre) {
    const hEau = pluie >= .1 ? 4 + Math.min(pluie, 10) / 10 * 30 : 0, hNeige = neige >= .1 ? 5 + Math.min(neige, 10) / 10 * 29 : 0;
    const fond = (neige >= .1 && neige * 10 >= pluie) ? `<div class="neige" style="height:${hNeige}px"></div>` : hEau ? `<div class="eau" style="height:${hEau}px"></div>` : '';
    return `<div class="col">${fond}<div class="h">${titre}</div>${petitTitre ? `<div class="r">${petitTitre}</div>` : ''}${iconeMeteo(code, jour)}<div class="t">${t}</div><div class="r">${sous}</div>` +
      `<div class="p" style="color:${prob >= 10 ? 'var(--bleu-pluie)' : 'rgba(255,255,255,.4)'}">${prob} %</div><div class="q">${A.quantite(pluie, neige) || '&nbsp;'}</div></div>`;
  }
  A.carte = (titre, contenu, voirPlus) => `<section class="carte">${titre ? `<h2>${titre}${voirPlus ? `<button data-action="${voirPlus}">Voir plus ›</button>` : ''}</h2>` : ''}${contenu}</section>`;

  A.rendusCartes = {
    actuel(m) {
      const a = m.actuelle, j0 = m.jours[0];
      return `<div class="actuel">${iconeMeteo(a.code, a.jour)}<div class="temp">${A.T(a.temp)}</div><div class="ombre">` +
        `<div class="desc">${descriptionMeteo(a.code)}</div><div class="sous">Ressenti ${A.T(a.ressenti)}</div>` +
        `<div class="sous">Max ${A.T(j0.max)} · Min ${A.T(j0.min)}</div></div></div>` +
        `<div class="ligne-vent">💨 ${A.ventT(a.vent)} · rafales ${A.ventT(a.rafales)} · 💧 ${a.humidite} % · mis à jour à ${A.heure(a.moment)}</div>`;
    },
    resume: (m) => `<div class="resume">${A.resume(m)}</div>`,
    heures: (m) => A.carte('Heure par heure', '<div class="bande" data-action="previsions:0">' +
      m.heures.map((x, i) => colonne(i ? x.moment.getHours() + ' h' : 'Maint.', x.code, x.jour, A.T(x.temp), 'Ress. ' + A.T(x.ressenti), x.prob, x.pluie, x.neige)).join('') + '</div>', 'previsions:0'),
    tempete(m) {
      const n = A.evenement(m, true), p = A.evenement(m, false); if (!n && !p) return '';
      const auj = new Date(m.actuelle.moment), quand = (d) => A.nomJour(d, auj).toLowerCase() + ' ' + A.heure(d);
      return A.carte('Précipitations à venir',
        (n ? `<div class="gros">❄️ ${A.neigeT(n.total)} de neige</div><div class="note">De ${quand(n.debut)} à ${quand(n.fin)}</div>` : '') +
        (p ? `<div class="gros">🌧️ ${A.pluieT(p.total)} de pluie</div><div class="note">De ${quand(p.debut)} à ${quand(p.fin)}</div>` : ''));
    },
    periodes(m) {
      const auj = new Date(m.actuelle.moment); auj.setHours(0, 0, 0, 0);
      const l = [0, 1, 2].flatMap((k) => { const d = new Date(auj); d.setDate(d.getDate() + k); return A.periodes(m, d); }).slice(0, 6);
      return A.carte('7 jours', '<div class="bande" data-action="previsions:1">' + l.map((p) =>
        colonne(p.nom, p.code, p.jour, A.T(p.temp), 'Ress. ' + A.T(p.ressenti), p.prob, p.pluie, p.neige, A.jourCourt(p.date, auj))).join('') + '</div>', 'previsions:1');
    },
    jours14(m) {
      const auj = new Date(m.actuelle.moment);
      return A.carte('14 jours', m.jours.map((j, i) => {
        const q = j.neige >= .2 ? '❄️ ' + A.neigeT(j.neige) : j.pluie >= .5 ? '💧 ' + A.pluieT(j.pluie) : '';
        return `<div class="jour" data-action="${i < 7 ? 'previsions:0:' + i : 'previsions:2'}"><div class="nom">${A.nomJour(j.date, auj)}${j.tendance ? ' <span class="tendance">tendance</span>' : ''}<small>${q}</small></div>` +
          `${iconeMeteo(j.code, true)}<div class="prob">${j.prob >= 10 ? j.prob + ' %' : ''}</div><div class="max">${A.T(j.max)}</div><div class="min">${A.T(j.min)}</div></div>`;
      }).join(''), 'previsions:2');
    },
    details(m) {
      const a = m.actuelle, j0 = m.jours[0], hm = (s) => A.heure(A.dateDe(s));
      const uvT = (u) => u < 3 ? 'Faible' : u < 6 ? 'Modéré' : u < 8 ? 'Élevé' : u < 11 ? 'Très élevé' : 'Extrême';
      return A.carte("Plus d'infos", `<div class="grille">` +
        (m.uv != null ? `<div><small>☀️ Indice UV</small><b>${Math.round(m.uv)} · ${uvT(m.uv)}</b></div>` : '') +
        `<div><small>🧭 Pression</small><b>${A.nb(a.pression / 10, 1)} kPa</b></div>` +
        `<div><small>🌅 Lever du soleil</small><b>${hm(j0.lever)}</b></div><div><small>🌇 Coucher du soleil</small><b>${hm(j0.coucher)}</b></div></div>`);
    },
  };

  // ---------------- L'écran principal ----------------
  A.afficher = function () {
    const m = A.meteo; if (!m) return;
    document.documentElement.style.setProperty('--carte', `rgba(11,18,32,${r().opacite})`);
    const d = A.disposition, echelle = [0.85, 1, 1.2];
    let h = (A.alertesHtml ? A.alertesHtml() : '');
    d.ordre.filter((id) => !d.caches.includes(id)).forEach((id) => {
      const f = A.rendusCartes[id]; if (!f) return;
      const t = d.tailles[id] == null ? 1 : d.tailles[id];
      let html = ''; try { html = f(m); } catch (e) { html = ''; }
      if (html) h += `<div class="emplacement" data-carte="${id}" style="zoom:${echelle[t]}">${html}</div>`;
    });
    $('#contenu').innerHTML = h;
    if (A.apresAffichage) A.apresAffichage();
  };

  A.actualiser = async function () {
    const v = A.ville();
    $('#nom-ville').textContent = v.nom; $('#region-ville').textContent = v.region || '';
    try {
      A.meteo = await charger(v); derniereMaj = Date.now();
      Fond.regler(ambiance(A.meteo)); A.afficher();
      if (A.apresChargement) A.apresChargement();
    } catch (e) {
      if (!A.meteo) $('#contenu').innerHTML = '<div class="chargement">Impossible de charger la météo.<br>Vérifie ta connexion Internet.</div>';
    }
  };

  // Mise à jour automatique : au retour dans l'application (plus de 10 min) et aux 15 minutes
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - derniereMaj > 10 * 60000) A.actualiser(); });
  setInterval(() => { if (!document.hidden && Date.now() - derniereMaj > 15 * 60000) A.actualiser(); }, 60000);

  // ---------------- Les écrans par-dessus (onglets, Lune, marées, radar…) ----------------
  A.ouvrirEcran = function (titre, html, options) {
    options = options || {};
    const e = document.createElement('section');
    e.className = 'ecran' + (options.plein ? ' plein' : '');
    e.innerHTML = `<div class="barre"><button class="retour">‹</button><h2>${titre}</h2>${options.droite || ''}</div><div class="corps">${html}</div>`;
    document.body.appendChild(e);
    e.querySelector('.retour').addEventListener('click', () => { if (options.fermer) options.fermer(); e.remove(); });
    return e;
  };

  // Un seul gestionnaire pour tous les boutons « data-action »
  A.actions = {};
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]'); if (!el) return;
    const [nom, ...args] = el.dataset.action.split(':');
    if (A.actions[nom]) { ev.preventDefault(); A.actions[nom](...args, el); }
  });

  // ---------------- Onglets Horaire / 7 jours / 14 jours (+ graphique) ----------------
  A.actions.previsions = function (onglet, jour) {
    const m = A.meteo; if (!m) return;
    let o = +onglet || 0, graphique = false;
    const e = A.ouvrirEcran(A.ville().nom, '', { droite: '<button class="pilule" data-g>📈 Graphique</button>' });
    const auj = new Date(m.actuelle.moment);
    const dessiner = () => {
      const tabs = ['Horaire', '7 jours', '14 jours'].map((t, i) => `<button class="${i === o ? 'oui' : ''}" data-o="${i}">${t}</button>`).join('');
      let c = `<div class="onglets">${tabs}</div>`;
      if (graphique) {
        if (o === 0) {
          const groupes = {}; m.semaine.forEach((h) => { (groupes[h.moment.toDateString()] = groupes[h.moment.toDateString()] || []).push(h); });
          c += Object.values(groupes).filter((g) => g.length >= 2).map((g, i) => `<h3>${A.nomJour(g[0].moment, auj)} ${A.dateLongue(g[0].moment)}</h3><canvas class="graph" data-gi="${i}"></canvas>`).join('');
          e.querySelector('.corps').innerHTML = c;
          Object.values(groupes).filter((g) => g.length >= 2).forEach((g, i) => A.graphiqueHeures(e.querySelector(`[data-gi="${i}"]`), g));
        } else {
          c += '<canvas class="graph haut"></canvas><p class="note">● Maximum ● Minimum ▮ Pluie ▮ Neige</p>';
          e.querySelector('.corps').innerHTML = c; A.graphiqueJours(e.querySelector('canvas'), m.jours.slice(0, o === 1 ? 7 : 14), auj);
        }
      } else {
        if (o === 0) {
          const jours = {}; m.semaine.forEach((h) => { const k = h.moment.toDateString(); (jours[k] = jours[k] || []).push(h); });
          c += '<div class="puces">' + Object.values(jours).map((g, i) => `<button data-saut="${i}">${A.jourCourt(g[0].moment, auj)}</button>`).join('') + '</div>';
          c += Object.values(jours).map((g, i) => `<div class="entete" id="j${i}">${A.nomJour(g[0].moment, auj)} ${A.dateLongue(g[0].moment)}</div>` + g.map((h) => {
            const q = h.neige >= .05 ? '❄ ' + A.neigeT(h.neige) : h.pluie >= .05 ? '💧 ' + A.pluieT(h.pluie) : '0 mm';
            return `<div class="ligne"><span class="hr">${h.moment.getHours()} h</span>${iconeMeteo(h.code, h.jour)}<div class="mil"><b>${A.T(h.temp)}</b>` +
              `<small>Ressenti ${A.T(h.ressenti)} · 💨 ${A.ventT(h.vent)}, rafales ${A.ventT(h.rafales)}</small></div><div class="dr"><span style="color:${h.prob ? 'var(--bleu-pluie)' : 'rgba(255,255,255,.4)'}">☂ ${h.prob} %</span><br>${q}</div></div>`;
          }).join('')).join('');
        } else if (o === 1) {
          c += m.jours.slice(0, 7).map((j) => `<div class="entete">${A.nomJour(j.date, auj)} ${A.dateLongue(j.date)} <span>${A.T(j.max)} / ${A.T(j.min)}</span></div>` +
            A.periodes(m, j.date).map((p) => `<div class="ligne"><span class="hr large2">${p.nom}</span>${iconeMeteo(p.code, p.jour)}<div class="mil"><b>${A.T(p.temp)}</b><small>Ressenti ${A.T(p.ressenti)}</small></div>` +
              `<div class="dr"><span style="color:var(--bleu-pluie)">☂ ${p.prob} %</span><br>${A.quantite(p.pluie, p.neige) || '0 mm'}</div></div>`).join('')).join('');
        } else {
          c += m.jours.map((j) => `<div class="ligne"><div class="hr large2">${A.nomJour(j.date, auj)}<small>${A.dateLongue(j.date)}${j.tendance ? ' <span class="tendance">tendance</span>' : ''}</small></div>` +
            `${iconeMeteo(j.code, true)}<b class="t14">${A.T(j.max)}</b>${iconeMeteo(A.codeNuit(m, j), false)}<span class="t14 pale">${A.T(j.min)}</span>` +
            `<div class="dr"><span style="color:var(--bleu-pluie)">☂ ${j.prob} %</span><br>${A.quantite(j.pluie, j.neige) || '0 mm'}</div></div>`).join('') +
            '<p class="note">« Tendance » : au-delà de 10 jours, le modèle canadien s\'arrête ; ces jours viennent d\'un autre modèle, moins fiable.</p>';
        }
        e.querySelector('.corps').innerHTML = c;
      }
      e.querySelectorAll('[data-o]').forEach((b) => b.addEventListener('click', () => { o = +b.dataset.o; dessiner(); }));
      e.querySelectorAll('[data-saut]').forEach((b) => b.addEventListener('click', () => { const t = e.querySelector('#j' + b.dataset.saut); if (t) t.scrollIntoView({ behavior: 'smooth' }); }));
    };
    e.querySelector('[data-g]').addEventListener('click', (ev) => { graphique = !graphique; ev.target.textContent = graphique ? '☰ Liste' : '📈 Graphique'; dessiner(); });
    dessiner();
    if (jour != null && o === 0) setTimeout(() => { const t = e.querySelector('#j' + jour); if (t) t.scrollIntoView(); }, 50);
  };

  // Graphiques (dessinés sur une toile)
  function preparer(cv, hauteur) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 340, h = hauteur;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const c = cv.getContext('2d'); c.scale(dpr, dpr); c.font = '11px -apple-system, sans-serif'; c.textAlign = 'center';
    return [c, w, h];
  }
  A.graphiqueHeures = function (cv, hs) {
    const [c, w, h] = preparer(cv, 170), bas = h - 18, haut = 18;
    const tmin = Math.min(...hs.map((x) => x.temp)), tmax = Math.max(...hs.map((x) => x.temp)), ec = Math.max(tmax - tmin, 1);
    const pas = w / (hs.length - 1), x = (i) => i * pas, y = (t) => bas - 30 - (t - tmin) / ec * (bas - 30 - haut);
    const qmax = Math.max(1, ...hs.map((v) => Math.max(v.pluie, v.neige)));
    hs.forEach((v, i) => { const q = Math.max(v.pluie, v.neige); if (q > .05) { const hh = q / qmax * 40;
      c.fillStyle = v.neige >= v.pluie ? 'rgba(255,255,255,.7)' : '#64B5F6'; c.fillRect(x(i) - pas * .35, bas - hh, pas * .7, hh); } });
    c.beginPath(); hs.forEach((v, i) => (i ? c.lineTo(x(i), y(v.temp)) : c.moveTo(x(i), y(v.temp))));
    c.strokeStyle = '#FFCC80'; c.lineWidth = 2.5; c.stroke();
    hs.forEach((v, i) => { if (i % 3) return; c.fillStyle = '#fff'; c.beginPath(); c.arc(x(i), y(v.temp), 3, 0, 7); c.fill();
      c.fillText(A.T(v.temp), Math.min(Math.max(x(i), 12), w - 12), y(v.temp) - 7); c.fillStyle = 'rgba(255,255,255,.8)';
      c.fillText(v.moment.getHours() + ' h', Math.min(Math.max(x(i), 12), w - 12), bas + 14); });
  };
  A.graphiqueJours = function (cv, js, auj) {
    const [c, w, h] = preparer(cv, 260), bas = h - 20, haut = 22, marge = 18;
    const tmin = Math.min(...js.map((j) => j.min)), tmax = Math.max(...js.map((j) => j.max)), ec = Math.max(tmax - tmin, 1);
    const pas = (w - 2 * marge) / (js.length - 1), x = (i) => marge + i * pas, y = (t) => bas - 50 - (t - tmin) / ec * (bas - 50 - haut);
    const qmax = Math.max(5, ...js.map((j) => Math.max(j.pluie, j.neige)));
    js.forEach((j, i) => { const q = Math.max(j.pluie, j.neige); if (q > .1) { const hh = q / qmax * 45;
      c.fillStyle = j.neige >= j.pluie / 10 ? 'rgba(255,255,255,.7)' : '#64B5F6'; c.fillRect(x(i) - pas * .25, bas - hh, pas * .5, hh); } });
    [['max', '#FFCC80'], ['min', '#90CAF9']].forEach(([k, coul]) => {
      c.beginPath(); js.forEach((j, i) => (i ? c.lineTo(x(i), y(j[k])) : c.moveTo(x(i), y(j[k])))); c.strokeStyle = coul; c.lineWidth = 2.5; c.stroke();
      js.forEach((j, i) => { c.fillStyle = coul; c.beginPath(); c.arc(x(i), y(j[k]), 3.5, 0, 7); c.fill(); c.fillText(A.T(j[k]), x(i), y(j[k]) - 7); });
    });
    c.fillStyle = 'rgba(255,255,255,.8)'; js.forEach((j, i) => c.fillText(A.jourCourt(j.date, auj).split(' ')[0], x(i), bas + 15));
  };

  // ---------------- Organiser l'écran ----------------
  A.actions.organiser = function () {
    const e = A.ouvrirEcran("Organiser l'écran", '', { fermer: () => A.afficher() });
    const d = A.disposition;
    const dessiner = () => {
      e.querySelector('.corps').innerHTML = '<p class="note">▲ ▼ pour déplacer · P N G pour la taille · 👁 pour cacher</p>' + d.ordre.map((id, i) => {
        const nom = (CARTES.find((c) => c[0] === id) || [id, id])[1], cache = d.caches.includes(id), t = d.tailles[id] == null ? 1 : d.tailles[id];
        return `<div class="org ${cache ? 'cache' : ''}"><button data-h="${i}">▲</button><button data-b="${i}">▼</button><span>${nom}</span>` +
          ['P', 'N', 'G'].map((l, k) => `<button class="taille ${t === k ? 'oui' : ''}" data-t="${id}:${k}">${l}</button>`).join('') +
          `<button data-c="${id}">${cache ? '🚫' : '👁'}</button></div>`;
      }).join('') + '<button class="large" data-reset>Remettre comme au départ</button>';
      const sauver = () => { A.ecrireMem('disposition', d); dessiner(); };
      e.querySelectorAll('[data-h]').forEach((b) => b.onclick = () => { const i = +b.dataset.h; if (i > 0) { d.ordre.splice(i - 1, 0, d.ordre.splice(i, 1)[0]); } sauver(); });
      e.querySelectorAll('[data-b]').forEach((b) => b.onclick = () => { const i = +b.dataset.b; if (i < d.ordre.length - 1) { d.ordre.splice(i + 1, 0, d.ordre.splice(i, 1)[0]); } sauver(); });
      e.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { const [id, k] = b.dataset.t.split(':'); d.tailles[id] = +k; sauver(); });
      e.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { const id = b.dataset.c; d.caches = d.caches.includes(id) ? d.caches.filter((x) => x !== id) : d.caches.concat(id); sauver(); });
      e.querySelector('[data-reset]').onclick = () => { d.ordre = CARTES.map((c) => c[0]); d.tailles = {}; d.caches = []; sauver(); };
    };
    dessiner();
  };

  // ---------------- Villes ----------------
  function afficherVilles(e) {
    const liste = e.querySelector('#liste-villes');
    liste.innerHTML = A.villes.map((v, i) =>
      `<div class="item-ville ${i === A.choix ? 'choisie' : ''}" data-i="${i}"><div><b>${v.gps ? '📍 ' : ''}${v.nom}</b><small>${v.region || ''}</small></div>` +
      (A.villes.length > 1 ? `<span class="x" data-x="${i}">✕</span>` : '') + '</div>').join('');
    liste.querySelectorAll('.item-ville').forEach((el) => el.addEventListener('click', (ev) => {
      const x = ev.target.dataset.x;
      if (x != null) { A.villes.splice(+x, 1); if (A.choix >= A.villes.length) A.choix = A.villes.length - 1; }
      else { A.choix = +el.dataset.i; e.remove(); A.actualiser(); }
      A.ecrireMem('villes', A.villes); A.ecrireMem('choix', A.choix); if (x != null) afficherVilles(e);
    }));
  }
  $('#btn-ville').addEventListener('click', () => {
    const e = A.ouvrirEcran('Mes villes', `<div id="liste-villes"></div><button class="large" data-gps>📍 Utiliser ma position</button>
      <h3>Ajouter une ville</h3><form class="recherche"><input placeholder="Ex. : Rimouski" autocomplete="off"><button type="submit">Chercher</button></form><div class="resultats"></div>`);
    afficherVilles(e);
    e.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = e.querySelector('input').value.trim(), res0 = e.querySelector('.resultats'); if (!q) return;
      res0.innerHTML = '<p class="note">Recherche…</p>';
      try {
        const rr = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=10&language=fr&format=json').then((x) => x.json());
        const res = (rr.results || []).sort((a, b) => (a.country_code !== 'CA') - (b.country_code !== 'CA'));
        res0.innerHTML = res.length ? res.map((v, i) => `<div class="item-ville" data-r="${i}"><div><b>${v.name}</b><small>${[v.admin1, v.country].filter(Boolean).join(', ')}</small></div><span>＋</span></div>`).join('')
          : '<p class="note">Aucune ville trouvée.</p>';
        res0.querySelectorAll('[data-r]').forEach((el) => el.addEventListener('click', () => {
          const v = res[+el.dataset.r];
          A.villes.push({ nom: v.name, region: [v.admin1, v.country].filter(Boolean).join(', '), lat: v.latitude, lon: v.longitude });
          A.choix = A.villes.length - 1; A.ecrireMem('villes', A.villes); A.ecrireMem('choix', A.choix); e.remove(); A.actualiser();
        }));
      } catch (err) { res0.innerHTML = '<p class="note">La recherche ne fonctionne pas pour le moment.</p>'; }
    });
    e.querySelector('[data-gps]').addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((p) => {
        A.villes = [{ nom: 'Ma position', region: '', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), gps: true }].concat(A.villes.filter((v) => !v.gps));
        A.choix = 0; A.ecrireMem('villes', A.villes); A.ecrireMem('choix', 0); e.remove(); A.actualiser();
      }, () => alert("La position n'est pas disponible. Vérifie l'autorisation de localisation pour Safari."));
    });
  });

  // ---------------- Paramètres ----------------
  function afficherReglages(e) {
    const choixHtml = (titre, cle, options) => `<h3>${titre}</h3><div class="choix">` +
      options.map(([v, n]) => `<button data-cle="${cle}" data-v="${v}" class="${String(r()[cle]) === String(v) ? 'oui' : ''}">${n}</button>`).join('') + '</div>';
    e.querySelector('.corps').innerHTML =
      `<button class="large" data-action="organiser">✏️ Organiser l'écran ›</button>` +
      choixHtml('🎨 Fond', 'fondAnime', [[true, 'Animé (suit la météo)'], [false, 'Couleur unie']]) +
      `<h3>🔲 Cartes : transparence (${Math.round(r().opacite * 100)} %)</h3><input id="opacite" type="range" min="0" max="1" step="0.05" value="${r().opacite}">` +
      choixHtml('🌡️ Température', 'temp', [['C', 'Celsius (°C)'], ['F', 'Fahrenheit (°F)']]) +
      choixHtml('💧 Pluie', 'pluie', [['mm', 'Millimètres'], ['cm', 'Centimètres'], ['po', 'Pouces']]) +
      choixHtml('❄️ Neige', 'neige', [['cm', 'Centimètres'], ['po', 'Pouces']]) +
      choixHtml('💨 Vent', 'vent', [['kmh', 'km/h'], ['mph', 'mi/h'], ['nd', 'Nœuds']]) +
      choixHtml('🌊 Hauteur des marées', 'uniteMaree', [['m', 'Mètres'], ['pi', 'Pieds']]) +
      choixHtml('🗑️ Mon jour de collecte (Montmagny)', 'jourCollecte', [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi']]) +
      `<h3>📱 Installer sur l'iPhone</h3><p class="note">Dans Safari : bouton Partager (carré avec une flèche) → « Sur l'écran d'accueil ».</p>` +
      `<p class="note">Version Web 2.2</p>`;
    e.querySelectorAll('[data-cle]').forEach((b) => b.addEventListener('click', () => {
      let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = +v;
      r()[b.dataset.cle] = v; A.ecrireMem('reglages', r()); Fond.afficher(r().fondAnime); afficherReglages(e); A.afficher();
    }));
    e.querySelector('#opacite').addEventListener('input', (ev) => { r().opacite = +ev.target.value; A.ecrireMem('reglages', r()); A.afficher();
      ev.target.previousElementSibling.textContent = `🔲 Cartes : transparence (${Math.round(r().opacite * 100)} %)`; });
  }
  $('#btn-reglages').addEventListener('click', () => { const e = A.ouvrirEcran('Paramètres', ''); afficherReglages(e); });
  $('#btn-actualiser').addEventListener('click', () => A.actualiser());

  // ---------------- Démarrage ----------------
  window.addEventListener('load', () => {
    Fond.afficher(r().fondAnime);
    A.actualiser();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  });
})();
