/**
 * Save, load, and GitHub overlay logic.
 */

const OVERLAY_VERSION = '1.0';

// ─── Save Overlay ─────────────────────────────────────────────────────────────

function saveOverlay() {
  const name = prompt('Overlay name:', 'Exercise Overlay');
  if (!name) return;

  const data = {
    version: OVERLAY_VERSION,
    standard: window.milStd || 'mil2525d',
    name,
    created: new Date().toISOString(),
    units: window.units.map(u => ({
      id: u.id,
      type: u.type,
      latlng: u.latlng,
      label: u.label,
      echelon: u.echelon,
      affiliation: u.affiliation,
      higherHQ: u.higherHQ,
      notes: u.notes,
      status: u.status || 'known',
      locked: u.locked !== undefined ? u.locked : true,
    })),
    lines: window.lines.map(l => ({
      id: l.id,
      lineType: l.lineType,
      label: l.label,
      latlngs: l.latlngs,
    })),
    polygons: (window.polygons || []).map(p => ({
      id: p.id,
      polyType: p.polyType,
      label: p.label,
      latlngs: p.latlngs,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  saveAs(blob, `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`);
}

// ─── Load Overlay from File ───────────────────────────────────────────────────

function loadOverlayFromFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      applyOverlay(data);
    } catch (err) {
      alert('Failed to parse overlay file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function applyOverlay(data) {
  if (!data.version) { alert('Invalid overlay file (missing version).'); return; }

  window.pushHistory();

  (data.units || []).forEach(u => {
    window.placeUnit(u.latlng, u.type, u, false);
  });
  (data.lines || []).forEach(l => {
    window.drawLine(l.latlngs, l.lineType, l.label, l, false);
  });
  (data.polygons || []).forEach(p => {
    window.drawPolygon(p.latlngs, p.polyType, p.label, p, false);
  });

  window.updateStatusCounts();

  // Fly to first unit
  if (data.units && data.units.length > 0) {
    const u = data.units[0];
    window.map.flyTo(u.latlng, Math.max(window.map.getZoom(), 9));
  }
}

// ─── Load from GitHub ─────────────────────────────────────────────────────────

async function loadFromGitHub() {
  const modal = document.getElementById('overlay-modal');
  const list = document.getElementById('overlay-list');
  list.innerHTML = '<li style="padding:8px;color:var(--text-secondary)">Loading…</li>';
  modal.classList.add('open');

  try {
    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
    const resp = await fetch(baseUrl + '/overlays/index.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const index = await resp.json();

    list.innerHTML = '';
    if (!index.overlays || index.overlays.length === 0) {
      list.innerHTML = '<li style="padding:8px;color:var(--text-secondary)">No overlays available.</li>';
      return;
    }

    index.overlays.forEach(ov => {
      const li = document.createElement('li');
      li.innerHTML = `<div>
        <div class="ol-name">${ov.name}</div>
        <div class="ol-date">${ov.date || ''}</div>
      </div><button class="btn-primary" style="font-size:11px;padding:3px 8px">Load</button>`;
      li.querySelector('button').onclick = async () => {
        modal.classList.remove('open');
        await loadOverlayByUrl(baseUrl + '/overlays/' + ov.file);
      };
      list.appendChild(li);
    });
  } catch (err) {
    list.innerHTML = `<li style="padding:8px;color:var(--danger)">Error: ${err.message}</li>`;
  }
}

async function loadOverlayByUrl(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    applyOverlay(data);
  } catch (err) {
    alert('Failed to load overlay: ' + err.message);
  }
}

window.saveOverlay = saveOverlay;
window.loadOverlayFromFile = loadOverlayFromFile;
window.loadFromGitHub = loadFromGitHub;
window.applyOverlay = applyOverlay;

// ─── File Input Wiring ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('load-file-input');
  if (input) {
    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) loadOverlayFromFile(file);
      input.value = '';
    });
  }

  // Close overlay modal
  document.getElementById('overlay-modal-close')?.addEventListener('click', () => {
    document.getElementById('overlay-modal').classList.remove('open');
  });
});
