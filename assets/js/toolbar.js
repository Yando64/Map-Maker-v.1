/**
 * Toolbar UI, mode state machine, unit placement, line drawing, undo/redo.
 */

// ─── App State ────────────────────────────────────────────────────────────────

window.appState = {
  mode: 'SELECT',    // SELECT | PLACE | DRAW_LINE | DELETE
  placeType: null,
  drawLineType: null,
};

window.symbolScaleFixed = false;
window.symbolSizeScale  = 1.0;

window.units = [];
window.lines = [];
window.selectedUnitId = null;
window.selectedLineId = null;
window._history = [];
window._historyIndex = -1;
window._drawingPoints = [];
window._drawPolyline = null;
window.polygons = [];
window._polygonPoints = [];
window._polygonPreview = null;
window.selectedPolyId = null;

// ─── History ──────────────────────────────────────────────────────────────────

function pushHistory() {
  const state = JSON.stringify({
    units: window.units.map(u => ({ ...u, _marker: undefined })),
    lines: window.lines,
    polygons: window.polygons.map(p => ({ ...p, _layer: undefined })),
  });
  if (window._history[window._historyIndex] === state) return;
  window._history = window._history.slice(0, window._historyIndex + 1);
  window._history.push(state);
  if (window._history.length > 50) window._history.shift();
  window._historyIndex = window._history.length - 1;
}

function undo() {
  if (window._historyIndex <= 0) return;
  window._historyIndex--;
  restoreState(JSON.parse(window._history[window._historyIndex]));
}

function redo() {
  if (window._historyIndex >= window._history.length - 1) return;
  window._historyIndex++;
  restoreState(JSON.parse(window._history[window._historyIndex]));
}

function restoreState(state) {
  window.units.forEach(u => { if (u._marker) window.map.removeLayer(u._marker); });
  window.lines.forEach(l => { if (l._layer) window.map.removeLayer(l._layer); });
  (window.polygons || []).forEach(p => { if (p._layer) window.map.removeLayer(p._layer); });
  window.units = [];
  window.lines = [];
  window.polygons = [];

  state.units.forEach(u => placeUnit(u.latlng, u.type, u, false));
  state.lines.forEach(l => drawLine(l.latlngs, l.lineType, l.label, l, false));
  (state.polygons || []).forEach(p => drawPolygon(p.latlngs, p.polyType, p.label, p, false));
  updateStatusCounts();
  closePropPanel();
}

window.pushHistory = pushHistory;
window.undo = undo;
window.redo = redo;

// ─── Mode Management ─────────────────────────────────────────────────────────

function setMode(mode, subType) {
  window.appState.mode = mode;
  window.appState.placeType = mode === 'PLACE' ? subType : null;
  window.appState.drawLineType = mode === 'DRAW_LINE' ? subType : null;
  window.appState.drawPolyType = mode === 'DRAW_POLYGON' ? subType : null;

  const mapEl = document.getElementById('map');
  if (mode === 'PLACE' || mode === 'DRAW_LINE' || mode === 'DRAW_POLYGON') {
    mapEl.style.cursor = 'crosshair';
  } else if (mode === 'DELETE') {
    mapEl.style.cursor = 'not-allowed';
  } else {
    mapEl.style.cursor = '';
  }

  if (mode !== 'PLACE') window.appState.pendingUnitConfig = null;
  if (mode !== 'DRAW_LINE') cancelDrawing();
  if (mode !== 'DRAW_POLYGON') cancelPolygonDrawing();

  const modeLabel = mode === 'PLACE' ? `PLACE | ${subType || ''}` :
                    mode === 'DRAW_LINE' ? `LINE | ${subType || ''}` :
                    mode === 'DRAW_POLYGON' ? `AREA | ${subType || ''}` : mode;
  document.getElementById('status-mode-val').textContent = modeLabel;

  // Highlight active tool button
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  if (subType) {
    const btn = document.querySelector(`[data-type="${subType}"]`);
    if (btn) btn.classList.add('active');
  }

  document.querySelector('[data-mode="SELECT"]')?.classList.toggle('active', mode === 'SELECT');
  document.querySelector('[data-mode="DELETE"]')?.classList.toggle('active', mode === 'DELETE');
}

window.setMode = setMode;

// ─── Unit Placement ───────────────────────────────────────────────────────────

function placeUnit(latlng, type, overrides = {}, addToHistory = true) {
  const id = overrides.id || 'unit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const typeDef = SYMBOL_TYPES[type] || SYMBOL_TYPES['inf-f'];
  // Merge pending builder config (only for fresh placements, not history restores)
  const pending = (addToHistory && window.appState.pendingUnitConfig) ? window.appState.pendingUnitConfig : {};
  const currentSize = window.getSymbolSize ? window.getSymbolSize(window.map?.getZoom() || 7) : 32;
  const unit = {
    id,
    type,
    latlng: Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng],
    label: overrides.label !== undefined ? overrides.label : (pending.label || ''),
    echelon: overrides.echelon || pending.echelon || '',
    affiliation: overrides.affiliation || pending.affiliation || typeDef.aff || 'friendly',
    higherHQ: overrides.higherHQ || pending.higherHQ || '',
    notes: overrides.notes || '',
    locked: overrides.locked !== undefined ? overrides.locked : true,
    status: overrides.status || pending.status || 'known',
    taskForce: overrides.taskForce !== undefined ? overrides.taskForce : (pending.taskForce || false),
    comms: overrides.comms || { fm: '', mmcs: '', cell: '', other: '' },
    labelPosition: overrides.labelPosition || 'top',
    extraLabels: overrides.extraLabels || [],
    fixedSize: overrides.fixedSize || currentSize,
    _marker: null,
  };

  if (addToHistory) pushHistory();

  const marker = createMarker(unit, window.map);
  marker.addTo(window.map);
  attachMarkerEvents(marker, unit);
  unit._marker = marker;
  window.units.push(unit);
  updateStatusCounts();
  return unit;
}

function deleteUnit(id) {
  const idx = window.units.findIndex(u => u.id === id);
  if (idx === -1) return;
  pushHistory();
  const unit = window.units[idx];
  if (unit._marker) window.map.removeLayer(unit._marker);
  window.units.splice(idx, 1);
  if (window.selectedUnitId === id) closePropPanel();
  updateStatusCounts();
}

function selectUnit(id) {
  window.selectedUnitId = id;
  window.selectedPolyId = null;
  window.selectedLineId = null;
  const unit = window.units.find(u => u.id === id);
  if (!unit) return;

  // Deselect previous
  document.querySelectorAll('.sym-wrapper.selected').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('sym-' + id);
  if (el) el.classList.add('selected');

  openPropPanel(unit);
}

function duplicateUnit(id) {
  const unit = window.units.find(u => u.id === id);
  if (!unit) return;
  const offset = 0.003;
  placeUnit([unit.latlng[0] + offset, unit.latlng[1] + offset], unit.type, {
    label: unit.label ? unit.label + ' (copy)' : '',
    echelon: unit.echelon,
    affiliation: unit.affiliation,
    higherHQ: unit.higherHQ,
    notes: unit.notes,
  });
}

function toggleLock(id) {
  const unit = window.units.find(u => u.id === id);
  if (!unit) return;
  unit.locked = !unit.locked;

  // Rebuild marker to update draggable state and lock badge
  if (unit._marker) window.map.removeLayer(unit._marker);
  const marker = createMarker(unit, window.map);
  marker.addTo(window.map);
  attachMarkerEvents(marker, unit);
  unit._marker = marker;

  // Update props panel lock button if open
  const lockBtn = document.getElementById('props-lock-btn');
  if (lockBtn && window.selectedUnitId === id) {
    lockBtn.textContent = unit.locked ? '🔒 Locked' : '🔓 Unlocked';
    lockBtn.classList.toggle('lock-active', unit.locked);
  }
}

window.placeUnit = placeUnit;
window.deleteUnit = deleteUnit;
window.selectUnit = selectUnit;
window.duplicateUnit = duplicateUnit;
window.toggleLock = toggleLock;

// ─── Line Drawing ─────────────────────────────────────────────────────────────

