const mongoose = require('mongoose');

const CountryDetailSchema = new mongoose.Schema({
  countryCode: { type: String, index: true },
  countryName: String,
  city: String,
  aqi: Number,
  dominentpol: String,
  fetchedAt: { type: Date, default: Date.now },
  iaqi: {
    pm25: Number,
    pm10: Number,
    no2: Number,
    o3: Number,
    co: Number,
    so2: Number,
  },
  time: String,
});

CountryDetailSchema.index({ countryCode: 1, fetchedAt: -1 });

module.exports = mongoose.model('CountryDetail', CountryDetailSchema);
