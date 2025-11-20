let routeLayers = []; // Store main + alternative routes
let map, userMarker, sourceMarker, destMarker, routeLine;
let currentPrimaryRoute = null;
let currentRouteGeometry = null;
let currentRouteMeta = null;
let currentRouteRequestId = 0; // incremented for each findRoute call to avoid races
let TRAFFIC_KEY = null; // populated by ensureApiKeyRoles()
let apiRoleDetectionRan = false; // CRITICAL: Track if key detection has run
let coloredRouteLayers = []; // track route-segment layers created by traffic colorization
// Determine backend base URL. When opened via file:// (origin null), default to localhost server.
const BACKEND_BASE = (function(){
  try {
    const proto = (window && window.location && window.location.protocol) || '';
    if (proto === 'file:' || proto === 'null' || !proto) return 'http://localhost:5000';
    // Use same origin for HTTP/HTTPS
    return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'http://localhost:5000';
  } catch(_) { return 'http://localhost:5000'; }
})();
// Map UI vehicle types to GraphHopper vehicle parameter names
const VEHICLE_MAP = {
  car: 'car',
  petrol: 'car',
  diesel: 'car',
  electric: 'car',
  hybrid: 'car',
  bike: 'bike',
  cycling: 'bike',
  walking: 'foot',
  bus: 'car', // GraphHopper may not support 'bus' routing; fallback to 'car'
  truck: 'truck',
  motorcycle: 'motorcycle'
};
// In-memory incidents store for demo
if (!window.liveIncidents) window.liveIncidents = [];
// incidentsLayer will be created on demand
// By default, do NOT auto-load incidents from the backend. Set to true
// only when you want live incidents to be fetched automatically.
const AUTO_LOAD_INCIDENTS = false;

// Helper: enable or disable automatic live-incident fetching at runtime
function setAutoLoadIncidents(enabled) {
  if (enabled && !window._autoIncidentsInterval) {
    // initial fetch and set periodic refresh
    try { fetchAndRenderIncidents(); } catch(_) {}
    window._autoIncidentsInterval = setInterval(fetchAndRenderIncidents, 60000);
  } else if (!enabled && window._autoIncidentsInterval) {
    clearInterval(window._autoIncidentsInterval);
    window._autoIncidentsInterval = null;
  }
}

// Robust incident fetching and rendering
async function fetchAndRenderIncidents() {
  try {
    const resp = await fetch(`${BACKEND_BASE}/recent-incidents?limit=50&hours=48`);
    const data = await resp.json();
    if (data.proxyError || !Array.isArray(data.incidents)) {
      // If backend fails, keep previous incidents and show a warning
      console.warn("Failed to fetch incidents from backend:", data.details || "Unknown error");
      showIncidentWarning("Live incidents could not be updated. Showing last known incidents.");
      renderIncidents(); // keep current incidents
      return;
    }
    // Update in-memory store and render
    window.liveIncidents = data.incidents.map(inc => ({
      ...inc,
      expired: false,
      id: inc._id || inc.id || (inc.lat + ',' + inc.lon + ',' + inc.date)
    }));
    renderIncidents();
  } catch (err) {
    console.warn("Incident fetch error:", err);
    showIncidentWarning("Incident data could not be loaded. Showing last known incidents.");
    renderIncidents(); // keep current incidents
  }
}

function showIncidentWarning(msg) {
  let el = document.getElementById('incident-warning');
  if (!el) {
    el = document.createElement('div');
    el.id = 'incident-warning';
    el.style.position = 'absolute';
    el.style.top = '100px';
    el.style.right = '20px';
    el.style.zIndex = 9000;
    el.style.background = '#f59e0b';
    el.style.color = '#fff';
    el.style.padding = '8px 16px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  setTimeout(() => { try { el.remove(); } catch(_) {} }, 6000);
}

// Call this on page load and every 60 seconds
document.addEventListener("DOMContentLoaded", () => {
  // Do not auto-fetch incidents unless explicitly enabled.
  if (typeof AUTO_LOAD_INCIDENTS !== 'undefined' && AUTO_LOAD_INCIDENTS) {
    fetchAndRenderIncidents();
    setInterval(fetchAndRenderIncidents, 60000); // refresh every 60s
  }
});
const emissionRates = {
  petrol: 192,
  diesel: 171,
  electric: 20,
  bike: 103,
  bus: 105,
  truck: 400,
  electric_truck: 100,
  walking: 0,
  cycling: 0
};

// Fetch with timeout helper to avoid long hangs
async function fetchWithTimeout(resource, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

//Tourist categories configuration
const TOURIST_CATEGORIES = {
  parks: { key: 'parks', label: 'Parks', emoji: '🌳', color: '#4CAF50' },
  gardens: { key: 'gardens', label: 'Gardens', emoji: '🌺', color: '#8BC34A' },
  beaches: { key: 'beaches', label: 'Beaches', emoji: '🏖️', color: '#FFB74D' },
  rivers: { key: 'rivers', label: 'Rivers', emoji: '🌊', color: '#2196F3' },
  lakes: { key: 'lakes', label: 'Lakes', emoji: '🏞️', color: '#03DAC6' },
  forests: { key: 'forests', label: 'Forests', emoji: '🌲', color: '#2E7D32' },
  monuments: { key: 'monuments', label: 'Monuments', emoji: '🏛️', color: '#FF9800' },
  temples: { key: 'temples', label: 'Temples', emoji: '🕌', color: '#9C27B0' },
  museums: { key: 'museums', label: 'Museums', emoji: '🏛️', color: '#FF5722' },
  palaces: { key: 'palaces', label: 'Palaces', emoji: '🏰', color: '#E91E63' },
  forts: { key: 'forts', label: 'Forts', emoji: '🏯', color: '#795548' },
  ev: { key: 'ev', label: 'EV Charging', emoji: '⚡', color: '#9C27B0' },
  fuel: { key: 'fuel', label: 'Petrol Pumps', emoji: '⛽', color: '#F44336' },
  hospitals: { key: 'hospitals', label: 'Hospitals', emoji: '🏥', color: '#F44336' },
  atms: { key: 'atms', label: 'ATMs', emoji: '💳', color: '#9E9E9E' },
  toilets: { key: 'toilets', label: 'Toilets', emoji: '🚻', color: '#9E9E9E' },
  restaurants: { key: 'restaurants', label: 'Restaurants', emoji: '🍽️', color: '#F44336' },
  cafes: { key: 'cafes', label: 'Cafes', emoji: '☕', color: '#8D6E63' },
  hotels: { key: 'hotels', label: 'Hotels', emoji: '🏨', color: '#795548' },
  cinemas: { key: 'cinemas', label: 'Cinemas', emoji: '🎬', color: '#E91E63' },
  malls: { key: 'malls', label: 'Shopping Malls', emoji: '🛍️', color: '#E91E63' },
  markets: { key: 'markets', label: 'Markets', emoji: '🏪', color: '#FF9800' }
};
// const TOURIST_CATEGORIES = {
//   parks: { key: "parks", label: "Parks", emoji: "🌳", color: "#4CAF50" },
//   gardens: { key: "gardens", label: "Gardens", emoji: "🌺", color: "#8BC34A" },
//   beaches: { key: "beaches", label: "Beaches", emoji: "🏖️", color: "#FFB74D" },
//   rivers: { key: "rivers", label: "Rivers", emoji: "🏞️", color: "#2196F3" },
//   lakes: { key: "lakes", label: "Lakes", emoji: "🏞️", color: "#29B6F6" },
//   mountains: { key: "mountains", label: "Mountains", emoji: "⛰️", color: "#9E9E9E" },
// };
// ==== TomTom Integration Config (added) ====
function displayTouristRoutes(touristData) {
  // Clear previous tourist markers to avoid duplication
  try { clearTouristMarkers(); } catch(_) {}
  // Only show places that lie within a buffer of the current route geometry
  const filtered = filterGroupedByRoute(touristData, ROUTE_POI_BUFFER_METERS);
  for (const key in TOURIST_CATEGORIES) {
    const category = TOURIST_CATEGORIES[key];
    const places = filtered[category.key] || [];
    const unique = dedupePlacesByKey(places);
    unique.forEach((place) => {
      const id = getPlaceKey(place);
      if (!id || markerByPlaceId.has(id)) return;
      const marker = L.marker([place.lat, place.lon], {
        icon: L.divIcon({
          html: `<div class="tourist-icon" style="background:${category.color};">${escapeHtml(category.emoji)}</div>`,
          className: "tourist-marker-wrapper",
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        }),
      }).addTo(map);
      const popupHtml = `<b>${escapeHtml(place.name || 'Unknown')}</b><br>${escapeHtml(place.description || '')}`;
      try { createEnhancedPopup(marker, popupHtml, category.key); } catch (e) { marker.bindPopup(popupHtml); }
      markerByPlaceId.set(id, marker);
    });
  }
}

// Save route data to MongoDB using fetch to backend API endpoint
async function saveRouteToDB(routeData) {
  try {
    const response = await fetch("http://localhost:5000/save-route", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(routeData),
    });
    if (!response.ok) {
      console.error("Failed to save route:", response.statusText);
    }
  } catch (err) {
    console.error("Error saving route to DB:", err);
  }
}

const TOMTOM_CONFIG = {
  PRIMARY_KEY: 'YTdu01NcxIfytU6EFEV891Yh3rGflVDW',
  SECONDARY_KEY: 'YTdu01NcxIfytU6EFEV891Yh3rGflVDW',
  COUNTRY_SET: 'IN',
  BASE_URL: 'https://api.tomtom.com/search/2'
};
let trafficTileLayers = [];

// Map of our internal category keys to TomTom categorySearch terms.
// These are best-effort mappings; TomTom may return empty results for some categories.
const TOMTOM_CATEGORY_MAP = {
  parks: 'park',
  gardens: 'park',
  beaches: 'beach',
  rivers: 'river',
  lakes: 'lake',
  forests: 'forest',
  monuments: 'monument',
  temples: 'temple',
  museums: 'museum',
  palaces: 'monument',
  forts: 'monument',
  ev: 'charging-station',
  fuel: 'petrol-station',
  hospitals: 'hospital',
  atms: 'atm',
  toilets: 'toilet',
  restaurants: 'restaurant',
  cafes: 'cafe',
  hotels: 'hotel',
  cinemas: 'cinema',
  malls: 'shopping-mall',
  markets: 'market'
};
let lastTrafficWeatherHtml = '';
const imageCache = new Map();
const markerByPlaceId = new Map();

// Stable place key generator to ensure consistent deduplication across multiple data sources
function getPlaceKey(place) {
  if (!place) return null;
  if (place.id) return String(place.id);
  if (place.osm_id) return `osm_${String(place.osm_id)}`;
  // fallback to lat/lon rounded to avoid tiny float mismatches
  if (isFinite(place.lat) && isFinite(place.lon)) return `lat:${place.lat.toFixed(6)}|lon:${place.lon.toFixed(6)}`;
  return `${String(place.name || 'unnamed')}_${Math.random().toString(36).slice(2,8)}`;
}

// Deduplicate an array of places preserving order using getPlaceKey
function dedupePlacesByKey(list) {
  const seen = new Set();
  const out = [];
  for (const p of (list || [])) {
    const k = getPlaceKey(p);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// Buffer (in meters) from route polyline within which POIs are considered "on the route"
const ROUTE_POI_BUFFER_METERS = 1000; // default 1 km, adjust as needed

// Filter grouped POIs to only those within bufferMeters of the current route geometry
function filterGroupedByRoute(grouped, bufferMeters = ROUTE_POI_BUFFER_METERS) {
  const out = {};
  if (!grouped) return out;
  let coords = (currentRouteGeometry && currentRouteGeometry.coordinates) || null;
  // If no route geometry, return empty groups (we only want POIs near the route)
  if (!coords || !Array.isArray(coords) || coords.length < 2) {
    Object.keys(grouped).forEach(k => out[k] = []);
    return out;
  }
  // Normalize coordinates to [lon, lat] order if needed. Some providers return [lat,lon].
  function normalizeLineCoords(lineCoords) {
    if (!Array.isArray(lineCoords) || !lineCoords.length) return lineCoords;
    // If the second element in coordinates has an absolute value > 90, it's likely a longitude -> swap
    const maxSecond = Math.max(...lineCoords.map(c => Math.abs(c[1] || 0)));
    if (maxSecond > 90) {
      return lineCoords.map(c => {
        // if c is [lat, lon] -> return [lon, lat]
        return [c[1], c[0]];
      });
    }
    return lineCoords;
  }
  coords = normalizeLineCoords(coords);
  Object.keys(grouped).forEach(k => {
    const list = grouped[k] || [];
    const deduped = dedupePlacesByKey(list);
    const filtered = deduped.filter(p => {
      if (!p || !isFinite(p.lat) || !isFinite(p.lon)) return false;
      try {
        const d = distancePointToPolylineMeters(p.lat, p.lon, coords);
        return d <= bufferMeters;
      } catch (e) { return false; }
    });
    out[k] = filtered;
  });
  return out;
}

// Global popup management
let currentOpenPopup = null;
let hoverTimeout = null;
let lastHoveredMarker = null;

// Function to close all open popups
function closeAllPopups() {
  if (currentOpenPopup) {
    try {
      currentOpenPopup.closePopup();
    } catch (_) {}
    currentOpenPopup = null;
  }
}

// Function to close popup after delay (for hover interactions)
function closePopupAfterDelay(popup, delay = 1500) {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
  }
  hoverTimeout = setTimeout(() => {
    if (popup && popup.isOpen() && popup !== currentOpenPopup) {
      popup.closePopup();
    }
  }, delay);
}

// Function to handle popup open event
function onPopupOpen(popup) {
  closeAllPopups();
  currentOpenPopup = popup;
}

// Function to handle popup close event
function onPopupClose() {
  if (currentOpenPopup) {
    currentOpenPopup = null;
  }
}

// Function to create enhanced popup with hover support
function createEnhancedPopup(marker, content, categoryKey) {
  const popup = L.popup({
    className: 'enhanced-popup',
    maxWidth: 300,
    closeButton: true,
    autoClose: false,
    closeOnClick: false
  }).setContent(content);
  
  // Bind popup to marker
  marker.bindPopup(popup);
  
  // Handle popup events
  marker.on('popupopen', () => onPopupOpen(popup));
  marker.on('popupclose', () => onPopupClose(popup));
  
  // Add hover interactions
  marker.on('mouseover', () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    if (!popup.isOpen()) {
      popup.openPopup();
    }
  });
  
  marker.on('mouseout', () => {
    closePopupAfterDelay(popup, 800);
  });
  
  // Click to keep popup open
  marker.on('click', () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
    }
    if (!popup.isOpen()) {
      popup.openPopup();
    }
  });
  
  return popup;
}

// Helper: build a category-specific Leaflet DivIcon
function buildTouristDivIcon(categoryKey) {
  const cat = TOURIST_CATEGORIES[categoryKey] || { emoji: '📍', color: '#2e7d32' };
  // Use CSS classes for consistent styling and allow hover effects
  const html = `<div class="tourist-marker-circle" style="border-color:${cat.color};"><div class="tourist-marker-emoji">${escapeHtml(cat.emoji)}</div></div>`;
  return L.divIcon({
    className: 'tourist-marker',
    html,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

// Helper: build endpoint div icon for source/destination
function buildEndpointIcon(type) {
  const cls = type === 'start' ? 'start' : 'end';
  const emoji = type === 'start' ? '🏁' : '📍';
  const html = `<div class="endpoint-pin ${cls}">${emoji}</div>`;
  return L.divIcon({ html, className: 'endpoint-icon', iconSize: [28, 28], iconAnchor: [14, 28] });
}

// ==== TomTom Helpers (added) ====
function getTomTomKeyPair() {
  return [TOMTOM_CONFIG.PRIMARY_KEY, TOMTOM_CONFIG.SECONDARY_KEY].filter(Boolean);
}

async function tomtomGeocode(query, key) {
  const center = map && typeof map.getCenter === 'function' ? map.getCenter() : null;
  const params = new URLSearchParams({
    query,
    key: key || '',
  });
  if (center) {
    params.set('lat', center.lat);
    params.set('lon', center.lng);
  }
  const res = await fetchWithTimeout(`http://localhost:5000/proxy/tomtom/search?${params.toString()}`, {}, 15000);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !Array.isArray(data.results) || data.results.length === 0) return null;
  const pos = data.results[0] && data.results[0].position;
  if (!pos || !isFinite(pos.lat) || !isFinite(pos.lon)) return null;
  return [pos.lat, pos.lon];
}

// Try TomTom first, fall back to existing geocode()
async function enhancedGeocode(location) {
  const trimmed = (location || '').trim();
  if (!trimmed) return null;
  try {
    const [primary, secondary] = getTomTomKeyPair();
    if (primary) {
      try {
        const c1 = await tomtomGeocode(trimmed, primary);
        if (c1) { lastGeocodeProvider = 'tomtom'; return c1; }
      } catch (e) { console.warn('TomTom geocode primary failed', e); }
    }
    if (secondary) {
      try {
        const c2 = await tomtomGeocode(trimmed, secondary);
        if (c2) { lastGeocodeProvider = 'tomtom'; return c2; }
      } catch (e) { console.warn('TomTom geocode secondary failed', e); }
    }
  } catch (_) {}
  // Fallback to existing pipeline
  const fallback = await geocode(location);
  if (fallback) { lastGeocodeProvider = 'osm'; }
  return fallback;
}

// Sample a few points along route to limit TomTom requests
function sampleRoutePoints(routeGeometry, maxSamples = 6) {
  const coords = (routeGeometry && routeGeometry.coordinates) || [];
  if (coords.length === 0) return [];
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const out = [];
  for (let i = 0; i < coords.length && out.length < maxSamples; i += step) {
    const [lon, lat] = coords[i];
    out.push({ lat, lon });
  }
  // ensure last point included
  if (out.length && (out[out.length - 1].lat !== coords[coords.length - 1][1] || out[out.length - 1].lon !== coords[coords.length - 1][0])) {
    const [lon, lat] = coords[coords.length - 1];
    out.push({ lat, lon });
  }
  return out;
}

function normalizeTomTomResultToPlace(result, categoryKey) {
  const name = (result && result.poi && result.poi.name) || 'Unnamed';
  const pos = result && result.position ? result.position : null;
  const lat = pos ? pos.lat : null;
  const lon = pos ? pos.lon : null;
  const phone = (result && result.poi && result.poi.phone) || (result && result.poi && result.poi.phoneNumber);
  const url = (result && result.poi && result.poi.url) || (result && result.poi && result.poi.website);
  const address = (result && result.address && (result.address.freeformAddress || result.address.streetName)) || '';
  const id = (result && (result.id || (name + '_' + (lat || '') + '_' + (lon || '')))) || Math.random().toString(36).slice(2);
  return {
    id: `tomtom/${id}`,
    lat,
    lon,
    name,
    tags: {
      source: 'tomtom',
      phone: phone || undefined,
      website: url || undefined,
      addr_full: address || undefined,
      opening_hours: undefined
    },
    category: categoryKey
  };
}

async function fetchTomTomCategoryNear(lat, lon, categoryKey, key) {
  const categoryQuery = TOMTOM_CATEGORY_MAP[categoryKey];
  if (!categoryQuery) return [];
  const params = new URLSearchParams({
    category: categoryQuery,
    lat: lat,
    lon: lon,
    key: key || '',
    radius: '1000',
    limit: '10'
  });
  try {
    const res = await fetchWithTimeout(`http://localhost:5000/proxy/tomtom/category?${params.toString()}`, {}, 15000);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.results)) return [];
    return data.results.map(r => normalizeTomTomResultToPlace(r, categoryKey)).filter(p => isFinite(p.lat) && isFinite(p.lon));
  } catch (e) {
    return [];
  }
}

