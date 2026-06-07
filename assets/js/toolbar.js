/**
 * Toolbar UI, mode state machine, unit placement, line drawing, undo/redo.
 */

// ─── App State ────────────────────────────────────────────────────────────────

window.appState = {
  mode: 'SELECT',    // SELECT | PLACE | DRAW_LINE | DELETE
  placeType: null,
  drawLineType: null,
};

window.units = [];
window.lines = [];
window.selectedUnitId = null;
window.selectedLineId = null;
window._history = [];
window._historyIndex = -1;
window._drawingPoints = [];
window._drawPolyline = null;

// ─── History ──────────────────────────────────────────────────────────────────

function pushHistory() {
  const state = JSON.stringify({ units: window.units.map(u => ({ ...u, _marker: undefined })), lines: window.lines });
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
  // Remove all markers
  window.units.forEach(u => { if (u._marker) window.map.removeLayer(u._marker); });
  // Remove all lines
  window.lines.forEach(l => { if (l._layer) window.map.removeLayer(l._layer); });
  window.units = [];
  window.lines = [];

  state.units.forEach(u => placeUnit(u.latlng, u.type, u, false));
  state.lines.forEach(l => drawLine(l.latlngs, l.lineType, l.label, l, false));
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

  const mapEl = document.getElementById('map');
  if (mode === 'PLACE' || mode === 'DRAW_LINE') {
    mapEl.style.cursor = 'crosshair';
  } else if (mode === 'DELETE') {
    mapEl.style.cursor = 'not-allowed';
  } else {
    mapEl.style.cursor = '';
  }

  // Cancel drawing
  if (mode !== 'DRAW_LINE') cancelDrawing();

  // Update status
  const modeLabel = mode === 'PLACE' ? `PLACE | ${subType || ''}` :
                    mode === 'DRAW_LINE' ? `LINE | ${subType || ''}` : mode;
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
  const unit = {
    id,
    type,
    latlng: Array.isArray(latlng) ? latlng : [latlng.lat, latlng.lng],
    label: overrides.label || '',
    echelon: overrides.echelon || '',
    affiliation: overrides.affiliation || typeDef.aff || 'friendly',
    higherHQ: overrides.higherHQ || '',
    notes: overrides.notes || '',
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

window.placeUnit = placeUnit;
window.deleteUnit = deleteUnit;
window.selectUnit = selectUnit;
window.duplicateUnit = duplicateUnit;

// ─── Line Drawing ─────────────────────────────────────────────────────────────

const LINE_STYLES = {
  'phase-line':    { color: '#4a90b8', weight: 2, dashArray: null },
  'loa':           { color: '#4a90b8', weight: 2, dashArray: '8,4' },
  'ld':            { color: '#e04040', weight: 2, dashArray: null },
  'unit-boundary': { color: '#333333', weight: 1.5, dashArray: null },
  'axis-advance':  { color: '#4a90b8', weight: 3, dashArray: null },
  'dir-attack':    { color: '#e04040', weight: 3, dashArray: null },
  'engagement-area': { color: '#e08020', weight: 1.5, dashArray: '6,3' },
  'trp':           { color: '#e04040', weight: 2, dashArray: null },
};

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

    // Arrow decoration for axis/dir attack
    if (lineType === 'axis-advance' || lineType === 'dir-attack') {
      layer.on('add', () => {
        const decorator = L.polylineDecorator ? L.polylineDecorator(layer, {
          patterns: [{ offset: '100%', repeat: 0, symbol: L.Symbol.arrowHead({ pixelSize: 12, polygon: false, pathOptions: { stroke: true, color: style.color, weight: 2 } }) }]
        }) : null;
        if (decorator) decorator.addTo(window.map);
      });
    }
  }

  layer.addTo(window.map);
  lineObj._layer = layer;

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

// ─── Properties Panel ─────────────────────────────────────────────────────────

function openPropPanel(unit) {
  const panel = document.getElementById('props-panel');
  panel.classList.add('open');
  panel.dataset.unitId = unit.id;

  document.getElementById('props-title').textContent = SYMBOL_TYPES[unit.type]?.label || unit.type;
  document.getElementById('props-coords').textContent = MGRS.fromLatLon(unit.latlng[0], unit.latlng[1]);
  document.getElementById('prop-label').value = unit.label || '';
  document.getElementById('prop-echelon').value = unit.echelon || '';
  document.getElementById('prop-affiliation').value = unit.affiliation || 'friendly';
  document.getElementById('prop-hq').value = unit.higherHQ || '';
  document.getElementById('prop-notes').value = unit.notes || '';
}

function closePropPanel() {
  document.getElementById('props-panel').classList.remove('open');
  window.selectedUnitId = null;
  document.querySelectorAll('.sym-wrapper.selected').forEach(el => el.classList.remove('selected'));
}

function savePropPanel() {
  const id = window.selectedUnitId;
  const unit = window.units.find(u => u.id === id);
  if (!unit) return;
  pushHistory();
  unit.label = document.getElementById('prop-label').value;
  unit.echelon = document.getElementById('prop-echelon').value;
  unit.affiliation = document.getElementById('prop-affiliation').value;
  unit.higherHQ = document.getElementById('prop-hq').value;
  unit.notes = document.getElementById('prop-notes').value;

  // Rebuild marker with new props
  if (unit._marker) window.map.removeLayer(unit._marker);
  const marker = createMarker(unit, window.map);
  marker.addTo(window.map);
  attachMarkerEvents(marker, unit);
  unit._marker = marker;
}

function openLinePropPanel(lineObj) {
  // Reuse props panel for lines (simplified)
  const panel = document.getElementById('props-panel');
  panel.classList.add('open');
  panel.dataset.lineId = lineObj.id;
  panel.dataset.unitId = '';
  document.getElementById('props-title').textContent = lineObj.lineType.replace(/-/g, ' ').toUpperCase();
  document.getElementById('props-coords').textContent = '';
  document.getElementById('prop-label').value = lineObj.label || '';
  document.getElementById('prop-echelon').value = '';
  document.getElementById('prop-affiliation').value = '';
  document.getElementById('prop-hq').value = '';
  document.getElementById('prop-notes').value = '';
}

window.openPropPanel = openPropPanel;
window.closePropPanel = closePropPanel;
window.savePropPanel = savePropPanel;

// ─── Status Bar ───────────────────────────────────────────────────────────────

function updateStatusCounts() {
  document.getElementById('status-units').textContent = window.units.length;
  document.getElementById('status-lines').textContent = window.lines.length;
}
window.updateStatusCounts = updateStatusCounts;

// ─── Clear All ────────────────────────────────────────────────────────────────

function clearAll() {
  if (!confirm('Clear all units and lines?')) return;
  pushHistory();
  window.units.forEach(u => { if (u._marker) window.map.removeLayer(u._marker); });
  window.lines.forEach(l => { if (l._layer) window.map.removeLayer(l._layer); });
  window.units = [];
  window.lines = [];
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
      closePropPanel();
      break;
    case 'ENTER':
      if (window.appState.mode === 'DRAW_LINE') finishLine();
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
});

