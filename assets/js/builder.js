/**
 * Symbol Builder — symbol.army-style guided symbol creation panel.
 * Left panel: searchable symbol library.
 * Right panel: live SVG preview + full modifier controls.
 */

let _sbSelectedType = 'inf-f';
let _sbReady        = false;

function openSymbolBuilder() {
  const modal = document.getElementById('symbol-builder-modal');
  if (!modal) return;
  modal.classList.add('open');
  if (!_sbReady) { _sbReady = true; _sbWire(); }
  _sbRenderList('');
  _sbUpdatePreview();
}

function closeSymbolBuilder() {
  document.getElementById('symbol-builder-modal')?.classList.remove('open');
}

// ─── Read all control values into a plain config object ──────────────────────
function _sbGetConfig() {
  const aff        = document.querySelector('input[name="sb-aff"]:checked')?.value    || 'friendly';
  const status     = document.querySelector('input[name="sb-status"]:checked')?.value || 'known';
  const echelon    = document.getElementById('sb-echelon')?.value    || '';
  const taskForce  = document.getElementById('sb-task-force')?.checked || false;
  const reinforced = document.getElementById('sb-reinforced')?.checked || false;
  const reduced    = document.getElementById('sb-reduced')?.checked   || false;
  const isHQ       = document.getElementById('sb-hq-flag')?.checked   || false;
  let   label      = (document.getElementById('sb-desig')?.value      || '').trim();
  const higherHQ   = (document.getElementById('sb-hq-text')?.value    || '').trim();

  // Append MIL-STD amplifiers to designation
  if (reinforced && !reduced) label += label ? ' (+)' : '(+)';
  if (reduced && !reinforced) label += label ? ' (-)' : '(-)';
  if (isHQ)                   label += label ? ' (HQ)': '(HQ)';

  return { type: _sbSelectedType, affiliation: aff, status, echelon, taskForce, label, higherHQ };
}

// ─── Update right-panel live preview ─────────────────────────────────────────
function _sbUpdatePreview() {
  const cfg = _sbGetConfig();
  const def = window.SYMBOL_TYPES?.[cfg.type];
  if (!def) return;

  const fakeUnit = {
    id: '__sb_preview__',
    type:        cfg.type,
    affiliation: cfg.affiliation,
    status:      cfg.status,
    echelon:     cfg.echelon,
    label:       cfg.label,
    higherHQ:    cfg.higherHQ,
    taskForce:   cfg.taskForce,
  };

  const svgStr = window.buildSymbolSvg(fakeUnit, 60);
  document.getElementById('sb-preview-svg').innerHTML = svgStr;
  document.getElementById('sb-preview-name').textContent = def.label;

  const affLabel = { friendly:'Friendly', enemy:'Enemy', neutral:'Neutral', unknown:'Unknown' };
  const details = [
    affLabel[cfg.affiliation] || cfg.affiliation,
    cfg.status === 'suspected' ? 'Suspected' : 'Known',
    cfg.echelon || '',
    cfg.taskForce ? 'Task Force' : '',
  ].filter(Boolean).join(' · ');
  document.getElementById('sb-preview-details').textContent = details;
  document.getElementById('sb-preview-desig').textContent = cfg.label    ? `↑ ${cfg.label}`    : '';
  document.getElementById('sb-preview-hq').textContent    = cfg.higherHQ ? `↓ ${cfg.higherHQ}` : '';
}

