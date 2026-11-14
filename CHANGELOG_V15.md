# EIT V15 — Highlight & Resizer Fix

- Reading highlight cycles: first highlight = brown, second highlight = pink, third click = remove.
- Highlight state is keyed by exact text offsets so the same selection can be recolored predictably.
- Practice-test highlight tool now uses the same brown → pink → remove behavior.
- Reading split divider uses a larger hit area, pointer events on the document, drag constraints (25–75%), persistent localStorage, and double-click reset to 50/50.
- Divider is touch-friendly and visually easier to grab.
