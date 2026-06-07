// ============================================================
// validators.js - Input Validation Functions
// ============================================================

/**
 * Validates if a value is a finite number
 */
export function isValidNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Validates latitude (-90 to 90)
 */
export function validateLatitude(lat) {
  if (!isValidNumber(lat)) return 'Latitude must be a number';
  if (lat < -90 || lat > 90) return 'Latitude must be between -90 and 90';
  return null;
}

/**
 * Validates longitude (-180 to 180)
 */
export function validateLongitude(lon) {
  if (!isValidNumber(lon)) return 'Longitude must be a number';
  if (lon < -180 || lon > 180) return 'Longitude must be between -180 and 180';
  return null;
}

/**
 * Validates north angle (0-360)
 */
export function validateNorthAngle(angle) {
  if (!isValidNumber(angle)) return 'Angle must be a number';
  if (angle < 0 || angle > 360) return 'Angle must be between 0 and 360';
  return null;
}

/**
 * Validates object parameters
 */
export function validateObject(obj, plotPolygon) {
  const errors = [];

  if (!isValidNumber(obj.x) || !isValidNumber(obj.y)) {
    errors.push('X and Y must be numbers');
  }

  if (!isValidNumber(obj.height) || obj.height <= 0) {
    errors.push('Height must be positive');
  }

  if (obj.type === 'cylinder') {
    if (!isValidNumber(obj.diameter) || obj.diameter <= 0) {
      errors.push('Diameter must be positive');
    }
  } else if (obj.type === 'rectangular') {
    if (!isValidNumber(obj.width) || obj.width <= 0) {
      errors.push('Width must be positive');
    }
    if (!isValidNumber(obj.length) || obj.length <= 0) {
      errors.push('Length must be positive');
    }
    if (!isValidNumber(obj.rotation)) {
      errors.push('Rotation must be a number');
    }
  }

  // Check if point is inside plot polygon
  if (plotPolygon && isValidNumber(obj.x) && isValidNumber(obj.y)) {
    if (!pointInPolygon(obj.x, obj.y, plotPolygon)) {
      errors.push('Object must be inside the plot boundary');
    }
  }

  // Validate color
  if (obj.shadowColor && !/^#[0-9A-Fa-f]{6}$/.test(obj.shadowColor)) {
    errors.push('Shadow color must be a valid hex color (e.g., #808080)');
  }

  return errors.length > 0 ? errors : null;
}

/**
 * Point-in-polygon test using ray casting algorithm
 * polygon: array of [x, y] pairs, closed (first == last) or not
 */
