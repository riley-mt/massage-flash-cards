let ALL = [], deck = [], idx = 0, seen = new Set(), flipped = false, mode = 'all', startFlipped = false;

fetch('./prime-movers-data.json')
  .then(r => r.json())
  .then(d => { ALL = d; deck = [...d]; render(); })
  .catch(() => { document.getElementById('prog-text').textContent = 'Error: prime-movers-data.json not found.'; });

function getUnitClass(unit) {
  return { BACK: 'back', HIP: 'hip', WRIST: 'wrist', ANKLE: 'ankle', FOOT: 'foot', LANDMARKS: 'landmarks' }[unit] || '';
}

function updateModeLabels(card) {
  document.getElementById('mode-f1').textContent = 'Quiz: ' + card.f1label;
  document.getElementById('mode-f2').textContent = 'Quiz: ' + card.f2label;
  if (mode === 'f1') document.getElementById('f-asking').textContent = card.f1label;
  if (mode === 'f2') document.getElementById('f-asking').textContent = card.f2label;
}

function buildBack(card) {
  const s = {
    f1: '<div class="ans-section"><div class="ans-lbl f1">' + card.f1label + '</div><div class="ans-text">' + card.f1 + '</div></div>',
    f2: '<div class="ans-section"><div class="ans-lbl f2">' + card.f2label + '</div><div class="ans-text">' + card.f2 + '</div></div>'
  };
  return mode === 'all' ? s.f1 + s.f2 : s[mode] || '';
}

function render() {
  if (!deck.length) return;
  const scene = document.getElementById('scene');
  const card = deck[idx];

  scene.classList.remove('swap');
  void scene.offsetWidth;
  scene.classList.add('swap');

  const unitEl = document.getElementById('f-unit');
  unitEl.textContent = card.unit;
  unitEl.className = 'unit-tag ' + getUnitClass(card.unit);

  document.getElementById('f-type').textContent = card.type === 'landmark' ? 'Bony Landmark' : 'ROM / Action';
  document.getElementById('f-name').textContent = card.name;
  document.getElementById('f-ask-lbl').textContent = card.type === 'landmark' ? 'What is the:' : 'Who are the:';

  const modeLabel = mode === 'all' ? card.f1label + ' & ' + card.f2label : (mode === 'f1' ? card.f1label : card.f2label);
  document.getElementById('f-asking').textContent = modeLabel;

  document.getElementById('b-name').textContent = card.name;
  document.getElementById('b-content').innerHTML = buildBack(card);

  updateModeLabels(card);

  flipped = startFlipped;
  document.getElementById('card').classList.toggle('flip', flipped);

  seen.add(idx);
  progress();
}

function progress() {
  const t = deck.length, p = Math.round((idx / t) * 100);
  document.getElementById('prog-text').textContent = 'Card ' + (idx + 1) + ' of ' + t;
  document.getElementById('prog-pct').textContent = p + '%';
  document.getElementById('prog-fill').style.width = p + '%';
  document.getElementById('s-seen').textContent = seen.size;
  document.getElementById('s-total').textContent = t;
  document.getElementById('s-left').textContent = t - seen.size;
  document.getElementById('prev-btn').disabled = idx === 0;
  document.getElementById('next-btn').disabled = idx === t - 1;
}

function flipCard() {
  flipped = !flipped;
  document.getElementById('card').classList.toggle('flip', flipped);
}

function shuffle() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  idx = 0; seen.clear(); render();
}

function next() { if (idx < deck.length - 1) { idx++; render(); } }
function prev() { if (idx > 0) { idx--; render(); } }

document.getElementById('filters').addEventListener('click', e => {
  if (!e.target.classList.contains('filt')) return;
  document.querySelectorAll('.filt').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  const u = e.target.dataset.unit;
  deck = u === 'all' ? [...ALL] : ALL.filter(c => c.unit === u);
  idx = 0; seen.clear(); render();
});

document.getElementById('modes').addEventListener('click', e => {
  if (!e.target.classList.contains('mode')) return;
  document.querySelectorAll('.mode').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  mode = e.target.dataset.mode;
  render();
});

document.getElementById('flip-toggle').addEventListener('change', e => {
  startFlipped = e.target.checked;
  e.target.closest('.toggle').classList.toggle('checked', startFlipped);
  flipped = startFlipped;
  document.getElementById('card').classList.toggle('flip', flipped);
});

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
  else if (e.key === ' ') { e.preventDefault(); flipCard(); }
});
