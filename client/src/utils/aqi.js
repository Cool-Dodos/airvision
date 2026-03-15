// Maps numeric AQI to color, category, and health advice
export function aqiInfo(v) {
  if (v === null || v === undefined || isNaN(v)) {
    return { cat: 'NO DATA', col: '#1a2a3a', textCol: '#4a6a8a', advice: 'No data available for this region.' };
  }
  if (v <= 50)  return { cat: 'GOOD',                        col: '#00e400', textCol: '#004400', advice: 'Air quality is satisfactory. Enjoy outdoor activities.' };
  if (v <= 100) return { cat: 'MODERATE',                    col: '#ffff00', textCol: '#444400', advice: 'Sensitive individuals should limit prolonged outdoor exertion.' };
  if (v <= 150) return { cat: 'UNHEALTHY FOR SENSITIVE',     col: '#ff7e00', textCol: '#5a2a00', advice: 'People with heart/lung disease, elderly, and children should reduce outdoor exertion.' };
  if (v <= 200) return { cat: 'UNHEALTHY',                   col: '#ff0000', textCol: '#5a0000', advice: 'Everyone may experience health effects. Avoid prolonged outdoor activity.' };
  if (v <= 300) return { cat: 'VERY UNHEALTHY',              col: '#8f3f97', textCol: '#f0d0f5', advice: 'Health alert — serious effects for everyone. Stay indoors. Wear N95 mask if outside.' };
  return               { cat: 'HAZARDOUS',                   col: '#7e0023', textCol: '#ffd0d8', advice: 'Emergency conditions. Stay indoors. Seal windows and doors. Avoid all outdoor activity.' };
}

// Dominant pollutant labels
export const POLLUTANT_LABELS = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2:  'NO₂',
  o3:   'O₃',
  co:   'CO',
  so2:  'SO₂',
};

// ISO 3166-1 alpha-2 code → TopoJSON numeric id (world-atlas 110m)
// Used to map our API country codes to the world map features
export const CODE_TO_NUMERIC = {
  AF: 4,   AL: 8,   DZ: 12,  AO: 24,  AR: 32,  AM: 51,  AU: 36,
  AT: 40,  AZ: 31,  BH: 48,  BD: 50,  BY: 112, BE: 56,  BZ: 84,
  BJ: 204, BT: 64,  BO: 68,  BA: 70,  BW: 72,  BR: 76,  BN: 96,
  BG: 100, BF: 854, KH: 116, CM: 120, CA: 124, CF: 140, TD: 148,
  CL: 152, CN: 156, CO: 170, CD: 180, CG: 178, CR: 188, HR: 191,
  CU: 192, CY: 196, CZ: 203, DK: 208, DJ: 262, EC: 218, EG: 818,
  SV: 222, GQ: 226, ER: 232, EE: 233, ET: 231, FI: 246, FR: 250,
  GA: 266, GM: 270, GE: 268, DE: 276, GH: 288, GR: 300, GT: 320,
  GN: 324, GW: 624, GY: 328, HT: 332, HN: 340, HU: 348, IS: 352,
  IN: 356, ID: 360, IR: 364, IQ: 368, IE: 372, IL: 376, IT: 380,
  JM: 388, JP: 392, JO: 400, KZ: 398, KE: 404, KP: 408, KR: 410,
  KW: 414, KG: 417, LA: 418, LV: 428, LB: 422, LS: 426, LR: 430,
  LY: 434, LT: 440, LU: 442, MK: 807, MG: 450, MW: 454, MY: 458,
  ML: 466, MT: 470, MR: 478, MX: 484, MD: 498, MN: 496, MA: 504,
  MZ: 508, MM: 104, NA: 516, NP: 524, NL: 528, NZ: 554, NI: 558,
  NE: 562, NG: 566, NO: 578, OM: 512, PK: 586, PA: 591, PG: 598,
  PY: 600, PE: 604, PH: 608, PL: 616, PT: 620, QA: 634, RO: 642,
  RU: 643, RW: 646, SA: 682, SN: 686, RS: 688, SL: 694, SG: 702,
  SK: 703, SI: 705, SO: 706, ZA: 710, SS: 728, ES: 724, LK: 144,
  SD: 729, SE: 752, CH: 756, SY: 760, TW: 158, TJ: 762, TZ: 834,
  TH: 764, TL: 626, TG: 768, TN: 788, TR: 792, TM: 795, UG: 800,
  UA: 804, AE: 784, GB: 826, US: 840, UY: 858, UZ: 860, VE: 862,
  VN: 704, YE: 887, ZM: 894, ZW: 716,
};

// Reverse map: numeric → alpha-2
export const NUMERIC_TO_CODE = Object.fromEntries(
  Object.entries(CODE_TO_NUMERIC).map(([a, n]) => [String(n), a])
);
