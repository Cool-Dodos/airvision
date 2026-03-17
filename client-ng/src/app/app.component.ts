import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, HostListener
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { AqiService } from './services/aqi.service';
import { GlobeComponent } from './components/globe/globe.component';
import { InfoPanelComponent } from './components/info-panel/info-panel.component';
import { AnomalyFeedComponent } from './components/anomaly-feed/anomaly-feed.component';
import { ShareCardComponent } from './components/share-card/share-card.component';
import { HistorySliderComponent } from './components/history-slider/history-slider.component';
import { aqiInfo } from './utils/aqi';
import { ShareData } from './models/share-data.model';

const REFRESH = 120000; // 2 mins

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, GlobeComponent, InfoPanelComponent, AnomalyFeedComponent, ShareCardComponent, HistorySliderComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('starCanvas', { static: true }) starRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tickerInner', { static: false }) tickerRef!: ElementRef<HTMLDivElement>;

  aqiData: Record<string, any> = {};
  selectedCode: string | null = null;
  selectedState: { name: string; aqi: number | null; col: string; cat: string; safe: string } | null = null;
  focusCountry: string | null = null;
  lastUpdated: Date | null = null;
  loading = true;
  error: string | null = null;
  viewMode: 'aqi' | 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co' = 'aqi';
  shareData: any = null;
  snapshots: any[] = [];
  isHistorical = false;
  indiaMode = false;

  readonly legend = [
    { col: '#1e3050', label: 'No Data'             },
    { col: '#00b894', label: 'Good ≤50'            },
    { col: '#fdcb6e', label: 'Moderate 51–100'     },
    { col: '#e17055', label: 'Sensitive 101–150'   },
    { col: '#d63031', label: 'Unhealthy 151–200'   },
    { col: '#6c5ce7', label: 'Very Unhealthy 201–300' },
    { col: '#a8071a', label: 'Hazardous >300'      },
  ];

  private intervalId: any;

  constructor(private aqi: AqiService) {}

  ngOnInit(): void {
    this.loadWorld();
    this.loadSnapshots();
    this.intervalId = setInterval(() => {
      if (!this.isHistorical) this.loadWorld();
      this.loadSnapshots();
    }, REFRESH);
  }

  ngAfterViewInit(): void {
    this.drawStarfield();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(e: KeyboardEvent) { this.onClose(); }

  ngOnDestroy(): void { clearInterval(this.intervalId); }

  loadWorld(): void {
    if (this.isHistorical) return; // Do not load live data if in historical mode

    this.aqi.getWorld().subscribe({
      next: (json) => {
        if (json.error) { this.error = json.error; this.loading = false; return; }
        this.aqiData = json.countries || {};
        this.lastUpdated = new Date(json.fetchedAt);
        this.loading = false; this.error = null;
        setTimeout(() => this.updateTicker(), 100);
      },
      error: (e) => { this.error = e.message; this.loading = false; }
    });
  }

  get globalVals(): number[] {
    return Object.values(this.aqiData).map((d: any) => d.avgAqi).filter(Boolean);
  }
  get globalAvg(): string {
    const v = this.globalVals;
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—';
  }
  get globalInfo() { return aqiInfo(parseFloat(this.globalAvg)); }

  onCountryClick(code: string): void { 
    this.selectedState = null;
    this.selectedCode = code;
  }

  onClose() {
    this.selectedCode = null;
    this.selectedState = null;
    this.focusCountry = null;
    this.shareData = null;
  }

  onStateShare() {
    if (!this.selectedState) return;
    const shareData: ShareData = {
      name:        this.selectedState.name,
      city:        'India State',
      aqi:         this.selectedState.aqi,
      cat:         this.selectedState.cat,
      col:         this.selectedState.col,
      safe:        this.selectedState.safe,
      dominentpol: 'pm25',
      iaqi:        { pm25: this.selectedState.aqi },
    };
    this.shareData = shareData;
    console.log('State shared:', this.shareData);
  }

  setShareData(data: any) {
    console.log('Setting share data:', data);
    this.shareData = data;
  }

  onStateClick(state: any): void {
    console.log('State clicked:', state);
    this.selectedCode = null;
    this.selectedState = state;
  }

  onAnomalyZoom(code: string): void {
    this.selectedCode = code;
    this.selectedState = null;
    this.focusCountry = code;
  }

  private drawStarfield(): void {
    const c = this.starRef.nativeElement;
    c.width  = window.innerWidth;
    c.height = window.innerHeight;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#020510'; ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 900; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${180 + Math.random()*40},${195 + Math.random()*30},255,${0.15 + Math.random()*0.6})`;
      ctx.fill();
    }
  }

  private updateTicker(): void {
    const el = this.tickerRef?.nativeElement;
    if (!el || !Object.keys(this.aqiData).length) return;
    const sorted = Object.entries(this.aqiData)
      .filter(([, d]: any) => d.avgAqi != null)
      .sort(([, a]: any, [, b]: any) => (b.avgAqi || 0) - (a.avgAqi || 0));
    const items = sorted.map(([code, d]: any) => {
      const info = aqiInfo(d.avgAqi);
      return `<span style="color:${info.col}">${d.name || code}&nbsp;${d.avgAqi}</span>`;
    }).join('&ensp;·&ensp;');
    el.innerHTML = items + '&ensp;·&ensp;' + items;
  }

  private loadSnapshots(): void {
    this.aqi.getSnapshots().subscribe(data => {
      this.snapshots = data;
    });
  }

  onTimeSelect(ts: string | null): void {
    if (!ts) {
      this.isHistorical = false;
      this.loadWorld();
      return;
    }

    this.isHistorical = true;
    this.loading = true;
    this.aqi.getSnapshot(ts).subscribe({
      next: (snap: any) => {
        this.aqiData = snap.countries || {};
        this.lastUpdated = new Date(snap.fetchedAt);
        this.loading = false;
        setTimeout(() => this.updateTicker(), 100);
      },
      error: () => {
        this.error = 'Failed to load historical snapshot';
        this.loading = false;
      }
    });
  }
}
