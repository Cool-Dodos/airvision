import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { aqiInfo, NUMERIC_TO_CODE } from '../utils/aqi';
import { safeOutdoorTime, SOURCE_TAGS } from '../utils/health';
import indiaGeoJson from '../data/india-official.json';

const WORLD_URL   = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const INDIA_ID    = 356;
const LABEL_SCALE = 1.6; // show labels when zoom ≥ 1.6× base scale

export default function Globe({ aqiData, onCountryClick }) {
  const svgRef   = useRef(null);
  const stateRef = useRef({ autoRotate: true, scale: 1 });
  const [tooltip, setTooltip] = useState(null);

  const getColor = useCallback((numericId) => {
    const code = NUMERIC_TO_CODE[String(numericId)];
    if (!code || !aqiData[code]) return '#0a1e3a';
    return aqiInfo(aqiData[code].avgAqi).col;
  }, [aqiData]);

  useEffect(() => {
    if (!svgRef.current) return;
    const el = svgRef.current;
    const W  = el.clientWidth  || window.innerWidth;
    const H  = el.clientHeight || window.innerHeight - 38;
    const BASE = Math.min(W, H) * 0.42;

    const svg = d3.select(el);
    svg.selectAll('*').remove();

    let scale = BASE;
    stateRef.current.scale = scale;

    const projection = d3.geoOrthographic()
      .scale(scale).translate([W / 2, H / 2])
      .clipAngle(90).rotate([20, -25]);

    const pathGen = d3.geoPath().projection(projection);
    stateRef.current.projection = projection;

    // Layers
    const gSphere = svg.append('path')
      .datum({ type: 'Sphere' }).attr('d', pathGen)
      .style('fill', '#050e22').style('stroke', '#0a1e3a').style('stroke-width', '1.5');

    const gGrat = svg.append('path')
      .datum(d3.geoGraticule()()).attr('d', pathGen)
      .style('fill', 'none').style('stroke', '#071828').style('stroke-width', '0.4').style('opacity', 0.6);

    let gCountries, gLabels, gMesh;

    function redraw() {
      gSphere.attr('d', pathGen);
      gGrat.attr('d', pathGen);
      gCountries?.selectAll('path').attr('d', pathGen);
      gMesh?.attr('d', pathGen);
      // Reposition labels if visible
      if (scale >= BASE * LABEL_SCALE && gLabels) {
        gLabels.selectAll('text').each(function(d) {
          const c     = d3.geoCentroid(d);
          const proj  = projection(c);
          if (!proj) { d3.select(this).style('display', 'none'); return; }
          // Hide if centroid is on the back of the globe
          const angle = d3.geoDistance(c, [-projection.rotate()[0], -projection.rotate()[1]]);
          d3.select(this)
            .style('display', angle > Math.PI / 2 ? 'none' : 'block')
            .attr('x', proj[0]).attr('y', proj[1]);
        });
      }
    }

    d3.json(WORLD_URL).then(world => {
      let features = topojson.feature(world, world.objects.countries).features;
      // Override India with official boundary
      features = features.map(f => f.id === INDIA_ID ? { ...f, geometry: indiaGeoJson.geometry } : f);

      gCountries = svg.append('g');
      gCountries.selectAll('.cp')
        .data(features).join('path').attr('class', 'cp')
        .attr('d', pathGen)
        .style('fill', d => getColor(d.id))
        .style('fill-opacity', d => (NUMERIC_TO_CODE[String(d.id)] && aqiData[NUMERIC_TO_CODE[String(d.id)]]) ? 0.75 : 0.3)
        .style('stroke', '#020510').style('stroke-width', '0.4').style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
          const code = NUMERIC_TO_CODE[String(d.id)];
          if (!code || !aqiData[code]) return;
          const data = aqiData[code];
          const info = aqiInfo(data.avgAqi);
          const safe = safeOutdoorTime(data.avgAqi);
          const src  = data.dominentpol && SOURCE_TAGS[data.dominentpol];
          d3.select(this).style('fill-opacity', 1).style('stroke', '#ffffff44').style('stroke-width', '1');
          setTooltip({ x: event.clientX, y: event.clientY, name: data.name, aqi: data.avgAqi, col: info.col, cat: info.cat, safe: safe.healthy, src });
        })
        .on('mousemove', (event) => setTooltip(t => t ? { ...t, x: event.clientX, y: event.clientY } : null))
        .on('mouseout', function(event, d) {
          const code = NUMERIC_TO_CODE[String(d.id)];
          d3.select(this)
            .style('fill-opacity', (code && aqiData[code]) ? 0.75 : 0.3)
            .style('stroke', '#020510').style('stroke-width', '0.4');
          setTooltip(null);
        })
        .on('click', function(event, d) {
          const code = NUMERIC_TO_CODE[String(d.id)];
          if (!code) return;
          stateRef.current.autoRotate = false;
          const c = d3.geoCentroid(d);
          const interp = d3.interpolate(projection.rotate(), [-c[0], -c[1]]);
          d3.transition().duration(900).ease(d3.easeCubicInOut)
            .tween('rotate', () => t => { projection.rotate(interp(t)); redraw(); });
          onCountryClick(code);
          setTimeout(() => { stateRef.current.autoRotate = true; }, 8000);
        });

      // Country name labels (visible only when zoomed in)
      gLabels = svg.append('g').attr('class', 'labels').style('pointer-events', 'none');
      gLabels.selectAll('text')
        .data(features).join('text')
        .style('font-family', "'Courier New', monospace")
        .style('font-size', '10px')
        .style('fill', '#c8d8f0')
        .style('text-anchor', 'middle')
        .style('dominant-baseline', 'central')
        .style('letter-spacing', '0.08em')
        .style('text-shadow', '0 0 4px #020510, 0 0 8px #020510')
        .style('display', 'none')
        .text(d => {
          const code = NUMERIC_TO_CODE[String(d.id)];
          return code && aqiData[code] ? aqiData[code].name || '' : '';
        });

      gMesh = svg.append('path')
        .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
        .style('fill', 'none').style('stroke', '#020510').style('stroke-width', '0.3')
        .attr('d', pathGen);

      // Auto-rotation
      d3.timer(() => {
        if (stateRef.current.autoRotate) {
          const [λ, φ] = projection.rotate();
          projection.rotate([λ + 0.10, φ]);
          redraw();
        }
      });
    });

    // Drag
    let dragOrigin = null;
    svg.call(d3.drag()
      .on('start', event => {
        stateRef.current.autoRotate = false;
        dragOrigin = { x: event.x, y: event.y, rot: [...projection.rotate()] };
      })
      .on('drag', event => {
        if (!dragOrigin) return;
        projection.rotate([
          dragOrigin.rot[0] + (event.x - dragOrigin.x) * 0.28,
          Math.max(-90, Math.min(90, dragOrigin.rot[1] - (event.y - dragOrigin.y) * 0.28)),
        ]);
        redraw();
      })
      .on('end', () => setTimeout(() => { stateRef.current.autoRotate = true; }, 3000))
    );

    // Scroll zoom — show labels when zoomed in enough
    svg.on('wheel', event => {
      event.preventDefault();
      scale = Math.max(BASE * 0.5, Math.min(BASE * 4, scale - event.deltaY * 1.2));
      projection.scale(scale);
      stateRef.current.scale = scale;

      // Toggle label visibility
      if (gLabels) {
        const showLabels = scale >= BASE * LABEL_SCALE;
        gLabels.selectAll('text').style('display', showLabels ? 'block' : 'none');
      }
      redraw();
    }, { passive: false });

    return () => svg.selectAll('*').remove();
  }, [aqiData, getColor]);

  // Reactive color update
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).selectAll('.cp')
      .style('fill', d => getColor(d.id))
      .style('fill-opacity', d => {
        const code = NUMERIC_TO_CODE[String(d.id)];
        return (code && aqiData[code]) ? 0.75 : 0.3;
      });
  }, [aqiData, getColor]);

  return (
    <>
      <svg ref={svgRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: 'calc(100% - 38px)', zIndex: 1 }} />
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 12,
          background: 'rgba(2,5,16,0.95)', border: '1px solid #0d2a4a',
          borderLeft: `2px solid ${tooltip.col}`,
          borderRadius: 2, padding: '10px 14px', fontSize: 12,
          pointerEvents: 'none', zIndex: 30, fontFamily: "'Courier New', monospace",
          minWidth: 160,
        }}>
          <div style={{ color: '#c8d8f0', fontWeight: 'bold', marginBottom: 4, letterSpacing: '0.06em' }}>{tooltip.name}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ color: tooltip.col, fontSize: 22, fontWeight: 'bold', lineHeight: 1 }}>{tooltip.aqi}</span>
            <span style={{ color: tooltip.col, fontSize: 9, letterSpacing: '0.15em' }}>{tooltip.cat}</span>
          </div>
          <div style={{ fontSize: 10, color: '#3a5a7a' }}>Safe outdoors: <span style={{ color: '#5a7a9a' }}>{tooltip.safe}</span></div>
          {tooltip.src && <div style={{ fontSize: 10, color: '#3a5a7a', marginTop: 3 }}>{tooltip.src.icon} {tooltip.src.tag}</div>}
          <div style={{ fontSize: 9, color: '#1a3a5a', marginTop: 6, letterSpacing: '0.1em' }}>Click to see full details →</div>
        </div>
      )}
    </>
  );
}