async function fetchTomTomPOIs(routeGeometry, vehicleType, existingGrouped, fastOnly = false) {
  const points = sampleRoutePoints(routeGeometry, 8); // sample more points along route (was 4)
  if (!points.length) return { grouped: {}, flat: [], enhanced: false };
  const [primary, secondary] = getTomTomKeyPair();
  const keyToUse = primary || secondary;
  if (!keyToUse) return { grouped: {}, flat: [], enhanced: false };

  // Limit categories to avoid hitting daily limits; skip categories already saturated from OSM
  const tomMap = (typeof TOMTOM_CATEGORY_MAP === 'object' && TOMTOM_CATEGORY_MAP) ? TOMTOM_CATEGORY_MAP : {};
  let categoryKeys = Object.keys(tomMap).length ? Object.keys(tomMap) : Object.keys(TOURIST_CATEGORIES);
  categoryKeys = categoryKeys.filter(key => {
    const arr = existingGrouped && existingGrouped[key];
    return !arr || arr.length < 5; // Reduce from 15 to 5
  });
  if (fastOnly) {
    // In fast mode, only include a few high-value categories
    const preferred = ['ev','fuel','restaurants','hotels','parks','museums'];
    categoryKeys = preferred.filter(c => categoryKeys.includes(c));
  }

  // If EV, ensure we include charging stations first
  const orderedCats = vehicleType === 'electric'
    ? ['ev', ...categoryKeys.filter(k => k !== 'ev')]
    : categoryKeys;

  const aggregate = [];
  let anySuccess = false;
  for (const p of points) {
    for (const cat of orderedCats) {
      if (fastOnly && aggregate.length > 60) break; // smaller cap in fast mode
      if (!fastOnly && aggregate.length > 200) break; // Reduce soft cap from 500 to 200 for faster processing
      try {
        const items = await fetchTomTomCategoryNear(p.lat, p.lon, cat, keyToUse);
        if (items && items.length) { anySuccess = true; aggregate.push(...items); }
      } catch (_) {}
    }
  }
  const deduped = dedupeByLocation(aggregate);

  // group by categoryKey in our structure and respect per-category cap
  const grouped = {};
  for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
  for (const place of deduped) {
    const key = place.category;
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 5) grouped[key].push(place); // Reduce from 15 to 5
  }
  const flat = Object.values(grouped).flat();
  return { grouped, flat, enhanced: anySuccess };
}

// ==== Traffic & Weather Autodetect and Fetch (added) ====
async function tryTomTomTrafficKey(key) {
  try {
    const testUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=12.9716,77.5946&key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(testUrl, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.flowSegmentData);
  } catch (_) { return false; }
}

async function tryOpenWeatherKey(key) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=12.9716&lon=77.5946&appid=${encodeURIComponent(key)}&units=metric`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.main && typeof data.main.temp === 'number');
  } catch (_) { return false; }
}

async function tryTomorrowKey(key) {
  try {
    const url = `https://api.tomorrow.io/v4/weather/realtime?location=12.9716,77.5946&units=metric&apikey=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.data && data.data.values && typeof data.data.values.temperature === 'number');
  } catch (_) { return false; }
}

async function tryWeatherbitKey(key) {
  try {
    const url = `https://api.weatherbit.io/v2.0/current?lat=12.9716&lon=77.5946&key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.data && Array.isArray(data.data) && data.data.length > 0 && typeof data.data[0].temp === 'number');
  } catch (_) { return false; }
}

async function ensureApiKeyRoles() {
  if (apiRoleDetectionRan) return;
  apiRoleDetectionRan = true;
  const keys = getTomTomKeyPair();
  const k1 = keys[0] || null;
  const k2 = keys[1] || null;
  // Use server proxy for traffic. If we have any configured key, set TRAFFIC_KEY to the first one.
  // The server proxy will use the configured TomTom key on the backend.
  if (k1) {
    TRAFFIC_KEY = k1;
    console.debug('Traffic enabled with primary TomTom key (using server proxy)');
  } else if (k2) {
    TRAFFIC_KEY = k2;
    console.debug('Traffic enabled with secondary TomTom key (using server proxy)');
  } else {
    TRAFFIC_KEY = null;
    console.warn('No TomTom key configured. Traffic features will be disabled.');
  }

  // Detect weather provider for the remaining key
  const candidates = [k1, k2].filter(k => k && k !== TRAFFIC_KEY);
  // Allow traffic key to double as weather key if needed
  if (TRAFFIC_KEY) candidates.push(TRAFFIC_KEY);
  for (const key of candidates) {
    if (await tryOpenWeatherKey(key)) { WEATHER_PROVIDER = 'openweather'; WEATHER_KEY = key; break; }
    if (await tryTomorrowKey(key)) { WEATHER_PROVIDER = 'tomorrow'; WEATHER_KEY = key; break; }
    if (await tryWeatherbitKey(key)) { WEATHER_PROVIDER = 'weatherbit'; WEATHER_KEY = key; break; }
  }
  if (!WEATHER_PROVIDER || WEATHER_PROVIDER === 'unknown') {
    WEATHER_PROVIDER = 'none'; WEATHER_KEY = null;
  }
}

async function fetchTrafficSummary(routeGeometry) {
  try {
    // Prefer server proxy if available (avoids client-side key issues/CORS)
    const useProxy = true; // always try proxy first
    const points = sampleRoutePoints(routeGeometry, 3);
    if (!points.length) return null;
    let totalSpeed = 0, totalFree = 0, count = 0;
    for (const p of points) {
      let data = null;
      if (useProxy) {
        try {
          const proxyUrl = `http://localhost:5000/proxy/tomtom/traffic?lat=${encodeURIComponent(p.lat)}&lon=${encodeURIComponent(p.lon)}`;
          const res = await fetchWithTimeout(proxyUrl, {}, 8000);
          if (res && res.ok) data = await res.json();
        } catch (e) { data = null; }
      }
      // fallback: direct TomTom call if TRAFFIC_KEY present
      if (!data && TRAFFIC_KEY) {
        try {
          const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${p.lat},${p.lon}&key=${encodeURIComponent(TRAFFIC_KEY)}`;
          const res2 = await fetchWithTimeout(url, {}, 8000);
          if (res2 && res2.ok) data = await res2.json();
        } catch (e) { data = null; }
      }
      if (!data) continue;
      const seg = data && data.flowSegmentData;
      if (seg && typeof seg.currentSpeed === 'number' && typeof seg.freeFlowSpeed === 'number') {
        totalSpeed += seg.currentSpeed;
        totalFree += seg.freeFlowSpeed;
        count++;
      }
    }
    if (!count) return null;
    const avgSpeed = totalSpeed / count;
    const avgFree = totalFree / count;
    const congestion = avgFree > 0 ? Math.max(0, Math.min(1, 1 - (avgSpeed / avgFree))) : 0;
    return { avgSpeed: Math.round(avgSpeed), avgFree: Math.round(avgFree), congestion }; // congestion 0..1
  } catch (_) { return null; }
}

async function fetchWeather(lat, lon) {
  if (!WEATHER_KEY || WEATHER_PROVIDER === 'none') return null;
  try {
    if (WEATHER_PROVIDER === 'openweather') {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(WEATHER_KEY)}&units=metric`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) return null;
      const d = await res.json();
      const w = (d.weather && d.weather[0]) || {};
      return {
        tempC: d.main && d.main.temp,
        description: w.description || 'Weather',
        windKph: d.wind && typeof d.wind.speed === 'number' ? Math.round(d.wind.speed * 3.6) : undefined,
        precipMm: d.rain && (d.rain['1h'] || d.rain['3h'])
      };
    }
    if (WEATHER_PROVIDER === 'tomorrow') {
      const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&units=metric&apikey=${encodeURIComponent(WEATHER_KEY)}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) return null;
      const d = await res.json();
      const v = d && d.data && d.data.values || {};
      return {
        tempC: v.temperature,
        description: typeof v.weatherCode === 'number' ? `Code ${v.weatherCode}` : 'Weather',
        windKph: typeof v.windSpeed === 'number' ? Math.round(v.windSpeed) : undefined,
        precipMm: typeof v.precipitationIntensity === 'number' ? v.precipitationIntensity : undefined
      };
    }
    if (WEATHER_PROVIDER === 'weatherbit') {
      const url = `https://api.weatherbit.io/v2.0/current?lat=${lat}&lon=${lon}&key=${encodeURIComponent(WEATHER_KEY)}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (!res.ok) return null;
      const d = await res.json();
      const w = d && d.data && d.data[0] || {};
      return {
        tempC: w.temp,
        description: w.weather && w.weather.description,
        windKph: w.wind_spd ? Math.round(w.wind_spd * 3.6) : undefined,
        precipMm: w.precip
      };
    }
  } catch (_) { return null; }
  return null;
}

async function fetchWeatherAlongRoute(routeGeometry) {
  try {
    const pts = sampleRoutePoints(routeGeometry, 3);
    const out = [];
    for (const p of pts) {
      const w = await fetchWeather(p.lat, p.lon);
      if (w) out.push({ lat: p.lat, lon: p.lon, ...w });
    }
    return out;
  } catch (_) { return []; }
}

function addTrafficTileOverlays() {
  try {
    // If no traffic key or map, nothing to add
    if (!TRAFFIC_KEY || !map) return;
    // Remove previous
    for (const l of trafficTileLayers) { try { map.removeLayer(l); } catch(_){} }
    trafficTileLayers = [];
    // NOTE: Some TomTom traffic tile endpoints return 400/403 when the key is invalid or quota exceeded.
    // To avoid flooding the client network tab with tile errors we no longer add TomTom traffic tile layers by default.
    // Instead we rely on per-segment flow queries via the server proxy (used by colorizeRouteByTraffic).
    // If tile overlays are essential, set ALLOW_TOMTOM_TILES = true at the top of this file.
    if (typeof ALLOW_TOMTOM_TILES !== 'undefined' && ALLOW_TOMTOM_TILES && TRAFFIC_KEY) {
      try {
        const flow = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(TRAFFIC_KEY)}`, { opacity: 0.65 });
        const incidents = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/incidents/{z}/{x}/{y}.png?key=${encodeURIComponent(TRAFFIC_KEY)}`, { opacity: 0.8 });
        flow.addTo(map); incidents.addTo(map);
        trafficTileLayers.push(flow, incidents);
        // Do NOT push tile layers into `routeLayers` — they are overlays, not routes.
      } catch (_) {}
    }
  } catch (_) {}
}

// Live traffic UI state
let liveTrafficEnabled = false;
let trafficSuggestionBanner = null;

function enableLiveTraffic() {
  if (!map) return;
  liveTrafficEnabled = true;
  try { addTrafficTileOverlays(); } catch (e) { console.warn('Failed to add traffic tiles', e); }
  // Colorize route segments for all displayed routes if present
  try {
    if (routeLayers && routeLayers.length > 0) {
      // Clear any previously colored layers tracking
      try { coloredRouteLayers.forEach(l => { try { map.removeLayer(l); } catch(_){} }); } catch(_){}
      coloredRouteLayers = [];
      // For each top-level route layer, attempt to colorize based on its geometry
      for (const rl of routeLayers.slice()) {
        try {
          // attempt to extract GeoJSON geometry from the layer
          const geomFeature = (typeof rl.toGeoJSON === 'function') ? rl.toGeoJSON() : null;
          if (geomFeature && geomFeature.geometry) {
            // colorize and replace this route layer with segmented version
            colorizeRouteByTraffic(geomFeature.geometry, rl);
          }
        } catch (e) { console.debug('colorize route for layer failed', e); }
      }
    } else if (currentRouteGeometry) {
      // fallback: colorize cached primary route
      colorizeRouteByTraffic(currentRouteGeometry, routeLayers && routeLayers[0]);
    }
  } catch (e) { console.warn('Colorize route failed', e); }
  // Periodically refresh: every 45 seconds update tiles and recolor route
  try { window.liveTrafficInterval = setInterval(() => {
    try {
      // re-add overlays to force tile refresh
      addTrafficTileOverlays();
      if (routeLayers && routeLayers.length > 0) {
        // refresh colorization for all layers
        coloredRouteLayers.forEach(l => { try { map.removeLayer(l); } catch(_){} });
        coloredRouteLayers = [];
        for (const rl of routeLayers.slice()) {
          try {
            const geomFeature = (typeof rl.toGeoJSON === 'function') ? rl.toGeoJSON() : null;
            if (geomFeature && geomFeature.geometry) colorizeRouteByTraffic(geomFeature.geometry, rl);
          } catch (e) { console.debug('refresh colorize error', e); }
        }
      } else if (currentRouteGeometry) {
        colorizeRouteByTraffic(currentRouteGeometry, routeLayers && routeLayers[0]);
      }
      checkAndSuggestReroute();
    } catch (e) { console.debug('Live traffic refresh failed', e); }
  }, 45000); } catch (_) {}
}

function disableLiveTraffic() {
  liveTrafficEnabled = false;
  try { if (window.liveTrafficInterval) { clearInterval(window.liveTrafficInterval); window.liveTrafficInterval = null; } } catch(_) {}
  // Remove traffic tile overlays ONLY - don't delete original routes!
  try { for (const l of trafficTileLayers) { try { map.removeLayer(l); } catch(_){} } trafficTileLayers = []; } catch(_) {}
  // Remove colored traffic segments ONLY (original route layers stay)
  try { for (const l of coloredRouteLayers) { try { map.removeLayer(l); } catch(_){} } coloredRouteLayers = []; } catch(_) {}
  // Restore original route styling if they exist
  if (routeLayers && routeLayers.length > 0) {
    const routeColors = ['#16a34a', '#e63946', '#457b9d', '#f4a261', '#2a9d8f'];
    routeLayers.forEach((layer, idx) => {
      if (layer && typeof layer.setStyle === 'function') {
        const color = routeColors[idx % routeColors.length];
        const weight = idx === 0 ? 6 : 4;
        const opacity = idx === 0 ? 0.85 : 0.6;
        layer.setStyle({ color, weight, opacity, dashArray: idx === 0 ? null : "5,8" });
      }
    });
  }
}

// Small banner UI for reroute suggestion
function showTrafficSuggestion(message, onAccept) {
  try {
    if (!trafficSuggestionBanner) {
      trafficSuggestionBanner = document.createElement('div');
      trafficSuggestionBanner.id = 'traffic-suggestion-banner';
      trafficSuggestionBanner.style.position = 'absolute';
      trafficSuggestionBanner.style.top = '12px';
      trafficSuggestionBanner.style.left = '50%';
      trafficSuggestionBanner.style.transform = 'translateX(-50%)';
      trafficSuggestionBanner.style.zIndex = 9999;
      trafficSuggestionBanner.style.background = '#111827cc';
      trafficSuggestionBanner.style.color = '#fff';
      trafficSuggestionBanner.style.padding = '10px 12px';
      trafficSuggestionBanner.style.borderRadius = '8px';
      trafficSuggestionBanner.style.display = 'flex';
      trafficSuggestionBanner.style.gap = '8px';
      trafficSuggestionBanner.style.alignItems = 'center';
      document.body.appendChild(trafficSuggestionBanner);
    }
    trafficSuggestionBanner.innerHTML = `<div style="font-weight:700;margin-right:8px">Traffic</div><div style="flex:1">${escapeHtml(message)}</div><button id=\"traffic-suggestion-accept\" style=\"background:#10b981;color:#fff;border:none;padding:6px 8px;border-radius:6px;cursor:pointer\">Switch</button><button id=\"traffic-suggestion-dismiss\" style=\"background:transparent;color:#fff;border:1px solid #fff;padding:6px 8px;border-radius:6px;cursor:pointer\">Dismiss</button>`;
    document.getElementById('traffic-suggestion-accept').onclick = () => { try { onAccept && onAccept(); } catch(_){} hideTrafficSuggestion(); };
    document.getElementById('traffic-suggestion-dismiss').onclick = () => { hideTrafficSuggestion(); };
  } catch (e) { console.debug('Show suggestion failed', e); }
}

