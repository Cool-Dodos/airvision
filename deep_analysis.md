# Deep Technical Analysis: AirVision Global UI & Data Issues

This report provides a step-by-step breakdown of the root causes for the reported bugs and outlines the structural changes required for a permanent fix.

---

## 1. Border Integrity & Consistency Issues

### Root Cause: "Dual Geometry Collision"
The globe uses two separate sources of truth for borders:
1.  **World Map**: A low-resolution TopoJSON (50m) used for all countries.
2.  **India Official**: A high-resolution custom GeoJSON (`india-official.json`).

Because the World Map includes its own interpretation of Pakistan/China borders that overlap with the India Official map, a **"Punch-out" (Clipping) mechanism** was required.

### Why it looks inconsistent:
*   **Coordinate Precision**: The 50m world map is simplified. When we clip it using a high-detail shape, micro-gaps or "seams" appear that anti-aliasing cannot resolve, making borders look "jagged" compared to others.
*   **Drawing Order**: India is drawn in a separate block *after* the neighbors. Even with identical stroke settings, the canvas blending differs when a stroke is drawn over a blank ocean vs. over another country's fill.

### Recommended Fix:
*   **Geometry Pre-processing**: We should merge the geometries into a single "World Display" collection where neighbors are pre-clipped during initialization, rather than on every animation frame.
*   **Unified Stroke Path**: Draw all borders in a single pass at the very end of the loop to ensure uniform line weight and blending.

---

## 2. Side Panel Visibility ("Selected Region")

### Root Cause: "State Destruction & Re-fetch Cycle"
The "Selected Region" panel (for countries) is wrapped in an `*ngIf="selectedCode"`. 

### Why it shows "Nothing":
*   **Flicker logic**: To "force" a refresh, the code sets `selectedCode = null` then back to the code. This causes Angular to **destroy and recreate** the entire `InfoPanelComponent`.
*   **Data Latency**: Every recreation triggers a fresh `forkJoin` API request. Total load time is dependent on backend response + 12s timeout. If the backend is slow or returning 429 errors (Too Many Requests), the panel stays in a "Loading..." state or displays an error that might be hard to read against the dark background.
*   **State Panel (India)**: Unlike the Country panel, the India State panel has **no loading state**. If you click a state and the data isn't in cache, the panel renders but shows "—" or empty fields until the background refresh completes.

### Recommended Fix:
*   **Persistent Panel**: Remove the `*ngIf`. Use a `[class.visible]` approach and update the inner data via an `@Input`. This prevents component destruction and allows for smoother transitions.
*   **Global Data Store**: Move the state AQI data into an Angular Service to ensure it persists even if the user zooms in and out.

---

## 3. Share Button & Social Card

### Root Cause: "Data Hierarchy Mismatch"
The `ShareCardComponent` expects a specific object structure, but the data sent by the State view vs. the Country view differs significantly.

### Why it doesn't work:
*   **Property Nulls**: In some cases, `dominentpol` or `iaqi` (pollutant breakdown) were missing from the state share data, causing internal template failures or console errors that stop the modal from showing.
*   **Z-Index Collision**: The share modal is a "fixed" overlay. In some browser versions, if its z-index isn't significantly higher than the `canvas` and `scanlines`, it can become un-clickable or hidden.

### Recommended Fix:
*   **Unified Share Interface**: Create a strict Typescript interface `ShareData` and ensure the `AppComponent` maps both state and country data into this exact format before calling the modal.

---

## Deep Step-by-Step Fix Plan (Next Visit)

1.  **Refactor `GlobeComponent`**: Standardize the border drawing into a single `drawBorders()` helper.
2.  **State Management**: Move `selectedCode` and `selectedState` into the `AqiService` to prevent lost states during zoom/pan.
3.  **UI Polish**: Add a high-contrast background to panels and ensure z-index starts at 1000 for all modals.
