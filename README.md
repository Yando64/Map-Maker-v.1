# Tactical Map

A static, client-side military tactical map web application hosted on GitHub Pages. Place, label, move, and export MIL-STD-2525D / NATO APP-6 map overlay symbols on an interactive Leaflet.js map.

## Features

- **MIL-STD-2525D & NATO APP-6** symbology — friendly, enemy, neutral, and unknown units
- **Zoom-proportional symbols** — all symbols scale with the map zoom level
- **27+ symbol types** — infantry, armor, artillery, aviation, engineer, medical, logistics, HQ, and more
- **Tactical lines** — phase lines, LOA, LD, unit boundaries, axes of advance, engagement areas, TRPs
- **MGRS coordinate system** — live cursor position, toggleable grid overlay
- **Dark / light theme** with persistence via localStorage
- **Save / load overlays** as JSON files
- **Load shared overlays** from the repository's `/overlays/` folder
- **Export** to PNG, PDF (with legend), GeoJSON, and KMZ
- **Undo / Redo** (50-state history)
- **Keyboard shortcuts** for all common actions
- **No build tools** — pure HTML, CSS, and vanilla JS

## Deployment (GitHub Pages)

### Option 1: Deploy from `main` branch root

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, branch `main`, folder `/` (root).
4. Wait ~60 seconds, then visit `https://<username>.github.io/<repo>/`.

### Option 2: Deploy from `gh-pages` branch

```bash
git checkout --orphan gh-pages
git add -A
git commit -m "Deploy to GitHub Pages"
git push origin gh-pages
```

Then set GitHub Pages source to the `gh-pages` branch.

## Project Structure

```
/
├── index.html           ← Main map application
├── about.html           ← About page
├── help.html            ← Help / tutorial
├── assets/
│   ├── css/
│   │   ├── main.css     ← Shared styles
│   │   ├── map.css      ← Map app styles
│   │   └── themes.css   ← Dark / light CSS variables
│   ├── js/
│   │   ├── map.js       ← Leaflet init, tile layers, events
│   │   ├── symbols.js   ← Symbol SVG rendering + scaling
│   │   ├── toolbar.js   ← Toolbar UI, mode state machine, undo/redo
│   │   ├── overlay.js   ← Save / load overlay logic
│   │   ├── mgrs.js      ← MGRS conversion + grid layer
│   │   └── export.js    ← PNG, PDF, GeoJSON, KMZ export
│   └── img/
│       └── favicon.ico
└── overlays/
    ├── index.json            ← Overlay index for GitHub Overlays feature
    └── example-overlay.json  ← Example with 6 units and 2 lines
```

## Adding Shared Overlays

1. Create a JSON overlay file using the app (Save Overlay) or by hand.
2. Add it to the `/overlays/` folder.
3. Add an entry to `/overlays/index.json`:

```json
{
  "overlays": [
    { "name": "My Exercise", "file": "my-exercise.json", "date": "2025-06-01" }
  ]
}
```

Users can then load it via **Map Tools → GitHub Overlays**.

## Overlay JSON Format

```json
{
  "version": "1.0",
  "standard": "mil2525d",
  "name": "Exercise Name",
  "created": "2025-01-01T0000Z",
  "units": [
    {
      "id": "unit-001",
      "type": "inf-f",
      "latlng": [35.0, -80.0],
      "label": "1-12 IN",
      "echelon": "battalion",
      "affiliation": "friendly",
      "higherHQ": "3BCT",
      "notes": ""
    }
  ],
  "lines": [
    {
      "id": "line-001",
      "lineType": "phase-line",
      "label": "PL GOLD",
      "latlngs": [[35.1, -80.5], [35.1, -79.5]]
    }
  ]
}
```

### Supported `type` values

| Type | Description |
|------|-------------|
| `inf-f` | Friendly Infantry |
| `mech-f` | Friendly Mechanized Infantry |
| `armor-f` | Friendly Armor |
| `arty-f` | Friendly Artillery |
| `arty-sp-f` | Friendly Self-Propelled Artillery |
| `arty-rkt-f` | Friendly Rocket Artillery |
| `avn-rw-f` | Friendly Rotary Wing Aviation |
| `avn-fw-f` | Friendly Fixed Wing Aviation |
| `eng-f` | Friendly Engineer |
| `sig-f` | Friendly Signal |
| `med-f` | Friendly Medical |
| `recon-f` | Friendly Reconnaissance |
| `ada-f` | Friendly Air Defense |
| `log-f` | Friendly Logistics |
| `hq-co-f` | Friendly HQ (Company) |
| `hq-bn-f` | Friendly HQ (Battalion) |
| `hq-bde-f` | Friendly HQ (Brigade) |
| `hq-div-f` | Friendly HQ (Division) |
| `cp-f` | Friendly Command Post |
| `op-f` | Friendly Observation Post |
| `inf-e` | Enemy Infantry |
| `mech-e` | Enemy Mechanized Infantry |
| `armor-e` | Enemy Armor |
| `arty-e` | Enemy Artillery |
| `avn-e` | Enemy Aviation |
| `unk-e` | Unknown Enemy |
| `sus-e` | Suspected Enemy |
| `unk-g` | Unknown Ground |
| `civ` | Civilian |
| `neu-f` | Neutral Force |

### Supported `lineType` values

`phase-line`, `loa`, `ld`, `unit-boundary`, `engagement-area`, `axis-advance`, `dir-attack`, `trp`

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Select mode |
| `P` | Place symbol mode |
| `L` | Draw line mode |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Delete` | Delete selected |
| `Ctrl+S` | Save overlay |
| `Escape` | Cancel / return to Select |
| `Enter` | Finish line |
| `T` | Toggle theme |
| `G` | Toggle MGRS grid |

## Dependencies (CDN, no install required)

- [Leaflet.js 1.9.4](https://leafletjs.com)
- [html2canvas 1.4.1](https://html2canvas.hertzen.com)
- [jsPDF 2.5.1](https://parall.ax/products/jspdf)
- [FileSaver.js 2.0.5](https://github.com/eligrey/FileSaver.js)
- [JSZip 3.10.1](https://stuk.github.io/jszip)

## License

MIT — free for training and educational use. Not for operational military use.
