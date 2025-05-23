# Chernobyl Soil Sample Map

This project visualizes soil sample measurements of key radionuclides (Cs-137, Cs-134, Sr-90) around the Chernobyl Exclusion Zone (CEZ) as a time-enabled interactive web map.

**Data source:** CEH Catalogue `782ec845-2135-4698-8881-b38823e533bf` (1995–1999 soil samples)

## Features
- Esri World Imagery basemap via MapLibre GL JS
- Heatmap of radioactive activity (decay-adjusted using known half-lives)
- Pulsing markers to highlight first appearance of each sample
- Time slider with play/pause and speed controls
- Interactive pop-ups displaying values in scientific notation
- Country borders overlay via TopoJSON

## Architecture
**Backend** (Node.js + Express):
- Parses CSV files from `data/` (detects ro-crate structure)
- Groups samples by coordinate, applies LOCF (last observation carried forward)
- Applies radioactive decay correction based on measurement dates
- Exposes REST APIs:
  - `GET /api/fields` → available measurement fields
  - `GET /api/dates?field=KEY` → sorted measurement dates for a field
  - `GET /api/radiation?field=KEY&date=YYYY-MM-DD` → GeoJSON FeatureCollection for that date

**Frontend** (static assets):
- Root-level `index.html` (for static hosting)
- `/public` folder for dynamic server:
  - `public/index.html`, `public/style.css`, `public/app.js`

## Getting Started

### Prerequisites
- Node.js 14+

### Clone and Install
```bash
git clone <repo-url>
cd <repo-directory>
npm install
```

### Run Locally
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) to view the interactive map.

## Static Deployment (GitHub Pages)
To host the front-end only:
1. Ensure `index.html` is at the repo root.
2. In GitHub repo settings → Pages, set source branch to `main` (or default) and folder to `/root`.
3. Push changes—your static front-end will be served (API endpoints require a server and won’t function on static pages).

## License
MIT