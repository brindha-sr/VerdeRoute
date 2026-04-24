# GreenRoute — Eco‑Friendly Route Planner 🌿

Plan routes, visualise real-time traffic, report incidents, and compare CO₂ emissions across vehicle types — all powered by OpenStreetMap and MongoDB.

- **Frontend:** `index.html` + `style.css` + `map.js` (Leaflet, OpenStreetMap, Mapbox Directions)
- **Backend:** `server.js` (Node.js, Express, MongoDB via Mongoose)

---

## Features

| Feature | Description |
|---------|-------------|
| 🗺️ **Interactive Map** | Leaflet + OpenStreetMap with main and alternate routes |
| 🌿 **Tourist Green Routes** | Discover parks, forests, lakes, and nature reserves along your route |
| 🚦 **Live Traffic** | Real-time traffic overlay with colour-coded congestion (TomTom) |
| 🚨 **Incident Reporting** | Report accidents and roadworks; saved to MongoDB |
| 📊 **Emission Calculator** | CO₂ estimates by vehicle type and year |
| 💡 **Eco Suggestions** | Recommends the greenest travel mode for your trip |
| 🌙 **Dark Mode** | Toggle between light and dark themes |
| ⌨️ **Keyboard Shortcuts** | `H` Home · `M` Map · `T` Tourist · `/` Search |

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- MongoDB running on `localhost:27017`

### 2. Install & Run Backend

```bash
npm install
npm start
# → Server running on http://localhost:5000
# → MongoDB connected
```

### 3. Open the Frontend

Open `index.html` directly in your browser, or use VS Code Live Server.

---

## Configuration

| Setting | Location | Default | How to Change |
|---------|----------|---------|---------------|
| Server port | `server.js` | `5000` | Set `PORT` env variable |
| MongoDB URI | `server.js` | `mongodb://127.0.0.1:27017/ecoFindDB` | Set `MONGO_URI` env variable |
| TomTom API key | `server.js` | Bundled fallback | Set `TOMTOM_PRIMARY_KEY` env variable |
| Mapbox token | `map.js` | Bundled token | Replace `access_token=...` in both route URLs |

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/suggest` | Eco-mode suggestions by distance |
| `POST` | `/save-route` | Save a route to MongoDB |
| `GET` | `/recent-routes` | Retrieve recent routes |
| `POST` | `/report-incident` | Save a traffic incident |
| `GET` | `/recent-incidents` | Retrieve recent incidents |
| `GET` | `/proxy/tomtom/traffic` | Live traffic flow data |
| `GET` | `/proxy/tomtom/search` | TomTom POI search |
| `GET` | `/proxy/tomtom/category` | TomTom category search |
| `GET` | `/proxy/nominatim/search` | Forward geocoding |
| `GET` | `/proxy/nominatim/reverse` | Reverse geocoding |
| `POST` | `/proxy/overpass` | OpenStreetMap Overpass queries |

For full request/response details see **[API_COMPLETE_REFERENCE.md](API_COMPLETE_REFERENCE.md)**.

### Quick Examples

```bash
# Get eco-mode suggestions for a 12.5 km trip
curl -X POST http://localhost:5000/suggest \
  -H "Content-Type: application/json" \
  -d '{"distanceKm": 12.5}'

# Report a traffic incident
curl -X POST http://localhost:5000/report-incident \
  -H "Content-Type: application/json" \
  -d '{"lat":12.9716,"lon":77.5946,"type":"accident","severity":2,"note":"Collision on ring road"}'

# Recent incidents (last 24 h)
curl "http://localhost:5000/recent-incidents?limit=10"
```

---

## How Emissions Are Calculated

- Base rates (g CO₂/km): `petrol 192`, `diesel 171`, `electric 20`, `bike 103`, `bus 105`, `truck 400`, `electric_truck 100`, `walking 0`, `cycling 0`
- Travel time = distance ÷ average speed
- Older vehicles emit more: +1.5% per year before 2024

---

## 🌿 Tourist Green Routes

Enter any source and destination, then enable Tourist Routes to discover nature spots within 2 km of your path — parks, forests, lakes, trails — marked with 🌿 icons on the map. Click any marker for details.

---

## 🚦 Live Traffic

Click the **Live Traffic** button (top-right) to overlay real-time congestion from TomTom:
- 🟢 Green = free flow
- 🟡 Yellow = moderate congestion
- 🔴 Red = heavy congestion

Traffic refreshes automatically every 45 seconds.

---

## 🚨 Incident Reporting

Click **Report Incident** (red button) to report accidents, roadworks, or other hazards. Reports are:
- Displayed immediately as coloured markers on the map
- Saved to MongoDB for retrieval via `/recent-incidents`

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Routes don't render | Mapbox token expired | Replace `access_token=...` in `map.js` |
| `ECONNREFUSED 27017` | MongoDB not running | `sudo systemctl start mongodb` |
| Port 5000 in use | Another process | `kill $(lsof -t -i:5000)` or set `PORT=5001` |
| Geocoding fails | Nominatim rate limit | Wait 30–60 s and retry |
| Traffic shows nothing | TomTom key invalid | Set `TOMTOM_PRIMARY_KEY` env variable |

For more detail see **[COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md)**.

---

## Documentation

| File | Description |
|------|-------------|
| [COMPLETE_SETUP_GUIDE.md](COMPLETE_SETUP_GUIDE.md) | Full installation, configuration, and deployment guide |
| [API_COMPLETE_REFERENCE.md](API_COMPLETE_REFERENCE.md) | All API endpoints with request/response examples |
| [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) | 71 step-by-step test scenarios |

---

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript, Leaflet, OpenStreetMap, Mapbox Directions
- **Backend:** Node.js 18, Express 5, Mongoose 8, MongoDB
- **APIs:** TomTom Traffic, Nominatim Geocoding, Overpass (OSM)

## License

ISC — see `package.json`.

## Acknowledgements

OpenStreetMap contributors · Leaflet · Mapbox · TomTom · MongoDB · Express

---

Happy green driving! 🌿
