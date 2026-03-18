const axios = require('axios');

const BASE  = 'https://api.waqi.info';
const TOKEN = () => process.env.WAQI_TOKEN;

// Normalize state names for matching — strips diacritics, lowercases, trims
// Use this on BOTH the key side and the GeoJSON property side to avoid mismatches
function normalizeStateName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Country config ────────────────────────────────────────────────────────
const COUNTRY_CITIES = {
  AF: { name:'Afghanistan',           city:'kabul',              geo:[34.52,69.18] },
  AL: { name:'Albania',               city:'tirana',             geo:[41.33,19.82] },
  DZ: { name:'Algeria',               city:'algiers',            geo:[36.74,3.06]  },
  AD: { name:'Andorra',               city:'andorra la vella',   geo:[42.51,1.52]  },
  AO: { name:'Angola',                city:'luanda',             geo:[-8.84,13.23] },
  AG: { name:'Antigua & Barbuda',     city:'saint johns',        geo:[17.12,-61.85]},
  AR: { name:'Argentina',             city:'buenos aires',       alt:['cordoba','rosario'], geo:[-34.61,-58.38] },
  AM: { name:'Armenia',               city:'yerevan',            geo:[40.18,44.51] },
  AU: { name:'Australia',             city:'sydney',             alt:['melbourne','brisbane'], geo:[-33.87,151.21] },
  AT: { name:'Austria',               city:'vienna',             geo:[48.21,16.37] },
  AZ: { name:'Azerbaijan',            city:'baku',               geo:[40.41,49.87] },
  BS: { name:'Bahamas',               city:'nassau',             geo:[25.05,-77.35]},
  BH: { name:'Bahrain',               city:'manama',             geo:[26.22,50.59] },
  BD: { name:'Bangladesh',            city:'dhaka',              alt:['chittagong'], geo:[23.72,90.41] },
  BB: { name:'Barbados',              city:'bridgetown',         geo:[13.10,-59.62]},
  BY: { name:'Belarus',               city:'minsk',              geo:[53.90,27.57] },
  BE: { name:'Belgium',               city:'brussels',           alt:['antwerp','ghent'], geo:[50.85,4.35] },
  BZ: { name:'Belize',                city:'belmopan',           geo:[17.25,-88.77]},
  BJ: { name:'Benin',                 city:'cotonou',            geo:[6.37,2.42]   },
  BT: { name:'Bhutan',                city:'thimphu',            geo:[27.47,89.64] },
  BO: { name:'Bolivia',               city:'la paz',             alt:['santa cruz'], geo:[-16.50,-68.15] },
  BA: { name:'Bosnia',                city:'sarajevo',           geo:[43.85,18.39] },
  BW: { name:'Botswana',              city:'gaborone',           geo:[-24.65,25.91]},
  BR: { name:'Brazil',                city:'sao paulo',          alt:['rio de janeiro','brasilia','belo horizonte','manaus','fortaleza'], geo:[-23.55,-46.63] },
  BN: { name:'Brunei',                city:'bandar seri begawan',geo:[4.94,114.95] },
  BG: { name:'Bulgaria',              city:'sofia',              geo:[42.70,23.32] },
  BF: { name:'Burkina Faso',          city:'ouagadougou',        geo:[12.37,-1.53] },
  BI: { name:'Burundi',               city:'bujumbura',          geo:[-3.38,29.36] },
  KH: { name:'Cambodia',              city:'phnom penh',         geo:[11.56,104.92]},
  CM: { name:'Cameroon',              city:'yaounde',            alt:['douala'], geo:[3.87,11.52] },
  CA: { name:'Canada',                city:'toronto',            alt:['vancouver','montreal','calgary'], geo:[43.65,-79.38] },
  CV: { name:'Cape Verde',            city:'praia',              geo:[14.93,-23.51]},
  CF: { name:'Central African Rep.',  city:'bangui',             geo:[4.36,18.56]  },
  TD: { name:'Chad',                  city:'ndjamena',           geo:[12.11,15.04] },
  CL: { name:'Chile',                 city:'santiago',           geo:[-33.46,-70.65]},
  CN: { name:'China',                 city:'beijing',            alt:['shanghai','guangzhou','shenzhen','chengdu'], geo:[39.91,116.39] },
  CO: { name:'Colombia',              city:'bogota',             alt:['medellin','cali'], geo:[4.71,-74.07] },
  KM: { name:'Comoros',               city:'moroni',             geo:[-11.70,43.26]},
  CD: { name:'DR Congo',              city:'kinshasa',           geo:[-4.32,15.32] },
  CG: { name:'Congo',                 city:'brazzaville',        geo:[-4.27,15.28] },
  CR: { name:'Costa Rica',            city:'san jose',           geo:[9.93,-84.08] },
  CI: { name:'Ivory Coast',           city:'abidjan',            geo:[5.35,-4.00]  },
  HR: { name:'Croatia',               city:'zagreb',             geo:[45.81,15.98] },
  CU: { name:'Cuba',                  city:'havana',             geo:[23.13,-82.38]},
  CY: { name:'Cyprus',                city:'nicosia',            geo:[35.17,33.36] },
  CZ: { name:'Czech Republic',        city:'prague',             geo:[50.09,14.42] },
  DK: { name:'Denmark',               city:'copenhagen',         geo:[55.68,12.57] },
  DJ: { name:'Djibouti',              city:'djibouti',           geo:[11.59,43.15] },
  DM: { name:'Dominica',              city:'roseau',             geo:[15.30,-61.39]},
  DO: { name:'Dominican Republic',    city:'santo domingo',      geo:[18.48,-69.90]},
  EC: { name:'Ecuador',               city:'quito',              alt:['guayaquil'], geo:[-0.23,-78.52] },
  EG: { name:'Egypt',                 city:'cairo',              alt:['alexandria'], geo:[30.05,31.25] },
  SV: { name:'El Salvador',           city:'san salvador',       geo:[13.70,-89.21]},
  GQ: { name:'Equatorial Guinea',     city:'malabo',             geo:[3.75,8.79]   },
  ER: { name:'Eritrea',               city:'asmara',             geo:[15.33,38.93] },
  EE: { name:'Estonia',               city:'tallinn',            geo:[59.44,24.75] },
  ET: { name:'Ethiopia',              city:'addis ababa',        geo:[9.02,38.75]  },
  FJ: { name:'Fiji',                  city:'suva',               geo:[-18.14,178.44]},
  FI: { name:'Finland',               city:'helsinki',           geo:[60.17,24.94] },
  FR: { name:'France',                city:'paris',              alt:['marseille','lyon'], geo:[48.86,2.35] },
  GA: { name:'Gabon',                 city:'libreville',         geo:[0.39,9.45]   },
  GM: { name:'Gambia',                city:'banjul',             geo:[13.45,-16.58]},
  GE: { name:'Georgia',               city:'tbilisi',            geo:[41.69,44.83] },
  DE: { name:'Germany',               city:'berlin',             alt:['munich','hamburg','cologne'], geo:[52.52,13.40] },
  GH: { name:'Ghana',                 city:'accra',              alt:['kumasi'], geo:[5.56,-0.20] },
  GR: { name:'Greece',                city:'athens',             alt:['thessaloniki'], geo:[37.98,23.73] },
  GL: { name:'Greenland',             city:'nuuk',               geo:[64.18,-51.72]},
  GD: { name:'Grenada',               city:'st georges',         geo:[12.05,-61.75]},
  GT: { name:'Guatemala',             city:'guatemala city',     geo:[14.64,-90.51]},
  GN: { name:'Guinea',                city:'conakry',            geo:[9.54,-13.68] },
  GW: { name:'Guinea-Bissau',         city:'bissau',             geo:[11.86,-15.60]},
  GY: { name:'Guyana',                city:'georgetown',         geo:[6.80,-58.16] },
  HT: { name:'Haiti',                 city:'port au prince',     geo:[18.54,-72.34]},
  HN: { name:'Honduras',              city:'tegucigalpa',        geo:[14.09,-87.21]},
  HK: { name:'Hong Kong',             city:'hong kong',          geo:[22.28,114.16]},
  HU: { name:'Hungary',               city:'budapest',           geo:[47.50,19.04] },
  IS: { name:'Iceland',               city:'reykjavik',          geo:[64.14,-21.90]},
  IN: { name:'India',                 city:'delhi',              alt:['mumbai','kolkata','chennai','hyderabad','bangalore'], geo:[28.67,77.22] },
  ID: { name:'Indonesia',             city:'jakarta',            alt:['surabaya','bandung'], geo:[-6.21,106.85] },
  IR: { name:'Iran',                  city:'tehran',             alt:['isfahan','mashhad'], geo:[35.69,51.42] },
  IQ: { name:'Iraq',                  city:'baghdad',            geo:[33.34,44.40] },
  IE: { name:'Ireland',               city:'dublin',             geo:[53.33,-6.25] },
  IL: { name:'Israel',                city:'tel aviv',           alt:['jerusalem','haifa'], geo:[32.08,34.78] },
  IT: { name:'Italy',                 city:'milan',              alt:['rome','naples','turin'], geo:[45.47,9.19] },
  JM: { name:'Jamaica',               city:'kingston',           geo:[17.99,-76.79]},
  JP: { name:'Japan',                 city:'tokyo',              alt:['osaka','kyoto','nagoya'], geo:[35.69,139.69] },
  JO: { name:'Jordan',                city:'amman',              geo:[31.95,35.93] },
  KZ: { name:'Kazakhstan',            city:'almaty',             alt:['astana','nur-sultan'], geo:[43.25,76.95] },
  KE: { name:'Kenya',                 city:'nairobi',            geo:[-1.29,36.82] },
  KI: { name:'Kiribati',              city:'tarawa',             geo:[1.33,173.02] },
  KP: { name:'North Korea',           city:'pyongyang',          geo:[39.02,125.75]},
  KR: { name:'South Korea',           city:'seoul',              alt:['busan','incheon'], geo:[37.57,126.98] },
  KW: { name:'Kuwait',                city:'kuwait city',        geo:[29.37,47.98] },
  KG: { name:'Kyrgyzstan',            city:'bishkek',            geo:[42.87,74.59] },
  LA: { name:'Laos',                  city:'vientiane',          geo:[17.97,102.60]},
  LV: { name:'Latvia',                city:'riga',               geo:[56.95,24.11] },
  LB: { name:'Lebanon',               city:'beirut',             geo:[33.89,35.50] },
  LS: { name:'Lesotho',               city:'maseru',             geo:[-29.32,27.48]},
  LR: { name:'Liberia',               city:'monrovia',           geo:[6.31,-10.80] },
  LY: { name:'Libya',                 city:'tripoli',            geo:[32.90,13.18] },
  LI: { name:'Liechtenstein',         city:'vaduz',              geo:[47.14,9.52]  },
  LT: { name:'Lithuania',             city:'vilnius',            geo:[54.69,25.28] },
  LU: { name:'Luxembourg',            city:'luxembourg',         geo:[49.61,6.13]  },
  MK: { name:'North Macedonia',       city:'skopje',             geo:[41.99,21.43] },
  MG: { name:'Madagascar',            city:'antananarivo',       geo:[-18.91,47.54]},
  MW: { name:'Malawi',                city:'lilongwe',           geo:[-13.97,33.79]},
  MY: { name:'Malaysia',              city:'kuala lumpur',       alt:['penang','johor bahru'], geo:[3.14,101.69] },
  MV: { name:'Maldives',              city:'male',               geo:[4.18,73.51]  },
  ML: { name:'Mali',                  city:'bamako',             geo:[12.65,-8.00] },
  MT: { name:'Malta',                 city:'valletta',           geo:[35.90,14.51] },
  MH: { name:'Marshall Islands',      city:'majuro',             geo:[7.09,171.38] },
  MR: { name:'Mauritania',            city:'nouakchott',         geo:[18.08,-15.97]},
  MU: { name:'Mauritius',             city:'port louis',         geo:[-20.16,57.49]},
  MX: { name:'Mexico',                city:'mexico city',        alt:['guadalajara','monterrey','puebla'], geo:[19.43,-99.13] },
  FM: { name:'Micronesia',            city:'palikir',            geo:[6.92,158.16] },
  MD: { name:'Moldova',               city:'chisinau',           geo:[47.01,28.86] },
  MC: { name:'Monaco',                city:'monaco',             geo:[43.74,7.43]  },
  MN: { name:'Mongolia',              city:'ulaanbaatar',        geo:[47.91,106.89]},
  ME: { name:'Montenegro',            city:'podgorica',          geo:[42.44,19.26] },
  MA: { name:'Morocco',               city:'casablanca',         alt:['rabat','marrakesh','fes'], geo:[33.59,-7.62] },
  MZ: { name:'Mozambique',            city:'maputo',             geo:[-25.97,32.59]},
  MM: { name:'Myanmar',               city:'yangon',             alt:['mandalay','naypyidaw'], geo:[16.87,96.19] },
  NA: { name:'Namibia',               city:'windhoek',           geo:[-22.56,17.08]},
  NR: { name:'Nauru',                 city:'yaren',              geo:[-0.55,166.92]},
  NP: { name:'Nepal',                 city:'kathmandu',          geo:[27.72,85.32] },
  NL: { name:'Netherlands',           city:'amsterdam',          alt:['rotterdam','the hague'], geo:[52.37,4.90] },
  NZ: { name:'New Zealand',           city:'auckland',           alt:['wellington','christchurch'], geo:[-36.87,174.77] },
  NI: { name:'Nicaragua',             city:'managua',            geo:[12.15,-86.28]},
  NE: { name:'Niger',                 city:'niamey',             geo:[13.51,2.12]  },
  NG: { name:'Nigeria',               city:'lagos',              alt:['abuja','kano','ibadan'], geo:[6.45,3.40] },
  NO: { name:'Norway',                city:'oslo',               geo:[59.91,10.75] },
  OM: { name:'Oman',                  city:'muscat',             geo:[23.61,58.59] },
  PK: { name:'Pakistan',              city:'lahore',             alt:['karachi','islamabad','faisalabad'], geo:[31.55,74.34] },
  PW: { name:'Palau',                 city:'ngerulmud',          geo:[7.50,134.62] },
  PA: { name:'Panama',                city:'panama city',        geo:[8.99,-79.52] },
  PG: { name:'Papua New Guinea',      city:'port moresby',       geo:[-9.44,147.18]},
  PY: { name:'Paraguay',              city:'asuncion',           geo:[-25.28,-57.64]},
  PE: { name:'Peru',                  city:'lima',               alt:['arequipa'], geo:[-12.05,-77.04] },
  PH: { name:'Philippines',           city:'manila',             alt:['quezon city','cebu'], geo:[14.60,121.00] },
  PL: { name:'Poland',                city:'warsaw',             alt:['krakow','lodz','wroclaw'], geo:[52.23,21.01] },
  PT: { name:'Portugal',              city:'lisbon',             alt:['porto'], geo:[38.72,-9.14] },
  QA: { name:'Qatar',                 city:'doha',               geo:[25.29,51.53] },
  RO: { name:'Romania',               city:'bucharest',          alt:['cluj napoca'], geo:[44.43,26.10] },
  RU: { name:'Russia',                city:'moscow',             alt:['saint petersburg','novosibirsk','yekaterinburg'], geo:[55.75,37.62] },
  RW: { name:'Rwanda',                city:'kigali',             geo:[-1.94,30.06] },
  KN: { name:'Saint Kitts & Nevis',   city:'basseterre',         geo:[17.30,-62.72]},
  LC: { name:'Saint Lucia',           city:'castries',           geo:[14.01,-60.99]},
  VC: { name:'Saint Vincent',         city:'kingstown',          geo:[13.16,-61.22]},
  WS: { name:'Samoa',                 city:'apia',               geo:[-13.83,-171.77]},
  SM: { name:'San Marino',            city:'san marino',         geo:[43.94,12.46] },
  ST: { name:'Sao Tome & Principe',   city:'sao tome',           geo:[0.34,6.73]   },
  SA: { name:'Saudi Arabia',          city:'riyadh',             alt:['jeddah','mecca','medina'], geo:[24.69,46.72] },
  SN: { name:'Senegal',               city:'dakar',              geo:[14.73,-17.47]},
  RS: { name:'Serbia',                city:'belgrade',           geo:[44.82,20.46] },
  SC: { name:'Seychelles',            city:'victoria',           geo:[-4.62,55.46] },
  SL: { name:'Sierra Leone',          city:'freetown',           geo:[8.49,-13.23] },
  SG: { name:'Singapore',             city:'singapore',          geo:[1.36,103.82] },
  SK: { name:'Slovakia',              city:'bratislava',         geo:[48.15,17.11] },
  SI: { name:'Slovenia',              city:'ljubljana',          geo:[46.05,14.51] },
  SB: { name:'Solomon Islands',       city:'honiara',            geo:[-9.43,160.05]},
  SO: { name:'Somalia',               city:'mogadishu',          geo:[2.05,45.34]  },
  ZA: { name:'South Africa',          city:'johannesburg',       alt:['cape town','pretoria','durban'], geo:[-26.20,28.04] },
  SS: { name:'South Sudan',           city:'juba',               geo:[4.86,31.57]  },
  ES: { name:'Spain',                 city:'madrid',             alt:['barcelona','valencia','seville'], geo:[40.42,-3.70] },
  LK: { name:'Sri Lanka',             city:'colombo',            geo:[6.93,79.85]  },
  SD: { name:'Sudan',                 city:'khartoum',           geo:[15.55,32.53] },
  SR: { name:'Suriname',              city:'paramaribo',         geo:[5.87,-55.17] },
  SZ: { name:'Eswatini',              city:'mbabane',            geo:[-26.32,31.14]},
  SE: { name:'Sweden',                city:'stockholm',          alt:['gothenburg','malmo'], geo:[59.33,18.07] },
  CH: { name:'Switzerland',           city:'zurich',             alt:['geneva','bern'], geo:[47.38,8.54] },
  SY: { name:'Syria',                 city:'damascus',           geo:[33.51,36.29] },
  TW: { name:'Taiwan',                city:'taipei',             geo:[25.05,121.53]},
  TJ: { name:'Tajikistan',            city:'dushanbe',           geo:[38.56,68.77] },
  TZ: { name:'Tanzania',              city:'dar es salaam',      alt:['dodoma'], geo:[-6.79,39.21] },
  TH: { name:'Thailand',              city:'bangkok',            alt:['chiang mai','pattaya'], geo:[13.75,100.52] },
  TL: { name:'Timor-Leste',           city:'dili',               geo:[-8.56,125.58]},
  TG: { name:'Togo',                  city:'lome',               geo:[6.14,1.21]   },
  TO: { name:'Tonga',                 city:'nukualofa',          geo:[-21.14,-175.22]},
  TT: { name:'Trinidad & Tobago',     city:'port of spain',      geo:[10.65,-61.52]},
  TN: { name:'Tunisia',               city:'tunis',              geo:[36.82,10.17] },
  TR: { name:'Turkey',                city:'istanbul',           alt:['ankara','izmir','bursa'], geo:[41.01,28.95] },
  TM: { name:'Turkmenistan',          city:'ashgabat',           geo:[37.95,58.38] },
  TV: { name:'Tuvalu',                city:'funafuti',           geo:[-8.52,179.20]},
  UG: { name:'Uganda',                city:'kampala',            geo:[0.32,32.58]  },
  UA: { name:'Ukraine',               city:'kyiv',               alt:['kharkiv','odessa','lviv'], geo:[50.45,30.52] },
  AE: { name:'UAE',                   city:'dubai',              alt:['abu dhabi','sharjah'], geo:[25.20,55.27] },
  GB: { name:'United Kingdom',        city:'london',             alt:['birmingham','manchester','edinburgh'], geo:[51.51,-0.13] },
  US: { name:'United States',         city:'new york',           alt:['los angeles','chicago','houston','phoenix'], geo:[40.71,-74.01] },
  UY: { name:'Uruguay',               city:'montevideo',         geo:[-34.90,-56.19]},
  UZ: { name:'Uzbekistan',            city:'tashkent',           geo:[41.30,69.24] },
  VU: { name:'Vanuatu',               city:'port vila',          geo:[-17.73,168.32]},
  VE: { name:'Venezuela',             city:'caracas',            alt:['maracaibo','valencia'], geo:[10.48,-66.88] },
  VN: { name:'Vietnam',               city:'hanoi',              alt:['ho chi minh city','da nang'], geo:[21.03,105.85] },
  EH: { name:'Western Sahara',        city:'laayoune',           geo:[27.15,-13.20]},
  YE: { name:'Yemen',                 city:'sanaa',              geo:[15.35,44.21] },
  ZM: { name:'Zambia',                city:'lusaka',             geo:[-15.42,28.28]},
  ZW: { name:'Zimbabwe',              city:'harare',             geo:[-17.83,31.05]},
};

