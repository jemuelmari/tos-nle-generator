/* =====================================================
   TOS + NLE Question Generator — App Logic  (v1.1.0)
   ===================================================== */

/* --------------------------------------------------
   SECTION 0 — CONSTANTS & STATE
-------------------------------------------------- */

const APP_VERSION = '1.1.0';

const BLOOM_LEVELS = [
  { key: 'Remembering',   order: 1, category: 'lower',  default: 10 },
  { key: 'Understanding', order: 2, category: 'lower',  default: 10 },
  { key: 'Applying',      order: 3, category: 'lower',  default: 10 },
  { key: 'Analyzing',     order: 4, category: 'higher', default: 25 },
  { key: 'Evaluating',    order: 5, category: 'higher', default: 25 },
  { key: 'Creating',      order: 6, category: 'higher', default: 20 }
];

const state = {
  subject: '',
  term: 'MIDTERM',
  totalHours: 12,
  totalItems: 50,
  institution: '',
  examTitle: '',
  coverage: [],
  bloom: {},
  signatories: {
    prepared: '',
    reviewed1: '',
    reviewed2: '',
    reviewed3: '',
    approved: ''
  },
  tos: null,
  questions: [],
  ai: { enabled: false, provider: 'gemini', key: '', model: '' },
  chedCompetencies: null,
  nleBlueprint: null,
  bloomTemplates: null,
  aiGeneration: { running: false, cancelled: false, current: 0, total: 0 }
};

let coverageIdCounter = 1;

/* --------------------------------------------------
   SECTION 1 — UTILITIES
-------------------------------------------------- */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function uid() {
  return 'id_' + Math.random().toString(36).slice(2, 9);
}

function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  saveAs(blob, filename);
}

function sanitizeFilename(s) {
  return (s || 'project').replace(/[^a-z0-9\-_.]+/gi, '_').slice(0, 80);
}

function refreshIcons() {
  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const icon = theme === 'dark' ? 'sun' : 'moon';
  btn.innerHTML = `<i data-lucide="${icon}"></i>`;
  refreshIcons();
}

/* --------------------------------------------------
   SECTION 1A — TOASTS (Feature C)
-------------------------------------------------- */

function showToast(type, title, message = '', duration = 4000) {
  const container = $('#toast-container');
  if (!container) return;

  const icons = {
    success: 'check-circle-2',
    error:   'x-circle',
    warning: 'alert-triangle',
    info:    'info'
  };

  const toast = el('div', { class: 'toast toast-' + type });
  toast.appendChild(el('div', { class: 'toast-icon' },
    el('i', { 'data-lucide': icons[type] || 'info' })
  ));
  const body = el('div', { class: 'toast-body' });
  body.appendChild(el('div', { class: 'toast-title' }, title));
  if (message) body.appendChild(el('div', { class: 'toast-msg' }, message));
  toast.appendChild(body);

  const closeBtn = el('button', { class: 'toast-close', 'aria-label': 'Close' },
    el('i', { 'data-lucide': 'x' })
  );
  closeBtn.addEventListener('click', () => dismiss());
  toast.appendChild(closeBtn);

  container.appendChild(toast);
  refreshIcons();

  const timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }

  return { dismiss };
}

/* --------------------------------------------------
   SECTION 1B — DASHBOARD (Feature D)
-------------------------------------------------- */

function updateDashboard() {
  const subj = $('#dash-subject');
  const term = $('#dash-term');
  const items = $('#dash-items');
  const hours = $('#dash-hours');
  const status = $('#dash-status');
  const statusIcon = $('#dash-status-icon');

  if (subj) subj.textContent = state.subject || 'Untitled Subject';
  if (term) term.textContent = state.term === 'FINAL' ? 'Final Term' : 'Midterm';
  if (items) items.textContent = String(state.totalItems || 0);
  if (hours) hours.textContent = String(state.totalHours || 0);

  let lower = 0, higher = 0;
  BLOOM_LEVELS.forEach(b => {
    const v = +state.bloom[b.key] || 0;
    if (b.category === 'lower') lower += v;
    else higher += v;
  });

  const lowerBar = $('#dash-bloom-lower');
  const higherBar = $('#dash-bloom-higher');
  const lowerLbl = $('#dash-bloom-lower-label');
  const higherLbl = $('#dash-bloom-higher-label');

  if (lowerBar && lower > 0) {
    lowerBar.style.width = lower + '%';
    lowerLbl.textContent = lower + '%';
  } else if (lowerBar) {
    lowerBar.style.width = '0%';
    lowerLbl.textContent = '';
  }
  if (higherBar && higher > 0) {
    higherBar.style.width = higher + '%';
    higherLbl.textContent = higher + '%';
  } else if (higherBar) {
    higherBar.style.width = '0%';
    higherLbl.textContent = '';
  }

  const total = lower + higher;
  let level = 'ok';
  let label = 'Ready';
  let icon = 'shield-check';

  if (!state.subject || !state.totalItems) {
    level = 'warn';
    label = 'Incomplete';
    icon = 'alert-triangle';
  } else if (total !== 100) {
    level = 'err';
    label = 'Bloom ≠ 100%';
    icon = 'alert-octagon';
  } else if (lower > 30 || higher < 70) {
    level = 'warn';
    label = 'Off 30/70';
    icon = 'alert-triangle';
  } else {
    label = 'Valid 30/70';
    icon = 'shield-check';
  }

  if (status) {
    status.textContent = label;
    status.className = 'dash-value dash-' + level;
  }
  if (statusIcon) {
    statusIcon.innerHTML = `<i data-lucide="${icon}"></i>`;
  }

  refreshIcons();
}

/* --------------------------------------------------
   SECTION 2 — INITIALIZATION
-------------------------------------------------- */

async function loadDataFiles() {
  try {
    const [ched, nle, bloom] = await Promise.all([
      fetch('data/ched-competencies.json').then(r => r.json()),
      fetch('data/nle-blueprint.json').then(r => r.json()),
      fetch('data/bloom-templates.json').then(r => r.json())
    ]);
    state.chedCompetencies = ched;
    state.nleBlueprint = nle;
    state.bloomTemplates = bloom;
    console.log('[data] loaded');
  } catch (err) {
    console.warn('[data] failed to load (file:// mode?)', err);
    state.chedCompetencies = { core_competency_areas: [] };
    state.nleBlueprint = { exam_parts: [] };
    state.bloomTemplates = { levels: {} };
  }
}

function loadAISettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('tos_ai') || '{}');
    state.ai = { ...state.ai, ...saved };
  } catch { /* noop */ }
}

function saveAISettings() {
  localStorage.setItem('tos_ai', JSON.stringify(state.ai));
}

function loadProjectFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('tos_project') || 'null');
    if (saved) restoreProject(saved);
  } catch { /* noop */ }
}

function persistProject() {
  localStorage.setItem('tos_project', JSON.stringify(serializeProject()));
}

function loadTheme() {
  const saved = localStorage.getItem('tos_theme') || 'light';
  document.body.dataset.theme = saved;
  updateThemeIcon(saved);
}