const LINE_STYLES = {
  'phase-line':     { color: '#4a90b8', weight: 2,   dashArray: null },
  'loa':            { color: '#4a90b8', weight: 2,   dashArray: '8,4' },
  'ld':             { color: '#e04040', weight: 2,   dashArray: null },
  'lc':             { color: '#4a90b8', weight: 2,   dashArray: null },
  'ld-lc':          { color: '#e04040', weight: 2,   dashArray: null },
  'flot':           { color: '#4a90b8', weight: 2,   dashArray: '3,5' },
  'fcl':            { color: '#4a90b8', weight: 2,   dashArray: '10,4,2,4' },
  'unit-boundary':  { color: '#333333', weight: 1.5, dashArray: null },
  'axis-advance':   { color: '#4a90b8', weight: 3,   dashArray: null },
  'dir-attack':     { color: '#e04040', weight: 3,   dashArray: null },
  'engagement-area':{ color: '#e08020', weight: 1.5, dashArray: '6,3' },
  'trp':            { color: '#e04040', weight: 2,   dashArray: null },
  'obstacle-line':  { color: '#333333', weight: 3,   dashArray: null },
  'minefield-line': { color: '#e04040', weight: 2,   dashArray: '6,2' },
  'wire-obstacle':  { color: '#a08020', weight: 1.5, dashArray: '2,4' },
  'at-ditch':       { color: '#333333', weight: 3,   dashArray: '1,4' },
  'msr':            { color: '#30a030', weight: 2.5, dashArray: null },
  'asr':            { color: '#30a030', weight: 2,   dashArray: '8,4' },
  // ── Maneuver Arrows ──────────────────────────────────────────────────────────
  'arrow-attack':   { color: '#e04040', weight: 4,   dashArray: null,  arrow: 'solid' },
  'arrow-attack-en':{ color: '#e04040', weight: 3,   dashArray: null,  arrow: 'solid' },
  'arrow-axis':     { color: '#4a90b8', weight: 4,   dashArray: null,  arrow: 'solid' },
  'arrow-withdraw': { color: '#4a90b8', weight: 2,   dashArray: '7,5', arrow: 'open'  },
  'arrow-support':  { color: '#4a90b8', weight: 3,   dashArray: null,  arrow: 'open'  },
  'arrow-maneuver': { color: '#4a90b8', weight: 2,   dashArray: null,  arrow: 'solid' },
};

const AREA_STYLES = {
  'objective':       { color: '#4a90b8', fillColor: '#4a90b8', fillOpacity: 0.08, weight: 2,   dashArray: '8,4',  label: 'OBJ' },
  'assembly-area':   { color: '#4a90b8', fillColor: '#4a90b8', fillOpacity: 0.08, weight: 1.5, dashArray: '6,3',  label: 'AA' },
  'assault-pos':     { color: '#4a90b8', fillColor: '#4a90b8', fillOpacity: 0.08, weight: 2,   dashArray: null,   label: 'ASLT POS' },
  'attack-pos':      { color: '#4a90b8', fillColor: '#4a90b8', fillOpacity: 0.08, weight: 2,   dashArray: null,   label: 'ATK POS' },
  'battle-pos':      { color: '#4a90b8', fillColor: '#4a90b8', fillOpacity: 0.10, weight: 2,   dashArray: null,   label: 'BP' },
  'engagement-area-poly': { color: '#e08020', fillColor: '#e08020', fillOpacity: 0.08, weight: 1.5, dashArray: '6,3', label: 'EA' },
  'nai':             { color: '#9040b8', fillColor: '#9040b8', fillOpacity: 0.07, weight: 1.5, dashArray: '4,2',  label: 'NAI' },
  'tai':             { color: '#9040b8', fillColor: '#9040b8', fillOpacity: 0.07, weight: 1.5, dashArray: '4,2',  label: 'TAI' },
  'minefield-area':  { color: '#e04040', fillColor: '#e04040', fillOpacity: 0.12, weight: 1.5, dashArray: '4,2',  label: 'MINEFIELD' },
  'obstacle-zone':   { color: '#555555', fillColor: '#555555', fillOpacity: 0.07, weight: 1.5, dashArray: '6,3',  label: 'OBZ' },
  'logistics-area':  { color: '#30a030', fillColor: '#30a030', fillOpacity: 0.10, weight: 1.5, dashArray: null,   label: 'LOG AREA' },
  'farp':            { color: '#30a030', fillColor: '#30a030', fillOpacity: 0.10, weight: 1.5, dashArray: null,   label: 'FARP' },
};
window.AREA_STYLES = AREA_STYLES;

function addLinePoint(latlng) {
  window._drawingPoints.push(latlng);
  if (window._drawPolyline) window.map.removeLayer(window._drawPolyline);

  const lineType = window.appState.drawLineType || 'phase-line';
  const style = LINE_STYLES[lineType] || LINE_STYLES['phase-line'];

  window._drawPolyline = L.polyline(window._drawingPoints, {
    color: style.color,
    weight: style.weight,
    dashArray: style.dashArray,
    opacity: 0.7,
  }).addTo(window.map);
}

function finishLine() {
  if (window._drawingPoints.length < 2) {
    cancelDrawing();
    return;
  }
  const lineType = window.appState.drawLineType || 'phase-line';
  drawLine(window._drawingPoints.map(p => [p.lat, p.lng]), lineType, '', {}, true);
  cancelDrawing();
}

function cancelDrawing() {
  if (window._drawPolyline) {
    window.map.removeLayer(window._drawPolyline);
    window._drawPolyline = null;
  }
  window._drawingPoints = [];
}

