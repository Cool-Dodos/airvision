import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { AqiService } from './services/aqi.service';
import { GlobeComponent } from './components/globe/globe.component';
import { InfoPanelComponent } from './components/info-panel/info-panel.component';
import { AnomalyFeedComponent } from './components/anomaly-feed/anomaly-feed.component';
import { aqiInfo } from './utils/aqi';

const REFRESH = 15 * 60 * 1000;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, GlobeComponent, InfoPanelComponent, AnomalyFeedComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('starCanvas', { static: true }) starRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('tickerInner', { static: false }) tickerRef!: ElementRef<HTMLDivElement>;

  aqiData: Record<string, any> = {};
  selectedCode: string | null = null;
  lastUpdated: Date | null = null;
  loading = true;
  error: string | null = null;

  readonly legend = [
    { col: '#00e400', label: 'Good ≤50' },
    { col: '#ffff00', label: 'Moderate 51–100' },
    { col: '#ff7e00', label: 'Sensitive 101–150' },
    { col: '#ff0000', label: 'Unhealthy 151–200' },
    { col: '#8f3f97', label: 'Very Unhealthy 201–300' },
    { col: '#7e0023', label: 'Hazardous >300' },
  ];

  private intervalId: any;

  constructor(private aqi: AqiService) {}

  ngOnInit(): void {
    this.loadWorld();
    this.intervalId = setInterval(() => this.loadWorld(), REFRESH);
  }

  ngAfterViewInit(): void {
    this.drawStarfield();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(e: KeyboardEvent) { this.onClose(); }

  ngOnDestroy(): void { clearInterval(this.intervalId); }

  loadWorld(): void {
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

  onCountryClick(code: string): void { this.selectedCode = code; }
  onClose(): void { this.selectedCode = null; }

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
}