function hideTrafficSuggestion() { try { if (trafficSuggestionBanner) { trafficSuggestionBanner.remove(); trafficSuggestionBanner = null; } } catch(_){}
}

// Check congestion and suggest reroute if needed
async function checkAndSuggestReroute() {
  try {
    if (!currentRouteGeometry || !TRAFFIC_KEY) return;
    const summary = await fetchTrafficSummary(currentRouteGeometry);
    if (!summary || typeof summary.congestion !== 'number') return;
    // congestions 0..1, suggest reroute if > 0.5 (configurable)
    const threshold = 0.55;
    if (summary.congestion > threshold) {
      const minutesLost = Math.round(((summary.avgFree || 60) - (summary.avgSpeed || 40)) / (summary.avgFree || 60) * (currentRouteMeta?.durationMs || 3600000) / 60000);
      showTrafficSuggestion(`Heavy congestion ahead — estimated delay ~${minutesLost} min. Switch to an alternate route?`, () => {
        // reroute: call existing findRoute with a reroute flag or run alternative route computation
        try { if (typeof findRoute === 'function') { findRoute(); } } catch (e) { console.error('Failed to run reroute', e); }
      });
    }
  } catch (e) { console.debug('checkAndSuggestReroute error', e); }
}

function buildTrafficWeatherSnippet(trafficSummary, weatherPoints) {
  let html = '';
  if (trafficSummary) {
    const t = getTrafficSeverity(trafficSummary.congestion);
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${t.color};margin-right:6px;vertical-align:middle;"></span>`;
    html += `<div style="margin-top:6px;">${dot}<strong>Traffic:</strong> ${t.level} (avg ${trafficSummary.avgSpeed} km/h vs free ${trafficSummary.avgFree} km/h)</div>`;
  }
  if (weatherPoints && weatherPoints.length) {
    const w = weatherPoints[0];
    const parts = [];
    const ws = getWeatherSeverity(w);
    const dotW = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ws.color};margin-right:6px;vertical-align:middle;"></span>`;
    if (typeof w.tempC === 'number') parts.push(`${Math.round(w.tempC)}°C`);
    if (w.description) parts.push(w.description);
    if (typeof w.windKph === 'number') parts.push(`wind ${w.windKph} km/h`);
    if (typeof w.precipMm === 'number') parts.push(`${w.precipMm} mm`);
    html += `<div style="margin-top:4px;">${dotW}<strong>Weather:</strong> ${ws.level}${parts.length ? ` — ${parts.join(', ')}` : ''}${WEATHER_PROVIDER && WEATHER_PROVIDER !== 'none' ? ` <small>(${WEATHER_PROVIDER})</small>` : ''}</div>`;
  }
  return html;
}

// Severity helpers for coloring
function getTrafficSeverity(congestion) {
  // congestion 0..1
  if (typeof congestion !== 'number') return { level: 'Unknown', color: '#9CA3AF' };
  if (congestion > 0.66) return { level: 'Heavy', color: '#dc2626' }; // red
  if (congestion > 0.33) return { level: 'Moderate', color: '#f59e0b' }; // yellow
  return { level: 'Light', color: '#16a34a' }; // green
}

function getWeatherSeverity(w) {
  const temp = typeof w.tempC === 'number' ? w.tempC : null;
  const wind = typeof w.windKph === 'number' ? w.windKph : 0;
  const precip = typeof w.precipMm === 'number' ? w.precipMm : 0;
  // Simple heuristic thresholds
  const extremeTemp = (temp !== null) && (temp >= 38 || temp <= 10);
  if (precip >= 5 || wind >= 40 || extremeTemp) return { level: 'Severe', color: '#dc2626' };
  if (precip >= 1 || wind >= 20 || (temp !== null && (temp >= 33 || temp <= 15))) return { level: 'Mild', color: '#f59e0b' };
  return { level: 'Good', color: '#16a34a' };
}

// ==== Wikipedia image helpers (no API key needed) ====
async function fetchWikipediaThumbByTitle(title) {
  try {
    if (!title || title.toLowerCase() === 'unnamed') return null;
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=300&titles=${encodeURIComponent(title)}`;
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    if (!pages) return null;
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      if (p && p.thumbnail && p.thumbnail.source) return p.thumbnail.source;
    }
    return null;
  } catch (_) { return null; }
}

async function fetchWikipediaThumbByGeo(lat, lon, radius = 600) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages|coordinates&piprop=thumbnail&pithumbsize=300&generator=geosearch&ggscoord=${lat}|${lon}&ggsradius=${radius}&ggslimit=8`;
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    if (!pages) return null;
    const vals = Object.values(pages);
    const withThumb = vals.find(v => v && v.thumbnail && v.thumbnail.source);
    return withThumb ? withThumb.thumbnail.source : null;
  } catch (_) { return null; }
}

async function fetchPlaceImage(place) {
  try {
    const cacheKey = `${place.name || 'Unnamed'}_${place.lat?.toFixed(4)}_${place.lon?.toFixed(4)}`;
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
    // 1) If OSM tags include direct image URL
    const t = place.tags || {};
    const direct = t.image || t['image:0'] || t['wikimedia_commons'];
    if (direct && typeof direct === 'string' && direct.startsWith('http')) {
      imageCache.set(cacheKey, direct);
      return direct;
    }
    // 2) Try Wikipedia by title
    let img = await fetchWikipediaThumbByTitle(place.name);
    if (!img) {
      // 3) Try geo-based search near the place
      img = await fetchWikipediaThumbByGeo(place.lat, place.lon, 700);
    }
    if (img) imageCache.set(cacheKey, img);
    return img || null;
  } catch (_) { return null; }
}

function buildPlacePopupHtml(cat, name, details, osmUrl, lat, lon, imgUrl) {
  return `
    <div class="tourist-popup">
      <div class="popup-head" style="border-bottom-color:${cat ? cat.color : '#2e7d32'};">
        <span class="emoji">${cat ? cat.emoji : '&#xf3c5'}</span>
        <strong>${name}</strong>
      </div>
      <div class="popup-body">
        <div class="popup-cat" style="background:${cat ? cat.color : '#2e7d32'}22; color:${cat ? cat.color : '#2e7d32'}">${cat ? cat.label : 'Place'}</div>
        ${imgUrl ? `<div style="margin:6px 0 8px 0;"><img src="${imgUrl}" alt="${name}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;" loading="lazy" /></div>` : ''}
        ${details.length ? `<div class="popup-details">${details.join('<br>')}</div>` : ''}
      </div>
      <div class="popup-actions">
        <button type="button" class="dir-btn" onclick="focusPlace(${lat}, ${lon})">Show Here</button>
        <a class="osm-link" href="${osmUrl}" target="_blank">OSM</a>
      </div>
    </div>
  `;
}

// Build colorized route segments based on TomTom flow along the route
function sampleRoutePointsWithIndex(routeGeometry, maxSamples = 24) {
  const coords = (routeGeometry && routeGeometry.coordinates) || [];
  if (coords.length === 0) return [];
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const out = [];
  for (let i = 0; i < coords.length; i += step) {
    const [lon, lat] = coords[i];
    out.push({ lat, lon, index: i });
  }
  if (out[out.length - 1]?.index !== coords.length - 1) {
    const [lon, lat] = coords[coords.length - 1];
    out.push({ lat, lon, index: coords.length - 1 });
  }
  return out;
}

async function fetchTrafficSeverityForPoint(lat, lon) {
  try {
    // Try server proxy first to avoid client-side key/CORS issues
    let data = null;
    try {
      const proxyUrl = `http://localhost:5000/proxy/tomtom/traffic?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const res = await fetchWithTimeout(proxyUrl, {}, 6000);
      if (res && res.ok) data = await res.json();
    } catch (_) { data = null; }

    // Fallback to direct TomTom call if proxy failed and TRAFFIC_KEY exists
    if (!data && TRAFFIC_KEY) {
      try {
        const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${lat},${lon}&key=${encodeURIComponent(TRAFFIC_KEY)}`;
        const res2 = await fetchWithTimeout(url, {}, 6000);
        if (res2 && res2.ok) data = await res2.json();
      } catch (_) { data = null; }
    }

    const seg = data && data.flowSegmentData;
    if (!seg || typeof seg.currentSpeed !== 'number' || typeof seg.freeFlowSpeed !== 'number') return null;
    const congestion = seg.freeFlowSpeed > 0 ? Math.max(0, Math.min(1, 1 - (seg.currentSpeed / seg.freeFlowSpeed))) : 0;
    return getTrafficSeverity(congestion);
  } catch (e) {
    console.debug('fetchTrafficSeverityForPoint error', e);
    return null;
  }
}

async function colorizeRouteByTraffic(routeGeometry, mainLayerToReplace) {
  try {
    if (!map || !routeGeometry || !routeGeometry.coordinates || routeGeometry.coordinates.length < 2) return;

    // Build segment layers off-map first so we don't remove the main route until successful
    const samples = sampleRoutePointsWithIndex(routeGeometry, 24);
    const tempGroup = L.layerGroup();
    let addedCount = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const b = samples[i + 1];
      const midLat = (a.lat + b.lat) / 2;
      const midLon = (a.lon + b.lon) / 2;
      let sev = await fetchTrafficSeverityForPoint(midLat, midLon);
      if (!sev) sev = { color: '#16a34a' }; // default green
      const segCoords = routeGeometry.coordinates.slice(a.index, b.index + 1).map(([lon, lat]) => [lat, lon]);
      if (segCoords.length < 2) continue;
      try {
        const segLayer = L.polyline(segCoords, { color: sev.color, weight: 6, opacity: 0.95 });
        tempGroup.addLayer(segLayer);
        addedCount++;
      } catch (e) {
        console.debug('Failed to create segLayer', e);
      }
    }

    // Only swap layers if we actually built segments
    if (addedCount > 0) {
      try { if (mainLayerToReplace) { map.removeLayer(mainLayerToReplace); } } catch(_) {}
      tempGroup.addTo(map);
      // Push each child layer into coloredRouteLayers so they are tracked for cleanup
      tempGroup.eachLayer(l => { try { coloredRouteLayers.push(l); } catch(_){} });
    } else {
      console.debug('colorizeRouteByTraffic: no segments created, keeping main route');
    }
  } catch (e) { console.debug('colorizeRouteByTraffic error', e); }
}

// Helper: compute bbox with small buffer from route geometry
function computeBufferedBbox(routeGeometry, bufferDeg = 0.03) { // Reduce from 0.05 to 0.03
  const coords = routeGeometry.coordinates;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  coords.forEach(([lon, lat]) => {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  });
  return {
    south: minLat - bufferDeg,
    west: minLon - bufferDeg,
    north: maxLat + bufferDeg,
    east: maxLon + bufferDeg
  };
}

// Helper: convert lat/lon to Web Mercator meters for distance calcs
function latLonToMeters(lat, lon) {
  const x = lon * 20037508.34 / 180.0;
  let y = Math.log(Math.tan((90 + lat) * Math.PI / 360.0)) / (Math.PI / 180.0);
  y = y * 20037508.34 / 180.0;
  return { x, y };
}

// Helper: distance from a point (lat,lon) to a polyline (list of [lon,lat]) in meters
function distancePointToPolylineMeters(pointLat, pointLon, lineCoordinates) {
  const p = latLonToMeters(pointLat, pointLon);
  let minDist = Infinity;
  for (let i = 1; i < lineCoordinates.length; i++) {
    const [lon1, lat1] = lineCoordinates[i - 1];
    const [lon2, lat2] = lineCoordinates[i];
    const a = latLonToMeters(lat1, lon1);
    const b = latLonToMeters(lat2, lon2);
    const abx = b.x - a.x; const aby = b.y - a.y;
    const apx = p.x - a.x; const apy = p.y - a.y;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 === 0 ? 0 : ((apx * abx + apy * aby) / ab2);
    t = Math.max(0, Math.min(1, t));
    const projx = a.x + t * abx;
    const projy = a.y + t * aby;
    const dx = p.x - projx; const dy = p.y - projy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

// Normalize and return route coordinates as [lon, lat] array from different geometry shapes
function getRouteCoords(routeGeometry) {
  if (!routeGeometry) return null;
  let coords = null;
  if (Array.isArray(routeGeometry)) coords = routeGeometry; // direct array
  else if (Array.isArray(routeGeometry.coordinates)) coords = routeGeometry.coordinates;
  else if (routeGeometry.points && Array.isArray(routeGeometry.points.coordinates)) coords = routeGeometry.points.coordinates;
  if (!coords || !coords.length) return null;
  // If coords look like [lat,lon], detect and swap: if any second value > 90 -> likely longitude
  const maxSecond = Math.max(...coords.map(c => Math.abs(c[1] || 0)));
  if (maxSecond > 90) {
    return coords.map(c => [c[1], c[0]]);
  }
  return coords;
}

// Helper: deduplicate by approximate location
function dedupeByLocation(places) {
  const seen = new Set();
  const result = [];
  for (const place of places) {
    if (!place.lat || !place.lon) continue;
    const key = `${place.lat.toFixed(5)}_${place.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(place);
  }
  return result;
}

// --- Simple incidents overlay and reporting (client-side demo) ---
function ensureIncidentsInitialized() {
  try {
    if (!window.liveIncidents) window.liveIncidents = [];
    if (!window.incidentsLayer) window.incidentsLayer = L.layerGroup().addTo(map);
    // Initialization only: do not call renderIncidents()
    // Calling renderIncidents() here caused mutual recursion because
    // renderIncidents() also called ensureIncidentsInitialized(),
    // leading to repeated automatic marking and potential stack overflows.
  } catch (e) { console.debug('ensureIncidentsInitialized error', e); }
}

function reportIncident(type = 'accident', opts = {}) {
  try {
    ensureIncidentsInitialized();
    const lat = opts.lat || (map && map.getCenter && map.getCenter().lat) || 0;
    const lon = opts.lon || (map && map.getCenter && map.getCenter().lng) || 0;
    const severity = opts.severity || 2;
    const note = opts.note || '';
    const incident = { id: Date.now() + Math.floor(Math.random()*1000), type, lat, lon, severity, note, ts: Date.now(), expired: false };
    window.liveIncidents.push(incident);
    renderIncidents();
    // add a short-lived highlight on the map and show an auto-hiding toast for user feedback
    try {
      if (map && map.panTo) map.panTo([lat, lon]);
      // highlight circle that auto-removes after 5s
      if (typeof L !== 'undefined' && map) {
        const highlight = L.circle([lat, lon], { radius: 60, color: '#ff6b35', weight: 3, opacity: 0.95, fill: false }).addTo(map);
        setTimeout(() => { try { map.removeLayer(highlight); } catch(_) {} }, 5000);
      }
      // toast UI
      try {
        const existing = document.getElementById('vr-incident-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'vr-incident-toast';
        toast.className = 'incident-toast';
        const safeNote = note ? ('' + note).replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
        toast.innerHTML = `<div>Incident reported<span style="display:block;font-weight:600;margin-top:6px;color:#dffcf0">${safeNote}</span></div>`;
        document.body.appendChild(toast);
        // auto-hide after 5s
        setTimeout(() => { try { toast.classList.add('hide'); setTimeout(() => { try { toast.remove(); } catch(_) {} }, 600); } catch(_) {} }, 5000);
      } catch (e) { console.debug('incident toast failed', e); }
    } catch (e) { /* non-critical UI feedback */ }
    // Do NOT auto-expire: incidents remain visible until the page is reloaded
    // Best-effort: persist to backend if available (use BACKEND_BASE to avoid file:// CORS issues)
    try {
      fetch(`${BACKEND_BASE}/report-incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, lat, lon, severity, note })
      }).then(r => r.json()).then(d => console.log('reportIncident: server saved', d)).catch(e => console.warn('reportIncident: server save failed', e));
    } catch (_) {}
    return incident;
  } catch (e) { console.error('reportIncident error', e); return null; }
}

function renderIncidents() {
  try {
    ensureIncidentsInitialized();
    window.incidentsLayer.clearLayers();
    const now = Date.now();
    (window.liveIncidents || []).forEach(inc => {
      if (inc.expired) return; // remain until manually expired or page reload
      const color = inc.type === 'roadwork' ? '#f59e0b' : (inc.type === 'accident' ? '#dc2626' : '#6b7280');
      const marker = L.circleMarker([inc.lat, inc.lon], { radius: 8, color, fillColor: color, fillOpacity: 0.9 }).addTo(window.incidentsLayer);
      marker.bindPopup(`<strong>${escapeHtml(inc.type)}</strong><br/>Severity: ${inc.severity}<br/>${escapeHtml(inc.note || '')}`);
    });
  } catch (e) { console.debug('renderIncidents error', e); }
}

// Helper: get a safe name from tags
function getPlaceName(tags) {
  return tags.name || tags['name:en'] || tags['alt_name'] || tags['brand'] || 'Unnamed';
}

