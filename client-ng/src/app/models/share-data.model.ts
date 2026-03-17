export interface ShareData {
  name: string;
  city: string | null;
  aqi: number | null;
  cat: string;
  col: string;
  safe: string;
  dominentpol: string | null;
  iaqi?: Record<string, number | null>;
}
