import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AqiService } from '../../services/aqi.service';
import { aqiInfo, POLLUTANT_LABELS } from '../../utils/aqi';
import { safeOutdoorTime, bestHourAdvice, maskAdvice, POLLUTANT_EFFECTS, SOURCE_TAGS } from '../../utils/health';

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './info-panel.component.html',
  styleUrls: ['./info-panel.component.css'],
})
export class InfoPanelComponent implements OnChanges {
  @Input() countryCode: string | null = null;
  @Output() closePanel = new EventEmitter<void>();

  detail: any = null;
  history: any[] = [];
  loading = false;

  readonly POLLUTANT_LABELS = POLLUTANT_LABELS;
  readonly POLLUTANT_EFFECTS = POLLUTANT_EFFECTS;
  readonly SOURCE_TAGS = SOURCE_TAGS;

  constructor(private aqiSvc: AqiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['countryCode'] && this.countryCode) {
      this.loading = true;
      this.detail = null;
      this.history = [];
      forkJoin([
        this.aqiSvc.getCountry(this.countryCode),
        this.aqiSvc.getHistory(this.countryCode),
      ]).subscribe({
        next: ([d, h]) => {
          this.detail = d;
          this.history = h.history || [];
          this.loading = false;
        },
        error: () => { this.loading = false; }
      });
    }
  }

  get aqiValue(): number | null { return this.detail?.avgAqi ?? this.detail?.aqi ?? null; }
  get info()  { return this.aqiValue != null ? aqiInfo(this.aqiValue) : null; }
  get dom()   { return this.detail?.dominentpol; }
  get polEff(){ return this.dom && this.POLLUTANT_EFFECTS[this.dom]; }
  get srcTag(){ return this.dom && this.SOURCE_TAGS[this.dom]; }
  get safeTime() { return safeOutdoorTime(this.aqiValue ?? undefined); }
  get bestHour() { return bestHourAdvice(this.aqiValue ?? undefined, this.dom); }
  get mask()     { return maskAdvice(this.aqiValue ?? undefined); }
  get trend()    { return this.detail?.trend; }
  get spark()    { return this.history.slice(-12); }
  get maxV()     { return Math.max(...this.spark.map((s: any) => s.aqi), 1); }
  get preds()    { return this.trend?.predictions?.slice(0, 8) ?? []; }
  readonly SW = 210;
  readonly SH = 38;

  sparkPoints(): string {
    return this.spark.map((s: any, i: number) =>
      `${(i / (this.spark.length - 1)) * (this.SW * 0.65)},${this.SH - (s.aqi / this.maxV) * (this.SH - 4) - 2}`
    ).join(' ');
  }

  forecastPoints(): string {
    return this.preds.map((v: number, i: number) => {
      const x = this.SW * 0.65 + (i / (this.preds.length - 1)) * (this.SW * 0.32);
      const y = this.SH - (v / this.maxV) * (this.SH - 4) - 2;
      return `${x},${y}`;
    }).join(' ');
  }

  pollutantEntries(): { key: string; label: string; val: any }[] {
    if (!this.detail?.iaqi) return [];
    return Object.entries(POLLUTANT_LABELS)
      .map(([key, label]) => ({ key, label, val: this.detail.iaqi?.[key] }))
      .filter(e => e.val !== null && e.val !== undefined);
  }

  formatVal(key: string, val: any): string {
    const num = typeof val === 'number' ? val.toFixed(1) : val;
    const unit = (key === 'pm25' || key === 'pm10') ? ' μg/m³' : ' ppb';
    const dot = this.dom === key ? ' ●' : '';
    return `${num}${unit}${dot}`;
  }

  aqiColor(v: number): string { return aqiInfo(v).col; }
}