// ─── Core fetch helpers ────────────────────────────────────────────────────

async function fetchCityAQI(city) {
  try {
    const url = `${BASE}/feed/${encodeURIComponent(city)}/?token=${TOKEN()}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    if (data.status !== 'ok' || !data.data || data.data === 'Unknown station') return null;
    const d = data.data;
    const aqi = typeof d.aqi === 'number' ? d.aqi : parseInt(d.aqi);
    if (!aqi || isNaN(aqi) || aqi <= 0) return null;
    return {
      aqi, dominentpol: d.dominentpol || null,
      city: d.city?.name || city, time: d.time?.s || null,
      iaqi: {
        pm25: d.iaqi?.pm25?.v ?? null, pm10: d.iaqi?.pm10?.v ?? null,
        no2:  d.iaqi?.no2?.v  ?? null, o3:   d.iaqi?.o3?.v   ?? null,
        co:   d.iaqi?.co?.v   ?? null, so2:  d.iaqi?.so2?.v  ?? null,
      }
    };
  } catch { return null; }
}

async function fetchGeoAQI(lat, lon) {
  try {
    const url = `${BASE}/feed/geo:${lat};${lon}/?token=${TOKEN()}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    if (data.status !== 'ok' || !data.data) return null;
    const d = data.data;
    const aqi = typeof d.aqi === 'number' ? d.aqi : parseInt(d.aqi);
    if (!aqi || isNaN(aqi) || aqi <= 0) return null;
    return {
      aqi, dominentpol: d.dominentpol || null,
      city: d.city?.name || null, time: d.time?.s || null,
      iaqi: {
        pm25: d.iaqi?.pm25?.v ?? null, pm10: d.iaqi?.pm10?.v ?? null,
        no2:  d.iaqi?.no2?.v  ?? null, o3:   d.iaqi?.o3?.v   ?? null,
        co:   d.iaqi?.co?.v   ?? null, so2:  d.iaqi?.so2?.v  ?? null,
      }
    };
  } catch { return null; }
}

