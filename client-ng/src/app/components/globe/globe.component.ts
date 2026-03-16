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

const OCEAN_COLOR    = '#050e22';
const NO_DATA_COLOR  = '#1e3050';
const NO_DATA_STROKE = '#2a4060';
const NO_DATA_OPC    = 0.85;

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
  'Uttarakhand': 'UK'
};

// ── Caches ─────────────────────────────────────────────────────────────────
const boundaryCache: Record<string, any> = {};
let indiaStatesGeoJSONCached: any[] | null = null;

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

// Pre-fetched state AQI cache — loaded at globe startup
let indiaStateAqiCached: Record<string, any> | null = null;

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
  @Input()  set focusCountry(code: string | null) {
    if (code && this.ready) this.zone.runOutsideAngular(() => this.zoomToCode(code));
  }
  @Output() countryClick = new EventEmitter<string>();

  private worldFeatures: any[] = [];

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

  private clipCircle: any;

  // Label centroid cache
  private labelCache: Array<{ geo: [number, number]; el: SVGTextElement }> = [];
  private stateLabelCache: Array<{ geo: [number, number]; el: SVGTextElement }> = [];
  private lastRotation: [number, number, number] = [0, 0, 0];
  private labelsDirty = true;

  // RAF throttle for mousemove
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

  // Backface culling
  private isFacing(lonLat: [number, number]): boolean {
    const rot = this.proj.rotate();
    const angle = d3.geoDistance(lonLat, [-rot[0], -rot[1]]);
    return angle < HALF_PI;
  }

  // ── Build globe ───────────────────────────────────────────────────────────
  private build(): void {
    const el = this.svgRef.nativeElement;
    const W  = el.clientWidth  || window.innerWidth;
    const H  = el.clientHeight || (window.innerHeight - 38);
    this.BASE  = Math.min(W, H) * 0.42;
    this.scale = this.BASE;

    const svg = d3.select(el);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const flt  = defs.append('filter').attr('id', 'glow');
    flt.append('feGaussianBlur').attr('stdDeviation', '2').attr('result', 'blur');
    const fm = flt.append('feMerge');
    fm.append('feMergeNode').attr('in', 'blur');
    fm.append('feMergeNode').attr('in', 'SourceGraphic');

    // Clip all geo layers to a circle matching the globe sphere
    const clipPath = defs.append('clipPath').attr('id', 'globe-clip');
    const clipCircle = this.clipCircle = clipPath.append('circle')
      .attr('cx', W / 2).attr('cy', H / 2).attr('r', this.scale);

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
        this.zone.run(() => {
          this.selectedCode = null;
          this.gHighlight?.selectAll('*').remove();
          this.exitIndiaMode();
          this.countryClick.emit('');
        });
      });

    const grat = svg.append('path').datum(d3.geoGraticule()())
      .attr('d', path as any)
      .attr('clip-path', 'url(#globe-clip)')
      .style('fill', 'none').style('stroke', '#071828')
      .style('stroke-width', '0.4').style('opacity', '0.5');

    // ── Layer Setup (Strict Order for Z-Index) ──────────────────────────────
    this.gCountries   = svg.append('g').attr('class', 'layer-countries').attr('clip-path', 'url(#globe-clip)');
    this.gStates      = svg.append('g').attr('class', 'layer-states').attr('clip-path', 'url(#globe-clip)');
    this.gHighlight   = svg.append('g').attr('class', 'layer-highlight').attr('clip-path', 'url(#globe-clip)').style('pointer-events', 'none');
    this.gLabels      = svg.append('g').attr('class', 'layer-labels').style('pointer-events', 'none');
    this.gStateLabels = svg.append('g').attr('class', 'layer-state-labels').style('pointer-events', 'none');

    let meshLayer: any = svg.append('path').attr('class', 'layer-mesh').attr('clip-path', 'url(#globe-clip)')
      .style('fill', 'none').style('stroke', '#020510').style('stroke-width', '0.3').style('pointer-events', 'none');

    let lastRedraw = 0;
    this.redraw = () => {
      const now = Date.now();
      if (now - lastRedraw < 24) return;
      lastRedraw = now;

      sphere.attr('d', path as any);
      clipCircle.attr('r', this.scale);
      grat.attr('d', path as any);
      this.gCountries?.selectAll('path').attr('d', path as any);
      meshLayer?.attr('d', path as any);
      this.gHighlight?.selectAll('path').attr('d', path as any);
      this.gStates?.selectAll('path').attr('d', path as any);

      const rot = proj.rotate() as [number, number, number];
      const rotChanged = rot[0] !== this.lastRotation[0] || rot[1] !== this.lastRotation[1];
      if (rotChanged) { this.labelsDirty = true; this.lastRotation = [...rot] as [number, number, number]; }

      if (this.labelsDirty) {
        this.updateLabelPositions();
        if (this.indiaMode) this.updateStateLabelPositions();
        this.labelsDirty = false;
      }
    };

    // Preload India states geo + AQI silently in background
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
          if (code === 'IN') {
            this.zone.run(() => this.triggerIndiaMode());
          } else {
            this.zone.run(() => this.exitIndiaMode());
          }
          this.zone.run(() => this.countryClick.emit(code));
        });

      // Country labels
      this.labelCache = [];
      this.gLabels.selectAll('text').data(features).join('text')
        .style('font-family', "'Courier New', monospace")
        .style('font-size', '10px')
        .style('text-anchor', 'middle').style('dominant-baseline', 'central')
        .style('letter-spacing', '0.08em')
        .style('text-shadow', '0 0 4px #020510, 0 0 8px #020510')
        .style('display', 'none')
        .text((d: any) => {
          const c = codeFromId(d.id);
          return c && this.aqiData[c] ? this.aqiData[c].name || c : '';
        })
        .style('fill', (d: any) => this.hasData(d.id) ? '#c8d8f0' : '#4a6a8a')
        .each((d: any, i: number, nodes: any) => {
          const geo = d3.geoCentroid(d) as [number, number];
          this.labelCache.push({ geo, el: nodes[i] });
        });

      // Mesh excluding India
      meshLayer.datum(topojson.mesh(world, world.objects.countries,
        (a: any, b: any) =>
          a !== b && String(a.id) !== String(INDIA_ID) && String(b.id) !== String(INDIA_ID)
      ) as any).attr('d', path as any);

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

    // Drag and scale
    let origin: { x: number; y: number; rot: [number, number, number] } | null = null;
    svg.call(d3.drag<SVGSVGElement, unknown>()
      .on('start', (e: any) => { this.autoRot = false; origin = { x: e.x, y: e.y, rot: [...proj.rotate()] as [number, number, number] }; })
      .on('drag', (e: any) => {
        if (!origin) return;
        proj.rotate([origin.rot[0] + (e.x - origin.x) * 0.28, Math.max(-90, Math.min(90, origin.rot[1] - (e.y - origin.y) * 0.28))]);
        this.redraw();
      })
      .on('end', () => { this.checkIndiaZoom(); setTimeout(() => { this.autoRot = true; }, 3000); }));

    svg.on('wheel', (event: WheelEvent) => {
      event.preventDefault();
      this.scale = Math.max(this.BASE * 0.5, Math.min(this.BASE * 5, this.scale - event.deltaY * 1.2));
      proj.scale(this.scale);
      clipCircle.attr('r', this.scale);
      const showLabels = this.scale >= this.BASE * LABEL_SCALE;
      if (this.gLabels) this.gLabels.selectAll('text').style('display', showLabels ? 'block' : 'none');
      this.checkIndiaZoom();
      this.labelsDirty = true;
      this.redraw();
    }, { passive: false } as any);
  }

  // ── Updated Label Positioning ─────────────────────────────────────────────
  private updateLabelPositions(): void {
    if (!this.gLabels || this.scale < this.BASE * LABEL_SCALE) return;
    const proj = this.proj;
    for (const { geo, el } of this.labelCache) {
      if (!this.isFacing(geo)) { el.style.display = 'none'; continue; }
      const p = proj(geo);
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.setAttribute('x', String(p[0])); el.setAttribute('y', String(p[1]));
    }
  }

  private updateStateLabelPositions(): void {
    if (!this.gStateLabels) return;
    const proj = this.proj;
    for (const { geo, el } of this.stateLabelCache) {
      if (!this.isFacing(geo)) { el.style.display = 'none'; continue; }
      const p = proj(geo);
      if (!p) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.setAttribute('x', String(p[0])); el.setAttribute('y', String(p[1]));
    }
  }

  // ── India Mode Trigger ───────────────────────────────────────────────────
  private checkIndiaZoom(): void {
    if (!this.ready) return;
    const rot   = this.proj.rotate();
    const angle = d3.geoDistance(INDIA_CENTROID, [-rot[0], -rot[1]]);
    // Strict activation: only 20 degrees from India's center
    const facing = angle < Math.PI * 0.12; 
    if (!this.indiaMode && this.scale >= this.BASE * INDIA_ENTER_MULT && facing) {
      this.zone.run(() => this.triggerIndiaMode());
    } else if (this.indiaMode && (this.scale < this.BASE * INDIA_EXIT_MULT || !facing)) {
      this.zone.run(() => this.exitIndiaMode());
    }
  }

  private triggerIndiaMode(): void {
    if (this.indiaMode) return;
    this.indiaMode = true;
    // Force immediate hide with important flag if needed, but style() usually suffice
    (this.gCountries?.selectAll('.cp') as any)
      .filter((d: any) => codeFromId(d.id) === 'IN')
      .style('display', 'none');
    this.loadAndDrawStates();
  }

  private exitIndiaMode(): void {
    if (!this.indiaMode) return;
    this.indiaMode = false;
    (this.gCountries?.selectAll('.cp') as any)
      .filter((d: any) => codeFromId(d.id) === 'IN')
      .style('display', null);
    this.gStates?.selectAll('*').remove();
    this.gStateLabels?.selectAll('*').remove();
    this.stateLabelCache = [];
  }

  // ── India State Layer ─────────────────────────────────────────────────────
  private loadAndDrawStates(): void {
    const svg = d3.select(this.svgRef.nativeElement);
    this.zone.run(() => { this.loadingBoundary = true; });

    Promise.all([loadIndiaStatesGeo(), loadIndiaStateAqi()]).then(([features, stateAqi]) => {
      this.zone.run(() => { this.loadingBoundary = false; });
      if (!this.indiaMode || !features.length) return;
      this.stateAqi = stateAqi;
      this.drawStateLayer(svg, features);
    });
  }

  private drawStateLayer(svg: any, features: any[]): void {
    this.gStates?.selectAll('*').remove();
    this.gStateLabels?.selectAll('*').remove();
    this.stateLabelCache = [];
    const path = this.path, proj = this.proj;

    this.gStates.selectAll('.sp').data(features).join('path').attr('class', 'sp')
      .attr('d', path as any)
      .style('fill', (d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        // Use transparent while loading or for missing data to avoid initial dark blue flash
        return this.stateAqi[name] != null ? aqiInfo(this.stateAqi[name].aqi).col : (this.loadingBoundary ? 'rgba(0,0,0,0)' : NO_DATA_COLOR);
      })
      .style('fill-opacity', 1.0)
      .style('stroke', '#020510').style('stroke-width', '0.5')
      .style('cursor', 'pointer')
      .on('mouseover', (event: MouseEvent, d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || 'State') as string;
        const data = this.stateAqi[name] ?? null;
        const info = aqiInfo(data?.aqi);
        const safe = safeOutdoorTime(data?.aqi ?? undefined);
        d3.select(event.currentTarget as Element).style('stroke', '#ffffff55').style('stroke-width', '1.2');
        this.zone.run(() => { this.tooltip = { x: event.clientX, y: event.clientY, name, aqi: data?.aqi ?? null, col: info.col, cat: info.cat, safe: safe.healthy }; });
      })
      .on('mousemove', (event: MouseEvent) => {
        this.lastMouseX = event.clientX; this.lastMouseY = event.clientY;
        if (!this.mouseRafPending) {
          this.mouseRafPending = true;
          requestAnimationFrame(() => {
            this.mouseRafPending = false;
            if (this.tooltip) { const { lastMouseX: x, lastMouseY: y } = this; this.zone.run(() => { this.tooltip = { ...this.tooltip!, x, y }; }); }
          });
        }
      })
      .on('mouseout', (event: MouseEvent, d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        const data = this.stateAqi[name] ?? null;
        d3.select(event.currentTarget as Element).style('stroke', '#020510').style('stroke-width', '0.5');
        this.zone.run(() => { this.tooltip = null; });
      });

    // State labels with dynamic sizing
    this.gStateLabels.selectAll('text').data(features).join('text')
      .style('font-family', "'Courier New', monospace").style('text-anchor', 'middle')
      .style('dominant-baseline', 'central').style('text-shadow', '0 0 3px #020510, 0 0 7px #020510')
      .style('fill', '#ffffff').style('letter-spacing', '0.05em')
      .each((d: any, i: number, nodes: any) => {
        const el = d3.select(nodes[i]);
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        const bounds = path.bounds(d);
        const area = Math.abs((bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]));
        const baseFs = Math.max(7, Math.min(13, Math.sqrt(area) * 0.06));
        const zFs = baseFs * Math.max(1, this.scale / (this.BASE * INDIA_ENTER_MULT));
        const label = area < 1000 ? (STATE_ABBR[name] || name) : name;
        const geo = d3.geoCentroid(d) as [number, number];
        const p = proj(geo);
        const facing = this.isFacing(geo);
        el.style('font-size', `${zFs}px`).style('font-weight', 'bold').text(area > 120 ? label : '')
          .attr('x', p ? p[0] : 0).attr('y', p ? p[1] : 0)
          .style('display', (!p || !facing || area < 120) ? 'none' : (null as any));
        this.stateLabelCache.push({ geo, el: nodes[i] });
      });
  }

  private colorStateLayer(): void {
    if (!this.gStates) return;
    const sa = this.stateAqi;
    this.gStates.selectAll('.sp')
      .style('fill', (d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        return sa[name] != null ? aqiInfo(sa[name].aqi).col : NO_DATA_COLOR;
      });
    this.gStateLabels?.selectAll('text')
      .style('fill', (d: any) => {
        const name = (d.properties?.shapeName || d.properties?.name || '') as string;
        return sa[name] != null ? '#ffffff' : '#8ab0c8';
      });
  }

  // ── Programmatic zoom by ISO2 code (anomaly click) ───────────────────────
  private zoomToCode(code: string): void {
    const feat = this.worldFeatures.find(f => codeFromId(f.id) === code);
    if (!feat) return;
    this.scale = code === 'IN' ? this.BASE * INDIA_ENTER_MULT : this.BASE * 2.2;
    this.proj.scale(this.scale);
    this.clipCircle?.attr('r', this.scale);
    this.gLabels?.selectAll('text').style('display', this.scale >= this.BASE * LABEL_SCALE ? 'block' : 'none');
    this.rotateToFeature(feat);
    this.loadTier2(code, feat);
    if (code === 'IN') this.zone.run(() => this.triggerIndiaMode());
    this.checkIndiaZoom();
    this.zone.run(() => this.countryClick.emit(code));
  }

  // ── Smooth rotation to feature centroid ───────────────────────────────────
  private rotateToFeature(d: any): void {
    this.autoRot = false;
    const c = d3.geoCentroid(d);
    const i = d3.interpolate(this.proj.rotate(), [-c[0], -c[1]] as any);
    d3.transition().duration(900).ease(d3.easeCubicInOut)
      .tween('r', () => (t: number) => {
        this.proj.rotate(i(t));
        this.labelsDirty = true;
        this.redraw();
      })
      .on('end', () => setTimeout(() => { this.autoRot = true; }, 8000));
  }

  // ── Tier-2: precise boundary on click ────────────────────────────────────
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

  // ── Refresh fill colors when aqiData changes ──────────────────────────────
  private refresh(): void {
    if (!this.gCountries) return;
    this.gCountries.selectAll('.cp')
      .style('fill',         (d: any) => this.fill(d.id))
      .style('fill-opacity', (d: any) => this.opc(d.id))
      .style('stroke',       (d: any) => this.strk(d.id))
      .style('stroke-width', (d: any) => this.hasData(d.id) ? '0.4' : '0.5')
      .style('display', (d: any) => (this.indiaMode && codeFromId(d.id) === 'IN') ? 'none' : (null as any));
    
    this.gLabels?.selectAll('text')
      .text((d: any) => { const c = codeFromId(d.id); return c && this.aqiData[c] ? this.aqiData[c].name || c : ''; })
      .style('fill', (d: any) => this.hasData(d.id) ? '#c8d8f0' : '#4a6a8a')
      .style('display', (d: any) => (this.indiaMode && codeFromId(d.id) === 'IN') ? 'none' : (this.scale >= this.BASE * LABEL_SCALE ? 'block' : 'none'));
    
    if (this.indiaMode) {
      this.colorStateLayer();
      this.labelsDirty = true;
      this.redraw();
    }
    
    this.labelsDirty = true;
  }
}
