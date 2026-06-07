// ============================================================
// shadowMath.js - Core Shadow Computation (Pure JS)
// Uses SunCalc for solar position, earcut for polygon operations
// ============================================================

import { pointInPolygon, polygonArea } from './validators.js';

// SunCalc is loaded globally via CDN

// ============================================================
// Solar Position (using SunCalc)
// ============================================================

/**
 * Get sun position for given date/time/location
 * @param {Date} date - Date object (in local timezone)
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @returns {Object} {altitude: radians, azimuth: radians, altitudeDeg: degrees, azimuthDeg: degrees, isDaylight: boolean}
 */
export function getSunPosition(date, lat, lon) {
  // SunCalc is loaded globally via CDN
  const SunCalc = window.SunCalc;
  if (!SunCalc) {
    console.error('SunCalc not loaded');
    return {altitude: 0, azimuth: 0, altitudeDeg: 0, azimuthDeg: 0, isDaylight: false};
  }
  const pos = SunCalc.getPosition(date, lat, lon);

  // SunCalc returns: altitude (radians, -PI/2 to PI/2), azimuth (radians, 0=North, CW)
  const altitudeDeg = pos.altitude * 180 / Math.PI;
  const azimuthDeg = (pos.azimuth * 180 / Math.PI + 360) % 360; // 0-360, 0=North

  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth,
    altitudeDeg,
    azimuthDeg,
    isDaylight: pos.altitude > 0
  };
}

/**
 * Generate time steps for a full day sweep
 * @param {Date} date - Date (day only)
 * @param {string} timezone - IANA timezone
 * @param {number} startHour - Start hour (default 6)
 * @param {number} endHour - End hour (default 19)
 * @param {number} stepMinutes - Step in minutes (default 30)
 * @returns {Array<{date: Date, timeStr: string, minutes: number}>}
 */
export function generateDaySweep(date, timezone, startHour = 6, endHour = 19, stepMinutes = 30) {
  const steps = [];
  // Create base date at midnight in the target timezone
  // We'll use a simple approach: create date at specific hour in local time
  const baseDate = new Date(date);
  baseDate.setHours(0, 0, 0, 0);

  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += stepMinutes) {
      if (h === endHour && m > 0) break;
      const d = new Date(baseDate);
      d.setHours(h, m, 0, 0);
      steps.push({
        date: d,
        timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        minutes: h * 60 + m
      });
    }
  }
  return steps;
}

// ============================================================
// Geometry Utilities
// ============================================================

/**
 * Rotate point around origin
 */
function rotatePoint(x, y, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [x * cos - y * sin, x * sin + y * cos];
}

/**
 * Translate point
 */
function translatePoint(x, y, dx, dy) {
  return [x + dx, y + dy];
}

/**
 * Get shadow direction vector in plot coordinates
 * northAngle: degrees from -Y axis to True North (clockwise)
 * sunAzimuth: degrees clockwise from True North
 * Returns unit vector [dx, dy] in plot coordinates (+X right, +Y up)
 */
export function getShadowDirection(northAngle, sunAzimuth) {
  // Shadow bearing = opposite of sun azimuth
  const shadowBearing = (sunAzimuth + 180) % 360;

  // North vector in plot coordinates: angle from -Y axis CW by northAngle
  // -Y axis = 270 degrees in standard math (CCW from +X)
  // Clockwise from -Y = subtract from 270
  const northAngleRad = (270 - northAngle) * Math.PI / 180;

  // Shadow direction relative to North: bearing CW from North
  // In math coords (CCW from +X): 90 - bearing
  const shadowAngleFromNorth = (90 - shadowBearing) * Math.PI / 180;

  // Total angle in plot math coordinates
  const totalAngle = northAngleRad + shadowAngleFromNorth;

  return [Math.cos(totalAngle), Math.sin(totalAngle)];
}

// ============================================================
// Shadow Polygon Generation
// ============================================================

/**
 * Generate cylinder shadow (stadium shape)
 */
function generateCylinderShadow(obj, shadowDir, shadowLength, diameter) {
  const [dx, dy] = shadowDir;
  const halfLen = shadowLength / 2;
  const radius = diameter / 2;

  // Center of the rectangular part
  const cx = obj.x + halfLen * dx;
  const cy = obj.y + halfLen * dy;

  // Angle of shadow direction
  const angle = Math.atan2(dy, dx);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const points = [];
  const numCap = 32;

  // Rectangle corners in local coordinates (before rotation)
  // Rectangle extends from -halfLen to +halfLen along shadow direction
  // Width is diameter (radius on each side)
  const rectLocal = [
    [-halfLen, -radius],
    [halfLen, -radius],
    [halfLen, radius],
    [-halfLen, radius]
  ];

  // Far end semicircle (shadow tip)
  for (let i = 0; i <= numCap; i++) {
    const t = Math.PI * i / numCap; // 0 to PI
    const lx = halfLen + radius * Math.cos(t);
    const ly = radius * Math.sin(t);
    rectLocal.push([lx, ly]);
  }

  // Near end semicircle (base)
  for (let i = 0; i <= numCap; i++) {
    const t = Math.PI * i / numCap; // 0 to PI
    const lx = -halfLen - radius * Math.cos(t);
    const ly = -radius * Math.sin(t);
    rectLocal.push([lx, ly]);
  }

  // Rotate and translate all points
  for (const [lx, ly] of rectLocal) {
    const rx = lx * cosA - ly * sinA;
    const ry = lx * sinA + ly * cosA;
    points.push([cx + rx, cy + ry]);
  }

  return points;
}

