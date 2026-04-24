# GreenRoute — Testing Checklist

Comprehensive test scenarios for all GreenRoute features. Work through each section in order; mark items as complete as you go.

**Prerequisites before testing:**
- [ ] MongoDB is running (`mongod` or check with `mongosh --eval "db.adminCommand('ping')"`)
- [ ] Backend is running (`npm start` → `Server running on http://localhost:5000`)
- [ ] `index.html` is open in a browser (or served via a local server)
- [ ] Browser DevTools Console is open (`F12`)

---

## 1. Server Health Check

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 1.1 | Visit `http://localhost:5000/` | Response: `"GreenRoute backend is running"` | |
| 1.2 | Start the server and check terminal | See `MongoDB connected` then `Server running on http://localhost:5000` | |
| 1.3 | Stop MongoDB, then start the server | Server retries connection (logs `Retrying MongoDB connection in Xs...`) | |

---

## 2. Frontend Load

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 2.1 | Open `index.html` in browser | Page loads without blank screen | |
| 2.2 | Check browser Console tab | No red errors on initial load | |
| 2.3 | Leaflet map appears | OpenStreetMap tiles load and are visible | |
| 2.4 | Sidebar shows recent routes section | Recent routes list visible (may be empty) | |
| 2.5 | Dark mode toggle | Toggle switches between light and dark themes | |
| 2.6 | Keyboard shortcut `H` | Opens Home menu / view | |
| 2.7 | Keyboard shortcut `M` | Switches to Map view | |
| 2.8 | Keyboard shortcut `/` | Focuses the Source input field | |

---

## 3. Route Planning

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 3.1 | Enter Source: `Delhi`, Destination: `Agra`, click "Find Route" | Route line drawn on map; distance and emissions displayed | |
| 3.2 | Enter Source: `Chennai`, Destination: `Bangalore`, click "Find Route" | Main route and at least one alternate route displayed | |
| 3.3 | Change vehicle type to `Electric`, re-plan same route | Emissions value decreases compared to petrol | |
| 3.4 | Change vehicle type to `Walking`, re-plan | Emissions: 0 g; time estimate increases significantly | |
| 3.5 | Change vehicle year to `2000`, re-plan with petrol | Emission value higher than same route with year `2022` | |
| 3.6 | Leave Source blank, click "Find Route" | No crash; user prompted or form validation shown | |

---

## 4. Emission Suggestions API

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 4.1 | `curl -X POST http://localhost:5000/suggest -H "Content-Type: application/json" -d '{"distanceKm":10}'` | JSON with `best` (cycling or walking) and `alternatives` array | |
| 4.2 | `curl -X POST http://localhost:5000/suggest -H "Content-Type: application/json" -d '{}'` | HTTP 400, `{ "error": "Missing distanceKm" }` | |
| 4.3 | In the app, plan a route with any vehicle | Suggestion panel shows eco-friendly alternatives | |

---

## 5. Save Route & Recent Routes

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 5.1 | Plan a route with valid source/destination/vehicle, click Save (if UI button exists) | `POST /save-route` returns 200 with saved route data | |
| 5.2 | `curl http://localhost:5000/recent-routes?limit=5` | Returns `{ "items": [...] }` with up to 5 routes | |
| 5.3 | `curl http://localhost:5000/recent-routes?limit=100` | Returns at most 50 routes (server cap) | |
| 5.4 | Save route manually via curl: `curl -X POST http://localhost:5000/save-route -H "Content-Type: application/json" -d '{"source":"A","destination":"B","vehicleType":"petrol","vehicleYear":2020,"distance":10,"emissions":1920}'` | HTTP 200, route saved | |
| 5.5 | After saving, visit `http://localhost:5000/recent-routes` | New route appears in the list | |
| 5.6 | Reload `index.html` | Previously saved routes appear in sidebar | |

---

