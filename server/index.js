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
const PORT = process.env.PORT || 5000;

app.use(compression());

// Content Security Policy — whitelists only required external sources
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'cdn.jsdelivr.net'],
      connectSrc: [
        "'self'",
        'https://api.waqi.info',
        'https://www.geoboundaries.org',
        'https://api.open-meteo.com',
        'https://cdn.jsdelivr.net',
      ],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
    }
  }
}));

// CORS — origins loaded from ALLOWED_ORIGINS env var or defaults to a safe set
const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
const ALLOWED_ORIGINS = [
  ...envOrigins,
  'https://airvision-seven.vercel.app',
  'https://airvision.vercel.app',
  'http://localhost:4200',
];

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

// Trust X-Forwarded-For from Vercel/Render proxy
app.set('trust proxy', 1);

const realIp = (req) =>
  (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ?? req.headers['x-real-ip'] ?? req.ip;

// Progressive slowdown — adds delay after 100 req/15min to deter scrapers
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 100, // start slowing after 100 req
  delayMs: (used) => (used - 100) * 100, // +100ms per req above 100
  keyGenerator: realIp,
});
app.use('/api/', speedLimiter);

// Hard rate limit — 1500 req/15min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: realIp,
  message: { error: 'Too many requests, please slow down.' }
});
app.use('/api/', limiter);

// Request body limit — prevents large payload attacks
app.use(express.json({ limit: '10kb' }));

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