export function pointInPolygon(x, y, polygon) {
  // Ensure polygon is closed
  const pts = polygon[0][0] === polygon[polygon.length - 1][0] &&
              polygon[0][1] === polygon[polygon.length - 1][1]
    ? polygon.slice(0, -1)
    : polygon;

  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Validates 4 corners form a valid convex quadrilateral
 * corners: {A: {x,y}, B: {x,y}, C: {x,y}, D: {x,y}}
 * Returns {valid: boolean, errors: string[], polygon: [[x,y],...]}
 */
export function validatePlotCorners(corners) {
  const errors = {};
  const order = ['A', 'B', 'C', 'D'];
  const pts = [];

  // Check all corners exist and are numeric
  for (const key of order) {
    const c = corners[key];
    if (!c || !isValidNumber(c.x) || !isValidNumber(c.y)) {
      errors[key] = 'X and Y must be valid numbers';
      return {valid: false, errors, polygon: null};
    }
    pts.push([c.x, c.y]);
  }

  // Check that points form a valid quadrilateral (non-collinear, etc.)
  // This is done below with area check

  // Check for duplicate points
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (pts[i][0] === pts[j][0] && pts[i][1] === pts[j][1]) {
        errors[order[i]] = `Corner ${order[i]} coincides with ${order[j]}`;
        errors[order[j]] = `Corner ${order[j]} coincides with ${order[i]}`;
        return {valid: false, errors, polygon: null};
      }
    }
  }

  // Check for self-intersection (bow-tie)
  // Edges: AB, BC, CD, DA
  const edges = [
    [pts[0], pts[1]],
    [pts[1], pts[2]],
    [pts[2], pts[3]],
    [pts[3], pts[0]]
  ];

  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      // Skip adjacent edges (they share a vertex)
      if (j === i + 1 || (i === 0 && j === 3)) continue;
      if (segmentsIntersect(edges[i][0], edges[i][1], edges[j][0], edges[j][1])) {
        errors[order[i]] = 'Edges cross - invalid polygon (self-intersecting)';
        errors[order[j]] = 'Edges cross - invalid polygon (self-intersecting)';
        return {valid: false, errors, polygon: null};
      }
    }
  }

  // Check convexity using cross product signs
  const crossProducts = [];
  for (let i = 0; i < 4; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % 4];
    const p2 = pts[(i + 2) % 4];

    const v1 = [p1[0] - p0[0], p1[1] - p0[1]];
    const v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    crossProducts.push(cross);
  }

  // All cross products should have same sign (all positive or all negative)
  const allPositive = crossProducts.every(c => c > 1e-10);
  const allNegative = crossProducts.every(c => c < -1e-10);

  if (!allPositive && !allNegative) {
    // Find which corner causes concavity
    for (let i = 0; i < 4; i++) {
      if ((crossProducts[i] > 0) !== (crossProducts[0] > 0)) {
        errors[order[i]] = 'Concave corner - only convex quadrilaterals supported';
      }
    }
    return {valid: false, errors, polygon: null};
  }

  // Check non-zero area
  const area = polygonArea(pts);
  if (Math.abs(area) < 1e-10) {
    errors.A = 'Zero area - corners are collinear';
    return {valid: false, errors, polygon: null};
  }

  // If we get here, validation passed - clear any previous errors
  for (const key of order) {
    delete errors[key];
  }

  // Ensure CCW winding for consistent math
  const polygon = area > 0 ? [...pts, pts[0]] : [...pts.reverse(), pts[0]];

  return {valid: true, errors: {}, polygon};
}

/**
 * Check if two line segments intersect (proper intersection, not at endpoints)
 */
function segmentsIntersect(p1, p2, p3, p4) {
  const orientation = (a, b, c) => {
    const val = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
    if (Math.abs(val) < 1e-10) return 0; // collinear
    return val > 0 ? 1 : 2; // clockwise or counterclockwise
  };

  const onSegment = (a, b, c) => {
    return b[0] <= Math.max(a[0], c[0]) && b[0] >= Math.min(a[0], c[0]) &&
           b[1] <= Math.max(a[1], c[1]) && b[1] >= Math.min(a[1], c[1]);
  };

  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  // General case
  if (o1 !== o2 && o3 !== o4) return true;

  // Special cases - collinear points on segment
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;

  return false;
}

/**
 * Calculate polygon area (shoelace formula)
 * Positive = CCW, Negative = CW
 */
export function polygonArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return area / 2;
}

/**
 * Validate time string HH:MM
 */
export function validateTime(timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 'Time must be in HH:MM format';
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23) return 'Hours must be 0-23';
  if (minutes < 0 || minutes > 59) return 'Minutes must be 0-59';
  return null;
}

/**
 * Validate month (1-12)
 */
export function validateMonth(month) {
  if (!isValidNumber(month)) return 'Month must be a number';
  if (month < 1 || month > 12) return 'Month must be 1-12';
  return null;
}

/**
 * Validate timezone (basic check)
 */
export function validateTimezone(tz) {
  if (!tz || typeof tz !== 'string') return 'Timezone is required';
  // Basic IANA format check
  if (!/^[A-Za-z]+(\/[A-Za-z_]+)+$/.test(tz) && tz !== 'UTC') {
    return 'Invalid timezone format';
  }
  return null;
}
