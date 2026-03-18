import {
  Component, OnDestroy, OnChanges, SimpleChanges, HostListener,
  ElementRef, ViewChild, Input, Output, EventEmitter,
  ChangeDetectionStrategy, NgZone, AfterViewInit
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { AqiService } from '../../services/aqi.service';
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
const OCEAN_COLOR    = '#040c1e';
const NO_DATA_COLOR  = '#14253d';
const NO_DATA_STROKE = '#1e3250';
const GRAT_COLOR     = '#091520';
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
let indiaStateAqiCachedAt: number = 0;
const INDIA_STATE_TTL = 30 * 60 * 1000; // 30 min
let officialIndiaGeo: any | null = null;

async function fetchBoundary(iso2: string): Promise<any | null> {
  if (iso2 === 'IN' && officialIndiaGeo) return { type: 'Feature', id: '356', properties: { name: 'India' }, geometry: officialIndiaGeo };
  if (boundaryCache[iso2]) return boundaryCache[iso2];
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    // Use our backend proxy to avoid CORS issues
    const feat = await fetch(`/api/aqi/boundaries/${iso2}`, { signal: controller.signal }).then(r => r.json());
    clearTimeout(id);
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
  const now = Date.now();
  if (indiaStateAqiCached && (now - indiaStateAqiCachedAt) < INDIA_STATE_TTL) {
    return indiaStateAqiCached;
  }
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 12000);
    const json = await fetch('/api/aqi/india/states', { signal: controller.signal }).then(r => r.json());
    clearTimeout(id);
    if (json.ok) {
      indiaStateAqiCached = json.states;
      indiaStateAqiCachedAt = now;
    }
    return indiaStateAqiCached || {};
  } catch { return indiaStateAqiCached || {}; }
}

