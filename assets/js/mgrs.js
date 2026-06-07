/**
 * MGRS coordinate conversion and grid overlay
 * Self-contained — no external dependencies.
 */

const MGRS = (() => {
  const NUM_100K_SETS = 6;
  const SET_ORIGIN_COLUMNS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ', 'ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  const SET_ORIGIN_ROWS    = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE', 'ABCDEFGHJKLMNPQRSTUV',
                               'FGHJKLMNPQRSTUVABCDE', 'ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'];
  const LAT_BANDS = 'CDEFGHJKLMNPQRSTUVWX';

  function toRad(d) { return d * Math.PI / 180; }

  function latLonToUtm(lat, lon) {
    if (lat < -80 || lat > 84) return null;
    const a = 6378137.0, f = 1 / 298.257223563;
    const b = a * (1 - f);
    const ecc2 = 1 - (b * b) / (a * a);
    const ecc_prime2 = ecc2 / (1 - ecc2);

    let zoneNum = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56 && lat < 64 && lon >= 3  && lon < 12) zoneNum = 32;
    if (lat >= 72 && lat < 84) {
      if      (lon >= 0  && lon < 9)  zoneNum = 31;
      else if (lon >= 9  && lon < 21) zoneNum = 33;
      else if (lon >= 21 && lon < 33) zoneNum = 35;
      else if (lon >= 33 && lon < 42) zoneNum = 37;
    }

    const lonOrigin    = (zoneNum - 1) * 6 - 180 + 3;
    const latRad       = toRad(lat), lonRad = toRad(lon), lonOriginRad = toRad(lonOrigin);
    const N = a / Math.sqrt(1 - ecc2 * Math.sin(latRad) ** 2);
    const T = Math.tan(latRad) ** 2;
    const C = ecc_prime2 * Math.cos(latRad) ** 2;
    const A = Math.cos(latRad) * (lonRad - lonOriginRad);
    const M = a * (
      (1 - ecc2/4 - 3*ecc2**2/64 - 5*ecc2**3/256)  * latRad
    - (3*ecc2/8 + 3*ecc2**2/32 + 45*ecc2**3/1024)   * Math.sin(2*latRad)
    + (15*ecc2**2/256 + 45*ecc2**3/1024)              * Math.sin(4*latRad)
    - (35*ecc2**3/3072)                               * Math.sin(6*latRad)
    );

    let easting  = 0.9996 * N * (A + (1-T+C)*A**3/6 + (5-18*T+T**2+72*C-58*ecc_prime2)*A**5/120) + 500000;
    let northing = 0.9996 * (M + N*Math.tan(latRad)*(A**2/2 + (5-T+9*C+4*C**2)*A**4/24 + (61-58*T+T**2+600*C-330*ecc_prime2)*A**6/720));
    if (lat < 0) northing += 10000000;

    const latBand = LAT_BANDS[Math.min(Math.floor((lat + 80) / 8), 19)] || 'X';
    return { zoneNum, latBand, easting, northing };
  }

  function get100kId(easting, northing, zoneNum) {
    const setNum = (zoneNum - 1) % NUM_100K_SETS;
    const colSet = SET_ORIGIN_COLUMNS[setNum];
    const rowSet = SET_ORIGIN_ROWS[setNum];
    const colIdx = Math.floor(easting  / 100000) - 1;
    const rowIdx = Math.floor(northing / 100000) % 20;
    return colSet[colIdx % colSet.length] + rowSet[rowIdx % rowSet.length];
  }

  function fromLatLon(lat, lon, accuracy = 5) {
    const utm = latLonToUtm(lat, lon);
    if (!utm) return 'OUT OF RANGE';
    const { zoneNum, latBand, easting, northing } = utm;
    const id100k  = get100kId(easting, northing, zoneNum);
    const divisor = Math.pow(10, 5 - accuracy);
    const ePad    = String(Math.floor((easting  % 100000) / divisor)).padStart(accuracy, '0');
    const nPad    = String(Math.floor((northing % 100000) / divisor)).padStart(accuracy, '0');
    if (accuracy === 0) return `${zoneNum}${latBand}`;
    return `${zoneNum}${latBand} ${id100k} ${ePad} ${nPad}`;
  }

  function gzdFromLatLon(lat, lon) {
    const utm = latLonToUtm(lat, lon);
    if (!utm) return '';
    return `${utm.zoneNum}${utm.latBand}`;
  }

  // ── MGRS → Lat/Lon ──────────────────────────────────────────────────────────
  // Accepts formats like: "18S UJ 12345 67890", "18SUJ1234567890", "18SUJ 12345 67890"
  function toLatLon(mgrsStr) {
    if (!mgrsStr) return null;
    // Normalise: uppercase, remove spaces
    const s = mgrsStr.toUpperCase().replace(/\s+/g, '');
    // Parse: zone number (1-2 digits) + lat band (1 letter) + 100k ID (2 letters) + numeric part
    const m = s.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{2,10})$/);
    if (!m) return null;

    const zoneNum   = parseInt(m[1]);
    const latBand   = m[2];
    const sq100k    = m[3];
    const numStr    = m[4];
    if (numStr.length % 2 !== 0) return null;

    const halfLen   = numStr.length / 2;
    const precision = Math.pow(10, 5 - halfLen);
    const eOff      = parseInt(numStr.slice(0, halfLen)) * precision;
    const nOff      = parseInt(numStr.slice(halfLen))    * precision;

    // Resolve 100k square origin
    const setNum  = (zoneNum - 1) % NUM_100K_SETS;
    const colSet  = SET_ORIGIN_COLUMNS[setNum];
    const rowSet  = SET_ORIGIN_ROWS[setNum];
    const colIdx  = colSet.indexOf(sq100k[0]);
    const rowIdx  = rowSet.indexOf(sq100k[1]);
    if (colIdx < 0 || rowIdx < 0) return null;

    const easting100k  = (colIdx + 1) * 100000;
    let   northing100k = rowIdx * 100000;

    // Determine minimum northing for this lat band
    const bandIdx    = LAT_BANDS.indexOf(latBand);
    const minLat     = bandIdx * 8 - 80;
    const minNorthing = latLonToUtm(minLat, (zoneNum - 1) * 6 - 180 + 3)?.northing ?? 0;

    // Adjust northing100k into the right 2-million-metre band
    while (northing100k < minNorthing) northing100k += 2000000;

    const easting  = easting100k  + eOff;
    const northing = northing100k + nOff;

    return utmToLatLon(zoneNum, latBand, easting, northing);
  }

  function utmToLatLon(zoneNum, latBand, easting, northing) {
    const a  = 6378137.0, f = 1 / 298.257223563;
    const b  = a * (1 - f);
    const ecc2 = 1 - (b*b)/(a*a);
    const ecc_prime2 = ecc2 / (1 - ecc2);
    const k0 = 0.9996;
    const e1  = (1 - Math.sqrt(1 - ecc2)) / (1 + Math.sqrt(1 - ecc2));

    const x = easting - 500000;
    let   y = northing;
    if (LAT_BANDS.indexOf(latBand) < 10) y -= 10000000; // southern hemisphere

    const lonOrigin = (zoneNum - 1) * 6 - 180 + 3;
    const M  = y / k0;
    const mu = M / (a * (1 - ecc2/4 - 3*ecc2**2/64 - 5*ecc2**3/256));
    const p1 = mu + (3*e1/2 - 27*e1**3/32) * Math.sin(2*mu)
                  + (21*e1**2/16 - 55*e1**4/32) * Math.sin(4*mu)
                  + (151*e1**3/96) * Math.sin(6*mu)
                  + (1097*e1**4/512) * Math.sin(8*mu);

    const N1 = a / Math.sqrt(1 - ecc2*Math.sin(p1)**2);
    const T1 = Math.tan(p1)**2;
    const C1 = ecc_prime2 * Math.cos(p1)**2;
    const R1 = a*(1-ecc2) / Math.pow(1 - ecc2*Math.sin(p1)**2, 1.5);
    const D  = x / (N1*k0);

    const lat = p1 - (N1*Math.tan(p1)/R1) * (
      D**2/2 - (5+3*T1+10*C1-4*C1**2-9*ecc_prime2)*D**4/24
      + (61+90*T1+298*C1+45*T1**2-252*ecc_prime2-3*C1**2)*D**6/720
    );
    const lon = (D - (1+2*T1+C1)*D**3/6
      + (5-2*C1+(28*T1)-(3*C1**2)+(8*ecc_prime2)+(24*T1**2))*D**5/120
    ) / Math.cos(p1);

    return {
      lat: lat * 180 / Math.PI,
      lon: lonOrigin + lon * 180 / Math.PI,
    };
  }

  return { fromLatLon, gzdFromLatLon, latLonToUtm, get100kId, toLatLon };
})();