/**
 * Generate rectangular prism shadow (extruded rotated rectangle)
 */
function generateRectangularShadow(obj, shadowDir, shadowLength) {
  const [dx, dy] = shadowDir;
  const angle = Math.atan2(dy, dx);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Object footprint: rectangle centered at (obj.x, obj.y)
  // width along local X, length along local Y, rotated by obj.rotation
  const halfW = obj.width / 2;
  const halfL = obj.length / 2;
  const rotRad = (obj.rotation || 0) * Math.PI / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  // Footprint corners in local object coordinates
  const footprintLocal = [
    [-halfW, -halfL],
    [halfW, -halfL],
    [halfW, halfL],
    [-halfW, halfL]
  ];

  // Rotate footprint by object rotation
  const footprintRotated = footprintLocal.map(([lx, ly]) => [
    lx * cosR - ly * sinR,
    lx * sinR + ly * cosR
  ]);

  // Translate to object position
  const footprint = footprintRotated.map(([rx, ry]) => [
    obj.x + rx,
    obj.y + ry
  ]);

  // Extrude each corner along shadow direction by shadowLength
  const shadowPts = [];
  for (const [fx, fy] of footprint) {
    // Near corner (base)
    shadowPts.push([fx, fy]);
    // Far corner (shadow tip)
    shadowPts.push([fx + shadowLength * dx, fy + shadowLength * dy]);
  }

  // Compute convex hull of all points (shadow polygon)
  return convexHull(shadowPts);
}

/**
 * Convex hull using Andrew's monotone chain algorithm
 */
