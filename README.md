# AirVision Global — Real-time AQI Monitor
### MERN Stack — v1.1.0

Interactive 3D globe monitoring real-time air quality across 100+ countries.
India map uses the official Survey of India boundary (includes J&K, PoK, Aksai Chin).

---

## What's in v1.1

### Globe
- Countries colored by live AQI (6-tier scale)
- **Scroll to zoom in** — country names appear automatically at 1.6× zoom
- **Hover** shows: country name, AQI value, category, safe outdoor time, pollution source
- **Click** centers globe on that country + opens full health dashboard
- Drag to rotate · auto-rotation resumes after 8s

### Smart Health Dashboard (click any country)
- Safe outdoor duration for healthy / sensitive / children+elderly
- Best hour of day to go outside (accounts for pollutant type)
- Mask type recommendation
- 12h sparkline + 6h forecast (linear regression)
- Per-pollutant readings with dominant pollutant highlighted
- Dominant pollutant: source + specific health effect card
- 30-day baseline comparison (above/below normal indicator)

### Anomaly Feed (center top button)
- Detects countries with AQI 80%+ above their 30-day rolling average
- Severity tiers: Elevated / Severe / Extreme
- Click any anomaly → globe zooms to that country
- Blinks red when extreme events are active

### Trend & Prediction
- Linear regression on last 8 readings (15-min intervals)
- Direction arrow: ↑↑ Rising fast / ↑ Rising / → Stable / ↓ Improving / ↓↓ Improving fast
- 1h / 3h / 6h AQI forecasts shown in panel

---

## Tech Stack
- **MongoDB** — AQI snapshots + 30-day daily averages
- **Express.js** — REST API
- **React + D3.js** — 3D globe, health dashboard
- **Node.js** — cron-based auto-refresh every 15 min

## Data Source
**WAQI** — https://aqicn.org/data-platform/token (free token, no credit card)

---

## Project Structure
```
airvision/
├── server/
│   ├── index.js
│   ├── models/
│   │   ├── AqiSnapshot.js      All-country snapshot (48 kept = 12h)
│   │   ├── DailyAverage.js     Per-country daily avg (30 days kept)
│   │   └── CountryDetail.js
│   ├── routes/
│   │   └── aqi.js              5 API endpoints
│   └── services/
│       ├── waqi.js             100-country city list + fetch helpers
│       ├── cron.js             15-min refresh + anomaly cache
│       └── analytics.js        Linear regression + anomaly detection
└── client/
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── Globe.jsx        D3 globe + zoom labels + hover tooltip
        │   ├── InfoPanel.jsx    Full health dashboard
        │   └── AnomalyFeed.jsx  Anomaly event feed
        ├── data/
        │   └── india-official.json
        └── utils/
            ├── aqi.js           AQI colors + country code maps
            └── health.js        Safe time / mask / pollutant effects
```

---

## Setup

### 1. Get WAQI token
Go to https://aqicn.org/data-platform/token — register with email, token arrives instantly.

### 2. Configure environment
```bash
cd server
cp .env.example .env
# Fill in:
# WAQI_TOKEN=your_token_here
# MONGO_URI=mongodb://localhost:27017/airvision
```

### 3. Install and run
```bash
# From root airvision/ folder:
npm run install:all

# Terminal 1:
npm run dev:server    # Express on :5000

# Terminal 2:
npm run dev:client    # React/Vite on :5173
```

Open http://localhost:5173

On first boot the cron job fires immediately — globe populates in ~30s.
Anomaly detection improves after 3+ days of data accumulation.

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/aqi/world` | All-country latest snapshot |
| GET | `/api/aqi/country/:code` | Detail + trend + 6h prediction |
| GET | `/api/aqi/history/:code` | Last 12h readings (sparkline) |
| GET | `/api/aqi/anomalies` | Countries with AQI 80%+ above baseline |
| GET | `/api/aqi/stations` | Raw station lat/lng dots |
| GET | `/api/health` | Server health check |

---

## AQI Scale

| AQI | Category | Color |
|-----|----------|-------|
| 0–50 | Good | Green |
| 51–100 | Moderate | Yellow |
| 101–150 | Unhealthy for Sensitive Groups | Orange |
| 151–200 | Unhealthy | Red |
| 201–300 | Very Unhealthy | Purple |
| 301+ | Hazardous | Dark Red |

---

## v1.5 Roadmap (coming next)
- Rain overlay (Open-Meteo, free)
- Wind direction arrows
- Temperature globe mode toggle
- WebSocket live push (Socket.io)
