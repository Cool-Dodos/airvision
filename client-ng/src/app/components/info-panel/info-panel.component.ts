import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, timeout } from 'rxjs';
import { AqiService } from '../../services/aqi.service';
import { aqiInfo, POLLUTANT_LABELS } from '../../utils/aqi';
import { safeOutdoorTime, bestHourAdvice, maskAdvice, POLLUTANT_EFFECTS, SOURCE_TAGS, getDosAndDonts } from '../../utils/health';
import { ShareData } from '../../models/share-data.model';

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
  @Output() share      = new EventEmitter<any>();

  detail: any = null;
  history: any[] = [];
  loading = true;
  error = false;

  readonly POLLUTANT_LABELS = POLLUTANT_LABELS;
  readonly POLLUTANT_EFFECTS = POLLUTANT_EFFECTS;
  readonly SOURCE_TAGS = SOURCE_TAGS;

  constructor(private aqiSvc: AqiService) {}

  ngOnInit(): void { if (this.countryCode) this.loadData(); }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['countryCode'];
    if (
      change &&
      change.currentValue &&
      change.currentValue !== change.previousValue
    ) {
      this.loadData();
    }
  }

  private loadData(): void {
    this.loading = true;
    this.error = false;
    this.detail = null;
    this.history = [];
    forkJoin([
      this.aqiSvc.getCountry(this.countryCode!),
      this.aqiSvc.getHistory(this.countryCode!),
    ]).pipe(timeout(12000)).subscribe({
      next: ([d, h]) => {
        console.log('InfoPanel loaded data for', this.countryCode, d);
        this.detail = d;
        this.history = h.history || [];
        this.loading = false;
      },
      error: (err) => { 
        console.error('InfoPanel failed for', this.countryCode, err);
        this.loading = false; this.error = true; 
      }
    });
  }

  get aqiValue(): number | null { return this.detail?.avgAqi ?? this.detail?.aqi ?? null; }
  get info()  { return this.aqiValue != null ? aqiInfo(this.aqiValue) : null; }
  get dom()   { return this.detail?.dominentpol; }
  get polEff(){ return this.dom && this.POLLUTANT_EFFECTS[this.dom]; }
  get srcTag(){ return this.dom && this.SOURCE_TAGS[this.dom]; }
  get safeTime() { return safeOutdoorTime(this.aqiValue ?? undefined); }
  get bestHour() { return bestHourAdvice(this.aqiValue ?? undefined, this.dom); }
  get mask()     { return maskAdvice(this.aqiValue ?? undefined); }
  get dosDonts() { return getDosAndDonts(this.aqiValue ?? undefined); }
  get trend()    { return this.detail?.trend; }
  get spark()    { return this.history.slice(-12); }
  get maxV()     { return Math.max(...this.spark.map((s: any) => s.aqi), 1); }
  get preds()    { return this.trend?.predictions?.slice(0, 8) ?? []; }

  get writtenSummary(): string {
    if (!this.detail || !this.info) return 'Data unavailable for summary.';
    
    const aqi = this.aqiValue || 0;
    const cat = this.info.cat.toLowerCase();
    const pol = this.POLLUTANT_LABELS[this.dom || ''] || 'particulates';
    const trendDisp = this.trend?.trend?.label || 'stable';
    const baseline = this.detail.baseline30;
    
    let text = `Air quality in ${this.detail.countryName || this.detail.name} is currently ${cat} (${aqi} AQI), primarily driven by ${pol}. `;
    
    if (trendDisp.includes('rising')) {
      text += `Pollution levels are on a rising trend. `;
    } else if (trendDisp.includes('falling')) {
      text += `Conditions are improving as levels fall. `;
    }

    if (baseline) {
      const diff = ((aqi - baseline) / baseline) * 100;
      if (diff > 20) text += `Today's readings are ${Math.abs(diff).toFixed(0)}% higher than the 30-day average. `;
      else if (diff < -20) text += `Air quality is significantly better than the monthly baseline. `;
    }

    if (this.preds.length > 0) {
      const nextArr = this.preds.slice(0, 3);
      const avgPred = nextArr.reduce((a: number, b: number) => a + b, 0) / nextArr.length;
      if (avgPred > aqi * 1.1) text += `Forecast indicates deteriorating conditions in the next few hours. `;
      else if (avgPred < aqi * 0.9) text += `Expect clearer skies ahead as indices are projected to drop. `;
    }

    text += `Health risk: ${this.safeTime.healthy.toLowerCase()} activities are safe for healthy adults. `;
    return text;
  }

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

  onShare(): void {
    if (!this.detail || !this.info) return;
    const shareData: ShareData = {
      name:        this.detail.countryName || this.detail.name || 'Unknown',
      city:        this.detail.city        ?? null,
      aqi:         this.aqiValue           ?? null,
      cat:         this.info.cat,
      col:         this.info.col,
      safe:        this.safeTime.healthy,
      dominentpol: this.dom                ?? null,
      iaqi:        this.detail.iaqi        ?? {},
    };
    console.log('onShare emitting', shareData);
    this.share.emit(shareData);
  }
}