function convexHull(points) {
  // Remove duplicates
  const unique = [...new Set(points.map(p => p.join(',')))].map(s => s.split(',').map(Number));

  if (unique.length <= 1) return unique;

  // Sort by x, then y
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Cross product
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  // Lower hull
  const lower = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Concatenate (removing duplicate endpoints)
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Clip polygon to another polygon using Sutherland-Hodgman algorithm
 * Works for convex clip polygon (our plot is convex)
 */
export function clipPolygon(subjectPolygon, clipPolygon) {
  // Ensure clip polygon is CCW
  const clipArea = polygonArea(clipPolygon);
  const clipPts = clipArea > 0 ? [...clipPolygon] : [...clipPolygon].reverse();
  // Remove closing duplicate if present
  if (clipPts[0][0] === clipPts[clipPts.length - 1][0] &&
      clipPts[0][1] === clipPts[clipPts.length - 1][1]) {
    clipPts.pop();
  }

  let output = [...subjectPolygon];
  // Remove closing duplicate from subject
  if (output[0][0] === output[output.length - 1][0] &&
      output[0][1] === output[output.length - 1][1]) {
    output.pop();
  }

  for (let i = 0; i < clipPts.length; i++) {
    const clipStart = clipPts[i];
    const clipEnd = clipPts[(i + 1) % clipPts.length];
    const input = [...output];
    output = [];

    if (input.length === 0) break;

    let prev = input[input.length - 1];
    for (const curr of input) {
      const currInside = isInside(curr, clipStart, clipEnd);
      const prevInside = isInside(prev, clipStart, clipEnd);

      if (currInside) {
        if (!prevInside) {
          // Entering - add intersection
          const intersection = computeIntersection(prev, curr, clipStart, clipEnd);
          if (intersection) output.push(intersection);
        }
        output.push(curr);
      } else if (prevInside) {
        // Exiting - add intersection
        const intersection = computeIntersection(prev, curr, clipStart, clipEnd);
        if (intersection) output.push(intersection);
      }
      prev = curr;
    }
  }

  // Close the polygon
  if (output.length > 0) {
    output.push([...output[0]]);
  }

  return output;
}

/**
 * Check if point is inside clip edge (left side of directed edge)
 */
function isInside(p, edgeStart, edgeEnd) {
  // Point is inside if it's on the left side of the directed edge (for CCW polygon)
  return (edgeEnd[0] - edgeStart[0]) * (p[1] - edgeStart[1]) -
         (edgeEnd[1] - edgeStart[1]) * (p[0] - edgeStart[0]) >= -1e-10;
}

/**
 * Compute intersection of two line segments
 */
function computeIntersection(p1, p2, edgeStart, edgeEnd) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = edgeStart[0], y3 = edgeStart[1];
  const x4 = edgeEnd[0], y4 = edgeEnd[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  if (t < 0 || t > 1) return null; // Intersection not within segment

  return [
    x1 + t * (x2 - x1),
    y1 + t * (y2 - y1)
  ];
}

// ============================================================
// Main Shadow Computation Function
// ============================================================

/**
 * Compute shadows for all objects
 * @param {Object} params
 * @returns {Object} {plotBoundary, objects, shadows, sun}
 */
export function computeShadows({
  plotPolygon,        // [[x,y],...] closed CCW
  objects,            // Array of object definitions
  lat, lon, timezone,
  date,               // Date object (21st of month)
  time,               // 'HH:MM' string or array for sweep
  northAngle,         // degrees, -Y to North CW
  units               // 'feet' | 'meters'
}) {
  // Parse time(s)
  const timeArray = Array.isArray(time) ? time : [time];

  // Get sun positions for all times
  const sunPositions = timeArray.map(t => {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return {time: t, ...getSunPosition(d, lat, lon)};
  });

  // Filter daylight only
  const daylightPositions = sunPositions.filter(sp => sp.isDaylight);

  // Compute shadows for each object at each time
  const shadows = [];

  for (const obj of objects) {
    if (!obj.visible) continue;

    // Check if object is inside plot
    if (!pointInPolygon(obj.x, obj.y, plotPolygon)) continue;

    for (const sun of daylightPositions) {
      const altitudeRad = sun.altitude;
      if (altitudeRad <= 0) continue;

      // Shadow length = height / tan(altitude)
      const shadowLength = obj.height / Math.tan(altitudeRad);

      // Shadow direction
      const shadowDir = getShadowDirection(northAngle, sun.azimuthDeg);

      // Generate shadow polygon based on object type
      let shadowPts;
      if (obj.type === 'cylinder') {
        shadowPts = generateCylinderShadow(obj, shadowDir, shadowLength, obj.diameter);
      } else {
        shadowPts = generateRectangularShadow(obj, shadowDir, shadowLength);
      }

      // Close polygon
      if (shadowPts[0][0] !== shadowPts[shadowPts.length - 1][0] ||
          shadowPts[0][1] !== shadowPts[shadowPts.length - 1][1]) {
        shadowPts.push([...shadowPts[0]]);
      }

      // Clip to plot boundary
      const clipped = clipPolygon(shadowPts, plotPolygon);

      if (clipped.length > 2) {
        shadows.push({
          objectId: obj.id,
          label: obj.label || `Object ${obj.id}`,
          type: obj.type,
          color: obj.shadowColor || '#808080',
          polygon: clipped,
          time: sun.time,
          altitudeDeg: sun.altitudeDeg,
          azimuthDeg: sun.azimuthDeg
        });
      }
    }
  }

  // Return plot boundary (ensure closed)
  const plotBoundary = [...plotPolygon];
  if (plotBoundary[0][0] !== plotBoundary[plotBoundary.length - 1][0] ||
      plotBoundary[0][1] !== plotBoundary[plotBoundary.length - 1][1]) {
    plotBoundary.push([...plotBoundary[0]]);
  }

  return {
    plotBoundary,
    objects: objects.filter(o => o.visible && pointInPolygon(o.x, o.y, plotPolygon)),
    shadows,
    sun: daylightPositions[0] || {altitudeDeg: 0, azimuthDeg: 0, isDaylight: false},
    sunPositions: daylightPositions
  };
}

/**
 * Convert units
 */
export function convertUnits(value, from, to) {
  if (from === to) return value;
  if (from === 'feet' && to === 'meters') return value * 0.3048;
  if (from === 'meters' && to === 'feet') return value / 0.3048;
  return value;
}

/**
 * Convert all coordinates in state when units change
 */
export function convertStateUnits(state, newUnits) {
  const oldUnits = state.units;
  if (oldUnits === newUnits) return state;

  const converted = {...state, units: newUnits};

  // Convert corners
  converted.corners = {};
  for (const [key, pt] of Object.entries(state.corners)) {
    converted.corners[key] = {
      x: convertUnits(pt.x, oldUnits, newUnits),
      y: convertUnits(pt.y, oldUnits, newUnits)
    };
  }

  // Convert objects
  converted.objects = state.objects.map(obj => {
    const c = {...obj};
    c.x = convertUnits(obj.x, oldUnits, newUnits);
    c.y = convertUnits(obj.y, oldUnits, newUnits);
    c.height = convertUnits(obj.height, oldUnits, newUnits);
    if (obj.type === 'cylinder') {
      c.diameter = convertUnits(obj.diameter, oldUnits, newUnits);
    } else {
      c.width = convertUnits(obj.width, oldUnits, newUnits);
      c.length = convertUnits(obj.length, oldUnits, newUnits);
    }
    return c;
  });

  return converted;
}