async function searchAQI(query) {
  try {
    const { data } = await axios.get(
      `${BASE}/search/?keyword=${encodeURIComponent(query)}&token=${TOKEN()}`,
      { timeout: 5000 }
    );
    if (data.status !== 'ok' || !data.data?.length) return null;
    const station = data.data.find(s => { const a = parseInt(s.aqi); return a > 0 && !isNaN(a); });
    if (!station) return null;
    return fetchCityAQI(`@${station.uid}`);
  } catch { return null; }
}

async function fetchCountryData(code) {
  const entry = COUNTRY_CITIES[code];
  if (!entry) return null;
  let result = await fetchCityAQI(entry.city);
  if (result) return result;
  if (entry.alt) {
    for (const alt of entry.alt) {
      result = await fetchCityAQI(alt);
      if (result) return result;
    }
  }
  if (entry.geo) {
    result = await fetchGeoAQI(entry.geo[0], entry.geo[1]);
    if (result) return result;
  }
  return searchAQI(entry.name);
}

async function fetchAllCountries() {
  const codes = Object.keys(COUNTRY_CITIES);
  const results = {};
  const BATCH = 10;
  for (let i = 0; i < codes.length; i += BATCH) {
    const batch = codes.slice(i, i + BATCH);
    await Promise.all(batch.map(async (code) => {
      const data = await fetchCountryData(code);
      if (data?.aqi != null) {
        results[code] = { ...data, countryCode: code, countryName: COUNTRY_CITIES[code].name };
      }
    }));
    if (i + BATCH < codes.length) await new Promise(r => setTimeout(r, 500));
  }
  const missing = Object.keys(COUNTRY_CITIES).filter(c => !results[c]);
  console.log(`[WAQI] ${Object.keys(results).length}/${codes.length} countries. Missing: ${missing.join(', ')}`);
  return results;
}

