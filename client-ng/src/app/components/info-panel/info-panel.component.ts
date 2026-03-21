import { Component, Input, Output, EventEmitter, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
export class InfoPanelComponent implements OnChanges, OnDestroy {
  @Input() countryCode: string | null = null;
  @Output() closePanel = new EventEmitter<void>();
  @Output() share = new EventEmitter<any>();

  detail: CountryDetail | null = null;
  history: { ts: string; aqi: number }[] = [];
  loading = false;
  error = false;
  errorMessage = '';
  loadingTooLong = false;
  writtenSummary = '';

  private loadingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private aqiService: AqiService, private cd: ChangeDetectorRef) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['countryCode']) {
      this.loadData();
    }
  }

  setShareData(d: any) { if (d) this.share.emit(d); }

  private clearLoadingTimer(): void {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = null;
    }
  }

  loadData(): void {
    if (!this.countryCode) {
      this.detail = null;
      this.history = [];
      this.error = false;
      this.writtenSummary = '';
      return;
    }

    this.loading = true;
    this.error = false;
    this.errorMessage = '';
    this.loadingTooLong = false;
    this.detail = null;
    this.history = [];
    this.writtenSummary = '';
    this.cd.markForCheck();

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

      if (!detail || (detail as any).error) {
        this.error = true;
        this.errorMessage = this.friendlyError((detail as any)?.message);
        this.detail = null;
        this.cd.markForCheck();
        return;
      }

      this.detail = detail as CountryDetail;
      this.history = (history as any)?.history ?? [];
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
    const name = d.countryName || 'This country';
    const label = this.aqiLabel(d.avgAqi);
    const pol = d.dominentpol ? ` Main pollutant: ${d.dominentpol.toUpperCase()}.` : '';
    const trend = d.trend?.trend?.label ? ` Trend: ${d.trend.trend.label}.` : '';
    return `${name} — ${label} air quality (AQI ${d.avgAqi}).${pol}${trend}`;
  }

  aqiLabel(aqi: number): string {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  }

  aqiColor(aqi: number): string {
    if (aqi <= 50) return '#00b894';
    if (aqi <= 100) return '#fdcb6e';
    if (aqi <= 150) return '#e17055';
    if (aqi <= 200) return '#d63031';
    if (aqi <= 300) return '#6c5ce7';
    return '#a8071a';
  }

  get pollutants(): { key: string; val: number | null; col: string }[] {
    if (!this.detail?.iaqi) return [];
    const order = ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co'];
    return order
      .filter(k => this.detail!.iaqi![k] != null)
      .map(k => ({
        key: k.toUpperCase().replace('PM25', 'PM2.5').replace('PM10', 'PM10'),
        val: this.detail!.iaqi![k],
        col: this.aqiColor(this.detail!.iaqi![k] ?? 0)
      }));
  }

  get advisory() {
    const a = this.detail?.avgAqi ?? 0;
    if (a <= 50) return { adults: 'All day', sensitive: 'All day', children: 'All day', mask: 'Not needed', maskCol: '#00b894' };
    if (a <= 100) return { adults: 'All day', sensitive: 'Limit prolonged', children: 'Limit prolonged', mask: 'Optional', maskCol: '#fdcb6e' };
    if (a <= 150) return { adults: 'Limit prolonged', sensitive: 'Avoid outdoors', children: 'Avoid outdoors', mask: 'Recommended', maskCol: '#e17055' };
    if (a <= 200) return { adults: 'Avoid outdoors', sensitive: 'Stay indoors', children: 'Stay indoors', mask: 'Required', maskCol: '#d63031' };
    return { adults: 'Stay indoors', sensitive: 'Stay indoors', children: 'Stay indoors', mask: 'Critical', maskCol: '#a8071a' };
  }

  get whatToDo(): string[] {
    const a = this.detail?.avgAqi ?? 0;
    if (a <= 50) return ['Outdoor exercise', 'Open windows', 'Ventilate'];
    if (a <= 100) return ['Reduce intensity', 'Close windows', 'Purifier ON'];
    if (a <= 150) return ['Limit outdoor time', 'Wear mask', 'Purifier MAX'];
    if (a <= 200) return ['Avoid outdoors', 'Mask required', 'Purifier MAX'];
    return ['Stay indoors', 'Seal windows', 'Emergency mode'];
  }

  buildSparkline(history: { ts: string; aqi: number }[]): string {
    if (!history?.length || history.length < 2) return '';
    const vals = history.map(h => h.aqi);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals);
    const range = max - min || 1;
    return history.map((h, i) => {
      const x = (i / (history.length - 1)) * 240;
      const y = 44 - ((h.aqi - min) / range) * 36 - 4;
      return `${x},${y}`;
    }).join(' ');
  }

  buildArea(history: { ts: string; aqi: number }[]): string {
    if (!history?.length || history.length < 2) return '';
    const vals = history.map(h => h.aqi);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals);
    const range = max - min || 1;
    const pts = history.map((h, i) => {
      const x = (i / (history.length - 1)) * 240;
      const y = 44 - ((h.aqi - min) / range) * 36 - 4;
      return `${x},${y}`;
    });
    return `${pts.join(' ')} 240,48 0,48`;
  }

  ngOnDestroy(): void {
    this.clearLoadingTimer();
  }
}