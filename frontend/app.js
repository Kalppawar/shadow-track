// ============================================================
// app.js - Main Application Controller
// ============================================================

import { validatePlotCorners, validateObject, validateLatitude, validateLongitude, validateNorthAngle, validateTimezone } from './validators.js';
import { computeShadows, convertStateUnits, generateDaySweep } from './shadowMath.js';
import { renderPlot, updatePlot, downloadPlotPng } from './plotRenderer.js';

const defaultState = {
  units: 'feet',
  corners: {
    A: { x: 0, y: 0 },
    B: { x: 100, y: 0 },
    C: { x: 100, y: 100 },
    D: { x: 0, y: 100 }
  },
  northAngle: 180,
  lat: 28.7,
  lon: 77.1,
  timezone: 'Asia/Kolkata',
  month: 3,
  time: 720,
  sweepMode: true,
  objects: [],
  validationErrors: {},
  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
};

let state = JSON.parse(JSON.stringify(defaultState));
let selectedObjectId = null;
let editingObjectId = null;
let plotInitialized = false;
let currentSimResult = null;
let objectIdCounter = 1;

const elements = {
  plotDiv: document.getElementById('plotly-div'),
  plotStatus: document.getElementById('plotStatus'),
  toastContainer: document.getElementById('toast-container'),
  controlPanel: document.getElementById('controlPanel'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  helpFab: document.getElementById('helpFab'),
  helpModal: document.getElementById('helpModal'),
  helpClose: document.getElementById('helpClose'),
  inputLat: document.getElementById('input-lat'),
  inputLon: document.getElementById('input-lon'),
  selectTimezone: document.getElementById('select-timezone'),
  btnApplyLocation: document.getElementById('btn-apply-location'),
  sliderNorthAngle: document.getElementById('slider-north-angle'),
  valNorthAngle: document.getElementById('val-north-angle'),
  cornerInputs: document.getElementById('corner-inputs'),
  btnSavePlot: document.getElementById('btn-save-plot'),
  btnResetPlot: document.getElementById('btn-reset-plot'),
  cornerErrors: document.getElementById('corner-errors'),
  unitRadios: document.querySelectorAll('input[name="units"]'),
  selectObjType: document.getElementById('select-obj-type'),
  objectForm: document.getElementById('objectForm'),
  btnAddObject: document.getElementById('btn-add-object'),
  btnCancelEdit: document.getElementById('btn-cancel-edit'),
  objectList: document.getElementById('objectList'),
  selectMonth: document.getElementById('select-month'),
  sweepModeRadios: document.querySelectorAll('input[name="sweepMode"]'),
  sliderTime: document.getElementById('slider-time'),
  valTime: document.getElementById('val-time'),
  btnDownloadPng: document.getElementById('btn-download-png'),
  btnExport: document.getElementById('btn-export'),
  btnImport: document.getElementById('btn-import'),
  btnShare: document.getElementById('btn-share'),
  btnToggleTheme: document.getElementById('btn-toggle-theme')
};

function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, duration);
}

function setStatus(message) {
  elements.plotStatus.textContent = message;
}

