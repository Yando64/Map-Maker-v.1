/**
 * MIL-STD-2525D / FM 1-02.2 symbol definitions.
 * All icons drawn programmatically — no external files.
 *
 * Icon shapes follow the standard precisely:
 *   Infantry      – diagonal saltire (X) corner-to-corner
 *   Armor         – solid filled oval (horizontal)
 *   Artillery     – solid filled circle (dot)
 *   Mechanized    – unit icon + small oval below frame (tracks)
 *   Motorized     – unit icon + small wheel circle below frame
 *   Cavalry/Recon – single diagonal slash
 *   Aviation FW   – swept-wing aircraft silhouette
 *   Aviation RW   – rotor disc with blades
 *   Engineer      – castle battlement silhouette
 *   Signal        – diagonal antenna line + arc
 *   Medical       – Greek cross (+)
 *   Air Defense   – upward semicircle arc
 *   Special Forces– vertical filled rectangle tab
 *   Military Intel– forked lightning bolt
 *   Military Police– shield outline
 *   CBRN          – three overlapping circles (hazard)
 *   Antiarmor     – rightward-pointing filled triangle/arrow
 *   Airborne      – infantry X + parachute arc below
 *   Air Assault   – infantry X + rotor arc above
 *   Logistics     – open rectangle with vertical bar (supply)
 *   Finance       – dollar sign
 *   Psyop         – three wavy lines (broadcast waves)
 *   Civil Affairs – scales of justice
 */

// ─── Scaling ─────────────────────────────────────────────────────────────────
function getSymbolSize(zoom) {
  return Math.round(10 + (zoom - 2) * 4.5);
}

// ─── Affiliation frames ───────────────────────────────────────────────────────
const AFF = {
  friendly: { stroke: '#4a90b8', fill: 'rgba(128,224,255,0.18)', shape: 'rect'    },
  enemy:    { stroke: '#e04040', fill: 'rgba(255,128,128,0.18)', shape: 'diamond' },
  neutral:  { stroke: '#9c7a3a', fill: 'rgba(255,220,100,0.15)', shape: 'square'  },
  unknown:  { stroke: '#7c4aad', fill: 'rgba(196,128,255,0.15)', shape: 'diamond' },
};

// ─── Echelon marks ────────────────────────────────────────────────────────────
const ECHELON_MARKS = {
  team: '·', squad: '··', section: '···',
  platoon: '|', company: '||', battalion: '|||',
  regiment: 'X', brigade: 'XX', division: 'XXX', corps: 'XXXX',
};

// ─── Frame geometry ───────────────────────────────────────────────────────────
function buildFrame(aff, size) {
  const cfg = AFF[aff] || AFF.friendly;
  const sw  = Math.max(1.5, size * 0.06);
  const p   = sw;

  if (cfg.shape === 'rect') {
    const w = size, h = Math.round(size * 0.65);
    return { svgW: w+p*2, svgH: h+p*2, shape:
      `<rect x="${p}" y="${p}" width="${w}" height="${h}" rx="2"
       fill="${cfg.fill}" stroke="${cfg.stroke}" stroke-width="${sw}"/>`,
      cx: p+w/2, cy: p+h/2, fw: w, fh: h, frameX: p, frameY: p };
  }
  if (cfg.shape === 'diamond') {
    const w = size, h = Math.round(size*0.78);
    const cx = p+w/2, cy = p+h/2;
    return { svgW: w+p*2, svgH: h+p*2, shape:
      `<polygon points="${cx},${p} ${p+w},${cy} ${cx},${p+h} ${p},${cy}"
       fill="${cfg.fill}" stroke="${cfg.stroke}" stroke-width="${sw}"/>`,
      cx, cy, fw: w, fh: h, frameX: p, frameY: p };
  }
  // square (neutral)
  const w = size;
  return { svgW: w+p*2, svgH: w+p*2, shape:
    `<rect x="${p}" y="${p}" width="${w}" height="${w}"
     fill="${cfg.fill}" stroke="${cfg.stroke}" stroke-width="${sw}"/>`,
    cx: p+w/2, cy: p+w/2, fw: w, fh: w, frameX: p, frameY: p };
}

// ─── Icon library ─────────────────────────────────────────────────────────────
// Each function receives (cx, cy, fw, fh, stroke, size) and returns SVG string.
// fw/fh = frame inner width/height. cx/cy = frame center.

const lw = (size) => Math.max(1.2, size * 0.055);

// Infantry – saltire X corner-to-corner
function iInfantry(cx, cy, fw, fh, s, sz) {
  const mx=fw*0.42, my=fh*0.38, w=lw(sz);
  return `<line x1="${cx-mx}" y1="${cy-my}" x2="${cx+mx}" y2="${cy+my}" stroke="${s}" stroke-width="${w}" stroke-linecap="round"/>
          <line x1="${cx+mx}" y1="${cy-my}" x2="${cx-mx}" y2="${cy+my}" stroke="${s}" stroke-width="${w}" stroke-linecap="round"/>`;
}

// Armor – filled solid oval
function iArmor(cx, cy, fw, fh, s, sz) {
  const rx=fw*0.38, ry=fh*0.22;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${s}" stroke="none"/>`;
}

