import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// If on Vercel/Production, point to the Render backend. 
// If on localhost, use empty string (proxy.conf.json handles it)
const IS_PROD = !window.location.hostname.includes('localhost');
const BASE = IS_PROD ? 'https://airvision-xcg9.onrender.com' : ''; 

@Injectable({ providedIn: 'root' })
export class AqiService {
  constructor(private http: HttpClient) {}

  getWorld(): Observable<any> {
    return this.http.get<any>(`${BASE}/api/aqi/world`);
  }

  getCountry(code: string): Observable<any> {
    return this.http.get<any>(`${BASE}/api/aqi/country/${code}`);
  }

  getHistory(code: string): Observable<any> {
    return this.http.get<any>(`${BASE}/api/aqi/history/${code}`);
  }

  getAnomalies(): Observable<any> {
    return this.http.get<any>(`${BASE}/api/aqi/anomalies`);
  }

  getWindGrid(): Observable<any> {
    return this.http.get<any>(`${BASE}/api/weather/wind`);
  }

  getSnapshots(): Observable<any[]> {
    return this.http.get<any[]>(`${BASE}/api/aqi/snapshots`);
  }

  getSnapshot(timestamp: string): Observable<any> {
    return this.http.get<any>(`${BASE}/api/aqi/snapshot/${timestamp}`);
  }
}