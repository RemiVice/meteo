// Nos icônes météo dessinées (SVG), comme dans l'application Android
(function () {
  const soleil = (cx, cy, r) => {
    let rayons = '';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, d1 = r * 1.25, d2 = r * 1.6;
      rayons += `<line x1="${cx + Math.cos(a) * d1}" y1="${cy + Math.sin(a) * d1}" x2="${cx + Math.cos(a) * d2}" y2="${cy + Math.sin(a) * d2}" stroke="#FFC94A" stroke-width="3.5" stroke-linecap="round"/>`;
    }
    return rayons + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gs)"/>`;
  };
  const lune = (cx, cy, r) =>
    // Un croissant : le grand arc passe par la gauche, le petit revient moins loin
    `<path d="M${cx + r * 0.4} ${cy - r * 0.92} A${r} ${r} 0 1 0 ${cx + r * 0.4} ${cy + r * 0.92} A${r * 1.3} ${r * 1.3} 0 0 1 ${cx + r * 0.4} ${cy - r * 0.92}Z" fill="#F6EDC4"/>`;
  const nuage = (cx, cy, w, sombre) => {
    const g = sombre ? 'url(#gn2)' : 'url(#gn1)';
    return `<g fill="${g}"><circle cx="${cx - w * .24}" cy="${cy}" r="${w * .2}"/><circle cx="${cx + w * .02}" cy="${cy - w * .1}" r="${w * .28}"/>` +
      `<circle cx="${cx + w * .27}" cy="${cy + w * .02}" r="${w * .19}"/><rect x="${cx - w * .46}" y="${cy}" width="${w * .92}" height="${w * .22}" rx="${w * .11}"/></g>`;
  };
  const gouttes = (n, petites) => {
    let s = '', debut = 50 - (n - 1) * 8;
    for (let i = 0; i < n; i++) {
      const x = debut + i * 16, y = i % 2 ? 76 : 70, l = petites ? 6 : 11;
      s += `<line x1="${x + 3}" y1="${y}" x2="${x - 1}" y2="${y + l}" stroke="#5AB4F0" stroke-width="${petites ? 4.5 : 4}" stroke-linecap="round"/>`;
    }
    return s;
  };
  const flocons = (n) => {
    let s = '', debut = 50 - (n - 1) * 9;
    for (let i = 0; i < n; i++) {
      const cx = debut + i * 18, cy = i % 2 ? 84 : 76, r = 6.5;
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI / 3, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
        s += `<line x1="${cx - dx}" y1="${cy - dy}" x2="${cx + dx}" y2="${cy + dy}" stroke="#EAF6FF" stroke-width="2.6" stroke-linecap="round"/>`;
      }
    }
    return s;
  };
  const defs = `<defs><radialGradient id="gs"><stop offset="0" stop-color="#FFF0A8"/><stop offset=".6" stop-color="#FFC23D"/><stop offset="1" stop-color="#F7A21B"/></radialGradient>
    <linearGradient id="gn1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#D6DEE8"/></linearGradient>
    <linearGradient id="gn2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B4BCC8"/><stop offset="1" stop-color="#808A99"/></linearGradient></defs>`;

  window.iconeMeteo = function (code, jour) {
    const astre = (cx, cy, r) => jour ? soleil(cx, cy, r) : lune(cx, cy, r);
    let c;
    switch (true) {
      case code === 0: c = astre(50, 50, 26); break;
      case code === 1: c = astre(44, 44, 24) + nuage(66, 70, 44, false); break;
      case code === 2: c = astre(36, 36, 20) + nuage(56, 62, 70, false); break;
      case code === 3: c = nuage(62, 42, 56, true) + nuage(44, 60, 70, false); break;
      case code === 45 || code === 48: c = nuage(50, 40, 70, true) +
        [66, 78, 90].map((y, i) => `<line x1="${18 + i * 6}" y1="${y}" x2="${82 - i * 4}" y2="${y}" stroke="#B8C2CC" stroke-width="5" stroke-linecap="round"/>`).join(''); break;
      case [51, 53, 55].includes(code): c = nuage(50, 42, 74, false) + gouttes(3, true); break;
      case [56, 57, 66, 67].includes(code): c = nuage(50, 42, 74, true) + gouttes(2, false) + '<circle cx="42" cy="86" r="3.5" fill="#B2F0FF"/><circle cx="62" cy="84" r="3.5" fill="#B2F0FF"/>'; break;
      case [61, 63, 65].includes(code): c = nuage(50, 42, 74, code === 65) + gouttes(code === 61 ? 3 : code === 63 ? 4 : 5, false); break;
      case [80, 81, 82].includes(code): c = (jour ? soleil(32, 30, 16) : '') + nuage(56, 44, 70, code === 82) + gouttes(code === 80 ? 3 : 4, false); break;
      case [71, 73, 75, 77].includes(code): c = nuage(50, 42, 74, false) + flocons(code === 73 ? 3 : code === 75 ? 4 : 2); break;
      case [85, 86].includes(code): c = (jour ? soleil(32, 30, 16) : '') + nuage(56, 44, 70, false) + flocons(code === 85 ? 2 : 4); break;
      case [95, 96, 99].includes(code): c = nuage(50, 40, 76, true) + '<path d="M54 52L40 74H50L44 94L64 66H53L60 52Z" fill="#FFD54F"/>' + gouttes(2, false); break;
      default: c = nuage(50, 50, 70, false);
    }
    return `<svg class="icone" viewBox="0 0 100 100">${defs}${c}</svg>`;
  };

  window.descriptionMeteo = function (code) {
    if (code === 0) return 'Ciel dégagé';
    if (code === 1) return 'Généralement dégagé';
    if (code === 2) return 'Partiellement nuageux';
    if (code === 3) return 'Nuageux';
    if (code === 45 || code === 48) return 'Brouillard';
    if ([51, 53, 55].includes(code)) return 'Bruine';
    if ([56, 57].includes(code)) return 'Bruine verglaçante';
    if ([61, 63, 65].includes(code)) return 'Pluie';
    if ([66, 67].includes(code)) return 'Pluie verglaçante';
    if ([71, 73, 75, 77].includes(code)) return 'Neige';
    if ([80, 81, 82].includes(code)) return 'Averses de pluie';
    if ([85, 86].includes(code)) return 'Averses de neige';
    if ([95, 96, 99].includes(code)) return 'Orages';
    return 'Inconnu';
  };
})();