## 6. Tourist Green Routes

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 6.1 | Press keyboard shortcut `T` | Map switches to Tourist Route mode | |
| 6.2 | Plan a route, enable Tourist Routes | Green 🌿 markers appear along the route | |
| 6.3 | Click a 🌿 marker | Popup shows place name and description | |
| 6.4 | Plan a route through a city park area | Parks, forests, or lakes found and marked | |

---

## 7. Live Traffic

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 7.1 | Plan a route, then click the "Live Traffic" button | Button turns teal; "Traffic: ON" indicator visible | |
| 7.2 | After enabling traffic | Colored traffic overlay appears on map (green/yellow/red segments) | |
| 7.3 | Open Console during traffic enable | No error messages; see success logs | |
| 7.4 | Wait 45 seconds with traffic enabled | Traffic data auto-refreshes (console log visible) | |
| 7.5 | Click "Live Traffic" button again | Traffic overlay turns off; button returns to dark style | |
| 7.6 | Check `/proxy/tomtom/traffic?lat=12.9716&lon=77.5946` | Returns TomTom flow data or `{ proxyError: true }` if key expired | |

---

## 8. Incident Reporting

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 8.1 | Click the "Report Incident" button (red button on map) | Prompts for incident type | |
| 8.2 | Enter type: `accident`, severity: `2`, note: `test incident` | Red circle marker appears on map at selected location | |
| 8.3 | Check Console after reporting | Success message logged; no errors | |
| 8.4 | `curl http://localhost:5000/recent-incidents` | Returns JSON with the incident just reported | |
| 8.5 | `curl http://localhost:5000/recent-incidents?hours=1&limit=50` | Returns incidents from last 1 hour | |
| 8.6 | Report incident via curl: `curl -X POST http://localhost:5000/report-incident -H "Content-Type: application/json" -d '{"lat":12.9716,"lon":77.5946,"type":"roadwork","severity":1,"note":"Road repair"}'` | HTTP 200, incident saved | |
| 8.7 | `curl -X POST http://localhost:5000/report-incident -H "Content-Type: application/json" -d '{"type":"accident"}'` | HTTP 400, `{ "error": "Missing lat/lon" }` | |
| 8.8 | Report incident with invalid type: `type: "earthquake"` | Incident saved with `type: "other"` (validation fallback) | |
| 8.9 | Report incident with severity `99` | Incident saved with `severity: 3` (clamped to max) | |

---

## 9. Nominatim Geocoding Proxy

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 9.1 | `curl "http://localhost:5000/proxy/nominatim/search?q=Bangalore&limit=1"` | Returns JSON array with lat, lon for Bangalore | |
| 9.2 | `curl "http://localhost:5000/proxy/nominatim/reverse?lat=12.9716&lon=77.5946"` | Returns address object for that coordinate | |
| 9.3 | `curl "http://localhost:5000/proxy/nominatim/search"` (no `q` param) | HTTP 400, `{ "error": "Missing q parameter" }` | |
| 9.4 | `curl "http://localhost:5000/proxy/nominatim/reverse"` (no lat/lon) | HTTP 400, `{ "error": "Missing lat/lon" }` | |

---

## 10. TomTom Proxy Endpoints

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 10.1 | `curl "http://localhost:5000/proxy/tomtom/search?query=hospital&lat=12.9716&lon=77.5946"` | Returns TomTom results or `proxyError: true` | |
| 10.2 | `curl "http://localhost:5000/proxy/tomtom/search"` (no query) | HTTP 400, `{ "error": "Missing query" }` | |
| 10.3 | `curl "http://localhost:5000/proxy/tomtom/category?category=PARK_RECREATION_AREA&lat=12.9716&lon=77.5946"` | Returns category results or `proxyError: true` | |
| 10.4 | `curl "http://localhost:5000/proxy/tomtom/traffic?lat=12.9716&lon=77.5946"` | Returns traffic flow data or `proxyError: true` | |
| 10.5 | `curl "http://localhost:5000/proxy/tomtom/traffic"` (no point) | HTTP 400, `{ "error": "Missing point (lat,lon) parameter" }` | |

---

