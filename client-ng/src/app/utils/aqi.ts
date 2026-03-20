export interface AqiInfo {
  cat: string;
  col: string;
  textCol: string;
  advice: string;
}

export function aqiInfo(v: number | null | undefined): AqiInfo {
  if (v === null || v === undefined || isNaN(v as number)) {
    return {
      cat: 'NO DATA',
      col: '#1e3050',
      textCol: '#4a6a8a',
      advice: 'No data available for this region.'
    };
  }
  if (v <= 50)  return {
    cat: 'GOOD',
    col: '#00b894',          // teal-green — readable on dark
    textCol: '#004d3d',
    advice: 'Air quality is satisfactory. Enjoy outdoor activities.'
  };
  if (v <= 100) return {
    cat: 'MODERATE',
    col: '#fdcb6e',          // warm amber gold
    textCol: '#5a4200',
    advice: 'Sensitive individuals should limit prolonged outdoor exertion.'
  };
  if (v <= 150) return {
    cat: 'UNHEALTHY FOR SENSITIVE',
    col: '#e17055',          // salmon-orange
    textCol: '#5a1e00',
    advice: 'People with heart/lung disease, elderly, and children should reduce outdoor exertion.'
  };
  if (v <= 200) return {
    cat: 'UNHEALTHY',
    col: '#d63031',          // ruby
    textCol: '#4a0000',
    advice: 'Everyone may experience health effects. Avoid prolonged outdoor activity.'
  };
  if (v <= 300) return {
    cat: 'VERY UNHEALTHY',
    col: '#6c5ce7',          // electric violet
    textCol: '#e0d8ff',
    advice: 'Health alert — serious effects for everyone. Stay indoors. Wear N95 mask if outside.'
  };
  return {
    cat: 'HAZARDOUS',
    col: '#a8071a',          // deep crimson
    textCol: '#ffe0e4',
    advice: 'Emergency conditions. Stay indoors. Seal windows and doors.'
  };
}

export const POLLUTANT_LABELS: Record<string, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2:  'NO₂',
  o3:   'O₃',
  co:   'CO',
  so2:  'SO₂',
};

export const CODE_TO_NUMERIC: Record<string, number> = {
  AF: 4, AL: 8, DZ: 12, AS: 16, AD: 20, AO: 24, AI: 660, AG: 28, AR: 32, AM: 51,
  AW: 533, AU: 36, AT: 40, AZ: 31, BS: 44, BH: 48, BD: 50, BB: 52, BY: 112, BE: 56,
  BZ: 84, BJ: 204, BM: 60, BT: 64, BO: 68, BA: 70, BW: 72, BV: 74, BR: 76, IO: 86,
  BN: 96, BG: 100, BF: 854, BI: 108, KH: 116, CM: 120, CA: 124, CV: 132, KY: 136,
  CF: 140, TD: 148, CL: 152, CN: 156, CX: 162, CC: 166, CO: 170, KM: 174, CG: 178,
  CD: 180, CK: 184, CR: 188, CI: 384, HR: 191, CU: 192, CY: 196, CZ: 203, DK: 208,
  DJ: 262, DM: 212, DO: 214, EC: 218, EG: 818, SV: 222, GQ: 226, ER: 232, EE: 233,
  ET: 231, FI: 246, FR: 250, GA: 266, GM: 270, GE: 268, DE: 276, GH: 288, GI: 292,
  GR: 300, GL: 304, GD: 308, GP: 312, GU: 316, GT: 320, GN: 324, GW: 624, GY: 328,
  HT: 332, HM: 334, VA: 336, HN: 340, HK: 344, HU: 348, IS: 352, IN: 356, ID: 360,
  IR: 364, IQ: 368, IE: 372, IL: 376, IT: 380, JM: 388, JP: 392, JO: 400, KZ: 398,
  KE: 404, KI: 296, KP: 408, KR: 410, KW: 414, KG: 417, LA: 418, LV: 428, LB: 422,
  LS: 426, LR: 430, LY: 434, LI: 438, LT: 440, LU: 442, MO: 446, MK: 807, MG: 450,
  MW: 454, MY: 458, MV: 462, ML: 466, MT: 470, MH: 584, MQ: 474, MR: 478, MU: 480,
  YT: 175, MX: 484, FM: 583, MD: 498, MC: 492, MN: 496, MS: 500, MA: 504, MZ: 508,
  MM: 104, NA: 516, NR: 520, NP: 524, NL: 528, NC: 540, NZ: 554, NI: 558, NE: 562,
  NG: 566, NU: 570, NF: 574, MP: 580, NO: 578, OM: 512, PK: 586, PW: 585, PS: 275,
  PA: 591, PG: 598, PY: 600, PE: 604, PH: 608, PN: 612, PL: 616, PT: 620, PR: 630,
  QA: 634, RE: 638, RO: 642, RU: 643, RW: 646, SH: 654, KN: 659, LC: 662, PM: 666,
  VC: 670, WS: 882, SM: 674, ST: 678, SA: 682, SN: 686, SC: 690, SL: 694, SG: 702,
  SK: 703, SI: 705, SB: 90, SO: 706, ZA: 710, ES: 724, LK: 144, SD: 729, SR: 740,
  SJ: 744, SZ: 748, SE: 752, CH: 756, SY: 760, TW: 158, TJ: 762, TZ: 834, TH: 764,
  TL: 626, TG: 768, TK: 772, TO: 776, TT: 780, TN: 788, TR: 792, TM: 795, TC: 796,
  TV: 798, UG: 800, UA: 804, AE: 784, GB: 826, US: 840, UM: 581, UY: 858, UZ: 860,
  VU: 548, VE: 862, VN: 704, VG: 92, VI: 850, WF: 876, EH: 732, YE: 887, ZM: 894,
  ZW: 716, SS: 728,
  RS: 688, ME: 499, FJ: 242, GG: 832, JE: 831, IM: 833, CW: 531, SX: 534,
  MF: 663, BL: 652, PF: 258, TF: 260, AX: 248, FO: 234, GS: 239, FK: 238
};

export const NUMERIC_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_TO_NUMERIC).map(([a, n]) => [String(n), a])
);