// Categorize an OSM element into one of our categories
function determineCategory(tags) {
  const leisure = tags.leisure;
  const natural = tags.natural;
  const tourism = tags.tourism;
  const amenity = tags.amenity;
  const historic = tags.historic;
  const water = tags.water;
  const waterway = tags.waterway;
  const landuse = tags.landuse;
  const religion = tags.religion;
  const shop = tags.shop;

  if (amenity === 'charging_station') return 'ev';
  if (amenity === 'fuel') return 'fuel';
  if (amenity === 'hospital') return 'hospitals';
  if (amenity === 'atm') return 'atms';
  if (amenity === 'toilets') return 'toilets';
  if (amenity === 'restaurant') return 'restaurants';
  if (amenity === 'cafe') return 'cafes';
  if (amenity === 'cinema') return 'cinemas';
  if (amenity === 'marketplace') return 'markets';

  if (tourism === 'hotel') return 'hotels';
  if (tourism === 'museum') return 'museums';
  if (tourism === 'monument' || tourism === 'attraction') return 'monuments';

  if (historic === 'palace') return 'palaces';
  if (historic === 'fort' || historic === 'castle') return 'forts';
  if (historic === 'monument') return 'monuments';

  if (leisure === 'park' || landuse === 'recreation_ground') return 'parks';
  if (leisure === 'garden') return 'gardens';
  if (leisure === 'nature_reserve') return 'parks';

  if (natural === 'beach') return 'beaches';
  if (natural === 'water' && (water === 'lake' || water === 'lagoon' || water === 'reservoir' || water === 'pond')) return 'lakes';
  if (natural === 'wood' || landuse === 'forest' || natural === 'forest') return 'forests';
  if (waterway === 'river' || (natural === 'water' && water === 'river')) return 'rivers';

  if (amenity === 'place_of_worship' || tourism === 'place_of_worship' || religion) return 'temples';

  if (shop === 'mall') return 'malls';
  if (shop === 'supermarket' || shop === 'convenience') return 'markets';

  return null;
}

// Build a comprehensive Overpass QL query within bbox
function buildOverpassQuery(bbox) {
  const { south, west, north, east } = bbox;
  return `
    [out:json][timeout:25];
    (
      // Parks and recreational areas
      node["leisure"~"park|garden|nature_reserve|playground"](${south},${west},${north},${east});
      way["leisure"~"park|garden|nature_reserve|playground"](${south},${west},${north},${east});
      relation["leisure"~"park|garden|nature_reserve|playground"](${south},${west},${north},${east});

      // Natural features
      node["natural"~"beach|water|wood|forest|peak|cliff"](${south},${west},${north},${east});
      way["natural"~"beach|water|wood|forest|peak|cliff"](${south},${west},${north},${east});
      relation["natural"~"beach|water|wood|forest|peak|cliff"](${south},${west},${north},${east});

      // Water bodies
      node["waterway"~"river|stream|canal"](${south},${west},${north},${east});
      way["waterway"~"river|stream|canal"](${south},${west},${north},${east});
      relation["waterway"~"river|stream|canal"](${south},${west},${north},${east});

      // Tourist attractions
      node["tourism"~"hotel|museum|attraction|viewpoint|information"](${south},${west},${north},${east});
      way["tourism"~"hotel|museum|attraction|viewpoint|information"](${south},${west},${north},${east});
      relation["tourism"~"hotel|museum|attraction|viewpoint|information"](${south},${west},${north},${east});

      // Amenities
      node["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace|school|university|library|bank|post_office"](${south},${west},${north},${east});
      way["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace|school|university|library|bank|post_office"](${south},${west},${north},${east});
      relation["amenity"~"charging_station|fuel|hospital|atm|toilets|restaurant|cafe|cinema|marketplace|school|university|library|bank|post_office"](${south},${west},${north},${east});

      // Historic sites
      node["historic"~"monument|castle|fort|palace|ruins|archaeological_site"](${south},${west},${north},${east});
      way["historic"~"monument|castle|fort|palace|ruins|archaeological_site"](${south},${west},${north},${east});
      relation["historic"~"monument|castle|fort|palace|ruins|archaeological_site"](${south},${west},${north},${east});

      // Religious sites
      node["amenity"="place_of_worship"](${south},${west},${north},${east});
      way["amenity"="place_of_worship"](${south},${west},${north},${east});
      relation["amenity"="place_of_worship"](${south},${west},${north},${east});

      // Shopping
      node["shop"~"mall|supermarket|convenience|department_store"](${south},${west},${north},${east});
      way["shop"~"mall|supermarket|convenience|department_store"](${south},${west},${north},${east});
      relation["shop"~"mall|supermarket|convenience|department_store"](${south},${west},${north},${east});

      // Landmarks and notable places
      node["landmark"](${south},${west},${north},${east});
      way["landmark"](${south},${west},${north},${east});
      relation["landmark"](${south},${west},${north},${east});
    );
    out center 200;
  `;
}

// Call Overpass API and return normalized elements
async function searchComprehensivePlaces(routeGeometry) {
  try {
    const bbox = computeBufferedBbox(routeGeometry, 0.05); // Increase buffer for better coverage
    const query = buildOverpassQuery(bbox);
    let data;
    
    // Try multiple Overpass endpoints for better reliability.
    // However, when the app is opened via file:// (origin null) we must
    // avoid hitting public Overpass servers (they will reject CORS requests).
    // Prefer a local proxy if available; otherwise fall back to the
    // built-in landmark search to avoid DNS/CORS failures.
    const isFileOrigin = (function(){
      try { const p = window && window.location && window.location.protocol; return p === 'file:' || !window.location.origin || window.location.origin === 'null'; } catch(_) { return false; }
    })();

    let endpoints = [
      // Prefer local proxy to avoid CORS issues when available
      'http://localhost:5000/proxy/overpass',
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.nchc.org.tw/api/interpreter',
      'https://overpass.openstreetmap.fr/api/interpreter'
    ];

    if (isFileOrigin) {
      console.warn('Running from file:// origin — skipping remote Overpass endpoints to avoid CORS/DNS failures. Will try local proxy only, then fallback.');
      endpoints = ['http://localhost:5000/proxy/overpass'];
    }
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying Overpass endpoint: ${endpoint}`);
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query })
        }, 30000); // Increase timeout to 30 seconds
        
        if (res.ok) {
          data = await res.json();
          console.log(`Success with ${endpoint}, found ${data.elements?.length || 0} elements`);
          break;
        } else {
          console.warn(`HTTP ${res.status} from ${endpoint}`);
        }
      } catch (e) {
        console.warn(`Failed to query ${endpoint}:`, e.message);
        continue;
      }
    }
    
    if (!data || !data.elements) {
      if (isFileOrigin) {
        console.warn('Local proxy/Overpass query failed while running from file:// — using fallback landmark search instead.');
        return await fallbackLandmarkSearch(bbox);
      }
      console.warn('All Overpass endpoints failed, trying fallback search...');
      return await fallbackLandmarkSearch(bbox);
    }
    
    const elements = data.elements
      .map(el => {
        const lat = el.lat || (el.center && el.center.lat);
        const lon = el.lon || (el.center && el.center.lon);
        const tags = el.tags || {};
        if (lat == null || lon == null) return null;
        return { id: `${el.type}/${el.id}`, lat, lon, tags, name: getPlaceName(tags) };
      })
      .filter(Boolean);
    
    console.log(`Successfully processed ${elements.length} elements from Overpass`);
    return elements;
  } catch (e) {
    console.error('Overpass error:', e);
    // Try fallback search
    try {
      const bbox = computeBufferedBbox(routeGeometry, 0.05);
      return await fallbackLandmarkSearch(bbox);
    } catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
      return [];
    }
  }
}

// Fallback: segment the route and query smaller windows to capture near-route POIs
async function searchComprehensivePlacesSegmented(routeGeometry) {
  const coords = routeGeometry.coordinates; // [lon,lat]
  if (!coords || coords.length === 0) return [];

  // Increase samples for better coverage
  const maxSamples = 8; // Increase from 6 to 8
  const step = Math.max(1, Math.floor(coords.length / maxSamples));
  const samples = [];
  for (let i = 0; i < coords.length; i += step) samples.push(coords[i]);
  if (samples[samples.length - 1] !== coords[coords.length - 1]) samples.push(coords[coords.length - 1]);

  const aggregate = [];
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ];

  for (let i = 0; i < samples.length; i++) {
    const [lon, lat] = samples[i];
    // Increase bbox size for better coverage
    const bbox = { south: lat - 0.02, west: lon - 0.02, north: lat + 0.02, east: lon + 0.02 };
    const query = buildOverpassQuery(bbox);
    
    let success = false;
    for (const endpoint of endpoints) {
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: new URLSearchParams({ data: query })
        }, 15000); // Increase timeout
        
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.elements)) {
            for (const el of data.elements) {
              const latEl = el.lat || (el.center && el.center.lat);
              const lonEl = el.lon || (el.center && el.center.lon);
              const tags = el.tags || {};
              if (latEl == null || lonEl == null) continue;
              aggregate.push({ 
                id: `${el.type}/${el.id}`, 
                lat: latEl, 
                lon: lonEl, 
                tags, 
                name: getPlaceName(tags) 
              });
            }
            success = true;
            break; // Success with this endpoint, move to next sample
          }
        }
      } catch (e) {
        console.warn(`Failed to query ${endpoint} for sample ${i}:`, e.message);
        continue; // Try next endpoint
      }
    }
    
    // If all endpoints failed for this sample, try Nominatim fallback
    if (!success) {
      try {
        const fallbackResults = await fallbackLandmarkSearch(bbox);
        aggregate.push(...fallbackResults);
      } catch (fallbackError) {
        console.warn(`Fallback search failed for sample ${i}:`, fallbackError.message);
      }
    }
    
      // Increase soft cap for much better coverage
  if (aggregate.length > 800) break; // Increase from 500 to 800
  }
  
  console.log(`Segmented search found ${aggregate.length} total places`);
  return aggregate;
}

// Filter all places to those along the route and categorize
async function findAllTouristPlacesAlongRoute(routeGeometry, corridorMeters = 1200) { // Increase from 800 to 1200
  let allPlaces = await searchComprehensivePlaces(routeGeometry);
  if (!allPlaces.length) {
    // Fallback to segmented strategy when bbox query returns empty or is rate-limited
    console.log('Primary search returned no results, trying segmented search...');
    allPlaces = await searchComprehensivePlacesSegmented(routeGeometry);
  }
  
  if (!allPlaces.length) {
    console.warn('Both primary and segmented search failed, trying emergency fallback...');
    // Emergency fallback: use a very wide search area
    const emergencyBbox = computeBufferedBbox(routeGeometry, 0.1); // Very wide buffer
    allPlaces = await fallbackLandmarkSearch(emergencyBbox);
  }
  
  if (!allPlaces.length) {
    console.error('All search methods failed - no landmarks found');
    return { grouped: {}, flat: [] };
  }
  
  console.log(`Found ${allPlaces.length} total places before filtering`);
  
  // Increase corridor width for better coverage
  const routeCoords = getRouteCoords(routeGeometry);
  const withinCorridor = allPlaces.filter(p => {
    const d = routeCoords ? distancePointToPolylineMeters(p.lat, p.lon, routeCoords) : Infinity;
    return d <= corridorMeters;
  });
  
  console.log(`${withinCorridor.length} places within ${corridorMeters}m corridor`);
  
  const deduped = dedupeByLocation(withinCorridor);
  const categorized = deduped.map(p => {
    const cat = determineCategory(p.tags);
    return { ...p, category: cat };
  }).filter(p => !!p.category);

  // Group and limit per category (increase from 12 to 25 for much better coverage)
  const grouped = {};
  for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
  for (const p of categorized) {
    const key = p.category;
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 25) grouped[key].push(p); // Increase from 12 to 25
  }
  const flat = Object.values(grouped).flat();
  
  console.log(`Final result: ${flat.length} landmarks in ${Object.keys(grouped).filter(k => grouped[k].length > 0).length} categories`);
  return { grouped, flat };
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

function toggleHomeSidebar() {
  document.getElementById("homeSidebar").classList.toggle("hidden");
}

function showHome() {
  document.getElementById('homeScreen').style.display = 'block';
  document.getElementById('mapContainer').style.display = 'none';
  document.getElementById("homeSidebar").classList.remove("hidden");
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("hamburger").classList.add("hidden");
  document.getElementById("mapContainer").classList.remove("sidebar-open");
  document.getElementById('sidebarOverlay').classList.add('show');
}

function showMap() {
  document.getElementById('homeScreen').style.display = 'none';
  document.getElementById('mapContainer').style.display = 'block';
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("homeSidebar").classList.add("hidden");
  document.getElementById("hamburger").classList.add("hidden");
  document.getElementById("mapContainer").classList.add("sidebar-open");
  document.getElementById('sidebarOverlay').classList.add('show');

  setTimeout(() => {
    if (!map) {
      map = L.map('map').setView([10.8505, 76.2711], 8);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          const userLocation = [userLat, userLng];
          map.setView(userLocation, 13);
          L.marker(userLocation).addTo(map).bindPopup("You are here").openPopup();
        },
        (error) => {
          console.error("Geolocation error:", error.message);
          alert("Unable to retrieve your location.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      
      // Setup popup management
      setupMapPopupManagement();
      // NOTE: Do NOT auto-calculate routes on transport mode change.
      // User must click "Calculate Route" button to compute routes.
    } else {
      map.invalidateSize();
    }
  }, 300);
}

async function geocode(location) {
  const trimmed = (location || '').trim();
  if (!trimmed) return null;
  // Try Mapbox → Nominatim → Photon
  // Add proximity/country bias to improve Indian city results
  const center = map && typeof map.getCenter === 'function' ? map.getCenter() : null;
  const proximity = center ? `&proximity=${center.lng},${center.lat}` : '';
  const mapboxToken = 'pk.eyJ1IjoiamQxMjA2IiwiYSI6ImNtZGJxZGE0MzBuZXgycXIyaHZlNHhjMjkifQ.fhXRKJLNhYo5xB992ZIbVg';
  try {
    const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?limit=1&language=en&country=in${proximity}&access_token=${mapboxToken}`;
    const mbRes = await fetchWithTimeout(mbUrl, {}, 9000);
    if (mbRes.ok) {
      const mb = await mbRes.json();
      if (mb && mb.features && mb.features.length > 0) {
        const [lon, lat] = mb.features[0].geometry.coordinates;
        if (isFinite(lat) && isFinite(lon)) return [lat, lon];
      }
    }
  } catch (_) {}

  try {
    const params = new URLSearchParams({
      q: trimmed,
      limit: '1',
      countrycodes: 'in'
    });
    const res = await fetchWithTimeout(`http://localhost:5000/proxy/nominatim/search?${params.toString()}`, {}, 12000);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
  } catch (_) {}

  try {
    const phUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=1`;
    const phRes = await fetchWithTimeout(phUrl, {}, 9000);
    if (phRes.ok) {
      const ph = await phRes.json();
      if (ph && ph.features && ph.features.length > 0) {
        const coords = ph.features[0].geometry.coordinates; // [lon,lat]
        if (coords && coords.length === 2) return [coords[1], coords[0]];
      }
    }
  } catch (_) {}

  return null;
}

async function getVehicleSuggestion(distance) {
  try {
    const res = await fetchWithTimeout("http://localhost:5000/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distanceKm: parseFloat(distance) })
    }, 6000);
    return await res.json();
  } catch (err) {
    console.error("Suggestion fetch error:", err);
    return null;
  }
}
function adjustEmissionRate(baseRate, year) {
  const currentYear = new Date().getFullYear();
  let age = currentYear - year;

  if (age < 0) 
    return baseRate;
  const reduction = Math.min(0.2, age * 0.01); // max 20% reduction
  return baseRate * (1 - reduction); 
  // No negative age
}
// Suggest GST-style category based on grams CO2 per km (illustrative only)
function suggestGSTCategory(emPerKm) {
  if (emPerKm == null || !isFinite(emPerKm)) return null;
  if (emPerKm <= 100) return { label: 'Low-emission', suggestion: 'Reduced rate (e.g. 5%)', reason: 'Very low CO₂ per km' };
  if (emPerKm <= 250) return { label: 'Moderate-emission', suggestion: 'Standard rate (e.g. 12–18%)', reason: 'Moderate CO₂ per km' };
  return { label: 'High-emission', suggestion: 'No reduced rate', reason: 'High CO₂ per km' };
}
 const API_KEY = "f970516c-2499-42a4-ae26-fb1e3dc4eeac";

function clearRouteLayers() {
  routeLayers.forEach(layer => { try { map.removeLayer(layer); } catch {} });
  routeLayers = [];
  // Also clear any incident markers when clearing routes so that
  // incidents do not persist after the user changes source/destination.
  try {
    if (window.incidentsLayer && typeof window.incidentsLayer.clearLayers === 'function') {
      window.incidentsLayer.clearLayers();
    }
  } catch (e) { console.debug('Failed to clear incidentsLayer', e); }
}

async function fetchGraphHopperRoutes(sourceCoords, destCoords) {
  const url = `https://graphhopper.com/api/1/route?` +
    `point=${sourceCoords[0]},${sourceCoords[1]}` +
    `&point=${destCoords[0]},${destCoords[1]}` +
    `&vehicle=car` +
    `&points_encoded=false` +
    `&algorithm=alternative_route` +
    `&alternative_route.max_paths=6` +
    `&alternative_route.max_weight_factor=1.6` +
    `&alternative_route.max_share_factor=1.0` +
    `&key=${API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("GraphHopper API error:", await res.text());
      return [];
    }
    const data = await res.json();
    return data.paths || [];
  } catch (e) {
    console.error("Fetch error:", e);
    return [];
  }
}
async function fetchAndGroupTouristPlaces(routeGeometry) {
  let osmPlaces = [];
  let tomtomGrouped = { grouped: {}, flat: [], enhanced: false };
  try {
    osmPlaces = await searchComprehensivePlaces(routeGeometry);
    tomtomGrouped = await fetchTomTomPOIs(routeGeometry, 'petrol', {}); // Use correct vehicleType in real code
  } catch (e) {
    console.warn("POI fetch error:", e);
  }
  
  // Combine and group
  const allPlaces = [...osmPlaces, ...tomtomGrouped.flat];
  const grouped = {};
  Object.keys(TOURIST_CATEGORIES).forEach(k => grouped[k] = []);
  allPlaces.forEach(place => {
    const cat = place.category || 'monuments';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(place);
  });
  return grouped;
}

// GraphHopper helper to fetch multiple routes
async function fetchGraphHopperRoutes(sourceCoords, destCoords, vehicleType = 'car') {
  const GH_API_KEY = "f970516c-2499-42a4-ae26-fb1e3dc4eeac";
  const url = `https://graphhopper.com/api/1/route?` +
    `point=${sourceCoords[0]},${sourceCoords[1]}` +
    `&point=${destCoords[0]},${destCoords[1]}` +
    `&vehicle=${vehicleType}` +
    `&points_encoded=false` +
    `&algorithm=alternative_route` +
    `&alternative_route.max_paths=5` +
    `&alternative_route.max_weight_factor=1.4` +
    `&key=${GH_API_KEY}`;

  try {
    const res = await fetchWithTimeout(url, {}, 15000);
    if (!res.ok) {
      console.warn("GraphHopper API error:", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    if (!data.paths || data.paths.length === 0) {
      console.warn("No routes returned from GraphHopper");
      return [];
    }
    // Convert GraphHopper paths to GeoJSON-like format
    return data.paths.map(path => ({
      geometry: {
        type: 'LineString',
        coordinates: path.points.coordinates.map(c => [c[0], c[1]])
      },
      distance: path.distance,
      duration: path.time
    }));
  } catch (err) {
    console.error("GraphHopper fetch error:", err);
    return [];
  }
}

async function findRoute() {
  const sourceText = document.getElementById("source").value.trim();
  const destText = document.getElementById("destination").value.trim();
  const vehicleType = document.getElementById("vehicleType").value;
  const fuelType = document.getElementById("fuelType").value;
  const modelYear = parseInt(document.getElementById("modelYear").value) || 2020;

  // Reset request tracking
  currentRouteRequestId += 1;
  const thisRequestId = currentRouteRequestId;
  currentPrimaryRoute = null;
  currentRouteGeometry = null;
  currentRouteMeta = null;

  try { stopTouristInfoBoxRefresh(); cleanupTouristRoute(); closeAllPopups(); window.showingRouteSummary = true; } catch(_) {}

  if (!sourceText || !destText) {
    alert("Please enter both source and destination.");
    document.getElementById("info-box").innerText = "---";
    return;
  }

  const sourceCoords = await enhancedGeocode(sourceText);
  const destCoords = await enhancedGeocode(destText);

  if (!sourceCoords || !destCoords) {
    alert("Could not locate one or both addresses.");
    return;
  }

  const calculateButton = document.querySelector('button[onclick="findRoute()"]');
  if (calculateButton) {
    calculateButton.classList.add('loading');
    calculateButton.disabled = true;
  }

  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("homeSidebar").classList.add("hidden");

  // Clear previous
  if (sourceMarker) map.removeLayer(sourceMarker);
  if (destMarker) map.removeLayer(destMarker);
  clearRouteLayers();

  // Add markers
  try {
    sourceMarker = L.marker(sourceCoords, { icon: buildEndpointIcon('start') }).addTo(map).bindPopup('Source: ' + escapeHtml(sourceText));
    destMarker = L.marker(destCoords, { icon: buildEndpointIcon('end') }).addTo(map).bindPopup('Destination: ' + escapeHtml(destText));
  } catch (e) {
    try { sourceMarker = L.marker(sourceCoords).addTo(map).bindPopup('Source'); } catch(_) {}
    try { destMarker = L.marker(destCoords).addTo(map).bindPopup('Destination'); } catch(_) {}
  }
  map.fitBounds([sourceCoords, destCoords], { padding: [50, 50] });

  // Map UI vehicle type to GraphHopper vehicle param and fetch routes
  const ghVehicle = (VEHICLE_MAP[vehicleType] || VEHICLE_MAP[vehicleType.toLowerCase()]) || 'car';
  const routes = await fetchGraphHopperRoutes(sourceCoords, destCoords, ghVehicle);
  
  // Stale request check
  if (thisRequestId !== currentRouteRequestId) {
    console.warn('findRoute: stale response');
    if (calculateButton) { calculateButton.classList.remove('loading'); calculateButton.disabled = false; }
    return;
  }

  if (!routes || routes.length === 0) {
    alert("No routes found. Please check source/destination.");
    if (calculateButton) { calculateButton.classList.remove('loading'); calculateButton.disabled = false; }
    return;
  }

  // Cache primary route
  try {
    const mainRoute = routes[0];
    currentPrimaryRoute = mainRoute;
    if (mainRoute) {
      currentRouteGeometry = mainRoute.geometry || null;
      const distKm = mainRoute.distance ? mainRoute.distance / 1000 : 0;
      currentRouteMeta = {
        distanceKm: distKm,
        vehicleType,
        fuelType,
        modelYear,
        source: sourceText,
        destination: destText,
        durationMs: mainRoute.duration || null
      };
    }
  } catch (_) {}

  // Main route for emissions
  const mainRoute = routes[0];
  const distance = (mainRoute.distance / 1000).toFixed(2);

  // Calculate emissions
  let emissions = 0;
  try {
    if (typeof EmissionCalculator !== 'undefined') {
      const result = EmissionCalculator.estimateEmissions({
        vehicleType, fuelType, distance, vehicleYear: modelYear
      });
      emissions = result.totalEmissionsGramsCO2;
    } else {
      const rate = adjustEmissionRate(emissionRates[vehicleType] || emissionRates.petrol, modelYear);
      emissions = distance * rate;
    }
  } catch (e) {
    const rate = adjustEmissionRate(emissionRates[vehicleType] || emissionRates.petrol, modelYear);
    emissions = distance * rate;
  }
  const emissionsFormatted = emissions.toFixed(2);

  // Display routes
  const routeColors = ['#16a34a', '#e63946', '#457b9d', '#f4a261', '#2a9d8f'];
  routes.forEach((route, idx) => {
    const color = routeColors[idx % routeColors.length];
    const weight = idx === 0 ? 6 : 4;
    const opacity = idx === 0 ? 0.85 : 0.6;
    const dashArray = idx === 0 ? null : "5,8";

    const layer = L.geoJSON(route.geometry, {
      style: { color, weight, opacity, dashArray }
    }).addTo(map);
    layer._routeIndex = idx;
    routeLayers.push(layer);

    const distKm = (route.distance / 1000).toFixed(2);
    const durMin = Math.round(route.duration / 60);
    layer.bindPopup(`<strong>Route #${idx + 1}</strong><br>${distKm} km | ${durMin} min`);
  });

  // Zoom to fit
  const allBounds = L.geoJSON({
    type: "FeatureCollection",
    features: routes.map(r => r.geometry)
  }).getBounds();
  map.fitBounds(allBounds, { padding: [40, 40] });

  // Info box with Live Traffic indicator
  // Build minimal infoHTML to match the requested screenshot exactly:
  // Show only: Main route distance, Estimated emissions, Number of routes shown, then the route list.
  let infoHTML = `
    <div style="margin-bottom:8px;padding:8px;background:transparent;border-radius:4px;font-size:13px;font-weight:700;color:#e6fff4;">
      <div>Main route distance: <strong>${distance} km</strong></div>
      <div style="margin-top:6px;">Estimated emissions: <strong>${emissionsFormatted} g CO₂</strong></div>
      <div style="margin-top:6px;">Number of routes shown: <strong>${routes.length}</strong></div>
    </div>
    <div id="routeList" style="margin-top: 12px;"></div>
  `;

  const box = document.getElementById("info-box");
  box.innerHTML = `
    <div class="info-header">
      <span>🗺️ Route Summary</span>
      <div class="info-actions">
        <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
      </div>
    </div>
    <div class="info-body">
      ${infoHTML}
    </div>
  `;

  // Populate route list
  populateRouteList(routes, routeLayers);

  // Save to DB
  try {
    fetch("http://localhost:5000/save-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: sourceText,
        destination: destText,
        vehicleType,
        fuelType,
        modelYear,
        distance: parseFloat(distance),
        emissions: parseFloat(emissionsFormatted)
      })
    }).then(r => r.json()).then(d => console.log("Route saved")).catch(e => console.warn("Save failed", e));
  } catch (_) {}

  try { stopTouristInfoBoxRefresh(); window.showingRouteSummary = true; } catch (_) {}

  if (calculateButton) {
    calculateButton.classList.remove('loading');
    calculateButton.disabled = false;
  }
}