// ─── User-configurable settings (shared with the settings panel) ──────────────

window.mgrsSettings = {
  darkColor:    '#ffff50',
  lightColor:   '#1450dc',
  opacity:      0.4,
  lineWidth:    1.0,    // multiplier applied to all line widths
  showLabels:   true,
  showGzd:      true,
  levels: {
    '100km': true,
    '10km':  true,
    '1km':   true,
    '100m':  true,
  },
};

// ─── MGRS Grid Layer ──────────────────────────────────────────────────────────
// Canvas is placed directly in the map container (not a Leaflet pane) and
// stays fixed at top-left. Everything is drawn using containerPoint coords,
// so there is zero drift during pan, zoom, or resize.

const MgrsGridLayer = L.Layer.extend({

  onAdd(map) {
    this._map = map;
    this._canvas = document.createElement('canvas');
    Object.assign(this._canvas.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      pointerEvents: 'none',
      zIndex:        '350',
    });
    map.getContainer().appendChild(this._canvas);
    this._resize();
    map.on('move zoom viewreset zoomend moveend', this._redraw, this);
    map.on('resize', this._resize, this);
  },

  onRemove(map) {
    map.getContainer().removeChild(this._canvas);
    map.off('move zoom viewreset zoomend moveend', this._redraw, this);
    map.off('resize', this._resize, this);
  },

  _resize() {
    const size = this._map.getSize();
    this._canvas.width  = size.x;
    this._canvas.height = size.y;
    this._redraw();
  },

  _redraw() {
    const map  = this._map;
    const canvas = this._canvas;
    const ctx  = canvas.getContext('2d');
    const W    = canvas.width;
    const H    = canvas.height;
    const zoom = map.getZoom();
    const s    = window.mgrsSettings;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const baseHex = isDark ? s.darkColor : s.lightColor;

    ctx.clearRect(0, 0, W, H);

    const bounds = map.getBounds().pad(0.02);
    const sw     = bounds.getSouthWest();
    const ne     = bounds.getNorthEast();
    const midLat = (sw.lat + ne.lat) / 2;

    // ── Grid levels ───────────────────────────────────────────────────────────
    const levelDefs = [
      { key: '100m',  size: 100,    minZoom: 14, lineW: 0.4 * s.lineWidth, labelDigits: 1 },
      { key: '1km',   size: 1000,   minZoom: 10, lineW: 0.7 * s.lineWidth, labelDigits: 2 },
      { key: '10km',  size: 10000,  minZoom: 7,  lineW: 1.0 * s.lineWidth, labelDigits: 3 },
      { key: '100km', size: 100000, minZoom: 4,  lineW: 1.5 * s.lineWidth, labelDigits: 2 },
    ];

    levelDefs.forEach(def => {
      if (zoom < def.minZoom) return;
      if (!s.levels[def.key]) return;

      // Opacity: coarser levels are slightly more opaque
      const levelOpacity = s.opacity * (def.key === '100km' ? 1.4 : def.key === '10km' ? 1.1 : def.key === '1km' ? 0.95 : 0.75);
      const lineColor  = hexToRgba(baseHex, Math.min(levelOpacity, 1));
      const labelColor = hexToRgba(baseHex, Math.min(levelOpacity * 1.8, 1));

      _drawLevel(ctx, map, sw, ne, midLat, zoom, W, H, def, lineColor, labelColor, s.showLabels, isDark);
    });

    // ── GZD boundaries ────────────────────────────────────────────────────────
    if (s.showGzd && zoom < 10) {
      const gzdColor = hexToRgba(baseHex, Math.min(s.opacity * 1.6, 1));
      _drawGzdBoundaries(ctx, map, sw, ne, zoom, W, H, gzdColor, s.lineWidth, isDark, baseHex);
    }
  },

  // Called externally when settings change
  refresh() { this._redraw(); },
});

