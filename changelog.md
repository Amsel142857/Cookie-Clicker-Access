# Cookie Clicker Access - Changelog

## Version 13.6

### Inaccessible Elements
- Added prestige details to Game Stats panel (run duration, prestige level, CpS%, cookies to next level, ascending gains)
- Added Buy All Upgrades button accessibility (role, tabindex, keyboard support)
- Added dragon boost indicator labels when Supreme Intellect aura is active
- Added jukebox control accessibility (play, loop, auto buttons; seek slider label)
- Added gift system input labels (gift code, amount, message, error announcements)
- Hidden mute buttons from screen readers (visual-only feature)
- Hidden version badge and update notification from screen readers

### Notification System Overhaul
- Categorized all notifications: startup (persistent, no live region), user-initiated (hidden, live region only), non-user-initiated (persistent + live region)
- Achievement notifications now persistent until dismissed and announced via live region
- Shimmer click results suppressed from notifications (already announced via live region)

### Accessible Selector Panels
- Replaced visual-only background selector with accessible button panel
- Replaced visual-only golden cookie sound selector with accessible button panel
- Permanent upgrade slots now show assigned upgrade name in label

### Cleanup
- Removed duplicate Pantheon panel (was creating a second set of controls alongside the inline ones)
- Removed unused Garden accessible panel (dead code)
- Removed legacy Garden module from web build (web version now uses same inline code as Steam)
- Updated Tampermonkey userscript name and namespace to match current repo

### Fixes
- Fixed wrinkler labels showing cookies sucked without Eye of the Wrinkler upgrade
- Removed "Click to pop" from wrinkler labels
- Fixed news ticker: grandma quotes and speaker now read on same line
- Fixed pantheon focus issues: stopped DOM reordering, anchored spirit elements to placeholders
- Rounded garden times to nearest minute to prevent screen reader spam
- Hidden You building customizer (values are meaningless without visual preview)
- Added guilevi credit to README for Tampermonkey userscript support

## Version 13.2

- Press Escape to close any open minigame panel, dragon panel, or milk selector
- Garden plant activity (growth, maturity, decay) is now announced via live region while the garden minigame is open
- Improved dragon panel accessibility
- Improved ascension screen accessibility

## Version 12

- Added Statistics Module for accessible upgrade and achievement labels
- Added Grimoire accessible spell structure (H3 headings, cost, effect, Cast buttons)
- Added Enhanced Pantheon panel with slot details and effect percentages
- Added Dragon Aura selection dialog with keyboard navigation
- Added Permanent upgrade slot selection dialog on ascension screen
- Added Heavenly Chips counter on ascension screen
- Added Cookie Chain and Cookie Storm tracking with start/end announcements
- Added seasonal shimmer variant names (Bunny, Heart, Pumpkin, Contract)
- Added Active Shimmers panel with clickable buttons and countdown timers
- Added Harvest Mature Only button in Garden
- Added collapsible Garden Information panel with current effects and tips
- Added building production stats (individual CPS, total CPS, percentage of total)
- Added toggle upgrade effect descriptions (Elder Pledge, Golden Switch, etc.)
- Added milk progress display with rank, type, and achievements to next rank
- Added season display in main interface
- Added cookies per click display
- Added progressive building reveal (owned + next + mystery)
- Added building level display with sugar lump cost in store
- Added Stock Market accessibility (stock labels, buy/sell buttons)
- Added QoL selector accessibility (Milk, Background, Season, Sound)
- Added Shimmering Veil break alert
- Added batch processing for statistics menu to avoid UI freezing

## Version 11.7

- Added bulk pricing support for buildings (1, 10, 100, max)
- Added News heading for ticker accessibility
- Fixed buff list formatting issues
- Fixed live region announcements to show only the latest message

## Version 11

- Garden coordinates standardized to R#, C# format
- Improved garden responsiveness and soil labels
- Fixed minigame buttons not detected by screen reader
- Added season change notifications and current season display
- Added Available Buildings region
- Fixed wrinkler buttons not being read properly by NVDA
- Added wrinkler spawn announcements
- Improved shimmer fading alerts

## Version 9

- Garden minigame fully accessible with virtual grid navigation
- Enter Garden Grid button for arrow key navigation
- Seed selection dialog for empty plots
- Harvestable plants and available seeds sections
- Soil buttons work with keyboard (Enter/Space)
- Hidden FPS counter and undefined elements from screen readers

## Version 8

- Pantheon accessibility improvements with keyboard support
- Shimmer announcement system (removed buttons, kept live announcements)
