const express = require('express');
const router = express.Router();
const { fetchGlobalWind } = require('../services/weather');

router.get('/wind', async (req, res) => {
  try {
    const data = await fetchGlobalWind();
    res.json({ status: 'ok', grid: data });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
