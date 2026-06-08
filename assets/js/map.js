/**
 * Leaflet map initialization, tile layers, MGRS grid, and core map events.
 */

let map;
let mgrsGridLayer = null;

// White background: a canvas GridLayer that paints every tile solid white
const WhiteLayer = L.GridLayer.extend({
  createTile(coords) {
    const tile = document.createElement('canvas');
    const size = this.getTileSize();
    tile.width  = size.x;
    tile.height = size.y;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tile.width, tile.height);
    return tile;
  },
});

const TILE_LAYERS = {
  'Street (OSM)': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri, DigitalGlobe, GeoEye',
    maxZoom: 18,
  }),
  'Terrain': L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg', {
    attribution: '&copy; <a href="http://stamen.com">Stamen Design</a>',
    maxZoom: 18,
  }),
  'White Background': new WhiteLayer({ attribution: '' }),
};

function initMap() {
  map = L.map('map', {
    center: [35.0, -80.0],
    zoom: 7,
    zoomControl: true,
  });

  TILE_LAYERS['Street (OSM)'].addTo(map);
  mgrsGridLayer = new MgrsGridLayer();

  const overlayLayers = { 'MGRS Grid': mgrsGridLayer };
  L.control.layers(TILE_LAYERS, overlayLayers, { position: 'topright' }).addTo(map);

  // Disable dark tile filter when White Background is active
  map.on('baselayerchange', e => {
    document.getElementById('map').classList.toggle('white-bg-active', e.name === 'White Background');
  });

  // Update status bar on mouse move
  map.on('mousemove', e => {
    const mgrs = MGRS.fromLatLon(e.latlng.lat, e.latlng.lng);
    document.getElementById('status-mgrs').textContent = mgrs;
  });

  map.on('zoomend', () => {
    document.getElementById('status-zoom').textContent = map.getZoom();
    rebuildAllMarkers();
  });

  map.on('click', e => {
    if (window.appState && window.appState.mode === 'PLACE' && window.appState.placeType) {
      window.placeUnit(e.latlng, window.appState.placeType);
    } else if (window.appState && window.appState.mode === 'DRAW_LINE') {
      window.addLinePoint(e.latlng);
    } else if (window.appState && window.appState.mode === 'DRAW_POLYGON') {
      window.addPolygonPoint(e.latlng);
    }
    document.getElementById('context-menu').classList.remove('open');
  });

  map.on('mousedown', () => {
    document.getElementById('context-menu').classList.remove('open');
  });

  return map;
}

function rebuildAllMarkers() {
  if (!window.units) return;
  window.units.forEach(unit => {
    if (unit._marker) {
      const newMarker = createMarker(unit, map);
      map.removeLayer(unit._marker);
      newMarker.addTo(map);
      attachMarkerEvents(newMarker, unit);
      unit._marker = newMarker;
    }
  });
}

function attachMarkerEvents(marker, unit) {
  marker.on('click', e => {
    L.DomEvent.stopPropagation(e);
    if (window.appState.mode === 'DELETE') {
      window.deleteUnit(unit.id);
      return;
    }
    window.selectUnit(unit.id);
  });

  marker.on('contextmenu', e => {
    L.DomEvent.stopPropagation(e);
    window.selectUnit(unit.id);
    showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY, unit.id);
  });

  marker.on('dragend', e => {
    const latlng = e.target.getLatLng();
    window.pushHistory();
    unit.latlng = [latlng.lat, latlng.lng];
    if (window.selectedUnitId === unit.id) {
      document.getElementById('props-coords').textContent = MGRS.fromLatLon(latlng.lat, latlng.lng);
    }
    window.updateStatusCounts();
  });
}

function showContextMenu(x, y, unitId) {
  const menu = document.getElementById('context-menu');
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.dataset.unitId = unitId;

  // Update lock label to match current state
  const unit = window.units && window.units.find(u => u.id === unitId);
  const lockItem = document.getElementById('ctx-lock-item');
  if (lockItem && unit) {
    lockItem.textContent = unit.locked !== false ? '🔓 Unlock' : '🔒 Lock';
  }

  menu.classList.add('open');
}

window.map = null;
window.initMap = initMap;
window.attachMarkerEvents = attachMarkerEvents;
window.rebuildAllMarkers = rebuildAllMarkers;
window.showContextMenu = showContextMenu;

document.addEventListener('DOMContentLoaded', () => {
  window.map = initMap();
});