// Artillery (field/towed) – solid filled circle
function iArtillery(cx, cy, fw, fh, s, sz) {
  const r=Math.min(fw,fh)*0.18;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s}" stroke="none"/>`;
}

// Mechanized Infantry – saltire X + tracks oval below frame
function iMech(cx, cy, fw, fh, s, sz) {
  return iInfantry(cx, cy, fw, fh, s, sz) + iTrackBelow(cx, cy, fw, fh, s, sz);
}

// Motorized Infantry – saltire X + wheel below frame
function iMotorized(cx, cy, fw, fh, s, sz) {
  return iInfantry(cx, cy, fw, fh, s, sz) + iWheelBelow(cx, cy, fw, fh, s, sz);
}

// Mechanized Armor – armor oval + tracks
function iMechArmor(cx, cy, fw, fh, s, sz) {
  return iArmor(cx, cy, fw, fh, s, sz) + iTrackBelow(cx, cy, fw, fh, s, sz);
}

// Self-Propelled Artillery – dot + tracks
function iSPArty(cx, cy, fw, fh, s, sz) {
  return iArtillery(cx, cy, fw, fh, s, sz) + iTrackBelow(cx, cy, fw, fh, s, sz);
}

// Rocket Artillery – dot + 3 upward lines (rockets)
function iRocketArty(cx, cy, fw, fh, s, sz) {
  const r=Math.min(fw,fh)*0.15, w=lw(sz), sp=fw*0.12, ht=fh*0.28;
  return `<circle cx="${cx}" cy="${cy+fh*0.1}" r="${r}" fill="${s}" stroke="none"/>
          <line x1="${cx-sp}" y1="${cy-r-2}" x2="${cx-sp}" y2="${cy-r-2-ht}" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx}"    y1="${cy-r-2}" x2="${cx}"    y2="${cy-r-2-ht*1.15}" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx+sp}" y1="${cy-r-2}" x2="${cx+sp}" y2="${cy-r-2-ht}" stroke="${s}" stroke-width="${w}"/>`;
}

// Mortar – semicircle open at bottom
function iMortar(cx, cy, fw, fh, s, sz) {
  const r=fh*0.28, w=lw(sz);
  return `<path d="M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy+r*0.5}" stroke="${s}" stroke-width="${w}"/>`;
}

// Cavalry / Armored Cavalry – diagonal line only (upper-left to lower-right)
function iCavalry(cx, cy, fw, fh, s, sz) {
  const mx=fw*0.4, my=fh*0.35, w=lw(sz);
  return `<line x1="${cx-mx}" y1="${cy-my}" x2="${cx+mx}" y2="${cy+my}" stroke="${s}" stroke-width="${w}" stroke-linecap="round"/>`;
}

// Armored Cavalry – armor oval + diagonal
function iArmoredCav(cx, cy, fw, fh, s, sz) {
  return iArmor(cx, cy, fw, fh, s, sz) + iCavalry(cx, cy, fw, fh, s, sz);
}

// Aviation Fixed Wing – swept-wing silhouette
function iFixedWing(cx, cy, fw, fh, s, sz) {
  const sx=fw*0.44, sy=fh*0.28, w=lw(sz);
  return `<path d="M${cx},${cy-sy*0.2} L${cx-sx},${cy+sy*0.7} L${cx-sx*0.1},${cy+sy*0.1}
          L${cx},${cy+sy*0.5} L${cx+sx*0.1},${cy+sy*0.1} L${cx+sx},${cy+sy*0.7} Z"
          fill="${s}" stroke="none"/>`;
}

// Aviation Rotary Wing – two crossed rotor blades through center disc
function iRotaryWing(cx, cy, fw, fh, s, sz) {
  const r=fw*0.36, dr=fw*0.07, w=lw(sz);
  return `<line x1="${cx-r}" y1="${cy}" x2="${cx+r}" y2="${cy}" stroke="${s}" stroke-width="${w*1.5}" stroke-linecap="round"/>
          <circle cx="${cx}" cy="${cy}" r="${dr}" fill="${s}" stroke="none"/>`;
}

// Engineer – castle battlement (3 merlons)
function iEngineer(cx, cy, fw, fh, s, sz) {
  const w=fw*0.44, h=fh*0.45, bw=w*0.28, bh=h*0.45, w2=lw(sz);
  const x0=cx-w/2, y0=cy-h/2, y1=y0+bh, yb=y0+h;
  return `<polyline points="
    ${x0},${yb} ${x0},${y1} ${x0+bw*0.2},${y1} ${x0+bw*0.2},${y0} ${x0+bw*1.2},${y0}
    ${x0+bw*1.2},${y1} ${x0+bw*1.8},${y1} ${x0+bw*1.8},${y0} ${x0+bw*2.8},${y0}
    ${x0+bw*2.8},${y1} ${cx+w/2},${y1} ${cx+w/2},${yb} Z"
    fill="${s}" stroke="none"/>`;
}

