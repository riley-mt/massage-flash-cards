// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════

const FC_DECKS = {
  anatomy:   'Anatomy & Physiology',
  bones:     'Bones & Landmarks',
  pathology: 'Pathology'
};

const MW_UNIT_LABELS = {
  APK2W: 'Abdominals',
  APK3W: 'Gluteals & Hip',
  APK4W: 'Lower Leg & Forearm',
  APK5W: 'Adductors'
};

const PM_UNIT_LABELS = {
  BACK:      'Back',
  HIP:       'Hip',
  WRIST:     'Wrist',
  ANKLE:     'Ankle',
  FOOT:      'Foot',
  LANDMARKS: 'Bony Landmarks'
};

const DECK_COLORS = {
  anatomy:       '#b85c4a',
  bones:         '#c9a84c',
  pathology:     '#7a8a4a',
  muscles:       '#4a7c8a',
  'prime-movers':'#7a5c9e'
};

const TAG_SWATCHES = ['#b85c4a','#4a7c8a','#7a5c9e','#c9a84c','#4a8a5c','#7a8090'];

const GH = {
  get owner()   { return localStorage.getItem('msc_gh_owner') || ''; },
  get repo()    { return localStorage.getItem('msc_gh_repo')  || ''; },
  get token()   { return localStorage.getItem('msc_gh_token') || ''; },
  base: 'main'
};

// ════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════

let ALL = [], deck = [], grades = {}, gradesFlipped = {}, tags = [], tagAssignments = {}, modeMemory = {};
let idx = 0, seen = new Set(), flipped = false, activeMode = 'all', startFlipped = false;
let searchTimer = null, activeDropdownCard = null;
let gradeResetSuppressed = false, pendingResetId = null;

const state = { deck: 'all', category: 'all', tag: null, search: '', smartReview: false };

// ════════════════════════════════════════════════════════════════
// MAPPERS
// ════════════════════════════════════════════════════════════════

function mapFlashcard(raw, i) {
  return {
    id: 'fc-' + i, deck: raw.topic,
    category: raw.topic,
    title: raw.q, subtitle: null,
    fields: [{ key: 'answer', label: null, value: raw.a }],
    meta: { cardType: 'qa', pageRef: null, isFascia: false, f1label: null, f2label: null,
            categoryLabel: FC_DECKS[raw.topic] || raw.topic }
  };
}

function mapMuscle(raw, i) {
  return {
    id: 'mw-' + i, deck: 'muscles',
    category: raw.unit,
    title: raw.name, subtitle: 'What is the:',
    fields: [
      { key: 'origin',    label: 'Origin',    value: raw.origin },
      { key: 'insertion', label: 'Insertion', value: raw.insertion },
      { key: 'action',    label: 'Action',    value: raw.action }
    ],
    meta: { cardType: 'muscle', pageRef: raw.page, isFascia: raw.isFascia, f1label: null, f2label: null,
            categoryLabel: MW_UNIT_LABELS[raw.unit] || raw.unit }
  };
}

function mapPrimeMover(raw, i) {
  return {
    id: 'pm-' + i, deck: 'prime-movers',
    category: raw.unit,
    title: raw.name,
    subtitle: raw.type === 'landmark' ? 'What is the:' : 'Who are the:',
    fields: [
      { key: 'f1', label: raw.f1label, value: raw.f1 },
      { key: 'f2', label: raw.f2label, value: raw.f2 }
    ],
    meta: { cardType: raw.type, pageRef: null, isFascia: false,
            f1label: raw.f1label, f2label: raw.f2label,
            categoryLabel: PM_UNIT_LABELS[raw.unit] || raw.unit }
  };
}

function cardSource(card) {
  const n = parseInt(card.id.split('-')[1]);
  if (card.id.startsWith('fc-')) return {
    file: 'flashcards-data.json', index: n,
    fields: [
      { key: 'q', label: 'Question', value: card.title },
      { key: 'a', label: 'Answer',   value: card.fields[0].value }
    ]
  };
  if (card.id.startsWith('mw-')) return {
    file: 'muscles-data.json', index: n,
    fields: [
      { key: 'name',      label: 'Name',      value: card.title },
      { key: 'origin',    label: 'Origin',    value: card.fields[0].value },
      { key: 'insertion', label: 'Insertion', value: card.fields[1].value },
      { key: 'action',    label: 'Action',    value: card.fields[2].value }
    ]
  };
  if (card.id.startsWith('pm-')) return {
    file: 'prime-movers-data.json', index: n,
    fields: [
      { key: 'name', label: 'Name',            value: card.title },
      { key: 'f1',   label: card.meta.f1label, value: card.fields[0].value },
      { key: 'f2',   label: card.meta.f2label, value: card.fields[1].value }
    ]
  };
  return null;
}

// ════════════════════════════════════════════════════════════════
// DATA LOADING
// ════════════════════════════════════════════════════════════════

