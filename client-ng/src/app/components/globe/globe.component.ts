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
const LABEL_SCALE      = 1.6;       // show country labels when zoomed >= 1.6x
const INDIA_ENTER_MULT = 2.8;       // enter India state-mode at this zoom
const INDIA_EXIT_MULT  = 2.0;       // exit India state-mode below this zoom
const INDIA_CENTROID: [number, number] = [82.8, 21.7]; // geographic centroid [lon, lat]

const OCEAN_COLOR    = '#050e22';
const NO_DATA_COLOR  = '#1e3050';
const NO_DATA_STROKE = '#2a4060';
const NO_DATA_OPC    = 0.85;

// ── FIX: world-atlas stores feature IDs as plain integers (e.g. 76 for Brazil),
//   but NUMERIC_TO_CODE may use ISO 3-digit zero-padded keys ("076").
//   Try both to fix missing countries like Brazil, Australia, Argentina, etc.
function codeFromId(id: number | string): string | undefined {
  if (id === undefined || id === null) return undefined;
  const numericId = Number(id);
  if (isNaN(numericId)) return undefined;
  return NUMERIC_TO_CODE[String(numericId)];
}

// ── Abbreviated names so state labels fit inside small states/UTs
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
};

// ── Caches
const boundaryCache: Record<string, any> = {};
let indiaStatesGeoCached: any[] | null = null;

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
  if (indiaStatesGeoCached) return indiaStatesGeoCached;
  try {
    const meta = await fetch('https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/').then(r => r.json());
    const gj   = await fetch(meta.gjDownloadURL).then(r => r.json());
    indiaStatesGeoCached = gj.type === 'FeatureCollection' ? gj.features : [gj];
    return indiaStatesGeoCached!;
  } catch { return []; }
}

