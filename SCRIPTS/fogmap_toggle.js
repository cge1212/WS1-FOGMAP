const defaultPosition = [8.507, 47.408];
const radiusMask_lower = 200;
const radiusMask_upper = 228;
const navMarker_dist = (radiusMask_lower + 45) / 1000;

// Style toggle
const styleGM = "../STYLES/tiles_sym_Google.json";
const styleDark = "../STYLES/tiles_sym_Dark.json";
let currentStyle = styleGM;

const configLowerMask = {
  innerRadius: radiusMask_lower,
  color: 'hsl(0, 0.00%, 0.00%)',
  ringCount: 3,
  ringWidth: 7,
  opacities: [0.2, 0.4, 0.6]
};

const configUpperMask = {
  innerRadius: radiusMask_upper,
  color: 'hsl(51, 79.50%, 82.70%)',
  ringCount: 4,
  ringWidth: 7,
  opacities: [0.2, 0.4, 0.6, 0.8]
};

// Initialize map
const map = new maplibregl.Map({
  style: currentStyle,
  center: defaultPosition,
  zoom: 15.5,
  pitch: 0,
  bearing: -17.6,
  container: 'map',
  canvasContextAttributes: { antialias: true }
});

const toggleBtn = document.getElementById('styleToggleBtn');
const indicator = toggleBtn.querySelector('.style-indicator');

function updateIndicator() {
  indicator.style.backgroundColor = currentStyle === styleDark ? 'black' : 'transparent';
}

toggleBtn.addEventListener('click', () => {
  currentStyle = currentStyle === styleGM ? styleDark : styleGM;
  map.setStyle(currentStyle);
  updateIndicator();
});

function createMaskGeoJSON(center, radiusInMeter) {
  const turfCenter = turf.point(center);
  const outer = turf.bboxPolygon([-180, -90, 180, 90]);
  const inner = turf.circle(turfCenter, radiusInMeter / 1000, {
    steps: 64,
    units: 'kilometers'
  });
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          outer.geometry.coordinates[0],
          inner.geometry.coordinates[0]
        ]
      }
    }]
  };
}

function parseHslColor(hsl) {
  const match = hsl.match(/^hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/i);
  if (match) {
    return {
      h: parseFloat(match[1]),
      s: parseFloat(match[2]),
      l: parseFloat(match[3])
    };
  }
  console.warn('Invalid HSL format');
  return { h: 0, s: 0, l: 0 };
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return [f(0), f(8), f(4)];
}

function createFadeMask(center, config) {
  const {
    innerRadius = 100,
    color = 'hsl(0, 0%, 0%)',
    ringCount = 4,
    ringWidth = 10,
    opacities = [0.2, 0.4, 0.6, 0.8]
  } = config;

  const hsl = parseHslColor(color);
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  const features = [];
  const steps = 64;

  for (let i = 0; i < ringCount; i++) {
    const ringInner = innerRadius + i * ringWidth;
    const ringOuter = ringInner + ringWidth;

    const outerCircle = turf.circle(center, ringOuter / 1000, { steps, units: 'kilometers' });
    const innerCircle = turf.circle(center, ringInner / 1000, { steps, units: 'kilometers' });

    features.push({
      type: 'Feature',
      properties: {
        fill: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacities[i] || 1.0})`
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          outerCircle.geometry.coordinates[0],
          innerCircle.geometry.coordinates[0]
        ]
      }
    });
  }

  const finalOuterRadius = innerRadius + ringCount * ringWidth;
  const finalOuterCircle = turf.circle(center, finalOuterRadius / 1000, { steps, units: 'kilometers' });
  const worldBounds = turf.bboxPolygon([-180, -90, 180, 90]);

  features.push({
    type: 'Feature',
    properties: {
      fill: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1.0)`
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        worldBounds.geometry.coordinates[0],
        finalOuterCircle.geometry.coordinates[0]
      ]
    }
  });

  return { type: 'FeatureCollection', features };
}