// Signal – diagonal antenna + arc
function iSignal(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), r=fh*0.22;
  return `<line x1="${cx-fw*0.12}" y1="${cy+fh*0.18}" x2="${cx+fw*0.28}" y2="${cy-fh*0.35}" stroke="${s}" stroke-width="${w}" stroke-linecap="round"/>
          <path d="M${cx+fw*0.05},${cy-fh*0.15} A${r},${r} 0 0,1 ${cx+fw*0.3},${cy-fh*0.28}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

// Medical – Greek cross
function iMedical(cx, cy, fw, fh, s, sz) {
  const a=fw*0.18, b=fh*0.3;
  return `<polygon points="${cx-a},${cy-b} ${cx+a},${cy-b} ${cx+a},${cy-a} ${cx+b},${cy-a}
          ${cx+b},${cy+a} ${cx+a},${cy+a} ${cx+a},${cy+b} ${cx-a},${cy+b}
          ${cx-a},${cy+a} ${cx-b},${cy+a} ${cx-b},${cy-a} ${cx-a},${cy-a} Z"
          fill="${s}" stroke="none"/>`;
}

// Air Defense – upward semicircle arc
function iAirDefense(cx, cy, fw, fh, s, sz) {
  const r=fh*0.32, w=lw(sz);
  return `<path d="M${cx-r},${cy+fh*0.1} A${r},${r} 0 0,1 ${cx+r},${cy+fh*0.1}" fill="none" stroke="${s}" stroke-width="${w*1.3}"/>
          <line x1="${cx}" y1="${cy+fh*0.1}" x2="${cx}" y2="${cy-fh*0.28}" stroke="${s}" stroke-width="${w}"/>`;
}

// Special Forces – vertical filled rectangle tab
function iSpecialForces(cx, cy, fw, fh, s, sz) {
  const w=fw*0.22, h=fh*0.6;
  return `<rect x="${cx-w/2}" y="${cy-h/2}" width="${w}" height="${h}" fill="${s}" stroke="none" rx="1"/>`;
}

// Military Intelligence – forked lightning bolt
function iMilIntel(cx, cy, fw, fh, s, sz) {
  const w=lw(sz);
  const x1=cx+fw*0.1, y1=cy-fh*0.35;
  const x2=cx-fw*0.05, y2=cy+fh*0.02;
  const x3=cx+fw*0.1, y3=cy+fh*0.02;
  const x4=cx-fw*0.1, y4=cy+fh*0.35;
  return `<polyline points="${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}"
          fill="none" stroke="${s}" stroke-width="${w*1.4}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// Military Police – shield outline
function iMilPolice(cx, cy, fw, fh, s, sz) {
  const sw=fw*0.35, sh=fh*0.55, w=lw(sz);
  return `<path d="M${cx},${cy+sh/2} L${cx-sw/2},${cy} L${cx-sw/2},${cy-sh/2} L${cx},${cy-sh/2-sw*0.1}
          L${cx+sw/2},${cy-sh/2} L${cx+sw/2},${cy} Z"
          fill="none" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>`;
}

// CBRN – three overlapping hazard circles
function iCBRN(cx, cy, fw, fh, s, sz) {
  const r=fh*0.18, w=lw(sz), os=r*0.7;
  return `<circle cx="${cx}"    cy="${cy-os*0.5}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <circle cx="${cx-os}" cy="${cy+os*0.4}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <circle cx="${cx+os}" cy="${cy+os*0.4}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

// Antiarmor – rightward-pointing filled chevron/arrow
function iAntiArmor(cx, cy, fw, fh, s, sz) {
  const sx=fw*0.38, sy=fh*0.3;
  return `<polygon points="${cx-sx},${cy-sy} ${cx+sx*0.4},${cy} ${cx-sx},${cy+sy}"
          fill="${s}" stroke="none"/>`;
}

// Airborne – infantry X + parachute arc below
function iAirborne(cx, cy, fw, fh, s, sz) {
  return iInfantry(cx, cy-fh*0.1, fw, fh*0.7, s, sz) +
    `<path d="M${cx-fw*0.32},${cy+fh*0.22} A${fw*0.32},${fh*0.25} 0 0,1 ${cx+fw*0.32},${cy+fh*0.22}" fill="none" stroke="${s}" stroke-width="${lw(sz)}"/>
     <line x1="${cx-fw*0.32}" y1="${cy+fh*0.22}" x2="${cx-fw*0.1}" y2="${cy+fh*0.38}" stroke="${s}" stroke-width="${lw(sz)}"/>
     <line x1="${cx+fw*0.32}" y1="${cy+fh*0.22}" x2="${cx+fw*0.1}" y2="${cy+fh*0.38}" stroke="${s}" stroke-width="${lw(sz)}"/>`;
}

// Air Assault – infantry X + rotor arc above center
function iAirAssault(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), r=fw*0.32;
  return iInfantry(cx, cy+fh*0.05, fw, fh*0.75, s, sz) +
    `<line x1="${cx-r}" y1="${cy-fh*0.25}" x2="${cx+r}" y2="${cy-fh*0.25}" stroke="${s}" stroke-width="${w*1.4}" stroke-linecap="round"/>
     <circle cx="${cx}" cy="${cy-fh*0.25}" r="${fw*0.05}" fill="${s}"/>`;
}

// Logistics/Supply – open rectangle with vertical divider
function iLogistics(cx, cy, fw, fh, s, sz) {
  const bw=fw*0.5, bh=fh*0.45, w=lw(sz);
  return `<rect x="${cx-bw/2}" y="${cy-bh/2}" width="${bw}" height="${bh}"
          fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx}" y1="${cy-bh/2}" x2="${cx}" y2="${cy+bh/2}" stroke="${s}" stroke-width="${w}"/>`;
}

