/**
 * Symbol definitions: SVG rendering, scaling, and metadata.
 * All symbols are drawn programmatically — no external SVG files.
 */

// ─── Scaling ────────────────────────────────────────────────────────────────

function getSymbolSize(zoom) {
  return Math.round(10 + (zoom - 2) * 4.5);
}

// ─── Affiliation Config ──────────────────────────────────────────────────────

const AFF = {
  friendly: { stroke: '#4a90b8', fill: 'rgba(74,144,184,0.12)', shape: 'rect' },
  enemy:    { stroke: '#e04040', fill: 'rgba(224,64,64,0.12)',   shape: 'diamond' },
  neutral:  { stroke: '#9c7a3a', fill: 'rgba(156,122,58,0.10)', shape: 'square' },
  unknown:  { stroke: '#7c4aad', fill: 'rgba(124,74,173,0.12)', shape: 'diamond' },
};

// ─── Echelon Marks ───────────────────────────────────────────────────────────

const ECHELON_MARKS = {
  team:      '•',
  squad:     '••',
  section:   '•••',
  platoon:   '|',
  company:   '||',
  battalion: '|||',
  regiment:  'X',
  brigade:   'XX',
  division:  'XXX',
  corps:     'XXXX',
};

// ─── Symbol Type Registry ────────────────────────────────────────────────────

const SYMBOL_TYPES = {
  // FRIENDLY
  'inf-f':     { label: 'Infantry',          aff: 'friendly', icon: drawInfantryIcon },
  'mech-f':    { label: 'Mech Infantry',      aff: 'friendly', icon: drawMechIcon },
  'armor-f':   { label: 'Armor',              aff: 'friendly', icon: drawArmorIcon },
  'arty-f':    { label: 'Artillery',          aff: 'friendly', icon: drawArtilleryIcon },
  'arty-sp-f': { label: 'SP Artillery',       aff: 'friendly', icon: drawSPArtilleryIcon },
  'arty-rkt-f':{ label: 'Rocket Artillery',   aff: 'friendly', icon: drawRocketArtilleryIcon },
  'avn-rw-f':  { label: 'Aviation (Rotary)',  aff: 'friendly', icon: drawRotaryWingIcon },
  'avn-fw-f':  { label: 'Aviation (Fixed)',   aff: 'friendly', icon: drawFixedWingIcon },
  'eng-f':     { label: 'Engineer',           aff: 'friendly', icon: drawEngineerIcon },
  'sig-f':     { label: 'Signal',             aff: 'friendly', icon: drawSignalIcon },
  'med-f':     { label: 'Medical',            aff: 'friendly', icon: drawMedicalIcon },
  'recon-f':   { label: 'Reconnaissance',     aff: 'friendly', icon: drawReconIcon },
  'ada-f':     { label: 'Air Defense',        aff: 'friendly', icon: drawADAIcon },
  'log-f':     { label: 'Logistics',          aff: 'friendly', icon: drawLogisticsIcon },
  'hq-co-f':   { label: 'HQ (Company)',       aff: 'friendly', icon: drawHQIcon },
  'hq-bn-f':   { label: 'HQ (Battalion)',     aff: 'friendly', icon: drawHQIcon },
  'hq-bde-f':  { label: 'HQ (Brigade)',       aff: 'friendly', icon: drawHQIcon },
  'hq-div-f':  { label: 'HQ (Division)',      aff: 'friendly', icon: drawHQIcon },
  'cp-f':      { label: 'Command Post',       aff: 'friendly', icon: drawCPIcon },
  'op-f':      { label: 'Observation Post',   aff: 'friendly', icon: drawOPIcon },

  // ENEMY
  'inf-e':     { label: 'Enemy Infantry',     aff: 'enemy', icon: drawInfantryIcon },
  'mech-e':    { label: 'Enemy Mech',         aff: 'enemy', icon: drawMechIcon },
  'armor-e':   { label: 'Enemy Armor',        aff: 'enemy', icon: drawArmorIcon },
  'arty-e':    { label: 'Enemy Artillery',    aff: 'enemy', icon: drawArtilleryIcon },
  'avn-e':     { label: 'Enemy Aviation',     aff: 'enemy', icon: drawRotaryWingIcon },
  'unk-e':     { label: 'Unknown',            aff: 'enemy', icon: drawUnknownIcon },
  'sus-e':     { label: 'Suspected',          aff: 'enemy', icon: drawSuspectedIcon },

  // NEUTRAL / UNKNOWN
  'unk-g':     { label: 'Unknown Ground',     aff: 'unknown',  icon: drawUnknownIcon },
  'civ':       { label: 'Civilian',           aff: 'neutral',  icon: drawCivilianIcon },
  'neu-f':     { label: 'Neutral Force',      aff: 'neutral',  icon: drawInfantryIcon },
};

