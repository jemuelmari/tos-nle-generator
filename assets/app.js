/* =====================================================
   TOS Generator — App Logic  (v2.0.0)
   ===================================================== */

const APP_VERSION = '2.0.0';

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
    prepared: '', reviewed1: '', reviewed2: '', reviewed3: '', approved: ''
  },
  tos: null,
  chedCompetencies: null,
  nleBlueprint: null
};

let coverageIdCounter = 1;

/* --------------------------------------------------
   Utilities
-------------------------------------------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function pct(part, whole) { return whole ? Math.round((part / whole) * 1000) / 10 : 0; }
function download(filename, content, type = 'application/json') {
  saveAs(new Blob([content], { type }), filename);
}
function sanitizeFilename(s) { return (s || 'project').replace(/[^a-z0-9\-_.]+/gi, '_').slice(0, 80); }
function refreshIcons() { if (window.lucide?.createIcons) lucide.createIcons(); }
function updateThemeIcon(theme) {
  const btn = $('#btn-theme'); if (!btn) return;
  btn.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  refreshIcons();
}
function forceHideOverlays() {
  ['#prompt-modal', '#welcome-modal'].forEach(sel => {
    const node = $(sel);
    if (node) { node.hidden = true; node.style.display = 'none'; node.setAttribute('aria-hidden', 'true'); }
  });
}

/* --------------------------------------------------
   Toast
-------------------------------------------------- */
function showToast(type, title, message = '', duration = 3500) {
  const container = $('#toast-container'); if (!container) return;
  const icons = { success: 'check-circle-2', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
  const toast = el('div', { class: 'toast toast-' + type });
  toast.appendChild(el('div', { class: 'toast-icon' }, el('i', { 'data-lucide': icons[type] || 'info' })));
  const body = el('div', { class: 'toast-body' });
  body.appendChild(el('div', { class: 'toast-title' }, title));
  if (message) body.appendChild(el('div', { class: 'toast-msg' }, message));
  toast.appendChild(body);
  const closeBtn = el('button', { class: 'toast-close', 'aria-label': 'Close' }, el('i', { 'data-lucide': 'x' }));
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
}

/* --------------------------------------------------
   Dashboard
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
    if (b.category === 'lower') lower += v; else higher += v;
  });

  const lowerBar = $('#dash-bloom-lower'), higherBar = $('#dash-bloom-higher');
  const lowerLbl = $('#dash-bloom-lower-label'), higherLbl = $('#dash-bloom-higher-label');
  if (lowerBar) { lowerBar.style.width = Math.max(lower, 0) + '%'; lowerLbl.textContent = lower > 0 ? lower + '%' : ''; }
  if (higherBar) { higherBar.style.width = Math.max(higher, 0) + '%'; higherLbl.textContent = higher > 0 ? higher + '%' : ''; }

  const total = lower + higher;
  let level = 'ok', label = 'Valid 30/70', icon = 'shield-check';
  if (!state.subject || !state.totalItems) { level = 'warn'; label = 'Incomplete'; icon = 'alert-triangle'; }
  else if (total !== 100) { level = 'err'; label = 'Bloom ≠ 100%'; icon = 'alert-octagon'; }
  else if (lower > 30 || higher < 70) { level = 'warn'; label = 'Off 30/70'; icon = 'alert-triangle'; }

  if (status) { status.textContent = label; status.className = 'dash-value dash-' + level; }
  if (statusIcon) statusIcon.innerHTML = `<i data-lucide="${icon}"></i>`;
  refreshIcons();
}

/* --------------------------------------------------
   Data load (used for prompt building)
-------------------------------------------------- */
async function loadDataFiles() {
  try {
    const [ched, nle] = await Promise.all([
      fetch('data/ched-competencies.json').then(r => r.json()),
      fetch('data/nle-blueprint.json').then(r => r.json())
    ]);
    state.chedCompetencies = ched;
    state.nleBlueprint = nle;
  } catch (err) {
    console.warn('[data] failed', err);
    state.chedCompetencies = { core_competency_areas: [] };
    state.nleBlueprint = { exam_parts: [] };
  }
}

/* --------------------------------------------------
   Theme
-------------------------------------------------- */
function loadTheme() {
  const saved = localStorage.getItem('tos_theme') || 'light';
  document.body.dataset.theme = saved;
  updateThemeIcon(saved);
}
function bindThemeToggle() {
  const btn = $('#btn-theme'); if (!btn) return;
  btn.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    document.body.dataset.theme = next;
    localStorage.setItem('tos_theme', next);
    updateThemeIcon(next);
  });
}

