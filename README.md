# 🌍 AirVision Global
### Advanced Real-time AQI Monitoring & Visualization

[![Angular](https://img.shields.io/badge/Angular-17-DD0031?style=flat-square&logo=angular&logoColor=white)](https://angular.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongoosejs.com)
[![WebGL](https://img.shields.io/badge/WebGL-globe.gl-FF6B35?style=flat-square&logo=webgl&logoColor=white)](https://globe.gl)
[![TopoJSON](https://img.shields.io/badge/TopoJSON-topojson--client-lightgrey?style=flat-square)](https://github.com/topojson/topojson)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://airvision-seven.vercel.app)

AirVision Global is a high-performance 3D globe platform that monitors real-time air quality (AQI) across every country on Earth — and down to India's 36 states and union territories. Built on a MEAN stack with a WebGL-powered globe renderer, it delivers a seamless, data-rich experience for tracking environmental health at global and regional scale.

🔗 **Live:** [airvision-seven.vercel.app](https://airvision-seven.vercel.app)

---

## Features

###  WebGL 3D Globe
- Real-time AQI coloring across 177+ countries using a 6-tier color scale
- 60fps rendering with pixel ratio capping for retina and mobile performance
- Auto-rotating globe with smooth orbit controls
- Hover tooltips with AQI value, category, dominant pollutant, and safe outdoor time
- Hardcoded centroids for large MultiPolygon countries (US, Russia, China, Canada, Australia)
- India official boundary geometry applied at runtime — includes POK and Aksai Chin

###  India State Mode
- Dedicated "India States" button — explicit trigger, never auto-fires on zoom
- State-level AQI for all 36 states and union territories

###  Data & Analytics
- Live world AQI refresh every 2 minutes
- Time Travel slider — replay historical AQI snapshots
- Anomaly feed — surfaces countries with critically elevated AQI in real time
- Country detail panel — sparkline trend, pollutant breakdown (PM2.5, PM10, NO₂, O₃, SO₂, CO), health advisory
- Share card — copy, Web Share API, Twitter, WhatsApp

###  Performance
- Angular `OnPush` change detection throughout
- Color cache rebuilt only on data or viewMode change — O(1) per-frame polygon lookup
- Zone-decoupled event listeners — mousemove and zoom handlers run outside Angular zone
- FPS meter toggle via `[showFps]` input

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | [Angular 17](https://angular.dev) (standalone components) |
| Globe renderer | [globe.gl](https://globe.gl) + [Three.js](https://threejs.org) |
| Geometry | [TopoJSON](https://github.com/topojson/topojson) / [world-atlas](https://github.com/topojson/world-atlas) |
| Backend | [Node.js](https://nodejs.org) + [Express](https://expressjs.com) |
| Database | [MongoDB](https://www.mongodb.com) via [Mongoose](https://mongoosejs.com) |
| AQI Data | [WAQI API](https://aqicn.org/api/) |
| Deployment | [Vercel](https://vercel.com) (frontend) + [Render](https://render.com) (backend) |

---

## Project Structure

```
airvision/
├── client-ng/                  # Angular 17 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── globe/              # WebGL globe component
│   │   │   │   ├── info-panel/         # Country detail panel
│   │   │   │   ├── anomaly-feed/       # Live anomaly alerts
│   │   │   │   ├── history-slider/     # Time travel UI
│   │   │   │   └── share-card/         # Social share modal
│   │   │   ├── services/
│   │   │   │   └── aqi.service.ts
│   │   │   └── utils/
│   │   │       ├── aqi.ts              # AQI color scale + country code map
│   │   │       └── health.ts           # Safe outdoor time calculations
│   │   └── assets/
│   │       ├── india-official.json     # Official India boundary (incl. POK)
│   │       └── india-states-simplified.json
└── server/                     # Express backend
    ├── routes/
    └── models/
```

---

## AQI Color Scale

| Range | Category | Color |
|-------|----------|-------|
| 0–50 | Good | ![#00b894](https://placehold.co/12x12/00b894/00b894.png) `#00b894` |
| 51–100 | Moderate | ![#fdcb6e](https://placehold.co/12x12/fdcb6e/fdcb6e.png) `#fdcb6e` |
| 101–150 | Unhealthy for Sensitive Groups | ![#e17055](https://placehold.co/12x12/e17055/e17055.png) `#e17055` |
| 151–200 | Unhealthy | ![#d63031](https://placehold.co/12x12/d63031/d63031.png) `#d63031` |
| 201–300 | Very Unhealthy | ![#6c5ce7](https://placehold.co/12x12/6c5ce7/6c5ce7.png) `#6c5ce7` |
| 301+ | Hazardous | ![#a8071a](https://placehold.co/12x12/a8071a/a8071a.png) `#a8071a` |

---

## Known Limitations

- World geometry at 110m resolution — minor border imprecision at extreme zoom
- Somalia coastline simplified at runtime to fix earcut triangulation artifact
- Backend on Render free tier — cold start ~30s after inactivity
- India state AQI coverage varies by state monitoring station density

---

## Contributing

PRs welcome. For major changes please open an issue first to discuss what you'd like to change.