// Finance – dollar sign
function iFinance(cx, cy, fw, fh, s, sz) {
  const fs=Math.max(8, sz*0.32);
  return `<text x="${cx}" y="${cy+fs*0.38}" text-anchor="middle" font-size="${fs}px" font-weight="bold" fill="${s}" font-family="monospace">$</text>`;
}

// Psychological Operations – broadcast waves
function iPsyop(cx, cy, fw, fh, s, sz) {
  const w=lw(sz);
  const r1=fw*0.16, r2=fw*0.28, r3=fw*0.40;
  return `<path d="M${cx-r1},${cy} A${r1},${r1} 0 0,0 ${cx+r1},${cy}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <path d="M${cx-r2},${cy-fh*0.08} A${r2},${r2*0.7} 0 0,0 ${cx+r2},${cy-fh*0.08}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <path d="M${cx-r3},${cy-fh*0.2} A${r3},${r3*0.7} 0 0,0 ${cx+r3},${cy-fh*0.2}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

// Civil Affairs – scales (balance)
function iCivilAffairs(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), bw=fw*0.38, arm=fw*0.3, bs=fw*0.1;
  return `<line x1="${cx}" y1="${cy-fh*0.32}" x2="${cx}" y2="${cy+fh*0.2}" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx-arm}" y1="${cy-fh*0.08}" x2="${cx+arm}" y2="${cy-fh*0.08}" stroke="${s}" stroke-width="${w}"/>
          <path d="M${cx-arm-bs},${cy-fh*0.08} A${bs},${bs*0.7} 0 0,0 ${cx-arm+bs},${cy-fh*0.08}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <path d="M${cx+arm-bs},${cy-fh*0.08} A${bs},${bs*0.7} 0 0,0 ${cx+arm+bs},${cy-fh*0.08}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

// Headquarters – HQ flag/staff indicator (line extending from bottom of frame)
function iHQ(cx, cy, fw, fh, s, sz) {
  // HQ symbols show a staff line below; internally just the parent unit icon
  return `<text x="${cx}" y="${cy+sz*0.13}" text-anchor="middle" font-size="${Math.max(7,sz*0.26)}px" font-weight="bold" fill="${s}" font-family="monospace">HQ</text>`;
}

// Command Post
function iCP(cx, cy, fw, fh, s, sz) {
  return `<text x="${cx}" y="${cy+sz*0.13}" text-anchor="middle" font-size="${Math.max(7,sz*0.26)}px" font-weight="bold" fill="${s}" font-family="monospace">CP</text>`;
}