/* --------------------------------------------------
   Welcome modal
-------------------------------------------------- */
function showWelcome(force = false) {
  const hide = localStorage.getItem('tos_hide_welcome') === '1';
  if (hide && !force) return;
  const modal = $('#welcome-modal'); if (!modal) return;
  modal.hidden = false; modal.style.display = ''; modal.removeAttribute('aria-hidden');
  refreshIcons();
  const close = () => { modal.hidden = true; modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); };
  $('#btn-close-welcome').onclick = close;
  $('#btn-start-welcome').onclick = () => {
    if ($('#chk-hide-welcome').checked) localStorage.setItem('tos_hide_welcome', '1');
    close();
  };
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

/* --------------------------------------------------
   Coverage editor
-------------------------------------------------- */
function newCoverage(title = '') { return { id: 'c' + (coverageIdCounter++), title, hours: 3, items: 0 }; }
function ensureCoverage() { if (state.coverage.length === 0) state.coverage.push(newCoverage('Coverage Area I')); }

function recomputeCoverageItems() {
  const totalHours = state.coverage.reduce((s, c) => s + (+c.hours || 0), 0);
  const totalItems = state.totalItems;
  if (!totalHours || !totalItems) return;
  let remaining = totalItems;
  state.coverage.forEach((c, idx) => {
    if (idx === state.coverage.length - 1) c.items = remaining;
    else { c.items = Math.round(((+c.hours || 0) / totalHours) * totalItems); remaining -= c.items; }
  });
}