// ─── Frame Builders ──────────────────────────────────────────────────────────

function buildFrame(aff, size) {
  const cfg = AFF[aff] || AFF.friendly;
  const s = size, sw = Math.max(1.5, size * 0.06);
  const pad = sw;

  if (cfg.shape === 'rect') {
    const w = s, h = Math.round(s * 0.65);
    return {
      svgW: w + sw * 2, svgH: h + sw * 2,
      frameX: pad, frameY: pad, frameW: w, frameH: h,
      shape: `<rect x="${pad}" y="${pad}" width="${w}" height="${h}" rx="2" fill="${cfg.fill}" stroke="${cfg.stroke}" stroke-width="${sw}"/>`,
      cx: pad + w / 2, cy: pad + h / 2,
    };
  }
  if (cfg.shape === 'diamond') {
    const w = s, h = Math.round(s * 0.75);
    const cx = pad + w / 2, cy = pad + h / 2;
    return {
      svgW: w + sw * 2, svgH: h + sw * 2,
      frameX: pad, frameY: pad, frameW: w, frameH: h,
      shape: `<polygon points="${cx},${pad} ${pad + w},${cy} ${cx},${pad + h} ${pad},${cy}" fill="${cfg.fill}" stroke="${cfg.stroke}" stroke-width="${sw}"/>`,
      cx, cy,
    };
  }
  // square (neutral)
  const w = s, h = s;
  return {
    svgW: w + sw * 2, svgH: h + sw * 2,
    frameX: pad, frameY: pad, frameW: w, frameH: h,
    shape: `<rect x="${pad}" y="${pad}" width="${w}" height="${h}" fill="${cfg.fill}" stroke="${cfg.stroke}" stroke-width="${sw}"/>`,
    cx: pad + w / 2, cy: pad + h / 2,
  };
}

// ─── Icon Draw Functions ──────────────────────────────────────────────────────

function drawInfantryIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.28;
  return `<line x1="${cx - s}" y1="${cy - s}" x2="${cx + s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + s}" y1="${cy - s}" x2="${cx - s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>`;
}

function drawMechIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.28, e = size * 0.1;
  return `<line x1="${cx - s}" y1="${cy - s}" x2="${cx + s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + s}" y1="${cy - s}" x2="${cx - s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <ellipse cx="${cx}" cy="${cy + s + e}" rx="${s * 0.7}" ry="${e * 0.8}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.04)}"/>`;
}

function drawArmorIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.18;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${size * 0.3}" ry="${r}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>`;
}

function drawArtilleryIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.15;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + r}" y1="${cy}" x2="${cx + r + size * 0.1}" y2="${cy - size * 0.12}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>`;
}

function drawSPArtilleryIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.15;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + r}" y1="${cy}" x2="${cx + r + size * 0.1}" y2="${cy - size * 0.12}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <ellipse cx="${cx}" cy="${cy + r + size * 0.08}" rx="${r * 0.8}" ry="${size * 0.07}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.04)}"/>`;
}

function drawRocketArtilleryIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.15;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + r}" y1="${cy - size * 0.06}" x2="${cx + r + size * 0.15}" y2="${cy - size * 0.18}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + r}" y1="${cy + size * 0.06}" x2="${cx + r + size * 0.12}" y2="${cy - size * 0.12}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.04)}"/>`;
}

function drawRotaryWingIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.25;
  return `<line x1="${cx - s}" y1="${cy}" x2="${cx + s}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(1.5, size * 0.06)}"/>
          <line x1="${cx}" y1="${cy - s * 0.5}" x2="${cx}" y2="${cy + s * 0.5}" stroke="${stroke}" stroke-width="${Math.max(1.5, size * 0.06)}"/>
          <circle cx="${cx}" cy="${cy}" r="${size * 0.06}" fill="${stroke}"/>`;
}

function drawFixedWingIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.28;
  return `<line x1="${cx - s}" y1="${cy}" x2="${cx + s}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(1.5, size * 0.06)}"/>
          <line x1="${cx - s * 0.4}" y1="${cy - s * 0.4}" x2="${cx + s * 0.5}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.04)}"/>
          <line x1="${cx + s * 0.4}" y1="${cy + s * 0.3}" x2="${cx + s}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.04)}"/>`;
}

function drawEngineerIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.25;
  return `<line x1="${cx - s}" y1="${cy - s}" x2="${cx + s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + s}" y1="${cy - s}" x2="${cx - s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <rect x="${cx - s * 0.25}" y="${cy - s * 0.25}" width="${s * 0.5}" height="${s * 0.5}" fill="${stroke}"/>`;
}

function drawSignalIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.18;
  return `<path d="M${cx - r * 1.4},${cy + r * 0.8} Q${cx},${cy - r * 1.2} ${cx + r * 1.4},${cy + r * 0.8}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <circle cx="${cx}" cy="${cy + r * 0.4}" r="${size * 0.06}" fill="${stroke}"/>`;
}

function drawMedicalIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.2;
  return `<line x1="${cx - s}" y1="${cy}" x2="${cx + s}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(2, size * 0.1)}"/>
          <line x1="${cx}" y1="${cy - s}" x2="${cx}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(2, size * 0.1)}"/>`;
}

function drawReconIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.25;
  return `<line x1="${cx - s}" y1="${cy - s}" x2="${cx + s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + s}" y1="${cy - s}" x2="${cx - s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <circle cx="${cx}" cy="${cy}" r="${size * 0.08}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.04)}"/>`;
}

function drawADAIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.16;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy - r * 1.8}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx - r * 0.5}" y1="${cy - r * 1.4}" x2="${cx + r * 0.5}" y2="${cy - r * 1.4}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.04)}"/>`;
}

function drawLogisticsIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.22;
  return `<rect x="${cx - s}" y="${cy - s * 0.6}" width="${s * 2}" height="${s * 1.2}" rx="2" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx - s * 0.4}" y1="${cy - s * 0.6}" x2="${cx - s * 0.4}" y2="${cy - s * 1.1}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <line x1="${cx + s * 0.4}" y1="${cy - s * 0.6}" x2="${cx + s * 0.4}" y2="${cy - s * 1.1}" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>`;
}

function drawHQIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.22;
  return `<line x1="${cx - s}" y1="${cy - s}" x2="${cx - s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1.5, size * 0.06)}"/>
          <line x1="${cx - s}" y1="${cy}" x2="${cx + s}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(1.5, size * 0.06)}"/>
          <line x1="${cx + s}" y1="${cy - s}" x2="${cx + s}" y2="${cy + s}" stroke="${stroke}" stroke-width="${Math.max(1.5, size * 0.06)}"/>`;
}

function drawCPIcon(cx, cy, fw, fh, stroke, size) {
  const s = size * 0.22;
  return `<text x="${cx}" y="${cy + s * 0.4}" text-anchor="middle" font-size="${size * 0.3}px" font-weight="bold" fill="${stroke}" font-family="monospace">CP</text>`;
}

function drawOPIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.18;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <circle cx="${cx}" cy="${cy}" r="${size * 0.06}" fill="${stroke}"/>`;
}

function drawUnknownIcon(cx, cy, fw, fh, stroke, size) {
  return `<text x="${cx}" y="${cy + size * 0.12}" text-anchor="middle" font-size="${size * 0.35}px" font-weight="bold" fill="${stroke}" font-family="monospace">?</text>`;
}

function drawSuspectedIcon(cx, cy, fw, fh, stroke, size) {
  return `<text x="${cx}" y="${cy + size * 0.12}" text-anchor="middle" font-size="${size * 0.35}px" font-weight="bold" fill="${stroke}" font-family="monospace">?</text>
          <text x="${cx}" y="${cy + size * 0.36}" text-anchor="middle" font-size="${size * 0.2}px" fill="${stroke}" font-family="monospace">SUS</text>`;
}

function drawCivilianIcon(cx, cy, fw, fh, stroke, size) {
  const r = size * 0.18;
  return `<circle cx="${cx}" cy="${cy - r * 0.3}" r="${r * 0.5}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>
          <path d="M${cx - r},${cy + r * 0.6} Q${cx},${cy - r * 0.2} ${cx + r},${cy + r * 0.6}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, size * 0.05)}"/>`;
}

// ─── Echelon SVG ─────────────────────────────────────────────────────────────

function echelonSvg(echelon, cx, y, stroke, size) {
  const mark = ECHELON_MARKS[echelon];
  if (!mark) return '';
  const fontSize = Math.max(8, size * 0.22);
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-size="${fontSize}px" font-weight="bold" fill="${stroke}" font-family="monospace" dominant-baseline="auto">${mark}</text>`;
}