// ─── SVG Arrow Defs ──────────────────────────────────────────────────────────
// Inject <marker> defs into Leaflet's overlay SVG once, idempotently.
function _injectArrowDefs() {
  const svgEl = document.querySelector('.leaflet-overlay-pane > svg');
  if (!svgEl || svgEl.querySelector('#tactical-arrow-defs')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  defs.id = 'tactical-arrow-defs';

  // Solid filled arrowhead: M0,0 L0,6 L7,3 z  (tip at x=7)
  // Open chevron arrowhead: M0,0 L7,3 L0,6    (tip at x=7, no fill)
  const COLORS = {
    blue:  '#4a90b8',
    red:   '#e04040',
    green: '#30a030',
    dark:  '#333333',
  };

  Object.entries(COLORS).forEach(([name, color]) => {
    ['solid', 'open'].forEach(style => {
      const m = document.createElementNS(ns, 'marker');
      m.setAttribute('id',          `ah-${name}-${style}`);
      m.setAttribute('markerWidth',  '7');
      m.setAttribute('markerHeight', '6');
      m.setAttribute('refX',         '6');
      m.setAttribute('refY',         '3');
      m.setAttribute('orient',       'auto');
      m.setAttribute('markerUnits',  'strokeWidth');

      const p = document.createElementNS(ns, 'path');
      if (style === 'solid') {
        p.setAttribute('d',    'M0,0 L0,6 L7,3 z');
        p.setAttribute('fill', color);
      } else {
        p.setAttribute('d',           'M0,0 L7,3 L0,6');
        p.setAttribute('fill',        'none');
        p.setAttribute('stroke',      color);
        p.setAttribute('stroke-width','1');
      }
      m.appendChild(p);
      defs.appendChild(m);
    });
  });

  svgEl.insertBefore(defs, svgEl.firstChild);
}

// Map a LINE_STYLES color to the closest named color key used in marker IDs.
function _colorKey(hex) {
  if (hex === '#4a90b8') return 'blue';
  if (hex === '#e04040') return 'red';
  if (hex === '#30a030') return 'green';
  return 'dark';
}

// Apply marker-end to a Leaflet polyline's SVG path.
function _applyArrow(layer, style) {
  if (!style.arrow || !layer._path) return;
  const key = `ah-${_colorKey(style.color)}-${style.arrow}`;
  layer._path.setAttribute('marker-end', `url(#${key})`);
}

function drawLine(latlngs, lineType, label, overrides = {}, addToHistory = true) {
  const id = overrides.id || 'line-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const style = LINE_STYLES[lineType] || LINE_STYLES['phase-line'];

  const lineObj = {
    id,
    lineType,
    label: label || overrides.label || '',
    latlngs,
    _layer: null,
  };

  let layer;
  if (lineType === 'trp') {
    // TRP is a marker with X
    const center = latlngs[0];
    layer = L.marker(center, {
      icon: L.divIcon({
        html: `<div style="color:${style.color};font-size:18px;font-weight:bold;text-shadow:0 0 3px #000">✕</div>`,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
    });
  } else {
    layer = L.polyline(latlngs, {
      color: style.color,
      weight: style.weight,
      dashArray: style.dashArray,
    });
  }

  layer.addTo(window.map);
  lineObj._layer = layer;

  // Apply SVG arrowhead marker-end if this line type requests one
  if (style.arrow) {
    _injectArrowDefs();
    if (layer._path) {
      _applyArrow(layer, style);
    } else {
      // Path not yet rendered (e.g. layer added before SVG pane ready) — defer
      layer.once('add', () => { _injectArrowDefs(); _applyArrow(layer, style); });
    }
  }

  // Label popup
  if (lineObj.label && lineType !== 'trp') {
    layer.bindTooltip(lineObj.label, { permanent: true, className: 'line-label', direction: 'center' });
  }

  layer.on('click', e => {
    L.DomEvent.stopPropagation(e);
    if (window.appState.mode === 'DELETE') {
      deleteLine(lineObj.id);
    } else {
      window.selectedLineId = lineObj.id;
      openLinePropPanel(lineObj);
    }
  });

  if (addToHistory) pushHistory();
  window.lines.push(lineObj);
  updateStatusCounts();
  return lineObj;
}

function deleteLine(id) {
  const idx = window.lines.findIndex(l => l.id === id);
  if (idx === -1) return;
  pushHistory();
  const line = window.lines[idx];
  if (line._layer) window.map.removeLayer(line._layer);
  window.lines.splice(idx, 1);
  updateStatusCounts();
}

window.addLinePoint = addLinePoint;
window.finishLine = finishLine;
window.cancelDrawing = cancelDrawing;
window.drawLine = drawLine;
window.deleteLine = deleteLine;
window._injectArrowDefs = _injectArrowDefs;

// ─── Polygon / Area Drawing ───────────────────────────────────────────────────

function addPolygonPoint(latlng) {
  window._polygonPoints.push(latlng);
  _updatePolygonPreview();
}

function _updatePolygonPreview() {
  if (window._polygonPreview) window.map.removeLayer(window._polygonPreview);
  if (window._polygonPoints.length < 2) return;
  const polyType = window.appState.drawPolyType || 'objective';
  const style = AREA_STYLES[polyType] || AREA_STYLES['objective'];
  window._polygonPreview = L.polygon(window._polygonPoints, {
    color: style.color,
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity * 0.5,
    weight: style.weight,
    dashArray: style.dashArray,
    opacity: 0.6,
  }).addTo(window.map);
}

function finishPolygon() {
  if (window._polygonPoints.length < 3) { cancelPolygonDrawing(); return; }
  const polyType = window.appState.drawPolyType || 'objective';
  drawPolygon(window._polygonPoints.map(p => [p.lat, p.lng]), polyType, '', {}, true);
  cancelPolygonDrawing();
}

function cancelPolygonDrawing() {
  if (window._polygonPreview) {
    window.map.removeLayer(window._polygonPreview);
    window._polygonPreview = null;
  }
  window._polygonPoints = [];
}

function drawPolygon(latlngs, polyType, label, overrides = {}, addToHistory = true) {
  const id = overrides.id || 'poly-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const style = AREA_STYLES[polyType] || AREA_STYLES['objective'];
  const polyObj = {
    id, polyType,
    label: overrides.label !== undefined ? overrides.label : (label || style.label || polyType),
    latlngs,
    _layer: null,
  };

  const layer = L.polygon(latlngs, {
    color: style.color,
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity,
    weight: style.weight,
    dashArray: style.dashArray,
  }).addTo(window.map);
  polyObj._layer = layer;

  if (polyObj.label) {
    layer.bindTooltip(polyObj.label, { permanent: true, className: 'area-label', direction: 'center' });
  }

  layer.on('click', e => {
    L.DomEvent.stopPropagation(e);
    if (window.appState.mode === 'DELETE') { deletePolygon(polyObj.id); return; }
    window.selectedPolyId = polyObj.id;
    openPolygonPropPanel(polyObj);
  });

  if (addToHistory) pushHistory();
  window.polygons.push(polyObj);
  updateStatusCounts();
  return polyObj;
}

function deletePolygon(id) {
  const idx = window.polygons.findIndex(p => p.id === id);
  if (idx === -1) return;
  pushHistory();
  const poly = window.polygons[idx];
  if (poly._layer) window.map.removeLayer(poly._layer);
  window.polygons.splice(idx, 1);
  updateStatusCounts();
}

function openPolygonPropPanel(polyObj) {
  window.selectedPolyId = polyObj.id;
  window.selectedUnitId = null;
  window.selectedLineId = null;
  const panel = document.getElementById('props-panel');
  panel.classList.add('open');
  panel.dataset.polyId = polyObj.id;
  panel.dataset.unitId = '';
  panel.dataset.lineId = '';
  const style = AREA_STYLES[polyObj.polyType];
  document.getElementById('props-title').textContent = (style?.label || polyObj.polyType) + ' Area';
  document.getElementById('props-coords').textContent = '';
  document.getElementById('prop-label').value = polyObj.label || '';
  document.getElementById('prop-echelon').value = '';
  document.getElementById('prop-affiliation').value = '';
  document.getElementById('prop-notes').value = '';
  const lockBtn = document.getElementById('props-lock-btn');
  if (lockBtn) lockBtn.style.display = 'none';
}

window.addPolygonPoint = addPolygonPoint;
window.finishPolygon = finishPolygon;
window.cancelPolygonDrawing = cancelPolygonDrawing;
window.drawPolygon = drawPolygon;
window.deletePolygon = deletePolygon;

// ─── Properties Panel ─────────────────────────────────────────────────────────

function openPropPanel(unit) {
  const panel = document.getElementById('props-panel');
  panel.classList.add('open');
  panel.dataset.unitId = unit.id;

  document.getElementById('props-title').textContent = SYMBOL_TYPES[unit.type]?.label || unit.type;
  document.getElementById('props-coords').textContent = MGRS.fromLatLon(unit.latlng[0], unit.latlng[1]);
  document.getElementById('prop-label').value = unit.label || '';
  _setLabelPos('label-pos-btns', 'prop-label-pos', unit.labelPosition || 'top');
  _renderExtraLabels(unit.extraLabels || []);
  document.getElementById('prop-echelon').value = unit.echelon || '';
  document.getElementById('prop-affiliation').value = unit.affiliation || 'friendly';
  document.getElementById('prop-status').value = unit.status || 'known';
  document.getElementById('prop-notes').value = unit.notes || '';
  const c = unit.comms || {};
  document.getElementById('prop-comms-callsign').value = c.callsign || '';
  document.getElementById('prop-comms-fm').value       = c.fm       || '';
  document.getElementById('prop-comms-mmcs').value     = c.mmcs     || '';
  document.getElementById('prop-comms-cell').value     = c.cell     || '';
  document.getElementById('prop-comms-other').value    = c.other    || '';
  // Hide grid editor when opening a new unit
  document.getElementById('props-grid-editor').style.display = 'none';
  const lockBtn = document.getElementById('props-lock-btn');
  if (lockBtn) {
    lockBtn.style.display = '';
    lockBtn.textContent = unit.locked !== false ? '🔒 Locked' : '🔓 Unlocked';
  }
}

function closePropPanel() {
  document.getElementById('props-panel').classList.remove('open');
  window.selectedUnitId = null;
  window.selectedPolyId = null;
  document.querySelectorAll('.sym-wrapper.selected').forEach(el => el.classList.remove('selected'));
  const lockBtn = document.getElementById('props-lock-btn');
  if (lockBtn) lockBtn.style.display = '';
}

function savePropPanel() {
  // Handle line label save
  if (window.selectedLineId) {
    const lineObj = window.lines.find(l => l.id === window.selectedLineId);
    if (lineObj) {
      pushHistory();
      lineObj.label = document.getElementById('prop-label').value;
      if (lineObj._layer) {
        lineObj._layer.unbindTooltip();
        if (lineObj.label) {
          lineObj._layer.bindTooltip(lineObj.label, { permanent: true, className: 'line-label', direction: 'center' });
        }
      }
    }
    closePropPanel();
    return;
  }

  // Handle polygon label save
  if (window.selectedPolyId) {
    const poly = window.polygons.find(p => p.id === window.selectedPolyId);
    if (poly) {
      pushHistory();
      poly.label = document.getElementById('prop-label').value;
      if (poly._layer) {
        poly._layer.unbindTooltip();
        if (poly.label) {
          poly._layer.bindTooltip(poly.label, { permanent: true, className: 'area-label', direction: 'center' });
        }
      }
    }
    closePropPanel();
    return;
  }

  const id = window.selectedUnitId;
  const unit = window.units.find(u => u.id === id);
  if (!unit) return;
  pushHistory();
  unit.label = document.getElementById('prop-label').value;
  unit.labelPosition = document.getElementById('prop-label-pos').value || 'top';
  unit.extraLabels = _readExtraLabels();
  unit.echelon = document.getElementById('prop-echelon').value;
  unit.affiliation = document.getElementById('prop-affiliation').value;
  unit.status = document.getElementById('prop-status').value;
  unit.notes = document.getElementById('prop-notes').value;
  unit.comms = {
    callsign: document.getElementById('prop-comms-callsign').value,
    fm:       document.getElementById('prop-comms-fm').value,
    mmcs:     document.getElementById('prop-comms-mmcs').value,
    cell:     document.getElementById('prop-comms-cell').value,
    other:    document.getElementById('prop-comms-other').value,
  };

  // Rebuild marker with new props
  if (unit._marker) window.map.removeLayer(unit._marker);
  const marker = createMarker(unit, window.map);
  marker.addTo(window.map);
  attachMarkerEvents(marker, unit);
  unit._marker = marker;
}

function openLinePropPanel(lineObj) {
  window.selectedLineId = lineObj.id;
  window.selectedUnitId = null;
  window.selectedPolyId = null;
  const panel = document.getElementById('props-panel');
  panel.classList.add('open');
  panel.dataset.lineId = lineObj.id;
  panel.dataset.unitId = '';
  panel.dataset.polyId = '';
  const lockBtn = document.getElementById('props-lock-btn');
  if (lockBtn) lockBtn.style.display = 'none';
  document.getElementById('props-title').textContent = lineObj.lineType.replace(/-/g, ' ').toUpperCase();
  document.getElementById('props-coords').textContent = '';
  document.getElementById('prop-label').value = lineObj.label || '';
  document.getElementById('prop-echelon').value = '';
  document.getElementById('prop-affiliation').value = '';
  document.getElementById('prop-notes').value = '';
}

// ─── Label position helpers ───────────────────────────────────────────────────

function _setLabelPos(groupId, hiddenId, pos) {
  document.querySelectorAll(`#${groupId} .label-pos-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pos === pos);
  });
  document.getElementById(hiddenId).value = pos;
}

function _wireLabelPosGroup(groupId, hiddenId) {
  document.querySelectorAll(`#${groupId} .label-pos-btn`).forEach(btn => {
    btn.addEventListener('click', () => _setLabelPos(groupId, hiddenId, btn.dataset.pos));
  });
}

function _renderExtraLabels(extras) {
  const container = document.getElementById('prop-extra-labels');
  if (!container) return;
  container.innerHTML = '';
  (extras || []).forEach((el, i) => _addExtraLabelRow(el.text || '', el.position || 'top', i));
}

function _addExtraLabelRow(text, pos, index) {
  const container = document.getElementById('prop-extra-labels');
  if (!container) return;
  const idx = index !== undefined ? index : container.children.length;
  const groupId = `extra-pos-btns-${idx}`;
  const hiddenId = `extra-pos-${idx}`;

  const row = document.createElement('div');
  row.className = 'extra-label-row form-group';
  row.dataset.extraIdx = idx;
  row.innerHTML = `
    <div class="label-field-header">
      <label style="font-size:11px;color:var(--text-secondary)">Label ${idx + 2}</label>
      <div class="label-pos-btns" id="${groupId}">
        <button class="label-pos-btn" data-pos="top"    title="Above symbol">↑</button>
        <button class="label-pos-btn" data-pos="left"   title="Left of symbol">←</button>
        <button class="label-pos-btn" data-pos="right"  title="Right of symbol">→</button>
        <button class="label-pos-btn" data-pos="bottom" title="Below symbol">↓</button>
      </div>
    </div>
    <input type="hidden" id="${hiddenId}" value="${pos}">
    <div class="extra-label-input-row">
      <input type="text" class="extra-label-text" placeholder="Additional label" value="${text}" style="flex:1">
      <button class="extra-label-remove" title="Remove">×</button>
    </div>`;

  row.querySelector('.extra-label-remove').addEventListener('click', () => {
    row.remove();
    _renumberExtraLabels();
  });
  container.appendChild(row);
  _wireLabelPosGroup(groupId, hiddenId);
  _setLabelPos(groupId, hiddenId, pos);
}

function _renumberExtraLabels() {
  document.querySelectorAll('#prop-extra-labels .extra-label-row').forEach((row, i) => {
    row.querySelector('label').textContent = `Label ${i + 2}`;
  });
}

function _readExtraLabels() {
  const result = [];
  document.querySelectorAll('#prop-extra-labels .extra-label-row').forEach(row => {
    const text = row.querySelector('.extra-label-text')?.value?.trim() || '';
    const pos  = row.querySelector('input[type="hidden"]')?.value || 'top';
    if (text) result.push({ text, position: pos });
  });
  return result;
}

window.openPropPanel = openPropPanel;
window.closePropPanel = closePropPanel;
window.savePropPanel = savePropPanel;

// ─── Status Bar ───────────────────────────────────────────────────────────────

function updateStatusCounts() {
  document.getElementById('status-units').textContent = window.units.length;
  document.getElementById('status-lines').textContent = window.lines.length + (window.polygons || []).length;
}
window.updateStatusCounts = updateStatusCounts;

// ─── Clear All ────────────────────────────────────────────────────────────────

function clearAll() {
  if (!confirm('Clear all units, lines, and areas?')) return;
  pushHistory();
  window.units.forEach(u => { if (u._marker) window.map.removeLayer(u._marker); });
  window.lines.forEach(l => { if (l._layer) window.map.removeLayer(l._layer); });
  (window.polygons || []).forEach(p => { if (p._layer) window.map.removeLayer(p._layer); });
  window.units = [];
  window.lines = [];
  window.polygons = [];
  cancelPolygonDrawing();
  closePropPanel();
  updateStatusCounts();
}
window.clearAll = clearAll;

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 's') { e.preventDefault(); window.saveOverlay && window.saveOverlay(); return; }
  }

  switch (e.key.toUpperCase()) {
    case 'S': setMode('SELECT'); break;
    case 'P': setMode('PLACE', window.appState.placeType || 'inf-f'); break;
    case 'L': setMode('DRAW_LINE', window.appState.drawLineType || 'phase-line'); break;
    case 'T': window.toggleTheme && window.toggleTheme(); break;
    case 'G': window.toggleMgrsGrid && window.toggleMgrsGrid(); break;
    case 'DELETE': case 'BACKSPACE':
      if (window.selectedUnitId) deleteUnit(window.selectedUnitId);
      break;
    case 'ESCAPE':
      setMode('SELECT');
      cancelDrawing();
      cancelPolygonDrawing();
      closePropPanel();
      break;
    case 'ENTER':
      if (window.appState.mode === 'DRAW_LINE') finishLine();
      else if (window.appState.mode === 'DRAW_POLYGON') finishPolygon();
      break;
  }
});