const SOURCES = [
  { url: 'flashcards-data.json',   mapper: mapFlashcard  },
  { url: 'muscles-data.json',      mapper: mapMuscle     },
  { url: 'prime-movers-data.json', mapper: mapPrimeMover }
];

async function loadAll() {
  const initialHash = location.hash;
  const failed = [];
  const results = await Promise.all(
    SOURCES.map(({ url, mapper }) =>
      fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); })
               .then(arr => arr.map(mapper))
               .catch(() => { failed.push(url); return []; })
    )
  );

  if (failed.length) {
    const b = document.getElementById('warn-banner');
    b.textContent = 'Failed to load: ' + failed.join(', ');
    b.style.display = 'block';
  }

  ALL = results.flat();
  loadGrades();
  loadGradesFlipped();
  loadTags();
  loadTagAssignments();
  loadModeMemory();
  updateLearningCount();
  initColorSwatches();
  applyFilter();
  jumpToHash(initialHash);
}

function jumpToHash(hash = location.hash) {
  const raw = hash.slice(1);
  if (!raw) return;
  const wantsFlipped = raw.endsWith(':flipped');
  const id = wantsFlipped ? raw.slice(0, -8) : raw;
  if (!id) return;

  if (wantsFlipped !== startFlipped) {
    startFlipped = wantsFlipped;
    const toggle = document.getElementById('flip-toggle');
    toggle.checked = startFlipped;
    document.getElementById('flip-label').classList.toggle('checked', startFlipped);
    updateLearningCount();
    refreshKnownLearningStat();
  }

  const i = deck.findIndex(c => c.id === id);
  if (i !== -1) { idx = i; render(); return; }
  // Card not in current deck (filtered out) — reset to All and try again
  const exists = ALL.find(c => c.id === id);
  if (!exists) return;
  state.deck = 'all'; state.category = 'all'; state.tag = ''; state.search = '';
  document.querySelectorAll('.dbtn').forEach(b => b.classList.toggle('active', b.dataset.deck === 'all'));
  document.getElementById('search-input').value = '';
  applyFilter();
  const j = deck.findIndex(c => c.id === id);
  if (j !== -1) { idx = j; render(); }
}

// ════════════════════════════════════════════════════════════════
// PERSISTENCE
// ════════════════════════════════════════════════════════════════

function activeGrades() { return startFlipped ? gradesFlipped : grades; }
function saveActiveGrades() {
  const key = startFlipped ? 'msc_grades_flipped' : 'msc_grades';
  localStorage.setItem(key, JSON.stringify(activeGrades()));
}

function loadGrades() {
  try { grades = JSON.parse(localStorage.getItem('msc_grades') || '{}'); }
  catch { grades = {}; }
}
function loadGradesFlipped() {
  try { gradesFlipped = JSON.parse(localStorage.getItem('msc_grades_flipped') || '{}'); }
  catch { gradesFlipped = {}; }
}

function saveGrade(id, status) {
  activeGrades()[id] = { status, graded: Date.now() };
  saveActiveGrades();
  updateLearningCount();
  renderGradeBadge(id);
  refreshKnownLearningStat();
}

function loadTags() {
  try { tags = JSON.parse(localStorage.getItem('msc_tags') || '[]'); }
  catch { tags = []; }
}

function saveTags() { localStorage.setItem('msc_tags', JSON.stringify(tags)); }

function loadTagAssignments() {
  try { tagAssignments = JSON.parse(localStorage.getItem('msc_tag_assignments') || '{}'); }
  catch { tagAssignments = {}; }
}

function saveTagAssignments() { localStorage.setItem('msc_tag_assignments', JSON.stringify(tagAssignments)); }

function loadModeMemory() {
  try { modeMemory = JSON.parse(localStorage.getItem('msc_mode_memory') || '{}'); }
  catch { modeMemory = {}; }
}
function saveModeMemory() { localStorage.setItem('msc_mode_memory', JSON.stringify(modeMemory)); }

// Returns the card-type key for the current deck, or null if mixed/empty.
function getModeContext() {
  if (!deck.length) return null;
  const keysets = deck.map(c => c.fields.map(f => f.key).join(','));
  if (new Set(keysets).size !== 1) return null;
  return deck[0].meta.cardType; // 'muscle' | 'movement' | 'landmark' | 'qa'
}

// ════════════════════════════════════════════════════════════════
// FILTER
// ════════════════════════════════════════════════════════════════

function applyFilter() {
  let cards = ALL;

  if (state.deck !== 'all')
    cards = cards.filter(c => c.deck === state.deck);

  if (state.category !== 'all')
    cards = cards.filter(c => c.category === state.category);

  if (state.tag) {
    const tid = state.tag;
    cards = cards.filter(c => (tagAssignments[c.id] || []).includes(tid));
  }

  if (state.smartReview)
    cards = cards.filter(c => activeGrades()[c.id]?.status !== 'known');

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    cards = cards.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.fields.some(f => f.value.toLowerCase().includes(q))
    );
  }

  deck = cards;
  idx = 0; seen = new Set(); flipped = false;

  updateCategoryChips();
  updateTagChips();
  updateModeButtons();

  if (!deck.length) {
    showEmptyState(true);
    updateProgress();
  } else {
    showEmptyState(false);
    render();
  }
}

