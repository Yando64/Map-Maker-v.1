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
    // Norway / Svalbard exceptions
    if (lat >= 56 && lat < 64 && lon >= 3  && lon < 12) zoneNum = 32;
    if (lat >= 72 && lat < 84) {
      if      (lon >= 0  && lon < 9)  zoneNum = 31;
      else if (lon >= 9  && lon < 21) zoneNum = 33;
      else if (lon >= 21 && lon < 33) zoneNum = 35;
      else if (lon >= 33 && lon < 42) zoneNum = 37;
    }

    const lonOrigin    = (zoneNum - 1) * 6 - 180 + 3;
    const latRad       = toRad(lat);
    const lonRad       = toRad(lon);
    const lonOriginRad = toRad(lonOrigin);

    const N = a / Math.sqrt(1 - ecc2 * Math.sin(latRad) ** 2);
    const T = Math.tan(latRad) ** 2;
    const C = ecc_prime2 * Math.cos(latRad) ** 2;
    const A = Math.cos(latRad) * (lonRad - lonOriginRad);
    const M = a * (
      (1 - ecc2/4 - 3*ecc2**2/64 - 5*ecc2**3/256)   * latRad
    - (3*ecc2/8   + 3*ecc2**2/32 + 45*ecc2**3/1024)  * Math.sin(2*latRad)
    + (15*ecc2**2/256 + 45*ecc2**3/1024)               * Math.sin(4*latRad)
    - (35*ecc2**3/3072)                                * Math.sin(6*latRad)
    );

    let easting  = 0.9996 * N * (A + (1-T+C)*A**3/6 + (5-18*T+T**2+72*C-58*ecc_prime2)*A**5/120) + 500000;
    let northing = 0.9996 * (M + N*Math.tan(latRad)*(A**2/2 + (5-T+9*C+4*C**2)*A**4/24 + (61-58*T+T**2+600*C-330*ecc_prime2)*A**6/720));
    if (lat < 0) northing += 10000000;

    const latBand = LAT_BANDS[Math.min(Math.floor((lat + 80) / 8), 19)] || 'X';
    return { zoneNum, latBand, easting, northing };
  }

  function get100kId(easting, northing, zoneNum) {
    const setNum   = (zoneNum - 1) % NUM_100K_SETS;
    const colSet   = SET_ORIGIN_COLUMNS[setNum];
    const rowSet   = SET_ORIGIN_ROWS[setNum];
    const colIdx   = Math.floor(easting  / 100000) - 1;
    const rowIdx   = Math.floor(northing / 100000) % 20;
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

  // Return GZD string only
  function gzdFromLatLon(lat, lon) {
    const utm = latLonToUtm(lat, lon);
    if (!utm) return '';
    return `${utm.zoneNum}${utm.latBand}`;
  }

  return { fromLatLon, gzdFromLatLon, latLonToUtm, get100kId };
})();

// ─── MGRS Grid Layer ─────────────────────────────────────────────────────────

const MgrsGridLayer = L.Layer.extend({

  onAdd(map) {
    this._map = map;
    // Use a dedicated pane above tiles but below markers
    if (!map.getPane('mgrsPane')) {
      map.createPane('mgrsPane');
      map.getPane('mgrsPane').style.zIndex = 350;
      map.getPane('mgrsPane').style.pointerEvents = 'none';
    }
    this._canvas = L.DomUtil.create('canvas', 'mgrs-grid-canvas');
    Object.assign(this._canvas.style, {
      position: 'absolute', top: '0', left: '0',
      pointerEvents: 'none',
    });
    map.getPane('mgrsPane').appendChild(this._canvas);

    map.on('viewreset',         this._reset,  this);
    map.on('zoom',              this._reset,  this);
    map.on('move moveend',      this._redraw, this);
    map.on('zoomend resize',    this._redraw, this);
    this._reset();
  },

  onRemove(map) {
    map.getPane('mgrsPane').removeChild(this._canvas);
    map.off('viewreset',       this._reset,  this);
    map.off('zoom',            this._reset,  this);
    map.off('move moveend',    this._redraw, this);
    map.off('zoomend resize',  this._redraw, this);
  },

  // On zoom/reset: resize canvas to full container and anchor it
  _reset() {
    const map  = this._map;
    const size = map.getSize();
    this._canvas.width  = size.x;
    this._canvas.height = size.y;
    // Anchor top-left of canvas to map's (0,0) container point projected into layer coords
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._redraw();
  },

  _redraw() {
    const map    = this._map;
    const canvas = this._canvas;
    const ctx    = canvas.getContext('2d');
    const W      = canvas.width;
    const H      = canvas.height;
    const zoom   = map.getZoom();

    // Keep canvas anchored during pan
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);

    ctx.clearRect(0, 0, W, H);

    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    const bounds    = map.getBounds().pad(0.05);
    const sw        = bounds.getSouthWest();
    const ne        = bounds.getNorthEast();
    const midLat    = (sw.lat + ne.lat) / 2;

    // ── Pick grid level ───────────────────────────────────────────────────────
    // Each level: { size (m), lineW, lineAlpha, labelSize, showLabel }
    const levels = _gridLevels(zoom, isDark);

    levels.forEach(level => {
      _drawGridLevel(ctx, map, topLeft, sw, ne, midLat, zoom, isDark, level);
    });

    // ── GZD zone boundaries (always shown at zoom < 10, thick) ───────────────
    if (zoom < 10) {
      _drawGzdBoundaries(ctx, map, topLeft, sw, ne, zoom, isDark);
    }
  },
});