function formatTimeDisplay(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getCurrentDate() {
  return new Date(2026, state.month - 1, 21);
}

function saveStateToHash() {
  try {
    const serialized = encodeURIComponent(btoa(JSON.stringify(state)));
    window.location.hash = `state=${serialized}`;
  } catch (err) {
    console.warn('Failed to save state to URL hash:', err);
  }
}

function loadStateFromHash() {
  const hash = window.location.hash;
  if (hash.startsWith('#state=')) {
    try {
      const encoded = hash.slice(7);
      const decoded = atob(decodeURIComponent(encoded));
      const loaded = JSON.parse(decoded);
      state = { ...defaultState, ...loaded };
      objectIdCounter = Math.max(...state.objects.map(o => o.id), 0) + 1;
      return true;
    } catch (err) {
      console.warn('Failed to load state from hash:', err);
      showToast('Failed to load state from URL', 'warning');
    }
  }
  return false;
}

function populateTimezones() {
  const fallback = [
    'UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris',
    'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Shanghai'
  ];
  let tzs = fallback;
  if (typeof Intl !== 'undefined' && Intl.supportedValuesOf) {
    try {
      tzs = Intl.supportedValuesOf('timeZone');
    } catch {}
  }
  elements.selectTimezone.innerHTML = tzs.map(tz =>
    `<option value="${tz}" ${tz === state.timezone ? 'selected' : ''}>${tz}</option>`
  ).join('');
}

function populateMonths() {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  elements.selectMonth.innerHTML = monthNames.map((name, idx) =>
    `<option value="${idx + 1}" ${idx + 1 === state.month ? 'selected' : ''}>${name}</option>`
  ).join('');
}

function renderCornerInputs() {
  const order = ['A', 'B', 'C', 'D'];
  elements.cornerInputs.innerHTML = order.map(key => {
    const c = state.corners[key];
    const error = state.validationErrors[key] || '';
    return `
      <div class="corner-input-group" data-corner="${key}">
        <label>${key}</label>
        <div class="input-pair">
          <input class="field-number-corner ${error ? 'error' : ''}" type="number" data-corner="${key}" data-axis="x" value="${c.x.toFixed(2)}" step="0.01" aria-label="Corner ${key} X">
          <input class="field-number-corner ${error ? 'error' : ''}" type="number" data-corner="${key}" data-axis="y" value="${c.y.toFixed(2)}" step="0.01" aria-label="Corner ${key} Y">
          <button class="validation-btn ${error ? 'invalid' : 'valid'}" disabled aria-hidden="true">${error ? '✕' : '✓'}</button>
        </div>
      </div>
    `;
  }).join('');
  const validationErrors = state.validationErrors || {};
  elements.cornerErrors.innerHTML = Object.entries(validationErrors)
    .map(([corner, msg]) => `<div class="error-item">⚠ ${corner}: ${msg}</div>`)
    .join('');
}

function validateCorners(newCorners) {
  return validatePlotCorners(newCorners);
}

function updateCornersFromInputs() {
  const inputs = elements.cornerInputs.querySelectorAll('input[data-corner]');
  const newCorners = JSON.parse(JSON.stringify(state.corners));
  inputs.forEach(input => {
    const corner = input.dataset.corner;
    const axis = input.dataset.axis;
    const value = parseFloat(input.value);
    if (!isNaN(value)) newCorners[corner][axis] = value;
  });
  return newCorners;
}

function getActiveObjectField(idCylinder, idRect) {
  const type = elements.selectObjType.value;
  return elements.objectForm.querySelector(type === 'cylinder' ? idCylinder : idRect);
}

function renderObjectForm() {
  const type = elements.selectObjType.value;
  const cylinderGroup = document.getElementById('obj-params-cylinder');
  const rectGroup = document.getElementById('obj-params-rectangular');
  if (type === 'cylinder') {
    cylinderGroup.classList.remove('hidden');
    rectGroup.classList.add('hidden');
  } else {
    cylinderGroup.classList.add('hidden');
    rectGroup.classList.remove('hidden');
  }
}

function getObjectFormData() {
  const type = elements.selectObjType.value;
  const form = elements.objectForm;
  const obj = {
    id: editingObjectId || objectIdCounter,
    type,
    x: parseFloat(getActiveObjectField('#obj-x', '#obj-x-rect')?.value || '0'),
    y: parseFloat(getActiveObjectField('#obj-y', '#obj-y-rect')?.value || '0'),
    height: parseFloat(getActiveObjectField('#obj-height', '#obj-height-rect')?.value || '0'),
    label: form.querySelector('#obj-label')?.value || '',
    shadowColor: form.querySelector('#obj-shadow-color')?.value || '#808080',
    visible: true
  };
  if (type === 'cylinder') {
    obj.diameter = parseFloat(form.querySelector('#obj-diameter')?.value || '0');
  } else {
    obj.width = parseFloat(form.querySelector('#obj-width')?.value || '0');
    obj.length = parseFloat(form.querySelector('#obj-length')?.value || '0');
    obj.rotation = parseFloat(form.querySelector('#obj-rotation')?.value || '0');
  }
  return obj;
}

function resetObjectForm() {
  elements.selectObjType.value = 'cylinder';
  elements.objectForm.querySelectorAll('input[type="number"], input[type="text"]').forEach(input => {
    input.value = '';
  });
  elements.objectForm.querySelector('#obj-shadow-color').value = '#808080';
  elements.objectForm.querySelector('#obj-rotation').value = '0';
  elements.btnAddObject.textContent = 'Add Object';
  elements.btnCancelEdit.classList.add('hidden');
  editingObjectId = null;
  renderObjectForm();
}

function addOrUpdateObject() {
  const obj = getObjectFormData();
  const plotValidation = validatePlotCorners(state.corners);
  const plotPolygon = plotValidation.valid ? plotValidation.polygon : null;
  const errors = validateObject(obj, plotPolygon);
  if (errors) {
    showToast(errors.join('; '), 'error');
    return false;
  }
  if (editingObjectId) {
    const idx = state.objects.findIndex(o => o.id === editingObjectId);
    if (idx >= 0) {
      state.objects[idx] = { ...state.objects[idx], ...obj };
      showToast('Object updated', 'success');
    }
  } else {
    state.objects.push(obj);
    objectIdCounter++;
    showToast('Object added', 'success');
  }
  renderObjectList();
  resetObjectForm();
  recomputeAndRender();
  return true;
}

function renderObjectList() {
  elements.objectList.innerHTML = state.objects.map(obj => {
    const typeLabel = obj.type === 'cylinder' ? 'Cyl' : 'Rect';
    const details = obj.type === 'cylinder'
      ? `(${obj.x.toFixed(1)}, ${obj.y.toFixed(1)}) h=${obj.height.toFixed(1)} Ø=${obj.diameter.toFixed(1)}`
      : `(${obj.x.toFixed(1)}, ${obj.y.toFixed(1)}) h=${obj.height.toFixed(1)} ${obj.width.toFixed(1)}×${obj.length.toFixed(1)} r=${(obj.rotation || 0).toFixed(0)}°`;
    return `
      <div class="object-item ${obj.id === editingObjectId ? 'editing' : ''}" data-object-id="${obj.id}">
        <div class="drag-handle">☰</div>
        <div class="obj-info">
          <div class="obj-main">
            <span class="obj-type-badge">${typeLabel}</span>
            <span class="obj-label">${obj.label || `Object ${obj.id}`}</span>
            <span style="display:inline-block; width:12px; height:12px; background:${obj.shadowColor}; border-radius:50%;" aria-hidden="true"></span>
          </div>
          <div class="obj-details">${details}</div>
        </div>
        <div class="obj-actions">
          <button class="icon-action visibility ${obj.visible ? 'on' : 'off'}" data-action="toggle-visibility" title="${obj.visible ? 'Hide' : 'Show'}" aria-label="Toggle visibility">${obj.visible ? '👁' : '🙈'}</button>
          <button class="icon-action edit" data-action="edit" title="Edit" aria-label="Edit">🖍</button>
          <button class="icon-action delete" data-action="delete" title="Delete" aria-label="Delete">🗑</button>
        </div>
      </div>
    `;
  }).join('');
  if (window.Sortable && !elements.objectList._sortable) {
    elements.objectList._sortable = new Sortable(elements.objectList, {
      handle: '.drag-handle',
      animation: 150,
      onEnd: (evt) => {
        const [moved] = state.objects.splice(evt.oldIndex, 1);
        state.objects.splice(evt.newIndex, 0, moved);
        renderObjectList();
        recomputeAndRender();
      }
    });
  }
}

function startEditingObject(id) {
  const obj = state.objects.find(o => o.id === id);
  if (!obj) return;
  editingObjectId = id;
  selectedObjectId = id;
  elements.selectObjType.value = obj.type;
  renderObjectForm();
  getActiveObjectField('#obj-x', '#obj-x-rect').value = obj.x;
  getActiveObjectField('#obj-y', '#obj-y-rect').value = obj.y;
  getActiveObjectField('#obj-height', '#obj-height-rect').value = obj.height;
  elements.objectForm.querySelector('#obj-label').value = obj.label;
  elements.objectForm.querySelector('#obj-shadow-color').value = obj.shadowColor;
  if (obj.type === 'cylinder') {
    elements.objectForm.querySelector('#obj-diameter').value = obj.diameter;
  } else {
    elements.objectForm.querySelector('#obj-width').value = obj.width;
    elements.objectForm.querySelector('#obj-length').value = obj.length;
    elements.objectForm.querySelector('#obj-rotation').value = obj.rotation || 0;
  }
  elements.btnAddObject.textContent = 'Save Changes';
  elements.btnCancelEdit.classList.remove('hidden');
  renderObjectList();
}

function deleteObject(id) {
  const obj = state.objects.find(o => o.id === id);
  if (!obj) return;
  if (confirm(`Delete ${obj.label || `Object ${id}`}?`)) {
    state.objects = state.objects.filter(o => o.id !== id);
    if (editingObjectId === id) resetObjectForm();
    if (selectedObjectId === id) selectedObjectId = null;
    renderObjectList();
    recomputeAndRender();
    showToast('Object deleted', 'info');
  }
}

function toggleObjectVisibility(id) {
  const obj = state.objects.find(o => o.id === id);
  if (obj) {
    obj.visible = !obj.visible;
    renderObjectList();
    recomputeAndRender();
    showToast(`${obj.label || `Object ${id}`} ${obj.visible ? 'shown' : 'hidden'}`, 'info', 2000);
  }
}

function recomputeAndRender() {
  const plotValidation = validatePlotCorners(state.corners);
  if (!plotValidation.valid) {
    setStatus('Invalid plot - please fix corner inputs');
    return;
  }
  setStatus('Computing shadows...');
  const plotPolygon = plotValidation.polygon;
  const date = getCurrentDate();
  let timeInput;
  if (state.sweepMode) {
    timeInput = generateDaySweep(date, state.timezone).map(step => step.timeStr);
  } else {
    timeInput = minutesToTimeString(state.time);
  }
  currentSimResult = computeShadows({
    plotPolygon,
    objects: state.objects,
    lat: state.lat,
    lon: state.lon,
    timezone: state.timezone,
    date,
    time: timeInput,
    northAngle: state.northAngle,
    units: state.units
  });
  if (!plotInitialized) {
    renderPlot(elements.plotDiv, currentSimResult, state, state.theme);
    plotInitialized = true;
  } else {
    updatePlot(elements.plotDiv, currentSimResult, state, state.theme);
  }
  setStatus(
    `${currentSimResult.objects.length} objects in plot, ` +
    `${currentSimResult.shadows.length} shadows rendered` +
    (state.sweepMode ? ' (full-day sweep)' : ` @ ${formatTimeDisplay(state.time)}`)
  );
  saveStateToHash();
}

function toggleSidebar() {
  const isOpen = elements.controlPanel.classList.toggle('open');
  elements.sidebarOverlay.classList.toggle('visible', isOpen);
  elements.sidebarToggle.setAttribute('aria-expanded', String(isOpen));
  elements.sidebarToggle.setAttribute('aria-label', isOpen ? 'Close controls' : 'Open controls');
  elements.sidebarToggle.textContent = isOpen ? '✕' : '☰';
}

function closeSidebar() {
  elements.controlPanel.classList.remove('open');
  elements.sidebarOverlay.classList.remove('visible');
  elements.sidebarToggle.setAttribute('aria-expanded', 'false');
  elements.sidebarToggle.setAttribute('aria-label', 'Open controls');
  elements.sidebarToggle.textContent = '☰';
}

function openHelpModal() {
  elements.helpModal.classList.remove('hidden');
}

function closeHelpModal() {
  elements.helpModal.classList.add('hidden');
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function bindEvents() {
  if (elements.sidebarToggle && elements.controlPanel && elements.sidebarOverlay) {
    elements.sidebarToggle.addEventListener('click', toggleSidebar);
    elements.sidebarOverlay.addEventListener('click', closeSidebar);
  }

  if (elements.helpFab && elements.helpModal && elements.helpClose) {
    elements.helpFab.addEventListener('click', openHelpModal);
    elements.helpClose.addEventListener('click', closeHelpModal);
    elements.helpModal.addEventListener('click', (e) => {
      if (e.target === elements.helpModal) closeHelpModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.controlPanel.classList.contains('open')) closeSidebar();
    if (e.key === 'Escape' && !elements.helpModal.classList.contains('hidden')) closeHelpModal();
  });

  elements.btnApplyLocation.addEventListener('click', () => {
    const lat = parseFloat(elements.inputLat.value);
    const lon = parseFloat(elements.inputLon.value);
    const tz = elements.selectTimezone.value;
    const latErr = validateLatitude(lat);
    const lonErr = validateLongitude(lon);
    const tzErr = validateTimezone(tz);
    if (latErr) return showToast(latErr, 'error');
    if (lonErr) return showToast(lonErr, 'error');
    if (tzErr) return showToast(tzErr, 'error');
    state.lat = lat;
    state.lon = lon;
    state.timezone = tz;
    recomputeAndRender();
    showToast('Location updated', 'success');
  });

  elements.sliderNorthAngle.addEventListener('input', (e) => {
    const angle = parseInt(e.target.value, 10);
    const err = validateNorthAngle(angle);
    if (err) return;
    state.northAngle = angle;
    elements.valNorthAngle.textContent = `${angle}°`;
    recomputeAndRender();
  });

  elements.btnSavePlot.addEventListener('click', () => {
    const newCorners = updateCornersFromInputs();
    const validation = validateCorners(newCorners);
    state.validationErrors = validation.errors || {};
    if (validation.valid) {
      state.corners = newCorners;
      renderCornerInputs();
      recomputeAndRender();
      showToast('Plot updated', 'success');
    } else {
      renderCornerInputs();
      showToast('Invalid plot - fix errors and try again', 'error');
    }
  });

  elements.btnResetPlot.addEventListener('click', () => {
    const defaultVal = state.units === 'feet' ? 10 : 3.048;
    state.corners = {
      A: { x: 0, y: 0 },
      B: { x: defaultVal, y: 0 },
      C: { x: defaultVal, y: defaultVal },
      D: { x: 0, y: defaultVal }
    };
    state.validationErrors = {};
    renderCornerInputs();
    recomputeAndRender();
    showToast('Plot reset to defaults', 'info');
  });

  elements.unitRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const newUnits = e.target.value;
      state = convertStateUnits(state, newUnits);
      renderCornerInputs();
      renderObjectList();
      initializeUIFromState();
      recomputeAndRender();
      showToast(`Units changed to ${newUnits}`, 'info', 2000);
    });
  });

  elements.selectObjType.addEventListener('change', renderObjectForm);

  elements.btnAddObject.addEventListener('click', (e) => {
    e.preventDefault();
    addOrUpdateObject();
  });

  elements.btnCancelEdit.addEventListener('click', (e) => {
    e.preventDefault();
    resetObjectForm();
  });

  elements.objectList.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const objectItem = actionBtn.closest('.object-item');
    const id = parseInt(objectItem.dataset.objectId, 10);
    if (action === 'toggle-visibility') toggleObjectVisibility(id);
    else if (action === 'edit') startEditingObject(id);
    else if (action === 'delete') deleteObject(id);
  });

  elements.objectList.addEventListener('dblclick', (e) => {
    const objectItem = e.target.closest('.object-item');
    if (!objectItem) return;
    const id = parseInt(objectItem.dataset.objectId, 10);
    startEditingObject(id);
  });

  elements.selectMonth.addEventListener('change', (e) => {
    state.month = parseInt(e.target.value, 10);
    recomputeAndRender();
  });

  elements.sweepModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.sweepMode = e.target.value === 'sweep';
      recomputeAndRender();
    });
  });

  elements.sliderTime.addEventListener('input', (e) => {
    state.time = parseInt(e.target.value, 10);
    elements.valTime.textContent = formatTimeDisplay(state.time);
    if (!state.sweepMode) recomputeAndRender();
  });

  elements.btnDownloadPng.addEventListener('click', async () => {
    try {
      await downloadPlotPng(elements.plotDiv, `shadow-simulation-${state.month}-21`);
      showToast('PNG downloaded', 'success');
    } catch {
      showToast('Failed to download PNG', 'error');
    }
  });

  elements.btnExport.addEventListener('click', () => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'shadow-track-project.json';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Project exported', 'success');
  });

  elements.btnImport.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const loaded = JSON.parse(evt.target.result);
          state = { ...defaultState, ...loaded };
          objectIdCounter = Math.max(...state.objects.map(o => o.id), 0) + 1;
          initializeUIFromState();
          recomputeAndRender();
          showToast('Project imported', 'success');
        } catch {
          showToast('Invalid project file', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });

  elements.btnShare.addEventListener('click', () => {
    saveStateToHash();
    navigator.clipboard.writeText(window.location.href)
      .then(() => showToast('Shareable link copied to clipboard', 'success'))
      .catch(() => showToast('Failed to copy link', 'error'));
  });

  elements.btnToggleTheme.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    elements.btnToggleTheme.textContent = state.theme === 'dark' ? '🌞' : '🌓';
    recomputeAndRender();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') {
      state.time = Math.max(360, state.time - 30);
      elements.sliderTime.value = state.time;
      elements.valTime.textContent = formatTimeDisplay(state.time);
      if (!state.sweepMode) recomputeAndRender();
    } else if (e.key === 'ArrowRight') {
      state.time = Math.min(1140, state.time + 30);
      elements.sliderTime.value = state.time;
      elements.valTime.textContent = formatTimeDisplay(state.time);
      if (!state.sweepMode) recomputeAndRender();
    } else if (e.key === 'ArrowUp') {
      state.month = state.month % 12 + 1;
      elements.selectMonth.value = state.month;
      recomputeAndRender();
    } else if (e.key === 'ArrowDown') {
      state.month = state.month === 1 ? 12 : state.month - 1;
      elements.selectMonth.value = state.month;
      recomputeAndRender();
    } else if (e.key === 'Delete' && selectedObjectId) {
      deleteObject(selectedObjectId);
    } else if (e.key.toLowerCase() === 'e' && selectedObjectId) {
      startEditingObject(selectedObjectId);
    }
  });

  window.addEventListener('resize', debounce(() => {
    if (plotInitialized) Plotly.Plots.resize(elements.plotDiv);
    if (window.innerWidth > 768) closeSidebar();
  }, 200));
}

function initializeUIFromState() {
  document.documentElement.setAttribute('data-theme', state.theme);
  elements.btnToggleTheme.textContent = state.theme === 'dark' ? '🌞' : '🌓';
  elements.inputLat.value = state.lat;
  elements.inputLon.value = state.lon;
  elements.selectTimezone.value = state.timezone;
  elements.sliderNorthAngle.value = state.northAngle;
  elements.valNorthAngle.textContent = `${state.northAngle}°`;
  elements.unitRadios.forEach(radio => {
    radio.checked = radio.value === state.units;
  });
  renderCornerInputs();
  renderObjectList();
  elements.selectMonth.value = state.month;
  elements.sweepModeRadios.forEach(radio => {
    radio.checked = radio.value === (state.sweepMode ? 'sweep' : 'single');
  });
  elements.sliderTime.value = state.time;
  elements.valTime.textContent = formatTimeDisplay(state.time);
  resetObjectForm();
}

function init() {
  loadStateFromHash();
  populateTimezones();
  populateMonths();
  initializeUIFromState();
  bindEvents();
  recomputeAndRender();
  showToast('Shadow Track ready', 'success', 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