function showEmptyState(show) {
  document.getElementById('empty-state').classList.toggle('visible', show);
  document.getElementById('card').style.display = show ? 'none' : '';
}

function updateCategoryChips() {
  const el = document.getElementById('filter-cat');

  // Determine which deck's categories to show — FC topic decks have no subcategories
  const deckForCats = state.deck !== 'all' && !FC_DECKS[state.deck] ? state.deck : null;
  if (!deckForCats) { el.innerHTML = ''; return; }

  const allInDeck = ALL.filter(c => c.deck === deckForCats);
  const seen = new Map(); // category → label
  allInDeck.forEach(c => seen.set(c.category, c.meta.categoryLabel));

  let html = `<button class="filt${state.category === 'all' ? ' active' : ''}" data-cat="all">All</button>`;
  seen.forEach((label, cat) => {
    const active = state.category === cat ? ' active' : '';
    html += `<button class="filt${active}" data-cat="${cat}">${label}</button>`;
  });
  el.innerHTML = html;

  el.querySelectorAll('.filt').forEach(b => b.addEventListener('click', () => {
    state.category = b.dataset.cat;
    applyFilter();
  }));
}

function updateTagChips() {
  const el = document.getElementById('filter-tags');
  const visibleTags = tags.filter(t => !t.hidden);

  let html = '';
  visibleTags.forEach(t => {
    const count = Object.entries(tagAssignments).filter(([, tids]) => tids.includes(t.id)).length;
    const active = state.tag === t.id;
    html += `<button class="tag-chip${active ? ' active' : ''}" data-tid="${t.id}"
      style="border-color:${t.color};${active ? `background:${t.color}` : ''}"
      >${t.label} <span style="opacity:.6">${count}</span></button>`;
  });
  html += `<button class="btn-manage-tags" onclick="openTagModal()">&#9881; Tags</button>`;
  el.innerHTML = html;

  el.querySelectorAll('.tag-chip').forEach(b => b.addEventListener('click', () => {
    state.tag = state.tag === b.dataset.tid ? null : b.dataset.tid;
    applyFilter();
  }));
}

// ════════════════════════════════════════════════════════════════
// QUIZ MODE BUTTONS
// ════════════════════════════════════════════════════════════════

function deriveAvailableModes(cards) {
  if (!cards.length) return [{ key: 'all', label: 'Full Card' }];

  const keysets = cards.map(c => c.fields.map(f => f.key).join(','));
  const allSame = new Set(keysets).size === 1;

  const modes = [{ key: 'all', label: 'Full Card' }];
  if (!allSame) return modes;

  const sample = cards[0];
  switch (sample.meta.cardType) {
    case 'muscle':
      modes.push({ key: 'origin',    label: 'Quiz: Origin' });
      modes.push({ key: 'insertion', label: 'Quiz: Insertion' });
      modes.push({ key: 'action',    label: 'Quiz: Action' });
      break;
    case 'movement':
      modes.push({ key: 'f1', label: 'Quiz: ' + sample.meta.f1label });
      modes.push({ key: 'f2', label: 'Quiz: ' + sample.meta.f2label });
      break;
    case 'landmark':
      modes.push({ key: 'f1', label: 'Quiz: Definition' });
      modes.push({ key: 'f2', label: 'Quiz: Example' });
      break;
  }
  return modes;
}

function updateModeButtons() {
  const modes = deriveAvailableModes(deck);
  const ctx = getModeContext();

  // Restore saved mode for this card type, fall back to 'all'
  const saved = ctx ? (modeMemory[ctx] || 'all') : 'all';
  activeMode = modes.find(m => m.key === saved) ? saved : 'all';

  const el = document.getElementById('modes');
  el.innerHTML = modes.map(m =>
    `<button class="mode${activeMode === m.key ? ' active' : ''}" data-mode="${m.key}">${m.label}</button>`
  ).join('');

  el.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
    activeMode = b.dataset.mode;
    el.querySelectorAll('.mode').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const ctx = getModeContext();
    if (ctx) { modeMemory[ctx] = activeMode; saveModeMemory(); }
    if (deck.length) renderBack(deck[idx]);
  }));
}

// ════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════

function render() {
  if (!deck.length) return;
  closeResetBanner();
  const card = deck[idx];

  const scene = document.getElementById('scene');
  scene.classList.remove('swap');
  void scene.offsetWidth;
  scene.classList.add('swap');

  renderFront(card);
  renderBack(card);
  renderCardTags(card);

  flipped = startFlipped;
  document.getElementById('card').classList.toggle('flip', flipped);
  hideGradeButtons();
  seen.add(idx);
  updateProgress();
  history.replaceState(null, '', '#' + card.id + (startFlipped ? ':flipped' : ''));
}

