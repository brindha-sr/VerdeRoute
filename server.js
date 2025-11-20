const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// You provided a single API key to use for TomTom services.
// If you prefer to use environment variables, set TOMTOM_PRIMARY_KEY and TOMTOM_SECONDARY_KEY before starting the server.
const TOMTOM_PRIMARY_KEY = process.env.TOMTOM_PRIMARY_KEY || 'YTdu01NcxIfytU6EFEV891Yh3rGflVDW';
const TOMTOM_SECONDARY_KEY = process.env.TOMTOM_SECONDARY_KEY || 'YTdu01NcxIfytU6EFEV891Yh3rGflVDW';
const TOMTOM_BASE_URL = 'https://api.tomtom.com/search/2';

const app = express();
const PORT = 5000;
const path = require('path');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from the same directory (frontend assets)
app.use(express.static(path.join(__dirname)));

// ==== MONGODB CONNECTION ====
// Replace "ecoFindDB" with your preferred DB name
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ecoFindDB';
async function connectWithRetry(uri, opts = {}) {
  let delay = 1000; // 1s
  while (true) {
    try {
      await mongoose.connect(uri, Object.assign({ useNewUrlParser: true, useUnifiedTopology: true }, opts));
      console.log('MongoDB connected');
      break;
    } catch (err) {
      console.error('MongoDB connection error:', err && err.message ? err.message : err);
      console.log(`Retrying MongoDB connection in ${Math.round(delay/1000)}s...`);
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000); // exponential backoff up to 30s
    }
  }
}

// ==== SCHEMA & MODEL ====
const routeSchema = new mongoose.Schema({
  source: String,
  destination: String,
  vehicleType: String,
  vehicleYear: Number,
  distance: Number,
  emissions: Number,
  routeSource: { type: String, default: 'OSM' },
  date: { type: Date, default: Date.now }
});

const incidentSchema = new mongoose.Schema({
  type: { type: String, enum: ['accident', 'roadwork', 'other'], default: 'other' },
  lat: Number,
  lon: Number,
  severity: { type: Number, min: 1, max: 3, default: 2 },
  note: String,
  date: { type: Date, default: Date.now }
});

const RouteData = mongoose.model("RouteData", routeSchema);
const Incident = mongoose.model("Incident", incidentSchema);

// ==== EMISSION RATES & SPEEDS ====
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

const averageSpeeds = {
  petrol: 60,
  diesel: 60,
  electric: 60,
  bike: 40,
  bus: 45,
  truck: 50,
  electric_truck: 50,
  walking: 5,
  cycling: 15
};

// ==== ROUTE SUGGESTION ====
app.post('/suggest', (req, res) => {
  const { distanceKm } = req.body;
  if (!distanceKm) {
    return res.status(400).json({ error: 'Missing distanceKm' });
  }

  const suggestions = Object.keys(emissionRates).map(type => {
    const emission = (distanceKm * emissionRates[type]).toFixed(2);
    const time = (distanceKm / averageSpeeds[type]).toFixed(2);
    return { type, emission: parseFloat(emission), time };
  });

  suggestions.sort((a, b) => a.emission - b.emission);
  const best = suggestions[0];
  const alternatives = suggestions.slice(1);

  res.json({ best, alternatives });
});

// ==== SAVE ROUTE TO MONGODB ====
app.post("/save-route", async (req, res) => {
  try {
    const { source, destination, vehicleType, vehicleYear, modelYear, distance, emissions, routeSource } = req.body;

    // Accept either vehicleYear or modelYear from the client
    const resolvedYear = typeof vehicleYear === 'number' ? vehicleYear
      : (typeof modelYear === 'number' ? modelYear : undefined);

    if (!source || !destination || !vehicleType || !resolvedYear || !distance || emissions === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newRoute = new RouteData({
      source,
      destination,
      vehicleType,
      vehicleYear: resolvedYear,
      distance,
      emissions,
      routeSource: typeof routeSource === 'string' ? routeSource : 'OSM'
    });

    const savedRoute = await newRoute.save();
    res.json({ message: "Route saved successfully", data: savedRoute });
  } catch (err) {
    console.error(" Save route error:", err);
    res.status(500).json({ error: "Failed to save route" });
  }
});

// ==== RECENT ROUTES ====
app.get('/recent-routes', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const items = await RouteData.find().sort({ date: -1 }).limit(limit).lean();
    res.json({ items });
  } catch (err) {
    console.error(' Recent routes error:', err);
    res.status(500).json({ error: 'Failed to load recent routes' });
  }
});

