# AirVision: Deep Technical Root Cause Report


| **Metadata Leak** | **RESOLVED** | Direct spreading of Mongoose documents. Fixed by standardizing on `.lean()` POJOs. |

## 2. The "Country Swap" Mystery (IR -> SA)

Our deep database audit of the latest snapshot (`2026-03-18T08:00:16Z`) shows:
- **Database is Correct**: `IR` key correctly maps to "Iran" (AQI 162); `SA` maps to "Saudi Arabia".
- **The "Spread" Vulnerability**: In older code, `...cached` was placed at the end of the object. If a stale DB record somehow contained a `code` or `countryName` property, it would overwrite the intended values.
- **Drill-down Lag**: Rapidly clicking between countries while the C: drive was full caused the Angular builder to produce "Frankenstein" bundles where old state persisted.

## 3. Current System Integrity Check

- **Backend**: Standardized on `.lean()` + POJO access. Typo `dominentpol` in schema is being monitored (found `domminentpol` mismatch in one script).
- **Frontend**: `InfoPanel` now uses robust change detection guards.
- **Globe**: High-res boundary fetching is now proxied through the backend to avoid CORS.

---

## 4. Final Recommendation
1. **Hard Refresh**: Press `Ctrl+F5` to clear browser cache.
2. **Re-deploy**: If testing on Render/Vercel, push the latest `server/routes/aqi.js` and `client-ng/src/app/utils/aqi.ts` to ensure the "leant" POJO logic is live.
3. **Staging Verification**: I will now verify the `domminentpol` typo across all files to ensure iaqi data renders correctly.