function clearRouteLayers() {
  routeLayers.forEach(layer => { try { map.removeLayer(layer); } catch (_){} });
  routeLayers = [];
}


// async function fetchGraphHopperRoutes(sourceCoords, destCoords) {
//   const url = `https://graphhopper.com/api/1/route?` +
//     `point=${sourceCoords[0]},${sourceCoords[1]}` +
//     `&point=${destCoords[0]},${destCoords[1]}` +
//     `&vehicle=car` +
//     `&points_encoded=false` +
//     `&algorithm=alternative_route` +
//     `&alternative_route.max_paths=6` +
//     `&alternative_route.max_weight_factor=1.6` +
//     `&alternative_route.max_share_factor=1.0` +
//     `&key=${GH_API_KEY}`;

//   try {
//     const res = await fetch(url);
//     if (!res.ok) {
//       console.error("GraphHopper API error:", await res.text());
//       return [];
//     }
//     const data = await res.json();
//     return data.paths || [];
//   } catch (e) {
//     console.error("Fetch error:", e);
//     return [];
//   }
// }



// Helper to create route list with click to highlight behavior
// function populateRouteList(routes, routeLayers) {
//   const routeList = document.getElementById('routeList');
//   if (!routeList) return;
//   routeList.innerHTML = '';
//   const routeColors = ['#16a34a', '#e63946', '#457b9d', '#f4a261', '#2a9d8f'];

//   routes.forEach((route, i) => {
//     const distKm = (route.distance / 1000).toFixed(2);
//     const durMin = Math.round(route.duration / 60);
//     const item = document.createElement('div');
//     item.className = 'route-list-item';
//     item.style.display = 'flex';
//     item.style.alignItems = 'center';
//     item.style.gap = '10px';
//     item.style.marginBottom = '6px';

//     // Single color vertical bar for each route (not stacked)
//     const colorBar = document.createElement('div');
//     colorBar.className = 'color-bar';
//     colorBar.style.background = routeColors[i % routeColors.length];
//     item.appendChild(colorBar);

//     // Text label
//     const text = document.createElement('span');
//     text.style.fontWeight = '600';
//     text.style.fontSize = '15px';
//     text.style.color = '#e6fff4';
//     text.textContent = `Route ${i+1}: ${distKm} km, ${durMin} min`;
//     item.appendChild(text);

//     routeList.appendChild(item);
//   });
// }
function populateRouteList(routes) {
  const routeList = document.getElementById('routeList');
  routeList.innerHTML = '';
  const routeColors = ['#16a34a', '#e63946', '#457b9d', '#f4a261', '#2a9d8f'];

  routes.forEach((route, i) => {
    const distKm = (route.distance / 1000).toFixed(2);
    const durMin = Math.round(route.duration / 60);
    const item = document.createElement('div');
    item.className = 'route-list-item';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '10px';
    item.style.marginBottom = '6px';

    // Colored vertical bar
    const colorBar = document.createElement('div');
    colorBar.className = 'color-bar';
    colorBar.style.background = routeColors[i % routeColors.length];
    colorBar.style.width = '6px';
    colorBar.style.height = '32px';
    colorBar.style.borderRadius = '4px';
    item.appendChild(colorBar);

    // Text label
    const text = document.createElement('span');
    text.style.fontWeight = '600';
    text.style.fontSize = '15px';
    text.style.color = '#e6fff4';
    text.textContent = `Route ${i + 1}: ${distKm} km, ${durMin} min`;
    item.appendChild(text);

    routeList.appendChild(item);
  });
}

