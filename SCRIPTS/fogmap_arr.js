const defaultPosition = [13.333, 52.493]; 
const radiusMask_lower = 150;
const radiusMask_upper = 178;
const navMarker_dist = (radiusMask_lower + 45)/1000;

// GM as default
let currentStyle = styleGM;

const configLowerMask = {
  innerRadius: radiusMask_lower,
  color: 'hsl(0, 0.00%, 0.00%)',
  ringCount: 3,
  ringWidth: 7,
  opacities: [0.2, 0.4, 0.6]
  //opacities: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
};

const configUpperMask = {
  innerRadius: radiusMask_upper,
  color: 'hsl(41.54, 65%, 92.16%)',
  ringCount: 4,
  ringWidth: 7,
  opacities: [0.2, 0.4, 0.6, 0.8]
};

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

  map.once('styledata', () => {
    addCustomLayers(map);
  });
});

let arrowToggleActive = false; 

const styleArrowBtn = document.getElementById('styleArrowBtn');
const arrowIndicator = document.querySelector('.style-triangle');

function updateArrowIndicator() {
  arrowIndicator.style.backgroundColor = arrowToggleActive ? 'blue' : 'transparent';
}

styleArrowBtn.addEventListener('click', () => {
  arrowToggleActive = !arrowToggleActive;
  updateArrowIndicator();

  const layerId = 'heading-triangle-layer';

  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, 'fill-opacity', arrowToggleActive ? 0.7 : 0.0);
  } else {
    map.once('idle', () => {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'fill-opacity', arrowToggleActive ? 0.7 : 0.0);
      }
    });
  }
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
  if (typeof hsl === 'string') {
    const match = hsl.match(/^hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/i);
    if (match) {
      return {
        h: parseFloat(match[1]),
        s: parseFloat(match[2]),
        l: parseFloat(match[3])
      };
    } else {
      console.warn('Invalid HSL string format. Expected format: hsl(h, s%, l%)');
      return { h: 0, s: 0, l: 0 }; // fallback to black
    }
  }
  return hsl; // already an object
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
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

  return {
    type: 'FeatureCollection',
    features
  };
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

  map.addSource('heading-triangle', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });

    map.addLayer({
        id: 'heading-triangle-layer',
        type: 'fill',
        source: 'heading-triangle',
        paint: {
            'fill-color': 'rgba(0, 102, 255, 0.6)',
            'fill-outline-color': 'rgba(0, 102, 255, 0.9)',
            'fill-opacity': arrowToggleActive ? 0.7 : 0.0
        }
    });
}

map.on('load', () => {
  console.log("Map loaded");
  addCustomLayers(map);

const searchInput = document.getElementById('search-input');
const suggestionsDiv = document.getElementById('suggestions');
let searchTimeout;
let directionSourceId = 'direction-point';
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
            const [targetLng, targetLat] = feature.geometry.coordinates;
            targetLocation = [targetLng, targetLat]; // Store globally

            suggestionsDiv.innerHTML = '';
            searchInput.value = el.textContent;
          });    
          suggestionsDiv.appendChild(el);
        });
      });
  }, 300);
});

  // User marker
  const userMarkerEl = document.createElement('div');
  userMarkerEl.className = 'user-marker';

  const userMarker = new maplibregl.Marker({ element: userMarkerEl })
  .setLngLat(defaultPosition)
  .addTo(map);

  let hasCentered = false; // Track whether we've already centered the map

  // Watch user location
  navigator.geolocation.watchPosition(
    (position) => {
      console.log("Location retrieved", position);
      const { latitude, longitude } = position.coords;
      const currentLocation = [longitude, latitude];

      userMarker.setLngLat(currentLocation);

      // Center only once on first position fix
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

        let markerPosition;
        if (distance <= navMarker_dist) {
          markerPosition = targetLocation;
        } else {
          const bearing = turf.bearing(currentLocation, targetLocation);
          const offset = turf.destination(currentLocation, navMarker_dist, bearing, { units: 'kilometers' });
          markerPosition = offset.geometry.coordinates;
        }

        const directionSource = map.getSource(directionSourceId);
        if (directionSource) {
          directionSource.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: markerPosition
                }
              }
            ]
          });
        }
      }

    },
    (error) => {
      alert("Location error: " + error.message);
      console.error("Error tracking location:", error);
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });

  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
        document.body.addEventListener('click', () => {
            DeviceOrientationEvent.requestPermission().then(result => {
                if (result === 'granted') {
                    setupDeviceOrientation();
                }
            }).catch(console.error);
        });
    } else {
        setupDeviceOrientation();
    }

    function setupDeviceOrientation() {
        window.addEventListener('deviceorientation', (event) => {
            const heading = event.alpha;
            if (heading == null || isNaN(heading)) return;

            const userPos = userMarker.getLngLat();
            const bearing = 360 - heading; // Use heading directly, no need to subtract from 360
            const length = 0.04; // smaller main triangle length (~20m)
            const widthFactor = 0.5; // reduce side width (smaller triangle)

            // Center point
            const center = [userPos.lng, userPos.lat];

            // Forward tip of the triangle
            const point1 = turf.destination(center, length, bearing, { units: 'kilometers' }).geometry.coordinates;

            // Base left and right points (relative to forward direction)
            const point2 = turf.destination(center, length * widthFactor, bearing + 135, { units: 'kilometers' }).geometry.coordinates;
            const point3 = turf.destination(center, length * widthFactor, bearing - 135, { units: 'kilometers' }).geometry.coordinates;

            const triangle = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                type: 'Polygon',
                coordinates: [[point1, point2, point3, point1]]
                }
            }]
            };


            map.getSource('heading-triangle')?.setData(triangle);
            map.setPaintProperty('heading-triangle', 'fill-opacity', arrowToggleActive ? 0.7 : 0.0);
        });
    }
});