function renderFront(card) {
  // Deck tag
  const tagEl = document.getElementById('f-deck-tag');
  tagEl.textContent = FC_DECKS[card.deck] || card.meta.categoryLabel || card.deck;
  tagEl.style.background = card.meta.isFascia ? '#4a7c8a' : DECK_COLORS[card.deck] || '#b85c4a';

  // Page ref
  document.getElementById('f-page').textContent = card.meta.pageRef || '';

  // Card title
  const nameEl = document.getElementById('f-name');
  nameEl.textContent = card.title;
  nameEl.className = 'card-title' + (card.meta.cardType === 'qa' ? ' card-title--qa' : '');

  // Ask label + asking
  if (card.meta.cardType === 'qa') {
    document.getElementById('f-ask-lbl').textContent = '';
    document.getElementById('f-asking').textContent = '';
  } else {
    document.getElementById('f-ask-lbl').textContent = card.subtitle || '';
    const modeLabel = activeMode === 'all'
      ? card.fields.map(f => f.label).join(' & ')
      : (card.fields.find(f => f.key === activeMode)?.label || '');
    document.getElementById('f-asking').textContent = modeLabel;
  }

  // Grade badge
  renderGradeBadge(card.id);
}

function renderGradeBadge(id) {
  const el = document.getElementById('grade-badge');
  const g = activeGrades()[id];
  el.className = '';
  if (g?.status === 'known')    { el.className = 'badge--known';    el.textContent = '✓ Known'; }
  else if (g?.status === 'learning') { el.className = 'badge--learning'; el.textContent = '↩ Learning'; }
  else el.textContent = '';
}

function renderBack(card) {
  document.getElementById('b-name').textContent = card.title;
  document.getElementById('b-content').innerHTML = buildBackContent(card, activeMode);
}

function buildBackContent(card, mode) {
  if (mode === 'all') return card.fields.map(renderField).join('');
  const field = card.fields.find(f => f.key === mode);
  return field ? renderField(field) : '';
}

function renderField(f) {
  if (f.label === null) {
    return '<div class="ans-text" style="font-size:.9rem;line-height:1.65;color:#d0d5e0">' + escHtml(f.value) + '</div>';
  }
  return '<div class="ans-section">'
    + '<div class="ans-lbl" style="' + fieldLabelStyle(f.key) + '">' + escHtml(f.label) + '</div>'
    + '<div class="ans-text">' + escHtml(f.value) + '</div>'
    + '</div>';
}

