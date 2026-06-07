// ============================================================
// plotRenderer.js - Plotly Rendering Functions
// ============================================================

/**
 * Format coordinate pair for display
 */
function fmtCoord(x, y, precision = 2) {
  return `(${x.toFixed(precision)}, ${y.toFixed(precision)})`;
}

/**
 * Create plot traces from simulation result
 */
export function buildPlotTraces(simResult, state) {
  const traces = [];

  // 1. Plot boundary
  const boundaryX = simResult.plotBoundary.map(p => p[0]);
  const boundaryY = simResult.plotBoundary.map(p => p[1]);
  traces.push({
    x: boundaryX,
    y: boundaryY,
    mode: 'lines+text',
    fill: 'toself',
    fillcolor: 'rgba(0,0,0,0.04)',
    line: { color: '#000000', width: 2 },
    name: 'Plot Boundary',
    text: ['A', 'B', 'C', 'D', ''],
    textposition: 'top center',
    textfont: { size: 12, color: '#000000' },
    hovertemplate: simResult.plotBoundary.map((p, i) =>
      i < 4 ? `<b>${['A','B','C','D'][i]}</b>: ${fmtCoord(p[0], p[1])}<extra></extra>` : ''
    ),
    hoverinfo: 'text',
    showlegend: true,
    legendgroup: 'plot'
  });

  // 2. Corner coordinate annotations (as separate text trace)
  const cornerLabels = simResult.plotBoundary.slice(0, 4).map((p, i) =>
    `${['A','B','C','D'][i]}${fmtCoord(p[0], p[1])}`
  );
  const cornerX = simResult.plotBoundary.slice(0, 4).map(p => p[0]);
  const cornerY = simResult.plotBoundary.slice(0, 4).map(p => p[1]);
  traces.push({
    x: cornerX,
    y: cornerY,
    mode: 'text',
    text: cornerLabels,
    textposition: ['top left', 'top right', 'bottom right', 'bottom left'],
    textfont: { size: 10, color: '#000000' },
    showlegend: false,
    hoverinfo: 'skip'
  });

  // 3. Objects
  const cylinderObjs = simResult.objects.filter(o => o.type === 'cylinder');
  const rectObjs = simResult.objects.filter(o => o.type === 'rectangular');

  // Cylinders as markers sized by diameter
  if (cylinderObjs.length > 0) {
    traces.push({
      x: cylinderObjs.map(o => o.x),
      y: cylinderObjs.map(o => o.y),
      mode: 'markers+text',
      marker: {
        size: cylinderObjs.map(o => Math.max(8, o.diameter * 2)),
        color: 'rgba(1, 105, 111, 0.8)',
        line: { color: '#000000', width: 1 }
      },
      text: cylinderObjs.map(o => o.label || `Obj ${o.id}`),
      textposition: 'top center',
      name: 'Cylinder Objects',
      hovertemplate: cylinderObjs.map(o =>
        `<b>${o.label || `Object ${o.id}`}</b><br>` +
        `Type: Cylinder<br>` +
        `Position: ${fmtCoord(o.x, o.y)}<br>` +
        `Height: ${o.height.toFixed(2)} ${state.units === 'feet' ? 'ft' : 'm'}<br>` +
        `Diameter: ${o.diameter.toFixed(2)} ${state.units === 'feet' ? 'ft' : 'm'}<extra></extra>`
      ),
      hoverinfo: 'text',
      showlegend: true,
      legendgroup: 'objects'
    });
  }

  // Rectangular objects as filled polygons
  rectObjs.forEach(obj => {
    const halfW = obj.width / 2;
    const halfL = obj.length / 2;
    const rotRad = (obj.rotation || 0) * Math.PI / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    const local = [
      [-halfW, -halfL],
      [halfW, -halfL],
      [halfW, halfL],
      [-halfW, halfL],
      [-halfW, -halfL]
    ];

    const pts = local.map(([lx, ly]) => [
      obj.x + lx * cosR - ly * sinR,
      obj.y + lx * sinR + ly * cosR
    ]);

    traces.push({
      x: pts.map(p => p[0]),
      y: pts.map(p => p[1]),
      mode: 'lines+text',
      fill: 'toself',
      fillcolor: 'rgba(1, 105, 111, 0.2)',
      line: { color: '#01696f', width: 2 },
      text: ['', '', '', '', obj.label || `Obj ${obj.id}`],
      textposition: 'top center',
      name: obj.label || `Rect ${obj.id}`,
      hovertemplate:
        `<b>${obj.label || `Object ${obj.id}`}</b><br>` +
        `Type: Rectangular Prism<br>` +
        `Center: ${fmtCoord(obj.x, obj.y)}<br>` +
        `Height: ${obj.height.toFixed(2)} ${state.units === 'feet' ? 'ft' : 'm'}<br>` +
        `Width: ${obj.width.toFixed(2)} ${state.units === 'feet' ? 'ft' : 'm'}<br>` +
        `Length: ${obj.length.toFixed(2)} ${state.units === 'feet' ? 'ft' : 'm'}<br>` +
        `Rotation: ${(obj.rotation || 0).toFixed(0)}°<extra></extra>`,
      hoverinfo: 'text',
      showlegend: false,
      legendgroup: 'objects'
    });
  });

  // 4. Shadows (one trace per shadow polygon)
  simResult.shadows.forEach((shadow, idx) => {
    const opacity = state.sweepMode
      ? 0.12 + 0.18 * (parseInt(shadow.time.split(':')[0]) - 6) / 13
      : 0.25;

    traces.push({
      x: shadow.polygon.map(p => p[0]),
      y: shadow.polygon.map(p => p[1]),
      mode: 'lines',
      fill: 'toself',
      fillcolor: hexToRgba(shadow.color, opacity),
      line: { color: hexToRgba(shadow.color, opacity * 1.5), width: 1 },
      name: state.sweepMode ? `${shadow.label} Shadow` : `${shadow.label} @ ${shadow.time}`,
      hovertemplate:
        `<b>${shadow.label}</b><br>` +
        `Time: ${shadow.time}<br>` +
        `Sun Altitude: ${shadow.altitudeDeg.toFixed(1)}°<br>` +
        `Sun Azimuth: ${shadow.azimuthDeg.toFixed(1)}°<extra></extra>`,
      hoverinfo: 'text',
      showlegend: false,
      legendgroup: `shadow-${shadow.objectId}`
    });
  });

  return traces;
}