// Observation Post
function iOP(cx, cy, fw, fh, s, sz) {
  const r=fh*0.2, w=lw(sz);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <circle cx="${cx}" cy="${cy}" r="${fw*0.06}" fill="${s}"/>`;
}

// Unknown / unidentified
function iUnknown(cx, cy, fw, fh, s, sz) {
  return `<text x="${cx}" y="${cy+sz*0.13}" text-anchor="middle" font-size="${Math.max(9,sz*0.38)}px" font-weight="bold" fill="${s}" font-family="serif">?</text>`;
}

// Suspected
function iSuspected(cx, cy, fw, fh, s, sz) {
  return `<text x="${cx}" y="${cy+sz*0.05}" text-anchor="middle" font-size="${Math.max(8,sz*0.32)}px" font-weight="bold" fill="${s}" font-family="serif">?</text>
          <text x="${cx}" y="${cy+sz*0.32}" text-anchor="middle" font-size="${Math.max(6,sz*0.18)}px" fill="${s}" font-family="monospace">SUS</text>`;
}

// Civilian
function iCivilian(cx, cy, fw, fh, s, sz) {
  const r=fh*0.2, w=lw(sz);
  return `<circle cx="${cx}" cy="${cy-r*0.4}" r="${r*0.55}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <path d="M${cx-r},${cy+r*0.6} Q${cx},${cy} ${cx+r},${cy+r*0.6}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

// Ranger – infantry + small filled diamond inside
function iRanger(cx, cy, fw, fh, s, sz) {
  const d=fh*0.18;
  return iInfantry(cx, cy, fw, fh, s, sz) +
    `<polygon points="${cx},${cy-d} ${cx+d*0.7},${cy} ${cx},${cy+d} ${cx-d*0.7},${cy}" fill="${s}"/>`;
}

// ─── Track / wheel decorators ─────────────────────────────────────────────────
function iTrackBelow(cx, cy, fw, fh, s, sz) {
  const w=lw(sz)*0.8, oy=cy+fh*0.62;
  return `<ellipse cx="${cx}" cy="${oy}" rx="${fw*0.3}" ry="${fh*0.1}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}
function iWheelBelow(cx, cy, fw, fh, s, sz) {
  const w=lw(sz)*0.8, oy=cy+fh*0.58;
  return `<circle cx="${cx}" cy="${oy}" r="${fh*0.12}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

// ─── Equipment / Installation icons (point features, no frame) ───────────────

function iTank(cx, cy, fw, fh, s, sz) {
  const bw=fw*0.6, bh=fh*0.28, tw=fw*0.22, th=fh*0.18;
  return `<rect x="${cx-bw/2}" y="${cy-bh/2}" width="${bw}" height="${bh}" fill="${s}" rx="3"/>
          <rect x="${cx-tw/2}" y="${cy-bh/2-th}" width="${tw}" height="${th}" fill="${s}" rx="1"/>
          <line x1="${cx}" y1="${cy-bh/2-th}" x2="${cx+fw*0.38}" y2="${cy-bh/2-th*0.5}" stroke="${s}" stroke-width="${lw(sz)*1.2}" stroke-linecap="round"/>`;
}

function iHowitzer(cx, cy, fw, fh, s, sz) {
  const w=lw(sz);
  return `<circle cx="${cx-fw*0.1}" cy="${cy}" r="${fh*0.25}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx-fw*0.1+fh*0.22}" y1="${cy-fh*0.1}" x2="${cx+fw*0.44}" y2="${cy-fh*0.32}" stroke="${s}" stroke-width="${w*1.5}" stroke-linecap="round"/>
          <line x1="${cx-fw*0.42}" y1="${cy+fh*0.25}" x2="${cx+fw*0.1}" y2="${cy+fh*0.25}" stroke="${s}" stroke-width="${w}"/>`;
}

function iHelicopter(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), r=fw*0.36, br=fw*0.15;
  return `<line x1="${cx-r}" y1="${cy-fh*0.08}" x2="${cx+r}" y2="${cy-fh*0.08}" stroke="${s}" stroke-width="${w*1.5}" stroke-linecap="round"/>
          <ellipse cx="${cx}" cy="${cy+fh*0.12}" rx="${br}" ry="${fh*0.18}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx+br}" y1="${cy+fh*0.12}" x2="${cx+fw*0.36}" y2="${cy+fh*0.28}" stroke="${s}" stroke-width="${w}"/>`;
}

function iAircraft(cx, cy, fw, fh, s, sz) {
  return iFixedWing(cx, cy, fw, fh, s, sz);
}

function iIFV(cx, cy, fw, fh, s, sz) {
  // Infantry Fighting Vehicle – box body with gun
  const w=lw(sz), bw=fw*0.54, bh=fh*0.3;
  return `<rect x="${cx-bw/2}" y="${cy-bh/2}" width="${bw}" height="${bh}" fill="none" stroke="${s}" stroke-width="${w}" rx="2"/>
          <line x1="${cx+bw*0.15}" y1="${cy-bh/2}" x2="${cx+fw*0.4}" y2="${cy-fh*0.36}" stroke="${s}" stroke-width="${w*1.2}" stroke-linecap="round"/>`;
}

function iAirfield(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), r=fw*0.35;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx-r}" y1="${cy}" x2="${cx+r}" y2="${cy}" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx-r*0.7}" y1="${cy-r*0.7}" x2="${cx+r*0.7}" y2="${cy+r*0.7}" stroke="${s}" stroke-width="${w}"/>`;
}

function iHelipad(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), r=fw*0.35, fs=Math.max(7, sz*0.28);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <text x="${cx}" y="${cy+fs*0.38}" text-anchor="middle" font-size="${fs}px" font-weight="bold" fill="${s}" font-family="sans-serif">H</text>`;
}

function iSupplyPoint(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), bw=fw*0.5, bh=fh*0.5;
  return `<rect x="${cx-bw/2}" y="${cy-bh/2}" width="${bw}" height="${bh}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx-bw/2}" y1="${cy}" x2="${cx+bw/2}" y2="${cy}" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx}" y1="${cy-bh/2}" x2="${cx}" y2="${cy+bh/2}" stroke="${s}" stroke-width="${w}"/>`;
}

function iFOB(cx, cy, fw, fh, s, sz) {
  const w=lw(sz), fs=Math.max(6, sz*0.22);
  return `<rect x="${cx-fw*0.38}" y="${cy-fh*0.38}" width="${fw*0.76}" height="${fh*0.76}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <text x="${cx}" y="${cy+fs*0.38}" text-anchor="middle" font-size="${fs}px" font-weight="bold" fill="${s}" font-family="monospace">FOB</text>`;
}

function iMTF(cx, cy, fw, fh, s, sz) {  // Medical Treatment Facility
  return iMedical(cx, cy, fw, fh, s, sz);
}

function iASP(cx, cy, fw, fh, s, sz) {  // Ammo Supply Point
  const w=lw(sz), r=fh*0.28;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <text x="${cx}" y="${cy+Math.max(5,sz*0.18)*0.38}" text-anchor="middle" font-size="${Math.max(5,sz*0.18)}px" font-weight="bold" fill="${s}" font-family="monospace">A</text>`;
}

// ─── Generic graphic icons ────────────────────────────────────────────────────

function iPointMarker(cx, cy, fw, fh, s, sz) {
  const r=fw*0.18, w=lw(sz);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx-fw*0.3}" y1="${cy}" x2="${cx+fw*0.3}" y2="${cy}" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx}" y1="${cy-fh*0.3}" x2="${cx}" y2="${cy+fh*0.3}" stroke="${s}" stroke-width="${w}"/>`;
}

function iTarget(cx, cy, fw, fh, s, sz) {
  const r=fw*0.35, w=lw(sz);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <circle cx="${cx}" cy="${cy}" r="${r*0.55}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <circle cx="${cx}" cy="${cy}" r="${fw*0.06}" fill="${s}"/>`;
}

