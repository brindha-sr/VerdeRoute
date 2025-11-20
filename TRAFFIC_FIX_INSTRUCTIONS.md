# Traffic Key Fix Instructions

## Problem
The message "No TomTom key configured. Traffic features unavailable." still appears because:
1. The variable `apiRoleDetectionRan` is used but never declared globally
2. The `ensureApiKeyRoles()` function checks this undefined variable which acts as falsy, causing inconsistent behavior

## Quick Browser Console Fix (Temporary)
1. Open Browser DevTools (F12)
2. Go to Console tab
3. Paste this and press Enter:

```javascript
window.TRAFFIC_KEY = TOMTOM_CONFIG.PRIMARY_KEY || TOMTOM_CONFIG.SECONDARY_KEY;
console.log('TRAFFIC_KEY set to:', window.TRAFFIC_KEY);
```

4. Now click "Live Traffic" button - it should enable without error

## Permanent Code Fix
In `map.js`, find the Live Traffic button click handler (around line 3067) and replace:

```javascript
      liveBtn.addEventListener('click', async () => {
        if (!liveTrafficEnabled) {
          // Ensure we detect traffic key before enabling
          try { await ensureApiKeyRoles(); } catch(_){}
          if (!TRAFFIC_KEY) {
            // No key available — traffic is not possible
            try { showTrafficSuggestion('No TomTom key configured. Traffic features unavailable.'); } catch(_) { console.warn('Traffic key missing'); }
            return; // Exit early, don't enable
          }
          enableLiveTraffic();
          liveBtn.style.background = '#0ea5a4';
          liveBtn.innerText = 'Traffic: ON';
        } else {
          disableLiveTraffic();
          liveBtn.style.background = '#111827';
          liveBtn.innerText = 'Live Traffic';
        }
      });
```

With this:

```javascript
      liveBtn.addEventListener('click', async () => {
        if (!liveTrafficEnabled) {
          // Directly use TOMTOM_CONFIG keys to bypass detection issues
          if (!TRAFFIC_KEY) {
            const key = TOMTOM_CONFIG.PRIMARY_KEY || TOMTOM_CONFIG.SECONDARY_KEY;
            if (key) {
              TRAFFIC_KEY = key;
              console.log('Traffic key set from TOMTOM_CONFIG:', key.substring(0, 8) + '...');
            } else {
              try { showTrafficSuggestion('No TomTom key in TOMTOM_CONFIG. Traffic unavailable.'); } catch(_) { console.warn('Traffic key missing'); }
              return;
            }
          }
          enableLiveTraffic();
          liveBtn.style.background = '#0ea5a4';
          liveBtn.innerText = 'Traffic: ON';
        } else {
          disableLiveTraffic();
          liveBtn.style.background = '#111827';
          liveBtn.innerText = 'Live Traffic';
        }
      });
```

Then restart the server and refresh the browser.

## Root Cause
The `apiRoleDetectionRan` variable (used in `ensureApiKeyRoles()` at line 530) is never declared at the module level. It should be added near the top of map.js with other globals:

```javascript
let apiRoleDetectionRan = false; // Add this line
```

Place it after `let TRAFFIC_KEY = null;` (around line 7)
