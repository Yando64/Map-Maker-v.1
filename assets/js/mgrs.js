/**
 * MGRS coordinate conversion and grid overlay
 * Uses a self-contained implementation without external dependencies
 */

const MGRS = (() => {
  const NUM_100K_SETS = 6;
  const SET_ORIGIN_COLUMNS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ', 'ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  const SET_ORIGIN_ROWS = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE', 'ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE', 'ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'];

  function toRadians(deg) { return deg * Math.PI / 180; }
  function toDegrees(rad) { return rad * 180 / Math.PI; }

  function latLonToUtm(lat, lon) {
    if (lat < -80 || lat > 84) return null;
    const a = 6378137.0, f = 1 / 298.257223563;
    const b = a * (1 - f);
    const ecc2 = 1 - (b * b) / (a * a);
    const ecc = Math.sqrt(ecc2);
    const ecc_prime2 = ecc2 / (1 - ecc2);

    let zoneNum = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zoneNum = 32;
    if (lat >= 72 && lat < 84) {
      if (lon >= 0 && lon < 9) zoneNum = 31;
      else if (lon >= 9 && lon < 21) zoneNum = 33;
      else if (lon >= 21 && lon < 33) zoneNum = 35;
      else if (lon >= 33 && lon < 42) zoneNum = 37;
    }

    const lonOrigin = (zoneNum - 1) * 6 - 180 + 3;
    const latRad = toRadians(lat), lonRad = toRadians(lon), lonOriginRad = toRadians(lonOrigin);

    const N = a / Math.sqrt(1 - ecc2 * Math.sin(latRad) ** 2);
    const T = Math.tan(latRad) ** 2;
    const C = ecc_prime2 * Math.cos(latRad) ** 2;
    const A = Math.cos(latRad) * (lonRad - lonOriginRad);
    const M = a * ((1 - ecc2 / 4 - 3 * ecc2 ** 2 / 64 - 5 * ecc2 ** 3 / 256) * latRad
      - (3 * ecc2 / 8 + 3 * ecc2 ** 2 / 32 + 45 * ecc2 ** 3 / 1024) * Math.sin(2 * latRad)
      + (15 * ecc2 ** 2 / 256 + 45 * ecc2 ** 3 / 1024) * Math.sin(4 * latRad)
      - 35 * ecc2 ** 3 / 3072 * Math.sin(6 * latRad));

    let easting = 0.9996 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ecc_prime2) * A ** 5 / 120) + 500000;
    let northing = 0.9996 * (M + N * Math.tan(latRad) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ecc_prime2) * A ** 6 / 720));
    if (lat < 0) northing += 10000000;

    const latBands = 'CDEFGHJKLMNPQRSTUVWX';
    const latBand = latBands[Math.floor((lat + 80) / 8)] || 'X';

    return { zoneNum, latBand, easting, northing };
  }

  function get100kId(easting, northing, zoneNum) {
    const setNum = (zoneNum - 1) % NUM_100K_SETS;
    const colOrigin = SET_ORIGIN_COLUMNS[setNum];
    const rowOrigin = SET_ORIGIN_ROWS[setNum];

    let colIdx = Math.floor(easting / 100000) - 1;
    let rowIdx = Math.floor(northing / 100000) % 20;

    const col = colOrigin[colIdx % colOrigin.length];
    const row = rowOrigin[rowIdx % rowOrigin.length];
    return col + row;
  }

  function fromLatLon(lat, lon, accuracy = 5) {
    const utm = latLonToUtm(lat, lon);
    if (!utm) return 'INVALID';
    const { zoneNum, latBand, easting, northing } = utm;
    const id100k = get100kId(easting, northing, zoneNum);
    const divisor = Math.pow(10, 5 - accuracy);
    const e = Math.floor((easting % 100000) / divisor);
    const n = Math.floor((northing % 100000) / divisor);
    const ePad = String(e).padStart(accuracy, '0');
    const nPad = String(n).padStart(accuracy, '0');
    return `${zoneNum}${latBand} ${id100k} ${ePad} ${nPad}`;
  }

  return { fromLatLon };
})();

