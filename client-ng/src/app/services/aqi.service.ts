import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AqiService {
  constructor(private http: HttpClient) {}

  getWorld(): Observable<any> {
    return this.http.get<any>('/api/aqi/world');
  }

  getCountry(code: string): Observable<any> {
    return this.http.get<any>(`/api/aqi/country/${code}`);
  }

  getHistory(code: string): Observable<any> {
    return this.http.get<any>(`/api/aqi/history/${code}`);
  }

  getAnomalies(): Observable<any> {
    return this.http.get<any>('/api/aqi/anomalies');
  }
}