function fieldLabelStyle(key) {
  const map = { origin: '#b85c4a', insertion: '#4a7c8a', action: '#c9a84c', f1: '#b85c4a', f2: '#4a7c8a' };
  const color = map[key] || '#c9a84c';
  return `font-size:.58rem;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;color:${color}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ════════════════════════════════════════════════════════════════
// CARD TAGS (back face)
// ════════════════════════════════════════════════════════════════

function renderCardTags(card) {
  const el = document.getElementById('card-tags');
  const assigned = (tagAssignments[card.id] || [])
    .map(tid => tags.find(t => t.id === tid))
    .filter(Boolean);

  let html = '<div class="card-tag-area-inner">';
  assigned.forEach(t => {
    html += `<span class="card-tag-pill" style="border-color:${t.color};background:${t.color}22;color:${t.color}">`
           + escHtml(t.label)
           + `<button class="remove-tag" onclick="removeTagFromCard('${card.id}','${t.id}')" title="Remove tag">&times;</button>`
           + '</span>';
  });
  html += `<button class="btn-add-tag" onclick="openTagDropdown(event,'${card.id}')">+ Tag</button>`;
  html += '</div>';
  el.innerHTML = html;
}

function removeTagFromCard(cardId, tagId) {
  const arr = tagAssignments[cardId] || [];
  tagAssignments[cardId] = arr.filter(t => t !== tagId);
  if (!tagAssignments[cardId].length) delete tagAssignments[cardId];
  saveTagAssignments();
  renderCardTags(deck[idx]);
  updateTagChips();
}

function openTagDropdown(event, cardId) {
  event.stopPropagation();
  closeOpenDropdown();

  const btn = event.target;
  const assigned = tagAssignments[cardId] || [];
  const available = tags.filter(t => !assigned.includes(t.id));

  const drop = document.createElement('div');
  drop.className = 'tag-assign-dropdown';
  drop.id = 'tag-dropdown';

  if (!available.length) {
    drop.innerHTML = '<span class="no-tags-msg">No more tags to add</span>';
  } else {
    available.forEach(t => {
      const b = document.createElement('button');
      b.textContent = t.label;
      b.style.borderLeft = `3px solid ${t.color}`;
      b.addEventListener('click', e => { e.stopPropagation(); addTagToCard(cardId, t.id); closeOpenDropdown(); });
      drop.appendChild(b);
    });
  }

  btn.parentElement.appendChild(drop);
  activeDropdownCard = cardId;
}

function addTagToCard(cardId, tagId) {
  if (!tagAssignments[cardId]) tagAssignments[cardId] = [];
  if (!tagAssignments[cardId].includes(tagId)) tagAssignments[cardId].push(tagId);
  saveTagAssignments();
  renderCardTags(deck[idx]);
  updateTagChips();
}

function closeOpenDropdown() {
  document.getElementById('tag-dropdown')?.remove();
  activeDropdownCard = null;
}

// ════════════════════════════════════════════════════════════════
// PROGRESS
// ════════════════════════════════════════════════════════════════

function updateProgress() {
  const t = deck.length, p = t ? Math.round((idx / t) * 100) : 0;
  document.getElementById('prog-text').textContent = t ? 'Card ' + (idx + 1) + ' of ' + t : 'No cards';
  document.getElementById('prog-pct').textContent = t ? p + '%' : '';
  document.getElementById('prog-fill').style.width = p + '%';
  document.getElementById('s-seen').textContent = seen.size;
  document.getElementById('s-total').textContent = t || 0;
  document.getElementById('prev-btn').disabled = idx === 0 || !t;
  document.getElementById('next-btn').disabled = idx >= t - 1 || !t;
  refreshKnownLearningStat();
}

function refreshKnownLearningStat() {
  const ag = activeGrades();
  const known    = deck.filter(c => ag[c.id]?.status === 'known').length;
  const learning = deck.filter(c => ag[c.id]?.status === 'learning').length;
  document.getElementById('s-known').textContent    = known;
  document.getElementById('s-learning').textContent = learning;
}

function updateLearningCount() {
  const ag = activeGrades();
  const count = ALL.filter(c => ag[c.id]?.status === 'learning' || !ag[c.id]).length;
  document.getElementById('learning-count').textContent = count;
}

// ════════════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════════════

function flipCard() {
  if (!deck.length) return;
  flipped = !flipped;
  document.getElementById('card').classList.toggle('flip', flipped);
  if (flipped) showGradeButtons();
  closeOpenDropdown();
}

function showGradeButtons() { document.getElementById('grade-row').style.display = 'flex'; }
function hideGradeButtons() { document.getElementById('grade-row').style.display = 'none'; }

function next() {
  if (idx < deck.length - 1) { idx++; render(); }
}
function prev() {
  if (idx > 0) { idx--; render(); }
}

function shuffle() {
  deck = smartShuffle([...deck]);
  idx = 0; seen.clear(); render();
}

function smartShuffle(cards) {
  const weight = c => {
    const g = activeGrades()[c.id];
    if (!g) return 0;
    return g.status === 'learning' ? -1 : 1;
  };
  return cards
    .map(c => ({ c, r: Math.random(), w: weight(c) }))
    .sort((a, b) => a.w - b.w || a.r - b.r)
    .map(x => x.c);
}

// ════════════════════════════════════════════════════════════════
// GRADING
// ════════════════════════════════════════════════════════════════

function onKnown() {
  if (!deck.length) return;
  const card = deck[idx];
  if (activeGrades()[card.id]?.status === 'known') { initiateGradeReset(card.id); return; }
  saveGrade(card.id, 'known');
  hideGradeButtons();
  setTimeout(() => { if (idx < deck.length - 1) next(); }, 350);
}

function onLearning() {
  if (!deck.length) return;
  const card = deck[idx];
  if (activeGrades()[card.id]?.status === 'learning') { initiateGradeReset(card.id); return; }
  saveGrade(card.id, 'learning');
  hideGradeButtons();
}

function initiateGradeReset(cardId) {
  if (gradeResetSuppressed) { doGradeReset(cardId); return; }
  pendingResetId = cardId;
  document.getElementById('grade-reset-banner').style.display = 'flex';
}

function confirmGradeReset() {
  if (pendingResetId) doGradeReset(pendingResetId);
  closeResetBanner();
}

function suppressAndReset() {
  gradeResetSuppressed = true;
  if (pendingResetId) doGradeReset(pendingResetId);
  closeResetBanner();
}

function cancelGradeReset() { closeResetBanner(); }

function closeResetBanner() {
  document.getElementById('grade-reset-banner').style.display = 'none';
  pendingResetId = null;
}

function doGradeReset(cardId) {
  delete activeGrades()[cardId];
  saveActiveGrades();
  updateLearningCount();
  renderGradeBadge(cardId);
  refreshKnownLearningStat();
  hideGradeButtons();
}

function resetAllGrades() {
  const which = startFlipped ? 'flipped' : 'normal';
  if (!confirm(`Reset all ${which} grades? This clears every Known / Still Learning mark for this mode.`)) return;
  if (startFlipped) gradesFlipped = {}; else grades = {};
  saveActiveGrades();
  idx = 0; seen = new Set();
  updateLearningCount();
  refreshKnownLearningStat();
  render();
}

// ════════════════════════════════════════════════════════════════
// TAG MANAGEMENT MODAL
// ════════════════════════════════════════════════════════════════

let selectedSwatch = TAG_SWATCHES[0];

function initColorSwatches() {
  const el = document.getElementById('color-swatches');
  TAG_SWATCHES.forEach((color, i) => {
    const s = document.createElement('button');
    s.className = 'swatch' + (i === 0 ? ' selected' : '');
    s.style.background = color;
    s.title = color;
    s.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(x => x.classList.remove('selected'));
      s.classList.add('selected');
      selectedSwatch = color;
    });
    el.appendChild(s);
  });
}

function openTagModal() {
  renderTagList();
  document.getElementById('tag-modal').classList.add('open');
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('new-tag-input').focus();
}

function closeTagModal() {
  document.getElementById('tag-modal').classList.remove('open');
  document.getElementById('modal-overlay').classList.remove('open');
}

function renderTagList() {
  const el = document.getElementById('tag-list');
  const msg = document.getElementById('no-tags-msg');

  if (!tags.length) {
    msg.style.display = 'block';
    // Clear old items but keep the placeholder
    Array.from(el.children).forEach(c => { if (c !== msg) c.remove(); });
    return;
  }
  msg.style.display = 'none';
  Array.from(el.children).forEach(c => { if (c !== msg) c.remove(); });

  tags.forEach(tag => {
    const count = Object.entries(tagAssignments)
      .filter(([, tids]) => tids.includes(tag.id)).length;

    const item = document.createElement('div');
    item.className = 'tag-list-item' + (tag.hidden ? ' hidden-tag' : '');
    item.dataset.tid = tag.id;

    item.innerHTML = `
      <span class="tag-list-color" style="background:${tag.color}"></span>
      <span class="tag-list-label">${escHtml(tag.label)}</span>
      <span class="tag-list-count">${count} card${count !== 1 ? 's' : ''}</span>
      <div class="tag-action-btns">
        <button class="btn-tag-edit"   title="Rename">✏️</button>
        <button class="btn-tag-hide"   title="${tag.hidden ? 'Show' : 'Hide'}">${tag.hidden ? '👁' : '🚫'}</button>
        <button class="btn-tag-delete" title="Delete">🗑</button>
      </div>`;

    item.querySelector('.btn-tag-edit').addEventListener('click', () => startRenameTag(tag.id, item));
    item.querySelector('.btn-tag-hide').addEventListener('click', () => toggleHideTag(tag.id));
    item.querySelector('.btn-tag-delete').addEventListener('click', () => deleteTag(tag.id));

    el.appendChild(item);
  });
}

function createTag() {
  const input = document.getElementById('new-tag-input');
  const label = input.value.trim();
  if (!label) return;

  const id = 'tag-' + Date.now();
  tags.push({ id, label, color: selectedSwatch, hidden: false });
  saveTags();
  input.value = '';
  renderTagList();
  updateTagChips();
}

function startRenameTag(tagId, itemEl) {
  const labelEl = itemEl.querySelector('.tag-list-label');
  const current = labelEl.textContent;
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = current;
  labelEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newLabel = input.value.trim() || current;
    const tag = tags.find(t => t.id === tagId);
    if (tag) tag.label = newLabel;
    saveTags();
    renderTagList();
    updateTagChips();
    if (deck.length) renderCardTags(deck[idx]);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = current; input.blur(); } });
}

function toggleHideTag(tagId) {
  const tag = tags.find(t => t.id === tagId);
  if (!tag) return;
  tag.hidden = !tag.hidden;
  if (state.tag === tagId) { state.tag = null; applyFilter(); }
  saveTags();
  renderTagList();
  updateTagChips();
}

function deleteTag(tagId) {
  if (!confirm('Delete this tag and remove it from all cards?')) return;
  tags = tags.filter(t => t.id !== tagId);
  Object.keys(tagAssignments).forEach(cardId => {
    tagAssignments[cardId] = tagAssignments[cardId].filter(t => t !== tagId);
    if (!tagAssignments[cardId].length) delete tagAssignments[cardId];
  });
  if (state.tag === tagId) state.tag = null;
  saveTags();
  saveTagAssignments();
  renderTagList();
  updateTagChips();
  if (deck.length) renderCardTags(deck[idx]);
  applyFilter();
}

// ════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ════════════════════════════════════════════════════════════════

window.addEventListener('hashchange', () => jumpToHash());

document.addEventListener('DOMContentLoaded', () => {
  loadAll();

  // Deck selector
  document.getElementById('filter-deck').addEventListener('click', e => {
    const btn = e.target.closest('.dbtn');
    if (!btn) return;
    document.querySelectorAll('.dbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.deck = btn.dataset.deck;
    state.category = 'all';
    applyFilter();
  });

  // Search (debounced)
  document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value; applyFilter(); }, 150);
  });

  // Smart review toggle
  document.getElementById('smart-review-input').addEventListener('change', e => {
    state.smartReview = e.target.checked;
    document.getElementById('smart-review-toggle').classList.toggle('checked', state.smartReview);
    applyFilter();
  });

  // Start flipped toggle
  document.getElementById('flip-toggle').addEventListener('change', e => {
    startFlipped = e.target.checked;
    document.getElementById('flip-label').classList.toggle('checked', startFlipped);
    flipped = startFlipped;
    document.getElementById('card').classList.toggle('flip', flipped);
    if (flipped) showGradeButtons(); else hideGradeButtons();
    // Switch active grade set — refresh badge and stats immediately
    if (deck.length) renderGradeBadge(deck[idx].id);
    updateLearningCount();
    refreshKnownLearningStat();
  });

  // Grade buttons
  document.getElementById('btn-known').addEventListener('click', onKnown);
  document.getElementById('btn-learning').addEventListener('click', onLearning);

  // Modal close on enter key in new tag input
  document.getElementById('new-tag-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') createTag();
    e.stopPropagation(); // don't trigger card nav
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    const drop = document.getElementById('tag-dropdown');
    if (drop && !drop.contains(e.target)) closeOpenDropdown();
  });

  // GH settings PAT input — reveal actual value on first keystroke
  document.getElementById('gh-pat-input').addEventListener('focus', () => {
    const el = document.getElementById('gh-pat-input');
    if (el.dataset.masked === 'true') { el.value = ''; el.dataset.masked = 'false'; }
  });

  // Keyboard nav
  document.addEventListener('keydown', e => {
    // Don't hijack keyboard when typing in inputs or textareas
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
    else if (e.key === ' ') { e.preventDefault(); flipCard(); }
  });
});

// ════════════════════════════════════════════════════════════════
// CARD EDIT MODAL
// ════════════════════════════════════════════════════════════════

let editingCard = null;
let preEditHash = '';

function openEditModal() {
  if (!deck.length) return;
  editingCard = deck[idx];
  const src = cardSource(editingCard);
  if (!src) return;

  preEditHash = location.hash;
  history.replaceState(null, '', '#edit-' + editingCard.id);

  document.getElementById('edit-fields').innerHTML = src.fields.map(f =>
    `<div class="edit-field">
      <label class="edit-lbl">${escHtml(f.label)}</label>
      <textarea class="edit-ta" data-key="${f.key}">${escHtml(f.value)}</textarea>
    </div>`
  ).join('');

  document.getElementById('edit-status').innerHTML = '';
  document.getElementById('edit-status').className = 'edit-status';
  document.getElementById('edit-modal').classList.add('open');
  document.getElementById('edit-overlay').classList.add('open');

  document.querySelectorAll('.edit-ta').forEach(ta => {
    autoResizeTa(ta);
    ta.addEventListener('input', () => autoResizeTa(ta));
  });
}

function autoResizeTa(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  document.getElementById('edit-overlay').classList.remove('open');
  editingCard = null;
  if (preEditHash) { history.replaceState(null, '', preEditHash); preEditHash = ''; }
}

async function submitCardEdit() {
  if (!editingCard) return;
  if (!GH.token || !GH.owner || !GH.repo) { openGHSettings(); return; }

  const src = cardSource(editingCard);
  const formData = {};
  document.querySelectorAll('.edit-ta').forEach(ta => { formData[ta.dataset.key] = ta.value.trim(); });

  setEditStatus('loading', 'Creating PR\u2026');

  try {
    // Get current file content + SHA
    const fileRes  = await ghFetch(`contents/${src.file}`);
    const fileJson = await fileRes.json();
    if (!fileRes.ok) throw new Error(fileJson.message || 'Failed to fetch file');

    const rawBytes  = Uint8Array.from(atob(fileJson.content.replace(/\n/g, '')), c => c.charCodeAt(0));
    const decoded   = new TextDecoder().decode(rawBytes);
    const arr       = JSON.parse(decoded);
    Object.assign(arr[src.index], formData);
    const encBytes  = new TextEncoder().encode(JSON.stringify(arr, null, 2));
    let binary = '';
    encBytes.forEach(b => binary += String.fromCharCode(b));
    const newContent = btoa(binary);

    // Get HEAD SHA for base branch
    const refRes  = await ghFetch(`git/ref/heads/${GH.base}`);
    const refJson = await refRes.json();
    if (!refRes.ok) throw new Error(refJson.message || 'Failed to get branch ref');

    // Create new branch
    const branch    = `edit/${editingCard.id}-${Date.now()}`;
    const branchRes = await ghFetch('git/refs', 'POST', {
      ref: `refs/heads/${branch}`, sha: refJson.object.sha
    });
    if (!branchRes.ok) { const e = await branchRes.json(); throw new Error(e.message || 'Failed to create branch'); }

    // Commit updated file
    const commitRes = await ghFetch(`contents/${src.file}`, 'PUT', {
      message: `Edit card: ${editingCard.title}`,
      content: newContent, sha: fileJson.sha, branch
    });
    if (!commitRes.ok) { const e = await commitRes.json(); throw new Error(e.message || 'Failed to commit'); }

    // Build diff summary for PR body
    const diffBody = src.fields.map(f =>
      formData[f.key] !== f.value
        ? `**${f.label}**\n\`Before:\` ${f.value}\n\`After:\` ${formData[f.key]}`
        : null
    ).filter(Boolean).join('\n\n') || 'No changes.';

    // Create PR
    const prRes  = await ghFetch('pulls', 'POST', {
      title: `Edit: ${editingCard.title}`, body: diffBody, head: branch, base: GH.base
    });
    const prJson = await prRes.json();
    if (!prRes.ok) throw new Error(prJson.message || 'Failed to create PR');

    applyEditToMemory(editingCard, formData);
    setEditStatus('success', `PR created \u2192 <a href="${prJson.html_url}" target="_blank" rel="noopener">View on GitHub \u2197</a>`);
  } catch (err) {
    setEditStatus('error', 'Error: ' + escHtml(err.message));
  }
}

