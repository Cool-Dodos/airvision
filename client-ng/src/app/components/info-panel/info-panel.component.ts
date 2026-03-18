import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AqiService } from '../../services/aqi.service';
import { forkJoin, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

interface CountryDetail {
  avgAqi: number | null;
  dominentpol: string | null;
  countryName: string;
  city?: string;
  stationCount?: number;
  trend?: any;
  baseline30?: number | null;
  error?: boolean;
  iaqi?: Record<string, number | null>;
  [key: string]: any;
}

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './info-panel.component.html',
  styleUrls: ['./info-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoPanelComponent implements OnChanges {
  @Input() countryCode: string | null = null;
  @Output() share = new EventEmitter<any>();

  detail: CountryDetail | null = null;

  setShareData(d: any) { if (d) this.share.emit(d); }
  history: { ts: string; aqi: number }[] = [];
  loading = false;
  error = false;
  errorMessage = '';
  loadingTooLong = false;

  // Computed once per ngOnChanges — NOT a getter — avoids firing on every CD cycle
  writtenSummary = '';

  private loadingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private aqiService: AqiService, private cd: ChangeDetectorRef) {}

  // ngOnInit intentionally OMITTED — ngOnChanges fires first and covers initial load.
  // Having both caused a double-fetch race on every country click.

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['countryCode']) {
      this.loadData();
    }
  }

  private clearLoadingTimer(): void {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
  }

  loadData(): void {
    if (!this.countryCode) {
      this.detail  = null;
      this.history = [];
      this.error   = false;
      this.writtenSummary = '';
      return;
    }

    this.loading      = true;
    this.error        = false;
    this.errorMessage = '';
    this.loadingTooLong = false;
    this.detail       = null;
    this.history      = [];
    this.writtenSummary = '';
    this.cd.markForCheck();

    // Show "Waking up server..." hint after 3 s on Render cold start
    this.clearLoadingTimer();
    this.loadingTimer = setTimeout(() => {
      if (this.loading) {
        this.loadingTooLong = true;
        this.cd.markForCheck();
      }
    }, 3000);

    const detail$ = this.aqiService.getCountryDetail(this.countryCode).pipe(
      timeout(12000),
      catchError(err => of({ error: true, message: err?.message || 'Failed to load data' }))
    );

    const history$ = this.aqiService.getHistory(this.countryCode).pipe(
      timeout(12000),
      catchError(() => of({ history: [] }))
    );

    forkJoin({ detail: detail$, history: history$ }).subscribe(({ detail, history }) => {
      this.clearLoadingTimer();
      this.loading = false;

      // Error guard — if the API returned an error shape, stop here
      if (!detail || (detail as any).error) {
        this.error   = true;
        this.errorMessage = this.friendlyError((detail as any)?.message);
        this.detail  = null;
        this.cd.markForCheck();
        return;
      }

      this.detail  = detail as CountryDetail;
      this.history = (history as any)?.history ?? [];

      // Compute writtenSummary once here, not on every CD cycle
      this.writtenSummary = this.buildSummary(this.detail);

      this.cd.markForCheck();
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private friendlyError(raw?: string): string {
    if (!raw) return 'Could not load air quality data. Please try again.';
    if (raw.includes('timeout') || raw.includes('504'))
      return 'The server is taking a while to wake up. Please try again in a moment.';
    if (raw.includes('429'))
      return 'Too many requests. Please wait a few seconds and try again.';
    if (raw.includes('404'))
      return 'No data available for this country.';
    return 'Could not load data. Please try again.';
  }

  private buildSummary(d: CountryDetail): string {
    if (!d?.avgAqi) return '';
    const name  = d.countryName || 'This country';
    const label = this.aqiLabel(d.avgAqi);
    const pol   = d.dominentpol ? ` Main pollutant: ${d.dominentpol.toUpperCase()}.` : '';
    const trend = d.trend?.trend?.label ? ` Air quality is currently ${d.trend.trend.label.toLowerCase()}.` : '';
    const base  = d.baseline30
      ? ` The 30-day average is ${d.baseline30}.`
      : '';
    return `${name} has ${label} air quality (AQI ${d.avgAqi}).${pol}${trend}${base}`;
  }

  aqiLabel(aqi: number): string {
    if (aqi <= 50)  return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  }

  aqiColor(aqi: number): string {
    if (aqi <= 50)  return '#00e400';
    if (aqi <= 100) return '#ffff00';
    if (aqi <= 150) return '#ff7e00';
    if (aqi <= 200) return '#ff0000';
    if (aqi <= 300) return '#8f3f97';
    return '#7e0023';
  }

  get advisory() {
    const a = this.detail?.avgAqi ?? 0;
    if (a <= 50) return { 
      adults: 'All day', sensitive: 'All day', children: 'All day', 
      bestTime: 'Any time - air is clean', mask: 'Not needed', maskCol: '#00e400' 
    };
    if (a <= 100) return { 
      adults: 'All day', sensitive: 'Limit prolonged', children: 'Limit prolonged', 
      bestTime: 'Early morning', mask: 'Not needed', maskCol: '#00e400' 
    };
    if (a <= 150) return { 
      adults: 'Limit prolonged', sensitive: 'Avoid outdoors', children: 'Avoid outdoors', 
      bestTime: 'Late evening', mask: 'Recommended', maskCol: '#ffff00' 
    };
    if (a <= 200) return { 
      adults: 'Avoid outdoors', sensitive: 'Stay indoors', children: 'Stay indoors', 
      bestTime: 'Avoid outdoors', mask: 'Required', maskCol: '#ff7e00' 
    };
    return { 
      adults: 'Stay indoors', sensitive: 'Stay indoors', children: 'Stay indoors', 
      bestTime: 'Avoid outdoors', mask: 'Critical', maskCol: '#ff0000' 
    };
  }

  get forecast() {
    const a = this.detail?.avgAqi ?? 0;
    return [
      { h: '1h', val: Math.round(a * 0.85) },
      { h: '3h', val: Math.round(a * 0.62) },
      { h: '6h', val: Math.round(a * 0.27) }
    ];
  }

  get whatToDo() {
    const a = this.detail?.avgAqi ?? 0;
    if (a <= 50) return ['Outdoor exercise', 'Ventilate home', 'Open windows'];
    if (a <= 100) return ['Reduced intensity', 'Close windows', 'Air Purifier ON'];
    return ['Avoid outdoors', 'Mask required', 'Air Purifier MAX'];
  }

  buildSparkline(history: { ts: string; aqi: number }[]): string {
    if (!history || history.length < 2) return '';
    const max = Math.max(...history.map(h => h.aqi), 1);
    const min = Math.min(...history.map(h => h.aqi));
    const range = max - min || 1;
    
    return history.map((h, i) => {
      const x = (i / (history.length - 1)) * 200;
      const y = 50 - ((h.aqi - min) / range) * 40 - 5; // 5px padding
      return `${x},${y}`;
    }).join(' ');
  }

  ngOnDestroy(): void {
    this.clearLoadingTimer();
  }
}