function renderCoverageTable() {
  const tbody = $('#coverage-body'); if (!tbody) return;
  tbody.innerHTML = '';
  const totalHours = state.coverage.reduce((s, c) => s + (+c.hours || 0), 0);

  state.coverage.forEach((c, i) => {
    const row = el('tr');
    row.appendChild(el('td', {}, String(i + 1)));
    row.appendChild(el('td', {}, el('input', {
      type: 'text', value: c.title, placeholder: 'e.g., Discussion of the Concepts...',
      oninput: (e) => { c.title = e.target.value; persistProject(); }
    })));
    row.appendChild(el('td', {}, el('input', {
      type: 'number', min: '0', value: c.hours,
      oninput: (e) => {
        c.hours = +e.target.value || 0;
        recomputeCoverageItems(); renderCoverageTable(); recomputeTOS(); persistProject();
      }
    })));
    row.appendChild(el('td', { class: 'ro' }, pct(c.hours, totalHours) + '%'));
    row.appendChild(el('td', { class: 'ro' }, String(c.items || 0)));
    row.appendChild(el('td', {}, el('button', {
      class: 'btn btn-sm btn-ghost',
      onclick: () => {
        state.coverage.splice(i, 1); ensureCoverage();
        recomputeCoverageItems(); renderCoverageTable(); recomputeTOS(); persistProject();
      }
    }, '✕')));
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
   Bloom sliders
-------------------------------------------------- */
function initBloomDefaults() {
  if (Object.keys(state.bloom).length === 0) BLOOM_LEVELS.forEach(b => state.bloom[b.key] = b.default);
}

function renderBloomSliders() {
  const wrap = $('#bloom-sliders'); if (!wrap) return;
  wrap.innerHTML = '';
  BLOOM_LEVELS.forEach(b => {
    const row = el('div', { class: 'bloom-row' });
    row.appendChild(el('div', { class: 'bloom-label' }, [
      document.createTextNode(b.key),
      el('span', { class: 'cat ' + b.category }, b.category)
    ]));
    row.appendChild(el('input', {
      type: 'range', min: '0', max: '100', step: '1', value: state.bloom[b.key],
      oninput: (e) => {
        state.bloom[b.key] = +e.target.value;
        updateBloomSummary(); updateDashboard(); recomputeTOS(); persistProject();
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
    if (b.category === 'lower') lower += v; else higher += v;
  });
  $('#bar-lower').style.width  = Math.min(lower, 100) + '%';
  $('#bar-higher').style.width = Math.min(higher, 100) + '%';
  $('#pct-lower').textContent  = lower + '%';
  $('#pct-higher').textContent = higher + '%';
  $$('.bloom-value').forEach(span => { span.textContent = (state.bloom[span.dataset.key] || 0) + '%'; });

  const totalEl = $('#bloom-total');
  totalEl.className = 'alert ' + (total === 100 ? 'alert-info' : 'alert-danger');
  totalEl.textContent = `Total: ${total}%` + (total === 100 ? '' : ' — must equal 100%');

  const warn = $('#bloom-warning');
  const issues = [];
  if (total !== 100) issues.push(`Sliders total ${total}% — adjust to 100%.`);
  if (lower > 30) issues.push(`Lower-order is ${lower}% (exceeds 30% threshold).`);
  if (higher < 70) issues.push(`Higher-order is ${higher}% (below 70% target).`);
  if ((+state.bloom['Creating'] || 0) === 0) issues.push(`Creating is 0% — consider adding at least one Creating-level item.`);

  if (issues.length) {
    warn.hidden = false; warn.style.display = ''; warn.className = 'alert alert-warning';
    warn.innerHTML = '<strong>⚠️ Notes:</strong><ul style="margin:6px 0 0 18px">' + issues.map(i => `<li>${i}</li>`).join('') + '</ul>';
  } else { warn.hidden = true; warn.style.display = 'none'; }
}

/* --------------------------------------------------
   TOS compute + render
-------------------------------------------------- */
function computeBloomItemCounts() {
  const counts = {}; let assigned = 0;
  BLOOM_LEVELS.forEach((b, idx) => {
    if (idx === BLOOM_LEVELS.length - 1) counts[b.key] = state.totalItems - assigned;
    else { counts[b.key] = Math.round((state.bloom[b.key] / 100) * state.totalItems); assigned += counts[b.key]; }
  });
  return counts;
}
function assignItemNumbersToBloom(bloomCounts) {
  const ranges = {}; let n = 1;
  BLOOM_LEVELS.forEach(b => {
    const c = bloomCounts[b.key] || 0;
    ranges[b.key] = c > 0 ? [n, n + c - 1] : [];
    n += c;
  });
  return ranges;
}

function computeTOS() {
  ensureCoverage(); recomputeCoverageItems();
  const totalHours = state.coverage.reduce((s, c) => s + (+c.hours || 0), 0);
  const bloomCounts = computeBloomItemCounts();
  const bloomRanges = assignItemNumbersToBloom(bloomCounts);
  const tos = {
    subject: state.subject, term: state.term, totalHours, totalItems: state.totalItems,
    coverage: state.coverage.map(c => ({
      ...c, percentHours: pct(c.hours, totalHours), percentItems: pct(c.items, state.totalItems)
    })),
    bloom: BLOOM_LEVELS.map(b => ({
      key: b.key, category: b.category, percent: state.bloom[b.key],
      itemCount: bloomCounts[b.key], itemRange: bloomRanges[b.key]
    })),
    lowerPercent: BLOOM_LEVELS.filter(b => b.category === 'lower').reduce((s, b) => s + (+state.bloom[b.key] || 0), 0),
    higherPercent: BLOOM_LEVELS.filter(b => b.category === 'higher').reduce((s, b) => s + (+state.bloom[b.key] || 0), 0)
  };
  state.tos = tos;
  return tos;
}
function recomputeTOS() { computeTOS(); renderTOS(); }

/* Build item-number assignment per (Bloom, Coverage) cell */
function computeAssignment(t) {
  const totalCovItems = t.coverage.reduce((s, x) => s + (x.items || 0), 0);
  const assignment = {};
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
    t.coverage.forEach((c, ci) => {
      let count;
      if (ci === t.coverage.length - 1) count = (range[1] - cursor) + 1;
      else {
        const covShare = totalCovItems > 0 ? (c.items || 0) / totalCovItems : 0;
        count = Math.round(covShare * totalBloomItems);
        const remaining = (range[1] - cursor) + 1;
        const remainingCov = t.coverage.length - ci - 1;
        if (count > remaining - remainingCov) count = Math.max(0, remaining - remainingCov);
      }
      const nums = [];
      for (let i = 0; i < count; i++) { nums.push(cursor); cursor++; }
      assignment[b.key][ci] = nums;
    });
  });
  return assignment;
}

function renderTOS() {
  const container = $('#tos-container'); if (!container) return;
  if (!state.tos) { container.innerHTML = ''; return; }
  const t = state.tos;
  const assignment = computeAssignment(t);

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

  const summaryRow = el('tr');
  summaryRow.appendChild(el('td', { class: 'left', colspan: '3' }, `Lower-Order: ${t.lowerPercent}%`));
  summaryRow.appendChild(el('td', { colspan: '6' }, `Higher-Order: ${t.higherPercent}%`));
  summaryRow.appendChild(el('td', {}, ''));
  summaryRow.appendChild(el('td', {}, ''));
  tbody.appendChild(summaryRow);

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);

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

  const warnBox = $('#tos-warnings');
  warnBox.innerHTML = '';
  const issues = [];
  if (t.lowerPercent > 30) issues.push(`Lower-order is ${t.lowerPercent}% (>30%).`);
  if (t.higherPercent < 70) issues.push(`Higher-order is ${t.higherPercent}% (<70%).`);
  if (issues.length) warnBox.appendChild(el('div', { class: 'alert alert-warning' }, '⚠️ ' + issues.join(' ')));
  else warnBox.appendChild(el('div', { class: 'alert alert-success' }, '✅ TOS validated: 30/70 rule satisfied.'));
  refreshIcons();
  updateDashboard();
}

/* --------------------------------------------------
   Master Prompt Builder
-------------------------------------------------- */
function buildMasterPrompt() {
  const t = state.tos || computeTOS();

  const coverageList = t.coverage
    .map((c, i) => `  ${i + 1}. ${c.title} (${c.hours} hrs, ${c.items} items)`)
    .join('\n');

  const bloomDist = BLOOM_LEVELS
    .map(b => `  - ${b.key}: ${state.bloom[b.key]}% (${t.bloom.find(x => x.key === b.key).itemCount} items)`)
    .join('\n');

  const chList = (state.chedCompetencies?.core_competency_areas || [])
    .map(c => `  - ${c.code} — ${c.name}`)
    .join('\n');

  const nleList = (state.nleBlueprint?.exam_parts || [])
    .map(p => `  - ${p.code} — ${p.name}: ${p.description}`)
    .join('\n');

  const termLabel = state.term === 'MIDTERM' ? 'Midterm' : 'Final Term';

  return `# ROLE

You are an expert Philippine Nursing Licensure Examination (NLE) item writer and nursing educator with 15+ years of experience. You write board-exam-quality multiple-choice questions aligned with:

- CHED CMO No. 15 s. 2017 (Philippine Nursing Education Curriculum)
- PRC Board of Nursing Resolution No. 10 s. 2025 (Enhanced Table of Specifications for the NLE)
- Revised Bloom's Taxonomy (Remembering → Creating)
- NLE question conventions (client-centered scenarios, 4 options, plausible distractors)

# EXAM CONTEXT

- **Subject:** ${state.subject || '[Enter Subject]'}
- **Term:** ${termLabel}
- **Institution:** ${state.institution || '[Enter Institution]'}
- **Exam Title:** ${state.examTitle || termLabel + ' Exam'}
- **Total Items:** ${t.totalItems}
- **Total Hours Taught:** ${t.totalHours}

# COVERAGE AREAS

${coverageList}

# BLOOM'S DISTRIBUTION (TARGET)

${bloomDist}

# BLOOM'S LEVEL DEFINITIONS (follow strictly)

| Level | What the item asks students to do | Stem pattern |
|-------|------------------------------------|--------------|
| **Remembering** | Recall a fact, term, structure, or definition | "Which structure...", "Which term refers to...", "Which is a normal finding for..." |
| **Understanding** | Explain, interpret, or classify a concept | "A patient reports... Which structure is involved?", "Which statement best explains..." |
| **Applying** | Use a concept in a new but familiar situation | "Which tool is used to...", "Which technique best demonstrates...", "Which action should the nurse take to..." |
| **Analyzing** | Break down information to interpret findings | "A [age]-year-old presents with [data]. What is the best interpretation?" |
| **Evaluating** | Justify a decision or prioritize an action | "A client presents with [data]. What is the best nursing action?" |
| **Creating** | Design, formulate, or plan something new | "Which care plan is most appropriate?", "Formulate a teaching plan for...", "Which discharge plan best addresses..." |

# QUESTION FORMAT RULES

1. **Stem:**
   - Lower-order (Remembering, Understanding, Applying): short, direct questions (1–2 sentences)
   - Higher-order (Analyzing, Evaluating, Creating): clinical scenario stems with age, sex, chief complaint, and assessment data

2. **Options:**
   - Exactly **4 options (A, B, C, D)**
   - Lower-order: short phrases (3–10 words)
   - Higher-order: full sentences (10–20 words) describing interpretations or actions
   - **Never use "All of the above" or "None of the above"**
   - Distractors must be **plausible to a student but clearly wrong to an expert**

3. **Correct answer distribution:**
   - Roughly balanced across A, B, C, D
   - No single letter more than 30% of items

4. **Language:**
   - Use **nursing terminology** correctly (medical terms, anatomical terms, nursing process steps)
   - Match NLE style: formal, precise, client-centered
   - Prefer **Filipino names, settings, and cultural context** where applicable (e.g., barangay health centers, DOH programs, Philippine epidemiology)

5. **Rationale (for every item):**
   - 3–6 sentences
   - First sentence: **state the correct answer and why it's correct**
   - Following sentences: **explain why each distractor is wrong**

6. **Tags (for every item):**
   - CHED competency (from the list below)
   - NLE blueprint domain (from the list below)
   - Coverage area
   - Bloom's level

# CHED CORE COMPETENCY AREAS (pick one per item)

${chList || '  - CC-01 — Safe, Quality Nursing Care\n  - CC-02 — Management of Resources and Environment\n  - CC-03 — Health Education\n  - CC-04 — Legal Responsibility and Accountability\n  - CC-05 — Ethico-Moral Responsibility\n  - CC-06 — Personal and Professional Development\n  - CC-07 — Quality Improvement\n  - CC-08 — Research\n  - CC-09 — Records Management\n  - CC-10 — Communication\n  - CC-11 — Collaboration and Teamwork'}

# NLE BLUEPRINT DOMAINS (pick one per item)

${nleList || '  - NP-I — Nursing Practice I (Community Health)\n  - NP-II — Nursing Practice II (Mother and Child)\n  - NP-III — Nursing Practice III (Physiologic & Psychosocial Alterations, Part A)\n  - NP-IV — Nursing Practice IV (Physiologic & Psychosocial Alterations, Part B)\n  - NP-V — Nursing Practice V (Psychiatric/Mental Health, Older Adults)'}

# OUTPUT FORMAT

Return your response as a **valid JSON array** with this exact structure. No prose, no markdown fences, just JSON:

\`\`\`json
[
  {
    "item_no": 1,
    "coverage_area": "EXACT coverage area name",
    "bloom_level": "Remembering | Understanding | Applying | Analyzing | Evaluating | Creating",
    "ched_competency": "CC-XX — Name",
    "nle_blueprint": "NP-X — Name",
    "stem": "...",
    "options": {
      "A": "...",
      "B": "...",
      "C": "...",
      "D": "..."
    },
    "answer": "A|B|C|D",
    "rationale": "3–6 sentences. First sentence states the correct answer and why. Following sentences explain why each distractor is wrong."
  }
]
\`\`\`

# ITEM-LEVEL REQUIREMENTS

- **item_no:** Sequential from 1 to ${t.totalItems}
- **coverage_area:** Must exactly match one of the provided coverage areas
- **bloom_level:** One of the 6 levels — match the target distribution
- **ched_competency:** One of the 11 CHED Core Competency Areas
- **nle_blueprint:** One of NP-I through NP-V
- **stem:** The question
- **options:** Object with A, B, C, D
- **answer:** Single letter (A, B, C, or D)
- **rationale:** String, 3–6 sentences

# TARGET DISTRIBUTION PER COVERAGE AREA

Use the coverage areas above as your guides. Generate items so that:
- Each coverage area produces the item count shown
- Each Bloom's level produces the count shown
- The two distributions are satisfied simultaneously (i.e., each coverage area has a mix of Bloom's levels)

# VALIDATION CHECKLIST (verify before outputting)

- [ ] Total items = ${t.totalItems}
- [ ] Bloom's distribution matches target exactly
- [ ] Every item has exactly 4 options
- [ ] Every item has exactly 1 correct answer
- [ ] No "all of the above" or "none of the above"
- [ ] Answer letters are balanced (no letter > 30%)
- [ ] Every rationale explains why the 3 distractors are wrong
- [ ] No duplicate stems or overlapping concepts
- [ ] All items use nursing terminology correctly
- [ ] Coverage areas used match the list provided

# BATCHING NOTE

If ${t.totalItems} items is too long for one response, generate in batches of 10–15. For each batch, include:
"Generate items [X–Y] of ${t.totalItems}. Do not repeat any concept already covered in previous items."

# BEGIN

Generate all ${t.totalItems} items now. Output ONLY the JSON array.`;
}

/* --------------------------------------------------
   Prompt modal
-------------------------------------------------- */
function openPromptModal() {
  const modal = $('#prompt-modal'); if (!modal) return;
  const ta = $('#prompt-textarea');
  ta.value = buildMasterPrompt();
  modal.hidden = false; modal.style.display = ''; modal.removeAttribute('aria-hidden');
  refreshIcons();

  const close = () => { modal.hidden = true; modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); };
  $('#btn-close-prompt').onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  $('#btn-prompt-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      showToast('success', 'Prompt copied', 'Paste into DeepSeek to generate questions.');
    } catch {
      ta.select();
      document.execCommand('copy');
      showToast('success', 'Prompt copied', 'Paste into DeepSeek to generate questions.');
    }
  };
  $('#btn-prompt-download').onclick = () => {
    download(
      `DeepSeek_Prompt_${sanitizeFilename(state.subject)}_${state.term}.txt`,
      ta.value,
      'text/plain'
    );
    showToast('success', 'Prompt downloaded', 'Saved as .txt');
  };
}

/* --------------------------------------------------
   Export — TOS .docx
-------------------------------------------------- */
function makeDocxParagraph(text, opts = {}) {
  const { Paragraph, TextRun, AlignmentType } = docx;
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { after: opts.after ?? 120 },
    children: [new TextRun({
      text, bold: !!opts.bold, italics: !!opts.italic,
      size: opts.size || 22, font: opts.font || 'Calibri'
    })]
  });
}

