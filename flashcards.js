const TL = {
  anatomy: "Anatomy & Physiology",
  muscles: "Muscles",
  bones: "Bones & Landmarks",
  pathology: "Pathology",
  kinesiology: "Kinesiology West 3"
};

let ALL = [], deck = [], idx = 0, seen = new Set(), flipped = false;

fetch('flashcards-data.json')
  .then(r => r.json())
  .then(d => { ALL = d; deck = [...d]; render(); })
  .catch(() => { document.getElementById('pt').textContent = 'Error: flashcards-data.json not found.'; });

function shuffle() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  idx = 0; seen.clear(); flipped = false; render();
}

function filter(t) {
  deck = t === 'all' ? [...ALL] : ALL.filter(c => c.topic === t);
  idx = 0; seen.clear(); flipped = false; render();
}

function render() {
  if (!deck.length) return;
  const card = document.getElementById('card');
  card.classList.remove('flip');
  flipped = false;
  const c = deck[idx];
  document.getElementById('ft').textContent = TL[c.topic] || c.topic;
  document.getElementById('fq').textContent = c.q;
  document.getElementById('ba').textContent = c.a;
  seen.add(idx);
  updateProgress();
}

function updateProgress() {
  const t = deck.length, p = Math.round((idx / t) * 100);
  document.getElementById('pt').textContent = 'Card ' + (idx + 1) + ' of ' + t;
  document.getElementById('pp').textContent = p + '%';
  document.getElementById('pf').style.width = p + '%';
  document.getElementById('ss').textContent = seen.size;
  document.getElementById('st').textContent = t;
  document.getElementById('sl').textContent = t - seen.size;
  document.getElementById('pb').disabled = idx === 0;
  document.getElementById('nb').disabled = idx === t - 1;
}

function flip() {
  flipped = !flipped;
  document.getElementById('card').classList.toggle('flip', flipped);
}

function next() { if (idx < deck.length - 1) { idx++; render(); } }
function prev() { if (idx > 0) { idx--; render(); } }

document.getElementById('filters').addEventListener('click', e => {
  if (!e.target.classList.contains('fbtn')) return;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  filter(e.target.dataset.t);
});

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next();
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
  else if (e.key === ' ') { e.preventDefault(); flip(); }
});
