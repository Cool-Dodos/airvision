import { Injectable, Inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { environment }        from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AqiService {

  // Base URL sourced from Angular environment config.
  // In production: '/api' (Vercel proxy rewrites to Render backend)
  // In development: 'http://localhost:5000/api'
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Latest AQI snapshot for all countries */
  getWorldData(): Observable<any> {
    return this.http.get(`${this.base}/aqi/world`);
  }

  /** Country detail + trend + 30-day baseline */
  getCountryDetail(code: string): Observable<any> {
    return this.http.get(`${this.base}/aqi/country/${code.toUpperCase()}`);
  }

  /** Last 48 readings (12h) for sparkline */
  getHistory(code: string): Observable<any> {
    return this.http.get(`${this.base}/aqi/history/${code.toUpperCase()}`);
  }

  /** India state-level AQI */
  getIndiaStates(): Observable<any> {
    return this.http.get(`${this.base}/aqi/india/states`);
  }

  /** Anomaly list (countries 80%+ above 30-day baseline) */
  getAnomalies(): Observable<any> {
    return this.http.get(`${this.base}/aqi/anomalies`);
  }

  /** All snapshot timestamps (capped at last 96 = 24h) */
  getSnapshots(): Observable<any> {
    return this.http.get(`${this.base}/aqi/snapshots`);
  }

  /** Single historical snapshot by ISO timestamp */
  getSnapshot(timestamp: string): Observable<any> {
    return this.http.get(`${this.base}/aqi/snapshot/${encodeURIComponent(timestamp)}`);
  }

  /** Country boundary GeoJSON (proxied through backend) */
  getBoundary(iso2: string): Observable<any> {
    return this.http.get(`${this.base}/aqi/boundaries/${iso2.toUpperCase()}`);
  }

  /** Weather for globe atmosphere layer */
  getWeather(lat: number, lon: number): Observable<any> {
    return this.http.get(`${this.base}/weather?lat=${lat}&lon=${lon}`);
  }
}