async function fetchSingleCountry(code) { return fetchCountryData(code); }

async function fetchMapBounds(lat1=-60, lng1=-180, lat2=75, lng2=180) {
  try {
    const { data } = await axios.get(
      `${BASE}/map/bounds/?latlng=${lat1},${lng1},${lat2},${lng2}&token=${TOKEN()}`,
      { timeout: 15000 }
    );
    if (data.status !== 'ok') return [];
    return data.data.map(s => ({
      lat: s.lat, lon: s.lon,
      aqi: typeof s.aqi === 'number' ? s.aqi : parseInt(s.aqi) || 0,
      station: s.station?.name || ''
    }));
  } catch (e) { console.error('fetchMapBounds error:', e.message); return []; }
}

// ─── India state config ────────────────────────────────────────────────────
// IMPORTANT: Keys MUST match the shapeName/name properties in india-states-simplified.json
// "Odisha" (not "Orissa") — renamed in 2011
// "Uttarakhand" (not "Uttaranchal") — renamed in 2000
// Diacritics handled by normalizeStateName() used in fetchIndiaStates()
const INDIA_STATES = {
  'Andaman and Nicobar':    { cities: ['Port Blair'],                  geo: [11.67, 92.74] },
  'Andhra Pradesh':         { cities: ['Secretariat, Amaravati, India','Visakhapatnam','Tirumala-APPCB'], geo: [17.68, 83.22] },
  'Arunachal Pradesh':      { cities: ['Naharlagun','Itanagar'],        geo: [27.08, 93.62] },
  'Assam':                  { cities: ['Railway Colony, Guwahati, India','Guwahati'], geo: [26.19, 91.75] },
  'Bihar':                  { cities: ['Patna','Arrah','Bhagalpur','Gaya','Muzaffarpur'], geo: [25.59, 85.14] },
  'Chandigarh':             { cities: ['Chandigarh'],                   geo: [30.73, 76.78] },
  'Chhattisgarh':           { cities: ['Raipur','Bhilai'],              geo: [21.25, 81.63] },
  'Dadra and Nagar Haveli and Daman and Diu': { cities: ['Daman','Silvassa','Vapi'], geo: [20.40, 72.83] },
  'Delhi':                  { cities: ['Delhi','Anand Vihar','Mundka'],  geo: [28.61, 77.21] },
  'Goa':                    { cities: ['Panaji'],                        geo: [15.49, 73.83] },
  'Gujarat':                { cities: ['Ahmedabad','Gandhinagar','Vapi','Surat'], geo: [23.03, 72.58] },
  'Haryana':                { cities: ['Faridabad','Gurugram','Hisar','Karnal','Panipat'], geo: [28.41, 77.31] },
  'Himachal Pradesh':       { cities: ['Shimla','Dharamshala','Baddi'],  geo: [31.10, 77.17] },
  'Jammu and Kashmir':      { cities: ['Srinagar','Rajbagh, Srinagar'],  geo: [34.08, 74.80] },
  'Jharkhand':              { cities: ['Ranchi','Jamshedpur','Dhanbad'],  geo: [23.34, 85.31] },
  'Karnataka':              { cities: ['Bengaluru','Mysuru','Hubballi'],  geo: [12.97, 77.59] },
  'Kerala':                 { cities: ['Kochi','Kollam','Kannur','Eloor'], geo: [9.94, 76.26] },
  'Ladakh':                 { cities: ['Leh','Kargil'],                   geo: [34.16, 77.58] },
  'Lakshadweep':            { cities: ['Kavaratti'],                      geo: [10.57, 72.64] },
  'Madhya Pradesh':         { cities: ['Bhopal','Indore','Gwalior','Jabalpur'], geo: [23.26, 77.40] },
  'Maharashtra':            { cities: ['Mumbai','Nagpur','Nashik','Pune'], geo: [19.08, 72.88] },
  'Manipur':                { cities: ['Imphal'],                          geo: [24.82, 93.94] },
  'Meghalaya':              { cities: ['Shillong'],                        geo: [25.57, 91.88] },
  'Mizoram':                { cities: ['Aizawl','Sikulpuikawn'],           geo: [23.73, 92.72] },
  'Nagaland':               { cities: ['Kohima'],                          geo: [25.67, 94.11] },
  // FIXED: was "Orissa" — official name is "Odisha" since 2011
  'Odisha':                 { cities: ['Bhubaneswar','Cuttack','Talcher'], geo: [20.30, 85.85] },
  'Puducherry':             { cities: ['Pondicherry'],                     geo: [11.94, 79.83] },
  'Punjab':                 { cities: ['Amritsar','Ludhiana','Patiala'],   geo: [31.63, 74.87] },
  'Rajasthan':              { cities: ['Jaipur','Jodhpur','Kota','Udaipur'], geo: [26.92, 75.79] },
  'Sikkim':                 { cities: ['Gangtok','Zero Point GICI, Gangtok'], geo: [27.33, 88.61] },
  'Tamil Nadu':             { cities: ['Chennai','Coimbatore','Madurai'],  geo: [13.08, 80.27] },
  'Telangana':              { cities: ['Hyderabad','Somajiguda, Hyderabad'], geo: [17.38, 78.47] },
  'Tripura':                { cities: ['Agartala'],                         geo: [23.83, 91.28] },
  'Uttar Pradesh':          { cities: ['Lucknow','Agra','Kanpur','Varanasi','Meerut'], geo: [26.85, 80.95] },
  // FIXED: was "Uttaranchal" — official name is "Uttarakhand" since 2000
  'Uttarakhand':            { cities: ['Dehradun','Haridwar'],              geo: [30.32, 78.03] },
  'West Bengal':            { cities: ['Kolkata','Asansol','Durgapur','Siliguri'], geo: [22.57, 88.36] },
};

async function fetchIndiaStates() {
  const results = {};
  const entries = Object.entries(INDIA_STATES);
  const BATCH = 5;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(batch.map(async ([state, cfg]) => {
      try {
        let data = null;
        for (const city of cfg.cities) {
          data = await fetchCityAQI(city);
          if (data?.aqi != null) break;
        }
        if (!data?.aqi) data = await fetchGeoAQI(cfg.geo[0], cfg.geo[1]);
        if (data?.aqi != null) {
          // Store under normalized key so globe lookup is diacritic-tolerant
          const key = normalizeStateName(state);
          results[key] = { aqi: data.aqi, city: data.city || cfg.cities[0], rawName: state };
        }
      } catch { /* skip */ }
    }));
    if (i + BATCH < entries.length) await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[WAQI] India states: ${Object.keys(results).length}/${entries.length} fetched`);
  return results;
}

module.exports = {
  fetchAllCountries, fetchSingleCountry, fetchCityAQI, fetchGeoAQI,
  fetchMapBounds, fetchIndiaStates, normalizeStateName, COUNTRY_CITIES
};