// Double-click to finish line
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.map) {
      window.map.on('dblclick', e => {
        if (window.appState.mode === 'DRAW_LINE') {
          L.DomEvent.stopPropagation(e);
          finishLine();
        } else if (window.appState.mode === 'DRAW_POLYGON') {
          L.DomEvent.stopPropagation(e);
          finishPolygon();
        }
      });
    }
  }, 500);
});

// ─── Toolbar Builder ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildToolbar();
  buildContextMenu();
  buildPropsPanel();
  pushHistory(); // Initial state

  // Symbol scale toggle
  const scaleBtn = document.getElementById('scale-toggle');
  if (scaleBtn) {
    scaleBtn.addEventListener('click', () => {
      window.symbolScaleFixed = !window.symbolScaleFixed;
      scaleBtn.classList.toggle('active', !window.symbolScaleFixed);
      scaleBtn.textContent = window.symbolScaleFixed ? '⊟ Fixed Size' : '⊞ Scale with Zoom';
      // When switching to fixed: capture current size for any units that don't have one
      if (window.symbolScaleFixed && window.map) {
        const sz = window.getSymbolSize(window.map.getZoom());
        window.units.forEach(u => { if (!u.fixedSize) u.fixedSize = sz; });
      }
      // Always rebuild so markers reflect new sizing mode immediately
      window.rebuildAllMarkers();
    });
  }
});

