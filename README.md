# Cookie Clicker Access

This is a mod to make Cookie Clicker more accessible with NVDA on Steam.
This mod only works with the Steam version of the game, and might only work with NVDA.

## AI Disclaimer

All code in this mod was written by Claude (Anthropic's AI assistant). Human involvement was limited to prompting, direction, and QA testing.

## Installation

1. Download the latest release from the [Releases page](https://github.com/Amsel142857/Cookie-Clicker-Access/releases)
2. Extract the zip file
3. Copy the "nvdaAccessibility" folder to your Cookie Clicker mods folder:
   `[Steam Install Path]\steamapps\common\Cookie Clicker\resources\app\mods\local\`
4. Launch Cookie Clicker and enable the mod in Options > Mods

## Features

### Core Interface
- Buildings section organized under headings with accessible buttons
- "Time until affordable" displayed for buildings and upgrades
- Building production stats showing cookies per second (individual and total), plus percentage of total CPS
- Cookies per click display below the Big Cookie
- Milk progress display showing current milk type, rank, and percentage
- News ticker accessible as a heading region
- Bulk pricing support (buy 1, 10, 100, or max)

### Store and Upgrades
- Upgrade shop with full labels showing name, cost, effects, and flavor text
- Available Buildings region showing purchasable buildings

### Minigames
- **Garden**: Virtual grid navigation with arrow keys, seed selection dialogs, harvestable plants section, soil selection with keyboard support
- **Grimoire**: Spell names, costs, and effects displayed
- **Pantheon**: Spirit placement with keyboard support
- **Stock Market**: Stock prices and trading information accessible

### Prestige System
- Ascension UI fully accessible for browsing and purchasing Heavenly upgrades
- Permanent upgrade slots accessible via keyboard

### Special Features
- **Dragon (Krumblor)**: Aura slot selection accessible
- **Santa**: Progress tracking accessible
- **Shimmers**: Live announcements when Golden Cookies, Wrath Cookies, or Reindeer appear and when they're about to fade
- **Wrinklers**: Spawn announcements, accessible buttons to pop wrinklers with cookie reward information
- **Season changes**: Notifications when seasons change
- **Active Buffs panel**: Shows current buffs and effects
- **Sugar Lump timer**: Displays lump ripeness and harvest status

### Accessibility Enhancements
- Live region announcements for important game events
- Hidden FPS counter and irrelevant visual elements from screen readers
- Proper ARIA labels throughout the interface

## Known Issues

- **Statistics menu**: Some statistics content may not be fully accessible.

## Changelog

### Version 11.7
- Added bulk pricing support for buildings
- Added News heading for ticker accessibility
- Fixed buff list formatting issues
- Fixed live region announcements to show only the latest message

### Version 11
- Garden coordinates standardized to R#, C# format
- Improved garden responsiveness and soil labels
- Fixed minigame buttons not detected by screen reader
- Added season change notifications and current season display
- Added Available Buildings region
- Fixed wrinkler buttons not being read properly by NVDA
- Added wrinkler spawn announcements
- Improved shimmer fading alerts

### Version 9
- Garden minigame fully accessible with virtual grid navigation
- Enter Garden Grid button for arrow key navigation
- Seed selection dialog for empty plots
- Harvestable plants and available seeds sections
- Soil buttons work with keyboard (Enter/Space)
- Hidden FPS counter and undefined elements from screen readers

### Version 8
- Pantheon accessibility improvements with keyboard support
- Shimmer announcement system (removed buttons, kept live announcements)

## Credits

This mod is a fork of the original [Cookie Clicker NVDA Accessibility Mod](https://github.com/FioraXena/Cookie-Clicker-Enhanced-NVDA-Accessibility-Steam-Only-) by FioraXena.

Development is being continued by Amsel, who provides prompting, direction, and QA testing, with all code written by Claude (Anthropic's AI assistant).

Thanks to Orteil for creating Cookie Clicker!
