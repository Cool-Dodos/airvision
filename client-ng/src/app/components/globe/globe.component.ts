import {
  Component, OnDestroy, OnChanges, SimpleChanges,
  ElementRef, ViewChild, Input, Output, EventEmitter,
  ChangeDetectionStrategy, NgZone, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { aqiInfo, NUMERIC_TO_CODE } from '../../utils/aqi';
import { safeOutdoorTime, SOURCE_TAGS } from '../../utils/health';

const WORLD_50M        = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
const INDIA_ID         = 356;
const LABEL_SCALE      = 1.6;
const INDIA_ENTER_MULT = 2.8;
const INDIA_EXIT_MULT  = 2.0;
const INDIA_CENTROID: [number, number] = [82.8, 21.7];
const HALF_PI = Math.PI / 2;
const OCEAN_COLOR   = '#050e22';
const NO_DATA_COLOR = '#1e3050';
const NO_DATA_STROKE= '#2a4060';
const GRAT_COLOR    = '#071828';
const SPHERE_STROKE = '#0a1e3a';

function codeFromId(id: number | string): string | undefined {
  if (id === undefined || id === null) return undefined;
  const n = Number(id);
  if (isNaN(n)) return undefined;
  return NUMERIC_TO_CODE[String(n)];
}

const STATE_ABBR: Record<string, string> = {
  'Dadra and Nagar Haveli and Daman and Diu': 'DNHDD',
  'Andaman and Nicobar': 'A&N Isl.',
  'Jammu and Kashmir': 'J&K',
  'Himachal Pradesh': 'HP',
  'Arunachal Pradesh': 'Arunachal',
  'Uttaranchal': 'Uttarakhand',
  'Madhya Pradesh': 'MP',
  'Andhra Pradesh': 'AP',
  'Uttar Pradesh': 'UP',
  'Maharashtra': 'MH',
  'Karnataka': 'KA',
  'Tamil Nadu': 'TN',
  'West Bengal': 'WB',
  'Chhattisgarh': 'CG',
  'Rajasthan': 'RJ',
  'Gujarat': 'GJ',
  'Telangana': 'TS',
  'Jharkhand': 'JH',
  'Haryana': 'HR',
  'Punjab': 'PB',
  'Odisha': 'OD',
  'Orissa': 'OD',
  'Uttarakhand': 'UK',
};

const boundaryCache: Record<string, any> = {};
let indiaStatesGeoJSONCached: any[] | null = null;
let indiaStateAqiCached: Record<string, any> | null = null;

async function fetchBoundary(iso2: string): Promise<any | null> {
  if (boundaryCache[iso2]) return boundaryCache[iso2];
  try {
    const meta = await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${iso2}/ADM0/`).then(r => r.json());
    const gj   = await fetch(meta.gjDownloadURL).then(r => r.json());
    const feat = gj.type === 'FeatureCollection' ? gj.features[0] : gj;
    boundaryCache[iso2] = feat;
    return feat;
  } catch { return null; }
}

async function loadIndiaStatesGeo(): Promise<any[]> {
  if (indiaStatesGeoJSONCached) return indiaStatesGeoJSONCached;
  try {
    const gj = await fetch('/assets/india-states-simplified.json').then(r => r.json());
    indiaStatesGeoJSONCached = gj.type === 'FeatureCollection' ? gj.features : [gj];
    return indiaStatesGeoJSONCached!;
  } catch { return []; }
}

async function loadIndiaStateAqi(): Promise<Record<string, any>> {
  if (indiaStateAqiCached) return indiaStateAqiCached;
  try {
    const json = await fetch('https://airvision-xcg9.onrender.com/api/aqi/india/states').then(r => r.json());
    if (json.ok) indiaStateAqiCached = json.states;
    return indiaStateAqiCached || {};
  } catch { return {}; }
}

@Component({
  selector: 'app-globe',
  standalone: true,
  imports: [CommonModule],
  template: `
<canvas #canvasEl style="position:fixed;top:0;left:0;width:100%;height:calc(100% - 38px);z-index:1;cursor:crosshair"></canvas>

<div *ngIf="tooltip" class="tooltip"
  [style.left.px]="tooltip.x+14" [style.top.px]="tooltip.y-12"
  [style.border-left]="'2px solid '+tooltip.col">
  <div class="tt-name">{{tooltip.name}}</div>
  <div class="tt-aqi-row">
    <span class="tt-aqi" [style.color]="tooltip.col">{{tooltip.aqi!==null ? tooltip.aqi : '—'}}</span>
    <span class="tt-cat" [style.color]="tooltip.col">{{tooltip.cat}}</span>
  </div>
  <div *ngIf="tooltip.aqi!==null" class="tt-safe">Safe outdoors: <span>{{tooltip.safe}}</span></div>
  <div *ngIf="tooltip.src" class="tt-src">{{tooltip.src.icon}} {{tooltip.src.tag}}</div>
  <div *ngIf="tooltip.aqi===null" class="tt-nodata">No monitoring station data</div>
  <div class="tt-hint">Click for full details →</div>
</div>
<div class="nodata-legend"><div class="nd-swatch"></div><span>No data</span></div>
<div *ngIf="loadingBoundary" class="boundary-badge">Loading boundary…</div>
<div *ngIf="indiaMode" class="india-badge">🇮🇳 India — State View <span class="india-hint">zoom out to exit</span></div>
  `,
  styles: [`
.tooltip{position:fixed;background:rgba(2,5,16,.95);border:1px solid #0d2a4a;border-radius:2px;padding:10px 14px;font-size:12px;pointer-events:none;z-index:30;font-family:'Courier New',monospace;min-width:170px}
.tt-name{color:#c8d8f0;font-weight:bold;margin-bottom:4px;letter-spacing:.06em}
.tt-aqi-row{display:flex;align-items:baseline;gap:6px;margin-bottom:4px}
.tt-aqi{font-size:22px;font-weight:bold;line-height:1}
.tt-cat{font-size:9px;letter-spacing:.15em}
.tt-safe{font-size:10px;color:#3a5a7a}
.tt-safe span{color:#5a7a9a}
.tt-src{font-size:10px;color:#3a5a7a;margin-top:3px}
.tt-nodata{font-size:9px;color:#2a4a6a;margin-top:4px;letter-spacing:.12em;font-style:italic}
.tt-hint{font-size:9px;color:#1a3a5a;margin-top:6px;letter-spacing:.1em}
.nodata-legend{position:fixed;bottom:210px;left:24px;z-index:20;display:flex;align-items:center;gap:9px;font-size:10px;letter-spacing:.12em;color:#5a7a9a;font-family:'Courier New',monospace}
.nd-swatch{width:28px;height:6px;border-radius:2px;background:#1e3050;border:1px solid #2a4060}
.boundary-badge{position:fixed;bottom:58px;left:50%;transform:translateX(-50%);font-size:9px;letter-spacing:.25em;color:#2a5a8a;font-family:'Courier New',monospace;z-index:25;text-transform:uppercase}
.india-badge{position:fixed;top:60px;right:20px;font-size:10px;letter-spacing:.1em;color:#7aa8d0;font-family:'Courier New',monospace;z-index:25;background:rgba(2,5,16,.88);padding:5px 12px;border:1px solid #1e3a58;border-radius:2px}
.india-hint{font-size:8px;color:#3a5a7a;margin-left:8px}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobeComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('canvasEl', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() aqiData: Record<string, any> = {};
  @Input() selectedCode: string | null = null;
  @Input() set focusCountry(code: string | null) {
    if (code && this.ready) this.zone.runOutsideAngular(() => this.zoomToCode(code));
  }
  @Output() countryClick = new EventEmitter<string>();
  @Output() stateClick   = new EventEmitter<{ name: string; aqi: number | null; col: string; cat: string; safe: string }>();

  tooltip: { x: number; y: number; name: string; aqi: number | null; col: string; cat: string; safe: string; src?: any } | null = null;
  loadingBoundary = false;
  indiaMode       = false;

  private ctx!: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private proj!: d3.GeoProjection;
  private path!: d3.GeoPath;
  private grat!: any;
  private sphere = { type: 'Sphere' } as any;

  private worldFeatures:  any[] = [];
  private indiaFeatures:  any[] = [];
  private stateAqi:       Record<string, any> = {};
  private highlightFeat:  any | null = null;
  private highlightCol  = '#2a5a8a';
  private hoveredId:      number | string | null = null;
  private hoveredState:   string | null = null;

  private BASE  = 0;
  private scale = 0;
  private autoRot = true;
  private ready   = false;
  private rafId   = 0;
  private stop?:  () => void;
  private dirty   = true;

  private lastMouseX = 0;
  private lastMouseY = 0;
  private mouseRafPending = false;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void { this.zone.runOutsideAngular(() => this.build()); }
  ngOnChanges(c: SimpleChanges): void { if (c['aqiData'] && this.ready) this.dirty = true; }
  ngOnDestroy(): void { this.stop?.(); cancelAnimationFrame(this.rafId); }

  private build(): void {
    const canvas = this.canvasRef.nativeElement;
    this.W = window.innerWidth;
    this.H = window.innerHeight - 38;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = this.W * dpr;
    canvas.height = this.H * dpr;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);

    this.BASE  = Math.min(this.W, this.H) * 0.42;
    this.scale = this.BASE;

    this.proj = d3.geoOrthographic()
      .scale(this.scale).translate([this.W / 2, this.H / 2])
      .clipAngle(90).rotate([20, -25]);
    this.path = d3.geoPath().projection(this.proj).context(this.ctx);
    this.grat = d3.geoGraticule()();

    loadIndiaStatesGeo();
    loadIndiaStateAqi();

    Promise.all([
      d3.json(WORLD_50M),
      fetch('assets/india-official.json').then(r => r.json()),
    ]).then(([world, india]: [any, any]) => {
      let features = (topojson.feature(world, world.objects.countries) as any).features;
      features = features.map((f: any) =>
        String(f.id) === String(INDIA_ID) ? { ...f, geometry: india.geometry } : f
      );
      this.worldFeatures = features;
      this.ready = true;
      this.dirty = true;

      const loop = () => {
        if (this.autoRot) {
          const [λ, φ] = this.proj.rotate();
          this.proj.rotate([λ + 0.10, φ]);
          this.dirty = true;
        }
        if (this.dirty) { this.draw(); this.dirty = false; }
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
      this.stop  = () => cancelAnimationFrame(this.rafId);
    });

    // Click
    canvas.addEventListener('click', (e: MouseEvent) => {
      const geo = this.proj.invert!([e.offsetX, e.offsetY]);
      if (!geo) return;
      if (this.indiaMode && this.indiaFeatures.length) {
        const state = this.indiaFeatures.find(f => d3.geoContains(f, geo));
        if (state) {
          const name = state.properties?.shapeName || state.properties?.name || '';
          const data = this.stateAqi[name];
          const info = aqiInfo(data?.aqi);
          const safe = safeOutdoorTime(data?.aqi ?? undefined);
          this.zone.run(() => {
            this.stateClick.emit({ name, aqi: data?.aqi ?? null, col: info.col, cat: info.cat, safe: safe.healthy });
          });
          return;
        }
      }
      const feat = this.worldFeatures.find(f => d3.geoContains(f, geo));
      if (!feat) {
        this.zone.run(() => {
          this.selectedCode = null;
          this.highlightFeat = null;
          if (!this.indiaMode) this.exitIndiaMode();
          this.countryClick.emit('');
          this.dirty = true;
        });
        return;
      }
      const code = codeFromId(feat.id);
      if (!code) return;
      this.rotateToFeature(feat);
      this.loadHighlightBoundary(code, feat);
      if (code === 'IN') { this.zone.run(() => this.triggerIndiaMode()); }
      else               { this.zone.run(() => this.exitIndiaMode()); }
      this.zone.run(() => this.countryClick.emit(code));
    });

    // Hover
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      this.lastMouseX = e.clientX; this.lastMouseY = e.clientY;
      if (!this.mouseRafPending) {
        this.mouseRafPending = true;
        requestAnimationFrame(() => { this.mouseRafPending = false; this.handleHover(this.lastMouseX, this.lastMouseY); });
      }
    });
    canvas.addEventListener('mouseleave', () => {
      this.hoveredId = null; this.hoveredState = null;
      this.zone.run(() => { this.tooltip = null; }); this.dirty = true;
    });

    // Drag
    let dragOrigin: { x: number; y: number; rot: [number,number,number] } | null = null;
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      this.autoRot = false;
      dragOrigin = { x: e.clientX, y: e.clientY, rot: [...this.proj.rotate()] as [number,number,number] };
    });
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin) return;
      this.proj.rotate([
        dragOrigin.rot[0] + (e.clientX - dragOrigin.x) * 0.28,
        Math.max(-90, Math.min(90, dragOrigin.rot[1] - (e.clientY - dragOrigin.y) * 0.28)),
      ]);
      this.dirty = true;
    };
    const onUp = () => {
      if (!dragOrigin) return;
      dragOrigin = null;
      this.checkIndiaZoom();
      setTimeout(() => { this.autoRot = true; }, 3000);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);

    // Scroll
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.scale = Math.max(this.BASE * 0.5, Math.min(this.BASE * 5, this.scale - e.deltaY * 1.2));
      this.proj.scale(this.scale);
      this.checkIndiaZoom();
      this.dirty = true;
    }, { passive: false });
  }

  private draw(): void {
    if (!this.ctx) return;
    const ctx  = this.ctx;
    const path = this.path;
    ctx.clearRect(0, 0, this.W, this.H);

    // Sphere
    ctx.beginPath(); path(this.sphere);
    ctx.fillStyle = OCEAN_COLOR; ctx.fill();
    ctx.strokeStyle = SPHERE_STROKE; ctx.lineWidth = 1.5; ctx.stroke();

    // Graticule
    ctx.beginPath(); path(this.grat);
    ctx.strokeStyle = GRAT_COLOR; ctx.lineWidth = 0.4; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;

    // Countries
    const showLabels = this.scale >= this.BASE * LABEL_SCALE;
    for (const feat of this.worldFeatures) {
      if (this.indiaMode && String(feat.id) === String(INDIA_ID)) continue;
      const code    = codeFromId(feat.id);
      const hasData = !!(code && this.aqiData[code]?.avgAqi != null);
      const fill    = hasData ? aqiInfo(this.aqiData[code!].avgAqi).col : NO_DATA_COLOR;
      const isHov   = this.hoveredId === feat.id;
      ctx.beginPath(); path(feat);
      ctx.fillStyle   = fill;
      ctx.globalAlpha = hasData ? (isHov ? 1.0 : 0.82) : 0.85;
      ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = isHov ? 'rgba(255,255,255,0.25)' : (hasData ? '#020510' : NO_DATA_STROKE);
      ctx.lineWidth   = isHov ? 1.2 : (hasData ? 0.4 : 0.5);
      ctx.stroke();
    }

    // India states
    if (this.indiaMode && this.indiaFeatures.length) {
      for (const feat of this.indiaFeatures) {
        const name  = feat.properties?.shapeName || feat.properties?.name || '';
        const data  = this.stateAqi[name];
        const fill  = data ? aqiInfo(data.aqi).col : NO_DATA_COLOR;
        const isHov = this.hoveredState === name;
        ctx.beginPath(); path(feat);
        ctx.fillStyle = fill; ctx.globalAlpha = isHov ? 1.0 : 0.95; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = isHov ? 'rgba(255,255,255,0.3)' : '#020510';
        ctx.lineWidth   = isHov ? 1.2 : 0.5; ctx.stroke();
      }
      // State labels
      if (this.scale >= this.BASE * INDIA_ENTER_MULT * 0.9) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const feat of this.indiaFeatures) {
          const name = feat.properties?.shapeName || feat.properties?.name || '';
          const centroid = d3.geoCentroid(feat) as [number, number];
          const angle = d3.geoDistance(centroid, [-this.proj.rotate()[0], -this.proj.rotate()[1]]);
          if (angle >= HALF_PI) continue;
          const p = this.proj(centroid); if (!p) continue;
          // Approximate area from projected bounds
          const b = (this.path as any).bounds(feat);
          const area = Math.abs((b[1][0]-b[0][0])*(b[1][1]-b[0][1]));
          if (area < 120) continue;
          const label = area < 1000 ? (STATE_ABBR[name] || name) : name;
          const fs = Math.max(7, Math.min(13, Math.sqrt(area) * 0.06));
          ctx.font = `bold ${fs}px 'Courier New', monospace`;
          ctx.shadowColor = '#020510'; ctx.shadowBlur = 4;
          ctx.fillStyle = this.stateAqi[name] ? '#ffffff' : '#8ab0c8';
          ctx.fillText(label, p[0], p[1]);
          ctx.shadowBlur = 0;
        }
      }
    }

    // Country labels
    if (showLabels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "10px 'Courier New', monospace";
      for (const feat of this.worldFeatures) {
        if (this.indiaMode && String(feat.id) === String(INDIA_ID)) continue;
        const code = codeFromId(feat.id);
        if (!code || !this.aqiData[code]) continue;
        const centroid = d3.geoCentroid(feat) as [number, number];
        const angle = d3.geoDistance(centroid, [-this.proj.rotate()[0], -this.proj.rotate()[1]]);
        if (angle >= HALF_PI) continue;
        const p = this.proj(centroid); if (!p) continue;
        ctx.shadowColor = '#020510'; ctx.shadowBlur = 6;
        ctx.fillStyle   = '#c8d8f0';
        ctx.fillText(this.aqiData[code].name || code, p[0], p[1]);
        ctx.shadowBlur  = 0;
      }
    }

    // Highlight glow
    if (this.highlightFeat) {
      ctx.beginPath(); path(this.highlightFeat);
      ctx.strokeStyle = this.highlightCol; ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.85; ctx.shadowColor = this.highlightCol; ctx.shadowBlur = 10;
      ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
  }

  private handleHover(clientX: number, clientY: number): void {
    const canvas = this.canvasRef.nativeElement;
    const rect   = canvas.getBoundingClientRect();
    const geo    = this.proj.invert!([clientX - rect.left, clientY - rect.top]);
    if (!geo) {
      if (this.hoveredId !== null || this.hoveredState !== null) {
        this.hoveredId = null; this.hoveredState = null;
        this.zone.run(() => { this.tooltip = null; }); this.dirty = true;
      }
      return;
    }
    if (this.indiaMode && this.indiaFeatures.length) {
      const state = this.indiaFeatures.find(f => d3.geoContains(f, geo));
      if (state) {
        const name = state.properties?.shapeName || state.properties?.name || '';
        if (this.hoveredState !== name) {
          this.hoveredState = name; this.hoveredId = null;
          const data = this.stateAqi[name];
          const info = aqiInfo(data?.aqi);
          const safe = safeOutdoorTime(data?.aqi ?? undefined);
          this.zone.run(() => { this.tooltip = { x: clientX, y: clientY, name, aqi: data?.aqi ?? null, col: info.col, cat: info.cat, safe: safe.healthy }; });
          this.dirty = true;
        } else if (this.tooltip) {
          this.zone.run(() => { this.tooltip = { ...this.tooltip!, x: clientX, y: clientY }; });
        }
        return;
      }
    }
    const feat = this.worldFeatures.find(f => d3.geoContains(f, geo));
    if (!feat) {
      if (this.hoveredId !== null || this.hoveredState !== null) {
        this.hoveredId = null; this.hoveredState = null;
        this.zone.run(() => { this.tooltip = null; }); this.dirty = true;
      }
      return;
    }
    if (this.hoveredId !== feat.id) {
      this.hoveredId = feat.id; this.hoveredState = null;
      const code = codeFromId(feat.id);
      const data = code && this.aqiData[code];
      const aqi  = data?.avgAqi ?? null;
      const info = aqiInfo(aqi);
      const safe = safeOutdoorTime(aqi ?? undefined);
      const src  = data?.dominentpol && SOURCE_TAGS[data.dominentpol];
      this.zone.run(() => { this.tooltip = { x: clientX, y: clientY, name: data?.name || code || 'Unknown', aqi, col: info.col, cat: info.cat, safe: safe.healthy, src }; });
      this.dirty = true;
    } else if (this.tooltip) {
      this.zone.run(() => { this.tooltip = { ...this.tooltip!, x: clientX, y: clientY }; });
    }
  }

  private checkIndiaZoom(): void {
    if (!this.ready) return;
    const rot    = this.proj.rotate();
    const angle  = d3.geoDistance(INDIA_CENTROID, [-rot[0], -rot[1]]);
    const facing = angle < Math.PI * 0.12;
    if (!this.indiaMode && this.scale >= this.BASE * INDIA_ENTER_MULT && facing) {
      this.zone.run(() => this.triggerIndiaMode());
    } else if (this.indiaMode && (this.scale < this.BASE * INDIA_EXIT_MULT || !facing)) {
      this.zone.run(() => this.exitIndiaMode());
    }
  }

  private triggerIndiaMode(): void {
    if (this.indiaMode) return;
    this.indiaMode = true; this.dirty = true;
    this.loadAndDrawStates();
  }

  private exitIndiaMode(): void {
    if (!this.indiaMode) return;
    this.indiaMode = false; this.indiaFeatures = []; this.hoveredState = null; this.dirty = true;
  }

  private loadAndDrawStates(): void {
    this.zone.run(() => { this.loadingBoundary = true; });
    Promise.all([loadIndiaStatesGeo(), loadIndiaStateAqi()]).then(([features, stateAqi]) => {
      this.zone.run(() => { this.loadingBoundary = false; });
      if (!this.indiaMode) return;
      this.indiaFeatures = features; this.stateAqi = stateAqi; this.dirty = true;
    });
  }

  private loadHighlightBoundary(iso2: string, feat: any): void {
    this.highlightFeat = feat;
    this.highlightCol  = this.aqiData[iso2] ? aqiInfo(this.aqiData[iso2].avgAqi).col : '#2a5a8a';
    this.dirty = true;
    this.zone.run(() => { this.loadingBoundary = true; });
    fetchBoundary(iso2).then(f => {
      this.zone.run(() => { this.loadingBoundary = false; });
      if (!f) return;
      this.highlightFeat = f; this.dirty = true;
    });
  }

  private zoomToCode(code: string): void {
    const feat = this.worldFeatures.find(f => codeFromId(f.id) === code);
    if (!feat) return;
    this.scale = code === 'IN' ? this.BASE * INDIA_ENTER_MULT : this.BASE * 2.2;
    this.proj.scale(this.scale);
    this.rotateToFeature(feat);
    this.loadHighlightBoundary(code, feat);
    if (code === 'IN') this.zone.run(() => this.triggerIndiaMode());
    this.checkIndiaZoom();
    this.zone.run(() => this.countryClick.emit(code));
  }

  private rotateToFeature(feat: any): void {
    this.autoRot = false;
    const c = d3.geoCentroid(feat);
    const interp = d3.interpolate(this.proj.rotate(), [-c[0], -c[1]] as any);
    d3.transition().duration(900).ease(d3.easeCubicInOut)
      .tween('r', () => (t: number) => { this.proj.rotate(interp(t)); this.dirty = true; })
      .on('end', () => setTimeout(() => { this.autoRot = true; }, 8000));
  }
}