// ─── Grid level config ────────────────────────────────────────────────────────

function _gridLevels(zoom, isDark) {
  const ya = isDark ? 'rgba(255,255,80,'  : 'rgba(20,80,220,';
  const levels = [];

  if (zoom >= 14) {
    levels.push({ size: 100,    lineW: 0.4, alpha: ya + '0.25)', labelAlpha: ya + '0.6)', labelPx: 9,  showLabel: true,  labelFn: _label100m  });
  }
  if (zoom >= 10) {
    levels.push({ size: 1000,   lineW: 0.7, alpha: ya + '0.35)', labelAlpha: ya + '0.75)', labelPx: 10, showLabel: true,  labelFn: _label1km   });
  }
  if (zoom >= 7) {
    levels.push({ size: 10000,  lineW: 1.0, alpha: ya + '0.45)', labelAlpha: ya + '0.85)', labelPx: 11, showLabel: zoom >= 8, labelFn: _label10km });
  }
  if (zoom >= 4) {
    levels.push({ size: 100000, lineW: 1.5, alpha: ya + '0.55)', labelAlpha: ya + '0.9)',  labelPx: 13, showLabel: true,  labelFn: _label100km });
  }

  return levels;
}

// ─── Draw one grid level ──────────────────────────────────────────────────────