function buildToolbar() {
  const toolbar = document.getElementById('toolbar');
  toolbar.innerHTML = '';

  // Search section (sticky at top)
  toolbar.appendChild(makeSearchSection());

  // Tools section
  const toolsSec = makeSection('Tools', [
    { label: 'Select',    icon: cursorIcon(), mode: 'SELECT'    },
    { label: 'Draw Line', icon: penIcon(),    mode: 'DRAW_LINE' },
    { label: 'Delete',    icon: trashIcon(),  mode: 'DELETE'    },
  ], 'tools', true);

  // Insert Symbol Builder button right after Select
  const toolsBody = toolsSec.querySelector('.toolbar-section-body');
  const sbBtn = document.createElement('button');
  sbBtn.className = 'tool-btn';
  sbBtn.innerHTML = `${builderIcon()}<span class="btn-label">Symbol Builder</span>`;
  sbBtn.title = 'Open Symbol Builder';
  sbBtn.onclick = () => window.openSymbolBuilder && window.openSymbolBuilder();
  // Insert as second child (after Select)
  toolsBody.insertBefore(sbBtn, toolsBody.children[1]);
  toolbar.appendChild(toolsSec);

  // 4-tab symbol panel
  toolbar.appendChild(makeSymbolTabs());

  // Map tools
  toolbar.appendChild(makeMapTools());
  toolbar.appendChild(makeMgrsSettings());
}

function makeSymbolTabs() {
  const wrap = document.createElement('div');
  wrap.className = 'toolbar-section';

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'sym-tabs';
  const tabs = [
    { id: 'tab-formations',  label: 'Forma-\ntions' },
    { id: 'tab-tactical',    label: 'Tactical\nGraphics' },
    { id: 'tab-equipment',   label: 'Equip/\nInstal' },
    { id: 'tab-generic',     label: 'Generic\nGraphics' },
  ];

  const panels = document.createElement('div');
  panels.className = 'sym-tab-panels';

  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'sym-tab' + (i === 0 ? ' active' : '');
    btn.textContent = t.label;
    btn.dataset.tab = t.id;
    btn.onclick = () => {
      tabBar.querySelectorAll('.sym-tab').forEach(b => b.classList.remove('active'));
      panels.querySelectorAll('.sym-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(t.id)?.classList.add('active');
    };
    tabBar.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'sym-tab-panel' + (i === 0 ? ' active' : '');
    panel.id = t.id;
    panels.appendChild(panel);
  });

  wrap.appendChild(tabBar);
  wrap.appendChild(panels);

  // Populate Formations tab: friendly, enemy, neutral sub-sections
  const formPanel = document.getElementById('tab-formations') || wrap.querySelector('#tab-formations');
  _fillFormationsTab(wrap.querySelector('#tab-formations'));
  _fillTacticalTab(wrap.querySelector('#tab-tactical'));
  _fillEquipmentTab(wrap.querySelector('#tab-equipment'));
  _fillGenericTab(wrap.querySelector('#tab-generic'));

  return wrap;
}

function _makeSubSection(title, body, expanded) {
  const sec = document.createElement('div');
  sec.className = 'toolbar-section' + (expanded ? '' : ' collapsed');
  const hdr = document.createElement('div');
  hdr.className = 'toolbar-section-header';
  hdr.style.cssText = 'font-size:10px;padding:5px 8px;';
  hdr.innerHTML = `<span>${title}</span><span class="section-toggle">▼</span>`;
  hdr.onclick = () => sec.classList.toggle('collapsed');
  sec.appendChild(hdr);
  sec.appendChild(body);
  return sec;
}

function _symbolGrid(types) {
  const body = document.createElement('div');
  body.className = 'toolbar-section-body';
  types.forEach(type => {
    const def = SYMBOL_TYPES[type];
    if (!def) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.type = type;
    btn.innerHTML = `<div>${buildPreviewSvg(type)}</div><span class="btn-label">${def.label}</span>`;
    btn.title = def.label;
    btn.onclick = () => setMode('PLACE', type);
    body.appendChild(btn);
  });
  return body;
}

function _fillFormationsTab(panel) {
  if (!panel) return;
  const friendly = Object.keys(SYMBOL_TYPES).filter(k => SYMBOL_TYPES[k].tab === 'formations' && SYMBOL_TYPES[k].aff === 'friendly');
  const enemy    = Object.keys(SYMBOL_TYPES).filter(k => SYMBOL_TYPES[k].tab === 'formations' && SYMBOL_TYPES[k].aff === 'enemy');
  const other    = Object.keys(SYMBOL_TYPES).filter(k => SYMBOL_TYPES[k].tab === 'formations' && !['friendly','enemy'].includes(SYMBOL_TYPES[k].aff));

  panel.appendChild(_makeSubSection('Friendly', _symbolGrid(friendly), true));
  panel.appendChild(_makeSubSection('Enemy', _symbolGrid(enemy), false));
  if (other.length) panel.appendChild(_makeSubSection('Neutral / Unknown', _symbolGrid(other), false));
}

function _lineBody(lines) {
  const body = document.createElement('div');
  body.className = 'toolbar-section-body';
  lines.forEach(({ type, label }) => {
    const style = LINE_STYLES[type] || { color: '#888', dashArray: null };
    const c = style.color;
    const w = Math.min(style.weight || 2, 3);
    // Arrow preview icon
    let arrowSvg = '';
    if (style.arrow === 'solid') {
      arrowSvg = `<polygon points="26,7 20,3 20,11" fill="${c}"/>`;
    } else if (style.arrow === 'open') {
      arrowSvg = `<polyline points="20,3 26,7 20,11" fill="none" stroke="${c}" stroke-width="1.5"/>`;
    }
    const lineEnd = style.arrow ? 20 : 26;
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.type = type;
    btn.innerHTML = `<svg width="28" height="14" viewBox="0 0 28 14">
      <line x1="2" y1="7" x2="${lineEnd}" y2="7" stroke="${c}" stroke-width="${w}" stroke-dasharray="${style.dashArray || 'none'}"/>
      ${arrowSvg}
    </svg><span class="btn-label">${label}</span>`;
    btn.title = label;
    btn.onclick = () => setMode('DRAW_LINE', type);
    body.appendChild(btn);
  });
  return body;
}

function _areaBody(areas) {
  const body = document.createElement('div');
  body.className = 'toolbar-section-body';
  areas.forEach(({ type, label }) => {
    const style = AREA_STYLES[type] || {};
    const color = style.color || '#4a90b8';
    const fill = style.fillColor || color;
    const dash = style.dashArray || 'none';
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.type = type;
    btn.innerHTML = `<svg width="28" height="20" viewBox="0 0 28 20">
      <polygon points="4,17 14,3 24,17"
        fill="${fill}" fill-opacity="0.2"
        stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}"/>
    </svg><span class="btn-label">${label}</span>`;
    btn.title = label + ' — click points, dbl-click to finish';
    btn.onclick = () => setMode('DRAW_POLYGON', type);
    body.appendChild(btn);
  });
  return body;
}