async function exportTOSDocx() {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun } = docx;
  const t = state.tos || computeTOS();
  const assignment = computeAssignment(t);

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
      cell('', { width: 5 }), cell('', { width: 5 }), cell('', { width: 5 }),
      cell('', { width: 5 }), cell('', { width: 5 }),
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
    const cells = [
      cell(c.title, { align: AlignmentType.LEFT }),
      cell(c.hours),
      cell(c.percentHours + '%')
    ];
    BLOOM_LEVELS.forEach(b => {
      const nums = assignment[b.key][ci] || [];
      cells.push(cell(nums.length ? nums.join(', ') : '—'));
    });
    cells.push(cell(c.items));
    cells.push(cell(c.percentItems + '%'));
    bodyRows.push(new TableRow({ children: cells }));
  });

  const placeRow = [cell('Item Placement', { bold: true, align: AlignmentType.LEFT }), cell(''), cell('')];
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    const r = bInfo.itemRange;
    placeRow.push(cell(r && r.length ? `${r[0]}–${r[1]}` : '—'));
  });
  placeRow.push(cell(t.totalItems));
  placeRow.push(cell('100%'));
  bodyRows.push(new TableRow({ children: placeRow }));

  const totalRow = [cell('TOTAL', { bold: true, align: AlignmentType.LEFT }), cell(t.totalHours, { bold: true }), cell('100%', { bold: true })];
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    totalRow.push(cell(bInfo.itemCount, { bold: true }));
  });
  totalRow.push(cell(t.totalItems, { bold: true }));
  totalRow.push(cell('100%', { bold: true }));
  bodyRows.push(new TableRow({ children: totalRow }));

  const pctRow = [cell('Percentage', { bold: true, align: AlignmentType.LEFT }), cell(''), cell('')];
  BLOOM_LEVELS.forEach(b => {
    const bInfo = t.bloom.find(x => x.key === b.key);
    pctRow.push(cell(bInfo.percent + '%', { bold: true }));
  });
  pctRow.push(cell(''));
  pctRow.push(cell(''));
  bodyRows.push(new TableRow({ children: pctRow }));

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: bodyRows });

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