// ─── MGRS Grid Layer ────────────────────────────────────────────────────────

const MgrsGridLayer = L.Layer.extend({
  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'mgrs-grid-canvas');
    Object.assign(this._canvas.style, {
      position: 'absolute', top: 0, left: 0,
      pointerEvents: 'none', zIndex: 400
    });
    map.getPanes().overlayPane.appendChild(this._canvas);
    map.on('moveend zoomend', this._redraw, this);
    map.on('move', this._move, this);
    this._redraw();
  },

  onRemove(map) {
    map.getPanes().overlayPane.removeChild(this._canvas);
    map.off('moveend zoomend', this._redraw, this);
    map.off('move', this._move, this);
  },

  _move() {
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
  },

  _redraw() {
    const map = this._map;
    const size = map.getSize();
    const canvas = this._canvas;
    canvas.width = size.x;
    canvas.height = size.y;
    const ctx = canvas.getContext('2d');
    const zoom = map.getZoom();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lineColor = isDark ? 'rgba(255,255,100,0.3)' : 'rgba(0,0,180,0.2)';
    const labelColor = isDark ? 'rgba(255,255,100,0.8)' : 'rgba(0,0,180,0.8)';

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = lineColor;
    ctx.fillStyle = labelColor;
    ctx.font = 'bold 10px monospace';

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();

    let gridSize, labelPrecision;
    if (zoom < 8) { gridSize = 100000; labelPrecision = 0; }
    else if (zoom < 12) { gridSize = 10000; labelPrecision = 1; }
    else if (zoom < 15) { gridSize = 1000; labelPrecision = 2; }
    else { gridSize = 100; labelPrecision = 3; }

    // Convert to pseudo-meters and draw grid
    const latStep = gridSize / 111320;
    const lonStep = gridSize / (111320 * Math.cos(toRad((sw.lat + ne.lat) / 2)));

    const startLat = Math.floor(sw.lat / latStep) * latStep;
    const startLon = Math.floor(sw.lng / lonStep) * lonStep;

    ctx.lineWidth = zoom < 8 ? 1.5 : 0.8;

    for (let lat = startLat; lat <= ne.lat + latStep; lat += latStep) {
      const p1 = map.latLngToContainerPoint([lat, sw.lng]);
      const p2 = map.latLngToContainerPoint([lat, ne.lng]);
      ctx.beginPath();
      ctx.moveTo(p1.x - topLeft.x, p1.y - topLeft.y);
      ctx.lineTo(p2.x - topLeft.x, p2.y - topLeft.y);
      ctx.stroke();
    }
    for (let lon = startLon; lon <= ne.lng + lonStep; lon += lonStep) {
      const p1 = map.latLngToContainerPoint([sw.lat, lon]);
      const p2 = map.latLngToContainerPoint([ne.lat, lon]);
      ctx.beginPath();
      ctx.moveTo(p1.x - topLeft.x, p1.y - topLeft.y);
      ctx.lineTo(p2.x - topLeft.x, p2.y - topLeft.y);
      ctx.stroke();
    }

    // Labels at intersections
    if (zoom >= 6) {
      for (let lat = startLat; lat <= ne.lat; lat += latStep) {
        for (let lon = startLon; lon <= ne.lng; lon += lonStep) {
          const mgrs = MGRS.fromLatLon(lat, lon, labelPrecision === 0 ? 0 : labelPrecision * 2);
          const parts = mgrs.split(' ');
          const label = zoom < 8 ? (parts[0] || '') : (parts[1] || '');
          if (!label) continue;
          const p = map.latLngToContainerPoint([lat, lon]);
          const px = p.x - topLeft.x, py = p.y - topLeft.y;
          if (px > 0 && px < canvas.width && py > 10 && py < canvas.height) {
            ctx.fillText(label, px + 2, py - 2);
          }
        }
      }
    }
  }
});

function toRad(d) { return d * Math.PI / 180; }

window.MGRS = MGRS;
window.MgrsGridLayer = MgrsGridLayer;