@Component({
  selector: 'app-globe',
  standalone: true,
  imports: [CommonModule],
  template: `
<svg #svgEl style="position:fixed;top:0;left:0;width:100%;height:calc(100% - 38px);z-index:1"></svg>

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

<div class="nodata-legend">
  <div class="nd-swatch"></div><span>No data</span>
</div>

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
  @ViewChild('svgEl', { static: false }) svgRef!: ElementRef<SVGSVGElement>;
  @Input()  aqiData: Record<string, any> = {};
  @Input()  selectedCode: string | null = null;
  @Output() countryClick = new EventEmitter<string>();

  tooltip: { x: number; y: number; name: string; aqi: number | null; col: string; cat: string; safe: string; src?: any } | null = null;
  loadingBoundary = false;
  indiaMode       = false;

  private gCountries:   any;
  private gLabels:      any;
  private gHighlight:   any;
  private gStates:      any;
  private gStateLabels: any;
  private proj!: d3.GeoProjection;
  private path!: d3.GeoPath;
  private redraw!: () => void;
  private BASE  = 0;
  private scale = 0;
  private autoRot = true;
  private ready   = false;
  private stop?:  () => void;
  private stateAqi: Record<string, any> = {};

  // RAF throttle — prevents Angular change detection on every mousemove pixel
  private lastMouseX = 0;
  private lastMouseY = 0;
  private mouseRafPending = false;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void { this.zone.runOutsideAngular(() => this.build()); }

  ngOnChanges(c: SimpleChanges): void {
    if (c['aqiData'] && this.ready) this.zone.runOutsideAngular(() => this.refresh());
  }

  ngOnDestroy(): void {
    this.stop?.();
    d3.select(this.svgRef?.nativeElement).selectAll('*').remove();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private hasData(id: number | string): boolean {
    const c = codeFromId(id);
    return !!(c && this.aqiData[c]?.avgAqi != null);
  }
  private fill(id: number | string): string {
    const c = codeFromId(id);
    if (!c || this.aqiData[c]?.avgAqi == null) return NO_DATA_COLOR;
    return aqiInfo(this.aqiData[c].avgAqi).col;
  }
  private opc(id: number | string): number  { return this.hasData(id) ? 0.75 : NO_DATA_OPC; }
  private strk(id: number | string): string { return this.hasData(id) ? '#020510' : NO_DATA_STROKE; }

  // ── Build globe ───────────────────────────────────────────────────────────
  private build(): void {
    const el = this.svgRef.nativeElement;
    const W  = el.clientWidth  || window.innerWidth;
    const H  = el.clientHeight || (window.innerHeight - 38);
    this.BASE  = Math.min(W, H) * 0.42;
    this.scale = this.BASE;

    const svg = d3.select(el);
    svg.selectAll('*').remove();

    // Glow filter
    const defs = svg.append('defs');
    const flt  = defs.append('filter').attr('id', 'glow');
    flt.append('feGaussianBlur').attr('stdDeviation', '2').attr('result', 'blur');
    const fm   = flt.append('feMerge');
    fm.append('feMergeNode').attr('in', 'blur');
    fm.append('feMergeNode').attr('in', 'SourceGraphic');

    this.proj = d3.geoOrthographic()
      .scale(this.scale).translate([W / 2, H / 2])
      .clipAngle(90).rotate([20, -25]);
    this.path = d3.geoPath().projection(this.proj);
    const proj = this.proj, path = this.path;

    const sphere = svg.append('path').datum({ type: 'Sphere' } as any)
      .attr('d', path as any)
      .style('fill', OCEAN_COLOR).style('stroke', '#0a1e3a').style('stroke-width', '1.5')
      .style('cursor', 'crosshair')
      .on('click', () => {
        // ── Fix 2: Ocean click deselects country
        this.zone.run(() => {
          this.selectedCode = null;
          this.gHighlight?.selectAll('*').remove();
          this.exitIndiaMode();
          this.countryClick.emit('');
        });
      });
    const grat = svg.append('path').datum(d3.geoGraticule()())
      .attr('d', path as any)
      .style('fill', 'none').style('stroke', '#071828')
      .style('stroke-width', '0.4').style('opacity', '0.5');

    let mesh: any;

    let lastRedraw = 0;
    this.redraw = () => {
      // ── Fix 4: Throttle redraw to ~30fps to save CPU/GPU
      const now = Date.now();
      if (now - lastRedraw < 32) return; 
      lastRedraw = now;

      sphere.attr('d', path as any);
      grat.attr('d', path as any);
      this.gCountries?.selectAll('path').attr('d', path as any);
      mesh?.attr('d', path as any);
      this.gHighlight?.selectAll('path').attr('d', path as any);
      this.gStates?.selectAll('path').attr('d', path as any);

      if (this.scale >= this.BASE * LABEL_SCALE && this.gLabels) {
        this.gLabels.selectAll('text').each(function(this: SVGTextElement, d: any) {
          const c = d3.geoCentroid(d), p = proj(c);
          if (!p) { d3.select(this).style('display', 'none'); return; }
          const ang = d3.geoDistance(c, [-proj.rotate()[0], -proj.rotate()[1]]);
          d3.select(this)
            .style('display', ang > Math.PI / 1.9 ? 'none' : 'block') // slightly tighter clip for labels
            .attr('x', p[0]).attr('y', p[1]);
        });
      }

      if (this.indiaMode && this.gStateLabels) {
        this.gStateLabels.selectAll('text').each(function(this: SVGTextElement, d: any) {
          const c = d3.geoCentroid(d), p = proj(c);
          if (!p) { d3.select(this).style('display', 'none'); return; }
          const ang = d3.geoDistance(c, [-proj.rotate()[0], -proj.rotate()[1]]);
          d3.select(this)
            .style('display', ang > Math.PI / 1.9 ? 'none' : 'block')
            .attr('x', p[0]).attr('y', p[1]);
        });
      }
    };

    Promise.all([
      d3.json(WORLD_50M),
      fetch('assets/india-official.json').then(r => r.json()),
    ]).then(([world, india]: [any, any]) => {
      let features = (topojson.feature(world, world.objects.countries) as any).features;

      // Override India geometry with SOI boundary (includes PoK + Aksai Chin)
      features = features.map((f: any) =>
        String(f.id) === String(INDIA_ID) ? { ...f, geometry: india.geometry } : f
      );

      // ── CRITICAL: render India LAST so its SOI polygon paints over
      //   Pakistan's PoK territory and China's Aksai Chin territory
      features.sort((a: any, b: any) => {
        if (String(a.id) === String(INDIA_ID)) return 1;
        if (String(b.id) === String(INDIA_ID)) return -1;
        return 0;
      });

      // Country fills
      this.gCountries = svg.append('g');
      this.gCountries.selectAll('.cp').data(features).join('path').attr('class', 'cp')
        .attr('d', path as any)
        .style('fill',         (d: any) => this.fill(d.id))
        .style('fill-opacity', (d: any) => this.opc(d.id))
        .style('stroke',       (d: any) => this.strk(d.id))
        .style('stroke-width', (d: any) => this.hasData(d.id) ? '0.4' : '0.5')
        .style('cursor', 'pointer')
        .on('mouseover', (event: MouseEvent, d: any) => {
          const code = codeFromId(d.id);
          const data = code && this.aqiData[code];
          const aqi  = data?.avgAqi ?? null;
          const info = aqiInfo(aqi);
          const safe = safeOutdoorTime(aqi ?? undefined);
          const src  = data?.dominentpol && SOURCE_TAGS[data.dominentpol];
          d3.select(event.currentTarget as Element)
            .style('fill-opacity', 1)
            .style('stroke', aqi !== null ? '#ffffff44' : '#3a5a7a')
            .style('stroke-width', '1.2');
          this.zone.run(() => {
            this.tooltip = {
              x: event.clientX, y: event.clientY,
              name: data?.name || code || 'Unknown',
              aqi, col: info.col, cat: info.cat, safe: safe.healthy, src,
            };
          });
        })
        .on('mousemove', (event: MouseEvent) => {
          // RAF throttle: defer zone.run until next animation frame
          this.lastMouseX = event.clientX;
          this.lastMouseY = event.clientY;
          if (!this.mouseRafPending) {
            this.mouseRafPending = true;
            requestAnimationFrame(() => {
              this.mouseRafPending = false;
              const x = this.lastMouseX, y = this.lastMouseY;
              this.zone.run(() => { if (this.tooltip) this.tooltip = { ...this.tooltip, x, y }; });
            });
          }
        })
        .on('mouseout', (event: MouseEvent, d: any) => {
          d3.select(event.currentTarget as Element)
            .style('fill-opacity', this.opc(d.id))
            .style('stroke',       this.strk(d.id))
            .style('stroke-width', this.hasData(d.id) ? '0.4' : '0.5');
          this.zone.run(() => { this.tooltip = null; });
        })
        .on('click', (_: MouseEvent, d: any) => {
          const code = codeFromId(d.id);
          if (!code) return;
          this.rotateToFeature(d);
          this.loadTier2(code, d);
          if (String(d.id) === String(INDIA_ID)) {
            this.zone.run(() => this.triggerIndiaMode());
          } else {
            this.zone.run(() => this.exitIndiaMode());
          }
          this.zone.run(() => this.countryClick.emit(code));
        });

      // Country name labels (shown when zoomed in)
      this.gLabels = svg.append('g').style('pointer-events', 'none');
      this.gLabels.selectAll('text').data(features).join('text')
        .style('font-family', "'Courier New', monospace")
        .style('font-size', '10px')
        .style('text-anchor', 'middle').style('dominant-baseline', 'central')
        .style('letter-spacing', '0.08em')
        .style('text-shadow', '0 0 4px #020510, 0 0 8px #020510')
        .style('display', 'none')
        .text((d: any) => { const c = codeFromId(d.id); return c && this.aqiData[c] ? this.aqiData[c].name || c : ''; })
        .style('fill', (d: any) => this.hasData(d.id) ? '#c8d8f0' : '#4a6a8a');

      this.gHighlight = svg.append('g').style('pointer-events', 'none');

      // ── Country border mesh — EXCLUDE India-adjacent edges to remove PoK/Aksai seam lines.
      //   India's own polygon stroke draws its outline, so nothing is lost visually.
      mesh = svg.append('path')
        .datum(topojson.mesh(world, world.objects.countries,
          (a: any, b: any) =>
            a !== b &&
            String(a.id) !== String(INDIA_ID) &&
            String(b.id) !== String(INDIA_ID)
        ) as any)
        .style('fill', 'none').style('stroke', '#020510').style('stroke-width', '0.3')
        .attr('d', path as any);

      this.ready = true;
      this.refresh();

      const timer = d3.timer(() => {
        if (this.autoRot) {
          const [λ, φ] = proj.rotate();
          proj.rotate([λ + 0.10, φ]);
          this.redraw();
        }
      });
      this.stop = () => timer.stop();
    });

    // Drag
    let origin: { x: number; y: number; rot: [number, number, number] } | null = null;
    svg.call(d3.drag<SVGSVGElement, unknown>()
      .on('start', (e: any) => {
        this.autoRot = false;
        origin = { x: e.x, y: e.y, rot: [...proj.rotate()] as [number, number, number] };
      })
      .on('drag', (e: any) => {
        if (!origin) return;
        proj.rotate([
          origin.rot[0] + (e.x - origin.x) * 0.28,
          Math.max(-90, Math.min(90, origin.rot[1] - (e.y - origin.y) * 0.28)),
        ]);
        this.redraw();
      })
      .on('end', () => {
        this.checkIndiaZoom();
        setTimeout(() => { this.autoRot = true; }, 3000);
      })
    );

    // Scroll zoom
    svg.on('wheel', (event: WheelEvent) => {
      event.preventDefault();
      this.scale = Math.max(this.BASE * 0.5, Math.min(this.BASE * 5, this.scale - event.deltaY * 1.2));
      proj.scale(this.scale);
      if (this.gLabels) {
        this.gLabels.selectAll('text').style('display', this.scale >= this.BASE * LABEL_SCALE ? 'block' : 'none');
      }
      this.checkIndiaZoom();
      this.redraw();
    }, { passive: false } as any);
  }

  // ── India mode: enter when zoomed + facing India, exit on zoom-out ─────────
  private checkIndiaZoom(): void {
    if (!this.ready) return;
    const angle  = d3.geoDistance(INDIA_CENTROID, [-this.proj.rotate()[0], -this.proj.rotate()[1]]);
    const facing = angle < Math.PI * 0.45;
    if (!this.indiaMode && this.scale >= this.BASE * INDIA_ENTER_MULT && facing) {
      this.zone.run(() => this.triggerIndiaMode());
    } else if (this.indiaMode && (this.scale < this.BASE * INDIA_EXIT_MULT || !facing)) {
      this.zone.run(() => this.exitIndiaMode());
    }
  }

  private triggerIndiaMode(): void {
    if (this.indiaMode) return;
    this.indiaMode = true;
    this.loadAndDrawStates();
  }

  private exitIndiaMode(): void {
    if (!this.indiaMode) return;
    this.indiaMode = false;
    this.gStates?.remove();      this.gStates      = null;
    this.gStateLabels?.remove(); this.gStateLabels  = null;
  }

  // ── India state layer ─────────────────────────────────────────────────────
  private loadAndDrawStates(): void {
    const svg = d3.select(this.svgRef.nativeElement);
    this.zone.run(() => { this.loadingBoundary = true; });
    
    // ── Final Fix: Load user-provided local boundary file (3MB)
    fetch('/assets/india-states-new.json').then(r => {
      if (!r.ok) throw new Error('Local asset not found');
      return r.json();
    }).then(gj => {
      this.zone.run(() => { this.loadingBoundary = false; });
      if (!this.indiaMode) return;
      const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
      this.drawStateLayer(svg, features);
      
      fetch('/api/aqi/india/states')
        .then(r => r.json())
        .then(json => {
          if (json.ok) { 
            this.stateAqi = json.states; 
            this.colorStateLayer(); 
          }
        });
    }).catch(err => {
      console.error('Error loading India states:', err);
      this.zone.run(() => { this.loadingBoundary = false; });
    });
  }

  private drawStateLayer(svg: any, features: any[]): void {
    this.gStates?.remove();
    this.gStateLabels?.remove();
    const path = this.path, proj = this.proj;

    // Insert state layer just below gHighlight so highlight ring stays on top
    const hlNode = this.gHighlight?.node();
    this.gStates = hlNode ? svg.insert('g', () => hlNode) : svg.append('g');
    this.gStates.attr('class', 'india-states');

    this.gStates.selectAll('.sp').data(features).join('path').attr('class', 'sp')
      .attr('d', path as any)
      .style('fill', NO_DATA_COLOR)
      .style('fill-opacity', 0.88)
      .style('stroke', '#020510')
      .style('stroke-width', '0.5')
      .style('cursor', 'pointer')
      .on('mouseover', (event: MouseEvent, d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || 'State') as string;
        const data = this.stateAqi[name] ?? null;
        const info = aqiInfo(data?.aqi);
        const safe = safeOutdoorTime(data?.aqi ?? undefined);
        d3.select(event.currentTarget as Element)
          .style('fill-opacity', 1)
          .style('stroke', '#ffffff55').style('stroke-width', '1.2');
        this.zone.run(() => {
          this.tooltip = { 
            x: event.clientX, y: event.clientY, 
            name, aqi: data?.aqi ?? null, 
            col: info.col, cat: info.cat, 
            safe: safe.healthy 
          };
        });
      })
      .on('mousemove', (event: MouseEvent) => {
        this.lastMouseX = event.clientX; this.lastMouseY = event.clientY;
        if (!this.mouseRafPending) {
          this.mouseRafPending = true;
          requestAnimationFrame(() => {
            this.mouseRafPending = false;
            const x = this.lastMouseX, y = this.lastMouseY;
            this.zone.run(() => { if (this.tooltip) this.tooltip = { ...this.tooltip, x, y }; });
          });
        }
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        const data = this.stateAqi[name] ?? null;
        d3.select(event.currentTarget as Element)
          .style('fill-opacity', 0.88)
          .style('fill', data != null ? aqiInfo(data.aqi).col : NO_DATA_COLOR)
          .style('stroke', '#020510').style('stroke-width', '0.5');
        this.zone.run(() => { this.tooltip = null; });
      });

    // State name labels — font size based on projected area so they fit
    this.gStateLabels = svg.append('g').style('pointer-events', 'none');
    this.gStateLabels.selectAll('text').data(features).join('text')
      .style('font-family', "'Courier New', monospace")
      .style('text-anchor', 'middle').style('dominant-baseline', 'central')
      .style('text-shadow', '0 0 3px #020510, 0 0 7px #020510')
      .style('fill', '#d0e4f8')
      .style('letter-spacing', '0.05em')
      .each(function(this: SVGTextElement, d: any) {
        const el   = d3.select(this);
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;

        // Projected bounding box to determine font size + whether label fits
        const bounds = path.bounds(d);
        const pw     = bounds ? Math.abs(bounds[1][0] - bounds[0][0]) : 0;
        const ph     = bounds ? Math.abs(bounds[1][1] - bounds[0][1]) : 0;
        const area   = pw * ph;
        const fs     = Math.max(6, Math.min(11, Math.sqrt(area) * 0.055));

        // Use abbreviated name for small states to avoid overflow
        const abbr  = STATE_ABBR[name] || name;
        const label = area < 1200 ? abbr.split(' ')[0] : abbr;

        const c   = d3.geoCentroid(d);
        const p   = proj(c);
        const ang = d3.geoDistance(c, [-proj.rotate()[0], -proj.rotate()[1]]);

        el.style('font-size', `${fs}px`)
          .text(area > 300 ? label : '')
          .attr('x', p ? p[0] : 0)
          .attr('y', p ? p[1] : 0)
          .style('display', (!p || ang > Math.PI / 2 || area < 300) ? 'none' : null as unknown as string);
      });
  }

  private colorStateLayer(): void {
    if (!this.gStates) return;
    const sa = this.stateAqi;
    this.gStates.selectAll('.sp')
      .style('fill', (d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        const data = sa[name] ?? null;
        return data != null ? aqiInfo(data.aqi).col : NO_DATA_COLOR;
      });
    // Also update label color
    this.gStateLabels?.selectAll('text')
      .style('fill', (d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        return sa[name] != null ? '#ffffff' : '#8ab0c8';
      });
  }

  // ── Smooth rotation to feature centroid ───────────────────────────────────
  private rotateToFeature(d: any): void {
    this.autoRot = false;
    const c = d3.geoCentroid(d);
    const i = d3.interpolate(this.proj.rotate(), [-c[0], -c[1]] as any);
    d3.transition().duration(900).ease(d3.easeCubicInOut)
      .tween('r', () => (t: number) => { this.proj.rotate(i(t)); this.redraw(); })
      .on('end', () => setTimeout(() => { this.autoRot = true; }, 8000));
  }

  // ── Tier-2: precise boundary on click (lazy, cached) ─────────────────────
  private loadTier2(iso2: string, d: any): void {
    this.gHighlight?.selectAll('*').remove();
    const col = this.aqiData[iso2] ? aqiInfo(this.aqiData[iso2].avgAqi).col : '#2a5a8a';
    this.gHighlight.append('path').datum(d).attr('d', this.path as any)
      .style('fill', 'none').style('stroke', col)
      .style('stroke-width', '1.5').style('stroke-opacity', '0.7').style('filter', 'url(#glow)');
    this.zone.run(() => { this.loadingBoundary = true; });
    fetchBoundary(iso2).then(feat => {
      this.zone.run(() => { this.loadingBoundary = false; });
      if (!feat) return;
      this.gHighlight.selectAll('*').remove();
      this.gHighlight.append('path').datum(feat).attr('d', this.path as any)
        .style('fill', 'none').style('stroke', col)
        .style('stroke-width', '1.8').style('stroke-opacity', '0.85').style('filter', 'url(#glow)');
    });
  }

  // ── Refresh fill colors when aqiData input changes ────────────────────────
  private refresh(): void {
    if (!this.gCountries) return;
    this.gCountries.selectAll('.cp')
      .style('fill',         (d: any) => this.fill(d.id))
      .style('fill-opacity', (d: any) => this.opc(d.id))
      .style('stroke',       (d: any) => this.strk(d.id))
      .style('stroke-width', (d: any) => this.hasData(d.id) ? '0.4' : '0.5');
    this.gLabels?.selectAll('text')
      .text((d: any) => { const c = codeFromId(d.id); return c && this.aqiData[c] ? this.aqiData[c].name || c : ''; })
      .style('fill', (d: any) => this.hasData(d.id) ? '#c8d8f0' : '#4a6a8a');
  }
}