// ─── Draw one grid level ──────────────────────────────────────────────────────

function _drawLevel(ctx, map, sw, ne, midLat, zoom, W, H, def, lineColor, labelColor, showLabels, isDark) {
  const { size, lineW } = def;
  const cosLat = Math.cos(midLat * Math.PI / 180);
  if (Math.abs(cosLat) < 0.001) return;

  const latStep = size / 111320;
  const lonStep = size / (111320 * cosLat);
  if (!isFinite(lonStep) || lonStep <= 0) return;

  const startLat = Math.floor(sw.lat / latStep) * latStep;
  const startLon = Math.floor(sw.lng / lonStep) * lonStep;

  ctx.strokeStyle = lineColor;
  ctx.lineWidth   = lineW;
  ctx.setLineDash([]);

  // Horizontal lines
  for (let lat = startLat; lat <= ne.lat + latStep; lat += latStep) {
    const p1 = map.latLngToContainerPoint([lat, sw.lng]);
    const p2 = map.latLngToContainerPoint([lat, ne.lng]);
    if (p1.y < -2 || p1.y > H + 2) continue;
    ctx.beginPath();
    ctx.moveTo(0,  p1.y);
    ctx.lineTo(W, p2.y);
    ctx.stroke();
  }

  // Vertical lines
  for (let lon = startLon; lon <= ne.lng + lonStep; lon += lonStep) {
    const p1 = map.latLngToContainerPoint([ne.lat, lon]);
    const p2 = map.latLngToContainerPoint([sw.lat, lon]);
    if (p1.x < -2 || p1.x > W + 2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, 0);
    ctx.lineTo(p2.x, H);
    ctx.stroke();
  }

  // Labels pinned to left edge (one per horizontal band) and bottom edge
  if (!showLabels) return;
  const fontSize = Math.max(9, Math.min(13, def.lineW * 8 + 9));
  ctx.fillStyle = labelColor;
  ctx.font = `bold ${fontSize}px monospace`;
  const PAD = 4;

  // Left-edge labels
  for (let lat = startLat; lat <= ne.lat; lat += latStep) {
    const p  = map.latLngToContainerPoint([lat, sw.lng + lonStep * 0.05]);
    const y  = p.y;
    if (y < fontSize || y > H - PAD) continue;
    const label = _makeLabel(lat, sw.lng + lonStep * 0.05, def.key);
    if (!label) continue;
    _labelBg(ctx, PAD, y - fontSize, label, fontSize, isDark);
    ctx.fillText(label, PAD, y - 2);
  }

  // Bottom-edge labels
  for (let lon = startLon; lon <= ne.lng; lon += lonStep) {
    const p  = map.latLngToContainerPoint([sw.lat + latStep * 0.05, lon]);
    const x  = p.x;
    if (x < PAD || x > W - 50) continue;
    const label = _makeLabel(sw.lat + latStep * 0.05, lon, def.key);
    if (!label) continue;
    _labelBg(ctx, x + PAD, H - fontSize - PAD, label, fontSize, isDark);
    ctx.fillText(label, x + PAD, H - PAD - 2);
  }
}

