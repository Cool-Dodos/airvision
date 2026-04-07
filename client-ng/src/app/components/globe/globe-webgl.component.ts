import {
  Component, OnDestroy, OnChanges, SimpleChanges,
  ElementRef, ViewChild, Input, Output, EventEmitter,
  ChangeDetectionStrategy, NgZone, AfterViewInit, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { aqiInfo, NUMERIC_TO_CODE } from '../../utils/aqi';
import { safeOutdoorTime, SOURCE_TAGS } from '../../utils/health';
import { environment } from '../../../environments/environment';
import Globe from 'globe.gl';


// ─── Constants ────────────────────────────────────────────────────────────────
// Low-detail world topology (110m) for fast globe-scale rendering
const WORLD_URL_LO = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const NO_DATA_COLOR = '#1a3a5a'; // Distinct from the ocean background (#040c1e)
const STROKE_DEFAULT = 'rgba(2,5,16,0.8)';
const STROKE_ACTIVE = 'rgba(255,255,255,0.4)';
const SIDE_COLOR = 'rgba(8,18,36,0.6)';
const MAX_PIXEL_RATIO = 1.5; // Caps device pixel ratio at 1.5 to reduce GPU load on HiDPI displays
const ALT_DEFAULT = 0.005;
const ALT_HOVER = 0.04;
const ALT_SELECTED = 0.08;

// India viewport and cache configuration
const INDIA_BOUNDS = { latMin: 6, latMax: 38, lngMin: 67, lngMax: 98 };
const INDIA_ENTER_ALT = 1.3;
const INDIA_EXIT_ALT = 1.6;
const INDIA_AQI_TTL = 30 * 60 * 1000; // 30-minute state AQI cache TTL

// Legacy and alternate state name spellings mapped to their canonical values
const STATE_ALIASES: Record<string, string> = {
  'utranchal': 'uttarakhand', 'uttranchal': 'uttarakhand',
  'uttaranchal': 'uttarakhand', 'orissa': 'odisha',
  'orissam': 'odisha', 'orrisa': 'odisha',
  'puduchcheri': 'puducherry', 'pondicherry': 'puducherry',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeState(name: string): string {
  if (!name) return '';
  const n = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
  return STATE_ALIASES[n] ?? n;
}

function codeFromNumeric(id: string | number): string | undefined {
  if (id === undefined || id === null) return undefined;
  return NUMERIC_TO_CODE[String(Number(id))];
}



function flatCoords(geometry: any): number[][] {
  const out: number[][] = [];
  const dig = (a: any) => {
    if (!Array.isArray(a)) return;
    if (typeof a[0] === 'number') { out.push(a as number[]); return; }
    a.forEach(dig);
  };
  dig(geometry?.coordinates ?? []);
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-globe-webgl',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Star field — sits behind everything, z-index 0 -->
    <canvas #stars style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none"></canvas>

    <!-- Globe mount -->
    <div #mount
      style="position:fixed;top:0;left:0;width:100%;height:calc(100% - 38px);z-index:1;cursor:crosshair"
      role="img"
      aria-label="Interactive WebGL globe showing real-time air quality"
      tabindex="0">
    </div>

    <!-- Tooltip — CSS transform only, no layout-triggering style writes -->
    <div *ngIf="tooltip" class="gl-tooltip" [style.transform]="tooltipXform">
      <div class="gl-tt-bar"   [style.background]="tooltip.col"></div>
      <div class="gl-tt-name">{{ tooltip.name }}</div>
      <div class="gl-tt-aqi-row">
        <span class="gl-tt-aqi" [style.color]="tooltip.col">{{ tooltip.aqi ?? '—' }}</span>
        <span class="gl-tt-cat" [style.color]="tooltip.col">{{ tooltip.cat }}</span>
      </div>
      <div *ngIf="tooltip.aqi !== null" class="gl-tt-safe">
        Safe outdoors: <span>{{ tooltip.safe }}</span>
      </div>
      <div *ngIf="tooltip.src"      class="gl-tt-src">{{ tooltip.src }}</div>
      <div *ngIf="tooltip.aqi===null" class="gl-tt-nodata">No monitoring station data</div>
    </div>

    <!-- India state mode indicator -->
      <div *ngIf="indiaMode" class="gl-india-badge">
        India — State View
      </div>

    <!-- FPS overlay, hidden in production via [showFps]="false" -->
    <div *ngIf="showFps" class="gl-fps">{{ fps }} fps</div>
  `,
  styles: [`
    :host { display: block; }

    .gl-tooltip {
      position: fixed; left: 0; top: 0;
      background: rgba(2,5,16,.96);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 4px; padding: 12px 16px 12px 20px;
      font-size: 12px; pointer-events: none; z-index: 300;
      font-family: 'Courier New', monospace; min-width: 180px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      display: flex; flex-direction: column; gap: 4px;
      will-change: transform;
    }
    .gl-tt-bar {
      position: absolute; left: 0; top: 0; bottom: 0;
      width: 4px; border-radius: 4px 0 0 4px;
    }
    .gl-tt-name    { color:#c8d8f0; font-weight:bold; letter-spacing:.06em; font-size:13px; }
    .gl-tt-aqi-row { display:flex; align-items:baseline; gap:6px; margin-bottom:4px; }
    .gl-tt-aqi     { font-size:22px; font-weight:bold; line-height:1; }
    .gl-tt-cat     { font-size:9px; letter-spacing:.15em; }
    .gl-tt-safe    { font-size:10px; color:#3a5a7a; }
    .gl-tt-safe span { color:#5a7a9a; }
    .gl-tt-src     { font-size:10px; color:#3a5a7a; margin-top:3px; }
    .gl-tt-nodata  { font-size:9px; color:#2a4a6a; letter-spacing:.12em; font-style:italic; }

    .gl-india-badge {
      position: fixed; top: 125px; right: 24px;
      font-size: 10px; letter-spacing:.12em; color:#00e400;
      font-family: 'Courier New', monospace; z-index: 300;
      background: rgba(2,5,16,.94); padding: 6px 14px;
      border: 1px solid #1e3a58; border-radius: 2px;
      box-shadow: 0 4px 20px rgba(0,0,0,.6);
    }


    .gl-fps {
      position: fixed; bottom: 60px; right: 24px;
      font-size: 11px; font-family: 'Courier New', monospace;
      color: #00e400; background: rgba(2,5,16,.8);
      padding: 4px 10px; border: 1px solid #1e3a58;
      border-radius: 2px; z-index: 400; letter-spacing:.1em;
    }
  `],
})
export class GlobeWebglComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mount', { static: false }) mountRef!: ElementRef<HTMLDivElement>;
  @ViewChild('stars', { static: false }) starsRef!: ElementRef<HTMLCanvasElement>;

  // ── Inputs ──────────────────────────────────────────────────────────────
  @Input() aqiData: Record<string, any> = {};
  @Input() selectedCode: string | null = null;
  @Input() viewMode: 'aqi' | 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co' = 'aqi';
  @Input() showFps = true;
  @Input() showIndiaStates: boolean = false;
  @Input() stations: any[] = [];

  @Input() set focusCountry(code: string | null) {
    if (code && this.globe) this.zoomToCode(code);
  }

  // ── Outputs ─────────────────────────────────────────────────────────────
  @Output() countryClick = new EventEmitter<string>();
  @Output() stateClick = new EventEmitter<{
    name: string; aqi: number | null; col: string; cat: string; safe: string; station?: string;
  }>();
  @Output() indiaModeChange = new EventEmitter<boolean>();

  // ── Template bindings ───────────────────────────────────────────────────
  tooltip: { name: string; aqi: number | null; col: string; cat: string; safe: string; src?: string } | null = null;
  tooltipXform = '';
  indiaMode = false;
  fps = 0;

  // ── Private ─────────────────────────────────────────────────────────────
  private globe: any = null;
  private worldFeatures: any[] = [];   // Active polygon feature set (swapped on India mode)
  private worldFeaturesLo: any[] = []; // 110m world topology — globe scale
  private worldFeaturesHi: any[] = []; // 50m world topology — zoomed in
  private currentLod: 'lo' | 'hi' = 'lo';
  private stateAqi: Record<string, any> = {};
  private indiaLoading = false;

  private colorCache = new Map<string, string>();
  private stateFeatureKeys = new Set<string>(); // Keys of Indian state polygons for fast membership check
  private indiaFeatures: any[] = [];

  private hoveredKey: string | null = null;
  private selectedKey: string | null = null;

  private polygonClicked = false;   // flag: did a polygon absorb this click frame?
  private globeReady = false;   // flag: worldFeatures loaded, safe to rebuild cache

  // India data cache
  private geoCache: any[] | null = null;
  private aqiCache: Record<string, any> | null = null;
  private aqiCachedAt = 0;

  // FPS meter
  private fpsFrames = 0;
  private fpsLast = 0;
  private fpsRafId = 0;
  private resumeTimer: any;

  constructor(private zone: NgZone, private cdr: ChangeDetectorRef) { }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    window.addEventListener('unhandledrejection', (e) =>
      console.error('[GlobeWebGL] Unhandled rejection:', e.reason));
    this.zone.runOutsideAngular(() =>
      this.boot().catch(err => console.error('[GlobeWebGL] boot() failed:', err)));
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.globeReady) return;

    if (ch['aqiData'] || ch['viewMode']) {
      this.rebuildColorCache();
      this.swapPolygons();
    }

    if (ch['selectedCode'] && this.selectedCode) {
      this.zoomToCode(this.selectedCode);
    }

    // Explicit button-driven state mode
    if (ch['showIndiaStates']) {
      if (this.showIndiaStates) {
        this.globe.pointOfView({ lat: 22, lng: 80, altitude: 0.8 }, 900);
        setTimeout(() => this.zone.run(() => this.enterIndia()), 950);
      } else {
        this.exitIndia();
      }
    }

    if (ch['stations'] && this.globeReady) {
      this.refreshStations();
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.fpsRafId);
    clearTimeout(this.resumeTimer);
    try { this.globe?.renderer()?.dispose(); } catch { }
    if (this.mountRef?.nativeElement) this.mountRef.nativeElement.innerHTML = '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────────────────

  private async boot(): Promise<void> {
    this.drawStars();
    await this.initGlobe();
    if (this.showFps) this.startFps();
  }

  private drawStars(): void {
    const cv = this.starsRef?.nativeElement;
    if (!cv) return;
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#020812'; ctx.fillRect(0, 0, cv.width, cv.height);

    // Three depth tiers
    const tiers = [
      { count: 600, minR: 0.3, maxR: 0.7, minA: 0.4, maxA: 0.85 },
      { count: 200, minR: 0.7, maxR: 1.2, minA: 0.6, maxA: 1.0 },
      { count: 40, minR: 1.2, maxR: 2.0, minA: 0.8, maxA: 1.0 },
    ];
    for (const tier of tiers) {
      for (let i = 0; i < tier.count; i++) {
        const x = Math.random() * cv.width, y = Math.random() * cv.height;
        const r = tier.minR + Math.random() * (tier.maxR - tier.minR);
        const a = tier.minA + Math.random() * (tier.maxA - tier.minA);
        const col = Math.random() < 0.15 ? `rgba(180,200,255,${a})`
          : Math.random() < 0.08 ? `rgba(255,220,180,${a})`
            : `rgba(255,255,255,${a})`;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Milky Way diagonal glow
    const mw = ctx.createLinearGradient(0, cv.height * .2, cv.width, cv.height * .8);
    mw.addColorStop(0, 'rgba(60,80,140,0)');
    mw.addColorStop(0.3, 'rgba(60,80,140,0.04)');
    mw.addColorStop(0.5, 'rgba(80,100,160,0.07)');
    mw.addColorStop(0.7, 'rgba(60,80,140,0.04)');
    mw.addColorStop(1, 'rgba(60,80,140,0)');
    ctx.fillStyle = mw; ctx.fillRect(0, 0, cv.width, cv.height);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Globe initialisation
  // ─────────────────────────────────────────────────────────────────────────

  private async initGlobe(): Promise<void> {
    const mount = this.mountRef.nativeElement;
    const W = window.innerWidth;
    const H = window.innerHeight - 38;

    console.log('[GlobeWebGL] Starting initialization...');
    // Reverted to factory pattern; 'new' constructor on factory function leads to broken instances
    this.globe = (Globe as any)({ rendererConfig: { antialias: true, alpha: true } })(mount);
    console.log('[GlobeWebGL] Instance created:', !!this.globe);

    this.globe
      .width(W).height(H)
      .backgroundColor('rgba(0,0,0,0)')  // transparent — stars canvas shows through
      .showAtmosphere(true)
      .atmosphereColor('#1a4080')
      .atmosphereAltitude(0.18)
      .showGraticules(false);            // no grid lines on ocean

    // DECISION 3: pixel ratio cap — single most impactful line for retina/mobile fps
    this.globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

    // OrbitControls setup
    const ctrl = this.globe.controls();
    ctrl.autoRotate = true;
    ctrl.autoRotateSpeed = 0.4;
    ctrl.enableDamping = false; // damping + autoRotate = jitter

    const domEl = this.globe.renderer().domElement;
    domEl.addEventListener('pointerdown', () => { ctrl.autoRotate = false; });
    domEl.addEventListener('pointerup', () => {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = setTimeout(() => { ctrl.autoRotate = true; }, 1500);
    });

    // Ocean click → deselect selected country / close side panel
    // globe.gl's onPolygonClick only fires ON a polygon — clicking ocean never triggers it.
    // Use canvas click + hoveredKey: if mouse is not over any polygon when clicking, deselect.
    domEl.addEventListener('click', () => {
      // Small timeout so onPolygonClick fires first if it's going to
      setTimeout(() => {
        if (!this.polygonClicked && this.selectedKey) {
          this.selectedKey = null;
          this.swapPolygons();
          this.zone.run(() => {
            this.countryClick.emit(''); // empty string signals app.component to close panel
            this.cdr.detectChanges();
          });
        }
        this.polygonClicked = false;
      }, 20);
    });

    const topo = await import('topojson-client').catch(() => null);
    if (!topo) return;
    const worldLo = await fetch(WORLD_URL_LO).then(r => r.json()).catch(() => null);
    if (!worldLo) return;
    this.worldFeaturesLo = (topo.feature(worldLo, (worldLo.objects as any).countries) as any).features;
    // Filter out features with no valid ID — Somaliland etc.
    this.worldFeaturesLo = this.worldFeaturesLo.filter((f: any) => {
      const id = f.id;
      return id !== undefined && id !== null && id !== '';
    });
    this.worldFeaturesHi = this.worldFeaturesLo;

    try {
      const india = await fetch('assets/india-official.json').then(r => r.json());
      const indiaGeometry = india.geometry ?? india.features?.[0]?.geometry;
      if (indiaGeometry) {
        const features = this.worldFeaturesLo;
        const orig = features.find((f: any) => codeFromNumeric(f.id) === 'IN');
        const inIdx = features.indexOf(orig);
        if (inIdx !== -1) features[inIdx] = { ...orig, id: orig.id, geometry: indiaGeometry };
        this.worldFeaturesHi = [...features];
        console.log('[India] Official boundary applied');
      }
    } catch(e) { console.warn('[India] border fix failed:', e); }

    const soIdx = this.worldFeaturesLo.findIndex((f: any) =>
      String(Number(f.id)) === '706'
    );
    if (soIdx !== -1) {
      const soFeat = this.worldFeaturesLo[soIdx];
      const coords = soFeat.geometry.coordinates[0] as number[][];
      // Keep every 2nd point
      let simplified = coords.filter((_: any, i: number) => i % 2 === 0);
      // GeoJSON ring rule: first and last coordinate must be identical
      const first = simplified[0];
      const last  = simplified[simplified.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        simplified = [...simplified, first]; // close the ring
      }
      this.worldFeaturesLo[soIdx] = {
        ...soFeat,
        id: soFeat.id,
        geometry: { type: 'Polygon', coordinates: [simplified] }
      };
      this.worldFeaturesHi = [...this.worldFeaturesLo];
      console.log('[Somalia] simplified:', coords.length, '→', simplified.length, 'verts');
    }

    console.log('[GlobeWebGL] features loaded:', this.worldFeaturesLo.length);

    // Start with lo-res at globe scale
    this.worldFeatures = this.worldFeaturesLo;
    this.currentLod = 'lo';

    // Mark ready
    this.globeReady = true;

    // Polygon layer — register ALL callbacks first
    this.globe
      .polygonsData(this.worldFeatures)
      .polygonCapColor((f: any) => {
        const k = this.fkey(f);
        const base = this.colorCache.get(k) ?? NO_DATA_COLOR;
        if (this.indiaMode) {
          if (this.stateFeatureKeys.has(k)) return base;
          return 'rgba(4, 8, 20, 0.92)';
        }
        return base;
      })
      .polygonSideColor((f: any) => {
        const k = this.fkey(f);
        if (this.indiaMode && !this.stateFeatureKeys.has(k)) return 'rgba(4, 8, 20, 0.6)';
        return SIDE_COLOR;
      })
      .polygonStrokeColor((f: any) => {
        const k = this.fkey(f);
        return (k === this.hoveredKey || k === this.selectedKey) ? STROKE_ACTIVE : STROKE_DEFAULT;
      })
      .polygonAltitude((f: any) => {
        const k    = this.fkey(f);
        const code = codeFromNumeric(f.id);
        if (k === this.selectedKey) return ALT_SELECTED;
        if (k === this.hoveredKey)  return ALT_HOVER;
        if (this.indiaMode && this.stateFeatureKeys.has(k)) return ALT_DEFAULT + 0.006;
        if (code === 'IN') return ALT_DEFAULT + 0.005;
        if (code === 'PK') return ALT_DEFAULT + 0.001;
        if (code === 'CN') return ALT_DEFAULT + 0.001;
        if (code === 'SO') return ALT_DEFAULT + 0.003;
        return ALT_DEFAULT;
      })
      .polygonLabel(() => '')
      .polygonsTransitionDuration(0)
      .onPolygonHover((f: any, _: any, e: MouseEvent) => this.onHover(f, e))
      .onPolygonClick((f: any, e: MouseEvent) => this.onClick(f, e));

    // Points layer (dots) — Heat-Fusion
    this.globe
      .pointsData(this.stations)
      .pointLat((d: any) => d.lat)
      .pointLng((d: any) => d.lon)
      .pointColor((d: any) => aqiInfo(d.aqi).col)
      .pointRadius(0.12)
      .pointsMerge(true) // Crucial for performance
      .pointAltitude(0.007);

    // Build initial color cache after all callbacks are registered
    this.rebuildColorCache();
    this.swapPolygons();

    this.globe.pointOfView({ lat: INDIA_BOUNDS.latMax, lng: INDIA_BOUNDS.lngMin, altitude: 2 });
    this.applyOceanMaterial();

    // Tooltip repositioning — no detectChanges, only transform update
    mount.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.tooltip) return;
      const flip = e.clientX > window.innerWidth - 250;
      this.tooltipXform = `translate(${flip ? e.clientX - 220 : e.clientX + 14}px,${e.clientY - 12}px)`;
    });

    window.addEventListener('resize', () =>
      this.globe.width(window.innerWidth).height(window.innerHeight - 38));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ocean material
  // ─────────────────────────────────────────────────────────────────────────

  private applyOceanMaterial(): void {
    const W = 2048, H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;

    // Deep ocean base — visible dark blue, clearly distinct from space
    ctx.fillStyle = '#0b1f4a';
    ctx.fillRect(0, 0, W, H);

    // Latitude depth bands
    const lat = ctx.createLinearGradient(0, 0, 0, H);
    lat.addColorStop(0, 'rgba(30,80,160,0.50)');
    lat.addColorStop(0.2, 'rgba(15,50,120,0.30)');
    lat.addColorStop(0.5, 'rgba(5,20,70,0.10)');
    lat.addColorStop(0.8, 'rgba(15,50,120,0.30)');
    lat.addColorStop(1, 'rgba(30,80,160,0.50)');
    ctx.fillStyle = lat; ctx.fillRect(0, 0, W, H);

    // Ocean current shimmer
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const rx = Math.random() * 120 + 30, ry = Math.random() * 40 + 10;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, rx);
      rg.addColorStop(0, `rgba(20,60,140,${Math.random() * .05 + .01})`);
      rg.addColorStop(1, 'rgba(5,15,50,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }

    // Polar ice caps
    const iN = ctx.createLinearGradient(0, 0, 0, H * .12);
    iN.addColorStop(0, 'rgba(210,235,255,0.55)'); iN.addColorStop(1, 'rgba(180,215,255,0)');
    ctx.fillStyle = iN; ctx.fillRect(0, 0, W, H * .12);
    const iS = ctx.createLinearGradient(0, H * .88, 0, H);
    iS.addColorStop(0, 'rgba(180,215,255,0)'); iS.addColorStop(1, 'rgba(220,240,255,0.65)');
    ctx.fillStyle = iS; ctx.fillRect(0, H * .88, W, H * .12);

    // Equatorial specular band
    const sun = ctx.createLinearGradient(W * .3, 0, W * .7, 0);
    sun.addColorStop(0, 'rgba(80,140,255,0)'); sun.addColorStop(.5, 'rgba(80,140,255,0.06)'); sun.addColorStop(1, 'rgba(80,140,255,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, H * .35, W, H * .30);

    const url = cv.toDataURL('image/jpeg', 0.95);
    this.globe.globeImageUrl(url);
    // Re-apply once more after 800ms to survive any late globe.gl internal overwrites
    setTimeout(() => this.globe.globeImageUrl(url), 800);
  }

  private refreshStations(): void {
    if (!this.globe) return;
    this.globe.pointsData(this.stations);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Color cache: rebuilt on data/mode change, O(1) lookup per render frame
  // ─────────────────────────────────────────────────────────────────────────

  private rebuildColorCache(): void {
    this.colorCache.clear();

    // Always build world cache
    for (const f of this.worldFeatures) {
      const code = codeFromNumeric(f.id);
      const data = code ? this.aqiData[code] : null;
      const val = data
        ? (this.viewMode === 'aqi' ? data.avgAqi : (data.iaqi?.[this.viewMode] ?? null))
        : null;
      this.colorCache.set(this.fkey(f), val != null ? aqiInfo(val).col : NO_DATA_COLOR);
    }

    // Additionally cache state features when in India mode
    if (this.indiaMode) {
      for (const f of this.indiaFeatures) {
        const raw = f.properties?.shapeName || f.properties?.name || '';
        const data = this.stateAqi[normalizeState(raw)] ?? this.stateAqi[raw];
        this.colorCache.set(this.fkey(f), data ? aqiInfo(data.aqi).col : NO_DATA_COLOR);
      }
    }
  }

  // Returns a stable string key for a GeoJSON feature (world or state)
  private fkey(f: any): string {
    return String(f?.id ?? f?.properties?.shapeName ?? f?.properties?.name ?? '');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hover
  // ─────────────────────────────────────────────────────────────────────────

  private onHover(feat: any, e?: MouseEvent): void {
    const key = feat ? this.fkey(feat) : null;

    if (!feat || key === null) {
      if (this.hoveredKey) {
        this.hoveredKey = null;
        this.tooltip = null;
        this.zone.run(() => this.cdr.detectChanges());
      }
      return;
    }

    if (key === this.hoveredKey) return; // same feature — skip CD entirely

    this.hoveredKey = key;
    this.pauseAutoRotate();

    if (this.indiaMode) {
      const raw = feat.properties?.shapeName || feat.properties?.name || '';
      const norm = normalizeState(raw);
      const data = this.stateAqi[norm] ?? this.stateAqi[raw];
      const info = aqiInfo(data?.aqi);
      if (e) this.tooltipXform = `translate(${e.clientX + 14}px,${e.clientY - 12}px)`;
      this.tooltip = {
        name: raw, aqi: data?.aqi ?? null,
        col: info.col, cat: info.cat,
        safe: safeOutdoorTime(data?.aqi ?? undefined).healthy,
        src: data?.city,
      };
    } else {
      const code = codeFromNumeric(feat.id);
      if (!code) {
        // Feature has no ISO code — clear tooltip without emitting
        if (this.hoveredKey) {
          this.hoveredKey = null;
          this.tooltip = null;
          this.zone.run(() => this.cdr.detectChanges());
        }
        return;
      }
      const data = this.aqiData[code] || null;
      const val = data
        ? (this.viewMode === 'aqi' ? data.avgAqi : (data.iaqi?.[this.viewMode] ?? null))
        : null;
      const info = aqiInfo(val);
      const tagInfo = data?.dominentpol ? SOURCE_TAGS[data.dominentpol] : undefined;
      if (e) this.tooltipXform = `translate(${e.clientX + 14}px,${e.clientY - 12}px)`;
      this.tooltip = {
        name: data?.name || code || 'Unknown', aqi: val,
        col: info.col, cat: info.cat,
        safe: safeOutdoorTime(val ?? undefined).healthy,
        src: tagInfo?.tag,
      };
    }

    this.zone.run(() => this.cdr.detectChanges());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Click
  // ─────────────────────────────────────────────────────────────────────────

  private onClick(feat: any, e: MouseEvent): void {
    this.polygonClicked = !!feat; // Prevents canvas background-click from also firing
    if (!feat) {
      if (this.selectedKey) {
        this.selectedKey = null;
        this.swapPolygons();
        this.zone.run(() => this.cdr.detectChanges());
      }
      return;
    }
    this.pauseAutoRotate();

    if (this.indiaMode) {
      const raw = feat.properties?.shapeName || feat.properties?.name || '';
      const norm = normalizeState(raw);
      const data = this.stateAqi[norm] ?? this.stateAqi[raw];
      const info = aqiInfo(data?.aqi);
      this.zone.run(() => this.stateClick.emit({
        name: raw, aqi: data?.aqi ?? null,
        col: info.col, cat: info.cat,
        safe: safeOutdoorTime(data?.aqi ?? undefined).healthy,
        station: data?.city,
      }));
      return;
    }

    const code = codeFromNumeric(feat.id);
    if (!code) return;

    this.selectedKey = this.fkey(feat);
    // Emit the country code; ngOnChanges will call zoomToCode and handle polygon swap
    this.zone.run(() => this.countryClick.emit(code));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Zoom → India mode
  // ─────────────────────────────────────────────────────────────────────────



  // ─────────────────────────────────────────────────────────────────────────
  // India state mode: replaces the country polygon with state-level polygons
  // ─────────────────────────────────────────────────────────────────────────

  private async enterIndia(): Promise<void> {
    if (this.indiaMode || this.indiaLoading) return;
    this.indiaLoading = true;

    try {
      const [features, rawAqi] = await Promise.all([this.loadGeo(), this.loadAqi()]);

      if (this.indiaMode) {
        this.indiaLoading = false;
        return;
      }

      const DISPUTED = [
        'jammu & kashmir (disputed)', // Topological artifact present in some GeoJSON sources
      ];
      this.indiaFeatures = features.filter((f: any) => {
        const name = (f.properties?.shapeName || f.properties?.name || '').toLowerCase();
        return !DISPUTED.some(d => name.includes(d));
      });

      // Normalize all state keys to enable diacritic-tolerant lookup
      this.stateAqi = {};
      for (const [k, v] of Object.entries(rawAqi)) {
        this.stateAqi[normalizeState(k)] = v;
      }

      // Track which polygon keys belong to Indian states
      this.stateFeatureKeys = new Set(this.indiaFeatures.map(f => this.fkey(f)));

      // Stop auto-rotation for state mode
      const ctrl = this.globe?.controls();
      if (ctrl) {
        ctrl.autoRotate = false;
        if ((this as any).resumeTimer) {
          clearTimeout((this as any).resumeTimer);
        }
      }

      this.indiaMode = true;
      this.indiaModeChange.emit(true);
      this.rebuildColorCache();
      this.swapPolygons();
      this.cdr.detectChanges();
    } finally {
      this.indiaLoading = false;
    }
  }

  private exitIndia(): void {
    if (!this.indiaMode || this.indiaLoading) return;
    this.indiaMode = false;
    this.hoveredKey = null;
    this.stateFeatureKeys.clear();

    // Resume auto-rotation on state mode exit
    const ctrl = this.globe?.controls();
    if (ctrl) {
      ctrl.autoRotate = true;
    }

    this.indiaModeChange.emit(false);
    this.rebuildColorCache();
    this.swapPolygons();
    this.cdr.detectChanges();
  }

  // Helper — re-uploads current feature set (forces globe.gl to re-read all callbacks)
  private swapPolygons(): void {
    if (!this.globe) return;
    if (this.indiaMode) {
      // Keep all countries except the main India country polygon.
      // Unlike previous version, we DO keep neighbors (PK, CN, etc.) to show a full map.
      const withoutIndia = this.worldFeatures.filter(f => codeFromNumeric(f.id) !== 'IN');
      this.globe.polygonsData([...withoutIndia, ...this.indiaFeatures]);
    } else {
      this.globe.polygonsData([...this.worldFeatures]);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Zoom to country
  // ─────────────────────────────────────────────────────────────────────────

  private zoomToCode(code: string): void {
    // Hardcoded POV for MultiPolygon countries whose centroid is wrong
    const HARDCODED: Record<string, { lat: number; lng: number; altitude: number }> = {
      US: { lat: 39.5, lng: -98.5, altitude: 1.8 },
      RU: { lat: 61.0, lng: 90.0, altitude: 1.5 },
      CN: { lat: 35.0, lng: 103.0, altitude: 1.4 },
      CA: { lat: 56.0, lng: -96.0, altitude: 1.6 },
      AU: { lat: -25.0, lng: 133.0, altitude: 1.5 },
      IN: { lat: 22.0, lng: 80.0, altitude: 1.1 },
    };

    if (HARDCODED[code]) {
      this.pauseAutoRotate();
      const feat = this.worldFeatures.find(f => codeFromNumeric(f.id) === code);
      if (feat) {
        this.selectedKey = this.fkey(feat);
        this.swapPolygons();
      }
      this.globe.pointOfView(HARDCODED[code], 900);
      return;
    }

    // Normal centroid calculation for all other countries
    const feat = this.worldFeatures.find(f => codeFromNumeric(f.id) === code);
    if (!feat) return;

    const coords = flatCoords(feat.geometry);
    if (!coords.length) return;

    const lats = coords.map((c: number[]) => c[1]);
    const lngs = coords.map((c: number[]) => c[0]);
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    this.pauseAutoRotate();
    this.selectedKey = this.fkey(feat);
    this.globe.pointOfView({ lat, lng, altitude: 1.5 }, 900);
    this.swapPolygons();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Data loaders
  // ─────────────────────────────────────────────────────────────────────────

  private async loadGeo(): Promise<any[]> {
    if (this.geoCache) return this.geoCache;
    try {
      const gj = await fetch('/assets/india-states-simplified.json').then(r => r.json());
      this.geoCache = gj.type === 'FeatureCollection' ? gj.features : [gj];
      return this.geoCache!;
    } catch (e) { return []; }
  }

  private async loadAqi(): Promise<Record<string, any>> {
    const now = Date.now();
    if (this.aqiCache && now - this.aqiCachedAt < INDIA_AQI_TTL) return this.aqiCache;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30_000);
      const json = await fetch(`${environment.apiUrl}/aqi/india/states`, { signal: ctrl.signal }).then(r => r.json());
      clearTimeout(t);
      if (json.states) { this.aqiCache = json.states; this.aqiCachedAt = now; }
      return this.aqiCache ?? {};
    } catch (e) { return this.aqiCache ?? {}; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-rotation helpers
  // ─────────────────────────────────────────────────────────────────────────

  private pauseAutoRotate(): void {
    const c = this.globe?.controls();
    if (!c) return;
    c.autoRotate = false;
    clearTimeout(this.resumeTimer);
    this.resumeTimer = setTimeout(() => {
      if (this.globe) this.globe.controls().autoRotate = true;
    }, 3000);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FPS meter (outside Angular zone — no CD pressure)
  // ─────────────────────────────────────────────────────────────────────────

  private startFps(): void {
    this.fpsLast = performance.now();
    const tick = () => {
      this.fpsFrames++;
      const now = performance.now();
      if (now - this.fpsLast >= 1000) {
        const measured = this.fpsFrames;
        this.fpsFrames = 0;
        this.fpsLast = now;
        this.zone.run(() => { this.fps = measured; this.cdr.detectChanges(); });
      }
      this.fpsRafId = requestAnimationFrame(tick);
    };
    this.fpsRafId = requestAnimationFrame(tick);
  }
}