# Cell 3D Visualization App

This repository contains the original Python/PyVista desktop visualizer and a browser-based GitHub Pages demo.

## Web demo

The static viewer lives in [`web/`](web/). It uses VTK.js to compare matching DeepCVR and DIP reconstruction volumes in vertically stacked viewers. The visitor can choose a dataset and enable or disable auto-rotation, which is enabled initially. The two viewer cameras are synchronized for both automatic and manual movement. Every volume is normalized to 0–255 and inverted before the saved `current_flip_dip` opacity profile is applied.

Run it locally:

```powershell
Set-Location web
npm install
npm run dev
```

Create a production build:

```powershell
Set-Location web
npm run build
```

## Publishing to GitHub Pages

The included [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) workflow builds and deploys the web demo after pushes to `main`. In the repository’s **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**. The deployment run reports the public site URL.

The volume files are distributed as static browser assets. Anyone who can view the published demo can retrieve the selected `.npy` file, so only data approved for public release belongs in `web/public/data/`.