// ─── GZD boundaries ───────────────────────────────────────────────────────────

function _drawGzdBoundaries(ctx, map, sw, ne, zoom, W, H, color, lwMult, isDark, baseHex) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = (zoom < 6 ? 2 : 1.5) * lwMult;
  ctx.setLineDash([]);

  for (let lon = Math.floor(sw.lng / 6) * 6; lon <= ne.lng + 6; lon += 6) {
    const p1 = map.latLngToContainerPoint([Math.max(sw.lat, -80), lon]);
    const p2 = map.latLngToContainerPoint([Math.min(ne.lat, 84),  lon]);
    ctx.beginPath(); ctx.moveTo(p1.x, 0); ctx.lineTo(p2.x, H); ctx.stroke();
  }

  const latBands = [-80,-72,-64,-56,-48,-40,-32,-24,-16,-8,0,8,16,24,32,40,48,56,64,72,84];
  latBands.forEach(lat => {
    if (lat < sw.lat - 8 || lat > ne.lat + 8) return;
    const p1 = map.latLngToContainerPoint([lat, sw.lng]);
    const p2 = map.latLngToContainerPoint([lat, ne.lng]);
    ctx.beginPath(); ctx.moveTo(0, p1.y); ctx.lineTo(W, p2.y); ctx.stroke();
  });

  if (zoom >= 4) {
    ctx.fillStyle = color;
    const fs = zoom < 6 ? 11 : 13;
    ctx.font = `bold ${fs}px monospace`;
    for (let lon = Math.floor(sw.lng / 6) * 6; lon < ne.lng; lon += 6) {
      for (let lat = Math.floor((Math.max(sw.lat, -80)) / 8) * 8; lat < Math.min(ne.lat, 84); lat += 8) {
        const cLat = lat + 4, cLon = lon + 3;
        const gzd  = MGRS.gzdFromLatLon(cLat, cLon);
        if (!gzd) continue;
        const p = map.latLngToContainerPoint([cLat, cLon]);
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
        _labelBg(ctx, p.x - 14, p.y - fs, gzd, fs, isDark);
        ctx.fillText(gzd, p.x - 12, p.y);
      }
    }
  }
}