function iObjective(cx, cy, fw, fh, s, sz) {
  const rx=fw*0.4, ry=fh*0.3, w=lw(sz);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${s}" stroke-width="${w}" stroke-dasharray="4,2"/>`;
}

function iDecisionPoint(cx, cy, fw, fh, s, sz) {
  const r=fw*0.25, w=lw(sz);
  return `<polygon points="${cx},${cy-r} ${cx+r*0.87},${cy+r*0.5} ${cx-r*0.87},${cy+r*0.5}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

function iCheckpoint(cx, cy, fw, fh, s, sz) {
  const r=fw*0.3, w=lw(sz), fs=Math.max(6,sz*0.22);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <text x="${cx}" y="${cy+fs*0.38}" text-anchor="middle" font-size="${fs}px" font-weight="bold" fill="${s}" font-family="monospace">CP</text>`;
}

function iNAI(cx, cy, fw, fh, s, sz) {
  const rx=fw*0.4, ry=fh*0.32, w=lw(sz);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <text x="${cx}" y="${cy+Math.max(5,sz*0.18)*0.4}" text-anchor="middle" font-size="${Math.max(5,sz*0.18)}px" fill="${s}" font-family="monospace">NAI</text>`;
}

function iTRP(cx, cy, fw, fh, s, sz) {
  const r=fw*0.3, w=lw(sz);
  return `<line x1="${cx-r}" y1="${cy-r}" x2="${cx+r}" y2="${cy+r}" stroke="${s}" stroke-width="${w*1.5}"/>
          <line x1="${cx+r}" y1="${cy-r}" x2="${cx-r}" y2="${cy+r}" stroke="${s}" stroke-width="${w*1.5}"/>`;
}

function iRallyPoint(cx, cy, fw, fh, s, sz) {
  const r=fw*0.28, w=lw(sz);
  return `<polygon points="${cx},${cy-r} ${cx+r},${cy+r} ${cx-r},${cy+r}" fill="none" stroke="${s}" stroke-width="${w}"/>`;
}

function iPassagePoint(cx, cy, fw, fh, s, sz) {
  const r=fw*0.28, w=lw(sz);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s}" stroke-width="${w}"/>
          <line x1="${cx}" y1="${cy-r}" x2="${cx}" y2="${cy+r}" stroke="${s}" stroke-width="${w}"/>`;
}

// ─── Symbol Type Registry ─────────────────────────────────────────────────────
// Organised into tabs: 'formations' | 'tactical' | 'equipment' | 'generic'