function _drawGridLevel(ctx, map, topLeft, sw, ne, midLat, zoom, isDark, level) {
  const { size, lineW, alpha, labelAlpha, labelPx, showLabel, labelFn } = level;

  // Approximate degree steps for this grid size
  const latStep = size / 111320;
  const lonStep = size / (111320 * Math.cos(midLat * Math.PI / 180));
  if (!isFinite(lonStep) || lonStep <= 0) return;

  const startLat = Math.floor(sw.lat / latStep) * latStep;
  const startLon = Math.floor(sw.lng / lonStep) * lonStep;

  ctx.strokeStyle = alpha;
  ctx.lineWidth   = lineW;
  ctx.setLineDash([]);

  // Horizontal lines (constant lat)
  for (let lat = startLat; lat <= ne.lat + latStep; lat += latStep) {
    const p1 = map.latLngToContainerPoint([lat, sw.lng]);
    const p2 = map.latLngToContainerPoint([lat, ne.lng]);
    const x1 = p1.x - topLeft.x, y1 = p1.y - topLeft.y;
    const x2 = p2.x - topLeft.x, y2 = p2.y - topLeft.y;
    if (y1 < -20 || y1 > map.getSize().y + 20) continue;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Vertical lines (constant lon)
  for (let lon = startLon; lon <= ne.lng + lonStep; lon += lonStep) {
    const p1 = map.latLngToContainerPoint([sw.lat, lon]);
    const p2 = map.latLngToContainerPoint([ne.lat, lon]);
    const x1 = p1.x - topLeft.x, y1 = p1.y - topLeft.y;
    const x2 = p2.x - topLeft.x, y2 = p2.y - topLeft.y;
    if (x1 < -20 || x1 > map.getSize().x + 20) continue;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Labels — pinned to left and bottom edges of viewport
  if (!showLabel) return;
  ctx.fillStyle = labelAlpha;
  ctx.font      = `bold ${labelPx}px monospace`;

  const W = map.getSize().x, H = map.getSize().y;
  const MARGIN = 3;

  // Left-edge labels (one per horizontal band, at x=margin)
  for (let lat = startLat; lat <= ne.lat; lat += latStep) {
    const p = map.latLngToContainerPoint([lat, sw.lng]);
    const y = p.y - topLeft.y;
    if (y < labelPx || y > H - MARGIN) continue;
    const label = labelFn(lat, sw.lng + lonStep * 0.1);
    if (!label) continue;
    _drawLabelBg(ctx, MARGIN + 2, y - labelPx + 1, label, labelPx, isDark);
    ctx.fillText(label, MARGIN + 2, y - 2);
  }

  // Bottom-edge labels (one per vertical band, at y=H-margin)
  for (let lon = startLon; lon <= ne.lng; lon += lonStep) {
    const p = map.latLngToContainerPoint([sw.lat + latStep * 0.1, lon]);
    const x = p.x - topLeft.x;
    if (x < 2 || x > W - 40) continue;
    const label = labelFn(sw.lat + latStep * 0.1, lon);
    if (!label) continue;
    _drawLabelBg(ctx, x + 2, H - labelPx - MARGIN, label, labelPx, isDark);
    ctx.fillText(label, x + 2, H - MARGIN - 2);
  }
}

// ─── GZD boundary lines ───────────────────────────────────────────────────────

function _drawGzdBoundaries(ctx, map, topLeft, sw, ne, zoom, isDark) {
  const color = isDark ? 'rgba(255,255,80,0.7)' : 'rgba(20,80,220,0.7)';
  ctx.strokeStyle = color;
  ctx.lineWidth   = zoom < 6 ? 2 : 1.5;
  ctx.setLineDash([]);

  // 6° longitude zone boundaries
  for (let lon = Math.floor(sw.lng / 6) * 6; lon <= ne.lng + 6; lon += 6) {
    const p1 = map.latLngToContainerPoint([Math.max(sw.lat, -80), lon]);
    const p2 = map.latLngToContainerPoint([Math.min(ne.lat,  84), lon]);
    const x1 = p1.x - topLeft.x, y1 = p1.y - topLeft.y;
    const x2 = p2.x - topLeft.x, y2 = p2.y - topLeft.y;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // 8° latitude band boundaries
  const latBoundaries = [-80,-72,-64,-56,-48,-40,-32,-24,-16,-8,0,8,16,24,32,40,48,56,64,72,84];
  latBoundaries.forEach(lat => {
    if (lat < sw.lat - 8 || lat > ne.lat + 8) return;
    const p1 = map.latLngToContainerPoint([lat, sw.lng]);
    const p2 = map.latLngToContainerPoint([lat, ne.lng]);
    const x1 = p1.x - topLeft.x, y1 = p1.y - topLeft.y;
    const x2 = p2.x - topLeft.x, y2 = p2.y - topLeft.y;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });

  // GZD labels at zone centers
  if (zoom >= 4) {
    ctx.fillStyle = color;
    ctx.font      = `bold ${zoom < 6 ? 11 : 13}px monospace`;
    const W = map.getSize().x, H = map.getSize().y;

    for (let lon = Math.floor(sw.lng / 6) * 6; lon < ne.lng; lon += 6) {
      for (let lat = Math.floor((Math.max(sw.lat,-80)) / 8) * 8; lat < Math.min(ne.lat,84); lat += 8) {
        const cLat = lat + 4, cLon = lon + 3;
        const gzd  = MGRS.gzdFromLatLon(cLat, cLon);
        if (!gzd) continue;
        const p  = map.latLngToContainerPoint([cLat, cLon]);
        const px = p.x - topLeft.x, py = p.y - topLeft.y;
        if (px < 0 || px > W || py < 0 || py > H) continue;
        _drawLabelBg(ctx, px - 14, py - 12, gzd, 13, isDark);
        ctx.fillText(gzd, px - 12, py);
      }
    }
  }
}

// ─── Label text builders ──────────────────────────────────────────────────────

function _label100km(lat, lon) {
  const utm = MGRS.latLonToUtm(lat, lon);
  if (!utm) return '';
  return MGRS.get100kId(utm.easting, utm.northing, utm.zoneNum);
}

function _label10km(lat, lon) {
  const utm = MGRS.latLonToUtm(lat, lon);
  if (!utm) return '';
  const e = String(Math.floor((utm.easting  % 100000) / 10000)).padStart(2, '0');
  const n = String(Math.floor((utm.northing % 100000) / 10000)).padStart(2, '0');
  return `${e} ${n}`;
}

function _label1km(lat, lon) {
  const utm = MGRS.latLonToUtm(lat, lon);
  if (!utm) return '';
  const e = String(Math.floor((utm.easting  % 100000) / 1000)).padStart(2, '0');
  const n = String(Math.floor((utm.northing % 100000) / 1000)).padStart(2, '0');
  return `${e}${n}`;
}

function _label100m(lat, lon) {
  const utm = MGRS.latLonToUtm(lat, lon);
  if (!utm) return '';
  const e = String(Math.floor((utm.easting  % 1000) / 100));
  const n = String(Math.floor((utm.northing % 1000) / 100));
  return `${e}${n}`;
}

// ─── Label background pill for readability ────────────────────────────────────

function _drawLabelBg(ctx, x, y, text, fontSize, isDark) {
  const w    = ctx.measureText(text).width;
  const pad  = 2;
  const prev = ctx.fillStyle;
  ctx.fillStyle = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
  ctx.fillRect(x - pad, y - 1, w + pad * 2, fontSize + 2);
  ctx.fillStyle = prev;
}

window.MGRS         = MGRS;
window.MgrsGridLayer = MgrsGridLayer;