function addCustomLayers(map) {
  const currentLocation = defaultPosition;

  map.addLayer({
    id: "building-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 14,
    paint: {
      "fill-extrusion-base": ["get", "render_min_height"],
      "fill-extrusion-color": "hsl(35,8%,85%)",
      "fill-extrusion-height": ["get", "render_height"],
      "fill-extrusion-opacity": 1
    }
  });

  map.addSource('mask_lower', {
    type: 'geojson',
    data: createFadeMask(currentLocation, configLowerMask)
  });

  map.addLayer({
    id: 'mask-layer-lower',
    type: 'fill',
    source: 'mask_lower',
    paint: {
      'fill-color': ['get', 'fill'],
      'fill-opacity': 0.7,
      'fill-outline-color': 'rgba(0,0,0,0)'
    }
  }, 'building-3d');

  map.addSource('mask_upper', {
    type: 'geojson',
    data: createFadeMask(currentLocation, configUpperMask)
  });

  map.addLayer({
    id: 'mask-layer-upper',
    type: 'fill',
    source: 'mask_upper',
    paint: {
      'fill-color': ['get', 'fill'],
      'fill-opacity': 0.98,
      'fill-outline-color': 'rgba(0,0,0,0)'
    }
  });

  map.addSource('direction-point', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  });

  map.addLayer({
    id: 'direction-layer',
    type: 'circle',
    source: 'direction-point',
    paint: {
      'circle-radius': 80,
      'circle-color': 'blue',
      'circle-opacity': 0.3,
      'circle-stroke-width': 0,
      'circle-blur': 0.3
    }
  }, 'mask-layer-upper');
}

const userMarkerEl = document.createElement('div');
userMarkerEl.className = 'user-marker';
const userMarker = new maplibregl.Marker({ element: userMarkerEl })
  .setLngLat(defaultPosition)
  .addTo(map);

map.on('load', () => {
  console.log("Map loaded");
  addCustomLayers(map);

  const searchInput = document.getElementById('search-input');
  const suggestionsDiv = document.getElementById('suggestions');
  let searchTimeout;
  let targetLocation = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (query.length < 3) {
      suggestionsDiv.innerHTML = '';
      return;
    }

    searchTimeout = setTimeout(() => {
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`)
        .then(res => res.json())
        .then(data => {
          suggestionsDiv.innerHTML = '';
          data.features.forEach(feature => {
            const el = document.createElement('div');
            el.className = 'suggestion';
            el.textContent = feature.properties.name + ', ' + (feature.properties.city || feature.properties.country || '');
            el.addEventListener('click', () => {
              const [lng, lat] = feature.geometry.coordinates;
              targetLocation = [lng, lat];
              suggestionsDiv.innerHTML = '';
              searchInput.value = el.textContent;
            });
            suggestionsDiv.appendChild(el);
          });
        });
    }, 300);
  });

  let hasCentered = false;

  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const currentLocation = [longitude, latitude];
      userMarker.setLngLat(currentLocation);

      if (!hasCentered) {
        map.setCenter(currentLocation);
        hasCentered = true;
      }

      const lowerMaskSource = map.getSource('mask_lower');
      if (lowerMaskSource) {
        lowerMaskSource.setData(createFadeMask(currentLocation, configLowerMask));
      }

      const upperMaskSource = map.getSource('mask_upper');
      if (upperMaskSource) {
        upperMaskSource.setData(createFadeMask(currentLocation, configUpperMask));
      }

      if (targetLocation) {
        const distance = turf.distance(currentLocation, targetLocation, { units: 'kilometers' });
        let markerPosition = distance <= navMarker_dist
          ? targetLocation
          : turf.destination(currentLocation, navMarker_dist, turf.bearing(currentLocation, targetLocation), { units: 'kilometers' }).geometry.coordinates;

        const directionSource = map.getSource('direction-point');
        if (directionSource) {
          directionSource.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: markerPosition }
            }]
          });
        }
      }
    },
    (err) => {
      alert("Location error: " + err.message);
      console.error("Geolocation error:", err);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
});

// Reapply layers on style switch
map.on('styledata', () => {
  console.log("Style changed — reapplying custom layers");

  // Re-add layers and sources
  addCustomLayers(map);

  // Re-add user marker if removed
  if (!document.querySelector('.user-marker')) {
    const userMarkerEl = document.createElement('div');
    userMarkerEl.className = 'user-marker';
    userMarker.setElement(userMarkerEl);
    userMarker.addTo(map);
  }

  // Restore direction-point source with empty data if missing
  if (!map.getSource('direction-point')) {
    map.addSource('direction-point', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
  }

  // Restore the direction-layer
  if (!map.getLayer('direction-layer')) {
    map.addLayer({
      id: 'direction-layer',
      type: 'circle',
      source: 'direction-point',
      paint: {
        'circle-radius': 80,
        'circle-color': 'blue',
        'circle-opacity': 0.3,
        'circle-stroke-width': 0,
        'circle-blur': 0.3
      }
    }, 'mask-layer-upper'); // make sure this layer is added above your masks
  }
});