// Enhanced tourist route function: comprehensive attractions along the route
async function findTouristRoute() {
  // Switch to tourist mode so periodic refresh will render tourist info
  try { window.showingRouteSummary = false; } catch (_) {}

  // If we don't have a cached route, try to compute one from source/destination inputs
  if (!currentRouteGeometry || !Array.isArray(currentRouteGeometry.coordinates) || currentRouteGeometry.coordinates.length === 0) {
    try {
      const srcText = (document.getElementById('source') && document.getElementById('source').value || '').trim();
      const dstText = (document.getElementById('destination') && document.getElementById('destination').value || '').trim();
      if (srcText && dstText) {
        // Geocode both ends and fetch a GraphHopper route (single best)
        const s = await enhancedGeocode(srcText);
        const d = await enhancedGeocode(dstText);
        if (s && d) {
          // GraphHopper expects [lat, lon]
          try {
            const paths = await fetchGraphHopperRoutes([s[0], s[1]], [d[0], d[1]]);
            if (paths && paths.length) {
              // Use first path as primary route and draw it
              try { switchToGraphHopperPath(paths[0]); } catch (_) {}
            }
          } catch (e) { console.warn('GraphHopper alternate fetch failed for tourist route', e); }
        }
      } else {
        // No source/destination provided — fall back to searching POIs around map center
        console.debug('No cached route and no source/destination inputs — will search POIs near map center');
      }
    } catch (e) {
      console.warn('Failed to compute route on-the-fly for tourist route', e);
    }
  }

  const vehicleTypeField = document.getElementById("vehicleType");
  const modelYearField = document.getElementById("modelYear");

  // Place endpoint markers for tourist view (source/destination)
  try {
    const coords = (currentRouteGeometry && currentRouteGeometry.coordinates) || [];
    if (coords.length >= 2) {
      const start = coords[0]; // [lon, lat]
      const end = coords[coords.length - 1];
      const startLatLng = [start[1], start[0]];
      const endLatLng = [end[1], end[0]];

      // remove existing endpoint markers to avoid duplicates
      try { if (sourceMarker) { map.removeLayer(sourceMarker); sourceMarker = null; } } catch(_) {}
      try { if (destMarker) { map.removeLayer(destMarker); destMarker = null; } } catch(_) {}

      const startIcon = L.divIcon({ html: '<div class="endpoint-pin start">🏁</div>', className: 'endpoint-icon', iconSize: [28,28], iconAnchor: [14,28] });
      const endIcon = L.divIcon({ html: '<div class="endpoint-pin end">📍</div>', className: 'endpoint-icon', iconSize: [28,28], iconAnchor: [14,28] });

      sourceMarker = L.marker(startLatLng, { icon: startIcon }).addTo(map).bindPopup('Start: ' + escapeHtml(currentRouteMeta?.source || 'Origin'));
      destMarker = L.marker(endLatLng, { icon: endIcon }).addTo(map).bindPopup('Destination: ' + escapeHtml(currentRouteMeta?.destination || 'Destination'));
    }
  } catch (e) { console.warn('Failed to place endpoint markers for tourist view', e); }

  const vehicleTypeRaw = vehicleTypeField ? vehicleTypeField.value : (currentRouteMeta?.vehicleType ?? "petrol");
  const vehicleType = (vehicleTypeRaw || "petrol").toLowerCase();

  const parsedModelYear = modelYearField ? parseInt(modelYearField.value, 10) : NaN;
  const modelYear = Number.isFinite(parsedModelYear)
    ? parsedModelYear
    : (typeof currentRouteMeta?.modelYear === "number" ? currentRouteMeta.modelYear : 2020);

  const distanceKmNumber = currentRouteMeta?.distanceKm ?? (currentPrimaryRoute?.distance ? currentPrimaryRoute.distance / 1000 : null);
  const distanceKm = distanceKmNumber != null ? distanceKmNumber.toFixed(2) : "0.00";

  let emissionsNumber = currentRouteMeta?.emissions;
  if (typeof emissionsNumber !== "number" && distanceKmNumber != null) {
    const rate = adjustEmissionRate(emissionRates[vehicleType] || emissionRates.petrol, modelYear);
    emissionsNumber = distanceKmNumber * rate;
  }
  const emissions = typeof emissionsNumber === "number" ? emissionsNumber.toFixed(2) : "0.00";

  const infoBox = document.getElementById("info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div class="info-header">
        <span>Tourist Attractions</span>
        <div class="info-actions">
          <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
        </div>
      </div>
      <div class="info-body">
        <div class="tourist-loading">
          <div class="spinner"></div>
          <div><strong>Searching attractions along your route...</strong><br><small>This may take a few seconds</small></div>
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
        </div>
      </div>
    `;
  }

  stopTouristInfoBoxRefresh();
  clearTouristMarkers();

  let progressInterval = null;
  const progressFill = infoBox ? infoBox.querySelector(".progress-fill") : null;
  if (progressFill) {
    progressFill.style.width = "12%";
    progressInterval = setInterval(() => {
      let current = parseFloat(progressFill.style.width) || 12;
      current += Math.random() * 15;
      if (current > 92) current = 92;
      progressFill.style.width = `${current}%`;
    }, 220);
  }

  try {
    try {
      await ensureApiKeyRoles();
    } catch (_) {}

    let trafficSummary = null;
    let weatherPoints = [];
    try {
      trafficSummary = await fetchTrafficSummary(currentRouteGeometry);
    } catch (_) {}
    try {
      weatherPoints = await fetchWeatherAlongRoute(currentRouteGeometry);
    } catch (_) {}
    lastTrafficWeatherHtml = buildTrafficWeatherSnippet(trafficSummary, weatherPoints);

      let osmGrouped = {};
      try {
      // Try a fast primary fetch with timeout; also start a lightweight TomTom quick fetch in parallel
      const fastTimeoutMs = 7000;
      let osmResult = null;
      const tomQuickPromise = fetchTomTomPOIs(currentRouteGeometry, vehicleType, {}, /* fastOnly */ true).catch(() => null);
      try {
        osmResult = await Promise.race([
          findAllTouristPlacesAlongRoute(currentRouteGeometry, 1200),
          new Promise((res) => setTimeout(() => res(null), fastTimeoutMs))
        ]);
      } catch (e) { osmResult = null; }

      const tomQuick = await tomQuickPromise;
      console.debug('tomQuick grouped counts:', tomQuick && tomQuick.grouped ? Object.values(tomQuick.grouped).flat().length : 0);
      // If tomQuick has results, display them immediately (fast fallback)
      if (tomQuick && tomQuick.grouped && Object.values(tomQuick.grouped).flat().length) {
        console.debug('Displaying quick TomTom results (fast fallback)');
        displayTouristAttractions(tomQuick.grouped);
      }

      if (!osmResult) {
        // full OSM search didn't complete within fast timeout; we'll continue and merge later
        osmGrouped = {};
      } else {
        console.debug('OSM quick result grouped counts:', osmResult && osmResult.grouped ? Object.values(osmResult.grouped).flat().length : 0);
        osmGrouped = osmResult.grouped || {};
      }
    } catch (error) {
      console.warn("OSM landmark search failed:", error);
      osmGrouped = {};
    }

    const mergedGrouped = {};
    Object.keys(TOURIST_CATEGORIES).forEach(key => {
      mergedGrouped[key] = Array.isArray(osmGrouped[key]) ? [...osmGrouped[key]] : [];
    });

    lastTouristDataEnhanced = false;
    try {
      const tomResult = await fetchTomTomPOIs(currentRouteGeometry, vehicleType, osmGrouped);
      if (tomResult) {
        lastTouristDataEnhanced = !!tomResult.enhanced;
        Object.keys(TOURIST_CATEGORIES).forEach(key => {
          const list = tomResult.grouped && Array.isArray(tomResult.grouped[key]) ? tomResult.grouped[key] : [];
          if (list.length) {
            mergedGrouped[key] = dedupeByLocation([...mergedGrouped[key], ...list]);
          } else {
            mergedGrouped[key] = dedupeByLocation(mergedGrouped[key]);
          }
        });
      } else {
        Object.keys(mergedGrouped).forEach(key => {
          mergedGrouped[key] = dedupeByLocation(mergedGrouped[key]);
        });
      }
    } catch (error) {
      console.warn("TomTom POI fetch failed:", error);
      Object.keys(mergedGrouped).forEach(key => {
        mergedGrouped[key] = dedupeByLocation(mergedGrouped[key]);
      });
    }
    const flattened = Object.values(mergedGrouped).flat();
    console.debug('mergedGrouped total after TomTom:', flattened.length);
    let displayedGrouped = mergedGrouped;

    // If nothing found within the initial radius (~1.2km), try a wider fallback
    if (!flattened.length) {
      try {
        console.log('No POIs found in initial search — trying wider search (3 km)');
        const widerOsm = await findAllTouristPlacesAlongRoute(currentRouteGeometry, 3000).catch(()=>null);
        const widerTom = await fetchTomTomPOIs(currentRouteGeometry, vehicleType, {}, /* fastOnly */ false).catch(()=>null);
        const widerMerged = {};
        Object.keys(TOURIST_CATEGORIES).forEach(k => {
          const a = (widerOsm && widerOsm.grouped && widerOsm.grouped[k]) ? widerOsm.grouped[k] : [];
          const b = (widerTom && widerTom.grouped && widerTom.grouped[k]) ? widerTom.grouped[k] : [];
          widerMerged[k] = dedupeByLocation([...(a||[]), ...(b||[])]);
        });
        const widerFlat = Object.values(widerMerged).flat();
        if (widerFlat.length) {
          displayedGrouped = widerMerged;
          // show markers for the wider results
          try { displayTouristAttractions(widerMerged); } catch(_) {}
        } else {
          // nothing even after wider search
          clearTouristMarkers();
          displayedGrouped = {};
        }
      } catch (e) {
        console.warn('Wider POI search failed:', e);
        clearTouristMarkers();
        displayedGrouped = {};
      }
    } else {
      displayedGrouped = displayTouristAttractions(mergedGrouped);
    }

    const infoPayload = {
      distanceKm,
      emissions,
      vehicleType,
      modelYear,
      grouped: displayedGrouped,
      extraHtml: lastTrafficWeatherHtml || ""
    };

    // If still empty, perform a definitive combined fetch (OSM + TomTom) and display results.
    try {
      const totalFound = Object.values(displayedGrouped || {}).flat().length;
      if (!totalFound) {
        console.log('No POIs after initial + wider search — running combined fallback fetch');
        const fallback = await updateTouristPlacesAlongRoute(currentRouteGeometry).catch(()=>({}));
        const fallbackCount = Object.values(fallback || {}).flat().length;
        console.debug('Fallback combined fetch counts:', fallbackCount);
        if (fallbackCount) {
          displayedGrouped = fallback;
          infoPayload.grouped = displayedGrouped;
        }
      }
    } catch (e) {
      console.warn('Fallback combined fetch failed:', e);
    }

  const finalCount = Object.values(displayedGrouped || {}).flat().length;
  if (finalCount === 0 && infoBox) {
      infoBox.innerHTML = `
        <div class="info-header">
          <span>Tourist Attractions</span>
          <div class="info-actions">
            <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
          </div>
        </div>
        <div class="info-body">
          <div class="tourist-info-panel">
            <div class="summary">
              <div><strong>Distance:</strong> ${distanceKm} km</div>
              <div><strong>${vehicleType.toUpperCase()} (${modelYear}) CO₂:</strong> ${emissions} g</div>
            </div>
            <div style="color:#0f172a">No attractions found within ~1 km of this route right now. Try again soon.</div>
          </div>
        </div>
      `;
    } else {
      displayTouristRouteInfo(infoPayload);
    }

    updateCurrentTouristData(infoPayload);
    startTouristInfoBoxRefresh();

    // Auto-fit map to show POIs if any markers were added
    try {
      const markerCoords = Array.from(markerByPlaceId.values()).map(m => m.getLatLng()).filter(Boolean);
      if (markerCoords.length) {
        const b = L.latLngBounds(markerCoords);
        // merge with route bounds if available
        try {
          routeLayers.forEach(r => { if (r && typeof r.getBounds === 'function') b.extend(r.getBounds()); });
        } catch(_) {}
        if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
      }
    } catch (e) { console.debug('Auto-fit POIs failed:', e); }

    try {
      if (typeof loadRecent === "function") {
        loadRecent();
      }
    } catch (_) {}

    if (currentRouteMeta?.source && currentRouteMeta?.destination) {
      try {
        fetch("http://localhost:5000/save-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: currentRouteMeta.source,
            destination: currentRouteMeta.destination,
            vehicleType,
            modelYear,
            distance: distanceKmNumber != null ? distanceKmNumber : null,
            emissions: typeof emissionsNumber === "number" ? emissionsNumber : parseFloat(emissions),
            routeSource: lastTouristDataEnhanced ? "TomTom+OSM" : "OSM"
          })
        }).catch(() => {});
      } catch (_) {}
    }
  } catch (error) {
    console.error("Error fetching tourist places:", error);
    alert("Failed to fetch tourist places. Check the console for details.");
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}
async function fetchTouristPlaces(routeGeometry, vehicleType = 'car', existingGrouped = {}) {
  try {
    // Fetch OSM places
    const osmPlaces = await searchComprehensivePlaces(routeGeometry);

    // Fetch TomTom grouped POIs with proper arguments
    const tomTom = await fetchTomTomPOIs(routeGeometry, vehicleType, existingGrouped);

    // Merge: OSM returns flat elements, TomTom returns {grouped, flat}
    const mergedFlat = Array.isArray(osmPlaces) ? [...osmPlaces] : [];
    if (tomTom && Array.isArray(tomTom.flat)) mergedFlat.push(...tomTom.flat);

    // Deduplicate by approximate location
    const deduped = dedupeByLocation(mergedFlat);
    return deduped;
  } catch (error) {
    console.error("Error fetching tourist places inside fetchTouristPlaces:", error);
    return [];
  }
}


function clearTouristMarkers() {
  for (const marker of markerByPlaceId.values()) {
    try { map.removeLayer(marker); } catch {}
  }
  markerByPlaceId.clear();
}

// Place markers on the map with category-specific styling and enhanced interaction
function displayTouristAttractions(grouped) {
  // Only create markers for POIs that are close to the current route
  const filtered = filterGroupedByRoute(grouped, ROUTE_POI_BUFFER_METERS);
  console.log('Displaying tourist attractions (filtered):', filtered);
  let totalMarkers = 0;

  // Clear existing markers first
  markerByPlaceId.forEach(marker => {
    try { map.removeLayer(marker); } catch(_) {}
  });
  markerByPlaceId.clear();

  // Close any existing popups
  closeAllPopups();

  Object.keys(filtered).forEach(key => {
    const cat = TOURIST_CATEGORIES[key];
    const places = filtered[key] || [];
    console.log(`Category ${key}: ${places.length} places (after route filter)`);

    const unique = dedupePlacesByKey(places);
    unique.forEach(p => {
      const pk = getPlaceKey(p);
      if (!pk) return;
      if (markerByPlaceId.has(pk)) return;
      const marker = L.marker([p.lat, p.lon], { icon: buildTouristDivIcon(key), zIndexOffset: 1000, riseOnHover: true }).addTo(map);
      markerByPlaceId.set(pk, marker);
      try { setupMarkerInteraction(marker, p, key); } catch (e) { try { marker.bindPopup(`<strong>${escapeHtml(p.name || 'Place')}</strong>`); } catch(_) {} }
    });

    totalMarkers += unique.length;
  });

  console.log(`Displayed ${totalMarkers} markers on map (route-filtered)`);
  return filtered;
}

// Render the info panel with categorized counts and lists, ordered along the route
function displayTouristRouteInfo({ distanceKm, emissions, vehicleType, modelYear, grouped, extraHtml }) {
  // Prefer values from payload, fall back to cached route metadata
  const meta = window.currentTouristData || {};
  const dk = (typeof distanceKm !== 'undefined' && distanceKm !== null) ? distanceKm : (meta.distanceKm || (currentRouteMeta && currentRouteMeta.distanceKm) || '0.00');
  const em = (typeof emissions !== 'undefined' && emissions !== null) ? emissions : (meta.emissions || (currentRouteMeta && currentRouteMeta.emissions) || '0.00');
  const vt = vehicleType || meta.vehicleType || (currentRouteMeta && currentRouteMeta.vehicleType) || 'car';
  const my = modelYear || meta.modelYear || (currentRouteMeta && currentRouteMeta.modelYear) || new Date().getFullYear();

  // Only show landmarks that are near the current route
  const filteredGrouped = filterGroupedByRoute(grouped, ROUTE_POI_BUFFER_METERS);
  // Count total landmarks
  let totalLandmarks = 0;
  Object.keys(filteredGrouped || {}).forEach(k => { if (Array.isArray(filteredGrouped[k])) totalLandmarks += filteredGrouped[k].length; });

  // Build a modern, card-based UI similar to Google Maps info panels
  const box = document.getElementById('info-box');
  if (!box) return;

  // Compute GST suggestion based on emissions per km (illustrative only)
  function suggestGSTCategory(emPerKm) {
    if (!isFinite(emPerKm)) return null;
    // Simple heuristic thresholds (illustrative):
    // <=100 g/km -> Low-emission → possible reduced incentive (e.g., 5%)
    // 100-250 g/km -> Moderate → standard (e.g., 12-18%)
    // >250 g/km -> High → no reduction
    if (emPerKm <= 100) return { label: 'Low-emission', suggestion: 'Reduced rate (e.g. 5%)', reason: 'Very low CO₂ per km' };
    if (emPerKm <= 250) return { label: 'Moderate-emission', suggestion: 'Standard rate (e.g. 12–18%)', reason: 'Moderate CO₂ per km' };
    return { label: 'High-emission', suggestion: 'No reduced rate', reason: 'High CO₂ per km' };
  }

  const headerHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(0,0,0,0.04);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:44px;height:44px;border-radius:8px;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(16,24,40,0.06);font-size:20px;">🏞️</div>
        <div>
          <div style="font-weight:700;color:#064e3b;">Tourist Attractions</div>
          <div style="font-size:12px;color:#0f5132;">${(dk || '0.00')} km • ${vt.toUpperCase()} • ${my}</div>
        </div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <div style="font-weight:700;color:#064e3b;">${(em || '0').toString()} g CO₂</div>
        <div style="font-size:12px;color:#0f5132;">${totalLandmarks} landmarks</div>
      </div>
    </div>
    <div style="position:absolute;top:8px;right:8px;">
      <button class="min-btn" onclick="document.getElementById('info-box').classList.toggle('collapsed')">—</button>
    </div>
  `;

  // GST suggestion (illustrative). Show based on emissions per km
  try {
    const numericEm = parseFloat(em) || 0;
    const numericKm = parseFloat(dk) || 0.001;
    const perKm = numericKm > 0 ? (numericEm / numericKm) : null;
    const gst = suggestGSTCategory(perKm);
    if (gst) {
      const suggHtml = `
        <div class="route-suggestion">
          <div class="gst-label">${escapeHtml(gst.label)}</div>
          <div class="gst-body">
            <strong>${escapeHtml(gst.suggestion)}</strong> — ${escapeHtml(gst.reason)}
            <small>Note: This is an illustrative suggestion based on CO₂; consult tax authorities for real GST decisions.</small>
          </div>
        </div>
      `;
      if (!extraHtml) extraHtml = '';
      extraHtml = suggHtml + (extraHtml || '');
    }
  } catch (_) {}

  const trafficHtml = extraHtml ? `<div class="traffic-snippet">${extraHtml}</div>` : '';

  // Build categories list as compact cards
  let categoriesHtml = '<div style="padding:12px;display:flex;flex-direction:column;gap:10px;max-height:320px;overflow:auto;">';
  Object.keys(TOURIST_CATEGORIES).forEach(key => {
    const cat = TOURIST_CATEGORIES[key];
    const items = (filteredGrouped && filteredGrouped[key]) || [];
    if (!items || items.length === 0) return;
    const uniqueItems = dedupePlacesByKey(items);
    const itemsHtml = uniqueItems.map(p => {
      const pp = (p && p.name) ? p.name : 'Unnamed';
      const pid = getPlaceKey(p);
      return `<div class="tour-card-item" data-place-id="${pid}" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:#fff;border:1px solid #eef2f7;cursor:pointer;">
                <div style="width:36px;height:36px;border-radius:6px;background:${cat.color}22;display:flex;align-items:center;justify-content:center;font-size:16px">${cat.emoji}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;color:#0f172a;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${escapeHtml(pp)}</div>
                  <div style="font-size:12px;color:#6b7280">${(p.routeProgress ? Math.round(p.routeProgress*100)+'% along route' : '')}${p.routeDistance ? ' • '+Math.round(p.routeDistance)+'m from route' : ''}</div>
                </div>
                <div style="font-size:12px;color:#94a3b8">Go</div>
              </div>`;
    }).join('');

    categoriesHtml += `<div style="border-radius:10px;padding:8px;background:linear-gradient(180deg,#ffffff,#fbfdff);box-shadow:0 6px 18px rgba(16,24,40,0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#0f172a"><span style="font-size:18px">${cat.emoji}</span>${cat.label}</div>
          <div style="background:${cat.color};color:#fff;padding:4px 8px;border-radius:12px;font-weight:700;font-size:12px">${uniqueItems.length}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">${itemsHtml}</div>
      </div>`;
  });
  categoriesHtml += '</div>';

  const bodyHtml = `
    <div style="font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;">
      ${headerHtml}
      <div class="info-body">
        ${trafficHtml}
        <div style="padding:10px;border-top:1px solid rgba(0,0,0,0.04);">
          ${ totalLandmarks > 0 ? categoriesHtml : `<div style="padding:20px;text-align:center;color:#64748b;background:#fff;border-radius:8px;border:1px solid #eef2f7">No landmarks found near this route.</div>` }
        </div>
      </div>
    </div>
  `;

  box.innerHTML = bodyHtml;
  autoCollapseInfoBoxOnSmallScreens();

  // Attach click handlers to each item
  try {
    box.querySelectorAll('.tour-card-item').forEach(el => {
      el.addEventListener('click', () => {
        const pid = el.getAttribute('data-place-id');
        const marker = markerByPlaceId.get(pid);
        if (marker && map) {
          map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
          try { marker.openPopup(); } catch(_) {}
        }
        // highlight briefly
        el.style.boxShadow = '0 6px 20px rgba(16,24,40,0.08)';
        setTimeout(() => { el.style.boxShadow = ''; }, 800);
      });
    });
  } catch (_) {}

  // Keep refresh behavior
  try { if (map) { map.off('click', refreshTouristInfoBox); map.on('click', refreshTouristInfoBox); } } catch(_) {}
}

// small helper to avoid XSS in injected HTML
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Collapse info box by default on small screens for better map visibility
function autoCollapseInfoBoxOnSmallScreens() {
  try {
    const box = document.getElementById('info-box');
    if (!box) return;
    const isSmall = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isSmall) box.classList.add('collapsed');
  } catch (_) {}
}