// ==== REPORT INCIDENT ====
app.post('/report-incident', async (req, res) => {
  try {
    const { type = 'other', lat, lon, severity = 2, note = '' } = req.body;
    if (lat === undefined || lon === undefined) {
      return res.status(400).json({ error: 'Missing lat/lon' });
    }
    const validTypes = ['accident', 'roadwork', 'other'];
    const incidentType = validTypes.includes(type) ? type : 'other';
    const validSeverity = Math.max(1, Math.min(3, parseInt(severity, 10) || 2));
    
    const incident = new Incident({
      type: incidentType,
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      severity: validSeverity,
      note: String(note).substring(0, 500)
    });
    
    const saved = await incident.save();
    console.log(`✓ Incident reported: ${incidentType} at ${lat},${lon}`);
    res.json({ message: 'Incident reported successfully', incident: saved });
  } catch (err) {
    console.error('Report incident error:', err);
    res.status(500).json({ error: 'Failed to report incident', details: err.message });
  }
});

// ==== GET RECENT INCIDENTS ====
app.get('/recent-incidents', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const hoursBack = parseInt(req.query.hours || '24', 10);
    const dateFilter = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const incidents = await Incident.find({ date: { $gte: dateFilter } }).sort({ date: -1 }).limit(limit).lean();
    res.json({ incidents });
  } catch (err) {
    console.error('Recent incidents error:', err);
    res.status(500).json({ error: 'Failed to load incidents' });
  }
});

// ==== ROOT ====
app.get('/', (req, res) => {
  res.send('GreenRoute backend is running');
});

function selectTomTomKey(forcedKey) {
  if (forcedKey) return forcedKey;
  return TOMTOM_PRIMARY_KEY || TOMTOM_SECONDARY_KEY;
}

async function fetchTomTom(urlBuilder, key) {
  const keys = [];
  if (key) keys.push(key);
  if (TOMTOM_PRIMARY_KEY) keys.push(TOMTOM_PRIMARY_KEY);
  if (TOMTOM_SECONDARY_KEY) keys.push(TOMTOM_SECONDARY_KEY);

  const tried = new Set();
  for (const k of keys) {
    if (!k || tried.has(k)) continue;
    tried.add(k);
    const url = urlBuilder(k);
    try {
      console.debug('TomTom proxy request:', { url, key: k && (k.length > 8 ? k.slice(0,8)+'...' : k) });
      const resp = await fetch(url);
      if (resp.status === 403) {
        // key likely invalid/blocked; try next key
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text();
        const err = new Error(`TomTom error ${resp.status}: ${text}`);
        err.status = resp.status;
        err.body = text;
        throw err;
      }
      return resp;
    } catch (e) {
      // If this was a TomTom-error (with status) rethrow to caller
      if (e && e.status) throw e;
      // Otherwise log and continue trying other keys
      console.error('TomTom fetch failed for key (continuing):', { key: k && (k.length>8? k.slice(0,8)+'...':k), err: e && e.message });
      continue;
    }
  }
  throw new Error('TomTom request failed for all keys (403)');
}

app.get('/proxy/tomtom/search', async (req, res) => {
  try {
    const { query, lat, lon, key } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }
    const urlBuilder = (apiKey) => {
      const params = new URLSearchParams({
        key: apiKey,
        countrySet: 'IN',
        limit: '1'
      });
      if (lat) params.append('lat', lat);
      if (lon) params.append('lon', lon);
      return `${TOMTOM_BASE_URL}/search/${encodeURIComponent(query)}.json?${params.toString()}`;
    };

    const resp = await fetchTomTom(urlBuilder, selectTomTomKey(key));
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('TomTom search proxy error:', err && err.message ? err.message : err);
    // Instead of returning HTTP errors to the browser (which cause network console 500/403),
    // return a 200 with an empty results set and a proxyError flag so the client can handle gracefully.
    return res.json({ results: [], proxyError: true, details: err && (err.body || err.message) ? (err.body || err.message) : String(err) });
  }
});

