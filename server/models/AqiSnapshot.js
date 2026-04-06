const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
  lat: Number,
  lon: Number,
  aqi: Number,
  stationName: String,
  countryCode: String,
  countryName: String,
}, { _id: false });

// Sub-schema for each country's averaged AQI data
const CountryDataSchema = new mongoose.Schema({
  name:         { type: String },
  avgAqi:       { type: Number },
  maxAqi:       { type: Number },
  minAqi:       { type: Number },
  stationCount: { type: Number },
  dominentpol:  { type: String },
  city:         { type: String },
  time:         { type: String },
  iaqi: new mongoose.Schema({
    pm25: Number,
    pm10: Number,
    no2:  Number,
    o3:   Number,
    co:   Number,
    so2:  Number,
  }, { _id: false })
}, { _id: false });

const AqiSnapshotSchema = new mongoose.Schema({
  fetchedAt: {
    type:    Date,
    default: Date.now,
    index:   true,
  },
  stations: [StationSchema],
  countryAverages: {
    type: Map,
    of:   CountryDataSchema,
  },
}, {
  timestamps: false,
  versionKey: false,
});

// Compound index for efficient sort-by-time queries
AqiSnapshotSchema.index({ fetchedAt: -1 });

// TTL index — MongoDB automatically deletes snapshots older than 25 hours
// 25h = 90000 seconds; provides a 1-hour buffer above the 24h data window
AqiSnapshotSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 90000 });

module.exports = mongoose.models.AqiSnapshot || mongoose.model('AqiSnapshot', AqiSnapshotSchema);

