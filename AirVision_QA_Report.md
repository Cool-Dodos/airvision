**AirVision Global**

Pre-Publication QA Engineering Report

Stack: MEAN (MongoDB · Express · Angular · Node.js) \| Version 1.2.0

*Reviewed: 18 March 2026*

**1. Executive Summary**

This report presents a systematic quality assurance review of the
AirVision Global AQI Monitor codebase prior to public deployment. The
review covers security, backend reliability, frontend correctness,
performance, UX, and data integrity across both the Angular client and
Express/MongoDB server.

**Total issues found across all categories:**

  ----------------------------------- -----------------------------------
  **Total Issues Identified**         28

  **CRITICAL**                        **0**

  **HIGH**                            **10**

  **MEDIUM**                          **10**

  **LOW**                             **8**

  **Blocking for Public Launch**      **3 (double-fetch bug, India state
                                      names, touch support)**

  **Recommended Fix Before Launch**   **7 additional HIGH issues**
  ----------------------------------- -----------------------------------

The application is architecturally sound and demonstrates strong
engineering in globe rendering, real-time data pipelines, and
multi-layer UX. The issues identified are concentrated in edge-case
handling, mobile support, and a few data mapping mismatches that would
surface in production.

**2. Security**

**2.1 Issues**

  -------- ----------------------------------- --------------------------------------------------- -------------- ----------------------
  **\#**   **Component**                       **Issue**                                           **Severity**   **Recommendation**

  1        server/index.js                     Content Security Policy (CSP) disabled globally     **HIGH**       Enable CSP with a
                                               (contentSecurityPolicy: false). Exposes app to XSS                 targeted policy: allow
                                               attacks if any user-generated or third-party                       only known domains for
                                               content is injected.                                               scripts, styles, and
                                                                                                                  fetch.

  2        server/routes/aqi.js                /api/aqi/boundaries/:iso2 proxy endpoint performs   **HIGH**       Validate iso2 with
                                               outbound HTTP to geoboundaries.org with unsanitized                /\^\[A-Z\]{2}\$/
                                               user input. No validation that iso2 is a valid                     before using in URL.
                                               2-letter ISO code. Potential SSRF vector.                          Return 400 on failure.

  3        server/index.js                     CORS whitelist contains only two Vercel URLs +      **MEDIUM**     Move allowed origins
                                               localhost. Any other deployment URL is blocked,                    to environment
                                               breaking staging/preview environments silently.                    variable
                                                                                                                  (ALLOWED_ORIGINS).
                                                                                                                  Allow subdomain
                                                                                                                  wildcard for Vercel
                                                                                                                  previews.

  4        client-ng/services/aqi.service.ts   IS_PROD detection uses                              **MEDIUM**     Use Angular
                                               window.location.hostname.includes(\"localhost\").                  environment.ts files
                                               Any non-localhost host --- including staging ---                   (environment.prod.ts /
                                               routes to production Render backend, contaminating                 environment.ts) for
                                               prod data.                                                         BASE URL injection at
                                                                                                                  build time.

  5        server/routes/aqi.js                No request body size limit beyond Express default   **LOW**        Add express.json({
                                               (100kb). API does not validate Content-Type on                     limit: \"10kb\" }).
                                               POST-equivalent patterns. Rate limit is IP-based,                  Consider API key auth
                                               bypassable via proxy rotation.                                     for sensitive
                                                                                                                  endpoints.
  -------- ----------------------------------- --------------------------------------------------- -------------- ----------------------

**2.2 Key Findings**

The most significant security gap is the SSRF-adjacent boundary proxy
endpoint at /api/aqi/boundaries/:iso2. While the URL template limits the
attack surface, a malicious iso2 value like \"../../etc\" or a long
string could cause unexpected behavior on the geoboundaries.org request.
A two-character regex validation eliminates this entirely.

Disabling CSP globally is acceptable during development but must be
addressed before public launch. A minimal CSP policy allowing self +
cdn.jsdelivr.net + api.waqi.info would cover all required assets without
blocking functionality.

**3. Backend Reliability**

**3.1 Issues**

  -------- ------------------------------ -------------------------- -------------- ----------------------
  **\#**   **Component**                  **Issue**                  **Severity**   **Recommendation**

  1        server/services/analytics.js   Runs up to \~190           **HIGH**       Batch with
           detectAnomalies()              individual MongoDB queries                DailyAverage.find({
                                          in a loop (one                            countryCode: { \$in:
                                          get30DayAverage() per                     codes } }).lean() ---
                                          country). On each anomaly                 one query for all
                                          check this causes \~190                   countries, then
                                          sequential DB round-trips,                aggregate in-memory.
                                          adding 2--4 seconds of                    
                                          latency.                                  

  2        server/routes/aqi.js           Returns all snapshot       **MEDIUM**     Add .limit(96) (48
           /snapshots                     timestamps with no limit.                 snapshots × 2 = 24h).
                                          After 30+ days this query                 Add query param
                                          returns hundreds of                       ?limit=N for flexible
                                          documents. No pagination                  frontend control.
                                          or time-range filter.                     

  3        server/services/cron.js        runFetch() is called       **MEDIUM**     Move runFetch() call
                                          immediately on startup                    inside the .then() of
                                          before MongoDB connection                 mongoose.connect() in
                                          is confirmed. If MongoDB                  index.js, not inside
                                          is slow to connect (Render                startCronJob().
                                          cold start), cron writes                  
                                          fail silently and the                     
                                          first snapshot is lost.                   

  4        server/routes/aqi.js           Module-level               **MEDIUM**     Move India state cache
           /india/states                  cacheIndiaStates and                      into MongoDB (a
                                          IndiaStatesCachedAt                       dedicated collection)
                                          variables. In                             so all processes share
                                          multi-process deployments                 one cache, consistent
                                          (PM2 cluster, containers)                 with the country
                                          each process has its own                  snapshot pattern.
                                          cache, causing redundant                  
                                          WAQI API calls and                        
                                          potential rate limiting.                  

  5        server/services/waqi.js        With \~190 countries,      **LOW**        Use
           fetchAllCountries()            10-batch fetching at 500ms                Promise.allSettled()
                                          delay = \~9.5 seconds per                 with AbortController
                                          cron run. No timeout on                   timeouts. Log
                                          individual country fetches                countries that
                                          beyond the 5s axios                       consistently fail for
                                          timeout. A slow station                   monitoring.
                                          can stall the entire                      
                                          batch.                                    

  6        server/models/AqiSnapshot.js   AqiSnapshot uses a Map for **LOW**        Consider flattening to
                                          countryAverages. Mongoose                 an array of { code,
                                          Map fields are queried                    \...data } documents
                                          with bracket notation                     or use a separate
                                          (countryAverages.IN) which                CountrySnapshot
                                          requires a separate index                 collection for O(1)
                                          per country for efficient                 lookups by country
                                          lookup. No compound index                 code.
                                          exists.                                   
  -------- ------------------------------ -------------------------- -------------- ----------------------

**3.2 Key Findings**

The detectAnomalies() function is the most significant backend
performance issue. Firing \~190 individual MongoDB queries per anomaly
check (called every 15 minutes by cron) could degrade response times
under load. A single \$in query with in-memory grouping reduces this to
1 database round-trip.

The cron startup race condition is low-probability on Render (which runs
as a single process) but would surface immediately in a Docker/PM2
clustered deployment. The fix is trivial --- move the initial runFetch()
call into the mongoose.connect() promise chain.

**4. Frontend Bugs**

**4.1 Issues**

  -------- ----------------------------- -------------------------- -------------- -----------------------
  **\#**   **Component**                 **Issue**                  **Severity**   **Recommendation**

  1        info-panel.component.ts       Double API fetch on first  **HIGH**       Remove the ngOnInit()
                                         render: ngOnInit() calls                  call. ngOnChanges()
                                         loadData() if countryCode                 alone is sufficient.
                                         is set. ngOnChanges() ALSO                Use a firstChange guard
                                         fires before ngOnInit()                   if needed.
                                         and calls loadData(). This                
                                         fires two simultaneous                    
                                         forkJoin requests for the                 
                                         same country on every                     
                                         first open.                               

  2        globe.component.ts onResize() Window resize handler      **HIGH**       In onResize(), also
                                         updates projection scale                  update canvas.width =
                                         and translate but does NOT                window.innerWidth \*
                                         resize the canvas element                 dpr and canvas.height =
                                         (canvas.width /                           (window.innerHeight -
                                         canvas.height). On resize,                38) \* dpr, then call
                                         the canvas bitmap is                      this.ctx.scale(dpr,
                                         stretched/squashed,                       dpr) again.
                                         causing blurry rendering                  
                                         until page reload.                        

  3        info-panel.component.ts       If backend returns {       **HIGH**       Add guard: if (d.error)
                                         error: \"message\" } with                 { this.error = true;
                                         HTTP 200 (happens when                    this.detail = null;
                                         WAQI rate-limits), the                    return; } in the next()
                                         template checks for                       callback before
                                         detail?.error but renders                 assigning detail.
                                         the panel content anyway.                 
                                         The error badge shows, but                
                                         so does the broken data                   
                                         (NaN AQI, undefined                       
                                         category).                                

  4        globe.component.ts            Race condition:            **MEDIUM**     Add a loading lock flag
           triggerIndiaMode()            exitIndiaMode() sets                      (indiaStatesLoading =
                                         indiaMode = false and                     false). Cancel pending
                                         clears indiaFeatures =                    state load if
                                         \[\]. If user rapidly                     exitIndiaMode fires
                                         re-enters India zoom,                     before completion.
                                         loadAndDrawStates() is                    
                                         called, but if the                        
                                         previous exit fires after                 
                                         the new entry, features                   
                                         are cleared mid-load.                     
                                         State becomes                             
                                         inconsistent.                             

  5        history-slider.component.ts   updateMax() sets           **MEDIUM**     When new snapshots
                                         currentIndex = maxIndex                   arrive, if !isLive,
                                         only when isLive is true.                 preserve the
                                         When new snapshots arrive                 currently-selected
                                         while user is in                          timestamp and
                                         historical mode, maxIndex                 re-compute its new
                                         updates but the visual                    index position.
                                         slider range silently                     
                                         shifts --- the same slider                
                                         position now points to a                  
                                         different snapshot.                       

  6        app.component.html            Ticker animation uses CSS  **LOW**        Add visibility: hidden
                                         \@keyframes scrollticker                  to .ticker-inner by
                                         translating to -50%. The                  default and set visible
                                         inner div is doubled                      only after
                                         (items + duplicate) to                    updateTicker() has
                                         create seamless scroll.                   written content.
                                         But updateTicker() runs                   
                                         after setTimeout(100ms)                   
                                         --- if DOM is slow to                     
                                         render, first paint shows                 
                                         a flash of unstyled empty                 
                                         ticker.                                   
  -------- ----------------------------- -------------------------- -------------- -----------------------

**4.2 Key Finding --- Double Fetch**

The InfoPanelComponent double-fetch bug is the highest-priority frontend
fix. Because ngOnInit() and ngOnChanges() both call loadData() on first
render, every country click fires two simultaneous API requests. On
Render\'s free tier (which throttles at \~3 requests/second), this could
cause the second request to 429 and silently fail, leaving the panel in
an error state. The fix is a one-line removal of the ngOnInit()
loadData() call.

Code change required in info-panel.component.ts:

REMOVE: ngOnInit(): void { if (this.countryCode) this.loadData(); }

*KEEP: Only ngOnChanges() is needed. The persistent panel approach
already ensures the component is alive when countryCode is first set.*

**5. Performance**

**5.1 Issues**

  -------- -------------------------- -------------------------- -------------- --------------------------------
  **\#**   **Component**              **Issue**                  **Severity**   **Recommendation**

  1        globe.component.ts draw()  Auto-rotation sets dirty = **HIGH**       Cache the static globe sphere
                                      true on every frame                       and graticule on an offscreen
                                      (\~60fps). draw() calls                   canvas. Only re-draw dynamic
                                      drawAllBorders() which                    layers (country fills, labels)
                                      loops all \~195 world                     when AQI data changes.
                                      features + 36 India states                
                                      = 231 path renders per                    
                                      frame during rotation. No                 
                                      offscreen canvas or layer                 
                                      caching.                                  

  2        info-panel.component.ts    writtenSummary is a getter **MEDIUM**     Convert to a computed property
           get writtenSummary()       called in the Angular                     set once in ngOnChanges(). Use
                                      template. Angular\'s                      ChangeDetectionStrategy.OnPush
                                      change detection calls it                 on InfoPanelComponent (it
                                      on every CD cycle (can be                 already has it on GlobeComponent
                                      hundreds of times per                     --- apply consistently).
                                      second during animation).                 
                                      It performs string                        
                                      concatenation and multiple                
                                      conditional checks.                       

  3        globe.component.ts         Mouse move fires mousemove **MEDIUM**     Use a spatial index (d3-quadtree
           handleHover()              at \~100Hz. The rAF                       or a simple bounding-box
                                      throttle helps but                        pre-filter) to reduce
                                      handleHover still calls                   geoContains candidates before
                                      d3.geoContains() across                   full polygon test.
                                      all 195+ features per move                
                                      event. On mobile/low-end                  
                                      devices this creates jank.                

  4        client-ng/aqi.service.ts   No HTTP caching headers on **LOW**        Add Cache-Control: public,
                                      API responses. Every page                 max-age=300 (5 min) response
                                      reload re-fetches                         header on /world, /country, and
                                      /api/aqi/world even if                    /history endpoints in the
                                      data is only 30 seconds                   Express router.
                                      old. The backend data is                  
                                      only updated every 15                     
                                      minutes.                                  
  -------- -------------------------- -------------------------- -------------- --------------------------------

**5.2 Globe Rendering Analysis**

The globe render loop is the dominant CPU consumer. During auto-rotation
at \~60fps, draw() executes the following work each frame:

-   195 country fill path renders (ctx.beginPath + path(feat) +
    ctx.fill)

-   195 country border path renders in drawAllBorders()

-   36 India state renders + 36 border renders when in India mode

-   Collision detection for labels (O(n²) against rendered label list)

-   Graticule + sphere renders

For a mid-range laptop (M1 MacBook Air), this renders comfortably. For
budget Android devices or embedded Chromebooks, the sustained GPU/CPU
usage may cause thermal throttling. The dirty flag optimization already
reduces unnecessary redraws --- the primary win is caching the sphere
and graticule on an offscreen canvas since they never change.

**6. User Experience**

**6.1 Issues**

  -------- --------------- -------------------------- -------------- ----------------------
  **\#**   **Component**   **Issue**                  **Severity**   **Recommendation**

  1        InfoPanel /     No visual feedback on the  **HIGH**       Show a pulsing
           Globe           globe when a country is                   skeleton/shimmer
                           loading. The globe\'s                     inside the panel
                           highlight glow appears                    during load. Add a
                           immediately but the side                  \"Waking up
                           panel shows \"Loading...\"                server...\"
                           for up to 12 seconds                      sub-message after 3
                           (Render free tier cold                    seconds of loading.
                           start). User has no                       
                           indication why the panel                  
                           is empty.                                 

  2        Globe (Mobile)  Zero touch/gesture         **HIGH**       Add touch event
                           support. d3.drag() handles                listeners:
                           pointer events but                        touchstart/touchmove
                           pinch-to-zoom (wheel                      for drag, and pinch
                           equivalent) is not                        distance tracking for
                           implemented. On mobile,                   scale. Or use
                           users cannot zoom at all.                 d3.zoom() which
                           The app is effectively                    handles touch
                           non-functional on phones                  natively.
                           and tablets.                              

  3        Globe ---       Labels appear at           **MEDIUM**     Apply the same
           Country Labels  LABEL_SCALE (1.6x). Many                  renderedLabels
                           small countries (Benin,                   collision detection
                           Togo, Estonia) overlap or                 (already implemented
                           are covered by adjacent                   for India states) to
                           country labels. No                        the world country
                           collision detection exists                labels.
                           for the world view ---                    
                           only India state view has                 
                           it.                                       

  4        ErrorPanel      Error message reads \"The  **MEDIUM**     Differentiate error
                           monitoring provider may be                types: show \"Data
                           rate-limiting requests.\"                 temporarily
                           This is too technical for                 unavailable --- try
                           end-users and may confuse                 again in a moment\"
                           non-technical visitors.                   for 429/5xx, and
                           Also shown for network                    \"Check your
                           errors (e.g., Render                      connection\" for
                           server offline) where rate                network errors.
                           limiting is not the cause.                

  5        TimeTravel      The slider shows \"-12H /  **LOW**        Compute tick labels
           Slider          -6H / NOW\" ticks but the                 dynamically from the
                           actual range depends on                   actual oldest snapshot
                           how many snapshots exist                  timestamp rather than
                           in MongoDB. On a fresh                    using hardcoded
                           deployment with fewer than                \"-12H\".
                           48 snapshots, \"-12H\"                    
                           tick is misleading.                       

  6        Share Card      Copy Text alert() call     **LOW**        Replace alert() with a
                           uses a browser native                     toast notification.
                           alert dialog which is                     Add a proper
                           jarring and blocked by                    html2canvas or
                           some corporate browsers.                  dom-to-image
                           \"Right click → Save                      screenshot button for
                           Image\" instruction is                    the share card.
                           non-obvious; most users                   
                           will not know how to                      
                           screenshot a DOM card.                    

  7        Accessibility   No ARIA labels on any      **MEDIUM**     Add role=\"button\" +
                           interactive globe element,                aria-label to canvas
                           anomaly buttons, or panel                 click areas. Make
                           dismiss buttons. Keyboard                 panel dismiss buttons
                           users cannot navigate the                 focusable. Add basic
                           globe or access country                   keyboard support
                           info. No skip-to-content                  (Escape closes panels
                           link. Tab order is                        --- already done;
                           undefined.                                arrow keys to rotate
                                                                     globe).
  -------- --------------- -------------------------- -------------- ----------------------

**6.2 Mobile Support Assessment**

The application has zero touch gesture support. This is the most
impactful UX gap for public deployment. Based on global web traffic
data, approximately 55--65% of users visit informational sites on
mobile. Without pinch-to-zoom and drag support on touch devices, the
globe is an unresponsive flat map --- users cannot interact with it at
all.

The quickest fix is replacing d3.drag() with d3.zoom() which handles
both mouse and touch natively, then mapping zoom transforms back to the
orthographic projection scale and rotate parameters.

**7. Data Integrity**

**7.1 Issues**

  -------- ------------------------------ -------------------------- -------------- -------------------------------
  **\#**   **Component**                  **Issue**                  **Severity**   **Recommendation**

  1        server/services/waqi.js        State name keys like       **HIGH**       Update INDIA_STATES keys to
           INDIA_STATES                   \"Orissa\" (deprecated ---                match exact property names in
                                          now \"Odisha\") and                       india-states-simplified.json:
                                          \"Uttaranchal\" (now                      use \"Odisha\" and
                                          \"Uttarakhand\") are used                 \"Uttarakhand\".
                                          as map keys. The GeoJSON                  
                                          asset uses the modern                     
                                          names. State AQI data will                
                                          never match and always                    
                                          shows no-data for these                   
                                          states.                                   

  2        server/services/waqi.js        \"Dadra and Nagar Haveli   **HIGH**       Normalize both the GeoJSON
           INDIA_STATES                   and Daman and Diu\" in                    property names and the
                                          INDIA_STATES uses a long                  INDIA_STATES keys to
                                          form name. The GeoJSON                    ASCII-only, lowercase, trimmed
                                          uses \"Dādra and Nagar                    strings for comparison, or use
                                          Haveli and Damān and Diu\"                a manual mapping table.
                                          with diacritics. String                   
                                          comparison will fail to                   
                                          match.                                    

  3        globe.component.ts             The India official         **MEDIUM**     Replace with the official India
           india-official.json            boundary GeoJSON uses a                   boundary from a reputable
                                          simplified polygon                        source (Natural Earth 10m
                                          approximation (hand-drawn                 admin-0 with India
                                          coordinates) rather than a                customization, or Survey of
                                          proper surveyed boundary.                 India published data).
                                          It omits the Siachen                      
                                          Glacier region, slightly                  
                                          misrepresents the Aksai                   
                                          Chin line, and has visible                
                                          straight-line artifacts at                
                                          \~79-80°E.                                

  4        server/services/analytics.js   Rolling average formula is **MEDIUM**     Initialize avgAqi on upsert.
           updateDailyAverages()          incorrect: newAvg =                       Use \$setOnInsert for
                                          (existingAvg \*                           first-time values. Guard
                                          (readingCount-1) + newAqi)                existingAvg with \|\| 0
                                          / readingCount. But                       fallback.
                                          readingCount was just                     
                                          incremented with \$inc                    
                                          before this calculation.                  
                                          If readingCount becomes 1                 
                                          on first write (upsert),                  
                                          the formula divides by 1                  
                                          but multiplies by 0,                      
                                          giving only the new value                 
                                          --- which is correct.                     
                                          However on subsequent                     
                                          calls, if existingAvg is                  
                                          null (first upsert), the                  
                                          formula is NaN \* 0 = NaN.                
  -------- ------------------------------ -------------------------- -------------- -------------------------------

**7.2 India State Name Mismatch --- Critical Path**

This is one of the three blocking issues. The INDIA_STATES object in
waqi.js uses the keys \"Orissa\" and \"Uttaranchal\" --- both renamed
states. The GeoJSON asset (india-states-simplified.json) uses the
current official names \"Odisha\" and \"Uttarakhand\". Because the state
AQI lookup uses exact string matching (this.stateAqi\[name\]), these two
states will ALWAYS show as no-data in the India drill-down view,
regardless of WAQI data availability.

Additionally, the diacritic mismatch in the Dadra/Daman state name will
cause a similar silent failure. A simple normalization function
(toLowerCase().trim().normalize(\"NFD\").replace(/\\p{Diacritic}/gu,
\"\")) applied to both keys and GeoJSON property names before comparison
would resolve both issues.

**8. Pre-Launch Checklist**

**8.1 Must Fix Before Launch (3 items)**

  ----------------------------------- -----------------------------------
  **1. India State Name Keys**        **Fix \"Orissa\" → \"Odisha\",
                                      \"Uttaranchal\" → \"Uttarakhand\"
                                      in waqi.js INDIA_STATES. Add
                                      diacritic normalization.**

  **2. InfoPanel Double Fetch**       **Remove ngOnInit() loadData()
                                      call. Keep only ngOnChanges()
                                      trigger.**

  **3. Mobile Touch Support**         **Add basic pinch-zoom and
                                      touch-drag to globe canvas before
                                      public launch.**
  ----------------------------------- -----------------------------------

**8.2 Strongly Recommended Before Launch (7 items)**

  ----------------------------------- -----------------------------------
  **4. CSP Header**                   **Enable minimal
                                      Content-Security-Policy in helmet
                                      config.**

  **5. SSRF Guard**                   **Validate /boundaries/:iso2 with
                                      /\^\[A-Z\]{2}\$/ regex.**

  **6. Canvas Resize**                **Update canvas.width/height in
                                      onResize() handler.**

  **7. Error Response Guard**         **Guard detail.error in InfoPanel
                                      before rendering data.**

  **8. detectAnomalies() DB Fix**     **Replace per-country queries with
                                      single \$in batch query.**

  **9. Cron Startup Race**            **Move runFetch() call into
                                      mongoose.connect() .then() block.**

  **10. Loading UX**                  **Add skeleton shimmer in
                                      InfoPanel. Add \"Waking
                                      server\...\" message after 3s.**
  ----------------------------------- -----------------------------------

**8.3 Polish (Can Ship, Fix in v1.2.1)**

  ----------------------------------- -----------------------------------
  **11. writtenSummary getter →       **Move to computed property, set in
  property**                          ngOnChanges()**

  **12. Label collision detection     **Apply existing India-mode
  (world)**                           collision logic to world labels**

  **13. Daily average formula guard** **Add \|\| 0 guard for null
                                      existingAvg in analytics.js**

  **14. Cache-Control headers**       **Add max-age=300 to /world,
                                      /country, /history responses**

  **15. Share card alert()**          **Replace with toast notification**

  **16. Ticker flash**                **Add visibility:hidden until
                                      content is written**

  **17. History slider tick labels**  **Make tick labels dynamic from
                                      actual snapshot timestamps**
  ----------------------------------- -----------------------------------

**9. Engineering Strengths**

Despite the issues identified, AirVision Global demonstrates several
strong engineering decisions worth recognizing:

  ----------------------------------- -----------------------------------
  **Globe Architecture**              Canvas-based rendering with
                                      dirty-flag optimization and 30fps
                                      cap is the correct approach for a
                                      data-driven globe. SVG would be
                                      orders of magnitude slower at 195
                                      country paths.

  **Two-Tier Geometry (India)**       The India high-res boundary +
                                      neighbor clipping is elegant. Using
                                      evenodd winding rule to punch out
                                      the India shape from neighbors
                                      solves a genuine GIS problem
                                      cleanly.

  **Multi-fallback WAQI Fetch**       The 4-tier fallback (city name →
                                      alt cities → geo → search) in
                                      fetchCountryData() maximizes
                                      coverage without multiple API
                                      tokens. \~190 countries with \~150+
                                      data coverage is impressive.

  **Persistent Panel Architecture**   Using \[class.panel-visible\]
                                      instead of \*ngIf for the info
                                      panel prevents data loss on
                                      close/reopen. This was correctly
                                      identified and implemented.

  **Analytics Pipeline**              Linear regression for AQI trend
                                      prediction, 30-day rolling average,
                                      and anomaly detection are genuinely
                                      useful features, not just cosmetic.
                                      The math in trendLabel() is
                                      correct.

  **Real-time Snapshot System**       The 15-minute cron → MongoDB
                                      snapshot → /snapshots +
                                      /snapshot/:ts API is a clean
                                      time-travel implementation. The
                                      \"carry-forward from last
                                      snapshot\" logic in cron.js
                                      prevents data gaps on partial WAQI
                                      failures.
  ----------------------------------- -----------------------------------

*AirVision Global QA Report \| Generated by Claude \| Confidential ---
Pre-Publication*
