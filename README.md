# 🌍 AirVision Global
### **Advanced Real-time AQI Monitoring & Visualization**
**Stack:** MEAN (MongoDB, Express, Angular, Node.js) | **Version:** 1.2.0

AirVision is a high-performance 3D visualization platform that monitors real-time air quality (AQI) across the globe. Built with D3.js and Angular, it provides a seamless, data-rich experience for tracking environmental health at both global and regional scales.

Check out [Airvision-Live](https://airvision-seven.vercel.app/)
---

##  Key Features

### 🇮🇳 India State-Level Mapping (New!)
- **High-Resolution Borders**: Integrated ADM1 state borders for precise visualization.
- **177+ Cities Mapped**: Comprehensive coverage across all 36 States and Union Territories.
- **Intelligent Fallbacks**: Real-time aggregation of multiple city stations per state with coordinate-based proximity fallbacks.
- **Visual Accuracy**: Correctly renders all territories including Jammu & Kashmir, Ladakh, and island territories.

###  Dynamic 3D Globe
- **6-Tier AQI Coloring**: Countries and states are dynamically colored based on real-time pollution levels.
- **Intelligent Zoom**: Labels and state borders transition seamlessly as you zoom in (optimized at 2.8x threshold).
- **Hover Dashboards**: Instant tooltips showing AQI value, category, and safe outdoor activity duration.
- **Two-Tier Geometry**: Uses 50m global resolution with lazy-loaded high-res ADM1 boundaries for focused regions.

### Performance Optimized
- **30 FPS Throttling**: The rendering engine is capped to ensure smooth rotation and interaction even on mid-range hardware.
- **Angular Zone Optimization**: Event listeners are decoupled from change detection cycles to reduce CPU overhead during heavy interaction.

---

##  Technology Stack

- **Frontend**: Angular 17, D3.js, TopoJSON
- **Backend**: Node.js, Express, Axios
- **Database**: MongoDB (Mongoose)
- **Data Source**: World Air Quality Index (WAQI) API

---


