require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const mongoose = require('mongoose');
const { startCronJob } = require('./services/cron');
const aqiRoutes = require('./routes/aqi');
const weatherRoutes = require('./routes/weather');

const app = express();
// Trust X-Forwarded-For from Vercel/Render proxy
app.set('trust proxy', true);

// CORS — Allowing your Vercel domains explicitly
const ALLOWED_ORIGINS = [
  'https://airvision-seven.vercel.app',
  'https://airvision.vercel.app',
  'http://localhost:4200',
];

app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true 
}));

const realIp = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ?? req.headers['x-real-ip'] ?? req.ip;

// Request body limit — prevents large payload attacks
app.use(express.json({ limit: '10kb' }));

// Health check — visible at /api/ping
app.get('/api/ping', (req, res) => res.json({ 
  status: 'ok', 
  ip: realIp(req), 
  timestamp: new Date().toISOString() 
}));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    startCronJob(); // Start scheduled AQI polling after DB connects
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/aqi', aqiRoutes);
app.use('/api/weather', weatherRoutes);

app.get('/', (req, res) => res.json({ name: 'AirVision API', status: 'online' }));

// ─── Global Error Handler ──────────────────────────────────────────────────
// Prevents information leakage by masking stack traces in production
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  
  // Log full error on server for debugging
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.stack || err.message || err);

  res.status(status).json({
    ok: false,
    error: isProd ? 'Internal Server Error' : (err.message || 'An unexpected error occurred'),
    ...(isProd ? {} : { stack: err.stack })
  });
});


app.listen(PORT, () => console.log(`AirVision server running on port ${PORT}`));