function bindThemeToggle() {
  const btn = $('#btn-theme');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.body.dataset.theme;
    const next = current === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = next;
    localStorage.setItem('tos_theme', next);
    updateThemeIcon(next);
  });
}

/* --------------------------------------------------
   SECTION 2A — WELCOME MODAL (Feature B)
-------------------------------------------------- */

function showWelcome(force = false) {
  const hide = localStorage.getItem('tos_hide_welcome') === '1';
  if (hide && !force) return;

  const modal = $('#welcome-modal');
  if (!modal) return;
  modal.hidden = false;
  refreshIcons();

  const close = () => { modal.hidden = true; };

  $('#btn-close-welcome').onclick = close;
  $('#btn-start-welcome').onclick = () => {
    if ($('#chk-hide-welcome').checked) {
      localStorage.setItem('tos_hide_welcome', '1');
    }
    close();
  };
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
}

/* --------------------------------------------------
   SECTION 2B — AI PROGRESS OVERLAY (Feature A)
-------------------------------------------------- */

function showProgress(current, total, sub = 'Generating…') {
  const overlay = $('#progress-overlay');
  const pctEl = $('#progress-percent');
  const subEl = $('#progress-sub');
  const detEl = $('#progress-detail');
  const circle = $('#progress-circle');
  if (!overlay) return;

  overlay.hidden = false;
  const p = total > 0 ? Math.round((current / total) * 100) : 0;

  if (pctEl) pctEl.textContent = p + '%';
  if (subEl) subEl.textContent = sub;
  if (detEl) detEl.textContent = `Item ${current} of ${total}`;

  if (circle) {
    const circumference = 2 * Math.PI * 20;
    const offset = circumference - (p / 100) * circumference;
    circle.style.strokeDasharray = String(circumference);
    circle.style.strokeDashoffset = String(offset);
  }
}

function hideProgress() {
  const overlay = $('#progress-overlay');
  if (overlay) overlay.hidden = true;
}

/* --------------------------------------------------
   SECTION 3 — COVERAGE AREA EDITOR
-------------------------------------------------- */

function newCoverage(title = '') {
  return { id: 'c' + (coverageIdCounter++), title, hours: 3, items: 0 };
}

function ensureCoverage() {
  if (state.coverage.length === 0) {
    state.coverage.push(newCoverage('Coverage Area I'));
  }
}

function recomputeCoverageItems() {
  const totalHours = state.coverage.reduce((s, c) => s + (+c.hours || 0), 0);
  const totalItems = state.totalItems;
  if (!totalHours || !totalItems) return;

  let remaining = totalItems;
  state.coverage.forEach((c, idx) => {
    if (idx === state.coverage.length - 1) {
      c.items = remaining;
    } else {
      c.items = Math.round(((+c.hours || 0) / totalHours) * totalItems);
      remaining -= c.items;
    }
  });
}

function renderCoverageTable() {
  const tbody = $('#coverage-body');
  tbody.innerHTML = '';
  const totalHours = state.coverage.reduce((s, c) => s + (+c.hours || 0), 0);

  state.coverage.forEach((c, i) => {
    const row = el('tr');
    row.appendChild(el('td', {}, String(i + 1)));
    row.appendChild(el('td', {},
      el('input', {
        type: 'text',
        value: c.title,
        placeholder: 'e.g., Discussion of the Concepts...',
        oninput: (e) => { c.title = e.target.value; persistProject(); }
      })
    ));
    row.appendChild(el('td', {},
      el('input', {
        type: 'number', min: '0', value: c.hours,
        oninput: (e) => {
          c.hours = +e.target.value || 0;
          recomputeCoverageItems();
          renderCoverageTable();
          recomputeTOS();
          persistProject();
        }
      })
    ));
    row.appendChild(el('td', { class: 'ro' }, pct(c.hours, totalHours) + '%'));
    row.appendChild(el('td', { class: 'ro' }, String(c.items || 0)));
    row.appendChild(el('td', {},
      el('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: () => {
          state.coverage.splice(i, 1);
          ensureCoverage();
          recomputeCoverageItems();
          renderCoverageTable();
          recomputeTOS();
          persistProject();
        }
      }, '✕')
    ));
    tbody.appendChild(row);
  });

  const tr = el('tr', { style: 'background:var(--surface-2);font-weight:700' });
  tr.appendChild(el('td', {}, ''));
  tr.appendChild(el('td', {}, 'TOTAL'));
  tr.appendChild(el('td', { class: 'ro' }, String(totalHours)));
  tr.appendChild(el('td', { class: 'ro' }, totalHours ? '100%' : '0%'));
  tr.appendChild(el('td', { class: 'ro' }, String(state.totalItems)));
  tr.appendChild(el('td', {}, ''));
  tbody.appendChild(tr);
  refreshIcons();
}

/* --------------------------------------------------
   SECTION 4 — BLOOM SLIDERS
-------------------------------------------------- */

function initBloomDefaults() {
  if (Object.keys(state.bloom).length === 0) {
    BLOOM_LEVELS.forEach(b => state.bloom[b.key] = b.default);
  }
}

function renderBloomSliders() {
  const wrap = $('#bloom-sliders');
  wrap.innerHTML = '';

  BLOOM_LEVELS.forEach(b => {
    const row = el('div', { class: 'bloom-row' });
    row.appendChild(el('div', { class: 'bloom-label' }, [
      document.createTextNode(b.key),
      el('span', { class: 'cat ' + b.category }, b.category)
    ]));
    row.appendChild(el('input', {
      type: 'range', min: '0', max: '100', step: '1',
      value: state.bloom[b.key],
      oninput: (e) => {
        state.bloom[b.key] = +e.target.value;
        updateBloomSummary();
        updateDashboard();
        recomputeTOS();
        persistProject();
      }
    }));
    const valSpan = el('div', { class: 'bloom-value' }, state.bloom[b.key] + '%');
    valSpan.dataset.key = b.key;
    row.appendChild(valSpan);
    wrap.appendChild(row);
  });
  updateBloomSummary();
  updateDashboard();
  refreshIcons();
}

function updateBloomSummary() {
  let lower = 0, higher = 0, total = 0;
  BLOOM_LEVELS.forEach(b => {
    const v = +state.bloom[b.key] || 0;
    total += v;
    if (b.category === 'lower') lower += v;
    else higher += v;
  });

  $('#bar-lower').style.width  = Math.min(lower, 100) + '%';
  $('#bar-higher').style.width = Math.min(higher, 100) + '%';
  $('#pct-lower').textContent  = lower + '%';
  $('#pct-higher').textContent = higher + '%';

  $$('.bloom-value').forEach(span => {
    span.textContent = (state.bloom[span.dataset.key] || 0) + '%';
  });

  const totalEl = $('#bloom-total');
  totalEl.className = 'alert ' + (total === 100 ? 'alert-info' : 'alert-danger');
  totalEl.textContent = `Total: ${total}%` + (total === 100 ? '' : ' — must equal 100%');

  const warn = $('#bloom-warning');
  const issues = [];
  if (total !== 100) issues.push(`Sliders total ${total}% — adjust to 100%.`);
  if (lower > 30) issues.push(`Lower-order is ${lower}% (exceeds 30% threshold).`);
  if (higher < 70) issues.push(`Higher-order is ${higher}% (below 70% target).`);
  const creating = +state.bloom['Creating'] || 0;
  if (creating === 0) issues.push(`Creating is 0% — consider adding at least one Creating-level item.`);

  if (issues.length) {
    warn.hidden = false;
    warn.className = 'alert alert-warning';
    warn.innerHTML = '<strong>⚠️ Notes:</strong><ul style="margin:6px 0 0 18px">' +
      issues.map(i => `<li>${i}</li>`).join('') + '</ul>';
  } else {
    warn.hidden = true;
  }
}