@Component({
  selector: 'app-globe',
  standalone: true,
  imports: [CommonModule],
  template: `
<canvas #canvasEl
  style="position:fixed;top:0;left:0;width:100%;height:calc(100% - 38px);z-index:1;cursor:crosshair"
  role="img"
  aria-label="Interactive world globe showing real-time air quality index by country"
  tabindex="0"
  (keydown)="onKeydown($event)"
></canvas>

<div *ngIf="tooltip" class="tooltip"
  [style.left.px]="tooltip.x > (windowWidth - 250) ? tooltip.x - 220 : tooltip.x + 14" 
  [style.top.px]="tooltip.y - 12">
  <div class="health-bar" [style.background]="tooltip.col"></div>
  <div class="tt-name">{{tooltip.name}}</div>
  <div class="tt-aqi-row">
    <span class="tt-aqi" [style.color]="tooltip.col">{{tooltip.aqi!==null ? tooltip.aqi : '—'}}</span>
    <span class="tt-cat" [style.color]="tooltip.col">{{tooltip.cat}}</span>
  </div>
  <div *ngIf="tooltip.aqi!==null" class="tt-safe">Safe outdoors: <span>{{tooltip.safe}}</span></div>
  <div *ngIf="tooltip.src" class="tt-src">{{tooltip.src.icon}} {{tooltip.src.tag}}</div>
  <div *ngIf="tooltip.aqi===null" class="tt-nodata">No monitoring station data</div>
</div>
<div *ngIf="loadingBoundary" class="boundary-badge">Loading boundary...</div>
<div *ngIf="indiaMode" class="india-badge">India — State View <span class="india-hint">zoom out to exit</span></div>
  `,
  styles: [`
.tooltip{position:fixed;background:rgba(2,5,16,.96);border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:12px 16px;font-size:12px;pointer-events:none;z-index:300;font-family:'Courier New',monospace;min-width:180px;box-shadow:0 8px 32px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:4px;backdrop-filter:blur(8px)}
.health-bar{position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px 0 0 4px}
.tt-name{color:#c8d8f0;font-weight:bold;margin-bottom:2px;letter-spacing:.06em;font-size:13px}
.tt-aqi-row{display:flex;align-items:baseline;gap:6px;margin-bottom:4px}
.tt-aqi{font-size:22px;font-weight:bold;line-height:1}
.tt-cat{font-size:9px;letter-spacing:.15em}
.tt-safe{font-size:10px;color:#3a5a7a}
.tt-safe span{color:#5a7a9a}
.tt-src{font-size:10px;color:#3a5a7a;margin-top:3px}
.tt-nodata{font-size:9px;color:#2a4a6a;margin-top:2px;letter-spacing:.12em;font-style:italic}
.boundary-badge{position:fixed;bottom:58px;left:50%;transform:translateX(-50%);font-size:9px;letter-spacing:.25em;color:#2a5a8a;font-family:'Courier New',monospace;z-index:25;text-transform:uppercase}
.india-badge{position:fixed;top:125px;right:24px;font-size:10px;letter-spacing:.12em;color:#00e400;font-family:'Courier New',monospace;z-index:300;background:rgba(2,5,16,.94);padding:6px 14px;border:1px solid #1e3a58;border-radius:2px;box-shadow:0 4px 20px rgba(0,0,0,.6)}
.india-hint{font-size:8px;color:#3a5a7a;margin-left:8px;text-transform:uppercase}
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
  @HostListener('window:resize')
  onResize() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.windowWidth = w;
    this.W = w; this.H = h;
    this.proj.translate([w / 2, h / 2]).scale(Math.min(w, h) / 2.1);
    this.scale = this.proj.scale();
    this.resizeStaticCanvas();
    this.dirty = true;
  }

  /** Keyboard navigation for accessibility (arrow keys rotate, +/- zoom) */
  onKeydown(event: KeyboardEvent): void {
    const ROTATE_STEP = 5;
    const ZOOM_STEP   = 30;
    const r = this.proj.rotate();
    switch (event.key) {
      case 'ArrowLeft':  this.proj.rotate([r[0] - ROTATE_STEP, r[1], r[2]]); this.dirty = true; break;
      case 'ArrowRight': this.proj.rotate([r[0] + ROTATE_STEP, r[1], r[2]]); this.dirty = true; break;
      case 'ArrowUp':    this.proj.rotate([r[0], Math.max(-90, r[1] - ROTATE_STEP), r[2]]); this.dirty = true; break;
      case 'ArrowDown':  this.proj.rotate([r[0], Math.min(90,  r[1] + ROTATE_STEP), r[2]]); this.dirty = true; break;
      case '+': case '=': { const s = this.proj.scale(); this.proj.scale(Math.min(800, s + ZOOM_STEP)); this.dirty = true; break; }
      case '-':           { const s = this.proj.scale(); this.proj.scale(Math.max(100, s - ZOOM_STEP)); this.dirty = true; break; }
    }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) event.preventDefault();
  }
  @Output() countryClick = new EventEmitter<string>();
  @Output() stateClick   = new EventEmitter<{ name: string; aqi: number | null; col: string; cat: string; safe: string }>();
  @Output() indiaModeChange = new EventEmitter<boolean>();

  tooltip: { x: number; y: number; name: string; aqi: number | null; col: string; cat: string; safe: string; src?: any } | null = null;
  loadingBoundary = false;
  indiaMode       = false;
  windowWidth     = window.innerWidth;

  @Input() viewMode: 'aqi' | 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co' = 'aqi';

  private ctx!: CanvasRenderingContext2D;
  private staticCanvas!: HTMLCanvasElement;
  private staticCtx!: CanvasRenderingContext2D;
  private W = 0; private H = 0;
  private proj!: d3.GeoProjection;
  private path!: d3.GeoPath;
  private grat!: any;
  private sphere = { type: 'Sphere' } as any;

  private worldFeatures:  any[] = [];
  private indiaFeatures:  any[] = [];
  private indiaGeometry:  any | null = null;
  private stateAqi:       Record<string, any> = {};
  private highlightFeat:  any | null = null;
  private highlightCol  = '#2a5a8a';
  private hoveredId:      number | string | null = null;
  private hoveredState:   string | null = null;

  private neighborFeatures: Map<string, any> = new Map();
  private onMouseMove?: (e: MouseEvent) => void;
  private onMouseUp?:   (e: MouseEvent) => void;

  private BASE  = 0;
  private scale = 0;
  private autoRot = true;
  private ready   = false;
  private rafId   = 0;
  private stop?:  () => void;
  private dirty   = true;
  private indiaStatesLoading = false; // Race condition lock for India mode

  readonly legNote = 'AQI values are representative of the average of multiple sensors across each region.';

  private lastMouseX = 0;
  private lastMouseY = 0;
  private mouseRafPending = false;

  constructor(private zone: NgZone, private aqiSvc: AqiService) {}

  ngAfterViewInit(): void { this.zone.runOutsideAngular(() => this.build()); }
  ngOnChanges(c: SimpleChanges): void {
    if ((c['aqiData'] || c['viewMode']) && this.ready) this.dirty = true;
  }
  ngOnDestroy(): void { 
    this.stop?.(); 
    cancelAnimationFrame(this.rafId); 
    if (this.onMouseMove) window.removeEventListener('mousemove', this.onMouseMove);
    if (this.onMouseUp)   window.removeEventListener('mouseup',   this.onMouseUp);
  }

  private build(): void {
    const canvas = this.canvasRef.nativeElement;
    this.W = window.innerWidth;
    this.H = window.innerHeight - 38;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = this.W * dpr;
    canvas.height = this.H * dpr;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
 
    // Patch 5.1.1: Offscreen canvas for static sphere
    this.staticCanvas = document.createElement('canvas');
    this.staticCtx = this.staticCanvas.getContext('2d')!;
    this.resizeStaticCanvas();

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
      this.indiaGeometry = india.geometry;
      officialIndiaGeo   = india.geometry;
      let features = (topojson.feature(world, world.objects.countries) as any).features;
      features = features.map((f: any) =>
        String(f.id) === String(INDIA_ID) ? { ...f, geometry: india.geometry } : f
      );
      this.worldFeatures = features;
      this.precomputeNeighborClips(features);
      this.ready = true;
      this.dirty = true;

      const loop = () => {
        if (this.autoRot) {
          const [λ, φ] = this.proj.rotate();
          this.proj.rotate([λ + 0.10, φ]);
          this.dirty = true;
        }
        if (this.dirty) {
          this.draw();
          this.dirty = false;
        }
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
          const rawName = state.properties?.shapeName || state.properties?.name || '';
          const normName = this.normalizeStateName(rawName);
          const data = this.stateAqi[normName] || this.stateAqi[rawName];
          const info = aqiInfo(data?.aqi);
          const safe = safeOutdoorTime(data?.aqi ?? undefined);
          this.zone.run(() => {
            this.stateClick.emit({ name: rawName, aqi: data?.aqi ?? null, col: info.col, cat: info.cat, safe: safe.healthy });
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
    this.onMouseMove = onMove;
    this.onMouseUp   = onUp;
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup',   this.onMouseUp);

    // Scroll
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.scale = Math.max(this.BASE * 0.5, Math.min(this.BASE * 5, this.scale - e.deltaY * 1.2));
      this.proj.scale(this.scale);
      this.checkIndiaZoom();
      this.dirty = true;
    }, { passive: false });

    // Touch — drag and pinch-to-zoom (patch 1.2)
    let lastTouchX = 0, lastTouchY = 0, lastPinchDist = 0;
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      this.autoRot = false;
      if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.hypot(dx, dy);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
        const r = this.proj.rotate();
        this.proj.rotate([
          r[0] + dx * 0.3,
          Math.max(-90, Math.min(90, r[1] - dy * 0.3)),
          r[2]
        ]);
        this.dirty = true;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist  = Math.hypot(dx, dy);
        const delta = dist - lastPinchDist;
        lastPinchDist = dist;
        const s = this.proj.scale();
        this.proj.scale(Math.max(100, Math.min(this.BASE * 5, s + delta * 0.5)));
        this.checkIndiaZoom();
        this.dirty = true;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.checkIndiaZoom();
      setTimeout(() => { this.autoRot = true; }, 3000);
    });
  }

  private resizeStaticCanvas(): void {
    if (!this.staticCanvas || !this.staticCtx) return;
    const dpr = window.devicePixelRatio || 1;
    this.staticCanvas.width = this.W * dpr;
    this.staticCanvas.height = this.H * dpr;
    this.staticCtx.scale(dpr, dpr);
    this.drawStatic();
  }

  private drawStatic(): void {
    if (!this.staticCtx) return;
    const ctx = this.staticCtx;
    ctx.clearRect(0, 0, this.W, this.H);
    // Draw the static ocean sphere background
    // Note: while graticule rotates, the sphere circle itself is static at a given scale/center
    ctx.beginPath();
    this.path.context(ctx)(this.sphere);
    ctx.fillStyle = OCEAN_COLOR;
    ctx.fill();
    ctx.strokeStyle = SPHERE_STROKE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    this.path.context(this.ctx); // Restore context
  }

  private draw(): void {
    if (!this.ctx) return;
    const ctx  = this.ctx;
    const path = this.path;
    ctx.clearRect(0, 0, this.W, this.H);

    // Collision detection for labels
    const renderedLabels: { x: number; y: number; w: number; h: number }[] = [];
    const checkOverlap = (x: number, y: number, w: number, h: number) => {
      for (const r of renderedLabels) {
        if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return true;
      }
      return false;
    };

    // Patch 5.1.1: Use offscreen canvas for sphere background
    if (this.staticCanvas) {
      ctx.drawImage(this.staticCanvas, 0, 0, this.W, this.H);
    } else {
      ctx.beginPath(); path(this.sphere);
      ctx.fillStyle = OCEAN_COLOR; ctx.fill();
      ctx.strokeStyle = SPHERE_STROKE; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // Graticule
    ctx.beginPath(); path(this.grat);
    ctx.strokeStyle = GRAT_COLOR; ctx.lineWidth = 0.4; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;

    // Countries
    const showLabels = this.scale >= this.BASE * LABEL_SCALE;
    for (const feat of this.worldFeatures) {
      if (String(feat.id) === String(INDIA_ID)) continue; // Always skip India in default loop
      
      const code    = codeFromId(feat.id);
      const data    = code ? this.aqiData[code] : null;
      let val       = null;
      if (data) {
        if (this.viewMode === 'aqi') val = data.avgAqi;
        else val = data.iaqi?.[this.viewMode] ?? null;
      }
      
      const hasData = val != null;
      const isHov   = this.hoveredId === feat.id;
      
      // Determine fill color with fallback for missing specific pollutants
      let fill = NO_DATA_COLOR;
      if (hasData) {
        fill = aqiInfo(val).col;
      } else if (data && data.avgAqi != null) {
        // Fallback: use main AQI color with reduced saturation/brightness for "Limited Data"
        const baseCol = aqiInfo(data.avgAqi).col;
        fill = baseCol + '44'; // Transparent version to show it's fallback
      }

      // Pre-processed neighbors avoid per-frame clipping overhead
      if (this.neighborFeatures.has(String(feat.id))) {
        ctx.save();
        ctx.beginPath(); path(feat); ctx.clip();
        ctx.beginPath(); path(this.sphere);
        path({ type: 'Feature', properties: {}, geometry: this.indiaGeometry });
        ctx.clip('evenodd'); 
        ctx.fillStyle = fill;
        ctx.globalAlpha = (data && data.avgAqi != null) ? (isHov ? 1.0 : 0.82) : 0.85;
        ctx.fill();
        ctx.restore();
        continue;
      }

      ctx.beginPath(); path(feat);
      ctx.fillStyle   = fill;
      ctx.globalAlpha = (data && data.avgAqi != null) ? (isHov ? 1.0 : 0.82) : 0.85;
      ctx.fill(); 
      ctx.globalAlpha = 1;
      // Borders drawn in unified pass below
    }

    // Specialized India Drawing (Official Boundary + Glow)
    const indiaFeat = this.worldFeatures.find(f => String(f.id) === String(INDIA_ID));
    // Draw country fill if not in state mode OR if states haven't loaded yet
    if (indiaFeat && (!this.indiaMode || !this.indiaFeatures.length)) {
      const data = this.aqiData['IN'];
      const val  = (this.viewMode === 'aqi') ? data?.avgAqi : (data?.iaqi?.[this.viewMode] ?? null);
      const info = aqiInfo(val);
      const isHov = this.hoveredId === indiaFeat.id;
      
      ctx.beginPath(); path(indiaFeat);
      ctx.fillStyle = val != null ? info.col : NO_DATA_COLOR;
      ctx.globalAlpha = isHov ? 1.0 : 0.95;
      ctx.fill();
      // Borders drawn in unified pass below
    }

    // India states
    if (this.indiaMode && this.indiaFeatures.length) {
      // Draw a subtle background for the whole of India under the states
      if (indiaFeat) {
        ctx.beginPath(); path(indiaFeat);
        ctx.fillStyle = NO_DATA_COLOR; ctx.fill();
      }
      for (const feat of this.indiaFeatures) {
        const name  = feat.properties?.shapeName || feat.properties?.name || '';
        const data  = this.stateAqi[name];
        const fill  = data ? aqiInfo(data.aqi).col : NO_DATA_COLOR;
        const isHov = this.hoveredState === name;
        ctx.beginPath(); path(feat);
        ctx.fillStyle = fill; ctx.globalAlpha = isHov ? 1.0 : 0.95; ctx.fill(); ctx.globalAlpha = 1;
        // Borders drawn in unified pass below
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
          
          const metrics = ctx.measureText(label);
          const lw = metrics.width + 4;
          const lh = fs + 4;
          if (checkOverlap(p[0]-lw/2, p[1]-lh/2, lw, lh)) continue;

          ctx.shadowColor = '#020510'; ctx.shadowBlur = 4;
          ctx.fillStyle = this.stateAqi[name] ? '#ffffff' : '#8ab0c8';
          ctx.fillText(label, p[0], p[1]);
          ctx.shadowBlur = 0;
          
          renderedLabels.push({ x: p[0]-lw/2, y: p[1]-lh/2, w: lw, h: lh });
        }
      }
    }


    // Country labels
    if (showLabels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "10px 'Courier New', monospace";
      
      // Sort features by importance (e.g., population/area or just fixed list)
      // For now, let's just prioritize countries with higher AQI or specific ones
      const sortedFeatures = [...this.worldFeatures].sort((a: any, b: any) => {
        const hovA = this.hoveredId === a.id ? 1 : 0;
        const hovB = this.hoveredId === b.id ? 1 : 0;
        return hovB - hovA;
      });

      for (const feat of sortedFeatures) {
        if (String(feat.id) === String(INDIA_ID)) continue; // Always skip India in default loop
        const code = codeFromId(feat.id);
        if (!code || !this.aqiData[code]) continue;
        
        const centroid = d3.geoCentroid(feat) as [number, number];
        const angle = d3.geoDistance(centroid, [-this.proj.rotate()[0], -this.proj.rotate()[1]]);
        if (angle >= HALF_PI) continue;
        
        const p = this.proj(centroid); if (!p) continue;
        
        const name = this.aqiData[code].name || code;
        const metrics = ctx.measureText(name);
        const lw = metrics.width + 10;
        const lh = 14;
        
        if (checkOverlap(p[0] - lw/2, p[1] - lh/2, lw, lh)) continue;
        
        ctx.shadowColor = '#020510'; ctx.shadowBlur = 6;
        ctx.fillStyle   = this.hoveredId === feat.id ? '#ffffff' : '#c8d8f0';
        ctx.fillText(name, p[0], p[1]);
        ctx.shadowBlur  = 0;
        
        renderedLabels.push({ x: p[0] - lw/2, y: p[1] - lh/2, w: lw, h: lh });
      }
    }

    // Highlight glow
    if (this.highlightFeat) {
      ctx.beginPath(); path(this.highlightFeat);
      ctx.strokeStyle = this.highlightCol; ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.85; ctx.shadowColor = this.highlightCol; ctx.shadowBlur = 10;
      ctx.stroke(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    this.drawAllBorders();
  }

  private precomputeNeighborClips(features: any[]): void {
    const neighbors = ['156', '586', '50', '524', '64', '104', '4'];
    for (const feat of features) {
      if (neighbors.includes(String(feat.id))) {
        this.neighborFeatures.set(String(feat.id), feat);
      }
    }
  }

  private drawAllBorders(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // World Countries
    for (const feat of this.worldFeatures) {
      ctx.beginPath(); this.path(feat);
      const isHov = this.hoveredId === feat.id;
      ctx.strokeStyle = isHov ? 'rgba(255,255,255,0.35)' : '#020510';
      ctx.lineWidth   = isHov ? 1.2 : 0.4;
      ctx.stroke();
    }

    // India States
    if (this.indiaMode && this.indiaFeatures.length) {
      for (const feat of this.indiaFeatures) {
        ctx.beginPath(); this.path(feat);
        const name = feat.properties?.shapeName || feat.properties?.name || '';
        const isHov = this.hoveredState === name;
        ctx.strokeStyle = isHov ? 'rgba(255,255,255,0.35)' : '#020510';
        ctx.lineWidth   = isHov ? 1.2 : 0.45;
        ctx.stroke();
      }
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
        const rawName  = state.properties?.shapeName || state.properties?.name || '';
        const normName = this.normalizeStateName(rawName);
        if (this.hoveredState !== rawName) {
          this.hoveredState = rawName; this.hoveredId = null;
          const data = this.stateAqi[normName] || this.stateAqi[rawName];
          const info = aqiInfo(data?.aqi);
          const safe = safeOutdoorTime(data?.aqi ?? undefined);
          this.zone.run(() => { this.tooltip = { x: clientX, y: clientY, name: rawName, aqi: data?.aqi ?? null, col: info.col, cat: info.cat, safe: safe.healthy }; });
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
      let val = null;
      if (data) {
        if (this.viewMode === 'aqi') val = data.avgAqi;
        else val = data.iaqi?.[this.viewMode] ?? null;
      }
      const info = aqiInfo(val);
      const safe = safeOutdoorTime(val ?? undefined);
      const src  = data?.dominentpol && SOURCE_TAGS[data.dominentpol];
      this.zone.run(() => { this.tooltip = { x: clientX, y: clientY, name: data?.name || code || 'Unknown', aqi: val, col: info.col, cat: info.cat, safe: safe.healthy, src }; });
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

  private async triggerIndiaMode(): Promise<void> {
    if (this.indiaMode || this.indiaStatesLoading) return;  // race-condition lock
    this.indiaStatesLoading = true;
    try {
      this.indiaMode = true; this.dirty = true;
      this.indiaModeChange.emit(true);
      this.zone.run(() => { this.loadingBoundary = true; });
      const [features, stateAqi] = await Promise.all([loadIndiaStatesGeo(), loadIndiaStateAqi()]);
      this.zone.run(() => { this.loadingBoundary = false; });
      if (!this.indiaMode) return;  // user exited while loading
      this.indiaFeatures = features;
      // Normalize the stateAqi keys so GeoJSON shapeName lookup always hits
      const normalized: Record<string, any> = {};
      for (const [k, v] of Object.entries(stateAqi)) {
        normalized[this.normalizeStateName(k)] = v;
      }
      this.stateAqi = normalized;
      this.dirty = true;
    } finally {
      this.indiaStatesLoading = false;
    }
  }

  private exitIndiaMode(): void {
    if (!this.indiaMode || this.indiaStatesLoading) return;  // block exit mid-fetch
    this.indiaMode = false; this.indiaFeatures = []; this.hoveredState = null; this.dirty = true;
    this.indiaModeChange.emit(false);
  }

  /** Normalize state names for consistent stateAqi lookups (handles mixed case, diacritics) */
  private normalizeStateName(name: string): string {
    if (!name) return '';
    return name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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