/**
 * Convert hex color to rgba string
 */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Create layout with north arrow, annotations, etc.
 */
function buildPlotLayout(simResult, state, theme = 'light') {
  // Compute plot bounds
  const allPts = [
    ...simResult.plotBoundary,
    ...simResult.objects.map(o => [o.x, o.y]),
    ...simResult.shadows.flatMap(s => s.polygon)
  ];

  const xs = allPts.map(p => p[0]);
  const ys = allPts.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.1 || 5;
  const padY = (maxY - minY) * 0.1 || 5;

  // North arrow in data coordinates
  const northAngleRad = (270 - state.northAngle) * Math.PI / 180;
  const northX = Math.cos(northAngleRad);
  const northY = Math.sin(northAngleRad);

  // Arrow start position (top-left area of plot)
  const arrowLen = Math.min(maxX - minX, maxY - minY) * 0.15;
  const arrowStart = { x: minX + padX * 0.5, y: maxY - padY * 0.5 };
  const arrowEnd = { x: arrowStart.x + arrowLen * northX, y: arrowStart.y + arrowLen * northY };

  const bg = theme === 'dark' ? '#171614' : '#f7f6f2';
  const text = theme === 'dark' ? '#cdccca' : '#28251d';
  const grid = theme === 'dark' ? '#393836' : '#d4d1ca';
  const plotBg = theme === 'dark' ? '#1c1b19' : '#ffffff';

  return {
    title: {
      text: `Shadow Simulation — ${new Date(2026, state.month - 1, 21).toLocaleString('en-US', { month: 'long' })} 21, 2026` +
            (state.sweepMode ? ' (Full-Day Sweep)' : ` @ ${typeof state.time === 'number' ? formatTimeDisplay(state.time) : state.time}`),
      font: { size: 16, color: text },
      x: 0.5
    },
    xaxis: {
      title: `X (${state.units === 'feet' ? 'ft' : 'm'})`,
      range: [minX - padX, maxX + padX],
      showgrid: true,
      gridcolor: grid,
      zeroline: true,
      zerolinecolor: grid,
      color: text,
      scaleanchor: 'y',
      scaleratio: 1,
      ticksuffix: ` ${state.units === 'feet' ? 'ft' : 'm'}`
    },
    yaxis: {
      title: `Y (${state.units === 'feet' ? 'ft' : 'm'})`,
      range: [minY - padY, maxY + padY],
      showgrid: true,
      gridcolor: grid,
      zeroline: true,
      zerolinecolor: grid,
      color: text,
      ticksuffix: ` ${state.units === 'feet' ? 'ft' : 'm'}`
    },
    plot_bgcolor: plotBg,
    paper_bgcolor: bg,
    font: { family: 'Satoshi, Inter, sans-serif', color: text },
    margin: { l: 60, r: 20, t: 60, b: 60 },
    legend: {
      x: 1,
      y: 1,
      bgcolor: theme === 'dark' ? 'rgba(28,27,25,0.9)' : 'rgba(255,255,255,0.9)',
      bordercolor: grid,
      borderwidth: 1,
      font: { size: 10 }
    },
    annotations: [
      // North arrow label
      {
        x: arrowEnd.x,
        y: arrowEnd.y,
        xref: 'x',
        yref: 'y',
        text: 'N',
        showarrow: false,
        font: { size: 14, color: '#0c4e54', family: 'Satoshi, Inter, sans-serif' },
        xanchor: 'center',
        yanchor: 'middle'
      },
      // Footer info
      {
        x: 0.5,
        y: -0.12,
        xref: 'paper',
        yref: 'paper',
        text: `Location: ${state.lat.toFixed(6)}, ${state.lon.toFixed(6)} | TZ: ${state.timezone} | North Ref: θ=${state.northAngle}°` +
              ` | Date: 2026-${String(state.month).padStart(2, '0')}-21` +
              ` | Units: ${state.units}`,
        showarrow: false,
        font: { size: 10, color: text },
        align: 'center'
      }
    ],
    shapes: [
      // North arrow shaft
      {
        type: 'line',
        x0: arrowStart.x,
        y0: arrowStart.y,
        x1: arrowEnd.x,
        y1: arrowEnd.y,
        xref: 'x',
        yref: 'y',
        line: { color: '#0c4e54', width: 3 }
      },
      // North arrow head
      {
        type: 'path',
        path: `M ${arrowEnd.x} ${arrowEnd.y} ` +
              `L ${arrowEnd.x - 0.2 * arrowLen * Math.cos(northAngleRad - Math.PI / 6)} ${arrowEnd.y - 0.2 * arrowLen * Math.sin(northAngleRad - Math.PI / 6)} ` +
              `L ${arrowEnd.x - 0.2 * arrowLen * Math.cos(northAngleRad + Math.PI / 6)} ${arrowEnd.y - 0.2 * arrowLen * Math.sin(northAngleRad + Math.PI / 6)} ` +
              `Z`,
        xref: 'x',
        yref: 'y',
        fillcolor: '#0c4e54',
        line: { color: '#0c4e54', width: 1 }
      }
    ],
    hovermode: 'closest',
    dragmode: 'pan',
    showlegend: true,
    modebar: {
      orientation: 'v'
    }
  };
}