/* --------------------------------------------------
   SECTION 5 — TOS COMPUTATION
-------------------------------------------------- */

function computeBloomItemCounts() {
  const counts = {};
  let assigned = 0;
  BLOOM_LEVELS.forEach((b, idx) => {
    if (idx === BLOOM_LEVELS.length - 1) {
      counts[b.key] = state.totalItems - assigned;
    } else {
      counts[b.key] = Math.round((state.bloom[b.key] / 100) * state.totalItems);
      assigned += counts[b.key];
    }
  });
  return counts;
}

function assignItemNumbersToBloom(bloomCounts) {
  const ranges = {};
  let n = 1;
  BLOOM_LEVELS.forEach(b => {
    const c = bloomCounts[b.key] || 0;
    ranges[b.key] = c > 0 ? [n, n + c - 1] : [];
    n += c;
  });
  return ranges;
}

function computeTOS() {
  ensureCoverage();
  recomputeCoverageItems();

  const totalHours = state.coverage.reduce((s, c) => s + (+c.hours || 0), 0);
  const bloomCounts = computeBloomItemCounts();
  const bloomRanges = assignItemNumbersToBloom(bloomCounts);

  const tos = {
    subject: state.subject,
    term: state.term,
    totalHours,
    totalItems: state.totalItems,
    coverage: state.coverage.map(c => ({
      ...c,
      percentHours: pct(c.hours, totalHours),
      percentItems: pct(c.items, state.totalItems)
    })),
    bloom: BLOOM_LEVELS.map(b => ({
      key: b.key,
      category: b.category,
      percent: state.bloom[b.key],
      itemCount: bloomCounts[b.key],
      itemRange: bloomRanges[b.key]
    })),
    lowerPercent: BLOOM_LEVELS
      .filter(b => b.category === 'lower')
      .reduce((s, b) => s + (+state.bloom[b.key] || 0), 0),
    higherPercent: BLOOM_LEVELS
      .filter(b => b.category === 'higher')
      .reduce((s, b) => s + (+state.bloom[b.key] || 0), 0)
  };

  state.tos = tos;
  return tos;
}

function recomputeTOS() {
  computeTOS();
  renderTOS();
}

/* --------------------------------------------------
   SECTION 6 — TOS RENDER
-------------------------------------------------- */

function renderTOS() {
  const container = $('#tos-container');
  if (!state.tos) { container.innerHTML = ''; return; }
  const t = state.tos;

  // -------- Pre-compute item number assignments (Bloom × Coverage) --------
  // Every item number (1..N) belongs to EXACTLY one (Bloom, Coverage) cell.
  // Bloom ranges: e.g., Remembering 1-5, Understanding 6-10, ...
  // Within each Bloom range, distribute sequentially across coverage areas.

  const totalCovItems = t.coverage.reduce((s, x) => s + (x.items || 0), 0);
  const assignment = {}; // assignment[bloomKey][covIndex] = [numbers]

  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    const range = bInfo.itemRange;
    assignment[b.key] = {};
    if (!range || range.length === 0) {
      t.coverage.forEach((_, ci) => assignment[b.key][ci] = []);
      return;
    }

    const totalBloomItems = range[1] - range[0] + 1;
    let cursor = range[0];

    // Distribute items across coverage areas proportionally,
    // ensuring no gaps and no overlaps.
    t.coverage.forEach((c, ci) => {
      // Calculate how many items this coverage gets from this Bloom level
      const covShare = totalCovItems > 0 ? (c.items || 0) / totalCovItems : 0;
      let count;

      if (ci === t.coverage.length - 1) {
        // Last coverage area takes the remainder — ensures full coverage
        count = (range[1] - cursor) + 1;
      } else {
        count = Math.round(covShare * totalBloomItems);
        // Don't exceed remaining slots
        const remaining = (range[1] - cursor) + 1;
        const remainingCov = t.coverage.length - ci - 1;
        // Keep at least 0 for each remaining coverage area
        if (count > remaining - remainingCov) {
          count = Math.max(0, remaining - remainingCov);
        }
      }

      const nums = [];
      for (let i = 0; i < count; i++) {
        nums.push(cursor);
        cursor++;
      }
      assignment[b.key][ci] = nums;
    });
  });

  // -------- Build the table --------
  const table = el('table');
  const thead = el('thead');
  const r1 = el('tr');
  r1.appendChild(el('th', { rowspan: '2' }, 'Coverage'));
  r1.appendChild(el('th', { rowspan: '2' }, 'No. of Hours'));
  r1.appendChild(el('th', { rowspan: '2' }, '% over Total Hours'));
  r1.appendChild(el('th', { colspan: '6' }, 'Levels of Thinking'));
  r1.appendChild(el('th', { rowspan: '2' }, 'Total No. of Items'));
  r1.appendChild(el('th', { rowspan: '2' }, '% over Total Items'));
  thead.appendChild(r1);

  const r2 = el('tr');
  BLOOM_LEVELS.forEach(b => r2.appendChild(el('th', {}, b.key)));
  thead.appendChild(r2);
  table.appendChild(thead);

  const tbody = el('tbody');

  // Coverage rows
  t.coverage.forEach((c, ci) => {
    const row = el('tr');
    row.appendChild(el('td', { class: 'left' }, c.title));
    row.appendChild(el('td', {}, String(c.hours)));
    row.appendChild(el('td', {}, c.percentHours + '%'));

    BLOOM_LEVELS.forEach(b => {
      const nums = assignment[b.key][ci] || [];
      row.appendChild(el('td', {}, nums.length ? nums.join(', ') : '—'));
    });

    row.appendChild(el('td', {}, String(c.items)));
    row.appendChild(el('td', {}, c.percentItems + '%'));
    tbody.appendChild(row);
  });

  // Item Placement row
  const placementRow = el('tr', { class: 'total-row' });
  placementRow.appendChild(el('td', { class: 'left' }, 'Item Placement'));
  placementRow.appendChild(el('td', {}, ''));
  placementRow.appendChild(el('td', {}, ''));
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    const r = bInfo.itemRange;
    placementRow.appendChild(el('td', {}, r && r.length ? `${r[0]}–${r[1]}` : '—'));
  });
  placementRow.appendChild(el('td', {}, String(t.totalItems)));
  placementRow.appendChild(el('td', {}, '100%'));
  tbody.appendChild(placementRow);

  // TOTAL row
  const totalRow = el('tr', { class: 'total-row' });
  totalRow.appendChild(el('td', { class: 'left' }, 'TOTAL'));
  totalRow.appendChild(el('td', {}, String(t.totalHours)));
  totalRow.appendChild(el('td', {}, '100%'));
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    totalRow.appendChild(el('td', {}, String(bInfo.itemCount)));
  });
  totalRow.appendChild(el('td', {}, String(t.totalItems)));
  totalRow.appendChild(el('td', {}, '100%'));
  tbody.appendChild(totalRow);

  // Percentage row
  const pctRow = el('tr', { class: 'pct-row' });
  pctRow.appendChild(el('td', { class: 'left' }, 'Percentage'));
  pctRow.appendChild(el('td', {}, ''));
  pctRow.appendChild(el('td', {}, ''));
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    pctRow.appendChild(el('td', {}, bInfo.percent + '%'));
  });
  pctRow.appendChild(el('td', {}, ''));
  pctRow.appendChild(el('td', {}, ''));
  tbody.appendChild(pctRow);

  // Summary row
  const summaryRow = el('tr');
  summaryRow.appendChild(el('td', { class: 'left', colspan: '3' },
    `Lower-Order: ${t.lowerPercent}%`));
  summaryRow.appendChild(el('td', { colspan: '6' },
    `Higher-Order: ${t.higherPercent}%`));
  summaryRow.appendChild(el('td', {}, ''));
  summaryRow.appendChild(el('td', {}, ''));
  tbody.appendChild(summaryRow);

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);

  // Signatories
  const sigs = el('div', { class: 'signatories' });
  const addSig = (label, value) => {
    if (!value) return;
    const [name, role] = value.split('—').map(s => (s || '').trim());
    sigs.appendChild(el('div', { class: 'sig-block' }, [
      el('div', { class: 'sig-label' }, label),
      el('div', { class: 'sig-name' }, name || ''),
      role ? el('div', { class: 'sig-role' }, role) : null
    ]));
  };
  addSig('Prepared by', state.signatories.prepared);
  addSig('Reviewed by', state.signatories.reviewed1);
  addSig('Reviewed by', state.signatories.reviewed2);
  addSig('Reviewed by', state.signatories.reviewed3);
  addSig('Approved by', state.signatories.approved);
  container.appendChild(sigs);

  // Warnings
  const warnBox = $('#tos-warnings');
  warnBox.innerHTML = '';
  const issues = [];
  if (t.lowerPercent > 30) issues.push(`Lower-order is ${t.lowerPercent}% (>30%).`);
  if (t.higherPercent < 70) issues.push(`Higher-order is ${t.higherPercent}% (<70%).`);
  if (issues.length) {
    warnBox.appendChild(el('div', { class: 'alert alert-warning' },
      '⚠️ ' + issues.join(' ')));
  } else {
    warnBox.appendChild(el('div', { class: 'alert alert-success' },
      '✅ TOS validated: 30/70 rule satisfied.'));
  }
  refreshIcons();
  updateDashboard();
}