function buildToolbar() {
  const toolbar = document.getElementById('toolbar');
  toolbar.innerHTML = '';

  // Search section (sticky at top)
  toolbar.appendChild(makeSearchSection());

  // Tools section
  toolbar.appendChild(makeSection('Tools', [
    { label: 'Select', icon: cursorIcon(), mode: 'SELECT' },
    { label: 'Place', icon: crosshairIcon(), mode: 'PLACE' },
    { label: 'Draw Line', icon: penIcon(), mode: 'DRAW_LINE' },
    { label: 'Delete', icon: trashIcon(), mode: 'DELETE' },
  ], 'tools', true));

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

function _fillTacticalTab(panel) {
  if (!panel) return;
  panel.appendChild(makeLineSection('Tactical Lines', [
    { type: 'phase-line',     label: 'Phase Line' },
    { type: 'loa',            label: 'LOA' },
    { type: 'ld',             label: 'LD / LC' },
    { type: 'unit-boundary',  label: 'Unit Boundary' },
    { type: 'engagement-area',label: 'Engagement Area' },
    { type: 'axis-advance',   label: 'Axis of Advance' },
    { type: 'dir-attack',     label: 'Dir of Attack' },
    { type: 'trp',            label: 'TRP' },
  ], true));
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

  sec.appendChild(header);
  sec.appendChild(body);
  return sec;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function buildContextMenu() {
  const menu = document.getElementById('context-menu');
  menu.innerHTML = `
    <div class="context-menu-item" onclick="window.selectUnit(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Edit Properties</div>
    <div class="context-menu-item" onclick="window.duplicateUnit(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Duplicate</div>
    <div class="context-menu-item" onclick="copyMgrs(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Copy MGRS</div>
    <div class="context-menu-sep"></div>
    <div class="context-menu-item danger" onclick="window.deleteUnit(document.getElementById('context-menu').dataset.unitId);document.getElementById('context-menu').classList.remove('open')">Delete</div>
  `;
}

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
      { type: 'phase-line',     label: 'Phase Line' },
      { type: 'loa',            label: 'LOA' },
      { type: 'ld',             label: 'LD / LC' },
      { type: 'unit-boundary',  label: 'Unit Boundary' },
      { type: 'engagement-area',label: 'Engagement Area' },
      { type: 'axis-advance',   label: 'Axis of Advance' },
      { type: 'dir-attack',     label: 'Direction of Attack' },
      { type: 'trp',            label: 'TRP' },
    ].map(l => ({ kind: 'line', ...l, keywords: (l.label + ' ' + l.type).toLowerCase() })),
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
      const icon = entry.kind === 'symbol'
        ? buildPreviewSvg(entry.type)
        : `<svg width="22" height="10" viewBox="0 0 22 10"><line x1="1" y1="5" x2="21" y2="5" stroke="#888" stroke-width="1.5"/></svg>`;
      li.innerHTML = `<span class="sr-icon">${icon}</span><span class="sr-label">${entry.label}</span>
                      <span class="sr-kind">${entry.kind === 'symbol' ? entry.aff : 'line'}</span>`;
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