/* --------------------------------------------------
   Export — Blank Exam Shell
-------------------------------------------------- */
async function exportExamShellDocx() {
  const { Document, Packer, Paragraph, AlignmentType } = docx;

  const paras = [
    makeDocxParagraph(state.institution || '', { bold: true, align: AlignmentType.CENTER }),
    makeDocxParagraph('Name: _______________________________   Score: ____________', {}),
    makeDocxParagraph('Year and Section / Group: _______________________   Date: ____________', {}),
    new Paragraph({ text: '' }),
    makeDocxParagraph(`${state.subject || ''}`, { bold: true, align: AlignmentType.CENTER, size: 24 }),
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
    new Paragraph({ text: '' }),
    makeDocxParagraph('[PASTE YOUR QUESTIONS HERE]', { italic: true, align: AlignmentType.CENTER }),
    new Paragraph({ text: '' }),
    makeDocxParagraph('>>END OF EXAMINATION<<', { bold: true, align: AlignmentType.CENTER }),
    new Paragraph({ text: '' })
  ];

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
  saveAs(blob, `ExamShell_${sanitizeFilename(state.subject)}_${state.term}.docx`);
}

/* --------------------------------------------------
   Save / Load project
-------------------------------------------------- */
function serializeProject() {
  return {
    version: APP_VERSION,
    savedAt: new Date().toISOString(),
    subject: state.subject, term: state.term,
    totalHours: state.totalHours, totalItems: state.totalItems,
    institution: state.institution, examTitle: state.examTitle,
    coverage: state.coverage, bloom: state.bloom,
    signatories: state.signatories, tos: state.tos
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
  state.tos = data.tos || null;
}
function loadProjectFromStorage() {
  try { const saved = JSON.parse(localStorage.getItem('tos_project') || 'null'); if (saved) restoreProject(saved); } catch {}
}
function persistProject() { localStorage.setItem('tos_project', JSON.stringify(serializeProject())); }

/* --------------------------------------------------
   Bindings
-------------------------------------------------- */
function bindInputs() {
  $('#input-subject').addEventListener('input', e => { state.subject = e.target.value; updateDashboard(); persistProject(); });
  $('#input-term').addEventListener('change', e => { state.term = e.target.value; updateDashboard(); recomputeTOS(); persistProject(); });
  $('#input-hours').addEventListener('input', e => { state.totalHours = +e.target.value || 0; updateDashboard(); persistProject(); });
  $('#input-items').addEventListener('input', e => {
    state.totalItems = +e.target.value || 0;
    updateDashboard(); recomputeCoverageItems(); renderCoverageTable(); recomputeTOS(); persistProject();
  });
  $('#input-institution').addEventListener('input', e => { state.institution = e.target.value; persistProject(); });
  $('#input-exam-title').addEventListener('input', e => { state.examTitle = e.target.value; persistProject(); });

  const sig = (id, key) => $('#' + id).addEventListener('input', e => {
    state.signatories[key] = e.target.value; renderTOS(); persistProject();
  });
  sig('sig-prepared', 'prepared');
  sig('sig-reviewed-1', 'reviewed1');
  sig('sig-reviewed-2', 'reviewed2');
  sig('sig-reviewed-3', 'reviewed3');
  sig('sig-approved', 'approved');

  $('#btn-add-coverage').addEventListener('click', () => {
    state.coverage.push(newCoverage('Coverage Area ' + (state.coverage.length + 1)));
    recomputeCoverageItems(); renderCoverageTable(); recomputeTOS(); persistProject();
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
    recomputeTOS(); persistProject();
    showToast('success', 'TOS recomputed', `${state.totalItems} items placed.`);
  });
  $('#btn-print-tos').addEventListener('click', () => window.print());

  $('#btn-copy-prompt').addEventListener('click', openPromptModal);
  $('#btn-copy-prompt-2').addEventListener('click', openPromptModal);

  $('#btn-export-tos-docx').addEventListener('click', async () => {
    try { await exportTOSDocx(); showToast('success', 'TOS exported', 'Saved as .docx'); }
    catch (err) { showToast('error', 'Export failed', err.message); }
  });
  $('#btn-export-tos').addEventListener('click', async () => {
    try { await exportTOSDocx(); showToast('success', 'TOS downloaded', 'Saved as .docx'); }
    catch (err) { showToast('error', 'Export failed', err.message); }
  });
  $('#btn-export-exam-shell').addEventListener('click', async () => {
    try { await exportExamShellDocx(); showToast('success', 'Exam shell downloaded', 'Paste your questions inside.'); }
    catch (err) { showToast('error', 'Export failed', err.message); }
  });
  $('#btn-export-json').addEventListener('click', () => {
    download(`TOS_Project_${sanitizeFilename(state.subject)}_${state.term}.json`, JSON.stringify(serializeProject(), null, 2));
    showToast('success', 'Project exported', 'Saved as .json');
  });

  $('#btn-save-project').addEventListener('click', () => {
    download(`TOS_Project_${sanitizeFilename(state.subject)}_${state.term}.json`, JSON.stringify(serializeProject(), null, 2));
    showToast('success', 'Project saved', 'Download started.');
  });
  $('#btn-load-project').addEventListener('click', () => $('#file-load-project').click());
  $('#file-load-project').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      restoreProject(data);
      hydrateInputs(); renderCoverageTable(); renderBloomSliders();
      recomputeTOS(); updateDashboard(); persistProject();
      showToast('success', 'Project loaded', file.name);
    } catch (err) { showToast('error', 'Invalid project file', err.message); }
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Reset all inputs to defaults?')) return;
    localStorage.removeItem('tos_project');
    showToast('info', 'Resetting…', 'Reloading app.');
    setTimeout(() => location.reload(), 600);
  });

  $('#btn-help').addEventListener('click', () => showWelcome(true));
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
  forceHideOverlays();
  await loadDataFiles();
  loadTheme();
  initBloomDefaults();
  loadProjectFromStorage();
  ensureCoverage();
  hydrateInputs();
  renderCoverageTable();
  renderBloomSliders();
  recomputeTOS();
  bindInputs();
  bindThemeToggle();
  updateDashboard();
  refreshIcons();
  setTimeout(() => showWelcome(false), 400);
  console.log(`[boot v${APP_VERSION}] ready`);
}

document.addEventListener('DOMContentLoaded', boot);
