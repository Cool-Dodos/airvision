export interface SafeTime {
  healthy: string;
  sensitive: string;
  children: string;
}

export function safeOutdoorTime(aqi: number | null | undefined): SafeTime {
  if (!aqi) return { healthy: 'Unknown', sensitive: 'Unknown', children: 'Unknown' };
  if (aqi <= 50)  return { healthy: 'All day',    sensitive: 'All day',    children: 'All day' };
  if (aqi <= 100) return { healthy: 'All day',    sensitive: '4–6 hours',  children: '4 hours' };
  if (aqi <= 150) return { healthy: '3–4 hours',  sensitive: '1–2 hours',  children: '30 min' };
  if (aqi <= 200) return { healthy: '1–2 hours',  sensitive: '20–30 min',  children: 'Stay in' };
  if (aqi <= 300) return { healthy: '20–30 min',  sensitive: 'Stay in',    children: 'Stay in' };
  return               { healthy: 'Stay in',    sensitive: 'Stay in',    children: 'Stay in' };
}

export function bestHourAdvice(aqi: number | null | undefined, dominentpol?: string): string {
  if (!aqi) return 'Check local forecast';
  if (aqi <= 50)  return 'Any time — air is clean';
  if (aqi <= 100) return 'Anytime, prefer 5–9 AM';
  if (dominentpol === 'o3')   return '5–8 AM (ozone peaks 12–6 PM)';
  if (dominentpol === 'pm25' || dominentpol === 'pm10') return '5–7 AM or after 8 PM';
  if (aqi <= 150) return '5–8 AM if necessary';
  if (aqi <= 200) return 'Early morning only, limit activity';
  return 'Avoid going out — no good window today';
}

export interface MaskAdvice {
  needed: boolean;
  type: string;
  note: string;
}

export function maskAdvice(aqi: number | null | undefined): MaskAdvice {
  if (!aqi || aqi <= 100) return { needed: false, type: 'Not needed',    note: 'Air quality acceptable' };
  if (aqi <= 150)          return { needed: false, type: 'Optional',     note: 'Sensitive groups consider N95' };
  if (aqi <= 200)          return { needed: true,  type: 'Recommended',  note: 'N95 or KN95 mask' };
  if (aqi <= 300)          return { needed: true,  type: 'Required',     note: 'N95 mandatory outdoors' };
  return                          { needed: true,  type: 'N95 + goggles', note: 'Minimize all exposure' };
}

export const POLLUTANT_EFFECTS: Record<string, { label: string; icon: string; source: string; effect: string; color: string }> = {
  pm25: { label: 'PM2.5',      icon: '', source: 'Vehicles, industry, wildfires',          effect: 'Penetrates deep into lungs and bloodstream. Linked to heart disease, lung cancer, and stroke.', color: '#ff7e00' },
  pm10: { label: 'PM10',       icon: '', source: 'Dust, construction, road traffic',        effect: 'Irritates airways and throat. Triggers asthma and bronchitis.', color: '#ffaa00' },
  no2:  { label: 'NO₂',        icon: '', source: 'Vehicle exhaust, power plants',           effect: 'Inflames the lining of airways. Reduces lung function and worsens asthma.', color: '#ff4444' },
  o3:   { label: 'O₃ (Ozone)', icon: '', source: 'Formed from NO₂ + sunlight, vehicle emissions', effect: 'Chest pain and shortness of breath on exertion. Worsens in afternoon heat.', color: '#aa44ff' },
  co:   { label: 'CO',         icon: '', source: 'Incomplete combustion, wildfires, vehicles', effect: 'Reduces oxygen delivery to organs. Headache, dizziness at high levels.', color: '#884400' },
  so2:  { label: 'SO₂',        icon: '', source: 'Coal burning, volcanic activity, refineries', effect: 'Irritates respiratory tract. Causes acid rain and worsens heart disease.', color: '#ffcc00' },
};

export const SOURCE_TAGS: Record<string, { tag: string; icon: string }> = {
  pm25: { tag: 'Industrial / Traffic',  icon: '' },
  pm10: { tag: 'Dust / Construction',   icon: '' },
  no2:  { tag: 'Vehicle Exhaust',        icon: '' },
  o3:   { tag: 'Photochemical Smog',     icon: '' },
  co:   { tag: 'Wildfire / Combustion',  icon: '' },
  so2:  { tag: 'Coal / Industrial',      icon: '' },
};

export const ANOMALY_SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  elevated: { label: 'Elevated', color: '#ff7e00', bg: 'rgba(255,126,0,0.12)' },
  severe:   { label: 'Severe',   color: '#ff0000', bg: 'rgba(255,0,0,0.12)'   },
  extreme:  { label: 'Extreme',  color: '#7e0023', bg: 'rgba(126,0,35,0.2)'  },
};

export function getDosAndDonts(aqi: number | null | undefined): { do: string[]; dont: string[] } {
  if (!aqi) return { do: [], dont: [] };
  if (aqi <= 50)  return { do: ['Outdoor exercise', 'Ventilate home', 'Outdoor sports'], dont: [] };
  if (aqi <= 100) return { do: ['Light outdoor activity', 'Morning walks'], dont: ['Heavy exertion if sensitive'] };
  if (aqi <= 150) return { do: ['Indoor exercise', 'Use air purifiers'], dont: ['Outdoor sports', 'Opening windows'] };
  if (aqi <= 200) return { do: ['Wear N95 mask', 'Stay indoors'], dont: ['Running/Cycling', 'Deep breathing outside'] };
  if (aqi <= 300) return { do: ['Seal windows', 'Recirculate air'], dont: ['All outdoor activity', 'Leaving home without N95'] };
  return               { do: ['Emergency precautions', 'Stay in sealed room'], dont: ['ANY outdoor exposure', 'Vigorous activity'] };
}