function applyEditToMemory(card, formData) {
  const live = ALL.find(c => c.id === card.id);
  if (!live) return;
  if (card.id.startsWith('fc-')) {
    if (formData.q) live.title = formData.q;
    if (formData.a) live.fields[0].value = formData.a;
  } else if (card.id.startsWith('mw-')) {
    if (formData.name) live.title = formData.name;
    ['origin', 'insertion', 'action'].forEach((k, i) => { if (formData[k]) live.fields[i].value = formData[k]; });
  } else if (card.id.startsWith('pm-')) {
    if (formData.name) live.title = formData.name;
    if (formData.f1)   live.fields[0].value = formData.f1;
    if (formData.f2)   live.fields[1].value = formData.f2;
  }
  render();
}

function setEditStatus(type, html) {
  const el = document.getElementById('edit-status');
  el.className = 'edit-status edit-status--' + type;
  el.innerHTML = type === 'loading' ? '<span class="edit-spinner"></span> ' + html : html;
}

async function ghFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + GH.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/${path}`, opts);
}

// ════════════════════════════════════════════════════════════════
// GITHUB SETTINGS MODAL
// ════════════════════════════════════════════════════════════════

function openGHSettings() {
  document.getElementById('gh-owner-input').value = GH.owner;
  document.getElementById('gh-repo-input').value  = GH.repo;
  const patEl = document.getElementById('gh-pat-input');
  patEl.value = GH.token ? '\u25cf'.repeat(12) : '';
  patEl.dataset.masked = GH.token ? 'true' : 'false';
  updateGHStatus();
  document.getElementById('gh-modal').classList.add('open');
  document.getElementById('gh-overlay').classList.add('open');
}

function closeGHSettings() {
  document.getElementById('gh-modal').classList.remove('open');
  document.getElementById('gh-overlay').classList.remove('open');
}

function saveGHRepo() {
  const owner = document.getElementById('gh-owner-input').value.trim();
  const repo  = document.getElementById('gh-repo-input').value.trim();
  if (!owner || !repo) { setGHSettingsStatus('error', 'Both owner and repo are required.'); return; }
  localStorage.setItem('msc_gh_owner', owner);
  localStorage.setItem('msc_gh_repo',  repo);
  updateGHStatus();
  setGHSettingsStatus('ok', 'Repo saved.');
}

let ghSaveStatusTimer = null;
function setGHSettingsStatus(type, msg) {
  const el = document.getElementById('gh-save-status');
  if (!el) return;
  el.className = 'gh-save-status gh-save-status--' + type;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(ghSaveStatusTimer);
  ghSaveStatusTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function saveGHPat() {
  const tok = document.getElementById('gh-pat-input').value.trim();
  if (!tok || tok === '\u25cf'.repeat(12)) {
    setGHSettingsStatus('error', 'Paste a token first.');
    return;
  }
  localStorage.setItem('msc_gh_token', tok);
  document.getElementById('gh-pat-input').value = '\u25cf'.repeat(12);
  document.getElementById('gh-pat-input').dataset.masked = 'true';
  updateGHStatus();
  setGHSettingsStatus('ok', 'Token saved.');
}

function clearGHToken() {
  localStorage.removeItem('msc_gh_token');
  document.getElementById('gh-pat-input').value = '';
  document.getElementById('gh-pat-input').dataset.masked = 'false';
  updateGHStatus();
}

function loadTokenFromFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const tok = ev.target.result.trim();
    if (!tok) { setGHSettingsStatus('error', 'File is empty.'); return; }
    localStorage.setItem('msc_gh_token', tok);
    document.getElementById('gh-pat-input').value = '\u25cf'.repeat(12);
    document.getElementById('gh-pat-input').dataset.masked = 'true';
    document.getElementById('gh-token-file').value = '';
    updateGHStatus();
    setGHSettingsStatus('ok', 'Token loaded from file.');
  };
  reader.readAsText(file);
}

function updateGHStatus() {
  const el = document.getElementById('gh-status');
  if (GH.token && GH.owner && GH.repo) {
    el.innerHTML = '<span class="gh-dot gh-dot--ok"></span> Token saved &middot; ' + escHtml(GH.owner + '/' + GH.repo);
  } else {
    el.innerHTML = '<span class="gh-dot gh-dot--off"></span> Not configured';
  }
}