const SYMBOL_TYPES = {

  // ── TAB 1: FORMATIONS ──────────────────────────────────────────────────────

  // Friendly Ground
  'inf-f':         { label:'Infantry',          aff:'friendly', tab:'formations', icon:iInfantry     },
  'mech-inf-f':    { label:'Mech Infantry',      aff:'friendly', tab:'formations', icon:iMech         },
  'motor-inf-f':   { label:'Motorized Infantry', aff:'friendly', tab:'formations', icon:iMotorized    },
  'armor-f':       { label:'Armor',              aff:'friendly', tab:'formations', icon:iArmor        },
  'mech-armor-f':  { label:'Mech Armor',         aff:'friendly', tab:'formations', icon:iMechArmor    },
  'cav-f':         { label:'Cavalry',            aff:'friendly', tab:'formations', icon:iCavalry      },
  'armd-cav-f':    { label:'Armored Cavalry',    aff:'friendly', tab:'formations', icon:iArmoredCav   },
  'arty-f':        { label:'Artillery (Towed)',  aff:'friendly', tab:'formations', icon:iArtillery    },
  'arty-sp-f':     { label:'SP Artillery',       aff:'friendly', tab:'formations', icon:iSPArty       },
  'arty-rkt-f':    { label:'Rocket Artillery',   aff:'friendly', tab:'formations', icon:iRocketArty   },
  'mortar-f':      { label:'Mortar',             aff:'friendly', tab:'formations', icon:iMortar       },
  'avn-rw-f':      { label:'Aviation (Rotary)',  aff:'friendly', tab:'formations', icon:iRotaryWing   },
  'avn-fw-f':      { label:'Aviation (Fixed)',   aff:'friendly', tab:'formations', icon:iFixedWing    },
  'air-assault-f': { label:'Air Assault',        aff:'friendly', tab:'formations', icon:iAirAssault   },
  'airborne-f':    { label:'Airborne',           aff:'friendly', tab:'formations', icon:iAirborne     },
  'ranger-f':      { label:'Ranger',             aff:'friendly', tab:'formations', icon:iRanger       },
  'sf-f':          { label:'Special Forces',     aff:'friendly', tab:'formations', icon:iSpecialForces},
  'eng-f':         { label:'Engineer',           aff:'friendly', tab:'formations', icon:iEngineer     },
  'sig-f':         { label:'Signal',             aff:'friendly', tab:'formations', icon:iSignal       },
  'med-f':         { label:'Medical',            aff:'friendly', tab:'formations', icon:iMedical      },
  'ada-f':         { label:'Air Defense',        aff:'friendly', tab:'formations', icon:iAirDefense   },
  'antiarmor-f':   { label:'Antiarmor',          aff:'friendly', tab:'formations', icon:iAntiArmor    },
  'mi-f':          { label:'Military Intel',     aff:'friendly', tab:'formations', icon:iMilIntel     },
  'mp-f':          { label:'Military Police',    aff:'friendly', tab:'formations', icon:iMilPolice    },
  'cbrn-f':        { label:'CBRN',               aff:'friendly', tab:'formations', icon:iCBRN         },
  'psyop-f':       { label:'PSYOP',              aff:'friendly', tab:'formations', icon:iPsyop        },
  'ca-f':          { label:'Civil Affairs',      aff:'friendly', tab:'formations', icon:iCivilAffairs },
  'log-f':         { label:'Logistics',          aff:'friendly', tab:'formations', icon:iLogistics    },
  'fin-f':         { label:'Finance',            aff:'friendly', tab:'formations', icon:iFinance      },
  'hq-f':          { label:'Headquarters',       aff:'friendly', tab:'formations', icon:iHQ           },
  'cp-f':          { label:'Command Post',       aff:'friendly', tab:'formations', icon:iCP           },
  'op-f':          { label:'Observation Post',   aff:'friendly', tab:'formations', icon:iOP           },

  // Enemy
  'inf-e':         { label:'Enemy Infantry',     aff:'enemy',    tab:'formations', icon:iInfantry     },
  'mech-inf-e':    { label:'Enemy Mech Inf',     aff:'enemy',    tab:'formations', icon:iMech         },
  'armor-e':       { label:'Enemy Armor',        aff:'enemy',    tab:'formations', icon:iArmor        },
  'arty-e':        { label:'Enemy Artillery',    aff:'enemy',    tab:'formations', icon:iArtillery    },
  'avn-e':         { label:'Enemy Aviation',     aff:'enemy',    tab:'formations', icon:iRotaryWing   },
  'ada-e':         { label:'Enemy Air Defense',  aff:'enemy',    tab:'formations', icon:iAirDefense   },
  'unk-e':         { label:'Unknown Enemy',      aff:'enemy',    tab:'formations', icon:iUnknown      },
  'sus-e':         { label:'Suspected',          aff:'enemy',    tab:'formations', icon:iSuspected    },

  // Neutral / Unknown
  'unk-g':         { label:'Unknown Ground',     aff:'unknown',  tab:'formations', icon:iUnknown      },
  'neu-inf':       { label:'Neutral Force',      aff:'neutral',  tab:'formations', icon:iInfantry     },
  'civ':           { label:'Civilian',           aff:'neutral',  tab:'formations', icon:iCivilian     },

  // ── TAB 3: EQUIPMENT / INSTALLATIONS ──────────────────────────────────────
  'eq-tank-f':     { label:'Tank (M1)',          aff:'friendly', tab:'equipment',  icon:iTank,      noFrame:true },
  'eq-ifv-f':      { label:'IFV (Bradley)',      aff:'friendly', tab:'equipment',  icon:iIFV,       noFrame:true },
  'eq-howitzer-f': { label:'Howitzer',           aff:'friendly', tab:'equipment',  icon:iHowitzer,  noFrame:true },
  'eq-helo-f':     { label:'Helicopter',         aff:'friendly', tab:'equipment',  icon:iHelicopter,noFrame:true },
  'eq-aircraft-f': { label:'Fixed Wing Acft',   aff:'friendly', tab:'equipment',  icon:iAircraft,  noFrame:true },
  'inst-airfield':  { label:'Airfield',          aff:'friendly', tab:'equipment',  icon:iAirfield,  noFrame:true },
  'inst-helipad':   { label:'Helipad',           aff:'friendly', tab:'equipment',  icon:iHelipad,   noFrame:true },
  'inst-fob':       { label:'FOB',               aff:'friendly', tab:'equipment',  icon:iFOB,       noFrame:true },
  'inst-supply':    { label:'Supply Point',      aff:'friendly', tab:'equipment',  icon:iSupplyPoint,noFrame:true},
  'inst-asp':       { label:'Ammo Supply (ASP)', aff:'friendly', tab:'equipment',  icon:iASP,       noFrame:true },
  'inst-mtf':       { label:'Medical Facility',  aff:'friendly', tab:'equipment',  icon:iMTF,       noFrame:true },
  'eq-tank-e':     { label:'Enemy Tank',         aff:'enemy',    tab:'equipment',  icon:iTank,      noFrame:true },
  'eq-ifv-e':      { label:'Enemy IFV',          aff:'enemy',    tab:'equipment',  icon:iIFV,       noFrame:true },

  // ── TAB 4: GENERIC GRAPHICS ────────────────────────────────────────────────
  'gen-point':     { label:'Point Marker',       aff:'friendly', tab:'generic',    icon:iPointMarker },
  'gen-target':    { label:'Target',             aff:'friendly', tab:'generic',    icon:iTarget      },
  'gen-obj':       { label:'Objective',          aff:'friendly', tab:'generic',    icon:iObjective   },
  'gen-dp':        { label:'Decision Point',     aff:'friendly', tab:'generic',    icon:iDecisionPoint},
  'gen-cp':        { label:'Checkpoint',         aff:'friendly', tab:'generic',    icon:iCheckpoint  },
  'gen-trp':       { label:'TRP',                aff:'friendly', tab:'generic',    icon:iTRP         },
  'gen-rp':        { label:'Rally Point',        aff:'friendly', tab:'generic',    icon:iRallyPoint  },
  'gen-pp':        { label:'Passage Point',      aff:'friendly', tab:'generic',    icon:iPassagePoint},
  'gen-nai':       { label:'NAI',                aff:'friendly', tab:'generic',    icon:iNAI         },
  'gen-op':        { label:'OP / LP',            aff:'friendly', tab:'generic',    icon:iOP          },
};