// Function to find green/nature places along a route
async function findGreenPlacesAlongRoute(routeGeometry, sourceCoords, destCoords) {
  const greenPlaces = [];
  
  try {
    // Extract waypoints from the route geometry
    const waypoints = routeGeometry.coordinates.map(coord => [coord[1], coord[0]]);
    
    // Search for green places near waypoints (every 5th point to avoid too many API calls)
    for (let i = 0; i < waypoints.length; i += 5) {
      const waypoint = waypoints[i];
      
      try {
        // Search for parks, forests, nature reserves, etc.
        const searchQueries = [
          'park',
          'forest', 
          'nature reserve',
          'botanical garden',
          'wildlife sanctuary',
          'green space',
          'trail',
          'lake',
          'river',
          'mountain',
          'beach'
        ];

        for (const query of searchQueries) {
          const places = await searchNearbyPlaces(waypoint[0], waypoint[1], query, 2000); // 2km radius
          greenPlaces.push(...places);
        }
      } catch (error) {
        console.log(`Error searching near waypoint ${i}:`, error);
      }
    }

    // Remove duplicates and limit results
    const uniquePlaces = removeDuplicatePlaces(greenPlaces);
    return uniquePlaces.slice(0, 30); // Return max 30 places for better coverage
  } catch (error) {
    console.error('Error in findGreenPlacesAlongRoute:', error);
    return [];
  }
}

// Function to search for places near a coordinate
async function searchNearbyPlaces(lat, lng, query, radius) {
  try {
    const params = new URLSearchParams({
      q: query,
      lat: lat,
      lon: lng,
      radius: radius,
      limit: '5'
    });
    const response = await fetchWithTimeout(`http://localhost:5000/proxy/nominatim/search?${params.toString()}`, {}, 10000);
    if (!response.ok) return [];
    const data = await response.json();
    
    return data.map(place => ({
      name: place.display_name.split(',')[0] || place.display_name,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      type: getPlaceType(query),
      description: getPlaceDescription(place.display_name, query)
    }));
  } catch (error) {
    console.error('Error searching places:', error);
    return [];
  }
}

// Function to get place type based on search query
function getPlaceType(query) {
  const typeMap = {
    'park': '🌳 Park',
    'forest': '🌲 Forest',
    'nature reserve': '🦅 Nature Reserve',
    'botanical garden': '🌸 Botanical Garden',
    'wildlife sanctuary': '🦌 Wildlife Sanctuary',
    'green space': '🌿 Green Space',
    'trail': '🥾 Trail',
    'lake': '🏞️ Lake',
    'river': '🌊 River',
    'mountain': '⛰️ Mountain',
    'beach': '🏖️ Beach'
  };
  return typeMap[query] || '🌿 Green Place';
}

// Function to get place description
function getPlaceDescription(displayName, query) {
  const parts = displayName.split(',');
  if (parts.length >= 2) {
    return parts.slice(1, 3).join(', ').trim();
  }
  return displayName;
}

// Function to remove duplicate places
function removeDuplicatePlaces(places) {
  const seen = new Set();
  return places.filter(place => {
    const key = `${place.lat.toFixed(4)}-${place.lng.toFixed(4)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Function to calculate green route distance (including detours to green places)
function calculateGreenRouteDistance(routeGeometry, greenPlaces) {
  // For now, return the original route distance
  // In a more advanced version, this could calculate actual detours
  const coordinates = routeGeometry.coordinates;
  let totalDistance = 0;
  
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i-1];
    const curr = coordinates[i];
    const distance = calculateDistance(prev[1], prev[0], curr[1], curr[0]);
    totalDistance += distance;
  }
  
  return (totalDistance / 1000).toFixed(2); // Convert to km
}

// Function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}



// Focus map on a place when user clicks the popup button
function focusPlace(lat, lon) {
  try {
    if (!map) return;
    map.setView([lat, lon], Math.max(map.getZoom(), 16));
    const temp = L.circleMarker([lat, lon], { radius: 8, color: '#10b981', fillColor: '#10b981', fillOpacity: 0.9 });
    temp.addTo(map);
    setTimeout(() => { try { map.removeLayer(temp); } catch(_) {} }, 2000);
  } catch (_) {}
}
async function loadRecentSafe() {
  try {
    await loadRecent();
  } catch(e) {
    console.error("Failed to load recent routes:", e);
    // Optionally hide or clear recent routes table
  }
}
document.addEventListener("DOMContentLoaded", loadRecentSafe);
document.addEventListener("DOMContentLoaded", () => {
  loadRecentSafe();

  const hamburger = document.getElementById("hamburger");
  const sidebar = document.getElementById("sidebar");
  const homeSidebar = document.getElementById("homeSidebar");
  const mapContainer = document.getElementById("mapContainer");
  const overlay = document.getElementById("sidebarOverlay");

  // Setup keyboard support for popups
  setupKeyboardPopupSupport();
  
  // Test landmark search functionality
  setTimeout(() => {
    testLandmarkSearch().then(success => {
      if (success) {
        console.log('✅ Landmark search test passed');
      } else {
        console.warn('⚠️ Landmark search test failed - landmarks may not be found');
      }
    });
  }, 2000); // Test after 2 seconds

  // Close buttons inside both sidebars
  const closeButtons = document.querySelectorAll('.close-btn');
  closeButtons.forEach(btn => btn.addEventListener('click', () => {
    sidebar.classList.remove('open');
    homeSidebar.classList.add('hidden');
    overlay.classList.remove('show');
    // Show hamburger icon only when no sidebars are visible
    document.getElementById("hamburger").classList.remove("hidden");
    // Remove sidebar-open class from map container
    document.getElementById("mapContainer").classList.remove("sidebar-open");
  }));

  hamburger.addEventListener("click", () => {
    if (mapContainer.style.display === "block") {
      sidebar.classList.toggle("open");
      overlay.classList.toggle('show', sidebar.classList.contains('open'));
      // Hide hamburger when map sidebar is open
      if (sidebar.classList.contains('open')) {
        hamburger.classList.add('hidden');
        document.getElementById("mapContainer").classList.add("sidebar-open");
      } else {
        hamburger.classList.remove('hidden');
        document.getElementById("mapContainer").classList.remove("sidebar-open");
      }
    } else {
      homeSidebar.classList.toggle("hidden");
      overlay.classList.toggle('show', !homeSidebar.classList.contains('hidden'));
      // Hide hamburger when home sidebar is open
      if (!homeSidebar.classList.contains('hidden')) {
        hamburger.classList.add('hidden');
      } else {
        hamburger.classList.remove('hidden');
      }
    }
  });

  // Clicking overlay closes any open sidebar
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    homeSidebar.classList.add('hidden');
    overlay.classList.remove('show');
    // Show hamburger icon when sidebar is closed
    document.getElementById("hamburger").classList.remove("hidden");
    // Remove sidebar-open class from map container
    document.getElementById("mapContainer").classList.remove("sidebar-open");
  });
    const touristBtn = document.getElementById("touristBtn");
  if (touristBtn) {
    touristBtn.addEventListener("click", () => {
      findTouristRoute().catch(err => {
        console.error("Error finding tourist route:", err);
        alert("Failed to find tourist route. Check console for details.");
      });
    });
  }
    // Live traffic toggle button (floating on map)
    try {
      const liveBtn = document.createElement('button');
      liveBtn.id = 'liveTrafficBtn';
      liveBtn.innerText = 'Live Traffic';
      liveBtn.style.position = 'absolute';
      liveBtn.style.top = '12px';
      liveBtn.style.right = '12px';
      liveBtn.style.zIndex = 8000;
      liveBtn.style.background = '#111827';
      liveBtn.style.color = '#fff';
      liveBtn.style.border = 'none';
      liveBtn.style.padding = '8px 10px';
      liveBtn.style.borderRadius = '8px';
      liveBtn.style.cursor = 'pointer';
      liveBtn.style.boxShadow = '0 6px 18px rgba(2,6,23,0.3)';
      document.body.appendChild(liveBtn);
      liveBtn.addEventListener('click', async () => {
        if (!liveTrafficEnabled) {
          // FIXED: Direct key retrieval from TOMTOM_CONFIG (bypass broken detection)
          if (!TRAFFIC_KEY) {
            const k1 = TOMTOM_CONFIG?.PRIMARY_KEY;
            const k2 = TOMTOM_CONFIG?.SECONDARY_KEY;
            if (k1 || k2) {
              TRAFFIC_KEY = k1 || k2;
              console.log('✓ Traffic key set from TOMTOM_CONFIG');
            }
          }
          
          if (!TRAFFIC_KEY) {
            console.warn('⚠ No TomTom key. Traffic unavailable.');
            return;
          }
          
          enableLiveTraffic();
          liveBtn.style.background = '#0ea5a4';
          liveBtn.innerText = 'Traffic: ON';
          console.log('✓ Live Traffic ENABLED');
        } else {
          disableLiveTraffic();
          liveBtn.style.background = '#111827';
          liveBtn.innerText = 'Live Traffic';
          console.log('✓ Live Traffic DISABLED');
        }
      });

      // Report incident button (simple demo: reports at map center)
      const reportBtn = document.createElement('button');
      reportBtn.id = 'reportIncidentBtn';
      reportBtn.innerText = 'Report Incident';
      reportBtn.style.position = 'absolute';
      reportBtn.style.top = '56px';
      reportBtn.style.right = '12px';
      reportBtn.style.zIndex = 8000;
      reportBtn.style.background = '#b91c1c';
      reportBtn.style.color = '#fff';
      reportBtn.style.border = 'none';
      reportBtn.style.padding = '8px 10px';
      reportBtn.style.borderRadius = '8px';
      reportBtn.style.cursor = 'pointer';
      reportBtn.style.boxShadow = '0 6px 18px rgba(2,6,23,0.3)';
      document.body.appendChild(reportBtn);
      reportBtn.addEventListener('click', async () => {
        try {
          // Offer the user options where to report the incident
          const mode = prompt('Report incident at:\n1) Map center\n2) Click on map to choose location\n3) Enter lat,lon manually\nEnter 1, 2 or 3', '1');
          if (mode === null) return; // cancelled
          const modeTrim = String(mode).trim();

          const typeInput = prompt('Incident type (accident/roadwork/other):', 'accident');
          if (typeInput === null) return;
          const type = typeInput.trim() || 'accident';

          const sevInput = prompt('Severity 1-3 (1 low, 3 high):', '2');
          if (sevInput === null) return;
          const sevParsed = parseInt(sevInput, 10);
          const severity = Math.max(1, Math.min(3, isNaN(sevParsed) ? 2 : sevParsed));

          const noteInput = prompt('Short note (optional):', '');
          if (noteInput === null) return;
          const note = noteInput || '';

          let lat, lon;
          if (modeTrim === '2') {
            // Wait for user to click on the map once
            try {
              alert('Click on the map to place the incident location.');
              const coords = await new Promise((resolve) => {
                const handler = function(e) { map.off('click', handler); resolve([e.latlng.lat, e.latlng.lng]); };
                map.on('click', handler);
              });
              lat = coords[0]; lon = coords[1];
            } catch (e) {
              console.error('Map click selection failed', e);
              alert('Failed to get click location');
              return;
            }
          } else if (modeTrim === '3') {
            const coordText = prompt('Enter coordinates as lat,lon (e.g. 12.9716,77.5946):', '');
            if (!coordText) return;
            const parts = coordText.split(',').map(s => parseFloat(s.trim()));
            if (parts.length !== 2 || parts.some(isNaN)) { alert('Invalid coordinates'); return; }
            lat = parts[0]; lon = parts[1];
          } else {
            // default: map center
            const c = map.getCenter(); lat = c.lat; lon = c.lng;
          }

          const incident = reportIncident(type, { lat, lon, severity, note });
          // Try to persist to backend (best-effort)
          try {
            fetch(`${BACKEND_BASE}/report-incident`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type, lat, lon, severity, note })
            }).then(r => r.json()).then(d => console.log('Server saved incident', d)).catch(e => console.warn('Server save failed', e));
          } catch (_) {}

          // Ensure the user sees the reported incident: pan to it and show a temporary highlight
          try {
            if (incident && typeof incident.lat === 'number' && typeof incident.lon === 'number') {
              try { map.panTo([incident.lat, incident.lon]); } catch(_){}
              try {
                const h = L.circleMarker([incident.lat, incident.lon], { radius: 10, color: '#ff0044', weight: 2, fillOpacity: 0.25 }).addTo(map);
                h.bindPopup(`<strong>${escapeHtml(incident.type)}</strong><br/>Reported`).openPopup();
                setTimeout(() => { try { map.removeLayer(h); } catch(_){} }, 9000);
              } catch (_) {}
            }
          } catch (_) {}

          alert('Incident reported at selected location.');
        } catch (e) { console.error('report incident failed', e); alert('Failed to report incident'); }
      });
      try { ensureIncidentsInitialized(); } catch(_) {}
    } catch (_) {}
});

// Fill source with current location using Nominatim reverse geocoding
async function useCurrentLocationForSource() {
  try {
    if (!navigator.geolocation) {
      alert('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      try {
        const params = new URLSearchParams({
          lat,
          lon,
          format: 'jsonv2'
        });
        const res = await fetchWithTimeout(`http://localhost:5000/proxy/nominatim/reverse?${params.toString()}`, {}, 10000);
        const data = await res.json();
        const disp = data && (data.display_name || (data.address && (data.address.city || data.address.town || data.address.village)));
        document.getElementById('source').value = disp || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        // Center map and set a marker hint
        if (map) {
          map.setView([lat, lon], 13);
          L.marker([lat, lon]).addTo(map).bindPopup('Your current location').openPopup();
        }
      } catch (_) {
        document.getElementById('source').value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      }
    }, (err) => {
      console.error('geo error', err);
      alert('Unable to access your location. Please allow location permission.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  } catch (e) {
    console.error(e);
  }
}

// Function to refresh the tourist info box with current data
function refreshTouristInfoBox() {
  try {
    const infoBox = document.getElementById('info-box');
    if (!infoBox) return;
    
    // Check if we have current tourist data
    if (window.currentTouristData) {
      const { distanceKm, emissions, vehicleType, modelYear, grouped, extraHtml } = window.currentTouristData;
      // Preserve scroll position to avoid jumping when refreshed
      const prevScroll = infoBox.scrollTop || 0;
      displayTouristRouteInfo({ distanceKm, emissions, vehicleType, modelYear, grouped, extraHtml });
      try { infoBox.scrollTop = prevScroll; } catch (_) {}
    }
  } catch (error) {
    console.warn('Error refreshing tourist info box:', error);
  }
}

// Function to update current tourist data for real-time sync
function updateCurrentTouristData(data) {
  window.currentTouristData = data;
}

// Function to handle marker clicks and highlight in info box
function handleMarkerClick(marker, placeId) {
  try {
    // Highlight the clicked item in the info box
    const infoBox = document.getElementById('info-box');
    if (infoBox) {
      // Remove previous highlights
      const prevHighlighted = infoBox.querySelectorAll('.highlighted');
      prevHighlighted.forEach(el => el.classList.remove('highlighted'));
      
      // Highlight the clicked item
      const listItem = infoBox.querySelector(`li[data-place-id="${placeId}"]`);
      if (listItem) {
        listItem.classList.add('highlighted');
        listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    
    // Refresh the info box to ensure it's up to date
    refreshTouristInfoBox();
  } catch (error) {
    console.warn('Error handling marker click:', error);
  }
}
async function updateTouristPlacesAlongRoute(routeGeometry) {
  try {
    const osmPlaces = await searchComprehensivePlaces(routeGeometry);
    const tomtomPlaces = await fetchTomTomPOIs(routeGeometry, 'petrol', {}); // replace 'petrol' with vehicleType

    // Deduplicate and combine
    const allPlaces = [...osmPlaces, ...tomtomPlaces.flat];
    const grouped = {};
    for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
    for (const place of allPlaces) {
      const cat = place.category || 'monuments'; // default category
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(place);
    }

  displayTouristAttractions(grouped);
  return grouped;
  } catch (e) {
    console.error("Error fetching/displaying tourist places:", e);
    return {};
  }
}

// Function to start periodic refresh of tourist info box
function startTouristInfoBoxRefresh() {
  // Clear any existing interval
  if (window.touristInfoBoxInterval) {
    clearInterval(window.touristInfoBoxInterval);
  }
  
  // Set up periodic refresh every 5 seconds
  window.touristInfoBoxInterval = setInterval(() => {
    try {
      const box = document.getElementById('info-box');
      if (!box) return;

      // If user is hovering or actively scrolled into the box, skip refresh to avoid jumping
  const isHover = box.matches(':hover');
  const isScrolled = (box.scrollTop || 0) > 20; // user scrolled down
  if (isHover || isScrolled) return;
  // If we are showing the route summary (user clicked Calculate), don't auto-refresh tourist info
  if (window.showingRouteSummary) return;

      if (window.currentTouristData) {
        refreshTouristInfoBox();
      }
    } catch (_) {}
  }, 5000);
}

// Function to stop periodic refresh
function stopTouristInfoBoxRefresh() {
  if (window.touristInfoBoxInterval) {
    clearInterval(window.touristInfoBoxInterval);
    window.touristInfoBoxInterval = null;
  }
}

// Function to cleanup tourist route resources
function cleanupTouristRoute() {
  stopTouristInfoBoxRefresh();
  window.currentTouristData = null;
  
  // Clear markers
  markerByPlaceId.forEach(marker => {
    try { map.removeLayer(marker); } catch(_) {}
  });
  markerByPlaceId.clear();
  // remove endpoint markers if present
  try { if (sourceMarker) { map.removeLayer(sourceMarker); sourceMarker = null; } } catch(_) {}
  try { if (destMarker) { map.removeLayer(destMarker); destMarker = null; } } catch(_) {}
}

// Function to setup map popup management
function setupMapPopupManagement() {
  if (!map) return;
  
  // Close popups when map is clicked
  map.on('click', (e) => {
    // Only close if clicking on the map itself, not on markers
    if (e.originalEvent.target.classList.contains('leaflet-interactive') ||
        e.originalEvent.target.classList.contains('leaflet-map-pane')) {
      closeAllPopups();
    }
  });
  
  // Close popups when map is moved
  map.on('moveend', () => {
    closeAllPopups();
  });
  
  // Close popups when zooming
  map.on('zoomend', () => {
    closeAllPopups();
  });
  
  // Close popups when dragging starts
  map.on('dragstart', () => {
    closeAllPopups();
  });
}

// Function to handle keyboard interactions for popups
function setupKeyboardPopupSupport() {
  document.addEventListener('keydown', (e) => {
    // Escape key closes all popups
    if (e.key === 'Escape') {
      closeAllPopups();
    }
    
    // Tab key navigation support for popups
    if (e.key === 'Tab' && currentOpenPopup) {
      const popupElement = currentOpenPopup.getElement();
      if (popupElement) {
        const focusableElements = popupElement.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length > 0) {
          if (e.shiftKey) {
            // Shift+Tab: focus previous element
            if (document.activeElement === focusableElements[0]) {
              e.preventDefault();
              focusableElements[focusableElements.length - 1].focus();
            }
          } else {
            // Tab: focus next element
            if (document.activeElement === focusableElements[focusableElements.length - 1]) {
              e.preventDefault();
              focusableElements[0].focus();
            }
          }
        }
      }
    }
  });
}

// Fallback landmark search using Nominatim when Overpass fails
async function fallbackLandmarkSearch(bbox) {
  console.log('Using fallback Nominatim search for landmarks...');
  const { south, west, north, east } = bbox;
  
  // Search queries for different types of landmarks (reduced set to avoid rate limits)
  const searchQueries = [
    'park', 'museum', 'temple', 'church', 'restaurant', 'hotel', 'bank',
    'lake', 'river', 'beach', 'forest', 'mountain', 'viewpoint', 'monument',
    'castle', 'fort', 'palace', 'cinema', 'library'
  ];
  
  const allPlaces = [];
  const centerLat = (south + north) / 2;
  const centerLon = (west + east) / 2;
  let successCount = 0;
  let failCount = 0;
  
  for (const query of searchQueries) {
    try {
      const params = new URLSearchParams({
        q: query,
        viewbox: `${west},${north},${east},${south}`,
        bounded: '1',
        limit: '10'
      });
      const res = await fetchWithTimeout(`http://localhost:5000/proxy/nominatim/search?${params.toString()}`, {}, 10000);
      
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(place => {
            if (place.lat && place.lon) {
              const category = determineCategoryFromNominatim(place, query);
              allPlaces.push({
                id: `nominatim/${place.place_id}`,
                lat: parseFloat(place.lat),
                lon: parseFloat(place.lon),
                name: place.display_name.split(',')[0] || place.display_name,
                tags: {
                  source: 'nominatim',
                  category: category,
                  display_name: place.display_name
                },
                category: category
              });
            }
          });
          successCount++;
        }
      } else if (res.status === 403 || res.status === 429) {
        console.warn(`Nominatim rate-limited (${res.status}), stopping further queries`);
        failCount++;
        break; // Stop querying if rate-limited
      } else {
        console.warn(`Nominatim search for "${query}" failed: ${res.status}`);
        failCount++;
      }
      
      // Longer delay to respect rate limits (Nominatim: 1 request/second recommended)
      await new Promise(resolve => setTimeout(resolve, 1200));
    } catch (error) {
      console.warn(`Failed to search for "${query}":`, error.message);
      failCount++;
      // Continue to next query even on error
    }
  }
  
  // Remove duplicates and limit results
  const uniquePlaces = dedupeByLocation(allPlaces);
  console.log(`Fallback search completed: ${successCount} queries succeeded, ${failCount} failed; found ${uniquePlaces.length} unique places`);
  return uniquePlaces;
}