function _fillTacticalTab(panel) {
  if (!panel) return;

  panel.appendChild(_makeSubSection('Maneuver Arrows', _lineBody([
    { type: 'arrow-attack',    label: 'Dir of Attack' },
    { type: 'arrow-attack-en', label: 'Enemy Attack' },
    { type: 'arrow-axis',      label: 'Axis of Advance' },
    { type: 'arrow-withdraw',  label: 'Withdrawal' },
    { type: 'arrow-support',   label: 'Follow & Support' },
    { type: 'arrow-maneuver',  label: 'General Maneuver' },
  ]), true));

  panel.appendChild(_makeSubSection('Maneuver Control Lines', _lineBody([
    { type: 'phase-line',    label: 'Phase Line' },
    { type: 'loa',           label: 'LOA' },
    { type: 'ld',            label: 'LD' },
    { type: 'lc',            label: 'LC' },
    { type: 'ld-lc',         label: 'LD/LC' },
    { type: 'flot',          label: 'FLOT' },
    { type: 'fcl',           label: 'FCL' },
    { type: 'unit-boundary', label: 'Boundary' },
    { type: 'axis-advance',  label: 'Axis Adv' },
    { type: 'dir-attack',    label: 'Dir Atk' },
  ]), false));

  panel.appendChild(_makeSubSection('Maneuver Areas', _areaBody([
    { type: 'objective',          label: 'Objective' },
    { type: 'assembly-area',      label: 'Assembly Area' },
    { type: 'assault-pos',        label: 'Assault Pos' },
    { type: 'attack-pos',         label: 'Attack Pos' },
    { type: 'battle-pos',         label: 'Battle Pos' },
    { type: 'engagement-area-poly', label: 'Engagement Area' },
    { type: 'nai',                label: 'NAI' },
    { type: 'tai',                label: 'TAI' },
  ]), false));

  panel.appendChild(_makeSubSection('Obstacle Lines', _lineBody([
    { type: 'obstacle-line',  label: 'Obstacle' },
    { type: 'minefield-line', label: 'Minefield' },
    { type: 'wire-obstacle',  label: 'Wire' },
    { type: 'at-ditch',       label: 'AT Ditch' },
  ]), false));

  panel.appendChild(_makeSubSection('Obstacle Areas', _areaBody([
    { type: 'minefield-area', label: 'Minefield Area' },
    { type: 'obstacle-zone',  label: 'Obstacle Zone' },
  ]), false));

  panel.appendChild(_makeSubSection('Logistics Routes', _lineBody([
    { type: 'msr', label: 'MSR' },
    { type: 'asr', label: 'ASR' },
  ]), false));

  panel.appendChild(_makeSubSection('Logistics Areas', _areaBody([
    { type: 'logistics-area', label: 'Logistics Area' },
    { type: 'farp',           label: 'FARP' },
  ]), false));
}

function _fillEquipmentTab(panel) {
  if (!panel) return;
  const types = Object.keys(SYMBOL_TYPES).filter(k => SYMBOL_TYPES[k].tab === 'equipment');
  panel.appendChild(_makeSubSection('Equipment & Installations', _symbolGrid(types), true));
}

function _fillGenericTab(panel) {
  if (!panel) return;
  const types = Object.keys(SYMBOL_TYPES).filter(k => SYMBOL_TYPES[k].tab === 'generic');
  panel.appendChild(_makeSubSection('Generic Graphics', _symbolGrid(types), true));
}

function makeSection(title, items, id, expanded = true) {
  const sec = document.createElement('div');
  sec.className = 'toolbar-section' + (expanded ? '' : ' collapsed');
  sec.id = 'sec-' + id;

  const header = document.createElement('div');
  header.className = 'toolbar-section-header';
  header.innerHTML = `<span>${title}</span><span class="section-toggle">▼</span>`;
  header.onclick = () => sec.classList.toggle('collapsed');

  const body = document.createElement('div');
  body.className = 'toolbar-section-body';

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.mode = item.mode;
    btn.innerHTML = `${item.icon}<span class="btn-label">${item.label}</span>`;
    btn.title = item.label;
    btn.onclick = () => setMode(item.mode, null);
    body.appendChild(btn);
  });

  sec.appendChild(header);
  sec.appendChild(body);
  return sec;
}

function makeSymbolSection(title, types, expanded) {
  const sec = document.createElement('div');
  sec.className = 'toolbar-section' + (expanded ? '' : ' collapsed');

  const header = document.createElement('div');
  header.className = 'toolbar-section-header';
  header.innerHTML = `<span>${title}</span><span class="section-toggle">▼</span>`;
  header.onclick = () => sec.classList.toggle('collapsed');

  const body = document.createElement('div');
  body.className = 'toolbar-section-body';

  types.forEach(type => {
    const def = SYMBOL_TYPES[type];
    if (!def) return;
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.type = type;
    btn.innerHTML = `<div>${buildPreviewSvg(type)}</div><span class="btn-label">${def.label}</span>`;
    btn.title = def.label;
    btn.onclick = () => setMode('PLACE', type);
    body.appendChild(btn);
  });

  sec.appendChild(header);
  sec.appendChild(body);
  return sec;
}

function makeLineSection(title, lines, expanded) {
  const sec = document.createElement('div');
  sec.className = 'toolbar-section' + (expanded ? '' : ' collapsed');

  const header = document.createElement('div');
  header.className = 'toolbar-section-header';
  header.innerHTML = `<span>${title}</span><span class="section-toggle">▼</span>`;
  header.onclick = () => sec.classList.toggle('collapsed');

  const body = document.createElement('div');
  body.className = 'toolbar-section-body';

  const LINE_STYLES_LOCAL = {
    'phase-line': '#4a90b8', 'loa': '#4a90b8', 'ld': '#e04040',
    'unit-boundary': '#666', 'engagement-area': '#e08020',
    'axis-advance': '#4a90b8', 'dir-attack': '#e04040', 'trp': '#e04040',
  };

  lines.forEach(({ type, label }) => {
    const color = LINE_STYLES_LOCAL[type] || '#888';
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.dataset.type = type;
    btn.innerHTML = `<svg width="28" height="14" viewBox="0 0 28 14">
      <line x1="2" y1="7" x2="26" y2="7" stroke="${color}" stroke-width="2" stroke-dasharray="${type === 'loa' || type === 'engagement-area' ? '4,2' : 'none'}"/>
      ${type === 'trp' ? `<text x="14" y="11" text-anchor="middle" font-size="10" fill="${color}">✕</text>` : ''}
    </svg><span class="btn-label">${label}</span>`;
    btn.title = label;
    btn.onclick = () => setMode('DRAW_LINE', type);
    body.appendChild(btn);
  });

  sec.appendChild(header);
  sec.appendChild(body);
  return sec;
}

function makeMapTools() {
  const sec = document.createElement('div');
  sec.className = 'toolbar-section';

  const header = document.createElement('div');
  header.className = 'toolbar-section-header';
  header.innerHTML = `<span>Map Tools</span><span class="section-toggle">▼</span>`;
  header.onclick = () => sec.classList.toggle('collapsed');

  const body = document.createElement('div');
  body.className = 'toolbar-section-body full-width';

  const tools = [
    { label: 'Symbol Builder', icon: builderIcon(), fn: () => window.openSymbolBuilder && window.openSymbolBuilder() },
    { label: 'Save Overlay', icon: saveIcon(), fn: () => window.saveOverlay() },
    { label: 'Load Overlay', icon: loadIcon(), fn: () => document.getElementById('load-file-input').click() },
    { label: 'GitHub Overlays', icon: githubIcon(), fn: () => window.loadFromGitHub() },
    { label: 'Export PNG', icon: imgIcon(), fn: () => window.exportPNG() },
    { label: 'Export PDF', icon: pdfIcon(), fn: () => window.exportPDF() },
    { label: 'Export GeoJSON', icon: geoIcon(), fn: () => window.exportGeoJSON() },
    { label: 'Export KMZ', icon: kmzIcon(), fn: () => window.exportKMZ() },
    { label: 'Undo', icon: undoIcon(), fn: undo },
    { label: 'Redo', icon: redoIcon(), fn: redo },
    { label: 'Clear All', icon: clearIcon(), fn: clearAll },
  ];

  tools.forEach(({ label, icon, fn }) => {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML = `${icon}<span class="btn-label">${label}</span>`;
    btn.title = label;
    btn.onclick = fn;
    body.appendChild(btn);
  });

  // Symbol size slider
  const sizeRow = document.createElement('div');
  sizeRow.className = 'sym-size-row';
  sizeRow.innerHTML = `
    <label class="sym-size-label" for="sym-size-slider">Size</label>
    <input type="range" id="sym-size-slider" min="0.4" max="3.0" step="0.05" value="1.0" class="sym-size-slider">
    <span id="sym-size-val" class="sym-size-val">1.0×</span>`;
  body.appendChild(sizeRow);

  sizeRow.querySelector('#sym-size-slider').addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    window.symbolSizeScale = val;
    sizeRow.querySelector('#sym-size-val').textContent = val.toFixed(1) + '×';
    window.rebuildAllMarkers();
  });

  sec.appendChild(header);
  sec.appendChild(body);
  return sec;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function buildContextMenu() {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = `
    <div class="context-menu-item" onclick="window.selectUnit(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Edit Properties</div>
    <div class="context-menu-item" id="ctx-lock-item" onclick="_ctxToggleLock()">🔒 Unlock</div>
    <div class="context-menu-item" onclick="window.duplicateUnit(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Duplicate</div>
    <div class="context-menu-item" onclick="copyMgrs(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Copy MGRS</div>
    <div class="context-menu-sep"></div>
    <div class="context-menu-item danger" onclick="window.deleteUnit(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Delete</div>
  `;
}

