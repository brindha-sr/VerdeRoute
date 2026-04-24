# GreenRoute — Complete API Reference

Full documentation for all HTTP endpoints provided by the GreenRoute backend (`server.js`).

**Base URL:** `http://localhost:5000`

---

## Table of Contents

1. [Route Suggestions](#route-suggestions)
2. [Save Route](#save-route)
3. [Recent Routes](#recent-routes)
4. [Report Incident](#report-incident)
5. [Recent Incidents](#recent-incidents)
6. [TomTom Proxies](#tomtom-proxies)
   - [POI Search](#tomtom-poi-search)
   - [Category Search](#tomtom-category-search)
   - [Traffic Flow](#tomtom-traffic-flow)
7. [Nominatim Proxies](#nominatim-proxies)
   - [Forward Geocoding](#nominatim-forward-geocoding)
   - [Reverse Geocoding](#nominatim-reverse-geocoding)
8. [Overpass Proxy](#overpass-proxy)
9. [Data Models](#data-models)
10. [Error Responses](#error-responses)

---

## Route Suggestions

Returns CO₂ emission estimates and time estimates for all supported vehicle types, sorted by lowest emissions first.

**`POST /suggest`**

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `distanceKm` | number | ✅ | Trip distance in kilometres |

```bash
curl -X POST http://localhost:5000/suggest \
  -H "Content-Type: application/json" \
  -d '{"distanceKm": 12.5}'
```

### Response `200 OK`

```json
{
  "best": {
    "type": "cycling",
    "emission": 0,
    "time": 0.83
  },
  "alternatives": [
    { "type": "walking",        "emission": 0,    "time": 2.5  },
    { "type": "electric",       "emission": 250,  "time": 0.21 },
    { "type": "electric_truck", "emission": 1250, "time": 0.25 },
    { "type": "bus",            "emission": 1312, "time": 0.28 },
    { "type": "bike",           "emission": 1287, "time": 0.31 },
    { "type": "diesel",         "emission": 2137, "time": 0.21 },
    { "type": "petrol",         "emission": 2400, "time": 0.21 },
    { "type": "truck",          "emission": 5000, "time": 0.25 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `best` | object | Vehicle type with lowest emissions |
| `best.type` | string | Vehicle type key |
| `best.emission` | number | Total CO₂ in grams |
| `best.time` | number | Estimated travel time in hours |
| `alternatives` | array | All other vehicle types, sorted by emissions ascending |

### Error `400 Bad Request`

```json
{ "error": "Missing distanceKm" }
```

---

## Save Route

Saves a completed route to MongoDB for history.

**`POST /save-route`**

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | ✅ | Origin location name |
| `destination` | string | ✅ | Destination location name |
| `vehicleType` | string | ✅ | One of: `petrol`, `diesel`, `electric`, `bike`, `bus`, `truck`, `electric_truck`, `walking`, `cycling` |
| `vehicleYear` | number | ✅ | Manufacturing year of the vehicle (used for emission adjustment) |
| `modelYear` | number | — | Alias for `vehicleYear` (either field accepted) |
| `distance` | number | ✅ | Distance in kilometres |
| `emissions` | number | ✅ | Calculated CO₂ in grams |
| `routeSource` | string | — | Route data source (default: `"OSM"`) |

```bash
curl -X POST http://localhost:5000/save-route \
  -H "Content-Type: application/json" \
  -d '{
    "source": "Chennai",
    "destination": "Bangalore",
    "vehicleType": "electric",
    "vehicleYear": 2022,
    "distance": 346,
    "emissions": 6920,
    "routeSource": "OSM"
  }'
```

### Response `200 OK`

```json
{
  "message": "Route saved successfully",
  "data": {
    "_id": "664a1b2c3d4e5f6789abcdef",
    "source": "Chennai",
    "destination": "Bangalore",
    "vehicleType": "electric",
    "vehicleYear": 2022,
    "distance": 346,
    "emissions": 6920,
    "routeSource": "OSM",
    "date": "2026-04-24T05:00:00.000Z",
    "__v": 0
  }
}
```

### Error `400 Bad Request`

```json
{ "error": "Missing required fields" }
```

---

## Recent Routes

Retrieves the most recently saved routes from MongoDB.

**`GET /recent-routes`**

### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | `10` | `50` | Number of routes to return |

```bash
curl "http://localhost:5000/recent-routes?limit=5"
```

### Response `200 OK`

```json
{
  "items": [
    {
      "_id": "664a1b2c3d4e5f6789abcdef",
      "source": "Chennai",
      "destination": "Bangalore",
      "vehicleType": "electric",
      "vehicleYear": 2022,
      "distance": 346,
      "emissions": 6920,
      "routeSource": "OSM",
      "date": "2026-04-24T05:00:00.000Z"
    }
  ]
}
```

---

## Report Incident

Saves a user-reported traffic incident to MongoDB.

**`POST /report-incident`**

### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lat` | number | ✅ | Latitude of the incident |
| `lon` | number | ✅ | Longitude of the incident |
| `type` | string | — | Incident type: `accident`, `roadwork`, or `other` (default: `other`) |
| `severity` | integer | — | Severity level 1–3 (default: `2`). 1 = minor, 2 = moderate, 3 = severe |
| `note` | string | — | Optional free-text description (max 500 characters) |

```bash
curl -X POST http://localhost:5000/report-incident \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 12.9716,
    "lon": 77.5946,
    "type": "accident",
    "severity": 2,
    "note": "Multi-vehicle collision on outer ring road"
  }'
```

### Response `200 OK`

```json
{
  "message": "Incident reported successfully",
  "incident": {
    "_id": "664a1b2c3d4e5f6789abcdee",
    "type": "accident",
    "lat": 12.9716,
    "lon": 77.5946,
    "severity": 2,
    "note": "Multi-vehicle collision on outer ring road",
    "date": "2026-04-24T05:00:00.000Z",
    "__v": 0
  }
}
```

### Error `400 Bad Request`

```json
{ "error": "Missing lat/lon" }
```

---

## Recent Incidents

Retrieves recently reported incidents within a configurable time window.

**`GET /recent-incidents`**

### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | `20` | `100` | Number of incidents to return |
| `hours` | integer | `24` | — | How many hours back to look |

```bash
# Last 20 incidents from the past 24 hours
curl "http://localhost:5000/recent-incidents"

# Last 50 incidents from the past 6 hours
curl "http://localhost:5000/recent-incidents?limit=50&hours=6"
```

### Response `200 OK`

```json
{
  "incidents": [
    {
      "_id": "664a1b2c3d4e5f6789abcdee",
      "type": "accident",
      "lat": 12.9716,
      "lon": 77.5946,
      "severity": 2,
      "note": "Multi-vehicle collision on outer ring road",
      "date": "2026-04-24T05:00:00.000Z"
    }
  ]
}
```

---

## TomTom Proxies

All TomTom endpoints are proxied through the backend to avoid exposing the API key to the browser and to handle CORS. The server automatically retries with a fallback key if the primary key returns HTTP 403.

### TomTom POI Search

Searches for a point of interest by name near an optional coordinate.

**`GET /proxy/tomtom/search`**

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | ✅ | Search term (e.g. `"petrol station"`) |
| `lat` | — | Latitude to bias results |
| `lon` | — | Longitude to bias results |
| `key` | — | Override API key for this request |

```bash
curl "http://localhost:5000/proxy/tomtom/search?query=hospital&lat=12.9716&lon=77.5946"
```

#### Response `200 OK`

Returns the [TomTom Search API](https://developer.tomtom.com/search-api/documentation/search-service/fuzzy-search) response. On API failure, returns:

```json
{ "results": [], "proxyError": true, "details": "..." }
```

---

### TomTom Category Search

Searches for POIs by TomTom category code near a coordinate.

**`GET /proxy/tomtom/category`**

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `category` | ✅ | TomTom category name or code |
| `lat` | ✅ | Latitude |
| `lon` | ✅ | Longitude |
| `radius` | — | Search radius in metres (default: `1000`) |
| `limit` | — | Max results (default: `10`) |
| `key` | — | Override API key for this request |

```bash
curl "http://localhost:5000/proxy/tomtom/category?category=PARK_RECREATION_AREA&lat=12.9716&lon=77.5946&radius=2000"
```

#### Response `200 OK`

Returns the TomTom Category Search response, or on failure:

```json
{ "results": [], "proxyError": true, "details": "..." }
```

---

### TomTom Traffic Flow

Retrieves live traffic flow data for a specific point on the road network.

**`GET /proxy/tomtom/traffic`**

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `point` | — | `"lat,lon"` string |
| `lat` | — | Latitude (alternative to `point`) |
| `lon` | — | Longitude (alternative to `point`) |
| `key` | — | Override API key for this request |

Either `point` or both `lat` and `lon` must be provided.

```bash
curl "http://localhost:5000/proxy/tomtom/traffic?lat=12.9716&lon=77.5946"
# or
curl "http://localhost:5000/proxy/tomtom/traffic?point=12.9716,77.5946"
```

#### Response `200 OK`

Returns the [TomTom Traffic Flow Segment](https://developer.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data) response. Fields include `freeFlowSpeed`, `currentSpeed`, `confidence`, etc.

On failure:

```json
{ "results": [], "proxyError": true, "details": "..." }
```

---

## Nominatim Proxies

Geocoding is provided by the OpenStreetMap [Nominatim](https://nominatim.org/) service, proxied through the backend to set a proper User-Agent header and avoid CORS issues.

### Nominatim Forward Geocoding

Converts a place name or address to coordinates.

**`GET /proxy/nominatim/search`**

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q` | ✅ | Free-text location query |
| `format` | — | Response format (default: `json`) |
| `limit` | — | Max results |
| `countrycodes` | — | Restrict to countries (e.g. `IN`) |

```bash
curl "http://localhost:5000/proxy/nominatim/search?q=Bangalore&format=json&limit=1"
```

#### Response `200 OK`

Returns a Nominatim JSON array of place objects, each with `lat`, `lon`, `display_name`, `type`, etc.

---

### Nominatim Reverse Geocoding

Converts coordinates to a human-readable address.

**`GET /proxy/nominatim/reverse`**

#### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `lat` | ✅ | Latitude |
| `lon` | ✅ | Longitude |
| `format` | — | Response format (default: `jsonv2`) |

```bash
curl "http://localhost:5000/proxy/nominatim/reverse?lat=12.9716&lon=77.5946"
```

#### Response `200 OK`

Returns a Nominatim reverse geocode object with `address`, `display_name`, and coordinates.

---

## Overpass Proxy

Proxies queries to the [Overpass API](https://overpass-api.de/) for OpenStreetMap data lookups (e.g., parks, forests, trails along a route).

**`POST /proxy/overpass`**

### Request Body

Send a JSON object with a `data` field containing an Overpass QL query string.

```bash
curl -X POST http://localhost:5000/proxy/overpass \
  -H "Content-Type: application/json" \
  -d '{
    "data": "[out:json];node[\"leisure\"=\"park\"](12.9,77.5,13.1,77.7);out body;"
  }'
```

### Response `200 OK`

Returns the Overpass API JSON response (or plain text for non-JSON responses).

---

## Data Models

### RouteData

Stored in the `routedatas` collection.

```js
{
  source:      String,          // Origin location name
  destination: String,          // Destination location name
  vehicleType: String,          // petrol | diesel | electric | bike | bus | truck | electric_truck | walking | cycling
  vehicleYear: Number,          // Manufacturing year
  distance:    Number,          // Distance in km
  emissions:   Number,          // CO₂ in grams
  routeSource: String,          // Default: "OSM"
  date:        Date             // Saved at (default: now)
}
```

### Incident

Stored in the `incidents` collection.

```js
{
  type:     String,   // accident | roadwork | other  (default: "other")
  lat:      Number,   // Latitude of the incident
  lon:      Number,   // Longitude of the incident
  severity: Number,   // 1 (minor) | 2 (moderate) | 3 (severe)  (default: 2)
  note:     String,   // Optional description (max 500 chars)
  date:     Date      // Reported at (default: now)
}
```

---

## Error Responses

All endpoints follow a consistent error format:

```json
{ "error": "Human-readable error message" }
```

Or with additional detail:

```json
{ "error": "Human-readable error message", "details": "..." }
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad request — missing or invalid parameters |
| `500` | Server error — database failure, upstream API error, etc. |

TomTom and Overpass proxy endpoints return HTTP `200` even on upstream failures, using `proxyError: true` in the response body so the browser can handle errors gracefully without triggering network-level error reporting.