## 11. Overpass Proxy

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 11.1 | `curl -X POST http://localhost:5000/proxy/overpass -H "Content-Type: application/json" -d '{"data":"[out:json];node[\"leisure\"=\"park\"](12.9,77.5,13.0,77.6);out body;"}'` | Returns Overpass JSON with park nodes | |
| 11.2 | `curl -X POST http://localhost:5000/proxy/overpass -H "Content-Type: application/json" -d '{}'` | HTTP 400, `{ "error": "Missing Overpass query in \`data\`" }` | |

---

## 12. Error Handling & Edge Cases

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 12.1 | Stop the backend while app is running | Frontend shows error message (not blank page) | |
| 12.2 | Plan route with very long source/destination strings (500+ chars) | No server crash; handles gracefully | |
| 12.3 | Rapid-click "Find Route" multiple times | No duplicate requests stacked; UI stays responsive | |
| 12.4 | Plan route, save, reload page | Saved route appears in recent history | |
| 12.5 | Submit `distanceKm: 0` to `/suggest` | Best result is `cycling` or `walking` with 0 emissions | |
| 12.6 | Submit `distanceKm: -5` to `/suggest` | Emissions calculated as negative or 0 (edge case tolerated) | |

---

## 13. MongoDB Persistence Check

| # | Test | Expected Result | Pass/Fail |
|---|------|-----------------|-----------|
| 13.1 | Save a route via curl | Route appears in `recent-routes` immediately | |
| 13.2 | Restart the backend server | Previously saved routes still visible in `recent-routes` | |
| 13.3 | Report an incident via curl | Incident appears in `recent-incidents` immediately | |
| 13.4 | Restart the backend server | Previously saved incidents still visible in `recent-incidents` | |
| 13.5 | Query with `hours=0` | `{ "incidents": [] }` (no future incidents) | |

---

## 14. Browser Compatibility

| # | Browser | Test | Expected Result | Pass/Fail |
|---|---------|------|-----------------|-----------|
| 14.1 | Chrome 120+ | Full app walkthrough | All features work | |
| 14.2 | Firefox 120+ | Full app walkthrough | All features work | |
| 14.3 | Edge 120+ | Full app walkthrough | All features work | |
| 14.4 | Mobile Chrome (Android) | Map loads, route planning works | Responsive UI | |

---

## Quick Smoke Test (2 minutes)

Perform these 5 checks for a rapid go/no-go assessment:

```bash
# 1. Server health
curl http://localhost:5000/

# 2. Suggestions endpoint
curl -X POST http://localhost:5000/suggest \
  -H "Content-Type: application/json" \
  -d '{"distanceKm": 10}'

# 3. Recent routes
curl "http://localhost:5000/recent-routes?limit=1"

# 4. Recent incidents
curl "http://localhost:5000/recent-incidents?limit=1"

# 5. Geocoding proxy
curl "http://localhost:5000/proxy/nominatim/search?q=Delhi&limit=1"
```

All five should return valid JSON with no HTTP 500 errors.

---

## Test Results Summary

| Section | Tests | Passed | Failed | Notes |
|---------|-------|--------|--------|-------|
| 1. Server Health | 3 | | | |
| 2. Frontend Load | 8 | | | |
| 3. Route Planning | 6 | | | |
| 4. Emission Suggestions | 3 | | | |
| 5. Save Route & History | 6 | | | |
| 6. Tourist Green Routes | 4 | | | |
| 7. Live Traffic | 6 | | | |
| 8. Incident Reporting | 9 | | | |
| 9. Nominatim Proxy | 4 | | | |
| 10. TomTom Proxies | 5 | | | |
| 11. Overpass Proxy | 2 | | | |
| 12. Edge Cases | 6 | | | |
| 13. Persistence | 5 | | | |
| 14. Browser Compat. | 4 | | | |
| **Total** | **71** | | | |

---

_Tested on:_ ________________  
_Tester:_ ________________  
_Backend version:_ `server.js` (GreenRoute 1.0)  
_Node.js version:_ ________________  
_MongoDB version:_ ________________
