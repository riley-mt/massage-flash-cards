# Massage School — Study Cards

A mobile-friendly flashcard app for massage therapy school. Covers muscles, prime movers, anatomy, bones, and pathology.

**Live site:** https://riley-mt.github.io/massage-flash-cards

---

## Features

- **Multiple decks** — Anatomy, Bones, Pathology, Muscles, Prime Movers
- **Quiz modes** — Full card, or focus on individual fields (Origin, Insertion, Action, etc.)
- **Grade tracking** — Mark cards as Known or Still Learning; separate grades for normal and flipped modes
- **Smart review** — Filter to only cards still being learned
- **Tags** — Create color-coded tags and assign them to cards
- **Direct links** — Every card has a shareable URL (e.g. `#mw-12` or `#mw-12:flipped`)
- **Edit cards** — Pencil icon on each card opens an edit modal that submits a GitHub Pull Request with your changes

---

## Local development

Requires Python 3.

```bash
python server.py
```

Then open http://localhost:8000. The server watches for file changes and auto-reloads the browser.

---

## Editing cards

1. Open the ⚙ GitHub Settings modal (via the ✏ edit button on any card)
2. Enter your GitHub username and repo name
3. Load a Personal Access Token from a local file (needs `repo` scope)
4. Click ✏ on any card, edit the fields, and submit — a Pull Request is created automatically

---

## Data files

| File | Contents |
|---|---|
| `flashcards-data.json` | Anatomy, bones, and pathology Q&A cards |
| `muscles-data.json` | Muscle cards (origin, insertion, action) |
| `prime-movers-data.json` | Prime mover and landmark cards |

---

## Legacy files

The following files were early prototypes built before the unified app and are no longer used:

| File | Notes |
|---|---|
| `massage-flashcards.html` + `flashcards.js` + `flashcards.css` | Original standalone flashcard page |
| `muscles-west.html` + `muscles-west.js` | Original standalone muscles page |
| `prime-movers.html` + `prime-movers.js` | Original standalone prime movers page |

---

## Tech

Vanilla HTML, CSS, and JavaScript — no build step, no dependencies.

---

## License

MIT — see [LICENSE](LICENSE)