// ─── Label helpers ────────────────────────────────────────────────────────────

function _makeLabel(lat, lon, key) {
  const utm = MGRS.latLonToUtm(lat, lon);
  if (!utm) return '';
  const { easting, northing, zoneNum } = utm;
  if (key === '100km') return MGRS.get100kId(easting, northing, zoneNum);
  if (key === '10km')  return String(Math.floor((easting  % 100000) / 10000)).padStart(2,'0') + ' ' +
                              String(Math.floor((northing % 100000) / 10000)).padStart(2,'0');
  if (key === '1km')   return String(Math.floor((easting  % 100000) / 1000)).padStart(2,'0') +
                              String(Math.floor((northing % 100000) / 1000)).padStart(2,'0');
  if (key === '100m')  return String(Math.floor((easting  % 1000) / 100)) +
                              String(Math.floor((northing % 1000) / 100));
  return '';
}

function _labelBg(ctx, x, y, text, fontSize, isDark) {
  const w   = ctx.measureText(text).width;
  const pad = 2;
  const prev = ctx.fillStyle;
  ctx.fillStyle = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
  ctx.fillRect(x - pad, y, w + pad * 2, fontSize + 2);
  ctx.fillStyle = prev;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

window.MGRS          = MGRS;
window.MgrsGridLayer = MgrsGridLayer;
