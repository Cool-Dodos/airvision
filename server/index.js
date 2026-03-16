require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { startCronJob } = require('./services/cron');
const aqiRoutes = require('./routes/aqi');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'https://airvision-seven.vercel.app',
    'http://localhost:4200'
  ]
}));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    startCronJob();
  })
  .catch(err => console.error('MongoDB error:', err));

app.use('/api/aqi', aqiRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

app.listen(PORT, () => console.log(`AirVision server running on port ${PORT}`));