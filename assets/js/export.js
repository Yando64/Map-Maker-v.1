/**
 * Export handlers: PNG, PDF, GeoJSON, KMZ.
 */

function showLoading(msg) {
  const el = document.getElementById('loading');
  el.querySelector('p').textContent = msg || 'Exporting…';
  el.classList.add('show');
}
function hideLoading() {
  document.getElementById('loading').classList.remove('show');
}

// ─── PNG Export ───────────────────────────────────────────────────────────────

async function exportPNG() {
  showLoading('Capturing map…');
  try {
    const mapEl = document.getElementById('map');
    const canvas = await html2canvas(mapEl, { useCORS: true, logging: false });
    canvas.toBlob(blob => {
      saveAs(blob, `tactical-map-${timestamp()}.png`);
      hideLoading();
    });
  } catch (err) {
    hideLoading();
    alert('PNG export failed: ' + err.message);
  }
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

async function exportPDF() {
  showLoading('Building PDF…');
  try {
    const { jsPDF } = window.jspdf;
    const mapEl = document.getElementById('map');
    const canvas = await html2canvas(mapEl, { useCORS: true, logging: false });
    const imgData = canvas.toDataURL('image/jpeg', 0.85);

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();

    // Map image
    const mapH = H - 30;
    pdf.addImage(imgData, 'JPEG', 0, 0, W, mapH);

    // Legend
    pdf.setFontSize(9);
    pdf.setTextColor(50, 50, 50);
    pdf.text('Unit Legend:', 5, mapH + 6);
    let x = 5, y = mapH + 12;
    window.units.forEach((u, i) => {
      const def = SYMBOL_TYPES[u.type];
      const mgrs = MGRS.fromLatLon(u.latlng[0], u.latlng[1]);
      pdf.text(`• ${def?.label || u.type}${u.label ? ' [' + u.label + ']' : ''} — ${mgrs}`, x, y);
      y += 5;
      if (y > H - 5) { x += 90; y = mapH + 12; }
    });

    pdf.save(`tactical-map-${timestamp()}.pdf`);
    hideLoading();
  } catch (err) {
    hideLoading();
    alert('PDF export failed: ' + err.message);
  }
}

// ─── GeoJSON Export ───────────────────────────────────────────────────────────

function exportGeoJSON() {
  const features = [];

  window.units.forEach(u => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [u.latlng[1], u.latlng[0]] },
      properties: {
        id: u.id,
        type: u.type,
        label: u.label,
        echelon: u.echelon,
        affiliation: u.affiliation,
        higherHQ: u.higherHQ,
        notes: u.notes,
        mgrs: MGRS.fromLatLon(u.latlng[0], u.latlng[1]),
      },
    });
  });

  window.lines.forEach(l => {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: l.latlngs.map(p => [p[1] || p.lng, p[0] || p.lat]),
      },
      properties: {
        id: l.id,
        lineType: l.lineType,
        label: l.label,
      },
    });
  });

  const geojson = { type: 'FeatureCollection', features };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
  saveAs(blob, `tactical-map-${timestamp()}.geojson`);
}

// ─── KMZ Export ───────────────────────────────────────────────────────────────

async function exportKMZ() {
  showLoading('Building KMZ…');
  try {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Tactical Map Export</name>
`;

    window.units.forEach(u => {
      const def = SYMBOL_TYPES[u.type];
      kml += `  <Placemark>
    <name>${u.label || def?.label || u.type}</name>
    <description>${u.notes || ''}</description>
    <Point><coordinates>${u.latlng[1]},${u.latlng[0]},0</coordinates></Point>
  </Placemark>\n`;
    });

    window.lines.forEach(l => {
      const coords = l.latlngs.map(p => `${p[1] || p.lng},${p[0] || p.lat},0`).join(' ');
      kml += `  <Placemark>
    <name>${l.label || l.lineType}</name>
    <LineString><coordinates>${coords}</coordinates></LineString>
  </Placemark>\n`;
    });

    kml += `</Document></kml>`;

    const zip = new JSZip();
    zip.file('doc.kml', kml);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `tactical-map-${timestamp()}.kmz`);
    hideLoading();
  } catch (err) {
    hideLoading();
    alert('KMZ export failed: ' + err.message);
  }
}

function timestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
}

window.exportPNG = exportPNG;
window.exportPDF = exportPDF;
window.exportGeoJSON = exportGeoJSON;
window.exportKMZ = exportKMZ;
