const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
  lat: Number,
  lon: Number,
  aqi: Number,
  stationName: String,
  countryCode: String,
  countryName: String,
}, { _id: false });

const AqiSnapshotSchema = new mongoose.Schema({
  fetchedAt: { type: Date, default: Date.now, index: true },
  stations: [StationSchema],
  countryAverages: {
    type: Map,
    of: new mongoose.Schema({
      name: String,
      avgAqi: Number,
      maxAqi: Number,
      minAqi: Number,
      stationCount: Number,
      dominentpol: String,
    }, { _id: false })
  }
});

AqiSnapshotSchema.index({ fetchedAt: -1 });

module.exports = mongoose.model('AqiSnapshot', AqiSnapshotSchema);
