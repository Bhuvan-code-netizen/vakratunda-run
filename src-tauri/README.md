# Vakratunda Run: desktop shell

The game is a Vite + React + Three.js app, and this is the [Tauri](https://tauri.app)
2 wrapper that hosts it as a native desktop window. The shell does nothing but
show the web view, so the desktop app and the browser preview run the same code
and the same assets.

## Requirements (on the machine doing the build only)

1. Node 20+ for the Vite dev server and the production build.
2. The Rust toolchain: <https://rustup.rs>.
3. The Tauri prerequisites for your OS (WebView2 on Windows, `webkit2gtk` on
   Linux, Xcode command line tools on macOS). See the Tauri docs.

None of this is needed to run the game in a browser — the web app builds and
runs exactly as before.

## Run it

```bash
npm run desktop:dev
```

That starts Vite on `:5173` and opens the desktop window against it. The first
Rust build takes a few minutes; later runs are quick.

## Package it

```bash
npm run desktop:icon public/icon.png   # once: writes src-tauri/icons/*
npm run desktop:build                  # bundles land in src-tauri/target/release/bundle
```

Bundling needs the icon set to exist, which is why `desktop:icon` comes first.
Any square PNG works as the source.

## Notes

- The dev port is fixed at `5173` in `vite.config.ts`, which is what `devUrl`
  points at. If something else holds that port the window comes up blank: free
  the port and re-run.
- `frontendDist` is `../dist`, the ordinary `npm run build` output, so a
  packaged build is the same bundle you would upload to any static host.
- The window opens at 1440x900 with a 960x600 floor, dark themed, and remembers
  nothing between runs.
