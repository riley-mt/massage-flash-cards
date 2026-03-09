const ML = { all: "Origin, Insertion & Action", origin: "Origin", insertion: "Insertion", action: "Action" };
let ALL = [], deck = [], idx = 0, seen = new Set(), flipped = false, mode = "all", startFlipped = false;

fetch('./muscles-data.json')
  .then(r => r.json())
  .then(d => { ALL = d; deck = [...d]; render(); })
  .catch(() => { document.getElementById('prog-text').textContent = 'Error: muscles-data.json not found.'; });

function shuffle() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  idx = 0; seen.clear(); render();
}

function filterUnit(u) {
  deck = u === 'all' ? [...ALL] : ALL.filter(m => m.unit === u);
  idx = 0; seen.clear(); render();
}

function buildBack(m) {
  const s = {
    origin:    '<div class="ans-section"><div class="ans-lbl o">Origin</div><div class="ans-text">'    + m.origin    + '</div></div>',
    insertion: '<div class="ans-section"><div class="ans-lbl i">Insertion</div><div class="ans-text">' + m.insertion + '</div></div>',
    action:    '<div class="ans-section"><div class="ans-lbl a">Action</div><div class="ans-text">'    + m.action    + '</div></div>'
  };
  return mode === 'all' ? s.origin + s.insertion + s.action : s[mode] || '';
}

function render() {
  if (!deck.length) return;
  const card = document.getElementById('card');
  const scene = document.getElementById('scene');
  scene.classList.remove('swap');
  void scene.offsetWidth;
  scene.classList.add('swap');

  const m = deck[idx];
  const ut = document.getElementById('f-unit');
  ut.textContent = m.unit;
  ut.className = 'unit-tag' + (m.isFascia ? ' f' : '');
  document.getElementById('f-page').textContent = m.page;
  document.getElementById('f-name').textContent = m.name;
  document.getElementById('f-asking').textContent = ML[mode];
  document.getElementById('b-name').textContent = m.name;
  document.getElementById('b-content').innerHTML = buildBack(m);

  flipped = startFlipped;
  card.classList.toggle('flip', flipped);

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

function next() { if (idx < deck.length - 1) { idx++; render(); } }
function prev() { if (idx > 0) { idx--; render(); } }

document.getElementById('filters').addEventListener('click', e => {
  if (!e.target.classList.contains('filt')) return;
  document.querySelectorAll('.filt').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  filterUnit(e.target.dataset.unit);
});

document.getElementById('modes').addEventListener('click', e => {
  if (!e.target.classList.contains('mode')) return;
  document.querySelectorAll('.mode').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  mode = e.target.dataset.mode;
  document.getElementById('f-asking').textContent = ML[mode];
  document.getElementById('b-content').innerHTML = buildBack(deck[idx]);
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
