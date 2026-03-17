require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { startCronJob } = require('./services/cron');
const aqiRoutes = require('./routes/aqi');
const weatherRoutes = require('./routes/weather');

const app = express();
const PORT = process.env.PORT || 5000;

// Security headers — Relaxed for cross-domain SPA deployment
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Disable CSP for simpler SPA/API split
}));

// CORS — Allow production Vercel and local dev
app.use(cors({
  origin: [
    'https://airvision-seven.vercel.app',
    'https://airvision.vercel.app',
    'http://localhost:4200'
  ],
  credentials: true
}));

// Rate limiting — 100 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    startCronJob();
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/aqi', aqiRoutes);
app.use('/api/weather', weatherRoutes);

app.get('/', (req, res) => res.json({ name: 'AirVision API', status: 'online' }));

app.listen(PORT, () => console.log(`AirVision server running on port ${PORT}`));