/* --------------------------------------------------
   SECTION 7 — QUESTION GENERATION
-------------------------------------------------- */

function buildEmptyQuestions() {
  const t = state.tos || computeTOS();
  const list = [];
  let n = 1;
  t.bloom.forEach(b => {
    for (let i = 0; i < b.itemCount; i++) {
      const covIdx = pickCoverageForItem(n, t);
      list.push({
        id: uid(),
        itemNo: n,
        bloom: b.key,
        category: b.category,
        coverageIndex: covIdx,
        coverageTitle: t.coverage[covIdx] ? t.coverage[covIdx].title : '',
        style: b.category === 'lower' ? 'A' : 'B',
        chedCompetency: '',
        nleBlueprint: '',
        stem: '',
        options: { A: '', B: '', C: '', D: '' },
        answer: 'A',
        rationale: '',
        status: 'empty'
      });
      n++;
    }
  });
  state.questions = list;
}

function pickCoverageForItem(itemNo, t) {
  let acc = 0;
  for (let i = 0; i < t.coverage.length; i++) {
    acc += t.coverage[i].items;
    if (itemNo <= acc) return i;
  }
  return t.coverage.length - 1;
}

function renderQuestions() {
  const wrap = $('#questions-container');
  wrap.innerHTML = '';
  if (state.questions.length === 0) {
    wrap.appendChild(el('div', { class: 'alert alert-info' },
      'No question slots yet. Click "Recompute TOS" first, then "Generate All".'));
    return;
  }
  state.questions.forEach((q, idx) => {
    wrap.appendChild(renderQuestionCard(q, idx));
  });
  refreshIcons();
}

function renderQuestionCard(q, idx) {
  const card = el('div', {
    class: 'q-card ' + (q.status === 'error' ? 'error'
                      : q.status === 'generating' ? 'generating'
                      : q.status === 'empty' ? 'empty' : '')
  });

  const meta = el('div', { class: 'q-meta' });
  meta.appendChild(el('span', { class: 'tag tag-item' }, 'Item ' + q.itemNo));
  meta.appendChild(el('span', { class: 'tag tag-bloom' }, q.bloom));
  meta.appendChild(el('span', {
    class: 'tag ' + (q.category === 'higher' ? 'tag-higher' : 'tag-lower')
  }, q.category === 'higher' ? 'Higher-Order' : 'Lower-Order'));
  meta.appendChild(el('span', { class: 'tag' }, 'Style ' + q.style));
  if (q.coverageTitle) meta.appendChild(el('span', { class: 'tag tag-coverage' }, q.coverageTitle));
  card.appendChild(meta);

  card.appendChild(el('div', { class: 'q-stem', contenteditable: 'true',
    oninput: (e) => { q.stem = e.target.textContent; persistProject(); }
  }, q.stem || '[Stem not yet generated]'));

  const opts = el('div', { class: 'q-options' });
  ['A', 'B', 'C', 'D'].forEach(letter => {
    const opt = el('div', { class: 'q-option' });
    opt.appendChild(el('span', { class: 'letter' }, letter + '.'));
    opt.appendChild(el('span', {
      contenteditable: 'true',
      oninput: (e) => { q.options[letter] = e.target.textContent; persistProject(); }
    }, q.options[letter] || ''));
    opts.appendChild(opt);
  });
  card.appendChild(opts);

  const ans = el('div', { class: 'q-answer-row' });
  ans.appendChild(el('label', {}, 'Answer'));
  const ansSel = el('select', {
    onchange: (e) => { q.answer = e.target.value; persistProject(); }
  });
  ['A', 'B', 'C', 'D'].forEach(L => {
    const o = el('option', { value: L }, L);
    if (q.answer === L) o.selected = true;
    ansSel.appendChild(o);
  });
  ans.appendChild(ansSel);

  ans.appendChild(el('label', {}, 'CHED'));
  const chedSel = el('select', {
    onchange: (e) => { q.chedCompetency = e.target.value; persistProject(); }
  });
  chedSel.appendChild(el('option', { value: '' }, '— select —'));
  (state.chedCompetencies.core_competency_areas || []).forEach(c => {
    const val = c.code + ' — ' + c.name;
    const o = el('option', { value: val }, val);
    if (q.chedCompetency === val) o.selected = true;
    chedSel.appendChild(o);
  });
  ans.appendChild(chedSel);

  ans.appendChild(el('label', {}, 'NLE'));
  const nleSel = el('select', {
    onchange: (e) => { q.nleBlueprint = e.target.value; persistProject(); }
  });
  nleSel.appendChild(el('option', { value: '' }, '— select —'));
  (state.nleBlueprint.exam_parts || []).forEach(p => {
    const val = p.code + ' — ' + p.name;
    const o = el('option', { value: val }, val);
    if (q.nleBlueprint === val) o.selected = true;
    nleSel.appendChild(o);
  });
  ans.appendChild(nleSel);
  card.appendChild(ans);

  const rat = el('div', { class: 'q-rationale' });
  rat.appendChild(el('div', { class: 'q-rationale-label' }, [
    el('i', { 'data-lucide': 'lightbulb' }), document.createTextNode(' Rationale')
  ]));
  rat.appendChild(el('div', {
    contenteditable: 'true',
    oninput: (e) => { q.rationale = e.target.textContent; persistProject(); }
  }, q.rationale || '[No rationale yet]'));
  card.appendChild(rat);

  const actions = el('div', { class: 'q-card-actions' });
  actions.appendChild(el('button', {
    class: 'btn btn-sm btn-ghost',
    onclick: () => generateOneTemplate(q, idx)
  }, '⚡ Regenerate (Template)'));
  if (state.ai.enabled) {
    actions.appendChild(el('button', {
      class: 'btn btn-sm btn-secondary',
      onclick: () => generateOneAI(q, idx)
    }, '🤖 Regenerate (AI)'));
  }
  card.appendChild(actions);

  return card;
}

