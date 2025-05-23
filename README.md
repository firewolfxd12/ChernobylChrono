# realchernobyl Interactive Map

Full-stack demo of an interactive map showing simulated radiation levels in the Chernobyl Exclusion Zone with a time slider and animation controls.

## Requirements
- Node.js 14+

## Setup and Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Add your GeoJSON data:
   - If you have separate GeoJSON files for each year, place them in `data/geojson/` named `<year>.geojson` (e.g., `1986.geojson`, `1987.geojson`, …).
   - If you have a single multi-year GeoJSON file with each feature containing a `properties.year` field, you can place it either in `data/geojson/` or directly in `data/` (e.g., `data/all_years.geojson`).
   - The server will automatically detect whether to use per-year files or the single multi-year file and slice data by year.
3. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000` in your browser.

 ## Files
 - `index.html`: Main HTML file.
 - `style.css`: Styles for map and slider.
 - `app.js`: Map and slider implementation with fake data.

The server simulates radiation data for years 1986–2020 at sample points using an exponential decay model.
To integrate real data, replace the `points` array or `getDataForYear` logic in `server.js`.