// ─── Full Symbol SVG Builder ─────────────────────────────────────────────────

function buildSymbolSvg(unit, size) {
  const typeDef = SYMBOL_TYPES[unit.type] || SYMBOL_TYPES['inf-f'];
  const aff = unit.affiliation || typeDef.aff || 'friendly';
  const cfg = AFF[aff] || AFF.friendly;
  const frame = buildFrame(aff, size);
  const sw = Math.max(1.5, size * 0.06);
  const echelonH = size * 0.28;
  const totalH = frame.svgH + echelonH;
  const totalW = frame.svgW;
  const echY = echelonH - 2;

  const frameShifted = frame.shape.replace(
    /([xy]|cx|cy|x1|y1|x2|y2|points)="([^"]*)"/g,
    (m, attr, val) => {
      if (attr === 'points') {
        const shifted = val.split(' ').map(pt => {
          const [px, py] = pt.split(',').map(Number);
          return `${px},${py + echelonH}`;
        }).join(' ');
        return `${attr}="${shifted}"`;
      }
      if (attr === 'y' || attr === 'cy' || attr === 'y1' || attr === 'y2') {
        return `${attr}="${parseFloat(val) + echelonH}"`;
      }
      return m;
    }
  );

  const iconSvg = typeDef.icon(
    frame.cx, frame.cy + echelonH,
    frame.frameW, frame.frameH,
    cfg.stroke, size
  );

  const echSvg = unit.echelon
    ? echelonSvg(unit.echelon, frame.cx, echY, cfg.stroke, size)
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" overflow="visible">
    ${frameShifted}
    ${iconSvg}
    ${echSvg}
  </svg>`;
}

// ─── Marker Factory ───────────────────────────────────────────────────────────

function createMarker(unit, map) {
  const size = getSymbolSize(map.getZoom());
  const svgStr = buildSymbolSvg(unit, size);
  const label = unit.label || '';
  const typeDef = SYMBOL_TYPES[unit.type] || SYMBOL_TYPES['inf-f'];
  const aff = unit.affiliation || typeDef.aff || 'friendly';
  const cfg = AFF[aff];
  const frame = buildFrame(aff, size);
  const totalH = frame.svgH + size * 0.28;

  const html = `<div class="sym-wrapper" id="sym-${unit.id}" data-id="${unit.id}">
    <div class="sym-svg">${svgStr}</div>
    ${label ? `<div class="sym-label" style="color:${cfg.stroke}">${label}</div>` : ''}
  </div>`;

  const icon = L.divIcon({
    html,
    className: '',
    iconSize: [frame.svgW, totalH + (label ? 14 : 0)],
    iconAnchor: [frame.svgW / 2, totalH / 2 + size * 0.28 / 2],
  });

  const marker = L.marker(unit.latlng, { icon, draggable: true, title: typeDef.label });
  return marker;
}

// ─── Small Toolbar Preview ────────────────────────────────────────────────────

function buildPreviewSvg(type) {
  const typeDef = SYMBOL_TYPES[type];
  if (!typeDef) return '';
  const size = 22;
  const aff = typeDef.aff || 'friendly';
  const cfg = AFF[aff];
  const frame = buildFrame(aff, size);
  const w = frame.svgW, h = frame.svgH;
  const icon = typeDef.icon(frame.cx, frame.cy, frame.frameW, frame.frameH, cfg.stroke, size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">
    ${frame.shape}${icon}
  </svg>`;
}

window.SYMBOL_TYPES = SYMBOL_TYPES;
window.getSymbolSize = getSymbolSize;
window.buildSymbolSvg = buildSymbolSvg;
window.createMarker = createMarker;
window.buildPreviewSvg = buildPreviewSvg;
window.AFF = AFF;
window.ECHELON_MARKS = ECHELON_MARKS;
