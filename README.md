# 🌍 AirVision Global
### **Advanced Real-time AQI Monitoring & Visualization**
**Stack:** MEAN (MongoDB, Express, Angular, Node.js) | **Version:** 1.2.0

AirVision is a high-performance 3D visualization platform that monitors real-time air quality (AQI) across the globe. Built with D3.js and Angular, it provides a seamless, data-rich experience for tracking environmental health at both global and regional scales.

![Global View](file:///C:/Users/dell/.gemini/antigravity/brain/31d2f107-111c-47ba-bb78-79b9e2a6fff2/brazil_australia_verified_1773572613469.png)

---

## 🔥 Key Features

### 🇮🇳 India State-Level Mapping (New!)
- **High-Resolution Borders**: Integrated ADM1 state borders for precise visualization.
- **177+ Cities Mapped**: Comprehensive coverage across all 36 States and Union Territories.
- **Intelligent Fallbacks**: Real-time aggregation of multiple city stations per state with coordinate-based proximity fallbacks.
- **Visual Accuracy**: Correctly renders all territories including Jammu & Kashmir, Ladakh, and island territories.

### 🌎 Dynamic 3D Globe
- **6-Tier AQI Coloring**: Countries and states are dynamically colored based on real-time pollution levels.
- **Intelligent Zoom**: Labels and state borders transition seamlessly as you zoom in (optimized at 2.8x threshold).
- **Hover Dashboards**: Instant tooltips showing AQI value, category, and safe outdoor activity duration.
- **Two-Tier Geometry**: Uses 50m global resolution with lazy-loaded high-res ADM1 boundaries for focused regions.

### ⚡ Performance Optimized
- **30 FPS Throttling**: The rendering engine is capped to ensure smooth rotation and interaction even on mid-range hardware.
- **Angular Zone Optimization**: Event listeners are decoupled from change detection cycles to reduce CPU overhead during heavy interaction.

---

## 🛠️ Technology Stack

- **Frontend**: Angular 17, D3.js, TopoJSON
- **Backend**: Node.js, Express, Axios
- **Database**: MongoDB (Mongoose)
- **Data Source**: World Air Quality Index (WAQI) API

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- MongoDB running locally or a remote URI
- A free WAQI API Token ([Get it here](https://aqicn.org/data-platform/token/))

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/airvision.git
cd airvision

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client-ng
npm install
```

### 3. Environment Setup
Create a `.env` file in the `server` directory:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/airvision
WAQI_TOKEN=your_token_here
```

### 4. Running the Application
**Backend:**
```bash
cd server
node index.js
```

**Frontend:**
```bash
cd client-ng
npx ng serve --port 4200
```
Visit `http://localhost:4200` to see the globe in action.

---

## 📊 Deployment
The application is ready for partitioned deployment:
- **Frontend**: Optimized for Vercel / Netlify.
- **Backend**: Optimized for Render / Heroku (includes built-in CORS configurations).

---

## 🛣️ Roadmap
- [x] High-res India State Mapping
- [x] Global Persistence Layer (merging snapshots)
- [ ] Atmospheric Wind Overlay
- [ ] Historical Comparison Mode (Daily/Weekly trends)
- [ ] Mobile-responsive layout refinement

---

![India State View](file:///C:/Users/dell/.gemini/antigravity/brain/31d2f107-111c-47ba-bb78-79b9e2a6fff2/initial_globe_view_1773577302349.png)
201–300 | Very Unhealthy | Purple |
| 301+ | Hazardous | Dark Red |

---

## v1.5 Roadmap (coming next)
- Wind direction arrows
- Temperature globe mode toggle
- WebSocket live push (Socket.io)