/* --------------------------------------------------
   SECTION 7A — TEMPLATE GENERATION
-------------------------------------------------- */

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fillPlaceholders(template, q) {
  const cov = q.coverageTitle || 'the topic';
  const replacements = {
    '{age}': String(20 + Math.floor(Math.random() * 50)),
    '{structure}': cov, '{term}': cov, '{definition}': cov,
    '{description}': cov, '{concept}': cov, '{purpose}': 'assessment',
    '{function}': 'normal function', '{symptom}': 'a related complaint',
    '{finding}': 'an assessment finding', '{condition}': cov,
    '{procedure}': 'the nursing assessment', '{tool}': 'the appropriate instrument',
    '{system}': cov, '{structure|function}': cov, '{structure|process}': cov,
    '{tool|structure|term}': cov, '{normal|abnormal}': 'normal',
    '{care plan|teaching plan|discharge plan}': 'care plan',
    '{nursing intervention|teaching strategy}': 'nursing intervention',
    '{care plan|community program}': 'care plan',
    '{population}': 'the target population', '{barrier}': 'a learning barrier',
    '{chief_complaint}': 'a related complaint', '{complaint}': 'a related complaint',
    '{data}': 'assessment data', '{findings}': 'assessment findings',
    '{age_group}': 'adult', '{phenomenon}': 'the observed finding', '{topic}': cov
  };
  let out = template;
  for (const [k, v] of Object.entries(replacements)) out = out.split(k).join(v);
  return out.replace(/\{[^}]+\}/g, cov);
}

function generateOneTemplate(q, idx) {
  const tpls = state.bloomTemplates.levels[q.bloom]?.stem_templates || [];
  q.stem = tpls.length ? fillPlaceholders(pick(tpls), q) : '[No template available]';

  const cov = q.coverageTitle || 'the topic';
  if (q.category === 'lower') {
    q.options = { A: 'Unrelated option 1', B: cov + ' (correct)', C: 'Unrelated option 2', D: 'Unrelated option 3' };
    q.answer = 'B';
  } else {
    q.options = {
      A: 'Partial action — misses a key step',
      B: 'Incorrect or unsafe action',
      C: 'Correct, prioritized nursing action',
      D: 'Delayed or inappropriate action'
    };
    q.answer = 'C';
  }
  q.rationale =
    `[Template-generated] Correct answer: ${q.answer}. ` +
    `This item tests ${q.bloom}-level thinking on "${cov}". Edit to add content-specific details.`;
  q.status = 'done';
  persistProject();
  refreshQuestionCard(idx);
}

/* --------------------------------------------------
   SECTION 7B — AI GENERATION (with progress overlay)
-------------------------------------------------- */

async function generateOneAI(q, idx, silent = false) {
  if (!state.ai.enabled || !state.ai.key) {
    if (!silent) showToast('warning', 'AI not configured', 'Enable AI mode and enter an API key.');
    return false;
  }

  q.status = 'generating';
  refreshQuestionCard(idx);

  const prompt = buildPromptForQuestion(q);

  try {
    let text = '';
    if (state.ai.provider === 'gemini') text = await callGemini(prompt);
    else text = await callOpenAI(prompt);

    const parsed = parseAIResponse(text, q);
    if (parsed) {
      Object.assign(q, parsed);
      q.status = 'done';
      persistProject();
      refreshQuestionCard(idx);
      return true;
    } else {
      q.status = 'error';
      q.rationale = 'AI returned unparseable response.';
      persistProject();
      refreshQuestionCard(idx);
      return false;
    }
  } catch (err) {
    console.error(err);
    q.status = 'error';
    q.rationale = 'AI error: ' + err.message;
    persistProject();
    refreshQuestionCard(idx);
    return false;
  }
}

async function generateAllAI() {
  if (!state.ai.enabled || !state.ai.key) {
    showToast('warning', 'AI not configured', 'Enable AI mode and enter an API key first.');
    return;
  }
  if (state.aiGeneration.running) return;

  const pending = state.questions.filter(q => q.status !== 'done');
  if (pending.length === 0) {
    showToast('info', 'Nothing to generate', 'All items are already generated.');
    return;
  }

  state.aiGeneration = { running: true, cancelled: false, current: 0, total: pending.length };

  showProgress(0, pending.length, 'Starting AI generation…');

  let success = 0;
  for (let i = 0; i < state.questions.length; i++) {
    if (state.aiGeneration.cancelled) break;
    const q = state.questions[i];
    if (q.status === 'done') continue;

    state.aiGeneration.current++;
    showProgress(
      state.aiGeneration.current - 1,
      pending.length,
      `Generating "${q.bloom}" item ${q.itemNo}…`
    );

    const ok = await generateOneAI(q, i, true);
    if (ok) success++;

    showProgress(
      state.aiGeneration.current,
      pending.length,
      `Item ${q.itemNo} complete`
    );
  }

  const wasCancelled = state.aiGeneration.cancelled;
  state.aiGeneration.running = false;
  hideProgress();

  if (wasCancelled) {
    showToast('warning', 'Generation cancelled', `Completed ${success} of ${pending.length} items.`);
  } else {
    showToast('success', 'AI generation complete', `Generated ${success} of ${pending.length} items.`);
  }
}