// ─── Render symbol grid in left panel ────────────────────────────────────────
function _sbRenderList(query) {
  const container = document.getElementById('sb-symbol-list');
  if (!container) return;
  container.innerHTML = '';

  const q   = query.toLowerCase().trim();
  const aff = document.querySelector('input[name="sb-aff"]:checked')?.value || 'friendly';

  // Group by tab
  const byTab = {};
  Object.entries(window.SYMBOL_TYPES || {}).forEach(([type, def]) => {
    if (q && !def.label.toLowerCase().includes(q) && !type.includes(q)) return;
    const tab = def.tab || 'formations';
    if (!byTab[tab]) byTab[tab] = [];
    byTab[tab].push([type, def]);
  });

  const TAB_ORDER  = ['formations', 'equipment', 'generic'];
  const TAB_LABELS = {
    formations: 'Formations',
    equipment:  'Equipment & Installations',
    generic:    'Generic Graphics',
  };

  let firstGroup = true;
  TAB_ORDER.forEach(tab => {
    const items = byTab[tab];
    if (!items?.length) return;

    const hdr = document.createElement('div');
    hdr.className = 'sb-group-hdr';
    hdr.textContent = TAB_LABELS[tab] || tab;
    if (!firstGroup) hdr.style.marginTop = '6px';
    firstGroup = false;
    container.appendChild(hdr);

    const grid = document.createElement('div');
    grid.className = 'sb-grid';

    items.forEach(([type, def]) => {
      // Preview with current affiliation (respect enemy types staying enemy)
      const previewAff = def.aff === 'enemy' ? 'enemy' : (def.aff === 'neutral' ? 'neutral' : aff);
      const previewUnit = { id:'__p__', type, affiliation: previewAff, status:'known', echelon:'', label:'', higherHQ:'' };
      const svgStr = window.buildSymbolSvg(previewUnit, 22);

      const item = document.createElement('div');
      item.className = 'sb-item' + (type === _sbSelectedType ? ' selected' : '');
      item.dataset.type = type;
      item.title = def.label;
      item.innerHTML = `<div class="sb-item-icon">${svgStr}</div><div class="sb-item-lbl">${def.label}</div>`;

      item.addEventListener('click', () => {
        document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        _sbSelectedType = type;
        // Auto-set affiliation radio to match the symbol's natural affiliation
        if (def.aff) {
          const radio = document.querySelector(`input[name="sb-aff"][value="${def.aff}"]`);
          if (radio) radio.checked = true;
        }
        _sbUpdatePreview();
      });

      grid.appendChild(item);
    });

    container.appendChild(grid);
  });

  // No results message
  if (!Object.keys(byTab).length) {
    const msg = document.createElement('div');
    msg.style.cssText = 'padding:12px;font-size:12px;color:var(--text-secondary);text-align:center;';
    msg.textContent = 'No symbols match "' + query + '"';
    container.appendChild(msg);
  }
}

// ─── Wire all event listeners ─────────────────────────────────────────────────
function _sbWire() {
  const modal = document.getElementById('symbol-builder-modal');
  if (!modal) return;

  // Close
  modal.addEventListener('click', e => { if (e.target === modal) closeSymbolBuilder(); });
  document.getElementById('sb-close')?.addEventListener('click', closeSymbolBuilder);
  document.getElementById('sb-cancel')?.addEventListener('click', closeSymbolBuilder);

  // Symbol search
  document.getElementById('sb-search')?.addEventListener('input', e => {
    _sbRenderList(e.target.value);
  });

  // Text controls → live preview
  ['sb-echelon', 'sb-desig', 'sb-hq-text'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _sbUpdatePreview);
  });

  // Checkbox modifiers → live preview
  ['sb-task-force', 'sb-reinforced', 'sb-reduced', 'sb-hq-flag'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _sbUpdatePreview);
  });

  // Radio changes → re-render list (to show symbols in new affiliation color) + preview
  document.querySelectorAll('input[name="sb-aff"], input[name="sb-status"]').forEach(el => {
    el.addEventListener('change', () => {
      _sbRenderList(document.getElementById('sb-search')?.value || '');
      _sbUpdatePreview();
    });
  });

  // Place on Map
  document.getElementById('sb-place')?.addEventListener('click', () => {
    const cfg = _sbGetConfig();

    // Store config; placeUnit will pick it up on next map click
    window.appState.pendingUnitConfig = {
      affiliation: cfg.affiliation,
      status:      cfg.status,
      echelon:     cfg.echelon,
      label:       cfg.label,
      higherHQ:    cfg.higherHQ,
      taskForce:   cfg.taskForce,
    };

    closeSymbolBuilder();
    window.setMode('PLACE', cfg.type);
  });
}

document.addEventListener('DOMContentLoaded', _sbWire);

window.openSymbolBuilder  = openSymbolBuilder;
window.closeSymbolBuilder = closeSymbolBuilder;
