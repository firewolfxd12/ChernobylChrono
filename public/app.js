 (async () => {
  // Fetch available measurement fields
  const fields = await fetch('/api/fields').then(res => res.json());
  // Descriptions for each temporal field key (spatial dataset time series)
  const fieldDescriptions = {
    '137cs': 'Специфическая активность цезия-137 (Cs-137) в образце почвы, Бк/кг.',
    '134cs': 'Специфическая активность цезия-134 (Cs-134) в образце почвы, Бк/кг.',
    '90sr':  'Специфическая активность стронция-90 (Sr-90) в образце почвы, Бк/кг.',
  };
  // Legend colors (low to high values)
  const legendColors = [
    'rgba(0,0,0,0)',  // transparent placeholder
    'blue',          // low
    'cyan',          // medium-low
    'lime',          // medium
    'yellow',        // medium-high
    'red'            // high
  ];
  // Populate dropdown of fields
  const fieldSelect = document.getElementById('field-select');
  fields.forEach(f => {
    const opt = document.createElement('option'); opt.value = f.key; opt.textContent = f.label; fieldSelect.appendChild(opt);
  });
  let currentField = fields[0]?.key;
  // Fetch available dates for selected field
  // Load measurement dates (already sorted by server)
  let times = await fetch(`/api/dates?field=${currentField}`).then(res => res.json());
  // Start at explosion date so data appears immediately
  const explosionKey = '1986-04-26';
  let currentIndex = times.indexOf(explosionKey);
  if (currentIndex < 0) currentIndex = 0;
  // Function to update field description box
  function updateFieldDescription() {
    const descDiv = document.getElementById('field-description');
    const fieldMeta = fields.find(f => f.key === currentField);
    if (!fieldMeta) { descDiv.innerHTML = ''; return; }
    // Specific description for selected field
    const desc = fieldDescriptions[currentField] || `Показатель ${fieldMeta.label}`;
    descDiv.innerHTML = desc;
  }
  // Function to update legend for current field
function updateLegend(maxVal) {
    const legend = document.getElementById('legend');
    const fieldMeta = fields.find(f => f.key === currentField) || {};
    legend.innerHTML = `<b>Легенда: ${fieldMeta.label || ''}</b><br>`;
    // If maxVal not provided or zero, show placeholder
    if (!maxVal) {
      legend.innerHTML += 'Нет данных для отображения';
      return;
    }
    // Five steps from 0 to maxVal
    const steps = [0, 0.25, 0.5, 0.75, 1];
    steps.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const colorBox = document.createElement('span');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = legendColors[i + 1];
      const val = (t * maxVal).toExponential(2);
      const label = document.createElement('span');
      label.textContent = `${val}`;
      item.appendChild(colorBox);
      item.appendChild(label);
      legend.appendChild(item);
    });
  }

  const map = new maplibregl.Map({
    container: 'map',
    // Satellite basemap (Esri World Imagery)
    style: {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          ],
          tileSize: 256
        }
      },
      layers: [
        {
          id: 'satellite',
          type: 'raster',
          source: 'satellite'
        }
      ]
    },
    center: [30.223, 51.276],
    zoom: 9
  });
  // Array to track active pulses for full animation cycle
  let activePulses = [];
  const pulseDuration = 1000; // pulse animation duration in ms

  map.on('load', () => {
    // Pulsing dot icon for new samples
    const size = 100;
    const pulsingDot = {
      width: size,
      height: size,
      data: new Uint8Array(size * size * 4),
      onAdd() {
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        this.context = canvas.getContext('2d');
      },
      render() {
        const duration = 1000;
        const t = (performance.now() % duration) / duration;
        const radius = this.width / 2 * 0.3;
        const outerRadius = this.width / 2 * 0.7 * t + radius;
        const context = this.context;
        // clear canvas
        context.clearRect(0, 0, this.width, this.height);
        // draw pulse ring (no center dot)
        context.beginPath();
        context.arc(this.width/2, this.height/2, outerRadius, 0, Math.PI*2);
        context.strokeStyle = 'rgba(255,0,0,' + (1 - t) + ')';
        context.lineWidth = 2;
        context.stroke();
        // update image data
        this.data = context.getImageData(0, 0, this.width, this.height).data;
        // keep map repainting
        map.triggerRepaint();
        return true;
      }
    };
    map.addImage('pulsing-dot', pulsingDot, { pixelRatio: 1 });
    map.addSource('pulse', { type: 'geojson', data: getPlaceholderGeoJSON() });
    map.addLayer({ id: 'pulse-layer', type: 'symbol', source: 'pulse', layout: { 'icon-image': 'pulsing-dot' } });
    // Main radiation source
    map.addSource('radiation', { type: 'geojson', data: getPlaceholderGeoJSON() });
    // Heatmap layer for Cs-134 intensity
    map.addLayer({
      id: 'radiation-heatmap',
      type: 'heatmap',
      source: 'radiation',
      maxzoom: 15,
      paint: {
        // Weight based on value property with linear interpolation
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'value'], 0, 0, 1, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 20, 15, 60],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,255,0)',    // transparent blue
          0.2, 'blue',             // vibrant blue
          0.4, 'cyan',             // bright cyan
          0.6, 'lime',             // neon green
          0.8, 'yellow',           // bright yellow
          1, 'red'                // vivid red
        ]
      }
    });

    // Explosion marker with Russian info
    const explosionCoord = [30.102, 51.379];
    new maplibregl.Marker({ color: '#000' })
      .setLngLat(explosionCoord)
      .setPopup(new maplibregl.Popup({ offset: 25 })
        .setHTML('<h3>Чернобыльская АЭС</h3><strong>Взрыв:</strong> 26 апреля 1986 г.<br><em>Зона отчуждения создана 27 апреля 1986 г.</em>'))
      .addTo(map);
    // Initial map view at explosion date
    updateMap(times[currentIndex]);
    updateYearLabel(times[currentIndex]);
    // Initialize description for current field
    updateFieldDescription();
    // Add invisible circle layer for interaction (popups in scientific notation)
    map.addLayer({
      id: 'radiation-points',
      type: 'circle',
      source: 'radiation',
      paint: {
        'circle-radius': 4,
        'circle-opacity': 0
      }
    });
    map.on('click', 'radiation-points', (e) => {
      const feature = e.features[0];
      const val = Number(feature.properties.value);
      const fieldMeta = fields.find(f => f.key === currentField);
      const unitMatch = fieldMeta.label.match(/Bq\/[^ )]+/);
      const unit = unitMatch ? unitMatch[0] : '';
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`Значение: ${val.toExponential(2)} ${unit}`)
        .addTo(map);
    });
    // Load and display country borders
    fetch('https://unpkg.com/world-atlas@2/countries-50m.json')
      .then(res => res.json())
      .then(world => {
        const countries = topojson.feature(world, world.objects.countries);
        map.addSource('country-borders', { type: 'geojson', data: countries });
        map.addLayer({
          id: 'country-borders',
          type: 'line',
          source: 'country-borders',
          layout: {},
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.5,
            'line-opacity': 0.8
          }
        });
      })
      .catch(err => console.error('Error loading country borders:', err));
  });

  const slider = document.getElementById('slider');
  // Initialize slider control
  noUiSlider.create(slider, {
    start: [currentIndex],
    step: 1,
    range: { min: 0, max: times.length - 1 },
    format: { to: v => String(Math.round(v)), from: v => parseInt(v) },
    // show tooltips as localized date labels
    tooltips: [{ to: v => new Date(times[Math.round(v)]).toLocaleDateString('ru-RU'), from: v => parseInt(v) }],
    pips: { mode: 'steps', density: 1 }
  });
  // Update map on slider change
  slider.noUiSlider.on('update', (values) => {
    const idx = parseInt(values[0], 10);
    currentIndex = idx;
    const key = times[idx];
    updateYearLabel(key);
    if (map.getSource && map.getSource('radiation')) {
      updateMap(key);
    }
  });
  // Trigger initial update
  slider.noUiSlider.set(currentIndex);

  // Speed control setup: seconds per step
  const speedSlider = document.getElementById('speed-slider');
  const speedLabel = document.getElementById('speed-label');
  // parse slider value as seconds
  let playSpeedSec = parseFloat(speedSlider.value);
  let playSpeed = playSpeedSec * 1000; // convert to ms
  speedLabel.textContent = playSpeedSec.toFixed(1) + ' с';
  speedSlider.addEventListener('input', () => {
    playSpeedSec = parseFloat(speedSlider.value);
    playSpeed = playSpeedSec * 1000;
    speedLabel.textContent = playSpeedSec.toFixed(1) + ' с';
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = setInterval(playTick, playSpeed);
    }
  });
  // Function to advance animation
  function playTick() {
    currentIndex = (currentIndex + 1) % times.length;
    slider.noUiSlider.set(currentIndex);
  }

  let playInterval = null;
  const playButton = document.getElementById('play-button');
  playButton.addEventListener('click', () => {
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
      playButton.textContent = 'Воспроизвести';
    } else {
      playButton.textContent = 'Пауза';
      playInterval = setInterval(playTick, playSpeed);
    }
  });

  // Fetch and display data for the selected field and date
  // Fetch and display data for the selected field and date, normalize values and update legend
  function updateMap(dateKey) {
    fetch(`/api/radiation?field=${currentField}&date=${dateKey}`)
      .then(res => res.json())
      .then(data => {
        const src = map.getSource('radiation');
        if (src) {
          src.setData(data);
        // Normalize values for heatmap weighting
          const values = data.features.map(f => f.properties.value);
          const maxVal = values.length ? Math.max(...values) : 0;
          // Update heatmap weight mapping dynamically; ensure valid ascending stops
          if (maxVal > 0) {
            // Weight: linear scaling of normalized value
            map.setPaintProperty(
              'radiation-heatmap',
              'heatmap-weight',
              ['/', ['get', 'value'], maxVal]
            );
          } else {
            // No data: zero weight
            map.setPaintProperty('radiation-heatmap', 'heatmap-weight', 0);
          }
        // Update legend with actual values
          updateLegend(maxVal);
        // Highlight newly appearing samples with pulsing effect
        const pulseSrc = map.getSource('pulse');
        if (pulseSrc) {
          const now = performance.now();
          // Add new pulses for samples first appearing at this date
          const newPoints = data.features.filter(f => f.properties.firstDate === dateKey);
          newPoints.forEach(f => activePulses.push({ feature: f, startTime: now }));
          // Remove pulses that have completed their animation cycle
          activePulses = activePulses.filter(p => now - p.startTime < pulseDuration);
          // Update pulse source with active pulses
          pulseSrc.setData({
            type: 'FeatureCollection',
            features: activePulses.map(p => p.feature)
          });
        }
        } else {
          console.warn('Radiation source not ready, cannot set data');
        }
      })
      .catch(err => console.error(err));
  }

  function updateYearLabel(key) {
    const date = new Date(key);
    document.getElementById('year-label').textContent = date.toLocaleDateString('ru-RU');
  }
  // Handle field selection changes
  fieldSelect.addEventListener('change', async () => {
    currentField = fieldSelect.value;
    // reload available dates
    times = await fetch(`/api/dates?field=${currentField}`).then(res => res.json());
    // Reset to explosion date when field changes
    const explosionKey = '1986-04-26';
    currentIndex = times.indexOf(explosionKey);
    if (currentIndex < 0) currentIndex = 0;
    // update slider options
    slider.noUiSlider.updateOptions({
      range: { min: 0, max: times.length - 1 },
      start: [currentIndex],
      tooltips: [{ to: v => new Date(times[Math.round(v)]).toLocaleDateString('ru-RU'), from: v => parseInt(v) }],
      pips: { mode: 'steps', density: 1 }
    }, true);
    // refresh map
    // Refresh map, label, and description
    updateMap(times[currentIndex]);
    updateYearLabel(times[currentIndex]);
    updateFieldDescription();
  });

  function getPlaceholderGeoJSON() {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }
  // Welcome screen: hide overlay and resize map when starting
  const welcome = document.getElementById('welcome-screen');
  const startBtn = document.getElementById('start-button');
  startBtn.addEventListener('click', () => {
    welcome.style.display = 'none';
    map.resize();
  });
})();