function _ctxToggleLock() {
  const id = document.getElementById('context-menu').dataset.unitId;
  window.toggleLock(id);
  document.getElementById('context-menu').classList.remove('open');
}
window._ctxToggleLock = _ctxToggleLock;

function copyMgrs(id) {
  const unit = window.units.find(u => u.id === id);
  if (!unit) return;
  const mgrs = MGRS.fromLatLon(unit.latlng[0], unit.latlng[1]);
  navigator.clipboard.writeText(mgrs).catch(() => {});
}
window.copyMgrs = copyMgrs;

document.addEventListener('click', () => {
  document.getElementById('context-menu')?.classList.remove('open');
});

// ─── Props Panel Event Wiring ─────────────────────────────────────────────────

function buildPropsPanel() {
  document.getElementById('props-apply')?.addEventListener('click', () => {
    savePropPanel();
    closePropPanel();
  });
  document.getElementById('props-delete')?.addEventListener('click', () => {
    const id = window.selectedUnitId;
    closePropPanel();
    if (id) deleteUnit(id);
  });
  document.getElementById('props-close')?.addEventListener('click', closePropPanel);

  // Main label position buttons
  _wireLabelPosGroup('label-pos-btns', 'prop-label-pos');

  // Add extra label
  document.getElementById('prop-label-add')?.addEventListener('click', () => {
    _addExtraLabelRow('', 'top');
  });

  // Edit Grid toggle
  document.getElementById('props-edit-grid')?.addEventListener('click', () => {
    const editor = document.getElementById('props-grid-editor');
    const isOpen = editor.style.display !== 'none';
    editor.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      const unit = window.units.find(u => u.id === window.selectedUnitId);
      if (unit) document.getElementById('prop-mgrs-input').value = MGRS.fromLatLon(unit.latlng[0], unit.latlng[1]);
      document.getElementById('prop-mgrs-error').style.display = 'none';
      document.getElementById('prop-mgrs-input').focus();
    }
  });

  document.getElementById('prop-mgrs-go')?.addEventListener('click', () => {
    const unit = window.units.find(u => u.id === window.selectedUnitId);
    if (!unit) return;
    const raw = document.getElementById('prop-mgrs-input').value.trim();
    const errEl = document.getElementById('prop-mgrs-error');
    try {
      const ll = MGRS.toLatLon(raw);
      if (!ll) throw new Error('Invalid MGRS');
      pushHistory();
      unit.latlng = [ll.lat, ll.lon];
      if (unit._marker) unit._marker.setLatLng([ll.lat, ll.lon]);
      document.getElementById('props-coords').textContent = MGRS.fromLatLon(ll.lat, ll.lon);
      document.getElementById('props-grid-editor').style.display = 'none';
      errEl.style.display = 'none';
      window.map.panTo([ll.lat, ll.lon]);
    } catch {
      errEl.textContent = 'Could not parse MGRS — check format and try again.';
      errEl.style.display = 'block';
    }
  });
}

// ─── Symbol Search + MGRS Place ──────────────────────────────────────────────

function makeSearchSection() {
  const wrap = document.createElement('div');
  wrap.className = 'search-section';
  wrap.innerHTML = `
    <div class="search-input-row">
      <span class="search-icon">&#128269;</span>
      <input type="text" id="symbol-search" placeholder="Search symbols…" autocomplete="off" spellcheck="false">
      <button id="symbol-search-clear" class="search-clear" title="Clear">&#10005;</button>
    </div>
    <ul id="search-results" class="search-results"></ul>
    <div id="search-place-bar" class="search-place-bar" style="display:none">
      <div class="search-selected-sym">
        <div id="search-sel-icon"></div>
        <span id="search-sel-label"></span>
      </div>
      <div class="search-mgrs-row">
        <input type="text" id="search-mgrs-input" placeholder="MGRS (e.g. 18S UJ 12345 67890)" autocomplete="off" spellcheck="false">
        <button id="search-place-btn" class="btn-primary" title="Place at this MGRS coordinate">Place</button>
      </div>
      <div id="search-mgrs-error" class="search-mgrs-error"></div>
    </div>
  `;
  // Wire after append
  requestAnimationFrame(() => _wireSearch());
  return wrap;
}

function _wireSearch() {
  const input      = document.getElementById('symbol-search');
  const clearBtn   = document.getElementById('symbol-search-clear');
  const resultsList = document.getElementById('search-results');
  const placeBar   = document.getElementById('search-place-bar');
  const mgrsInput  = document.getElementById('search-mgrs-input');
  const placeBtn   = document.getElementById('search-place-btn');
  const errEl      = document.getElementById('search-mgrs-error');
  const selIcon    = document.getElementById('search-sel-icon');
  const selLabel   = document.getElementById('search-sel-label');
  if (!input) return;

  // All searchable entries: symbols + line types
  const allEntries = [
    ...Object.entries(SYMBOL_TYPES).map(([type, def]) => ({
      kind: 'symbol', type, label: def.label,
      aff: def.aff, keywords: (def.label + ' ' + type + ' ' + def.aff).toLowerCase(),
    })),
    ...[
      { type: 'phase-line',    label: 'Phase Line' },
      { type: 'loa',           label: 'LOA' },
      { type: 'ld',            label: 'LD' },
      { type: 'lc',            label: 'LC' },
      { type: 'ld-lc',         label: 'LD/LC' },
      { type: 'flot',          label: 'FLOT' },
      { type: 'fcl',           label: 'FCL' },
      { type: 'unit-boundary', label: 'Unit Boundary' },
      { type: 'axis-advance',  label: 'Axis of Advance' },
      { type: 'dir-attack',    label: 'Direction of Attack' },
      { type: 'trp',           label: 'TRP' },
      { type: 'obstacle-line', label: 'Obstacle Line' },
      { type: 'minefield-line',label: 'Minefield Line' },
      { type: 'wire-obstacle', label: 'Wire Obstacle' },
      { type: 'at-ditch',      label: 'AT Ditch' },
      { type: 'msr',           label: 'MSR' },
      { type: 'asr',           label: 'ASR' },
    ].map(l => ({ kind: 'line', ...l, keywords: (l.label + ' ' + l.type).toLowerCase() })),
    ...Object.keys(AREA_STYLES).map(type => ({
      kind: 'area', type, label: AREA_STYLES[type].label || type,
      keywords: ((AREA_STYLES[type].label || '') + ' ' + type + ' area polygon').toLowerCase(),
    })),
  ];

  let activeType = null;
  let activeKind = null;

  function showResults(query) {
    const q = query.trim().toLowerCase();
    resultsList.innerHTML = '';
    if (!q) { resultsList.style.display = 'none'; return; }

    const matches = allEntries.filter(e => e.keywords.includes(q)).slice(0, 12);
    if (!matches.length) {
      resultsList.innerHTML = '<li class="search-no-results">No matches</li>';
      resultsList.style.display = 'block';
      return;
    }

    matches.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'search-result-item';
      let icon;
      if (entry.kind === 'symbol') icon = buildPreviewSvg(entry.type);
      else if (entry.kind === 'area') icon = `<svg width="22" height="14" viewBox="0 0 22 14"><polygon points="3,12 11,2 19,12" fill="#4a90b822" stroke="#4a90b8" stroke-width="1.5"/></svg>`;
      else icon = `<svg width="22" height="10" viewBox="0 0 22 10"><line x1="1" y1="5" x2="21" y2="5" stroke="#888" stroke-width="1.5"/></svg>`;
      li.innerHTML = `<span class="sr-icon">${icon}</span><span class="sr-label">${entry.label}</span>
                      <span class="sr-kind">${entry.kind === 'symbol' ? entry.aff : entry.kind}</span>`;
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectEntry(entry);
        input.value = entry.label;
        resultsList.style.display = 'none';
        clearBtn.style.display = 'flex';
      });
      resultsList.appendChild(li);
    });
    resultsList.style.display = 'block';
  }

  function selectEntry(entry) {
    activeType = entry.type;
    activeKind = entry.kind;

    if (entry.kind === 'symbol') {
      setMode('PLACE', entry.type);
      selIcon.innerHTML  = buildPreviewSvg(entry.type);
      selLabel.textContent = entry.label;
    } else if (entry.kind === 'area') {
      setMode('DRAW_POLYGON', entry.type);
      selIcon.innerHTML  = `<svg width="22" height="14" viewBox="0 0 22 14"><polygon points="3,12 11,2 19,12" fill="#4a90b822" stroke="#4a90b8" stroke-width="1.5"/></svg>`;
      selLabel.textContent = entry.label;
    } else {
      setMode('DRAW_LINE', entry.type);
      selIcon.innerHTML  = `<svg width="22" height="10" viewBox="0 0 22 10"><line x1="1" y1="5" x2="21" y2="5" stroke="#888" stroke-width="2"/></svg>`;
      selLabel.textContent = entry.label;
    }

    placeBar.style.display = 'block';
    mgrsInput.value = '';
    errEl.textContent = '';
    mgrsInput.focus();
  }

  function placeAtMgrs() {
    const raw = mgrsInput.value.trim();
    errEl.textContent = '';

    if (!raw) {
      errEl.textContent = 'Enter an MGRS coordinate.';
      return;
    }

    const ll = MGRS.toLatLon(raw);
    if (!ll) {
      errEl.textContent = 'Invalid MGRS format. Try: 18S UJ 12345 67890';
      return;
    }

    if (activeKind === 'symbol') {
      window.placeUnit([ll.lat, ll.lon], activeType);
      window.map.panTo([ll.lat, ll.lon]);
    }
    // Lines require waypoints — just fly to the location for line mode
    if (activeKind === 'line') {
      window.map.panTo([ll.lat, ll.lon]);
    }

    mgrsInput.value = '';
    errEl.textContent = `Placed at ${MGRS.fromLatLon(ll.lat, ll.lon)}`;
    setTimeout(() => { if (errEl.textContent.startsWith('Placed')) errEl.textContent = ''; }, 3000);
  }

  input.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'flex' : 'none';
    showResults(input.value);
    if (!input.value) {
      placeBar.style.display = 'none';
      activeType = null;
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      input.value = '';
      resultsList.style.display = 'none';
      placeBar.style.display = 'none';
      clearBtn.style.display = 'none';
      activeType = null;
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    resultsList.style.display = 'none';
    placeBar.style.display = 'none';
    clearBtn.style.display = 'none';
    activeType = null;
    input.focus();
  });

  placeBtn.addEventListener('click', placeAtMgrs);

  mgrsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') placeAtMgrs();
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-section')) {
      resultsList.style.display = 'none';
    }
  });
}

