# Build Instructions

This document explains how to build the bundled userscript from the modular source files.

## Problem

The original Tampermonkey userscript used `@require` directives to load modules from GitHub:
- `modules/garden.js`
- `modules/pantheon.js`
- `modules/statistics.js`
- `main.js`

However, Tampermonkey was failing to load these external dependencies silently, causing the mod to never initialize.

## Solution

A build script (`build-userscript.sh`) now generates a single, self-contained userscript by concatenating all modules in the correct order. This eliminates external dependencies while maintaining the repository's modular structure for development.

## Building

After modifying any source files, rebuild the userscript:

```bash
./build-userscript.sh
```

The script will:
1. Read the Tampermonkey header from `userscript-header.txt`
2. Concatenate all modules in order:
   - `modules/garden.js` (Garden virtual grid navigation)
   - `modules/pantheon.js` (Pantheon spirit placement)
   - `modules/statistics.js` (Upgrade/achievement labels)
   - `main.js` (Main mod registration and initialization)
3. Wrap everything in an IIFE
4. Output to `cookie-clicker-accessibility.user.js`

## File Structure

- **Source files** (edit these):
  - `userscript-header.txt` - Tampermonkey metadata
  - `modules/garden.js` - Garden module
  - `modules/pantheon.js` - Pantheon module
  - `modules/statistics.js` - Statistics module
  - `main.js` - Main mod code

- **Build files** (generated):
  - `cookie-clicker-accessibility.user.js` - Bundled userscript (commit to repo)

- **Build tool**:
  - `build-userscript.sh` - Build script

## Verification

After building, verify the output:

```bash
# Check file size (should be ~190KB+)
du -h cookie-clicker-accessibility.user.js

# Verify all modules are included
grep -c "GardenModule\|PantheonModule\|StatisticsModule" cookie-clicker-accessibility.user.js

# Check line count (should be ~5500+ lines)
wc -l cookie-clicker-accessibility.user.js
```

## Testing

1. Install the generated `cookie-clicker-accessibility.user.js` in Tampermonkey
2. Visit https://orteil.dashnet.org/cookieclicker/
3. Open browser console (F12)
4. Verify you see: `"Cookie Clicker Accessibility Mod loaded via Tampermonkey."`
5. Test in console:
   ```javascript
   // Should show the mod is registered
   Object.keys(Game.mods)
   // Should return: ["nvda accessibility"]

   // Should show the live region exists
   document.getElementById('srAnnouncer')
   // Should return: <div id="srAnnouncer" ...>
   ```

## Version Updates

To update the version number:
1. Edit `userscript-header.txt` and change `@version`
2. Run `./build-userscript.sh` to rebuild
3. Commit both files

## Why Not Use npm/webpack/rollup?

This is intentionally kept simple:
- No npm dependencies needed
- Simple bash script anyone can understand
- Fast builds (instant)
- Easy to audit and modify
- Maintains exact code structure (no transpilation)
