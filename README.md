# DGAC Playground · Interactive Walkthrough

An interactive visualisation of **DGAC** (*Diffusion-based Graph-agnostic Clustering*,
[Xie, Yang, Wang — WWW 2025](https://doi.org/10.1145/3696410.3714652)).

> 🌐 **Live demo**: [dcs.warwick.ac.uk/~u1898019/dgac-playground/](https://www.dcs.warwick.ac.uk/~u1898019/dgac-playground/)

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white" alt="react">
  <img src="https://img.shields.io/badge/KaTeX-0.16-329F36" alt="katex">
  <img src="https://img.shields.io/badge/no%20build%20step-✓-64d2ff" alt="no-build">
  <img src="https://img.shields.io/badge/zh--CN-100%25-d93b1e" alt="chinese">
</p>

---

## What this is

A single-page, self-contained interactive walkthrough that teaches the DGAC architecture:

- **Dual-branch diffusion** — topology branch (`H ← αÂH + H₀`) and attribute branch (built from
  feature-similarity matrix) running in parallel
- **Fusion** — `H = β·Hₜ + (1−β)·Hₐ`
- **Cluster-propagation** — k-means → `C ← αÂC + C₀` iterative refinement (the *Diffusion* in DGAC)
- **Four-term self-supervised loss** — `L_prop`, `L_km`, `L_SSG` (three-level invariance), `L_ort`

Everything is animated on a 20-node heterophilic-flavoured demo graph with a 9-step scrubber
and live-coupled formula panel.

## Features

- 🎨 **Academic paper aesthetic** — warm cream background, serif + mono typography,
  distill.pub-style layout
- 🧭 **9-step scrubber** — step through the forward pass (play / pause / keyboard nav)
- 📐 **Live formulae** — KaTeX-rendered equations highlight in sync with the current step
- 🎛️ **Tweaks panel** — adjust `α`, `β`, topology / attribute diffusion layers, C-prop layers;
  numbers update the pipeline and formulae in real time
- 🧠 **Graph view** — nodes re-colour at each step (ground truth → diffusion glow →
  misclustered nodes → recovered)
- 🧮 **Loss breakdown** — four loss-term cards with per-term explanations
- 💾 **Step state persisted** — current step saved to `localStorage`
- 🌏 **Chinese UI** — full 中文 interface (academic-style)

## Tech stack

- **React 18.3** via UMD CDN
- **Babel standalone 7.29** — in-browser JSX transpilation (no build step)
- **KaTeX 0.16** — maths rendering
- **Google Fonts** — Noto Serif SC + Inter + JetBrains Mono
- **Pure SVG** — all pipeline / graph diagrams, no canvas

## Running locally

```bash
git clone https://github.com/Haili321/dgac-playground.git
cd dgac-playground
python3 -m http.server 8000
# open http://localhost:8000/
```

Or just open `index.html` directly in a browser.

## File structure

```
dgac-playground/
├── index.html          # Entry — loads React, Babel, KaTeX, then src/*
└── src/
    ├── app.jsx         # Top-level component + header/footer + layout
    ├── graph.jsx       # 20-node demo graph layout + rendering
    ├── steps.jsx       # 9-step narrative definitions
    ├── pipeline.jsx    # Architecture SVG pipeline (centerpiece)
    ├── formulas.jsx    # KaTeX formulae panel, step-coupled highlighting
    ├── tweaks.jsx      # Hyper-parameter tweak panel
    ├── extras.jsx      # Loss breakdown cards, info panes, helpers
    └── dgac_math.js    # Small numerical helpers (diffusion, kmeans)
```

## About DGAC

DGAC is an unsupervised node-clustering method that remains robust on both homophilic
(e.g. Cora) and heterophilic (e.g. Texas, Wisconsin) graphs — a notoriously difficult
regime for classical GNN clustering.

Paper: **Diffusion-based Graph-agnostic Clustering** · Kun Xie, Renchi Yang, Sibo Wang ·
*The Web Conference (WWW) 2025* · [DOI](https://doi.org/10.1145/3696410.3714652)

## License

MIT — see [LICENSE](LICENSE).

Original DGAC algorithm credit belongs to the paper authors; this repository contains
only the educational interactive visualisation.

---

<p align="center">
  <sub>Built by <a href="https://github.com/Haili321">Haili Yuan</a> ·
  PhD in Computer Science @ University of Warwick</sub>
</p>
