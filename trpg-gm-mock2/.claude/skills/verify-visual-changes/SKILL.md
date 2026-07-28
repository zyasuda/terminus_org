---
name: verify-visual-changes
description: Objectively verify a browser-rendered visual change (Three.js scene, CSS, layout, lighting, particle effects, sliders/toggles) with Playwright screenshots and pixel measurement instead of eyeballing. Use whenever a change is supposed to alter what the page looks like, especially subtle effects (fog, brightness, opacity, particle density) where "looks about right" is not good enough.
---

# Verify Visual Changes

A screenshot you only look at is not proof. Measure it.

## Why

Eyeballing has repeatedly missed real bugs in this project: a miscalibrated fog that fogged the whole scene, a light `decay` bug that washed out a unit, and a "the slider isn't working" false alarm that turned out to be a bad single-pixel sample. Each was only caught by comparing actual pixel values before/after, or by inspecting the live object state directly.

## Workflow

1. **Write the check script inside the project, not `/tmp`.** Playwright resolves `node_modules` relative to the script's own location, so a script under `/tmp` fails with `ERR_MODULE_NOT_FOUND`. Use a throwaway name like `fx_check_tmp.mjs` in the project root.
2. **Start (or reuse) the dev server**, then drive the page with `chromium.launch()` / `page.goto(url, { ignoreHTTPSErrors: true })` if it's served over a self-signed HTTPS dev cert.
3. **Capture before/after screenshots**, or toggle the setting mid-script and screenshot both states in one run so timing can't drift between them.
4. **Measure, don't just view.** Use `sharp` (check it's already a devDependency first) to read pixel/region brightness or diff two screenshots numerically. Pick a region that's actually representative of the effect — a single arbitrary pixel can sit in a spot the effect barely touches and produce a false negative.
5. **For internal state that isn't visible on screen** (camera distance, a Three.js material property, whether a toggle actually flipped a flag), temporarily expose it via a throwaway global (e.g. `window.__debugState = () => ({...})`) injected into the source, read it from the Playwright script, then remove it.
6. **Clean up unconditionally**: delete the check script (`rm -f fx_check_tmp.mjs`) and fully remove any injected diagnostic code — confirm with `grep` for the temporary marker and `git diff --stat` showing only the intended file changes.

## When a measurement contradicts expectation

Don't assume the feature is broken from one weird number. Re-check the measurement method itself first (wrong region, wrong timing, stale screenshot) before concluding the underlying code is wrong — the "slider isn't working" case above was a bad test, not a bad slider.
