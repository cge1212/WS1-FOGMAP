// Add Maptiler Key
const MAPTILER_KEY = 'SejrCdQP1oxLdzMze2yf';

// Define Variables
let map;
let lastUpdate = 0;
const updateInterval = 200; // ms
const radiusMask_lower = 0.2;
const radiusMask_upper = 1.2*radiusMask_lower; // adjust for optimal buildings
let initialCenterCoords = null; // Store for reuse


// Get Geolocation - Perhaps necessary to change to more accurate method via API
navigator.geolocation.getCurrentPosition(successLoc, errorLoc, {
  enableHighAccuracy: true
});

function successLoc(position) {
    console.log("Geolocation success", position);
  const coords = [position.coords.longitude, position.coords.latitude];
  initialCenterCoords = coords;
  initializeMap(coords);
}

function errorLoc() {
    console.log("Geolocation failed, using fallback");
  const fallbackCoords = [13.38, 52.51];
  initialCenterCoords = fallbackCoords;
  initializeMap(fallbackCoords);
}

// Define Creation of Masks - Add functionality for edge opacities
function createMaskGeoJSON(center, radiusMask_lower) {
  const circle = turf.circle(center, radiusMask_lower, {
    steps: 64,
    units: 'kilometers'
  });

  const mask = turf.mask(circle); // Creates a cutout hole
  console.log("Mask result:", mask); // ✅ See if it's valid
  return mask;
}

function updateMask() {
  const now = Date.now();
  if (now - lastUpdate < updateInterval) return;
  lastUpdate = now;

  const centerMask = map.getCenter().toArray();
  const maskGeoJSON = createMaskGeoJSON(centerMask, radiusMask_lower);
  if (maskGeoJSON) {
    map.getSource('circle-mask').setData(maskGeoJSON);
  }
}

function initializeMap(center) {
    const panLimitRadiusKm = 5 * radiusMask_lower;
    const bounds = turf.bbox(
      turf.circle(center, panLimitRadiusKm, { units: 'kilometers' })
    );
  
    map = new maplibregl.Map({
      style: "../STYLES/tiles_symbology.json", // <-- Use style that supports 3D
      center: center,
      zoom: 15.5,
      pitch: 45,
      bearing: -17.6,
      container: 'map',
      canvasContextAttributes: { antialias: true }
    });
  
    map.setMaxBounds([
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]]
    ]);
  
    map.on('load', () => {
      console.log("Map loaded");
  
      const maskGeoJSON = createMaskGeoJSON(initialCenterCoords, radiusMask_lower);
      console.log("initialCenterCoords at mask creation:", initialCenterCoords);
  
      // 1. Add the circle mask source
      map.addSource('circle-mask', {
        type: 'geojson',
        data: maskGeoJSON
      });
  
      // 2. Add the mask layer (under buildings)
      map.addLayer({
        id: 'circle-mask-layer',
        type: 'fill',
        source: 'circle-mask',
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 1
        }
      });

      map.addLayer({
        "id": "building-3d",
        "type": "fill-extrusion",
        "source": "openmaptiles",
        "source-layer": "building",
        "minzoom": 14,
        "paint": {
          "fill-extrusion-base": ["get", "render_min_height"],
          "fill-extrusion-color": "hsl(228,12.2%,92%)",
          "fill-extrusion-height": ["get", "render_height"],
          "fill-extrusion-opacity": 0.8
        }
      }); // insert before label layer for good rendering
  
      // 3. Add the vector tile source (if not already part of the style)
      map.addSource('openmaptiles', {
        url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
        type: 'vector',
      });
  
      // 4. Add the 3D buildings layer manually, above the mask
      map.addLayer({
        "id": "building-3d",
        "type": "fill-extrusion",
        "source": "openmaptiles",
        "source-layer": "building",
        "minzoom": 14,
        "paint": {
          "fill-extrusion-base": ["get", "render_min_height"],
          "fill-extrusion-color": "hsl(35,8%,85%)",
          "fill-extrusion-height": ["get", "render_height"],
          "fill-extrusion-opacity": 0.8
        }
      });
  
      // 5. Add listener for updating mask
      map.on('move', updateMask);
    });
  }
  