// ─── Frame + echelon SVG builder ─────────────────────────────────────────────
function buildSymbolSvg(unit, size) {
  const def  = SYMBOL_TYPES[unit.type] || SYMBOL_TYPES['inf-f'];
  const aff  = unit.affiliation || def.aff || 'friendly';
  const cfg  = AFF[aff] || AFF.friendly;

  if (def.noFrame) {
    // Equipment/installation: no frame, just icon in a fixed box
    const boxW = size * 1.1, boxH = size * 0.8;
    const cx = boxW/2, cy = boxH/2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}" viewBox="0 0 ${boxW} ${boxH}" overflow="visible">
      ${def.icon(cx, cy, boxW*0.8, boxH*0.8, cfg.stroke, size)}
    </svg>`;
  }

  const frame   = buildFrame(aff, size);
  const echH    = size * 0.28;
  const totalW  = frame.svgW;
  const totalH  = frame.svgH + echH;

  // Shift frame down by echH
  const shiftedFrame = shiftSvgY(frame.shape, echH);
  const iconSvg = def.icon(frame.cx, frame.cy + echH, frame.fw, frame.fh, cfg.stroke, size);
  const echSvg  = unit.echelon
    ? echelonSvg(unit.echelon, frame.cx, echH - 2, cfg.stroke, size)
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" overflow="visible">
    ${shiftedFrame}${iconSvg}${echSvg}
  </svg>`;
}

function echelonSvg(echelon, cx, y, stroke, size) {
  const mark = ECHELON_MARKS[echelon];
  if (!mark) return '';
  const fs = Math.max(8, size * 0.22);
  return `<text x="${cx}" y="${y}" text-anchor="middle" font-size="${fs}px" font-weight="bold" fill="${stroke}" font-family="monospace">${mark}</text>`;
}

// Shift all Y-coordinates in an SVG shape string down by dy
function shiftSvgY(svgStr, dy) {
  return svgStr.replace(/(y[12]?|cy|points)="([^"]*)"/g, (m, attr, val) => {
    if (attr === 'points') {
      const shifted = val.trim().split(/\s+/).map(pt => {
        const [px, py] = pt.split(',');
        return `${px},${parseFloat(py) + dy}`;
      }).join(' ');
      return `${attr}="${shifted}"`;
    }
    return `${attr}="${parseFloat(val) + dy}"`;
  });
}

// ─── Leaflet marker factory ───────────────────────────────────────────────────
function createMarker(unit, map) {
  const size   = getSymbolSize(map.getZoom());
  const def    = SYMBOL_TYPES[unit.type] || SYMBOL_TYPES['inf-f'];
  const aff    = unit.affiliation || def.aff || 'friendly';
  const cfg    = AFF[aff];
  const svgStr = buildSymbolSvg(unit, size);
  const label  = unit.label || '';

  const echH  = size * 0.28;
  let iconW, iconH, anchorX, anchorY;

  if (def.noFrame) {
    iconW = size * 1.1; iconH = size * 0.8;
    anchorX = iconW/2; anchorY = iconH/2;
  } else {
    const frame = buildFrame(aff, size);
    iconW = frame.svgW; iconH = frame.svgH + echH + (label ? 14 : 0);
    anchorX = iconW/2; anchorY = frame.svgH/2 + echH;
  }

  const html = `<div class="sym-wrapper" id="sym-${unit.id}" data-id="${unit.id}">
    <div class="sym-svg">${svgStr}</div>
    ${label ? `<div class="sym-label" style="color:${cfg.stroke}">${label}</div>` : ''}
  </div>`;

  return L.marker(unit.latlng, {
    icon: L.divIcon({ html, className:'', iconSize:[iconW, iconH], iconAnchor:[anchorX, anchorY] }),
    draggable: true,
    title: def.label,
  });
}

// ─── Small preview SVG for toolbar buttons ────────────────────────────────────
function buildPreviewSvg(type) {
  const def = SYMBOL_TYPES[type];
  if (!def) return '';
  const size = 22;
  const aff  = def.aff || 'friendly';
  const cfg  = AFF[aff];

  if (def.noFrame) {
    const w=26, h=18;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">
      ${def.icon(w/2, h/2, w*0.8, h*0.8, cfg.stroke, size)}
    </svg>`;
  }

  const frame = buildFrame(aff, size);
  const icon  = def.icon(frame.cx, frame.cy, frame.fw, frame.fh, cfg.stroke, size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.svgW}" height="${frame.svgH}" viewBox="0 0 ${frame.svgW} ${frame.svgH}" overflow="visible">
    ${frame.shape}${icon}
  </svg>`;
}

window.SYMBOL_TYPES  = SYMBOL_TYPES;
window.AFF           = AFF;
window.ECHELON_MARKS = ECHELON_MARKS;
window.getSymbolSize = getSymbolSize;
window.buildSymbolSvg= buildSymbolSvg;
window.createMarker  = createMarker;
window.buildPreviewSvg= buildPreviewSvg;
