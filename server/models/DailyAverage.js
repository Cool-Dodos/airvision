const mongoose = require('mongoose');

// Stores one doc per country per day — used for 30-day rolling average + anomaly detection
const DailyAverageSchema = new mongoose.Schema({
  countryCode: { type: String, index: true },
  countryName: String,
  date: { type: String, index: true },       // "YYYY-MM-DD"
  avgAqi: Number,
  maxAqi: Number,
  minAqi: Number,
  readingCount: Number,
  dominentpol: String,
  createdAt: { type: Date, default: Date.now },
});

DailyAverageSchema.index({ countryCode: 1, date: -1 });

module.exports = mongoose.models.DailyAverage || mongoose.model('DailyAverage', DailyAverageSchema);
