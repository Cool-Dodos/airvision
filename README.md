# AirVision Global

**Real-time global air quality monitoring, visualized on a WebGL 3D globe.**

[![Live](https://img.shields.io/badge/Live-airvision--seven.vercel.app-00b894?style=flat-square)](https://airvision-seven.vercel.app)
![Stack](https://img.shields.io/badge/Stack-MEAN-1a3a5a?style=flat-square)
![Angular](https://img.shields.io/badge/Angular-17-dd0031?style=flat-square)
![Version](https://img.shields.io/badge/Version-2.0.0-0a2a1e?style=flat-square)

---

## Overview

AirVision Global is a high-performance AQI visualization platform built on the MEAN stack. It renders live air quality data for every country on a WebGL globe, with a dedicated India state-level view powered by real-time telemetry from 177+ monitoring stations.

---

## Features

### WebGL Globe
- Real-time AQI coloring across 177 countries using a 6-tier color scale
- globe.gl WebGL renderer — 60fps on mid-range hardware
- Auto-rotating globe with smooth camera transitions
- Custom ocean texture with polar ice caps and depth shading
- Pixel ratio capped at 1.5× for retina/mobile performance


### AQI Data
- Live data from the World Air Quality Index (WAQI) API
- 6-tier color scale: Good → Moderate → Sensitive → Unhealthy → Very Unhealthy → Hazardous
- Pollutant breakdown: PM2.5, PM10, NO₂, O₃, SO₂, CO
- Time travel slider — replay historical snapshots up to 12 hours back
- Auto-refresh every 2 minutes, historical mode pauses live updates

### Info Panels
- Country panel: AQI, dominant pollutant, 24h sparkline, health advisory, action pills
- India state panel: live AQI, health advisory, recommended actions
- Share card: copy link, native share, Twitter, WhatsApp — with OG preview

### Anomaly Feed
- Real-time detection of countries exceeding AQI thresholds
- Click-to-zoom from feed to country on globe

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 17 (standalone components, OnPush) |
| Renderer | globe.gl, Three.js, WebGL |
| Geometry | TopoJSON, world-atlas 110m, custom india-official.json |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| Data | WAQI API |
| Hosting | Vercel (frontend), Render (backend) |

---

## Project Structure

```
airvision/
├── client-ng/                  # Angular 17 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── globe/      # WebGL globe (globe-webgl.component.ts)
│   │   │   │   ├── info-panel/ # Country detail panel
│   │   │   │   ├── share-card/ # Share modal
│   │   │   │   ├── anomaly-feed/
│   │   │   │   └── history-slider/
│   │   │   ├── services/       # AQI data service
│   │   │   └── utils/          # aqi.ts (color scale, numeric → ISO mapping)
│   │   └── assets/
│   │       ├── india-official.json        # Official India boundary
│   │       └── india-states-simplified.json  # ADM1 state borders
└── server/                     # Express backend
    ├── routes/
    │   └── aqi.js              # /api/aqi/world, /api/aqi/india/states
    └── models/
        └── AqiSnapshot.js      # MongoDB snapshot schema
```

---

## AQI Color Scale

| Range | Category | Color |
|-------|----------|-------|
| 0–50 | Good | `#00b894` |
| 51–100 | Moderate | `#fdcb6e` |
| 101–150 | Unhealthy for Sensitive | `#e17055` |
| 151–200 | Unhealthy | `#d63031` |
| 201–300 | Very Unhealthy | `#6c5ce7` |
| 300+ | Hazardous | `#a8071a` |

---

## Known Limitations

- World geometry is 110m resolution — minor border imprecision at extreme zoom is expected
- Somaliland renders as part of Somalia (no ISO code in world-atlas)
- India state AQI depends on WAQI station availability — some states show no data during off-peak hours
- Backend hosted on Render free tier — cold starts may cause 20–30s delay on first load

---