app.get('/proxy/tomtom/category', async (req, res) => {
  try {
    const { category, lat, lon, radius = '1000', limit = '10', key } = req.query;
    if (!category || !lat || !lon) {
      return res.status(400).json({ error: 'Missing category/lat/lon' });
    }
    const urlBuilder = (apiKey) => {
      const params = new URLSearchParams({
        key: apiKey,
        lat,
        lon,
        radius,
        limit
      });
      return `${TOMTOM_BASE_URL}/categorySearch/${encodeURIComponent(category)}.json?${params.toString()}`;
    };

    const resp = await fetchTomTom(urlBuilder, selectTomTomKey(key));
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('TomTom category proxy error:', err && err.message ? err.message : err);
    // Return an empty results response to avoid network-level errors in the browser console.
    return res.json({ results: [], proxyError: true, details: err && (err.body || err.message) ? (err.body || err.message) : String(err) });
  }
});

// Proxy TomTom traffic flowSegmentData for client to avoid exposing keys and CORS
app.get('/proxy/tomtom/traffic', async (req, res) => {
  try {
    const { point, lat, lon, key } = req.query;
    let p = point;
    if (!p && lat && lon) p = `${lat},${lon}`;
    if (!p) return res.status(400).json({ error: 'Missing point (lat,lon) parameter' });
    const urlBuilder = (apiKey) => `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${encodeURIComponent(p)}&key=${encodeURIComponent(apiKey)}`;
    const resp = await fetchTomTom(urlBuilder, selectTomTomKey(key));
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('TomTom traffic proxy error:', err.message || err);
    // Return a 200 with proxyError so frontend can handle gracefully
    res.json({ results: [], proxyError: true, details: err.message || String(err) });
  }
});

app.get('/proxy/nominatim/search', async (req, res) => {
  try {
    const allowedParams = ['q', 'format', 'limit', 'countrycodes', 'lat', 'lon', 'radius', 'viewbox', 'bounded'];
    const params = new URLSearchParams();
    params.set('format', req.query.format || 'json');
    for (const key of allowedParams) {
      if (req.query[key]) {
        params.set(key, req.query[key]);
      }
    }
    if (!params.get('q')) {
      return res.status(400).json({ error: 'Missing q parameter' });
    }
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    // Nominatim requires a descriptive User-Agent and respects politeness delays
    const resp = await fetch(url, { 
      headers: { 
        'Accept': 'application/json', 
        'User-Agent': 'GreenRoute-EcoRouting/1.0 (+https://example.com/greenroute)' 
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`Nominatim search returned ${resp.status}:`, text.substring(0, 100));
      return res.status(resp.status).json({ error: 'Nominatim search failed', details: text });
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('Nominatim search proxy error:', err.message);
    res.status(500).json({ error: 'Nominatim search failed', details: err.message });
  }
});

app.get('/proxy/nominatim/reverse', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Missing lat/lon' });
    }
    const params = new URLSearchParams({
      format: req.query.format || 'jsonv2',
      lat,
      lon
    });
    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
    const resp = await fetch(url, { 
      headers: { 
        'Accept': 'application/json', 
        'User-Agent': 'GreenRoute-EcoRouting/1.0 (+https://example.com/greenroute)' 
      }
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`Nominatim reverse returned ${resp.status}:`, text.substring(0, 100));
      return res.status(resp.status).json({ error: 'Nominatim reverse failed', details: text });
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error('Nominatim reverse proxy error:', err.message);
    res.status(500).json({ error: 'Nominatim reverse failed', details: err.message });
  }
});

// Simple Overpass proxy to avoid CORS issues from the browser
app.post('/proxy/overpass', async (req, res) => {
  try {
    // accept raw body or JSON with 'data' field
    let query = req.body && req.body.data;
    if (!query && typeof req.rawBody === 'string') query = req.rawBody;
    if (!query && req.query && req.query.data) query = req.query.data;
    if (!query) return res.status(400).json({ error: 'Missing Overpass query in `data`' });

    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const resp = await fetch(overpassUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'GreenRoute/1.0 (contact@example.com)' },
      body: new URLSearchParams({ data: query })
    });
    const text = await resp.text();
    // Try to parse JSON, but send raw text if parsing fails
    try {
      const json = JSON.parse(text);
      res.json(json);
    } catch (_) {
      res.type('text/plain').send(text);
    }
  } catch (err) {
    console.error('Overpass proxy error:', err.message || err);
    res.status(500).json({ error: 'Overpass proxy failed', details: err.message || String(err) });
  }
});

// ==== START SERVER ====
// Wait for MongoDB to connect, then start the HTTP server.
(async () => {
  try {
    await connectWithRetry(MONGO_URI);
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to establish MongoDB connection, exiting:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