function bindProgressCancel() {
  const btn = $('#btn-cancel-ai');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.aiGeneration.cancelled = true;
    showToast('info', 'Cancelling…', 'Stopping after current item.');
  });
}

function buildPromptForQuestion(q) {
  const cov = q.coverageTitle || 'the topic';
  return `You are a Philippine nursing licensure exam (NLE) item writer.

Generate ONE multiple-choice question aligned with:
- Subject: ${state.subject}
- Term: ${state.term}
- Coverage area: ${cov}
- Revised Bloom's Taxonomy level: ${q.bloom} (${q.category}-order)
- Question style: ${q.style === 'A' ? 'short recall/understanding' : 'clinical scenario / application'}
- CHED CMO 15 s. 2017 aligned
- PRC BON Res. No. 10 s. 2025 (Enhanced TOS) aligned

Rules:
- Exactly 4 options (A, B, C, D).
- For lower-order: short-phrase options.
- For higher-order: full-sentence options, NLE scenario style.
- No "all of the above" or "none of the above".
- One best answer only.

Return ONLY valid JSON (no prose, no markdown):
{
  "stem": "...",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "answer": "A|B|C|D",
  "rationale": "3-6 sentences.",
  "ched_competency": "CC-XX — Name",
  "nle_blueprint": "NP-X — Name"
}`;
}

async function callGemini(prompt) {
  const model = state.ai.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${state.ai.key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + await res.text());
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(prompt) {
  const model = state.ai.model || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.ai.key
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You output only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error('OpenAI ' + res.status + ': ' + await res.text());
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

function parseAIResponse(text, q) {
  try {
    const clean = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const obj = JSON.parse(clean);
    if (!obj.stem || !obj.options) return null;
    return {
      stem: obj.stem,
      options: {
        A: obj.options.A || '', B: obj.options.B || '',
        C: obj.options.C || '', D: obj.options.D || ''
      },
      answer: (obj.answer || 'A').toUpperCase().slice(0, 1),
      rationale: obj.rationale || '',
      chedCompetency: obj.ched_competency || q.chedCompetency,
      nleBlueprint: obj.nle_blueprint || q.nleBlueprint
    };
  } catch { return null; }
}

function refreshQuestionCard(idx) {
  const wrap = $('#questions-container');
  const oldCard = wrap.children[idx];
  if (oldCard) {
    const newCard = renderQuestionCard(state.questions[idx], idx);
    wrap.replaceChild(newCard, oldCard);
  } else {
    renderQuestions();
  }
  refreshIcons();
}

/* --------------------------------------------------
   SECTION 8 — EXPORT (DOCX)
-------------------------------------------------- */

function makeDocxParagraph(text, opts = {}) {
  const { Paragraph, TextRun, AlignmentType } = docx;
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    heading: opts.heading,
    spacing: { after: opts.after ?? 120 },
    children: [new TextRun({
      text, bold: !!opts.bold, italics: !!opts.italic,
      size: opts.size || 22, font: opts.font || 'Calibri'
    })]
  });
}