// ─── MGRS Settings Panel ──────────────────────────────────────────────────────

function makeMgrsSettings() {
  const sec = document.createElement('div');
  sec.className = 'toolbar-section collapsed';
  sec.id = 'sec-mgrs-settings';

  const header = document.createElement('div');
  header.className = 'toolbar-section-header';
  header.innerHTML = `<span>MGRS Grid Settings</span><span class="section-toggle">▼</span>`;
  header.onclick = () => sec.classList.toggle('collapsed');

  const body = document.createElement('div');
  body.style.cssText = 'padding:10px;display:flex;flex-direction:column;gap:10px;';

  body.innerHTML = `
    <div class="mgrs-row">
      <label>Dark theme color</label>
      <input type="color" id="mgrs-dark-color" value="#ffff50">
    </div>
    <div class="mgrs-row">
      <label>Light theme color</label>
      <input type="color" id="mgrs-light-color" value="#1450dc">
    </div>
    <div class="mgrs-row">
      <label>Opacity <span id="mgrs-opacity-val">40%</span></label>
      <input type="range" id="mgrs-opacity" min="5" max="100" value="40" step="5">
    </div>
    <div class="mgrs-row">
      <label>Line width <span id="mgrs-lw-val">1.0×</span></label>
      <input type="range" id="mgrs-linewidth" min="0.5" max="3" value="1" step="0.25">
    </div>
    <div class="mgrs-row">
      <label>Show labels</label>
      <input type="checkbox" id="mgrs-labels" checked style="width:auto">
    </div>
    <div class="mgrs-row">
      <label>Show GZD zones</label>
      <input type="checkbox" id="mgrs-gzd" checked style="width:auto">
    </div>
    <div style="font-size:11px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-top:2px;">Grid levels</div>
    <div class="mgrs-row"><label>100 km squares</label><input type="checkbox" id="mgrs-lvl-100km" checked style="width:auto"></div>
    <div class="mgrs-row"><label>10 km squares</label> <input type="checkbox" id="mgrs-lvl-10km"  checked style="width:auto"></div>
    <div class="mgrs-row"><label>1 km squares</label>  <input type="checkbox" id="mgrs-lvl-1km"   checked style="width:auto"></div>
    <div class="mgrs-row"><label>100 m squares</label> <input type="checkbox" id="mgrs-lvl-100m"  checked style="width:auto"></div>
  `;

  sec.appendChild(header);
  sec.appendChild(body);

  // Wire up controls after they're in the DOM
  requestAnimationFrame(() => _wireMgrsControls());

  return sec;
}

function _wireMgrsControls() {
  function refresh() {
    const s = window.mgrsSettings;
    s.darkColor  = document.getElementById('mgrs-dark-color').value;
    s.lightColor = document.getElementById('mgrs-light-color').value;
    s.opacity    = parseInt(document.getElementById('mgrs-opacity').value) / 100;
    s.lineWidth  = parseFloat(document.getElementById('mgrs-linewidth').value);
    s.showLabels = document.getElementById('mgrs-labels').checked;
    s.showGzd    = document.getElementById('mgrs-gzd').checked;
    s.levels['100km'] = document.getElementById('mgrs-lvl-100km').checked;
    s.levels['10km']  = document.getElementById('mgrs-lvl-10km').checked;
    s.levels['1km']   = document.getElementById('mgrs-lvl-1km').checked;
    s.levels['100m']  = document.getElementById('mgrs-lvl-100m').checked;

    document.getElementById('mgrs-opacity-val').textContent =
      Math.round(s.opacity * 100) + '%';
    document.getElementById('mgrs-lw-val').textContent =
      s.lineWidth.toFixed(2) + '×';

    if (window.mgrsGridLayer && typeof window.mgrsGridLayer.refresh === 'function') {
      window.mgrsGridLayer.refresh();
    }
  }

  ['mgrs-dark-color','mgrs-light-color','mgrs-opacity','mgrs-linewidth',
   'mgrs-labels','mgrs-gzd','mgrs-lvl-100km','mgrs-lvl-10km','mgrs-lvl-1km','mgrs-lvl-100m']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', refresh);
    });
}

// ─── SVG Icon Helpers ─────────────────────────────────────────────────────────

function cursorIcon() { return `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 1l10 6-5 1-2 5z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function crosshairIcon() { return `<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="1" x2="8" y2="4" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="8" x2="4" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function penIcon() { return `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 14l3-1 7-7-2-2-7 7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 3l2 2" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function trashIcon() { return `<svg width="16" height="16" viewBox="0 0 16 16"><rect x="4" y="5" width="8" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="2" x2="10" y2="2" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function saveIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="1" width="8" height="4" fill="none" stroke="currentColor" stroke-width="1"/><rect x="3" y="7" width="8" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>`; }
function loadIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 3V1h6v2" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="7" y1="6" x2="7" y2="10" stroke="currentColor" stroke-width="1.5"/><polyline points="5,8 7,10 9,8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function githubIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 10c0-1 .5-1.5 1-1.5H8c.5 0 1 .5 1 1.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>`; }
function imgIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="2" width="12" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="4.5" cy="5.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1"/><polyline points="1,10 5,6 8,9 10,7 13,10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function pdfIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="10" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1"/><line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1"/><line x1="4" y1="9" x2="7" y2="9" stroke="currentColor" stroke-width="1"/></svg>`; }
function geoIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1.5 7h11M7 1.5c-2 2-2 7 0 11M7 1.5c2 2 2 7 0 11" fill="none" stroke="currentColor" stroke-width="1"/></svg>`; }
function kmzIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><polygon points="7,1 13,5 13,10 7,13 1,10 1,5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="2" fill="none" stroke="currentColor" stroke-width="1"/></svg>`; }
function undoIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 6H9a3 3 0 0 1 0 6H6" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="3,4 1,6 3,8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function redoIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M11 6H5a3 3 0 0 0 0 6h3" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="11,4 13,6 11,8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function clearIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>`; }
function builderIcon() { return `<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="3" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="5" x2="7" y2="5" stroke="currentColor" stroke-width="1"/><line x1="3" y1="7" x2="6" y2="7" stroke="currentColor" stroke-width="1"/><circle cx="11" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="11" y1="6" x2="11" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`; }