// Determine category from Nominatim search results
function determineCategoryFromNominatim(place, query) {
  const displayName = place.display_name.toLowerCase();
  const placeType = place.type;
  
  // Map search queries to our categories
  if (query.includes('park') || query.includes('garden')) return 'parks';
  if (query.includes('museum')) return 'museums';
  if (query.includes('temple') || query.includes('church') || query.includes('mosque')) return 'temples';
  if (query.includes('hospital')) return 'hospitals';
  if (query.includes('restaurant')) return 'restaurants';
  if (query.includes('cafe')) return 'cafes';
  if (query.includes('hotel')) return 'hotels';
  if (query.includes('shopping') || query.includes('mall')) return 'malls';
  if (query.includes('market')) return 'markets';
  if (query.includes('bank') || query.includes('atm')) return 'atms';
  if (query.includes('fuel') || query.includes('station')) return 'fuel';
  if (query.includes('charging')) return 'ev';
  if (query.includes('lake') || query.includes('river')) return 'lakes';
  if (query.includes('beach')) return 'beaches';
  if (query.includes('forest') || query.includes('wood')) return 'forests';
  if (query.includes('mountain') || query.includes('peak')) return 'monuments';
  if (query.includes('castle') || query.includes('fort') || query.includes('palace')) return 'forts';
  if (query.includes('cinema') || query.includes('theater')) return 'cinemas';
  if (query.includes('library')) return 'museums';
  if (query.includes('monument')) return 'monuments';
  
  // Try to determine from place type and display name
  if (placeType === 'amenity') {
    if (displayName.includes('park')) return 'parks';
    if (displayName.includes('hospital')) return 'hospitals';
    if (displayName.includes('restaurant')) return 'restaurants';
    if (displayName.includes('cafe')) return 'cafes';
    if (displayName.includes('hotel')) return 'hotels';
    if (displayName.includes('school') || displayName.includes('university')) return 'museums';
  }
  
  if (placeType === 'tourism') {
    if (displayName.includes('museum')) return 'museums';
    if (displayName.includes('hotel')) return 'hotels';
    if (displayName.includes('attraction')) return 'monuments';
  }
  
  if (placeType === 'historic') {
    if (displayName.includes('castle')) return 'forts';
    if (displayName.includes('fort')) return 'forts';
    if (displayName.includes('palace')) return 'palaces';
    if (displayName.includes('monument')) return 'monuments';
  }
  
  if (placeType === 'leisure') {
    if (displayName.includes('park')) return 'parks';
    if (displayName.includes('garden')) return 'gardens';
  }
  
  if (placeType === 'natural') {
    if (displayName.includes('water')) return 'lakes';
    if (displayName.includes('wood') || displayName.includes('forest')) return 'forests';
    if (displayName.includes('beach')) return 'beaches';
  }
  
  // Default fallback
  return 'monuments';
}

// Test function to verify landmark search functionality
async function testLandmarkSearch() {
  console.log('Testing landmark search functionality...');
  
  // Test with a simple bbox around a known location (e.g., Delhi)
  const testBbox = {
    south: 28.4,
    west: 77.0,
    north: 28.8,
    east: 77.4
  };
  
  try {
    console.log('Testing fallback search...');
    const results = await fallbackLandmarkSearch(testBbox);
    console.log(`Fallback search test: Found ${results.length} landmarks`);
    
    if (results.length > 0) {
      console.log('Sample landmarks found:');
      results.slice(0, 5).forEach(place => {
        console.log(`- ${place.name} (${place.category}) at ${place.lat}, ${place.lon}`);
      });
    }
    
    return results.length > 0;
  } catch (error) {
    console.error('Landmark search test failed:', error);
    return false;
  }
}

// Function to order landmarks along the route from start to end
function orderLandmarksAlongRoute(landmarks, routeGeometry) {
  if (!landmarks || !landmarks.length || !routeGeometry) {
    return landmarks;
  }

  try {
  // Get route coordinates (normalized to [lon,lat])
  const routeCoords = getRouteCoords(routeGeometry) || [];
    if (routeCoords.length === 0) {
      console.warn('No route coordinates available for ordering');
      return landmarks;
    }

    // Calculate distance from start of route for each landmark
    const landmarksWithDistance = landmarks.map(landmark => {
      let minDistance = Infinity;
      let routeIndex = 0;

      // Measure perpendicular distance from landmark to full route geometry
      const distToRoute = routeCoords ? distancePointToPolylineMeters(landmark.lat, landmark.lon, routeCoords) : Infinity;
      if (Number.isFinite(distToRoute)) {
        minDistance = distToRoute;
      }

      // Find the closest vertex on the route to approximate progress
      let closestPointDistance = Infinity;
      for (let i = 0; i < routeCoords.length; i++) {
        const [lon, lat] = routeCoords[i];
        const dKm = calculateDistance(lat, lon, landmark.lat, landmark.lon);
        const dMeters = dKm * 1000;
        if (dMeters < closestPointDistance) {
          closestPointDistance = dMeters;
          routeIndex = i;
        }
      }

      // Fallback if perpendicular distance was not computed (e.g., short route)
      if (!Number.isFinite(minDistance)) {
        minDistance = closestPointDistance;
      }

      const routeProgress = routeCoords.length > 1
        ? routeIndex / (routeCoords.length - 1)
        : 0;

      return {
        ...landmark,
        routeDistance: Number.isFinite(minDistance) ? Math.round(minDistance) : null,
        routeIndex: routeIndex,
        routeProgress
      };
    });

    // Sort by route progress (from start to end)
    landmarksWithDistance.sort((a, b) => {
      // Primary sort: route progress (start to end)
      if (Math.abs(a.routeProgress - b.routeProgress) > 0.1) {
        return a.routeProgress - b.routeProgress;
      }
      // Secondary sort: distance from route (closer landmarks first)
      return a.routeDistance - b.routeDistance;
    });

    console.log(`Ordered ${landmarksWithDistance.length} landmarks along route from start to end`);
    return landmarksWithDistance;
  } catch (error) {
    console.error('Error ordering landmarks along route:', error);
    return landmarks;
  }
}

// Enhanced function to find and order tourist places along the route
async function findAllTouristPlacesAlongRoute(routeGeometry, corridorMeters = 1200) {
  let allPlaces = await searchComprehensivePlaces(routeGeometry);
  if (!allPlaces.length) {
    console.log('Primary search returned no results, trying segmented search...');
    allPlaces = await searchComprehensivePlacesSegmented(routeGeometry);
  }
  
  if (!allPlaces.length) {
    console.warn('Both primary and segmented search failed, trying emergency fallback...');
    const emergencyBbox = computeBufferedBbox(routeGeometry, 0.1);
    allPlaces = await fallbackLandmarkSearch(emergencyBbox);
  }
  
  if (!allPlaces.length) {
    console.error('All search methods failed - no landmarks found');
    return { grouped: {}, flat: [] };
  }
  
  console.log(`Found ${allPlaces.length} total places before filtering`);
  
  // Filter places within corridor using normalized route coordinates
  const routeCoords = getRouteCoords(routeGeometry);
  const withinCorridor = allPlaces.filter(p => {
    const d = routeCoords ? distancePointToPolylineMeters(p.lat, p.lon, routeCoords) : Infinity;
    return d <= corridorMeters;
  });
  
  console.log(`${withinCorridor.length} places within ${corridorMeters}m corridor`);
  
  const deduped = dedupeByLocation(withinCorridor);
  const categorized = deduped.map(p => {
    const cat = determineCategory(p.tags);
    return { ...p, category: cat };
  }).filter(p => !!p.category);

  // Group and limit per category (increased for better coverage)
  const grouped = {};
  for (const key of Object.keys(TOURIST_CATEGORIES)) grouped[key] = [];
  
  for (const p of categorized) {
    const key = p.category;
    if (!grouped[key]) grouped[key] = [];
    if (grouped[key].length < 30) grouped[key].push(p); // Increased from 25 to 30
  }

  // Order landmarks within each category along the route
  Object.keys(grouped).forEach(key => {
    if (grouped[key].length > 0) {
      grouped[key] = orderLandmarksAlongRoute(grouped[key], routeGeometry);
    }
  });

  const flat = Object.values(grouped).flat();
  
  console.log(`Final result: ${flat.length} landmarks in ${Object.keys(grouped).filter(k => grouped[k].length > 0).length} categories, ordered along route`);
  return { grouped, flat };
}

// Enhanced popup management with better cursor interaction

// Function to close all open popups
function closeAllPopups() {
  if (currentOpenPopup) {
    try {
      currentOpenPopup.closePopup();
    } catch (_) {}
    currentOpenPopup = null;
  }
}

// Function to close popup after delay (for hover interactions)
function closePopupAfterDelay(popup, delay = 1500) {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
  }
  hoverTimeout = setTimeout(() => {
    if (popup && popup.isOpen() && popup !== currentOpenPopup) {
      popup.closePopup();
    }
  }, delay);
}

// Function to handle popup open event
function onPopupOpen(popup) {
  closeAllPopups();
  currentOpenPopup = popup;
}

// Function to handle popup close event
function onPopupClose() {
  if (currentOpenPopup) {
    currentOpenPopup = null;
  }
}

// Enhanced marker hover and click handling
function setupMarkerInteraction(marker, place, category) {
  const cat = TOURIST_CATEGORIES[category];
  
  // Create enhanced popup content with route information
  const routeProgress = place.routeProgress || 0;
  const progressPercent = Math.round(routeProgress * 100);
  const distanceFromRoute = place.routeDistance ? Math.round(place.routeDistance) : '?';
  
  const popupContent = `
    <div class="tourist-popup">
      <div class="popup-header" style="border-bottom: 2px solid ${cat.color}; padding-bottom: 8px; margin-bottom: 12px;">
        <h4 style="margin: 0; color: ${cat.color}; font-size: 16px;">${cat.emoji} ${place.name}</h4>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">${cat.label}</div>
      </div>
      <div class="popup-details">
        <div class="detail-row">
          <span class="detail-label">Route Progress:</span>
          <span class="detail-value">${progressPercent}% along route</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Distance from Route:</span>
          <span class="detail-value">${distanceFromRoute}m</span>
        </div>
        ${place.tags && place.tags.addr_full ? `
          <div class="detail-row">
            <span class="detail-label">Address:</span>
            <span class="detail-value">${place.tags.addr_full}</span>
          </div>
        ` : ''}
        ${place.tags && place.tags.phone ? `
          <div class="detail-row">
            <span class="detail-label">Phone:</span>
            <span class="detail-value">📞 ${place.tags.phone}</span>
          </div>
        ` : ''}
        ${place.tags && place.tags.website ? `
          <div class="detail-row">
            <span class="detail-label">Website:</span>
            <span class="detail-value">🌐 ${place.tags.website}</span>
          </div>
        ` : ''}
        ${place.tags && place.tags.opening_hours ? `
          <div class="detail-row">
            <span class="detail-label">Hours:</span>
            <span class="detail-value">🕒 ${place.tags.opening_hours}</span>
          </div>
        ` : ''}
      </div>
      <div class="popup-actions">
        <button class="primary-btn" onclick="navigateToLandmark(${place.lat}, ${place.lon})">📍 Navigate</button>
        <button class="secondary-btn" onclick="addToFavorites('${place.id}')">❤️ Save</button>
      </div>
    </div>
  `;

  // Bind popup with enhanced styling
  marker.bindPopup(popupContent, { 
    className: 'enhanced-popup',
    maxWidth: 300,
    minWidth: 250,
    closeButton: true,
    autoClose: false,
    closeOnClick: false
  });

  // Enhanced popup event handling
  marker.on('popupopen', () => onPopupOpen(marker.getPopup()));
  marker.on('popupclose', onPopupClose);

  // Enhanced hover interactions
  marker.on('mouseover', () => {
    lastHoveredMarker = marker;
    
    // Show popup on hover after a short delay
    setTimeout(() => {
      if (lastHoveredMarker === marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }, 300);
  });

  marker.on('mouseout', () => {
    if (lastHoveredMarker === marker) {
      lastHoveredMarker = null;
    }
    
    // Close popup after delay if not clicked
    if (marker.isPopupOpen() && marker.getPopup() !== currentOpenPopup) {
      closePopupAfterDelay(marker.getPopup(), 1000);
    }
  });

  // Enhanced click handling
  marker.on('click', () => {
    // Ensure popup stays open on click
    if (!marker.isPopupOpen()) {
      marker.openPopup();
    }
    
    // Highlight corresponding item in info box
    highlightInfoBoxItem(place.id);
  });

  return marker;
}

// Function to highlight corresponding item in info box
function highlightInfoBoxItem(placeId) {
  try {
    const infoBox = document.getElementById('info-box');
    if (!infoBox) return;
    
    // Remove previous highlights
    infoBox.querySelectorAll('.cat-list li').forEach(item => {
      item.classList.remove('highlighted');
    });
    
    // Find and highlight the corresponding item
    const listItem = infoBox.querySelector(`[data-place-id="${placeId}"]`);
    if (listItem) {
      listItem.classList.add('highlighted');
      listItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (error) {
    console.error('Error highlighting info box item:', error);
  }
}

// Function to navigate to landmark (placeholder for future implementation)
function navigateToLandmark(lat, lng) {
  // This could open Google Maps, Apple Maps, or other navigation apps
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank');
}

// Function to add landmark to favorites (placeholder for future implementation)
function addToFavorites(placeId) {
  console.log('Adding to favorites:', placeId);
  // This could save to localStorage or send to backend
  alert('Favorite feature coming soon!');
}
