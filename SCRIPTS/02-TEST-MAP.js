const defaultPosition = [8.507, 47.408];
const radiusMask_lower = 200;
const radiusMask_upper = 228;

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
  color: 'hsl(51, 79.50%, 82.70%)',
  ringCount: 4,
  ringWidth: 7,
  opacities: [0.2, 0.4, 0.6, 0.8]
};

map = new maplibregl.Map({
  style: "../STYLES/tiles_sym_Google.json",
  //style: "../STYLES/tiles_sym_Dark.json",
  center: defaultPosition,
  zoom: 15.5,
  pitch: 0,
  bearing: -17.6,
  container: 'map',
  canvasContextAttributes: { antialias: true }
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

map.on('load', () => {
  console.log("Map loaded");

  let currentLocation = defaultPosition; 

  // Add 3D buildings layer
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

  // User marker
  const userMarkerEl = document.createElement('div');
  userMarkerEl.className = 'user-marker';

  const userMarker = new maplibregl.Marker({ element: userMarkerEl })
  .setLngLat(defaultPosition)
  .addTo(map);

  map.addSource('mask_lower', {
    type: 'geojson',
    data: createFadeMask(currentLocation, configLowerMask)
  });
  
  map.addLayer({
    id: 'mask-layer-lower',
    type: 'fill',
    source: 'mask_lower',
    paint: {
      'fill-color': ['get', 'fill'],       // Use the fill color from feature properties
      'fill-opacity': 0.7,                   // Full opacity — actual transparency comes from RGBA in 'fill'
      'fill-outline-color': 'rgba(0,0,0,0)' // Make sure no dark outline appears
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

  let hasCentered = false; // Track whether we've already centered the map

  // Watch user location
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
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
    },
    (error) => {
      console.error("Error tracking location:", error);
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    }
  );
});