/**
 * Format minutes (from midnight) to display time
 */
function formatTimeDisplay(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Render the plot
 */
export function renderPlot(container, simResult, state, theme = 'light') {
  const traces = buildPlotTraces(simResult, state);
  const layout = buildPlotLayout(simResult, state, theme);

  const config = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    modeBarButtonsToAdd: [],
    toImageButtonOptions: {
      format: 'png',
      filename: 'shadow-simulation',
      height: 800,
      width: 1200,
      scale: 2
    },
    scrollZoom: true
  };

  Plotly.newPlot(container, traces, layout, config);
}

/**
 * Update an existing plot
 */
export function updatePlot(container, simResult, state, theme = 'light') {
  const traces = buildPlotTraces(simResult, state);
  const layout = buildPlotLayout(simResult, state, theme);

  Plotly.react(container, traces, layout, {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    modeBarButtonsToAdd: [],
    scrollZoom: true
  });
}

/**
 * Download current plot as PNG with annotations
 */
export async function downloadPlotPng(container, filename = 'shadow-snapshot') {
  try {
    const pngData = await Plotly.toImage(container, {
      format: 'png',
      width: 1400,
      height: 1000,
      scale: 2
    });

    const link = document.createElement('a');
    link.href = pngData;
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Failed to download PNG:', err);
    throw err;
  }
}