async function exportTOSDocx() {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell,
          WidthType, AlignmentType, TextRun } = docx;
  const t = state.tos || computeTOS();

  const headerParas = [
    makeDocxParagraph(state.institution || '', { bold: true, align: AlignmentType.CENTER }),
    makeDocxParagraph('TABLE OF SPECIFICATIONS', { bold: true, size: 28, align: AlignmentType.CENTER }),
    makeDocxParagraph(`${state.subject} — ${state.term === 'MIDTERM' ? 'Midterm' : 'Final Term'}`, {
      italic: true, align: AlignmentType.CENTER
    }),
    new Paragraph({ text: '' })
  ];

  const cell = (text, opts = {}) => new TableCell({
    width: { size: opts.width || 10, type: WidthType.PERCENTAGE },
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.CENTER,
      children: [new TextRun({ text: String(text), bold: !!opts.bold, size: 18 })]
    })]
  });

  const bodyRows = [];

  bodyRows.push(new TableRow({
    children: [
      cell('Coverage', { bold: true, width: 18 }),
      cell('No. of Hours', { bold: true, width: 8 }),
      cell('% over Total Hours', { bold: true, width: 9 }),
      cell('Levels of Thinking', { bold: true, width: 45 }),
      cell('', { width: 5 }), cell('', { width: 5 }),
      cell('', { width: 5 }), cell('', { width: 5 }), cell('', { width: 5 }),
      cell('Total No. of Items', { bold: true, width: 8 }),
      cell('% over Total Items', { bold: true, width: 9 })
    ]
  }));

  bodyRows.push(new TableRow({
    children: [
      cell(''), cell(''), cell(''),
      cell('Remembering', { bold: true }), cell('Understanding', { bold: true }),
      cell('Applying', { bold: true }), cell('Analyzing', { bold: true }),
      cell('Evaluating', { bold: true }), cell('Creating', { bold: true }),
      cell(''), cell('')
    ]
  }));

  t.coverage.forEach((c, ci) => {
    const cells = [];
    cells.push(cell(c.title, { align: AlignmentType.LEFT }));
    cells.push(cell(c.hours));
    cells.push(cell(c.percentHours + '%'));

    BLOOM_LEVELS.forEach(b => {
      const bInfo = t.bloom.find(x => x.key === b.key);
      const range = bInfo.itemRange;
      const totalCovItems = t.coverage.reduce((s, x) => s + x.items, 0);
      const totalBloomItems = range && range.length ? (range[1] - range[0] + 1) : 0;
      if (!totalBloomItems) { cells.push(cell('—')); return; }
      const covShare = c.items / totalCovItems;
      const start = range[0] + Math.round(
        t.coverage.slice(0, ci).reduce((s, x) => s + x.items, 0) / totalCovItems * totalBloomItems
      );
      const count = Math.round(covShare * totalBloomItems);
      if (count <= 0) { cells.push(cell('—')); return; }
      const nums = [];
      for (let i = 0; i < count; i++) nums.push(start + i);
      cells.push(cell(nums.join(', ')));
    });

    cells.push(cell(c.items));
    cells.push(cell(c.percentItems + '%'));
    bodyRows.push(new TableRow({ children: cells }));
  });

  const placeRow = [
    cell('Item Placement', { bold: true, align: AlignmentType.LEFT }),
    cell(''), cell('')
  ];
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    const r = bInfo.itemRange;
    placeRow.push(cell(r && r.length ? `${r[0]}–${r[1]}` : '—'));
  });
  placeRow.push(cell(t.totalItems));
  placeRow.push(cell('100%'));
  bodyRows.push(new TableRow({ children: placeRow }));

  const totalRow = [
    cell('TOTAL', { bold: true, align: AlignmentType.LEFT }),
    cell(t.totalHours, { bold: true }),
    cell('100%', { bold: true })
  ];
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    totalRow.push(cell(bInfo.itemCount, { bold: true }));
  });
  totalRow.push(cell(t.totalItems, { bold: true }));
  totalRow.push(cell('100%', { bold: true }));
  bodyRows.push(new TableRow({ children: totalRow }));

  const pctRow = [
    cell('Percentage', { bold: true, align: AlignmentType.LEFT }),
    cell(''), cell('')
  ];
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    pctRow.push(cell(bInfo.percent + '%', { bold: true }));
  });
  pctRow.push(cell(''));
  pctRow.push(cell(''));
  bodyRows.push(new TableRow({ children: pctRow }));

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: bodyRows
  });

  const sigParas = [new Paragraph({ text: '' })];
  const pushSig = (label, value) => {
    if (!value) return;
    const [name, role] = value.split('—').map(s => (s || '').trim());
    sigParas.push(makeDocxParagraph(label, { bold: true, size: 20 }));
    sigParas.push(makeDocxParagraph(name, { bold: true }));
    if (role) sigParas.push(makeDocxParagraph(role, { italic: true, size: 20 }));
    sigParas.push(new Paragraph({ text: '' }));
  };
  pushSig('Prepared by:', state.signatories.prepared);
  pushSig('Reviewed by:', state.signatories.reviewed1);
  pushSig('Reviewed by:', state.signatories.reviewed2);
  pushSig('Reviewed by:', state.signatories.reviewed3);
  pushSig('Approved by:', state.signatories.approved);

  const doc = new Document({ sections: [{ children: [...headerParas, table, ...sigParas] }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `TOS_${sanitizeFilename(state.subject)}_${state.term}.docx`);
}

async function exportExamDocx() {
  const { Document, Packer, Paragraph, AlignmentType } = docx;

  const paras = [
    makeDocxParagraph(state.institution || '', { bold: true, align: AlignmentType.CENTER }),
    makeDocxParagraph('Name: _______________________________   Score: ____________', {}),
    makeDocxParagraph('Year and Section / Group: _______________________   Date: ____________', {}),
    new Paragraph({ text: '' }),
    makeDocxParagraph(`${state.subject}`, { bold: true, align: AlignmentType.CENTER, size: 24 }),
    makeDocxParagraph(`${state.examTitle || (state.term === 'MIDTERM' ? 'Midterm Exam' : 'Final Term Exam')}`, {
      bold: true, align: AlignmentType.CENTER, size: 24
    }),
    new Paragraph({ text: '' }),
    makeDocxParagraph('Direction:', { bold: true }),
    makeDocxParagraph(
      'Write your Name, year, and section in the provided space above. Read each question and choice carefully. ' +
      'Choose and ENCIRCLE/SHADE the letter of the correct answer on the provided answer sheet. ' +
      'Use only black or blue inked ball pen, and NO ERASURES ALLOWED.',
      { size: 22 }
    ),
    new Paragraph({ text: '' })
  ];

  state.questions.forEach(q => {
    paras.push(makeDocxParagraph(`${q.itemNo}. ${q.stem || '[stem pending]'}`, {}));
    ['A', 'B', 'C', 'D'].forEach(L => {
      paras.push(makeDocxParagraph(`   ${L}. ${q.options[L] || ''}`, {}));
    });
    paras.push(new Paragraph({ text: '' }));
  });

  paras.push(makeDocxParagraph('>>END OF EXAMINATION<<', { bold: true, align: AlignmentType.CENTER }));
  paras.push(new Paragraph({ text: '' }));

  const pushSig = (label, value) => {
    if (!value) return;
    const [name, role] = value.split('—').map(s => (s || '').trim());
    paras.push(makeDocxParagraph(label, { bold: true }));
    paras.push(makeDocxParagraph(name, { bold: true }));
    if (role) paras.push(makeDocxParagraph(role, { italic: true }));
    paras.push(new Paragraph({ text: '' }));
  };
  pushSig('Prepared by:', state.signatories.prepared);
  pushSig('Noted by:', state.signatories.reviewed1);
  pushSig('Noted by:', state.signatories.reviewed2);
  pushSig('Noted by:', state.signatories.reviewed3);
  pushSig('Approved by:', state.signatories.approved);

  const doc = new Document({ sections: [{ children: paras }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Exam_${sanitizeFilename(state.subject)}_${state.term}.docx`);
}

async function exportAnswerKeyDocx() {
  const { Document, Packer, Paragraph, AlignmentType } = docx;

  const paras = [
    makeDocxParagraph('ANSWER KEY WITH RATIONALES', { bold: true, align: AlignmentType.CENTER, size: 26 }),
    makeDocxParagraph(`${state.subject} — ${state.term === 'MIDTERM' ? 'Midterm' : 'Final Term'}`, {
      italic: true, align: AlignmentType.CENTER
    }),
    new Paragraph({ text: '' })
  ];

  state.questions.forEach(q => {
    paras.push(makeDocxParagraph(
      `${q.itemNo}. Answer: ${q.answer}   [${q.bloom} · ${q.coverageTitle}]`,
      { bold: true }
    ));
    paras.push(makeDocxParagraph(`Stem: ${q.stem || ''}`, {}));
    ['A', 'B', 'C', 'D'].forEach(L => {
      const marker = L === q.answer ? '  ✔' : '';
      paras.push(makeDocxParagraph(`   ${L}. ${q.options[L] || ''}${marker}`, {}));
    });
    if (q.chedCompetency) paras.push(makeDocxParagraph(`CHED: ${q.chedCompetency}`, { italic: true, size: 20 }));
    if (q.nleBlueprint)   paras.push(makeDocxParagraph(`NLE: ${q.nleBlueprint}`, { italic: true, size: 20 }));
    paras.push(makeDocxParagraph(`Rationale: ${q.rationale || ''}`, {}));
    paras.push(new Paragraph({ text: '' }));
  });

  const doc = new Document({ sections: [{ children: paras }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `AnswerKey_${sanitizeFilename(state.subject)}_${state.term}.docx`);
}

/* --------------------------------------------------
   SECTION 9 — SAVE / LOAD PROJECT
-------------------------------------------------- */

function serializeProject() {
  return {
    version: APP_VERSION,
    savedAt: new Date().toISOString(),
    subject: state.subject,
    term: state.term,
    totalHours: state.totalHours,
    totalItems: state.totalItems,
    institution: state.institution,
    examTitle: state.examTitle,
    coverage: state.coverage,
    bloom: state.bloom,
    signatories: state.signatories,
    questions: state.questions,
    tos: state.tos
  };
}

function restoreProject(data) {
  state.subject = data.subject || '';
  state.term = data.term || 'MIDTERM';
  state.totalHours = data.totalHours || 12;
  state.totalItems = data.totalItems || 50;
  state.institution = data.institution || '';
  state.examTitle = data.examTitle || '';
  state.coverage = data.coverage || [];
  state.bloom = data.bloom || {};
  state.signatories = { ...state.signatories, ...(data.signatories || {}) };
  state.questions = data.questions || [];
  state.tos = data.tos || null;
}

/* --------------------------------------------------
   SECTION 10 — BINDINGS & BOOT
-------------------------------------------------- */

function bindInputs() {
  $('#input-subject').addEventListener('input', e => {
    state.subject = e.target.value; updateDashboard(); persistProject();
  });
  $('#input-term').addEventListener('change', e => {
    state.term = e.target.value; updateDashboard(); recomputeTOS(); persistProject();
  });
  $('#input-hours').addEventListener('input', e => {
    state.totalHours = +e.target.value || 0; updateDashboard(); persistProject();
  });
  $('#input-items').addEventListener('input', e => {
    state.totalItems = +e.target.value || 0;
    updateDashboard();
    recomputeCoverageItems();
    renderCoverageTable();
    recomputeTOS();
    persistProject();
  });
  $('#input-institution').addEventListener('input', e => { state.institution = e.target.value; persistProject(); });
  $('#input-exam-title').addEventListener('input', e => { state.examTitle = e.target.value; persistProject(); });

  const sig = (id, key) => $('#' + id).addEventListener('input', e => {
    state.signatories[key] = e.target.value;
    renderTOS();
    persistProject();
  });
  sig('sig-prepared', 'prepared');
  sig('sig-reviewed-1', 'reviewed1');
  sig('sig-reviewed-2', 'reviewed2');
  sig('sig-reviewed-3', 'reviewed3');
  sig('sig-approved', 'approved');

  $('#btn-add-coverage').addEventListener('click', () => {
    state.coverage.push(newCoverage('Coverage Area ' + (state.coverage.length + 1)));
    recomputeCoverageItems();
    renderCoverageTable();
    recomputeTOS();
    persistProject();
  });

  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $('#tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  $('#btn-recompute-tos').addEventListener('click', () => {
    recomputeTOS();
    buildEmptyQuestions();
    renderQuestions();
    persistProject();
    showToast('success', 'TOS recomputed', `${state.totalItems} item slots prepared.`);
  });
  $('#btn-print-tos').addEventListener('click', () => window.print());
  $('#btn-export-tos-docx').addEventListener('click', async () => {
    try {
      await exportTOSDocx();
      showToast('success', 'TOS exported', 'Table of Specifications saved as .docx');
    } catch (err) {
      showToast('error', 'Export failed', err.message);
    }
  });

  $('#btn-generate-all-template').addEventListener('click', () => {
    if (state.questions.length === 0) buildEmptyQuestions();
    let count = 0;
    state.questions.forEach((q, i) => {
      if (q.status !== 'done') { generateOneTemplate(q, i); count++; }
    });
    renderQuestions();
    showToast('success', 'Template generation complete', `${count} item(s) generated.`);
  });
  $('#btn-generate-all-ai').addEventListener('click', () => {
    if (state.questions.length === 0) buildEmptyQuestions();
    generateAllAI();
  });
  $('#btn-clear-questions').addEventListener('click', () => {
    if (confirm('Clear all generated questions?')) {
      buildEmptyQuestions();
      renderQuestions();
      persistProject();
      showToast('info', 'Questions cleared', 'All items reset to empty slots.');
    }
  });

  $('#toggle-ai').addEventListener('change', e => {
    state.ai.enabled = e.target.checked;
    $('#ai-config').hidden = !state.ai.enabled;
    saveAISettings();
    renderQuestions();
    showToast('info', 'AI mode ' + (e.target.checked ? 'enabled' : 'disabled'));
  });
  $('#ai-provider').addEventListener('change', e => { state.ai.provider = e.target.value; saveAISettings(); });
  $('#ai-key').addEventListener('input', e => { state.ai.key = e.target.value; saveAISettings(); });
  $('#ai-model').addEventListener('input', e => { state.ai.model = e.target.value; saveAISettings(); });

  $('#btn-export-tos').addEventListener('click', async () => {
    try {
      await exportTOSDocx();
      showToast('success', 'TOS downloaded', 'Saved as .docx');
    } catch (err) { showToast('error', 'Export failed', err.message); }
  });
  $('#btn-export-exam').addEventListener('click', async () => {
    try {
      await exportExamDocx();
      showToast('success', 'Exam downloaded', 'Saved as .docx');
    } catch (err) { showToast('error', 'Export failed', err.message); }
  });
  $('#btn-export-answerkey').addEventListener('click', async () => {
    try {
      await exportAnswerKeyDocx();
      showToast('success', 'Answer key downloaded', 'Saved as .docx');
    } catch (err) { showToast('error', 'Export failed', err.message); }
  });
  $('#btn-export-json').addEventListener('click', () => {
    download(
      `TOS_Project_${sanitizeFilename(state.subject)}_${state.term}.json`,
      JSON.stringify(serializeProject(), null, 2)
    );
    showToast('success', 'Project exported', 'Saved as .json');
  });

  $('#btn-save-project').addEventListener('click', () => {
    download(
      `TOS_Project_${sanitizeFilename(state.subject)}_${state.term}.json`,
      JSON.stringify(serializeProject(), null, 2)
    );
    showToast('success', 'Project saved', 'Download started.');
  });
  $('#btn-load-project').addEventListener('click', () => $('#file-load-project').click());
  $('#file-load-project').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      restoreProject(data);
      hydrateInputs();
      renderCoverageTable();
      renderBloomSliders();
      recomputeTOS();
      renderQuestions();
      updateDashboard();
      persistProject();
      showToast('success', 'Project loaded', file.name);
    } catch (err) {
      showToast('error', 'Invalid project file', err.message);
    }
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Reset all inputs to defaults?')) return;
    localStorage.removeItem('tos_project');
    showToast('info', 'Resetting…', 'Reloading app.');
    setTimeout(() => location.reload(), 600);
  });

  $('#btn-help').addEventListener('click', () => showWelcome(true));
  bindProgressCancel();

  $('#toggle-ai').checked = state.ai.enabled;
  $('#ai-config').hidden = !state.ai.enabled;
  $('#ai-provider').value = state.ai.provider;
  $('#ai-key').value = state.ai.key;
  $('#ai-model').value = state.ai.model;
}

function hydrateInputs() {
  $('#input-subject').value = state.subject;
  $('#input-term').value = state.term;
  $('#input-hours').value = state.totalHours;
  $('#input-items').value = state.totalItems;
  $('#input-institution').value = state.institution;
  $('#input-exam-title').value = state.examTitle;
  $('#sig-prepared').value = state.signatories.prepared;
  $('#sig-reviewed-1').value = state.signatories.reviewed1;
  $('#sig-reviewed-2').value = state.signatories.reviewed2;
  $('#sig-reviewed-3').value = state.signatories.reviewed3;
  $('#sig-approved').value = state.signatories.approved;
}

async function boot() {
  await loadDataFiles();
  loadAISettings();
  loadTheme();
  initBloomDefaults();
  loadProjectFromStorage();
  ensureCoverage();
  hydrateInputs();
  renderCoverageTable();
  renderBloomSliders();
  recomputeTOS();
  renderQuestions();
  bindInputs();
  bindThemeToggle();
  updateDashboard();
  refreshIcons();

  // Show welcome modal on first visit
  setTimeout(() => showWelcome(false), 400);

  console.log(`[boot v${APP_VERSION}] ready`);
}

document.addEventListener('DOMContentLoaded', boot);
