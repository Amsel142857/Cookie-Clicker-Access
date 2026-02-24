# Cookie Clicker Access

This mod makes Cookie Clicker more accessible with screen readers like NVDA. It works with both the Steam version and the web version (via Tampermonkey).

## AI Disclaimer

**All code in this mod is AI-generated.** Development is done entirely by Claude (Anthropic's AI assistant). Human involvement is limited to prompting, direction, and QA testing. No code is written or reviewed by a human developer.

## Installation

### Steam Version

1. Download the latest release from the [Releases page](https://github.com/Amsel142857/Cookie-Clicker-Access/releases)
2. Extract the zip file
3. Copy the "Cookie-Clicker-Access" folder to your Cookie Clicker mods folder:
   `[Steam Install Path]\steamapps\common\Cookie Clicker\resources\app\mods\local\`
4. Launch Cookie Clicker and enable the mod in Options > Mods

### Web Version (Tampermonkey)

**Quick Start:**
1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension (Chrome, Firefox, Edge, Safari)
2. Click this link to install the userscript: [cookie-clicker-accessibility.user.js](https://raw.githubusercontent.com/Amsel142857/Cookie-Clicker-Access/main/cookie-clicker-accessibility.user.js)
   - Tampermonkey should open and show the installation page
   - Click "Install" to add the script
3. Visit [Cookie Clicker](https://orteil.dashnet.org/cookieclicker/) and the mod will load automatically

**Verification:**
- Open browser console (F12) and look for: `"Cookie Clicker Accessibility Mod loaded and registered!"`
- Test in console: `Object.keys(Game.mods)` should show `["nvda accessibility"]`

**Troubleshooting:**
- Make sure Tampermonkey is installed and enabled in your browser
- Check that the script is enabled in Tampermonkey dashboard (green toggle)
- The script requires `@run-at document-idle` so it waits for the game to load
- If it still doesn't work, try disabling and re-enabling the script in Tampermonkey

### Building from Source (for developers)

If you want to modify the mod and rebuild the userscript:

1. Clone this repository
2. Edit the source files in `modules/` and `main.js`
3. Run the build script:
   ```bash
   chmod +x build-userscript.sh
   ./build-userscript.sh
   ```
4. The generated `cookie-clicker-accessibility.user.js` will contain all modules bundled together

## Getting Started

When the mod loads, it announces "NVDA Accessibility mod version 13.6 loaded." The game interface is organized into navigable sections using headings:

- **News** (H2): The game's news ticker. Focusable but set to aria-live off to avoid noise.
- **Store** (H2): Contains available upgrades and buildings.
- **Buildings** (H3): The building purchase buttons within the store.
- **Wrinklers** (H2): Shows active wrinklers with buttons to pop them.
- **Status and Effects** (H2): Shows current game state — dragon level, auras, Santa, active season, grandmapocalypse stage, elder pledge/covenant, golden switch, shimmering veil, and active buffs with time remaining.
- **Shimmers** (H2): Shows Golden Cookies, Wrath Cookies, or Reindeer that have spawned.

Use your screen reader's heading navigation (e.g., H key in NVDA browse mode) to jump between sections.

### Clicking the Big Cookie

The Big Cookie is labeled and can be clicked normally. Below it you will find displays for cookies per click and milk progress.

### Buying Upgrades

Upgrades appear in the Store section. Each upgrade is labeled with its name, cost, and effect description. If you cannot afford an upgrade, a "time until affordable" estimate is shown. Tab through the upgrades and press Enter or Space to purchase.

### Buying Buildings

Buildings appear under the Buildings heading. Each building shows its name, whether it is affordable, the cost (adjusted for bulk mode), and how many you own. Below each building is an info line showing production stats and time until affordable.

Use the Buy/Sell toggle and the amount buttons (1, 10, 100, Max) at the top of the store to change purchase mode. These are all keyboard-accessible.

Buildings you have not yet unlocked are hidden. Once you own a building, the next building in line becomes visible, plus one mystery building showing only its cost.

### Ascending (Prestige)

The Legacy button shows your potential prestige and heavenly chip gain. Press it to ascend.

On the ascension screen, a Heavenly Chips counter appears at the top left showing your available chips. Heavenly upgrades are labeled with name, cost, and owned status. Tab through them and press Enter to purchase.

Permanent upgrade slots (unlocked via heavenly upgrades) open a selection dialog when clicked. Use Arrow Up/Down to browse your owned upgrades, Enter to select one, or Escape to cancel.

Press the Reincarnate button to start a new run.

## Using the Minigames

Minigames unlock at building level 1 (costs 1 sugar lump). Each building with a minigame has an Open/Close button that toggles the minigame panel. You can also press Escape to close any open minigame panel.

### Garden (Farm - Level 1)

The Garden lets you grow plants in a 6x6 grid.

**Grid Navigation:**
1. Open the Farm minigame
2. Below the Plots heading (which shows the grid size), tiles are directly accessible
3. Use Arrow keys to navigate between tiles. Each tile announces its coordinates (R#, C#), any plant name, growth percentage, and whether it is ready to harvest.
4. Press Enter or Space on an empty tile to plant your selected seed, or on a mature plant to harvest it
5. Press Escape to exit grid navigation

**Seeds:** Tab to the Seeds section to browse unlocked seeds. Click a seed to select it. A "Selected [name]" announcement confirms your choice.

**Soil:** Tab to the Soil section. Each soil button shows its name, effects (tick rate, plant effect multiplier, etc.), and whether it is your current soil or locked behind a farm count requirement.

**Tools:**
- **Information** - Opens a collapsible panel showing current plant effects and gardening tips. Press again or Escape to close.
- **Harvest All** - Harvests all plants, including immature ones.
- **Harvest Mature Only** - Added by this mod. Safely harvests only fully grown plants.
- **Freeze/Unfreeze** - Pauses all plant growth. Label updates to reflect current state.
- **Sacrifice** - Destroys all plants and seeds for 10 sugar lumps. Announced as a warning.

### Grimoire (Wizard Tower - Level 1)

The Grimoire lets you cast spells using magic points.

The Magic heading (H3) shows current/max magic and spells cast. Each spell is a cast button labeled with the spell name, magic cost, and whether you can cast. Below each button is the effect description and backfire chance if applicable.

### Pantheon (Temple - Level 1)

The Pantheon lets you slot spirits into Diamond, Ruby, and Jade slots for various bonuses.

**Slots** (Diamond, Ruby, Jade) appear first. Each shows its current occupant or "Empty". Press Enter on an occupied slot to remove that spirit.

**Spirits** appear below, each with an H3 heading showing its name (e.g. "Holobore, spirit of asceticism"), flavor text, buff description, and three placement buttons labeled Diamond, Ruby, and Jade. Buttons are disabled for the slot the spirit currently occupies.

Worship swaps are limited. The swap count and cooldown timer (when no swaps are available) appear as text between the slots and spirits.

### Stock Market (Bank - Level 1)

Each stock has a heading with the stock name, current price, shares owned, and trend direction (Rising, Falling, or Stable). The percentage shown is the change from the last tick to the current tick. Below the heading, a "Graph" trend line shows the trend over the last 65 ticks. When holding shares, the heading also shows the price you last bought at. Buy and Sell buttons are labeled per stock and keyboard-accessible.

## Special Systems

### Dragon (Krumblor)

The Dragon tab appears once unlocked. Inside you can:
- **Upgrade Krumblor** - The button shows the current dragon level
- **Pet Krumblor** - Accessible button
- **Set Dragon Auras** - Clicking an aura slot opens a dialog listing all available auras. Use Arrow Up/Down to browse, Enter to select, Escape to cancel.

### Santa

The Santa tab appears during the Christmas season. Inside:
- **Upgrade Santa** - Shows current level out of 14
- **Pet Santa** - Accessible button

### Shimmers (Golden Cookies, Wrath Cookies, Reindeer)

When a shimmer appears, the mod urgently announces it (e.g., "A Golden Cookie has appeared!"). Ten seconds before it fades, a fading alert fires.

The Active Shimmers panel shows clickable buttons for each shimmer with a countdown timer. Click or press Enter to collect.

During Cookie Chains and Cookie Storms, individual shimmer announcements are suppressed to prevent spam. Start and end events are announced with totals.

### Wrinklers

When a wrinkler spawns, the mod announces it. The Wrinklers section shows a button per active wrinkler. If you have the "Eye of the wrinkler" heavenly upgrade, each button also shows how many cookies the wrinkler has sucked. Click to pop it and recover cookies (110% return; 3x for shiny wrinklers).

### Buffs

Buffs are shown within the Status and Effects panel. Each buff shows its name, time remaining, and effect description. Buff start and end events are also announced via the live region.

### Sugar Lumps

The sugar lump button is labeled with the lump type (Normal, Bifurcated, Golden, Meaty, Caramelized), ripeness status with time estimates, and your current lump count. A one-time announcement fires when a lump becomes ripe.

### Seasons

The current season is shown in the Status and Effects panel. When seasons change, the mod announces the transition.

## Known Issues

- **Music**: The mod automatically sets music volume to 0 on load. Adjust in game options if you want music.
- **Screen reader mode**: The mod forces Cookie Clicker's built-in screen reader preference on. This creates ARIA reader labels that the mod then populates.
- **Web version**: If the mod doesn't load, check the browser console (F12) for errors. Make sure you're using the bundled userscript (`cookie-clicker-accessibility.user.js`) and that Tampermonkey is enabled.

## Accessibility Notes

- The mod creates both a polite and an assertive live region. Urgent events (shimmer appearances, wrinkler spawns, veil breaks, achievement unlocks) use the assertive region. Routine updates (buff changes, garden actions) use the polite region. Only the latest message persists in each region to avoid stacking.
- All interactive elements added by the mod support Enter and Space key activation.
- Dialog boxes (Dragon Aura selection, Permanent Upgrade slot selection) trap focus and support Escape to dismiss.
- The mod hides visual-only elements (FPS counter, floating numbers, milk layer, cookie number animations, undefined text) from screen readers using aria-hidden.

## Credits

This mod is a fork of the original [Cookie Clicker NVDA Accessibility Mod](https://github.com/FioraXena/Cookie-Clicker-Enhanced-NVDA-Accessibility-Steam-Only-) by FioraXena, forked at version 12.

Development is being continued by Amsel, who provides prompting, direction, and QA testing, with all code written by Claude (Anthropic's AI assistant).

Thanks to [guilevi](https://github.com/guilevi) for using Claude to create the Tampermonkey userscript support.

Thanks to Orteil for creating Cookie Clicker!
