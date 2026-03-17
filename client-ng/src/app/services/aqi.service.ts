import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = 'http://localhost:5000';

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