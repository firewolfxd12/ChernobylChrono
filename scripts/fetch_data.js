#!/usr/bin/env node
// Script to download GeoJSON data files as configured in data/config.json
const fs = require('fs');
const path = require('path');

// Ensure Node.js v18+ for global fetch
if (typeof fetch !== 'function') {
  console.error('global.fetch is not available. Please use Node.js v18 or higher.');
  process.exit(1);
}

async function main() {
  const configPath = path.join(__dirname, '../data/config.json');
  if (!fs.existsSync(configPath)) {
    console.error('Config file not found at data/config.json');
    process.exit(1);
  }
  const configRaw = fs.readFileSync(configPath, 'utf-8');
  let config;
  try {
    config = JSON.parse(configRaw);
  } catch (e) {
    console.error('Failed to parse config.json:', e.message);
    process.exit(1);
  }

  const outDir = path.join(__dirname, '../data/geojson');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const [year, url] of Object.entries(config)) {
    console.log(`Downloading data for year ${year} from ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const data = await res.text();
      const outPath = path.join(outDir, `${year}.geojson`);
      fs.writeFileSync(outPath, data, 'utf-8');
      console.log(`Saved to ${outPath}`);
    } catch (err) {
      console.error(`Error downloading ${year}:`, err.message);
    }
  }
  console.log('Fetch complete.');
}

main();