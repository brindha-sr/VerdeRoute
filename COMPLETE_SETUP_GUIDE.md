# GreenRoute — Complete Setup Guide

A step-by-step guide covering installation, configuration, deployment, and troubleshooting for the GreenRoute eco-friendly route planner.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Running the Application](#running-the-application)
5. [Deployment](#deployment)
6. [Environment Variables](#environment-variables)
7. [MongoDB Setup](#mongodb-setup)
8. [TomTom API Setup](#tomtom-api-setup)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| MongoDB | 6+ | Running on `localhost:27017` |
| npm | 8+ | Included with Node.js |
| TomTom API key | — | For live traffic features |
| Mapbox token | — | For turn-by-turn directions |

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/brindha-sr/VerdeRoute.git
cd VerdeRoute

# 2. Install backend dependencies
npm install

# 3. Verify Node.js version
node --version   # should be v18 or higher
```

---

## Configuration

### Backend (`server.js`)

| Setting | Default | How to Override |
|---------|---------|-----------------|
| Port | `5000` | Set `PORT` env variable |
| MongoDB URI | `mongodb://127.0.0.1:27017/ecoFindDB` | Set `MONGO_URI` env variable |
| TomTom Primary Key | Embedded fallback key | Set `TOMTOM_PRIMARY_KEY` env variable |
| TomTom Secondary Key | Same as primary | Set `TOMTOM_SECONDARY_KEY` env variable |

### Frontend (`map.js`)

The frontend uses hardcoded references to `http://localhost:5000`. If you change the server port, update these fetch URLs in `map.js`:

```js
// Change 5000 to your custom port in all backend fetch calls, e.g.:
fetch("http://localhost:5000/suggest", { ... })
fetch("http://localhost:5000/save-route", { ... })
fetch("http://localhost:5000/recent-routes", { ... })
```

Mapbox directions token is embedded in map tile URLs in `map.js`. Replace the `access_token=...` value in both route fetch URLs if you have your own token.

---

## Running the Application

### Start the Backend

```bash
npm start
# or
node server.js
```

Expected output:
```
MongoDB connected
Server running on http://localhost:5000
```

### Open the Frontend

Open `index.html` directly in your browser, or use a static file server:

```bash
# Using VS Code Live Server (recommended for development)
# Right-click index.html → "Open with Live Server"

# Using Python's built-in server
python3 -m http.server 8080
# Then open http://localhost:8080
```

> **Note:** The frontend communicates with the backend at `http://localhost:5000`. Both must be running at the same time.

---

## Deployment

### Local Development

1. Start MongoDB: `mongod` (or ensure MongoDB service is running)
2. Start the backend: `npm start`
3. Open `index.html` in your browser

### Production (VPS / Cloud VM)

1. **Install dependencies** on the server:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm mongodb
   ```

2. **Clone and install**:
   ```bash
   git clone https://github.com/brindha-sr/VerdeRoute.git
   cd VerdeRoute
   npm install --production
   ```

3. **Set environment variables**:
   ```bash
   export PORT=5000
   export MONGO_URI=mongodb://127.0.0.1:27017/ecoFindDB
   export TOMTOM_PRIMARY_KEY=your_key_here
   ```

4. **Use a process manager** (recommended):
   ```bash
   npm install -g pm2
   pm2 start server.js --name greenroute
   pm2 save
   pm2 startup   # auto-start on reboot
   ```

5. **Serve the frontend** via Nginx or Apache alongside the backend, or include it in the Node.js static file serving (already configured in `server.js`):
   ```
   # The backend already serves all static files in the project directory
   # via: app.use(express.static(path.join(__dirname)));
   # So visiting http://your-server:5000/ will load index.html automatically.
   ```

### Docker (Optional)

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

```bash
# Build and run
docker build -t greenroute .
docker run -p 5000:5000 \
  -e MONGO_URI=mongodb://host.docker.internal:27017/ecoFindDB \
  -e TOMTOM_PRIMARY_KEY=your_key \
  greenroute
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Port the HTTP server listens on |
| `MONGO_URI` | No | `mongodb://127.0.0.1:27017/ecoFindDB` | MongoDB connection string |
| `TOMTOM_PRIMARY_KEY` | No | Bundled fallback | TomTom API key (primary) |
| `TOMTOM_SECONDARY_KEY` | No | Same as primary | TomTom API key (fallback) |

Create a `.env` file (install `dotenv` if you want auto-loading):

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/ecoFindDB
TOMTOM_PRIMARY_KEY=your_tomtom_api_key
TOMTOM_SECONDARY_KEY=your_tomtom_api_key_backup
```

---

## MongoDB Setup

### Install MongoDB (Ubuntu/Debian)

```bash
sudo apt-get install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb  # start on boot
```

### Install MongoDB (macOS)

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

### Verify MongoDB is Running

```bash
mongosh --eval "db.runCommand({ connectionStatus: 1 })"
# or
mongo --eval "db.adminCommand('ping')"
```

### Database & Collections

The application uses the `ecoFindDB` database and creates two collections automatically:

| Collection | Purpose | Schema |
|------------|---------|--------|
| `routedatas` | Saved routes | source, destination, vehicleType, vehicleYear, distance, emissions, routeSource, date |
| `incidents` | Reported incidents | type, lat, lon, severity, note, date |

No manual schema setup is needed — Mongoose creates collections automatically on first write.

---

## TomTom API Setup

Live traffic features use the [TomTom Traffic API](https://developer.tomtom.com/).

1. Register at [developer.tomtom.com](https://developer.tomtom.com/)
2. Create an application and copy your API key
3. Set it as an environment variable:
   ```bash
   export TOMTOM_PRIMARY_KEY=your_api_key_here
   ```

The backend proxies all TomTom requests through `/proxy/tomtom/*` so the API key is never exposed to the browser.

---

## Troubleshooting

### Backend won't start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `EADDRINUSE: address already in use :::5000` | Another process using port 5000 | `kill $(lsof -t -i:5000)` or change PORT |
| `Cannot find module 'express'` | Dependencies not installed | Run `npm install` |
| Server starts but immediately exits | MongoDB unreachable | Start MongoDB, or check `MONGO_URI` |

### MongoDB connection errors

```
MongoDB connection error: connect ECONNREFUSED 127.0.0.1:27017
```

- Start MongoDB: `sudo systemctl start mongodb` (Linux) or `brew services start mongodb-community` (macOS)
- The server retries automatically with exponential backoff (up to 30 seconds between retries)

### Frontend shows no routes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Failed to load routes" in console | Backend not running | Start the backend with `npm start` |
| Route line doesn't appear | Mapbox token expired or invalid | Replace `access_token=...` in `map.js` |
| Geocoding fails repeatedly | Nominatim rate limit | Wait 30–60 seconds, then retry |

### Live Traffic not working

| Symptom | Cause | Fix |
|---------|-------|-----|
| Traffic button doesn't respond | TomTom key not configured | Set `TOMTOM_PRIMARY_KEY` env variable |
| No colored route segments | TomTom key invalid or rate-limited | Verify key at developer.tomtom.com |
| `proxyError: true` in response | TomTom API unreachable | Check internet connectivity |

### CORS errors in browser console

Ensure the backend is running at `http://localhost:5000`. CORS is enabled for all origins by default. If deploying behind a reverse proxy, make sure the proxy forwards headers correctly.
