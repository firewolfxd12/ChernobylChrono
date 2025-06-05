const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');

// Prepare data source: CSV (e.g. airborne readings) or legacy GeoJSON
// Determine data directory: if a ro-crate folder exists under data, use its 'data' subfolder
const baseDataDir = path.join(__dirname, 'data');
let dataDir = baseDataDir;
// look for a single subdirectory containing a 'data' folder
const subdirs = fs.readdirSync(baseDataDir).filter(f => fs.statSync(path.join(baseDataDir, f)).isDirectory());
for (const d of subdirs) {
  const candidate = path.join(baseDataDir, d, 'data');
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    dataDir = candidate;
    break;
  }
}
let csvMode = false;
let spatialMode = false;
// times: date keys (YYYY-MM-DD) for CSV, or years for GeoJSON
let times = [];
// dataIndex maps each time key to an array of GeoJSON features
const dataIndex = {};
// Generic CSV loader: read all CSVs under dataDir and expose datasets
const datasets = {};
fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith('.csv')).forEach(csvFile => {
  const filePath = path.join(dataDir, csvFile);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return;
  const header = lines.shift().split(',');
  // detect coordinate columns
  const idxLon = header.findIndex(h => /lon/i.test(h));
  const idxLat = header.findIndex(h => /lat/i.test(h));
  // detect date column (first header containing 'date')
  const idxDate = header.findIndex(h => /date/i.test(h));
  // detect numeric fields: headers not code/id/coord/date text
  const fields = header.map((col, idx) => {
    if ([idxLon, idxLat, idxDate].includes(idx)) return null;
    return { key: col.replace(/\W+/g, '_').toLowerCase(), idx, label: col };
  }).filter(f => f);
  const features = [];
  // parse rows
  lines.forEach(line => {
    const cols = line.split(',');
    const lon = parseFloat(cols[idxLon]);
    const lat = parseFloat(cols[idxLat]);
    if (isNaN(lon) || isNaN(lat)) return;
    // parse date
    const rawDate = idxDate >= 0 ? cols[idxDate] : null;
    const dateKey = rawDate ? rawDate : null;
    // for each field, parse value
    fields.forEach(f => {
      const val = parseFloat(cols[f.idx]);
      if (isNaN(val)) return;
      features.push({
        type: 'Feature',
        properties: { field: f.key, value: val, date: dateKey },
        geometry: { type: 'Point', coordinates: [lon, lat] }
      });
    });
  });
  const datasetKey = path.parse(csvFile).name;
  datasets[datasetKey] = { label: datasetKey, fields, features };
});
// API: list datasets
app.get('/api/datasets', (req, res) => {
  res.json(Object.entries(datasets).map(([key, ds]) => ({ key, label: ds.label })));
});
// Determine default dataset: pick first dataset that has temporal data (non-null dates)
const defaultDatasetKey = (() => {
  for (const [key, ds] of Object.entries(datasets)) {
    if (ds.features.some(f => f.properties.date)) {
      return key;
    }
  }
  // Fallback to first dataset
  return Object.keys(datasets)[0];
})();

// Helper to parse various date formats into JS Date
function parseDate(raw) {
  if (!raw) return new Date(NaN);
  // Try ISO format
  const iso = new Date(raw);
  if (!isNaN(iso)) return iso;
  // Try dd-MMM-yy format
  const parts = raw.split('-');
  if (parts.length === 3) {
    const [dayStr, monStr, yearStr] = parts;
    const day = parseInt(dayStr, 10);
    const monthMap = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
                      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const monKey = monStr.charAt(0).toUpperCase() + monStr.slice(1, 3).toLowerCase();
    const month = monthMap[monKey];
    let year = parseInt(yearStr, 10);
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
    return new Date(year, month, day);
  }
  return new Date(NaN);
}

const EXPLOSION_DATE = new Date('1986-04-26');

// API: list available fields
app.get('/api/fields', (req, res) => {
  const fields = datasets[defaultDatasetKey].fields;
  // Only include radionuclide measurement fields: cesium and strontium (exclude uncertainties)
  const timeFields = fields.filter(f => /Cs|Sr/i.test(f.label) && !/uncertainty/i.test(f.label));
  res.json(timeFields.map(f => ({ key: f.key, label: f.label })));
});

// API: list all dates between first and last measurement for a field (daily with LOCF)
// API: list all dates between 30 days before explosion and 1 Jan 2070 (daily)
// API: list all unique measurement dates for a field (LOCF uses these dates)
app.get('/api/dates', (req, res) => {
  const field = req.query.field;
  if (!field) return res.status(400).json({ error: 'Missing field parameter' });
  // Extract dates from features of the default dataset for this field
  const ds = datasets[defaultDatasetKey];
  const datesRaw = ds.features
    .filter(f => f.properties.field === field && f.properties.date)
    .map(f => f.properties.date);
  // Unique and sort chronologically
  const uniqueDates = Array.from(new Set(datesRaw));
  uniqueDates.sort((a, b) => parseDate(a) - parseDate(b));
  res.json(uniqueDates);
});

// API: get GeoJSON for a given field and date, using LOCF for missing points
app.get('/api/radiation', (req, res) => {
  const field = req.query.field;
  const dateKey = req.query.date;
  if (!field || !dateKey) return res.status(400).json({ error: 'Missing field or date parameter' });
  const feats = datasets[defaultDatasetKey].features.filter(f => f.properties.field === field && f.properties.date);
  // Group by coordinate
  const groups = {};
  feats.forEach(f => {
    const coords = f.geometry.coordinates;
    const key = coords.join(',');
    // Preserve original date string for first-date tracking
    const entry = {
      date: parseDate(f.properties.date),
      dateKey: f.properties.date,
      value: f.properties.value
    };
    if (!groups[key]) groups[key] = { coords, entries: [entry] };
    else groups[key].entries.push(entry);
  });
  const targetDate = parseDate(dateKey);
  if (isNaN(targetDate)) {
    return res.status(400).json({ error: 'Invalid date parameter' });
  }
  // If before explosion date, show no data until explosion
  if (targetDate < EXPLOSION_DATE) {
    return res.json({ type: 'FeatureCollection', features: [] });
  }
  // Half-life mapping (years) for key radionuclides
  const halfLives = {
    '137cs': 30.17,
    '134cs': 2.065,
    '90sr': 28.79,
    '154eu': 8.593
  };
  const halfLife = halfLives[field.toLowerCase()];
  const outFeatures = [];
  Object.values(groups).forEach(g => {
    // Sort entries by date
    g.entries.sort((a, b) => a.date - b.date);
    // Find observations on or before target date
    const past = g.entries.filter(e => !isNaN(e.date) && e.date <= targetDate);
    if (past.length > 0) {
      // Use latest measurement before or on target date
      const last = past[past.length - 1];
      let val = last.value;
      // Apply radioactive decay from measurement date to target date
      if (halfLife) {
        const deltaMs = targetDate - last.date;
        const deltaYears = deltaMs / (1000 * 60 * 60 * 24 * 365.25);
        val = val * Math.exp(-Math.LN2 * deltaYears / halfLife);
      }
      // Annotate feature with first sample date
      const firstDateKey = g.entries[0].dateKey;
      outFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: g.coords },
        properties: { value: val, firstDate: firstDateKey }
      });
    }
  });
  res.json({ type: 'FeatureCollection', features: outFeatures });
});

app.use(express.static(path.join(__dirname, 'public')));


// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});