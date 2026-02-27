Game.registerMod("nvda accessibility", {
	init: function() {
		var MOD = this;
		this.createLiveRegion();
		this.createAssertiveLiveRegion();
		if (!Game.prefs.screenreader) { Game.prefs.screenreader = 1; }
		if (Game.volume !== undefined) { Game.volumeMusic = 0; }
		// Disable visual effects — useless for screen readers, frees up CPU
		Game.prefs.fancy = 0;
		Game.prefs.filters = 0;
		Game.prefs.particles = 0;
		Game.prefs.numbers = 0;
		Game.prefs.cursors = 0;
		Game.prefs.milk = 0;
		Game.prefs.wobbly = 0;
		if (Game.ToggleFancy) Game.ToggleFancy();
		if (Game.ToggleFilters) Game.ToggleFilters();
		this.lastVeilState = null;
		this.lastBuffs = {};
		this.lastAchievementCount = 0;
		this.wrinklerOverlays = [];
		this.lastLumpRipe = false;
		this.lastSeason = Game.season || '';
		// Shimmer tracking - announce on appear, fading, and faded
		this.announcedShimmers = {}; // Track shimmers: stores {variant, suppressed}
		this.fadingShimmers = {}; // Track shimmers we've announced as fading
		this.shimmerButtons = {}; // Track shimmer buttons by ID
		// Wrinkler tracking - announce once on spawn
		this.announcedWrinklers = {}; // Track wrinklers we've announced spawning
		// Rapid-fire event tracking (cookie chains, cookie storms)
		this.cookieChainActive = false;
		this.cookieStormActive = false;
		this.stormClickCount = 0;
		this.stormCookiesEarned = 0;
		// Prevent grimoire announcer from firing during shimmer clicks
		this.shimmerPopupActive = false;
		// Debounce for announceUrgent to prevent duplicate readings
		this._lastUrgentText = '';
		this._lastUrgentTime = 0;
		// Pending timeout IDs for live region updates (prevent stacking)
		this._announceTimeout = null;
		this._announceUrgentTimeout = null;
		// Override Game.DrawBuildings to inject accessibility labels
		MOD.overrideDrawBuildings();
		// Wrap Game.AssignPermanentSlot to label upgrade picker prompt
		MOD.wrapPermanentSlotFunctions();
		// Prevent game's crateTooltip from writing to ariaReader labels (causes VoiceOver oscillation)
		var origCrateTooltip = Game.crateTooltip;
		Game.crateTooltip = function(me, context) {
			var result = origCrateTooltip.apply(this, arguments);
			if (Game.prefs.screenreader && me && me.type === 'upgrade') {
				var ariaLabel = l('ariaReader-' + me.type + '-' + me.id);
				if (ariaLabel) ariaLabel.innerHTML = '';
			}
			return result;
		};
		// Disable the game's tooltip system entirely.
		// Tooltips cause focus jumping for screen reader users because the #tooltipAnchor
		// div sits after #sectionRight in the DOM, and the building tooltip() function
		// writes to ariaReader-product-* labels every 10 frames, competing with our labels.
		// The mod provides accessible alternatives for all tooltip content.
		var tooltipAnchor = l('tooltipAnchor');
		if (tooltipAnchor) { tooltipAnchor.style.display = 'none'; tooltipAnchor.setAttribute('aria-hidden', 'true'); }
		var tooltipEl = l('tooltip');
		if (tooltipEl) { tooltipEl.style.display = 'none'; tooltipEl.setAttribute('aria-hidden', 'true'); }
		if (Game.tooltip) {
			Game.tooltip.draw = function() {};
			Game.tooltip.update = function() {};
		}
		Game.getTooltip = function() { return ''; };
		Game.getDynamicTooltip = function() { return ''; };
		Game.attachTooltip = function() {};
		// Disable game keyboard shortcuts that conflict with screen reader navigation.
		// The game registers keydown/keyup handlers on `window` (bubble phase) that intercept
		// Tab, Enter, Escape, and arrow keys for prompt navigation and ascension panning.
		// It also tracks Shift/Ctrl in Game.keys[] to trigger bulk-buy mode.
		// We add bubble-phase listeners on `document` that stop propagation for conflicting
		// keys, preventing them from reaching the game's window-level handlers while still
		// allowing our mod's element-scoped handlers (Enter/Space on role="button" divs) to fire.
		var dominatedKeys = {
			9: true,   // Tab — core screen reader / browser focus navigation
			13: true,  // Enter — activates focused elements
			16: true,  // Shift — game uses for bulk-buy x100
			17: true,  // Ctrl — game uses for bulk-buy x10
			27: true,  // Escape — toggles NVDA browse/focus mode
			37: true,  // ArrowLeft
			38: true,  // ArrowUp
			39: true,  // ArrowRight
			40: true   // ArrowDown
		};
		document.addEventListener('keydown', function(e) {
			if (dominatedKeys[e.keyCode]) {
				e.stopPropagation();
				Game.keys[e.keyCode] = 0;
			}
		}, false); // false = bubble phase — fires after element handlers, before window handlers
		// Announce when Ctrl+S saves the game
		document.addEventListener('keydown', function(e) {
			if (e.ctrlKey && e.key === 's') {
				MOD.announce('Game saved.');
			}
		});
		// Escape closes open panels (menus, minigames, dragon, santa, milk selector)
		document.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				// Check prompts first (confirmations, dialogs)
				if (Game.promptOn && !Game.promptNoClose) {
					Game.ClosePrompt();
					e.preventDefault();
					return;
				}
				// Check menus (stats, options, info) — use Game.onMenu since
				// NVDA virtual cursor doesn't reliably set focus inside #menu
				if (Game.onMenu !== '') {
					var names = {stats: 'Statistics', prefs: 'Options', log: 'Info'};
					var buttons = {stats: 'statsButton', prefs: 'prefsButton', log: 'logButton'};
					var menuName = names[Game.onMenu] || Game.onMenu;
					var btnId = buttons[Game.onMenu];
					Game.ShowMenu(Game.onMenu); // pass current menu to toggle it off
					// Force NVDA virtual cursor to the menu button:
					// blur first, then focus after DOM settles
					if (document.activeElement) document.activeElement.blur();
					setTimeout(function() {
						if (btnId) {
							var btn = l(btnId);
							if (btn) {
								btn.setAttribute('tabindex', '-1');
								btn.focus();
								btn.setAttribute('tabindex', '0');
							}
						}
					}, 100);
					Game.mods['nvda accessibility'].announce(menuName + ' menu closed.');
					e.preventDefault();
					return;
				}
				var el = document.activeElement;
				if (!el) return;
				// Check minigame panels
				var row = el.closest('.onMinigame');
				if (row) {
					var rowId = row.id; // e.g. "row2"
					var bldId = parseInt(rowId.replace('row', ''));
					var bld = Game.ObjectsById[bldId];
					if (bld && bld.onMinigame) {
						var mgName = bld.minigameName || bld.name;
						bld.switchMinigame(false);
						Game.mods['nvda accessibility'].announce(mgName + ' closed');
						var mgBtn = l('productMinigameButton' + bldId);
						if (mgBtn) mgBtn.focus();
						e.preventDefault();
						return;
					}
				}
				// Check panels in sectionLeft (dragon, santa, milk selector)
				// NVDA virtual cursor may not set activeElement inside the panel directly,
				// so check if focus is anywhere in sectionLeft and close the most specific open panel
				var inSectionLeft = el.closest && el.closest('#sectionLeft');
				if (inSectionLeft) {
					// Check milk selector first (most specific)
					var milkPanel = l('a11yMilkSelectorPanel');
					if (milkPanel && milkPanel.contains(el)) {
						var milkUpg = Game.Upgrades['Milk selector'];
						if (milkUpg) milkUpg.buy();
						var milkCrate = Game.mods['nvda accessibility'].findSelectorCrate('Milk selector');
						if (milkCrate) milkCrate.focus();
						Game.mods['nvda accessibility'].announce('Milk selector closed');
						e.preventDefault();
						return;
					}
					// Check dragon panel
					var dragonPanel = l('a11yDragonPanel');
					if (dragonPanel) {
						Game.ToggleSpecialMenu(0);
						Game.mods['nvda accessibility'].announce('Krumblor the Dragon closed');
						var dragonBtn = l('a11ySpecialTab_dragon');
						if (dragonBtn) dragonBtn.focus();
						e.preventDefault();
						return;
					}
					// Check santa panel
					var santaPanel = l('a11ySantaPanel');
					if (santaPanel) {
						Game.ToggleSpecialMenu(0);
						Game.mods['nvda accessibility'].announce("Santa's Progress closed");
						var santaBtn = l('a11ySpecialTab_santa');
						if (santaBtn) santaBtn.focus();
						e.preventDefault();
						return;
					}
				}
			}
		}, false);
		document.addEventListener('keyup', function(e) {
			if (dominatedKeys[e.keyCode]) {
				e.stopPropagation();
				Game.keys[e.keyCode] = 0;
			}
		}, false);
		// Wrap each building's tooltip() to skip ariaReader-product-* label writes.
		// The game's tooltip function checks Game.prefs.screenreader and writes to those
		// labels (game-main.js ~8071-8086). We temporarily disable that flag during execution
		// so our populateProductLabels() remains the sole source of truth.
		for (var bId in Game.ObjectsById) {
			(function(building) {
				if (!building || !building.tooltip) return;
				var origTooltip = building.tooltip;
				building.tooltip = function() {
					var savedPref = Game.prefs.screenreader;
					Game.prefs.screenreader = 0;
					var result = origTooltip.apply(this, arguments);
					Game.prefs.screenreader = savedPref;
					return result;
				};
			})(Game.ObjectsById[bId]);
		}
		// Wrap Game.ShowMenu to announce menu open/close
		var origShowMenu = Game.ShowMenu;
		Game.ShowMenu = function(what) {
			var wasClosed = Game.onMenu === '';
			origShowMenu.apply(this, arguments);
			if (Game.onMenu !== '') {
				var names = {stats: 'Statistics', prefs: 'Options', log: 'Info'};
				MOD.announce((names[Game.onMenu] || Game.onMenu) + ' menu opened.');
			}
		};
		// Wrap Game.Prompt to make prompts accessible to screen readers
		var origPrompt = Game.Prompt;
		Game.Prompt = function(content, options, updateFunc, style) {
			origPrompt.apply(this, arguments);
			// Enhance the prompt for screen readers after the DOM is built
			setTimeout(function() {
				var promptWrap = l('prompt');
				var promptContent = l('promptContent');
				if (promptWrap) {
					promptWrap.setAttribute('role', 'dialog');
					promptWrap.setAttribute('aria-modal', 'true');
				}
				// Build readable text from prompt content
				var text = '';
				if (promptContent) {
					text = MOD.stripHtml(promptContent.innerHTML);
				}
				// Label and make option buttons accessible
				var optionLinks = promptContent ? promptContent.parentElement.querySelectorAll('a.option') : [];
				for (var i = 0; i < optionLinks.length; i++) {
					optionLinks[i].setAttribute('role', 'button');
					optionLinks[i].setAttribute('tabindex', '0');
					if (!optionLinks[i].dataset.a11yEnhanced) {
						optionLinks[i].dataset.a11yEnhanced = 'true';
						optionLinks[i].addEventListener('keydown', function(e) {
							if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
						});
					}
				}
				// Gift system: label inputs
				if (promptContent && (promptContent.innerHTML.indexOf('GiftSend') !== -1 || promptContent.innerHTML.indexOf('GiftRedeem') !== -1)) {
					var giftCode = l('giftCode');
					if (giftCode) giftCode.setAttribute('aria-label', 'Gift code');
					var giftAmount = l('giftAmount');
					if (giftAmount) giftAmount.setAttribute('aria-label', 'Gift amount');
					var giftMessage = l('giftMessage');
					if (giftMessage) giftMessage.setAttribute('aria-label', 'Gift message');
					var giftError = l('giftError');
					if (giftError) giftError.setAttribute('aria-live', 'polite');
				}
				// Focus the heading if present, otherwise first option
				var heading = promptContent ? promptContent.querySelector('h3') : null;
				if (heading) {
					heading.setAttribute('tabindex', '-1');
					heading.focus();
				} else if (optionLinks.length > 0) {
					optionLinks[0].focus();
				}
			}, 100);
		};
		// Notification system: categorize into startup / user-initiated / non-user-initiated
		// Startup: persistent visual, no live region
		// User-initiated: hidden visual, live region only (many already announced by other systems)
		// Non-user-initiated: persistent visual + live region
		var origNotifyGlobal = Game.Notify;
		var showPersistent = function(title, desc, pic, noLog) {
			origNotifyGlobal.call(Game, title, desc, pic, 0, noLog);
			setTimeout(function() { MOD.enhanceNotes(); }, 50);
		};
		var suppress = function(t, d, noLog) {
			if (!noLog) Game.AddToLog('<b>' + t + '</b>' + (d ? ' | ' + d : ''));
		};
		Game.Notify = function(title, desc, pic, quick, noLog) {
			var t = (title || '');
			var d = (desc || '');

			// ===== SHIMMER CLICKS (user-initiated, already announced) =====
			// shimmerPopupActive is set during golden cookie and reindeer pop handlers
			if (MOD.shimmerPopupActive) {
				suppress(t, d, noLog);
				return;
			}

			// ===== NON-USER-INITIATED: persistent + live region =====
			// Achievement unlocked (already announced by achievement tracker)
			if (t === loc("Achievement unlocked")) {
				showPersistent(title, desc, pic, noLog);
				return;
			}
			// Upgrade unlocked
			if (d.indexOf(loc("You've unlocked a new upgrade.")) >= 0) {
				showPersistent(title, desc, pic, noLog);
				MOD.announce('New upgrade unlocked: ' + MOD.stripHtml(t));
				return;
			}
			// Research (already announced via live region by lines below)
			if (t === loc("Research has begun")) {
				showPersistent(title, desc, pic, noLog);
				MOD.announce(t + '. ' + MOD.stripHtml(d));
				return;
			}
			if (t === loc("Research complete")) {
				showPersistent(title, desc, pic, noLog);
				MOD.announceUrgent(t + '. ' + MOD.stripHtml(d));
				return;
			}
			// Fortune! (news ticker spawns)
			if (t === loc("Fortune!")) {
				showPersistent(title, desc, pic, noLog);
				MOD.announce(MOD.stripHtml(t) + '. ' + MOD.stripHtml(d));
				return;
			}
			// Season ended by timer (already announced by season tracker)
			for (var s in Game.seasons) {
				if (Game.seasons[s].over && t.indexOf(Game.seasons[s].over) >= 0) {
					showPersistent(title, desc, pic, noLog);
					return;
				}
			}
			// How nice! Found cookies (garden passive harvest reward)
			if (t === loc("How nice!")) {
				showPersistent(title, desc, pic, noLog);
				MOD.announce(MOD.stripHtml(t) + ' ' + MOD.stripHtml(d));
				return;
			}

			// ===== USER-INITIATED: hidden visual, live region only =====
			// Game saved (already announced elsewhere)
			if (t === loc("Game saved")) {
				suppress(t, d, noLog);
				return;
			}
			// Game reset
			if (t === loc("Game reset")) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t) + '.');
				return;
			}
			// Ascending
			if (t === loc("Ascending")) {
				suppress(t, d, noLog);
				MOD.announce('Ascending.');
				return;
			}
			// Reincarnated
			if (t === 'Reincarnated') {
				suppress(t, d, noLog);
				MOD.announce('Reincarnated.');
				return;
			}
			// Exploded a wrinkler (already announced by wrinkler system)
			if (t === loc("Exploded a wrinkler") || t === loc("Exploded a shiny wrinkler")) {
				suppress(t, d, noLog);
				return;
			}
			// Wrinkler upgrade drop ("You also found...")
			if (d.indexOf(loc("You also found")) >= 0) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t) + ', ' + MOD.stripHtml(d));
				return;
			}
			// Chocolate egg
			if (t === 'Chocolate egg') {
				suppress(t, d, noLog);
				MOD.announce('Chocolate egg. ' + MOD.stripHtml(d));
				return;
			}
			// Sugar blessing activated
			if (t === loc("Sugar blessing activated!")) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t) + ' ' + MOD.stripHtml(d));
				return;
			}
			// Sugar lump cooldowns cleared
			if (t === loc("Sugar lump cooldowns cleared!")) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t));
				return;
			}
			// Sugar frenzy (buff tracker handles the buff)
			if (t === loc("Sugar frenzy!")) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t) + ' ' + MOD.stripHtml(d));
				return;
			}
			// Found an egg (Easter)
			if (t === loc("You found an egg!")) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t) + ' ' + MOD.stripHtml(d));
				return;
			}
			// Found a present / In the festive hat (Santa evolve)
			if (t === loc("Found a present!") || t === loc("In the festive hat, you find...")) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t) + ' ' + MOD.stripHtml(d));
				return;
			}
			// Santa's dominion granted ("You are granted...")
			var santaDominion = Game.Upgrades["Santa's dominion"];
			if (santaDominion && t.indexOf(santaDominion.dname || santaDominion.name) >= 0) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t));
				return;
			}
			// Dragon Orbs wish (from selling buildings)
			if (t === loc("Dragon Orbs") || t === 'Dragon Orbs!') {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t) + '. ' + MOD.stripHtml(d));
				return;
			}
			// Dragon dropped something (already announced by pet handler)
			if (d.indexOf(loc("Your dragon dropped something!")) >= 0) {
				suppress(t, d, noLog);
				return;
			}
			// Shimmering veil changes
			if (t === loc("The shimmering veil disappears...") || t === loc("The reinforced membrane protects the shimmering veil.")) {
				suppress(t, d, noLog);
				MOD.announce(MOD.stripHtml(t));
				return;
			}
			// Debug clicks
			if (t === 'Thou doth ruineth the fun!' || t === 'A good click.' || t === 'A solid click.' || t === 'A mediocre click.' || t === 'An excellent click!') {
				suppress(t, d, noLog);
				return;
			}

			// ===== STARTUP: persistent, no live region =====
			// Welcome back
			if (t === loc("Welcome back!")) {
				showPersistent(title, desc, pic, noLog);
				return;
			}
			// Broken mods
			if (t.indexOf(loc("Some mods couldn't be loaded:")) >= 0) {
				showPersistent(title, desc, pic, noLog);
				return;
			}
			// Back up your save
			if (t === loc("Back up your save!")) {
				showPersistent(title, desc, pic, noLog);
				return;
			}
			// Season start on load
			if (t === loc("Valentine's Day!") || t === loc("Business Day!") || t === loc("Halloween!") || t === loc("Christmas time!") || t === loc("Easter!")) {
				showPersistent(title, desc, pic, noLog);
				return;
			}
			// Sugar lumps introduction
			if (t === loc("Sugar lumps!")) {
				showPersistent(title, desc, pic, noLog);
				return;
			}
			// Sugar lumps harvested while away (title is empty)
			if (t === '' && d.indexOf(loc("%1 sugar lump")) >= 0) {
				showPersistent(title, desc, pic, noLog);
				return;
			}
			// Game loaded (brief, not useful — suppress)
			if (t === loc("Game loaded")) {
				suppress(t, d, noLog);
				return;
			}
			// Error notifications
			if (t === loc("Error while saving") || t === loc("Error importing save") || t === 'Saving failed!' || t === loc("Error!")) {
				showPersistent(title, desc, pic, noLog);
				return;
			}

			// ===== DEFAULT: pass through with original behavior =====
			origNotifyGlobal.call(this, title, desc, pic, quick, noLog);
			setTimeout(function() { MOD.enhanceNotes(); }, 50);
		};
		// Wrap Game.UpdateMenu to suppress rebuilds while a menu is open and already enhanced
		// Game.UpdateMenu() rebuilds menu innerHTML every 5 seconds, destroying NVDA's focus position
		var origUpdateMenu = Game.UpdateMenu;
		Game.UpdateMenu = function() {
			if (Game.onMenu === 'stats' || Game.onMenu === 'prefs' || Game.onMenu === 'log') {
				var menu = l('menu');
				if (menu) {
					var firstTitle = menu.querySelector('.subsection > .title');
					if (firstTitle && firstTitle.getAttribute('role') === 'heading') {
						// Menu is already enhanced — skip rebuild to preserve screen reader focus
						return;
					}
				}
			}
			origUpdateMenu.apply(this, arguments);
		};
		// Wrap Game.RebuildUpgrades to immediately re-label upgrades after DOM rebuild
		var origRebuildUpgrades = Game.RebuildUpgrades;
		Game.RebuildUpgrades = function() {
			// Save focused upgrade ID before DOM rebuild
			var focusedId = null;
			var ae = document.activeElement;
			if (ae && ae.dataset && ae.dataset.id) {
				var containers = [l('upgrades'), l('toggleUpgrades'), l('techUpgrades'), l('vaultUpgrades')];
				for (var ci = 0; ci < containers.length; ci++) {
					if (containers[ci] && containers[ci].contains(ae)) {
						focusedId = ae.dataset.id;
						break;
					}
				}
			}
			origRebuildUpgrades.apply(this, arguments);
			setTimeout(function() {
				MOD.enhanceUpgradeShop();
				// Restore focus to the same upgrade if it still exists
				if (focusedId) {
					var containers = [l('upgrades'), l('toggleUpgrades'), l('techUpgrades'), l('vaultUpgrades')];
					for (var ci = 0; ci < containers.length; ci++) {
						if (!containers[ci]) continue;
						var el = containers[ci].querySelector('[data-id="' + focusedId + '"]');
						if (el) { el.focus(); break; }
					}
				}
			}, 0);
		};
		// Wrap Game.ToggleSpecialMenu to create/remove accessible panels
		var origToggleSpecialMenu = Game.ToggleSpecialMenu;
		Game.ToggleSpecialMenu = function(on) {
			origToggleSpecialMenu.apply(this, arguments);
			if (!on) {
				// Restore popup visibility to screen readers when closing
				var popup = l('specialPopup');
				if (popup) popup.removeAttribute('aria-hidden');
			}
			setTimeout(function() {
				MOD.enhanceDragonUI();
				MOD.enhanceSantaUI();
			}, 50);
		};
		// Wrap Game.PickAscensionMode to label challenge mode crates in the prompt
		var origPickAscensionMode = Game.PickAscensionMode;
		Game.PickAscensionMode = function() {
			origPickAscensionMode.apply(this, arguments);
			setTimeout(function() { MOD.labelChallengeModeSelector(); }, 50);
		};
		// Wrap Game.BuildAscendTree to re-label heavenly upgrades after tree rebuild
		var origBuildAscendTree = Game.BuildAscendTree;
		Game.BuildAscendTree = function(justBought) {
			// Save focused heavenly upgrade ID before DOM rebuild
			var focusedUpgradeId = null;
			var ae = document.activeElement;
			if (ae && ae.id && ae.id.indexOf('heavenlyUpgrade') === 0) {
				focusedUpgradeId = ae.id;
			}
			origBuildAscendTree.apply(this, arguments);
			setTimeout(function() {
				MOD.cleanupAscensionTree();
				MOD.enhanceHeavenlyUpgrades();
				MOD.enhancePermanentUpgradeSlots();
				// Restore focus to the same heavenly upgrade if it still exists
				if (focusedUpgradeId) {
					var el = l(focusedUpgradeId);
					if (el) el.focus();
				}
			}, 50);
		};
		// Sugar lump state tracked every frame for click comparison
		MOD.trackedLumpState = { lumps: 0, lumpT: 0 };
		// Track which aura slot is being edited for inline picker
		MOD.editingAuraSlot = -1;
		MOD.selectedAuraForSlot = -1;
		MOD.initRetriesComplete = false;
		MOD.minigameInitDone = {};
		MOD.gardenBuildPanelWrapped = false;
		MOD.gardenBuildPlotWrapped = false;
		MOD.gardenPlotSnapshot = {};

		MOD.gardenPrevUnlockedTiles = 0;
		MOD.gardenPrevHarvests = -1;
		MOD.gardenSnapshotInitialized = false;
		MOD.stockMarketWrapped = false;
		MOD.highestOwnedBuildingId = -1;
		setTimeout(function() {
			// Hide floating text particles (Lucky, Frenzy, etc.) — already announced via live regions
			var particles = l('particles');
			if (particles) particles.setAttribute('aria-hidden', 'true');
			// Hide the background canvas from screen readers — dragon/santa tab buttons
			// are placed directly in sectionLeft as accessible replacements
			var bgCanvas = l('backgroundLeftCanvas');
			if (bgCanvas) { bgCanvas.setAttribute('aria-hidden', 'true'); bgCanvas.setAttribute('tabindex', '-1'); }
			MOD.closeMinigamesOnLoad = true;
			MOD.enhanceMainUI();
			MOD.enhanceUpgradeShop();
			MOD.enhanceAscensionUI();
			MOD.setupNewsTicker();
			MOD.setupGoldenCookieAnnouncements();
			MOD.createWrinklerOverlays();
			MOD.enhanceSugarLump();
			MOD.enhanceShimmeringVeil();
			MOD.enhanceDragonUI();
			MOD.enhanceSantaUI();
			MOD.enhanceQoLSelectors();
			MOD.setupMilkSelectorOverride();
			MOD.setupBackgroundSelectorOverride();
			MOD.setupSoundSelectorOverride();
			MOD.enhanceBuildingMinigames();
			MOD.startBuffTimer();
			// New modules
			MOD.createActiveBuffsPanel();
			MOD.createShimmerPanel();
			MOD.createMainInterfaceEnhancements();
			MOD.createGameStatsPanel();
			MOD.filterUnownedBuildings();
			MOD.labelBuildingLevels();
		}, 500);
		Game.registerHook('draw', function() {
			MOD.updateDynamicLabels();
		});
		// Track building count and store state for immediate label refresh on buy/sell
		MOD.lastBuildingsOwned = Game.BuildingsOwned;
		MOD.lastBuyMode = Game.buyMode;
		MOD.lastBuyBulk = Game.buyBulk;
		MOD.lastStoreRefresh = Game.storeToRefresh;
		Game.registerHook('reset', function(hard) {
			MOD.minigameInitDone = {};
			MOD.gardenBuildPanelWrapped = false;
			MOD.gardenBuildPlotWrapped = false;
			MOD.gardenPlotSnapshot = {};
	
			MOD.gardenPrevUnlockedTiles = 0;
			MOD.gardenPrevHarvests = -1;
			MOD.stockMarketWrapped = false;
			MOD.initRetriesComplete = false;
	
			var milkPanel = l('a11yMilkSelectorPanel');
			if (milkPanel) milkPanel.remove();
			setTimeout(function() {
				MOD.enhanceMainUI();
				MOD.enhanceUpgradeShop();
				MOD.createWrinklerOverlays();
				MOD.enhanceSugarLump();
				MOD.enhanceDragonUI();
				MOD.enhanceSantaUI();
				MOD.enhanceQoLSelectors();
				MOD.createActiveBuffsPanel();
				MOD.createShimmerPanel();
				MOD.createMainInterfaceEnhancements();
				MOD.createGameStatsPanel();
				MOD.filterUnownedBuildings();
			}, 100);
		});
		Game.Notify('Accessibility Enhanced', 'Version 13.6', [10, 0], 6);
		this.announce('NVDA Accessibility mod version 13.6 loaded.');
	},
	overrideDrawBuildings: function() {
		var MOD = this;
		// Store the original DrawBuildings function
		var originalDrawBuildings = Game.DrawBuildings;
		// Override with our wrapped version
		Game.DrawBuildings = function() {
			// Call the original function first
			var result = originalDrawBuildings.apply(this, arguments);
			// Now inject accessibility labels
			MOD.labelAllBuildings();
			return result;
		};
		console.log('[A11y Mod] Successfully overrode Game.DrawBuildings');
	},
	labelAllBuildings: function() {
		var MOD = this;
		// bld.l is the store product button (product{id}), NOT the building row.
		// Product button labels are handled by enhanceBuildingProduct().
		// Building row labels are handled by labelBuildingRows().
		// Here we only label minigame buttons (looked up by global ID).
		for (var i in Game.ObjectsById) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			var bldName = bld.name || 'Building';
			var mg = bld.minigame;
			var mgName = mg ? mg.name : '';
			var level = parseInt(bld.level) || 0;
			// Label the minigame button (in sectionLeft, looked up by global ID)
			var mgBtn = l('productMinigameButton' + bld.id);
			if (mgBtn) {
				var hasMinigame = bld.minigameUrl || bld.minigameName;
				var minigameUnlocked = level >= 1 && hasMinigame;
				if (minigameUnlocked && mg) {
					var isOpen = bld.onMinigame ? true : false;
					MOD.setAttributeIfChanged(mgBtn, 'aria-label', (isOpen ? 'Close ' : 'Open ') + mgName);
				} else if (minigameUnlocked) {
					MOD.setAttributeIfChanged(mgBtn, 'aria-label', 'Open ' + (mgName || bld.minigameName || 'minigame'));
				} else if (hasMinigame && level < 1) {
					MOD.setAttributeIfChanged(mgBtn, 'aria-label', 'Level up ' + bldName + ' to unlock ' + (mgName || bld.minigameName || 'minigame') + ' (1 sugar lump)');
				}
				if (hasMinigame) {
					MOD.setAttributeIfChanged(mgBtn, 'role', 'button');
					MOD.setAttributeIfChanged(mgBtn, 'tabindex', '0');
				} else {
					mgBtn.setAttribute('aria-hidden', 'true');
					MOD.setAttributeIfChanged(mgBtn, 'tabindex', '-1');
				}
			}
		}
		// Also label Special Tabs
		MOD.labelSpecialTabs();
	},
	labelSpecialTabs: function() {
		var MOD = this;
		// Special tabs (Dragon, Santa) are drawn on canvas with no HTML representation.
		// Create accessible HTML buttons directly in sectionLeft.
		var sectionLeft = l('sectionLeft');
		if (!sectionLeft) return;
		if (!Game.specialTabs || Game.specialTabs.length === 0) {
			// No special tabs available, remove any existing buttons
			sectionLeft.querySelectorAll('[data-special-tab]').forEach(function(btn) { btn.remove(); });
			return;
		}
		// Build the set of tabs that should exist
		var tabNames = {};
		for (var i = 0; i < Game.specialTabs.length; i++) {
			tabNames[Game.specialTabs[i]] = true;
		}
		// Remove buttons for tabs that no longer exist
		var existingBtns = sectionLeft.querySelectorAll('[data-special-tab]');
		for (var i = 0; i < existingBtns.length; i++) {
			if (!tabNames[existingBtns[i].dataset.specialTab]) {
				existingBtns[i].remove();
			}
		}
		// Reference point for insertion — before game stats panel
		var statsPanel = l('a11yGameStatsPanel');
		// Create or update buttons for each tab
		for (var i = 0; i < Game.specialTabs.length; i++) {
			var tabName = Game.specialTabs[i];
			var btnId = 'a11ySpecialTab_' + tabName;
			var btn = l(btnId);
			if (!btn) {
				btn = document.createElement('button');
				btn.type = 'button';
				btn.id = btnId;
				btn.dataset.specialTab = tabName;
				btn.style.cssText = 'width:48px;height:48px;pointer-events:auto;cursor:pointer;background:transparent;border:none;color:transparent;overflow:hidden;font-size:0;';
				btn.addEventListener('click', (function(name) {
					return function() {
						if (Game.specialTab === name) {
							Game.ToggleSpecialMenu(0);
						} else {
							Game.specialTab = name;
							Game.ToggleSpecialMenu(1);
						}
						PlaySound('snd/press.mp3');
					};
				})(tabName));
				if (statsPanel) {
					sectionLeft.insertBefore(btn, statsPanel);
				} else {
					sectionLeft.appendChild(btn);
				}
			}
			// Update label - changes based on open/closed state
			var label = '';
			var isSelected = (Game.specialTab === tabName);
			if (tabName === 'dragon') {
				label = isSelected ? 'Close Krumblor the Dragon' : 'Open Krumblor the Dragon';
			} else if (tabName === 'santa') {
				label = isSelected ? "Close Santa's Progress" : "Open Santa's Progress";
			} else {
				label = isSelected ? ('Close ' + tabName) : ('Open ' + tabName);
			}
			MOD.setAttributeIfChanged(btn, 'aria-label', label);
		}
	},
	createLiveRegion: function() {
		if (l('srAnnouncer')) return;
		var a = document.createElement('div');
		a.id = 'srAnnouncer';
		a.setAttribute('aria-live', 'assertive');
		a.setAttribute('aria-atomic', 'true');
		a.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
		document.body.appendChild(a);
		// Initialize the announcement queue
		this._announceQueue = [];
		this._announceProcessing = false;
	},
	createAssertiveLiveRegion: function() {
		// No longer needed — single live region handles both polite and urgent.
		// Remove old element if it exists from a previous session.
		var old = l('srAnnouncerUrgent');
		if (old) old.remove();
	},
	_estimateReadTime: function(text) {
		// Estimate how long NVDA takes to read a message.
		// Screen readers typically read at ~200 words per minute (~3.3 words/sec).
		// Minimum 1.5s so short messages aren't cut off.
		var words = text.split(/\s+/).length;
		return Math.max(1500, Math.ceil(words / 3.3 * 1000));
	},
	_processQueue: function() {
		var MOD = this;
		if (MOD._announceProcessing) return;
		if (MOD._announceQueue.length === 0) return;
		MOD._announceProcessing = true;
		var msg = MOD._announceQueue.shift();
		var a = l('srAnnouncer');
		if (!a) { MOD._announceProcessing = false; return; }
		// Clear then set after a tick so the screen reader detects the change
		a.textContent = '';
		setTimeout(function() {
			a.textContent = msg;
			var readTime = MOD._estimateReadTime(msg);
			setTimeout(function() {
				MOD._announceProcessing = false;
				MOD._processQueue();
			}, readTime);
		}, 50);
	},
	announce: function(t) {
		// Polite: add to end of queue
		this._announceQueue.push(t);
		this._processQueue();
	},
	announceUrgent: function(t) {
		var MOD = this;
		// Debounce: skip if identical text was announced within last 500ms
		var now = Date.now();
		if (t === MOD._lastUrgentText && now - MOD._lastUrgentTime < 500) return;
		MOD._lastUrgentText = t;
		MOD._lastUrgentTime = now;
		// Urgent: jump to front of queue
		MOD._announceQueue.unshift(t);
		// If currently processing, interrupt by resetting and processing immediately
		if (MOD._announceProcessing) {
			MOD._announceProcessing = false;
		}
		MOD._processQueue();
	},
	// Helper functions to prevent unnecessary DOM mutations
	// Only update attributes/text if the value has actually changed
	// This prevents VoiceOver from constantly re-reading unchanged labels
	setAttributeIfChanged: function(element, attributeName, newValue) {
		if (!element) return;
		var currentValue = element.getAttribute(attributeName);
		if (currentValue !== newValue) {
			element.setAttribute(attributeName, newValue);
		}
	},
	setTextIfChanged: function(element, newText) {
		if (!element) return;
		if (element.textContent !== newText) {
			element.textContent = newText;
		}
	},
	getBuildingLevelLabel: function(bld) {
		var level = parseInt(bld.level) || 0;
		var lumpCost = level + 1;
		var canAfford = Game.lumps >= lumpCost;
		var label = bld.name + ' Level ' + level;
		if (level > 0) {
			label += ', grants +' + level + '% ' + bld.name + ' CpS';
		}
		label += '. Upgrade for ' + lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : '');
		label += canAfford ? ', can afford' : ', cannot afford';
		if (level === 0 && bld.minigameUrl) {
			label += '. Levelling up unlocks a minigame';
		}
		return label;
	},
	findSelectorCrate: function(upgradeName) {
		var upg = Game.Upgrades[upgradeName];
		if (!upg) return null;
		var container = l('toggleUpgrades');
		if (!container) return null;
		return container.querySelector('[data-id="' + upg.id + '"]');
	},
	createWrinklerOverlays: function() {
		var MOD = this;
		MOD.wrinklerOverlays.forEach(function(o) { if (o && o.parentNode) o.parentNode.removeChild(o); });
		MOD.wrinklerOverlays = [];
		var c = l('wrinklerOverlayContainer');
		if (!c) {
			c = document.createElement('div');
			c.id = 'wrinklerOverlayContainer';
			c.style.cssText = 'background:#2a1a1a;border:2px solid #a66;padding:10px;margin:10px 0;';
			// Add heading
			var heading = document.createElement('h2');
			heading.id = 'a11yWrinklersHeading';
			heading.textContent = 'Wrinklers';
			heading.style.cssText = 'color:#faa;margin:0 0 10px 0;font-size:16px;';
			c.appendChild(heading);
			// Insert before shimmer panel at end of document.body for flat navigation
			var shimmerPanel = l('a11yShimmerContainer');
			if (shimmerPanel) {
				document.body.insertBefore(c, shimmerPanel);
			} else {
				var srAnnouncer = l('srAnnouncer');
				if (srAnnouncer) {
					document.body.insertBefore(c, srAnnouncer);
				} else {
					document.body.appendChild(c);
				}
			}
		} else {
			// Remove old elements if they exist
			var oldNoWrinklersMsg = l('a11yNoWrinklersMsg');
			if (oldNoWrinklersMsg) oldNoWrinklersMsg.remove();
			var oldBtnContainer = l('wrinklerButtonContainer');
			if (oldBtnContainer) oldBtnContainer.remove();
		}
		// Create "no wrinklers" message
		var noWrinklersMsg = document.createElement('div');
		noWrinklersMsg.id = 'a11yNoWrinklersMsg';
		noWrinklersMsg.setAttribute('tabindex', '0');
		noWrinklersMsg.style.cssText = 'padding:8px;color:#ccc;font-size:12px;';
		noWrinklersMsg.textContent = 'No wrinklers present.';
		c.appendChild(noWrinklersMsg);

		// Create container with list semantics for wrinkler buttons
		var btnContainer = document.createElement('div');
		btnContainer.id = 'wrinklerButtonContainer';
		btnContainer.setAttribute('role', 'list');
		c.appendChild(btnContainer);

		for (var i = 0; i < 12; i++) {
			// Wrapper provides listitem role without overriding button semantics
			var wrapper = document.createElement('div');
			wrapper.setAttribute('role', 'listitem');
			wrapper.style.cssText = 'display:inline-block;';

			var btn = document.createElement('button');
			btn.id = 'wrinklerOverlay' + i;
			btn.setAttribute('tabindex', '0');
			btn.style.cssText = 'padding:8px 12px;background:#1a1a1a;color:#fff;border:1px solid #666;cursor:pointer;font-size:12px;margin:2px;';
			btn.textContent = 'Empty wrinkler slot';
			(function(idx) {
				btn.addEventListener('click', function() {
					var w = Game.wrinklers[idx];
					if (w && w.phase > 0) {
						// Calculate cookies recovered before popping
						var sucked = w.sucked;
						var reward = sucked * 1.1; // Wrinklers give 110% back
						if (w.type === 1) reward *= 3; // Shiny wrinklers give 3x
						w.hp = 0;
						var rewardText = Beautify(reward);
						MOD.announce('Recovered ' + rewardText + ' cookies.');
						// Update labels immediately so hidden slots are current
						MOD.updateWrinklerLabels();
						// Move focus to nearest visible wrinkler (search forward, then backward)
						var nextFound = false;
						for (var ni = idx + 1; ni < MOD.wrinklerOverlays.length; ni++) {
							var nBtn = MOD.wrinklerOverlays[ni];
							if (nBtn && nBtn.parentNode && nBtn.parentNode.style.display !== 'none') {
								nBtn.focus();
								nextFound = true;
								break;
							}
						}
						if (!nextFound) {
							for (var ni = idx - 1; ni >= 0; ni--) {
								var nBtn = MOD.wrinklerOverlays[ni];
								if (nBtn && nBtn.parentNode && nBtn.parentNode.style.display !== 'none') {
									nBtn.focus();
									nextFound = true;
									break;
								}
							}
						}
						if (!nextFound) {
							var noMsg = l('a11yNoWrinklersMsg');
							if (noMsg) noMsg.focus();
						}
					}
				});
				btn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
				});
			})(i);
			wrapper.appendChild(btn);
			btnContainer.appendChild(wrapper);
			MOD.wrinklerOverlays.push(btn);
		}
	},
	updateWrinklerLabels: function() {
		var MOD = this;
		if (!Game.wrinklers) return;
		var activeCount = 0;
		var currentWrinklers = {}; // Track which slots have active wrinklers this frame

		for (var i = 0; i < Game.wrinklers.length && i < MOD.wrinklerOverlays.length; i++) {
			var w = Game.wrinklers[i], o = MOD.wrinklerOverlays[i];
			if (!o) continue;
			if (w && w.phase > 0) {
				activeCount++;
				currentWrinklers[i] = true;
				var t = w.type === 1 ? 'Shiny ' : '';
				var label = t + 'Wrinkler: ';
				if (Game.Has('Eye of the wrinkler')) {
					label += Beautify(w.sucked) + ' cookies sucked. ';
				}
				label = label.trim();
				o.textContent = label;
				o.parentNode.style.display = 'inline-block';

				// Announce new wrinkler spawn (only once per wrinkler)
				if (!MOD.announcedWrinklers[i]) {
					MOD.announcedWrinklers[i] = true;
					var wrinklerType = w.type === 1 ? 'A shiny wrinkler' : 'A wrinkler';
					MOD.announceUrgent(wrinklerType + ' has appeared!');
				}
			} else {
				o.textContent = 'Empty wrinkler slot';
				o.parentNode.style.display = 'none';
			}
		}

		// Clean up tracking for wrinklers that no longer exist (popped or gone)
		for (var id in MOD.announcedWrinklers) {
			if (!currentWrinklers[id]) {
				delete MOD.announcedWrinklers[id];
			}
		}

		// Show/hide the "no wrinklers" message
		var noWrinklersMsg = l('a11yNoWrinklersMsg');
		if (noWrinklersMsg) {
			noWrinklersMsg.style.display = activeCount > 0 ? 'none' : 'block';
		}
	},
	createShimmerPanel: function() {
		var MOD = this;
		// Remove existing container if present
		var existing = l('a11yShimmerContainer');
		if (existing) existing.remove();

		// Create container with gold theme
		var c = document.createElement('div');
		c.id = 'a11yShimmerContainer';
		c.style.cssText = 'background:#2a2a1a;border:2px solid #d4af37;padding:10px;margin:10px 0;';

		// Add heading
		var heading = document.createElement('h2');
		heading.id = 'a11yShimmersHeading';
		heading.textContent = 'Shimmers';
		heading.style.cssText = 'color:#ffd700;margin:0 0 10px 0;font-size:16px;';
		c.appendChild(heading);

		// Create "no shimmers" message
		var noShimmersMsg = document.createElement('div');
		noShimmersMsg.id = 'a11yNoShimmersMsg';
		noShimmersMsg.setAttribute('tabindex', '0');
		noShimmersMsg.style.cssText = 'padding:8px;color:#ccc;font-size:12px;';
		noShimmersMsg.textContent = 'No active shimmers.';
		c.appendChild(noShimmersMsg);

		// Create button container
		var btnContainer = document.createElement('div');
		btnContainer.id = 'a11yShimmerButtonContainer';
		btnContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
		c.appendChild(btnContainer);

		// Insert right before the live regions at the end of document.body
		// so up-arrowing from an announcement lands directly on shimmer buttons
		var srAnnouncer = l('srAnnouncer');
		if (srAnnouncer) {
			document.body.insertBefore(c, srAnnouncer);
		} else {
			document.body.appendChild(c);
		}

		// Clear shimmer buttons tracking
		MOD.shimmerButtons = {};
	},
	updateShimmerButtons: function() {
		var MOD = this;
		if (!Game.shimmers) return;

		var btnContainer = l('a11yShimmerButtonContainer');
		if (!btnContainer) return;

		var currentShimmerIds = {};
		var stormDropCount = 0;

		var chainActive = MOD.cookieChainActive;

		// Process each active shimmer
		Game.shimmers.forEach(function(shimmer) {
			var id = shimmer.id;

			// Skip individual storm drop buttons — handled by collective button below
			var isStormDrop = shimmer.forceObj && shimmer.forceObj.type === 'cookie storm drop';
			if (isStormDrop) {
				stormDropCount++;
				return;
			}

			// Skip individual buttons during chains — handled by persistent chain button below
			if (chainActive && shimmer.type === 'golden') return;

			currentShimmerIds[id] = true;

			// Get variant name
			var variant = MOD.getShimmerVariantName(shimmer);

			// Calculate time remaining in seconds
			var timeRemaining = shimmer.life !== undefined ? Math.ceil(shimmer.life / Game.fps) : 0;

			// Create aria-label with variant, time, and instruction
			var label = variant + '. ' + timeRemaining + ' seconds remaining. Click to collect.';

			// Check if button already exists
			var btn = MOD.shimmerButtons[id];
			if (btn) {
				// Update existing button's label
				btn.setAttribute('aria-label', label);
				btn.textContent = variant + ' (' + timeRemaining + 's)';
			} else {
				// Create new button
				btn = document.createElement('button');
				btn.id = 'a11yShimmerBtn_' + id;
				btn.setAttribute('tabindex', '0');
				btn.style.cssText = 'padding:8px 12px;background:#3a3a1a;color:#ffd700;border:2px solid #d4af37;cursor:pointer;font-size:12px;font-weight:bold;';
				btn.setAttribute('aria-label', label);
				btn.textContent = variant + ' (' + timeRemaining + 's)';

				// Click handler
				(function(shimmerId) {
					btn.addEventListener('click', function() {
						// Find the shimmer by ID
						var targetShimmer = null;
						for (var i = 0; i < Game.shimmers.length; i++) {
							if (Game.shimmers[i].id === shimmerId) {
								targetShimmer = Game.shimmers[i];
								break;
							}
						}
						if (targetShimmer) {
							targetShimmer.pop();
						}
					});
					btn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							btn.click();
						}
					});
				})(id);

				btnContainer.appendChild(btn);
				MOD.shimmerButtons[id] = btn;
			}
		});

		// Cookie chain persistent button — stays in place so user keeps focus
		var chainBtn = l('a11yChainCollectBtn');
		if (chainActive) {
			// Find the current chain golden cookie
			var chainShimmer = null;
			for (var i = 0; i < Game.shimmers.length; i++) {
				if (Game.shimmers[i].type === 'golden') {
					chainShimmer = Game.shimmers[i];
					break;
				}
			}
			if (!chainShimmer) {
				// Chain is active but no golden cookie on screen — chain likely just ended
				if (chainBtn) chainBtn.remove();
			} else {
				var chainTime = chainShimmer.life !== undefined ? Math.ceil(chainShimmer.life / Game.fps) : 0;
				var chainStep = (Game.shimmerTypes['golden'] && Game.shimmerTypes['golden'].chain) || 0;
				var chainLabel = 'Chain cookie, step ' + chainStep + '. ' + chainTime + ' seconds remaining. Click repeatedly to continue chain.';
				if (!chainBtn) {
					chainBtn = document.createElement('button');
					chainBtn.id = 'a11yChainCollectBtn';
					chainBtn.setAttribute('tabindex', '0');
					chainBtn.style.cssText = 'padding:8px 12px;background:#3a3a1a;color:#ffd700;border:2px solid #d4af37;cursor:pointer;font-size:12px;font-weight:bold;';
					chainBtn.addEventListener('click', function() {
						// Only pop if an active golden shimmer exists
						for (var i = 0; i < Game.shimmers.length; i++) {
							if (Game.shimmers[i].type === 'golden') {
								Game.shimmers[i].pop();
								return;
							}
						}
					});
					chainBtn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							chainBtn.click();
						}
					});
					btnContainer.appendChild(chainBtn);
					chainBtn.focus();
				}
				chainBtn.setAttribute('aria-label', chainLabel);
				chainBtn.textContent = 'Chain cookie step ' + chainStep + ' (' + chainTime + 's)';
			}
		} else if (chainBtn) {
			chainBtn.remove();
		}

		// Storm drop collective button — one button to click repeatedly
		var stormBtn = l('a11yStormCollectBtn');
		if (stormDropCount > 0) {
			if (!stormBtn) {
				stormBtn = document.createElement('button');
				stormBtn.id = 'a11yStormCollectBtn';
				stormBtn.setAttribute('tabindex', '0');
				stormBtn.style.cssText = 'padding:8px 12px;background:#3a3a1a;color:#ffd700;border:2px solid #d4af37;cursor:pointer;font-size:12px;font-weight:bold;';
				stormBtn.addEventListener('click', function() {
					// Pop the first available storm drop
					for (var i = 0; i < Game.shimmers.length; i++) {
						var s = Game.shimmers[i];
						if (s.forceObj && s.forceObj.type === 'cookie storm drop') {
							s.pop();
							return;
						}
					}
				});
				stormBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						stormBtn.click();
					}
				});
				btnContainer.appendChild(stormBtn);
			}
			stormBtn.setAttribute('aria-label', 'Collect storm cookie. ' + stormDropCount + ' available. Click repeatedly to collect.');
			stormBtn.textContent = 'Collect storm cookie (' + stormDropCount + ')';
		} else if (stormBtn) {
			stormBtn.remove();
		}

		// Remove buttons for shimmers that no longer exist
		for (var id in MOD.shimmerButtons) {
			if (!currentShimmerIds[id]) {
				var btn = MOD.shimmerButtons[id];
				if (btn && btn.parentNode) {
					btn.parentNode.removeChild(btn);
				}
				delete MOD.shimmerButtons[id];
			}
		}

		// Show/hide the "no shimmers" message
		var noShimmersMsg = l('a11yNoShimmersMsg');
		if (noShimmersMsg) {
			noShimmersMsg.style.display = (Game.shimmers.length > 0) ? 'none' : 'block';
		}
	},
	enhanceSugarLump: function() {
		var lc = l('lumps');
		if (!lc) return;
		lc.setAttribute('role', 'button');
		lc.setAttribute('tabindex', '0');
		// Hide child elements (icons, count div) so only aria-label is read
		for (var ci = 0; ci < lc.children.length; ci++) {
			lc.children[ci].setAttribute('aria-hidden', 'true');
		}
		if (!lc.dataset.a11yEnhanced) {
			lc.dataset.a11yEnhanced = 'true';
			lc.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lc.click(); }
			});
			lc.addEventListener('click', function() {
				// Compare against frame-tracked state (set every frame in updateDynamicLabels)
				// This works even when NVDA intercepts Enter and our keydown never fires
				var pre = MOD.trackedLumpState;
				setTimeout(function() {
					var gained = Game.lumps - pre.lumps;
					var harvested = (Game.lumpT !== pre.lumpT);
					if (harvested) {
						if (gained > 0) {
							MOD.announce('Harvested ' + gained + ' sugar lump' + (gained !== 1 ? 's' : '') + '. You now have ' + Beautify(Game.lumps) + ' lumps.');
						} else {
							MOD.announce('Botched harvest. You still have ' + Beautify(Game.lumps) + ' lumps.');
						}
					} else {
						var age = Date.now() - Game.lumpT;
						if (age < Game.lumpMatureAge) {
							MOD.announce('Sugar lump is not mature yet. Cannot harvest.');
						} else {
							MOD.announce('Cannot harvest sugar lump right now.');
						}
					}
					MOD.updateSugarLumpLabel();
				}, 100);
			});
		}
	},
	updateSugarLumpLabel: function() {
		var MOD = this;
		var lc = l('lumps');
		if (!lc || Game.lumpT === undefined) return;
		var types = ['Normal', 'Bifurcated', 'Golden', 'Meaty', 'Caramelized'];
		var type = types[Game.lumpCurrentType] || 'Normal';
		var age = Date.now() - Game.lumpT;
		var ripeRemaining = Game.lumpRipeAge - age;
		var matureRemaining = Game.lumpMatureAge - age;
		var isRipeNow = ripeRemaining <= 0;
		var isMature = matureRemaining <= 0;
		var status = '';
		if (isRipeNow) status = 'Ripe and ready to harvest';
		else if (isMature) status = 'Mature, 50% chance of yielding nothing. Ripe in ' + this.formatTime(ripeRemaining);
		else status = 'Growing. Mature in ' + this.formatTime(matureRemaining);
		// Add type-specific description when the type is revealed (phase >= 3)
		var typeDesc = '';
		var phase = (age / Game.lumpOverripeAge) * 7;
		if (phase >= 3 && Game.lumpCurrentType !== 0) {
			if (Game.lumpCurrentType === 1) typeDesc = 'Bifurcated, 50% chance of yielding two lumps';
			else if (Game.lumpCurrentType === 2) typeDesc = 'Golden, yields 2 to 7 lumps, doubles your cookies (capped at 24 hours of CpS), and 10% more golden cookies for 24 hours';
			else if (Game.lumpCurrentType === 3) typeDesc = 'Meaty, yields between 0 and 2 lumps';
			else if (Game.lumpCurrentType === 4) typeDesc = 'Caramelized, yields 1 to 3 lumps and refills sugar lump cooldowns';
		}
		var label = type + ' sugar lump. ' + status + '. You have ' + Beautify(Game.lumps) + ' lumps.';
		if (typeDesc) label += ' ' + typeDesc + '.';
		lc.setAttribute('aria-label', label);
		// Announce when lump becomes ripe (one-time)
		if (isRipeNow && !MOD.lastLumpRipe) {
			MOD.announce('Sugar lump is now ripe! ' + type + ' lump ready to harvest.');
		}
		MOD.lastLumpRipe = isRipeNow;
	},
	enhanceShimmeringVeil: function() { this.lastVeilState = this.getVeilState(); },
	getVeilState: function() {
		var v = Game.Upgrades['Shimmering veil [on]'];
		return v ? (v.bought ? 'active' : 'broken') : null;
	},
	checkVeilState: function() {
		var s = this.getVeilState();
		if (s === null) return;
		if (this.lastVeilState === 'active' && s === 'broken') this.announceUrgent('Shimmering Veil Broken!');
		this.lastVeilState = s;
	},
	enhanceDragonUI: function() {
		var MOD = this;
		if (Game.specialTab !== 'dragon') {
			var existing = l('a11yDragonPanel');
			if (existing) existing.remove();
			return;
		}
		// Hide the game's visual popup from screen readers when our panel replaces it
		var popup = l('specialPopup');
		if (popup) popup.setAttribute('aria-hidden', 'true');
		MOD.createDragonPanel();
	},
	createDragonPanel: function() {
		var MOD = this;
		var level = Game.dragonLevel || 0;
		var levelInfo = Game.dragonLevels ? Game.dragonLevels[level] : null;
		// Remove old panel and rebuild with current state
		var oldPanel = l('a11yDragonPanel');
		if (oldPanel) oldPanel.remove();
		// Insert directly after the dragon tab button in sectionLeft
		var insertAfter = l('a11ySpecialTab_dragon');
		if (!insertAfter) return;
		var panel = document.createElement('div');
		panel.id = 'a11yDragonPanel';
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #c90;padding:10px;margin:10px 0;';
		// Heading
		var heading = document.createElement('h3');
		heading.style.cssText = 'color:#fc0;margin:0 0 10px 0;font-size:14px;';
		heading.textContent = (levelInfo ? levelInfo.name : 'Krumblor') + ', level ' + level;
		panel.appendChild(heading);
		// Pet button
		if (level >= 4 && Game.Has('Pet the dragon')) {
			var petBtn = document.createElement('button');
			petBtn.type = 'button';
			petBtn.textContent = 'Pet Krumblor';
			petBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:5px 0;background:#363;border:1px solid #6a6;color:#fff;cursor:pointer;';
			petBtn.addEventListener('click', function() {
				var capturedDrop = '';
				var origNotify = Game.Notify;
				Game.Notify = function(title, desc, pic, quick, noLog) {
					capturedDrop = title;
					origNotify.call(Game, title, desc, pic, quick, noLog);
				};
				Game.ClickSpecialPic();
				Game.Notify = origNotify;
				if (capturedDrop) {
					MOD.announce('Petted Krumblor. Dragon dropped ' + capturedDrop + '!');
				} else {
					MOD.announce('Petted Krumblor');
				}
			});
			panel.appendChild(petBtn);
		}
		// Upgrade button
		if (level < Game.dragonLevels.length - 1) {
			var upgradeBtn = document.createElement('button');
			upgradeBtn.type = 'button';
			var upgradeLbl = 'Upgrade Krumblor';
			if (levelInfo) {
				if (levelInfo.action) upgradeLbl = MOD.stripHtml(levelInfo.action);
				if (levelInfo.costStr) upgradeLbl += '. Cost: ' + MOD.stripHtml(levelInfo.costStr());
			}
			upgradeBtn.textContent = upgradeLbl;
			upgradeBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:5px 0;background:#336;border:1px solid #66a;color:#fff;cursor:pointer;';
			upgradeBtn.addEventListener('click', function() {
				var prevLevel = Game.dragonLevel;
				var prevName = Game.dragonLevels[prevLevel] ? Game.dragonLevels[prevLevel].name : '';
				Game.UpgradeDragon();
				if (Game.dragonLevel > prevLevel) {
					var newLevelInfo = Game.dragonLevels[Game.dragonLevel];
					var newName = newLevelInfo ? MOD.stripHtml(newLevelInfo.name) : '';
					if (newName && newName !== prevName) {
						MOD.announce('Dragon upgraded to ' + newName + '.');
					} else {
						MOD.announce('Dragon upgraded.');
					}
				} else {
					MOD.announce('Cannot afford dragon upgrade.');
				}
			});
			panel.appendChild(upgradeBtn);
		} else {
			var maxDiv = document.createElement('div');
			maxDiv.style.cssText = 'color:#aaa;padding:4px 0;';
			maxDiv.textContent = levelInfo ? MOD.stripHtml(levelInfo.action) : 'Fully trained';
			panel.appendChild(maxDiv);
		}
		// Aura slots
		if (level >= 5 && Game.dragonAuras) {
			var auraHeading = document.createElement('h4');
			auraHeading.style.cssText = 'color:#fc0;margin:10px 0 5px 0;font-size:13px;';
			auraHeading.textContent = 'Dragon Auras';
			panel.appendChild(auraHeading);
			// Slot 1
			MOD.createAuraSlotUI(panel, 0);
			// Slot 2 (unlocked at level 27)
			if (level >= 27) {
				MOD.createAuraSlotUI(panel, 1);
			} else {
				var lockedSlot = document.createElement('div');
				lockedSlot.textContent = 'Aura slot 2: Locked. Unlocks at dragon level 27.';
				lockedSlot.style.cssText = 'display:block;width:100%;padding:8px;margin:3px 0;background:#333;border:1px solid #555;color:#888;text-align:left;';
				panel.appendChild(lockedSlot);
			}
		}
		insertAfter.parentNode.insertBefore(panel, insertAfter.nextSibling);
	},
	createAuraSlotUI: function(container, slotNum) {
		var MOD = this;
		var currentAura = slotNum === 0 ? Game.dragonAura : Game.dragonAura2;
		var auraInfo = Game.dragonAuras ? Game.dragonAuras[currentAura] : null;
		var auraName = auraInfo ? (auraInfo.dname || auraInfo.name) : 'None';
		var auraDesc = auraInfo && auraInfo.desc ? MOD.stripHtml(auraInfo.desc) : '';
		var slotBtn = document.createElement('button');
		slotBtn.type = 'button';
		slotBtn.id = 'a11yAuraSlotBtn' + slotNum;
		var slotText = 'Aura slot ' + (slotNum + 1) + ': ' + auraName;
		if (auraDesc) slotText += '. ' + auraDesc;
		slotBtn.textContent = slotText;
		slotBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:3px 0;background:#333;border:1px solid #666;color:#fff;cursor:pointer;text-align:left;';
		// Placeholder for inline picker
		var pickerContainer = document.createElement('div');
		pickerContainer.id = 'a11yAuraPicker' + slotNum;
		slotBtn.addEventListener('click', function() {
			PlaySound('snd/tick.mp3');
			MOD.toggleInlineAuraPicker(slotNum, pickerContainer, slotBtn);
		});
		container.appendChild(slotBtn);
		container.appendChild(pickerContainer);
		// If this slot was being edited, reopen the picker
		if (MOD.editingAuraSlot === slotNum) {
			MOD.toggleInlineAuraPicker(slotNum, pickerContainer, slotBtn);
		}
	},
	toggleInlineAuraPicker: function(slotNum, container, triggerBtn) {
		var MOD = this;
		// If already open for this slot, close it
		if (container.childNodes.length > 0) {
			container.innerHTML = '';
			MOD.editingAuraSlot = -1;
			MOD.selectedAuraForSlot = -1;
			triggerBtn.focus();
			return;
		}
		// Close any other open picker
		var otherSlot = slotNum === 0 ? 1 : 0;
		var otherPicker = l('a11yAuraPicker' + otherSlot);
		if (otherPicker) otherPicker.innerHTML = '';
		var wasAlreadyEditing = (MOD.editingAuraSlot === slotNum);
		MOD.editingAuraSlot = slotNum;
		var currentAura = slotNum === 0 ? Game.dragonAura : Game.dragonAura2;
		var otherAura = slotNum === 0 ? Game.dragonAura2 : Game.dragonAura;
		// Only reset selection when freshly opening, not during panel rebuilds
		if (!wasAlreadyEditing || MOD.selectedAuraForSlot < 0) {
			MOD.selectedAuraForSlot = currentAura;
		}
		// Cost info
		var highestBuilding = 0;
		for (var i in Game.Objects) { if (Game.Objects[i].amount > 0) highestBuilding = Game.Objects[i]; }
		var picker = document.createElement('div');
		picker.style.cssText = 'background:#222;border:1px solid #c90;padding:8px;margin:4px 0;';
		// Cost warning
		var costDiv = document.createElement('div');
		costDiv.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:8px;';
		if (highestBuilding === 0) {
			costDiv.textContent = 'Switching aura is free because you own no buildings.';
		} else {
			costDiv.textContent = 'Cost to switch: 1 ' + highestBuilding.single + '. This will affect your CpS.';
		}
		picker.appendChild(costDiv);
		// Aura buttons
		var firstBtn = null;
		for (var i in Game.dragonAuras) {
			var aId = parseInt(i);
			if (Game.dragonLevel < aId + 4) continue;
			if (aId !== 0 && aId == otherAura) continue; // Can't pick same aura as other slot
			var aura = Game.dragonAuras[aId];
			var name = aura.dname || aura.name;
			var desc = aura.desc ? MOD.stripHtml(aura.desc) : '';
			var isCurrent = (aId === currentAura);
			var isPickedNow = (aId === MOD.selectedAuraForSlot);
			var auraBtn = document.createElement('button');
			auraBtn.type = 'button';
			var prefix = isCurrent ? 'Current aura. ' : '';
			if (isPickedNow && !isCurrent) prefix = 'Selected. ';
			auraBtn.textContent = prefix + name + (desc ? '. ' + desc : '');
			auraBtn.style.cssText = 'display:block;width:100%;padding:6px 8px;margin:2px 0;background:' + (isPickedNow ? '#453' : '#333') + ';border:1px solid ' + (isPickedNow ? '#6a6' : '#555') + ';color:#fff;cursor:pointer;text-align:left;font-size:13px;';
			auraBtn.dataset.auraId = aId;
			(function(id, btn, curAura) {
				btn.addEventListener('click', function() {
					MOD.selectedAuraForSlot = id;
					// Update highlight and aria-labels on all buttons in picker
					var allBtns = picker.querySelectorAll('button[data-aura-id]');
					for (var j = 0; j < allBtns.length; j++) {
						var bId = parseInt(allBtns[j].dataset.auraId);
						var isSelected = (bId === id);
						var bIsCurrent = (bId === curAura);
						allBtns[j].style.background = isSelected ? '#453' : '#333';
						allBtns[j].style.borderColor = isSelected ? '#6a6' : '#555';
						var bAura = Game.dragonAuras[bId];
						var bName = bAura.dname || bAura.name;
						var bDesc = bAura.desc ? MOD.stripHtml(bAura.desc) : '';
						var bPrefix = bIsCurrent ? 'Current aura. ' : '';
						if (isSelected && !bIsCurrent) bPrefix = 'Selected. ';
						allBtns[j].textContent = bPrefix + bName + (bDesc ? '. ' + bDesc : '');
					}
					PlaySound('snd/tick.mp3');
					MOD.announce(Game.dragonAuras[id].dname || Game.dragonAuras[id].name);
				});
			})(aId, auraBtn, currentAura);
			picker.appendChild(auraBtn);
			if (!firstBtn) firstBtn = auraBtn;
		}
		// Confirm / Dismiss buttons
		var btnRow = document.createElement('div');
		btnRow.style.cssText = 'margin-top:8px;display:flex;gap:4px;';
		var confirmBtn = document.createElement('button');
		confirmBtn.type = 'button';
		confirmBtn.textContent = 'Confirm';
		confirmBtn.style.cssText = 'flex:1;padding:8px;background:#363;border:1px solid #6a6;color:#fff;cursor:pointer;';
		confirmBtn.addEventListener('click', function() {
			var selected = MOD.selectedAuraForSlot;
			if (selected >= 0) {
				var changed = (selected !== currentAura);
				var cpsBefore = Game.cookiesPs;
				var kittensBefore = Game.cookiesMultByType['kittens'] || 1;
				if (slotNum === 0) Game.dragonAura = selected;
				else Game.dragonAura2 = selected;
				// Pay cost if aura actually changed and player owns buildings
				if (changed && highestBuilding !== 0) {
					highestBuilding.sacrifice(1);
				}
				Game.recalculateGains = 1;
				Game.CalculateGains();
				// Announce the aura change
				if (changed) {
					var auraName = Game.dragonAuras[selected] ? (Game.dragonAuras[selected].dname || Game.dragonAuras[selected].name) : 'None';
					var msg = 'Aura slot ' + (slotNum + 1) + ' set to ' + auraName;
					if (highestBuilding !== 0) {
						msg += '. Sacrificed 1 ' + highestBuilding.single;
					}
					var cpsAfter = Game.cookiesPs;
					if (cpsAfter !== cpsBefore) {
						msg += '. CpS: ' + Beautify(cpsAfter, 1);
					}
					var kittensAfter = Game.cookiesMultByType['kittens'] || 1;
					if (kittensAfter !== kittensBefore) {
						msg += '. Kitten multiplier: ' + Beautify(kittensAfter * 100) + '%';
					}
					MOD.announce(msg + '.');
				}
			}
			MOD.editingAuraSlot = -1;
			MOD.selectedAuraForSlot = -1;
			Game.ToggleSpecialMenu(1);
		});
		btnRow.appendChild(confirmBtn);
		var dismissBtn = document.createElement('button');
		dismissBtn.type = 'button';
		dismissBtn.textContent = 'Dismiss aura selection';
		dismissBtn.style.cssText = 'flex:1;padding:8px;background:#633;border:1px solid #966;color:#fff;cursor:pointer;';
		dismissBtn.addEventListener('click', function() {
			container.innerHTML = '';
			MOD.editingAuraSlot = -1;
			MOD.selectedAuraForSlot = -1;
			triggerBtn.focus();
		});
		btnRow.appendChild(dismissBtn);
		picker.appendChild(btnRow);
		container.appendChild(picker);
		// Focus the first aura button and announce switching cost (only on fresh open)
		if (firstBtn) firstBtn.focus();
		if (!wasAlreadyEditing) MOD.announce(costDiv.textContent);
	},
	updateDragonLabels: function() {
		// Only rebuild the panel if dragon tab is open
		if (Game.specialTab === 'dragon') {
			this.createDragonPanel();
		}
	},
	enhanceSantaUI: function() {
		var MOD = this;
		if (Game.specialTab !== 'santa') {
			var existing = l('a11ySantaPanel');
			if (existing) existing.remove();
			return;
		}
		// Hide the game's visual popup from screen readers when our panel replaces it
		var popup = l('specialPopup');
		if (popup) popup.setAttribute('aria-hidden', 'true');
		MOD.createSantaPanel();
	},
	createSantaPanel: function() {
		var MOD = this;
		var level = Game.santaLevel || 0;
		var maxLevel = 14;
		var oldPanel = l('a11ySantaPanel');
		if (oldPanel) oldPanel.remove();
		var insertAfter = l('a11ySpecialTab_santa');
		if (!insertAfter) return;
		var panel = document.createElement('div');
		panel.id = 'a11ySantaPanel';
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', "Santa's Progress");
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #a66;padding:10px;margin:10px 0;';
		// Heading
		var heading = document.createElement('h3');
		heading.style.cssText = 'color:#f66;margin:0 0 10px 0;font-size:14px;';
		var santaName = (Game.santaLevels && Game.santaLevels[level]) ? Game.santaLevels[level] : 'Santa';
		heading.textContent = santaName + ', level ' + level + ' of ' + maxLevel;
		panel.appendChild(heading);
		// Upgrade button
		if (level < maxLevel) {
			var cost = Math.pow(level + 1, level + 1);
			var canAfford = Game.cookies >= cost;
			var upgradeBtn = document.createElement('button');
			upgradeBtn.type = 'button';
			upgradeBtn.setAttribute('aria-label', 'Evolve Santa. Cost: ' + Beautify(cost) + ' cookies' + (canAfford ? '' : ' (cannot afford)'));
			upgradeBtn.textContent = 'Evolve';
			upgradeBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:5px 0;background:#336;border:1px solid #66a;color:#fff;cursor:pointer;';
			upgradeBtn.addEventListener('click', function() {
				Game.UpgradeSanta();
			});
			panel.appendChild(upgradeBtn);
		} else {
			var maxDiv = document.createElement('div');
			maxDiv.style.cssText = 'color:#aaa;padding:4px 0;';
			maxDiv.textContent = 'Maximum level reached.';
			panel.appendChild(maxDiv);
		}
		insertAfter.parentNode.insertBefore(panel, insertAfter.nextSibling);
	},
	updateSantaLabels: function() {
		if (Game.specialTab === 'santa') {
			this.createSantaPanel();
		}
	},
	updateLegacyButtonLabel: function() {
		var lb = l('legacyButton');
		if (!lb) return;
		var lbl = 'Legacy - Ascend';
		try {
			// Calculate prestige gain
			var currentPrestige = Game.prestige || 0;
			var newPrestige = Game.HowMuchPrestige(Game.cookiesReset + Game.cookiesEarned);
			var prestigeGain = newPrestige - currentPrestige;
			if (prestigeGain > 0) {
				lbl += '. Gain ' + Beautify(prestigeGain) + ' prestige level' + (prestigeGain !== 1 ? 's' : '');
				lbl += ' and ' + Beautify(prestigeGain) + ' heavenly chip' + (prestigeGain !== 1 ? 's' : '');
			} else {
				lbl += '. No prestige gain yet';
			}
		} catch(e) {
			// Fallback if calculation fails
		}
		lb.setAttribute('aria-label', lbl);
	},
	enhanceMenuHeadings: function(menu) {
		if (!menu) return;
		var titles = menu.querySelectorAll('.subsection > .title');
		for (var i = 0; i < titles.length; i++) {
			titles[i].setAttribute('role', 'heading');
			titles[i].setAttribute('aria-level', '3');
		}
	},
	enhanceStatsMenu: function() {
		var MOD = this, menu = l('menu');
		if (!menu) return;
		// Guard on a child element — destroyed with each UpdateMenu() innerHTML rebuild,
		// unlike #menu itself whose dataset persists across rebuilds.
		var firstTitle = menu.querySelector('.subsection > .title');
		if (!firstTitle || firstTitle.getAttribute('role') === 'heading') return;

		// Apply headings immediately so the guard triggers on next frame
		MOD.enhanceMenuHeadings(menu);
		// Defer all other work to avoid blocking the initial render
		setTimeout(function() {
			MOD.enhanceStatsStructure();
			MOD.labelStatisticsContent();
		}, 50);
	},
	enhanceOptionsMenu: function() {
		var MOD = this, menu = l('menu');
		if (!menu) return;
		var firstTitle = menu.querySelector('.subsection > .title');
		if (!firstTitle || firstTitle.getAttribute('role') === 'heading') return;
		MOD.enhanceMenuHeadings(menu);
	},
	enhanceInfoMenu: function() {
		var MOD = this, menu = l('menu');
		if (!menu) return;
		var firstTitle = menu.querySelector('.subsection > .title');
		if (!firstTitle || firstTitle.getAttribute('role') === 'heading') return;
		MOD.enhanceMenuHeadings(menu);
	},
	enhanceStatsStructure: function() {
		var MOD = this, menu = l('menu');
		if (!menu) return;

		// Trophy summaries — milk flavors
		if (Game.Milks && Game.Milks.length > 0) {
			var milkListings = menu.querySelectorAll('#statsAchievs .listing');
			var milkLabel = loc ? loc("Milk flavors unlocked:") : "Milk flavors unlocked:";
			var milkLabelListing = null;
			var milkParent = null;
			for (var i = 0; i < milkListings.length; i++) {
				if (milkListings[i].textContent.indexOf(milkLabel) !== -1) {
					milkLabelListing = milkListings[i];
					milkParent = milkListings[i].nextElementSibling;
					break;
				}
			}
			if (milkParent && milkParent.querySelector('.trophy')) {
				var milkTrophies = milkParent.querySelectorAll('.trophy');
				var milkNames = [];
				for (var i = 0; i < Game.Milks.length; i++) {
					if (Game.milkProgress >= i) milkNames.push(Game.Milks[i].name);
				}
				if (milkNames.length > 0) {
					// Hide original label listing and trophy icons
					milkLabelListing.setAttribute('aria-hidden', 'true');
					for (var i = 0; i < milkTrophies.length; i++) {
						milkTrophies[i].setAttribute('aria-hidden', 'true');
					}
					var el = document.createElement('div');
					el.setAttribute('tabindex', '0');
					el.textContent = milkLabel + ' ' + milkNames.join(', ');
					el.style.cssText = 'padding:4px 8px;font-size:11px;';
					milkParent.parentNode.insertBefore(el, milkParent.nextSibling);
				}
			}
		}

		// Trophy summaries — Santa stages
		var specialDiv = l('statsSpecial');
		if (specialDiv && Game.santaLevels && Game.Has('A festive hat')) {
			var santaLabel = loc ? loc("Santa stages unlocked:") : "Santa stages unlocked:";
			var allDivs = specialDiv.querySelectorAll('div');
			for (var i = 0; i < allDivs.length; i++) {
				var d = allDivs[i];
				if (!d.querySelector('.trophy')) continue;
				var prev = d.previousElementSibling;
				if (!prev || prev.textContent.indexOf(loc ? loc("Santa stages unlocked:") : "Santa stages") === -1) continue;
				var santaTrophies = d.querySelectorAll('.trophy');
				var santaNames = [];
				for (var j = 0; j <= Game.santaLevel && j < Game.santaLevels.length; j++) {
					santaNames.push(Game.santaLevels[j]);
				}
				if (santaNames.length > 0) {
					// Hide original label listing and trophy icons
					prev.setAttribute('aria-hidden', 'true');
					for (var j = 0; j < santaTrophies.length; j++) {
						santaTrophies[j].setAttribute('aria-hidden', 'true');
					}
					var el = document.createElement('div');
					el.setAttribute('tabindex', '0');
					el.textContent = santaLabel + ' ' + santaNames.join(', ');
					el.style.cssText = 'padding:4px 8px;font-size:11px;';
					d.parentNode.insertBefore(el, d.nextSibling);
				}
				break;
			}
		}

		// Trophy summaries — Dragon training
		if (specialDiv && Game.dragonLevels && Game.Has('A crumbly egg')) {
			var dragonLabel = loc ? loc("Dragon training:") : "Dragon training:";
			var allDivs = specialDiv.querySelectorAll('div');
			for (var i = 0; i < allDivs.length; i++) {
				var d = allDivs[i];
				if (!d.querySelector('.trophy')) continue;
				var prev = d.previousElementSibling;
				if (!prev || prev.textContent.indexOf(loc ? loc("Dragon training:") : "Dragon training") === -1) continue;
				var dragonTrophies = d.querySelectorAll('.trophy');
				var mainLevels = [0, 4, 8, Game.dragonLevels.length - 3, Game.dragonLevels.length - 2, Game.dragonLevels.length - 1];
				var dragonNames = [];
				for (var j = 0; j < mainLevels.length; j++) {
					if (Game.dragonLevel >= mainLevels[j]) {
						var lvl = Game.dragonLevels[mainLevels[j]];
						if (lvl) dragonNames.push(lvl.name);
					}
				}
				if (dragonNames.length > 0) {
					// Hide original label listing and trophy icons
					prev.setAttribute('aria-hidden', 'true');
					for (var j = 0; j < dragonTrophies.length; j++) {
						dragonTrophies[j].setAttribute('aria-hidden', 'true');
					}
					var el = document.createElement('div');
					el.setAttribute('tabindex', '0');
					el.textContent = dragonLabel + ' ' + dragonNames.join(', ');
					el.style.cssText = 'padding:4px 8px;font-size:11px;';
					d.parentNode.insertBefore(el, d.nextSibling);
				}
				break;
			}
		}

		// Make .price listings readable — the .price div uses a :before pseudo-element
		// for an icon which can interfere with screen reader parsing
		var priceListings = menu.querySelectorAll('.listing');
		for (var i = 0; i < priceListings.length; i++) {
			var priceEl = priceListings[i].querySelector('.price');
			if (priceEl) {
				// Build a clean aria-label from the listing's text content
				var listingText = priceListings[i].textContent.replace(/\s+/g, ' ').trim();
				priceListings[i].setAttribute('aria-label', listingText);
				priceListings[i].setAttribute('tabindex', '0');
				// Hide children so NVDA only reads the aria-label
				for (var ci = 0; ci < priceListings[i].children.length; ci++) {
					priceListings[i].children[ci].setAttribute('aria-hidden', 'true');
				}
			}
		}

		// Hide decorative elements
		var tinyCookies = menu.querySelectorAll('.tinyCookie');
		for (var i = 0; i < tinyCookies.length; i++) {
			tinyCookies[i].setAttribute('aria-hidden', 'true');
		}
		var prestigeDiv = l('statsPrestige');
		if (prestigeDiv) {
			var prestigeIcons = prestigeDiv.querySelectorAll('.icon');
			for (var i = 0; i < prestigeIcons.length; i++) {
				prestigeIcons[i].setAttribute('aria-hidden', 'true');
			}
		}
		if (specialDiv) {
			var challengeIcons = specialDiv.querySelectorAll('.listing .icon');
			for (var i = 0; i < challengeIcons.length; i++) {
				challengeIcons[i].setAttribute('aria-hidden', 'true');
			}
		}
		var selectorCorners = menu.querySelectorAll('.selectorCorner');
		for (var i = 0; i < selectorCorners.length; i++) {
			selectorCorners[i].setAttribute('aria-hidden', 'true');
		}
	},
	labelStatisticsContent: function() {
		var MOD = this, menu = l('menu');
		if (!menu || Game.onMenu !== 'stats') return;
		if (MOD.statsLabelingInProgress) return;
		MOD.statsLabelingInProgress = true;
		// Process in batches using requestAnimationFrame to avoid blocking the UI
		var crates = menu.querySelectorAll('.crate:not([data-a11y-stats])');
		var index = 0;
		var batchSize = 50;
		function processBatch() {
			if (Game.onMenu !== 'stats') { MOD.statsLabelingInProgress = false; return; }
			var end = Math.min(index + batchSize, crates.length);
			for (var i = index; i < end; i++) {
				var crate = crates[i];
				crate.setAttribute('data-a11y-stats', '1');
				var id = crate.getAttribute('data-id');
				if (!id) continue;
				if (crate.classList.contains('upgrade') && Game.UpgradesById[id]) {
					MOD.labelStatsUpgradeIcon(crate, Game.UpgradesById[id], false);
				} else if (crate.classList.contains('achievement') && Game.AchievementsById[id]) {
					MOD.labelStatsAchievementIcon(crate, Game.AchievementsById[id], crate.classList.contains('shadow'));
				}
			}
			index = end;
			if (index < crates.length) {
				requestAnimationFrame(processBatch);
			} else {
				MOD.statsLabelingInProgress = false;
			}
		}
		// Defer first batch to let the menu render first
		requestAnimationFrame(processBatch);
	},
	labelStatsAchievementIcon: function(icon, ach, isShadow) {
		if (!icon || !ach) return;
		var MOD = this;
		var lbl = '';
		var desc = '';
		if (ach.won) {
			// Unlocked - show full info
			var n = ach.dname || ach.name;
			var pool = (isShadow || ach.pool === 'shadow') ? ' [Shadow Achievement]' : '';
			lbl = n + '. Unlocked.' + pool;
			desc = MOD.stripHtml(ach.desc || '');
		} else {
			// Locked - hide name and description
			lbl = '???. Locked.';
		}
		// Populate the aria-labelledby target label (created by game when screenreader=1)
		var ariaLabel = l('ariaReader-achievement-' + ach.id);
		if (ariaLabel) {
			ariaLabel.textContent = lbl;
		}
		// Also set aria-label directly
		icon.setAttribute('aria-label', lbl);
		icon.removeAttribute('aria-describedby');
		if (icon.tagName !== 'BUTTON') {
			if (!icon.getAttribute('role')) icon.setAttribute('role', 'button');
			if (!icon.getAttribute('tabindex')) icon.setAttribute('tabindex', '0');
		}
		// Add separate info div after the icon for description
		var infoId = 'a11y-stats-ach-info-' + ach.id;
		var infoEl = l(infoId);
		if (desc) {
			if (!infoEl) {
				infoEl = document.createElement('div');
				infoEl.id = infoId;
				infoEl.setAttribute('tabindex', '0');
				if (icon.nextSibling) {
					icon.parentNode.insertBefore(infoEl, icon.nextSibling);
				} else {
					icon.parentNode.appendChild(infoEl);
				}
			}
			infoEl.textContent = desc;
			infoEl.removeAttribute('aria-label');
			infoEl.removeAttribute('role');
		} else if (infoEl) {
			infoEl.remove();
		}
	},
	labelStatsUpgradeIcon: function(icon, upg, isHeavenly) {
		if (!icon || !upg) return;
		// Skip debug upgrades entirely
		if (upg.pool === 'debug') {
			icon.style.display = 'none';
			return;
		}
		var MOD = this;
		// Statistics menu only shows owned upgrades, so just label them
		var n = upg.dname || upg.name;
		var desc = MOD.stripHtml(upg.desc || '');
		var lbl = n + '.';
		// Populate the aria-labelledby target label (created by game when screenreader=1)
		var ariaLabel = l('ariaReader-upgrade-' + upg.id);
		if (ariaLabel) {
			ariaLabel.textContent = lbl;
		}
		// Also set aria-label directly
		icon.setAttribute('aria-label', lbl);
		icon.removeAttribute('aria-describedby');
		if (icon.tagName !== 'BUTTON') {
			if (!icon.getAttribute('role')) icon.setAttribute('role', 'button');
			if (!icon.getAttribute('tabindex')) icon.setAttribute('tabindex', '0');
		}
		// Add separate info div after the icon for description
		var infoId = 'a11y-stats-upg-info-' + upg.id;
		var infoEl = l(infoId);
		if (desc) {
			if (!infoEl) {
				infoEl = document.createElement('div');
				infoEl.id = infoId;
				infoEl.setAttribute('tabindex', '0');
				if (icon.nextSibling) {
					icon.parentNode.insertBefore(infoEl, icon.nextSibling);
				} else {
					icon.parentNode.appendChild(infoEl);
				}
			}
			infoEl.textContent = desc;
			infoEl.removeAttribute('aria-label');
			infoEl.removeAttribute('role');
		} else if (infoEl) {
			infoEl.remove();
		}
	},
	setupNewsTicker: function() {
		var MOD = this;
		// Wrap Game.TickerDraw to fix quote/attribution reading in screen readers.
		// The game uses <q> and <sig> elements for grandma quotes. NVDA treats
		// <q> as a semantic object (adding its own line) and <sig> is display:block,
		// so the quote and speaker end up on separate lines in browse mode.
		// Fix: replace <q>text</q><sig>name</sig> with a single flat <span>.
		var origTickerDraw = Game.TickerDraw;
		Game.TickerDraw = function() {
			origTickerDraw.apply(this, arguments);
			var tickerEl = l('commentsText1');
			if (tickerEl) {
				var q = tickerEl.querySelector('q');
				var sig = tickerEl.querySelector('sig');
				if (q && sig) {
					var flat = document.createElement('span');
					flat.style.fontStyle = 'italic';
					flat.textContent = '\u201c' + q.textContent + '\u201d \u2014' + sig.textContent;
					tickerEl.innerHTML = '';
					tickerEl.appendChild(flat);
				}
			}
		};
	},
	setupGoldenCookieAnnouncements: function() {
		var MOD = this;
		// Override pop functions to announce non-buff effects via live region
		// Buff effects are handled by updateBuffTracker
		if (Game.shimmerTypes && Game.shimmerTypes.golden) {
			var orig = Game.shimmerTypes.golden.popFunc;
			Game.shimmerTypes.golden.popFunc = function(me) {
				// Temporarily hook Game.Popup to capture the effect text
				var capturedPopup = '';
				var origPopup = Game.Popup;
				Game.Popup = function(text, x, y) {
					capturedPopup = text;
					origPopup.call(Game, text, x, y);
				};

				MOD.shimmerPopupActive = true;
				var prevCookies = Game.cookies;
				var r = orig.call(this, me);

				// Restore original Game.Popup
				Game.Popup = origPopup;
				MOD.shimmerPopupActive = false;

				// Mark as clicked so we don't announce "has faded" for clicked shimmers
				if (MOD.announcedShimmers[me.id]) {
					MOD.announcedShimmers[me.id].clicked = true;
				}

				// Check if this is a storm drop
				var isStormDrop = me.forceObj && me.forceObj.type === 'cookie storm drop';

				// Count storm clicks and track cookies earned for summary
				if (isStormDrop && MOD.cookieStormActive) {
					MOD.stormClickCount++;
					MOD.stormCookiesEarned += (Game.cookies - prevCookies);
					return r; // Suppress individual announcement
				}

				var lastEffect = Game.shimmerTypes.golden.last;

				// Handle chain cookie results — announce each link
				if (lastEffect === 'chain cookie') {
					if (capturedPopup) {
						var text = MOD.stripHtml(capturedPopup);
						if (!MOD.cookieChainActive) {
							// First chain link — explain what's happening
							MOD.cookieChainActive = true;
							MOD.announceUrgent(text + '. Click the next golden cookie to continue the chain.');
						} else {
							MOD.announceUrgent(text);
						}
					}
					return r;
				}

				// Non-buff effects: announce the effect text from the game's popup
				// Buff effects: handled by updateBuffTracker, no announcement needed here
				var nonBuffEffects = ['multiply cookies', 'ruin cookies', 'blab',
				                      'free sugar lump'];
				if (capturedPopup && nonBuffEffects.indexOf(lastEffect) !== -1) {
					MOD.announceUrgent(MOD.stripHtml(capturedPopup));
				}
				return r;
			};
		}
		if (Game.shimmerTypes && Game.shimmerTypes.reindeer) {
			var origR = Game.shimmerTypes.reindeer.popFunc;
			Game.shimmerTypes.reindeer.popFunc = function(me) {
				if (MOD.announcedShimmers[me.id]) {
					MOD.announcedShimmers[me.id].clicked = true;
				}
				// Capture Game.Notify to get the reward text
				var capturedNotify = '';
				var origNotify = Game.Notify;
				Game.Notify = function(title, desc, pic, quick, noLog) {
					capturedNotify = title + '. ' + desc;
					origNotify.call(Game, title, desc, pic, quick, noLog);
				};
				MOD.shimmerPopupActive = true;
				var r = origR.call(this, me);
				Game.Notify = origNotify;
				MOD.shimmerPopupActive = false;
				// Announce the reindeer reward via live region
				if (capturedNotify) {
					MOD.announceUrgent(MOD.stripHtml(capturedNotify));
				}
				return r;
			};
		}
	},
	/**
	 * Get the display name for a shimmer based on type, wrath status, and season
	 */
	getShimmerVariantName: function(shimmer) {
		if (!shimmer) return 'Unknown';

		if (shimmer.type === 'reindeer') {
			return 'Reindeer';
		}

		if (shimmer.type === 'golden') {
			// Check for wrath cookie first
			if (shimmer.wrath) {
				// Check seasonal variants for wrath cookies
				if (Game.season === 'easter') return 'Wrath Bunny';
				if (Game.season === 'valentines') return 'Wrath Heart';
				if (Game.season === 'halloween') return 'Wrath Pumpkin';
				if (Game.season === 'fools') return 'Wrath Contract';
				return 'Wrath Cookie';
			} else {
				// Golden cookie - check seasonal variants
				if (Game.season === 'easter') return 'Golden Bunny';
				if (Game.season === 'valentines') return 'Golden Heart';
				if (Game.season === 'halloween') return 'Golden Pumpkin';
				if (Game.season === 'fools') return 'Golden Contract';
				return 'Golden Cookie';
			}
		}

		return 'Shimmer';
	},
	/**
	 * Track and announce shimmers - called from updateDynamicLabels
	 * Announces once when appearing, once when fading, and once when faded
	 */
	trackShimmerAnnouncements: function() {
		var MOD = this;
		if (!Game.shimmers) return;

		var currentShimmerIds = {};
		var FADE_WARNING_FRAMES = 300; // 10 seconds at 30fps

		// Process each active shimmer
		Game.shimmers.forEach(function(shimmer) {
			var id = shimmer.id;
			currentShimmerIds[id] = true;

			// Get variant name
			var variant = MOD.getShimmerVariantName(shimmer);

			// Check if this shimmer should be suppressed (rapid-fire events)
			var isStormDrop = shimmer.forceObj && shimmer.forceObj.type === 'cookie storm drop';
			var shouldSuppress = MOD.cookieChainActive || MOD.cookieStormActive || isStormDrop;

			// Announce appearance (only once per shimmer, unless suppressed)
			if (!MOD.announcedShimmers[id]) {
				MOD.announcedShimmers[id] = {variant: variant, suppressed: shouldSuppress};
				if (!shouldSuppress) {
					MOD.announceUrgent('A ' + variant + ' has appeared!');
				}
			}

			// Check if fading (5 seconds before disappearing, unless suppressed)
			// shimmer.life is remaining life in frames, shimmer.dur is total duration
			if (shimmer.life !== undefined && shimmer.life <= FADE_WARNING_FRAMES) {
				if (!MOD.fadingShimmers[id]) {
					MOD.fadingShimmers[id] = true;
					if (!shouldSuppress) {
						MOD.announceUrgent(variant + ' is fading!');
					}
				}
			}
		});

		// Announce faded and clean up tracking for shimmers that no longer exist
		for (var id in MOD.announcedShimmers) {
			if (!currentShimmerIds[id]) {
				var info = MOD.announcedShimmers[id];
				if (info && !info.suppressed && !info.clicked) {
					MOD.announceUrgent(info.variant + ' has faded.');
				}
				delete MOD.announcedShimmers[id];
				delete MOD.fadingShimmers[id];
			}
		}

		// Update shimmer buttons
		MOD.updateShimmerButtons();
	},
	/**
	 * Track rapid-fire events (cookie chains, cookie storms) and announce start/end
	 * Called before trackShimmerAnnouncements to set suppression flags
	 */
	trackRapidFireEvents: function() {
		var MOD = this;

		// Check Cookie Chain status
		var chainData = Game.shimmerTypes && Game.shimmerTypes['golden'];
		if (chainData) {
			var currentChain = chainData.chain || 0;

			if (currentChain > 0 && !MOD.cookieChainActive) {
				// Fallback — normally the popFunc wrapper sets this first
				MOD.cookieChainActive = true;
				MOD.announceUrgent('Cookie chain! Click golden cookies as they appear for escalating rewards.');
			} else if (currentChain === 0 && MOD.cookieChainActive) {
				MOD.cookieChainActive = false;
				var total = chainData.totalFromChain || 0;
				if (total > 0) {
					MOD.announceUrgent('Cookie chain ended. You made ' + Beautify(total) + ' cookies.');
				} else {
					MOD.announceUrgent('Cookie chain ended.');
				}
			}
		}

		// Check Cookie Storm status
		var stormActive = Game.hasBuff && Game.hasBuff('Cookie storm');

		if (stormActive && !MOD.cookieStormActive) {
			MOD.cookieStormActive = true;
			MOD.stormClickCount = 0;
			MOD.stormCookiesEarned = 0;
			MOD.announceUrgent('Cookie storm started! Collect storm cookies from the Shimmers panel.');
		} else if (!stormActive && MOD.cookieStormActive) {
			MOD.cookieStormActive = false;
			if (MOD.stormClickCount > 0) {
				MOD.announceUrgent('Cookie storm ended. Collected ' + MOD.stormClickCount + ' storm cookies for ' + Beautify(MOD.stormCookiesEarned) + ' cookies.');
			} else {
				MOD.announceUrgent('Cookie storm ended.');
			}
			MOD.stormClickCount = 0;
			MOD.stormCookiesEarned = 0;
		}
	},
	updateBuffTracker: function() {
		var MOD = this;
		if (!Game.buffs) return;
		var cur = {};
		for (var n in Game.buffs) {
			var b = Game.buffs[n];
			if (b && b.time > 0) cur[n] = { time: b.time, maxTime: b.maxTime };
		}
		// Announce new or refreshed buffs with full duration
		// Skip "Cookie storm" — trackRapidFireEvents handles it with click count info
		for (var n in cur) {
			if (n === 'Cookie storm') continue;
			if (!MOD.lastBuffs[n]) {
				// New buff — use urgent so it isn't dropped by other announcements
				var duration = Math.ceil(cur[n].maxTime / Game.fps);
				MOD.announceUrgent(n + ' started for ' + duration + ' seconds!');
			} else if (cur[n].time > MOD.lastBuffs[n].time) {
				// Buff was refreshed — time went up instead of the normal decrease
				var remaining = Math.ceil(cur[n].time / Game.fps);
				var added = Math.ceil((cur[n].time - MOD.lastBuffs[n].time) / Game.fps);
				MOD.announceUrgent(n + ' extended by ' + added + ' seconds, ' + remaining + 's remaining.');
			}
		}
		// Announce ended buffs
		for (var n in MOD.lastBuffs) {
			if (!cur[n] && n !== 'Cookie storm') MOD.announce(n + ' ended.');
		}
		MOD.lastBuffs = cur;
	},
	updateAchievementTracker: function() {
		var MOD = this, cnt = Game.AchievementsOwned || 0;
		if (MOD.lastAchievementCount === 0) {
			// Mark all existing achievements as announced so we only announce new ones
			for (var i in Game.AchievementsById) {
				var a = Game.AchievementsById[i];
				if (a && a.won) a.announced = true;
			}
			MOD.lastAchievementCount = cnt;
			return;
		}
		if (cnt > MOD.lastAchievementCount) {
			for (var i in Game.AchievementsById) {
				var a = Game.AchievementsById[i];
				if (a && a.won && !a.announced) {
					a.announced = true;
					MOD.announceUrgent('Achievement: ' + (a.dname || a.name) + '. ' + MOD.stripHtml(a.desc || ''));
				}
			}
		}
		MOD.lastAchievementCount = cnt;
	},
	updateSeasonTracker: function() {
		var MOD = this;
		var currentSeason = Game.season || '';

		if (currentSeason !== MOD.lastSeason) {
			if (currentSeason === '') {
				// Season ended
				var oldName = Game.seasons[MOD.lastSeason] ?
					Game.seasons[MOD.lastSeason].name : MOD.lastSeason;
				MOD.announce(oldName + ' season has ended.');
			} else {
				// New season started
				var newName = Game.seasons[currentSeason] ?
					Game.seasons[currentSeason].name : currentSeason;
				MOD.announce(newName + ' season has started!');
			}
			MOD.lastSeason = currentSeason;
		}
	},
	enhanceBuildingMinigames: function() {
		var MOD = this;
		// Data-driven approach using Game.ObjectsById
		// This runs on every draw hook to ensure labels persist through UI refreshes
		for (var i in Game.ObjectsById) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			var bldName = bld.name || bld.dname || 'Building';
			var mg = bld.minigame;
			var mgName = mg ? mg.name : '';
			// Get the building's DOM element via bld.l
			var bldEl = bld.l;
			if (bldEl) {
				MOD.enhanceBuildingElement(bld, bldName, mg, mgName, bldEl);
			}
			// Also enhance the product in the store
			var productEl = l('product' + bld.id);
			if (productEl) {
				MOD.enhanceBuildingProduct(productEl, bld, mgName, mg);
			}
			// Enhance minigame header if minigame exists
			if (mg) {
				MOD.enhanceMinigameHeader(bld, mgName, mg);
			}
			// Dragon boost indicator — visible when Supreme Intellect aura is active
			var dragonBoost = l('productDragonBoost' + bld.id);
			if (dragonBoost) {
				if (dragonBoost.style.display !== 'none' && mg && mg.dragonBoostTooltip) {
					var boostText = 'Dragon boost: ' + MOD.stripHtml(mg.dragonBoostTooltip());
					MOD.setAttributeIfChanged(dragonBoost, 'aria-label', boostText);
					MOD.setAttributeIfChanged(dragonBoost, 'tabindex', '0');
					dragonBoost.removeAttribute('aria-hidden');
				} else {
					MOD.setAttributeIfChanged(dragonBoost, 'aria-hidden', 'true');
					MOD.setAttributeIfChanged(dragonBoost, 'tabindex', '-1');
				}
			}
		}
		// Remove "Customize" link on the You building row — purely visual customizer with no accessible alternative
		// The link is in row19 (the building row in the left panel), not in product19 (the store button)
		var youRow = l('row19');
		if (youRow) {
			var customizeBtns = youRow.querySelectorAll('.onlyOnCanvas');
			for (var ci = 0; ci < customizeBtns.length; ci++) {
				customizeBtns[ci].remove();
			}
		}
		// Disable the customizer prompt so it can't be triggered by any remaining references
		if (Game.YouCustomizer && Game.YouCustomizer.prompt) {
			Game.YouCustomizer.prompt = function() {};
		}
		// Hide muted building icon strip — purely visual
		var buildingsMute = l('buildingsMute');
		if (buildingsMute) {
			MOD.setAttributeIfChanged(buildingsMute, 'aria-hidden', 'true');
		}
		// Also enhance store controls
		MOD.enhanceStoreControls();
	},
	enhanceBuildingElement: function(bld, bldName, mg, mgName, bldEl) {
		var MOD = this;
		if (!bldEl) return;
		// bld.l (bldEl) is the store product button, NOT the building row.
		// Product button labels are set by enhanceBuildingProduct().
		// Building row labels are set by labelBuildingRows().
		// Here we only handle the mute button (referenced directly via bld.muteL).
		// Mute buttons are purely visual (hide building animation canvas) — hide from screen readers
		if (bld.muteL) {
			MOD.setAttributeIfChanged(bld.muteL, 'aria-hidden', 'true');
			MOD.setAttributeIfChanged(bld.muteL, 'tabindex', '-1');
		}
	},
	enhanceStoreControls: function() {
		var MOD = this;
		// Ensure the storeBulk container doesn't clip buttons for screen readers
		var storeBulk = l('storeBulk');
		if (storeBulk) storeBulk.style.overflow = 'visible';
		// Buy/Sell toggles
		var storeBulkBuy = l('storeBulkBuy');
		var storeBulkSell = l('storeBulkSell');
		var buyLabel = (Game.buyMode === 1 ? 'Selected, ' : '') + 'Buy mode';
		var sellLabel = (Game.buyMode === -1 ? 'Selected, ' : '') + 'Sell mode';
		if (storeBulkBuy) {
			MOD.setAttributeIfChanged(storeBulkBuy, 'aria-label', buyLabel);
			MOD.setAttributeIfChanged(storeBulkBuy, 'role', 'button');
			MOD.setAttributeIfChanged(storeBulkBuy, 'tabindex', '0');
			if (!storeBulkBuy.dataset.a11yEnhanced) {
				storeBulkBuy.dataset.a11yEnhanced = 'true';
				storeBulkBuy.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); storeBulkBuy.click(); }
				});
				storeBulkBuy.addEventListener('click', function() {
					MOD.announce('Selected, Buy mode');
				});
			}
		}
		if (storeBulkSell) {
			MOD.setAttributeIfChanged(storeBulkSell, 'aria-label', sellLabel);
			MOD.setAttributeIfChanged(storeBulkSell, 'role', 'button');
			MOD.setAttributeIfChanged(storeBulkSell, 'tabindex', '0');
			if (!storeBulkSell.dataset.a11yEnhanced) {
				storeBulkSell.dataset.a11yEnhanced = 'true';
				storeBulkSell.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); storeBulkSell.click(); }
				});
				storeBulkSell.addEventListener('click', function() {
					MOD.announce('Selected, Sell mode');
				});
			}
		}
		// Amount multipliers (1, 10, 100, Max)
		// Note: the game hides "Max" in buy mode (visibility:hidden) — only available in sell mode
		var buyBulk = Game.buyBulk;
		var isSellMode = Game.buyMode === -1;
		var amounts = [
			{ id: 'storeBulk1', label: 'Buy or sell 1 at a time', value: 1 },
			{ id: 'storeBulk10', label: 'Buy or sell 10 at a time', value: 10 },
			{ id: 'storeBulk100', label: 'Buy or sell 100 at a time', value: 100 },
			{ id: 'storeBulkMax', label: 'Sell maximum amount', value: -1 }
		];
		amounts.forEach(function(amt) {
			var btn = l(amt.id);
			if (btn) {
				// Hide "Max" from screen reader when in buy mode (game hides it visually)
				if (amt.id === 'storeBulkMax' && !isSellMode) {
					MOD.setAttributeIfChanged(btn, 'aria-hidden', 'true');
					btn.setAttribute('tabindex', '-1');
					return;
				}
				btn.removeAttribute('aria-hidden');
				var label = (buyBulk === amt.value ? 'Selected, ' : '') + amt.label;
				MOD.setAttributeIfChanged(btn, 'aria-label', label);
				MOD.setAttributeIfChanged(btn, 'role', 'button');
				MOD.setAttributeIfChanged(btn, 'tabindex', '0');
				if (!btn.dataset.a11yEnhanced) {
					btn.dataset.a11yEnhanced = 'true';
					btn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
					});
					btn.addEventListener('click', function() {
						MOD.announce('Selected, ' + amt.label);
					});
				}
			}
		});
	},
	enhanceBuildingProduct: function(el, bld, mgName, mg) {
		var MOD = this;
		if (!el || !bld) return;
		var owned = bld.amount || 0;

		// Skip labeling mystery buildings - filterUnownedBuildings owns their labels
		var isMystery = bld.amount === 0 && !bld.locked
			&& (bld.id - (MOD.highestOwnedBuildingId !== undefined ? MOD.highestOwnedBuildingId : -1)) === 2;

		if (!isMystery) {
			// Determine buy/sell mode and bulk amount
			var isBuyMode = Game.buyMode === 1;
			var bulkAmount = Game.buyBulkShortcut ? Game.buyBulkOld : Game.buyBulk;

			// Calculate the appropriate price based on mode
			var price, priceStr, actionLabel, quantityLabel;

			if (isBuyMode) {
				// Buy mode - use getSumPrice for bulk pricing
				if (bulkAmount === -1) {
					// Max mode - calculate how many can be afforded
					var maxCanBuy = 0;
					if (bld.getBulkPrice) {
						// Use game's bulk price calculation if available
						price = bld.bulkPrice || bld.price;
					} else {
						price = bld.getSumPrice ? bld.getSumPrice(1) : bld.price;
					}
					quantityLabel = 'max';
					actionLabel = 'Buy';
				} else {
					// Fixed amount (1, 10, or 100)
					price = bld.getSumPrice ? bld.getSumPrice(bulkAmount) : bld.price * bulkAmount;
					quantityLabel = bulkAmount > 1 ? bulkAmount + ' for' : '';
					actionLabel = 'Buy';
				}
				priceStr = Beautify(Math.round(price));

				// Build label for buy mode
				var lbl = bld.name;
				if (quantityLabel) {
					lbl += ', ' + actionLabel + ' ' + quantityLabel + ' ' + priceStr;
				} else {
					lbl += ', Cost: ' + priceStr;
				}
				lbl += ', ' + owned + ' owned';
				lbl += Game.cookies >= price ? ', Affordable' : ', Cannot afford';
				MOD.setAttributeIfChanged(el, 'aria-label', lbl);
			} else {
				// Sell mode - calculate sell value
				if (bulkAmount === -1) {
					// Sell all
					price = bld.getReverseSumPrice ? bld.getReverseSumPrice(owned) : Math.floor(bld.price * owned * 0.25);
					quantityLabel = 'all ' + owned;
				} else {
					var sellAmount = Math.min(bulkAmount, owned);
					price = bld.getReverseSumPrice ? bld.getReverseSumPrice(sellAmount) : Math.floor(bld.price * sellAmount * 0.25);
					quantityLabel = sellAmount + '';
				}
				priceStr = Beautify(Math.round(price));

				// Build label for sell mode
				var lbl = bld.name;
				lbl += ', Sell ' + quantityLabel + ' for ' + priceStr;
				lbl += ', ' + owned + ' owned';
				MOD.setAttributeIfChanged(el, 'aria-label', lbl);
			}
		}
		el.removeAttribute('aria-labelledby');
		// Hide the orphaned ariaReader label so it can't be found by browse mode
		var ariaReader = l('ariaReader-product-' + bld.id);
		if (ariaReader) {
			ariaReader.setAttribute('aria-hidden', 'true');
			ariaReader.style.display = 'none';
		}
		MOD.setAttributeIfChanged(el, 'role', 'button');
		MOD.setAttributeIfChanged(el, 'tabindex', '0');
		if (!el.dataset.a11yEnhanced) {
			el.dataset.a11yEnhanced = 'true';
			(function(building) {
				el.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') {
						var isBuy = Game.buyMode === 1;
						var bulk = Game.buyBulkShortcut ? Game.buyBulkOld : Game.buyBulk;
						if (isBuy && bulk > 1) {
							var bulkPrice = building.getSumPrice ? building.getSumPrice(bulk) : building.price * bulk;
							if (Game.cookies < bulkPrice) {
								e.preventDefault();
								e.stopPropagation();
								MOD.announce('Cannot afford ' + bulk + ' ' + building.name);
								return;
							}
						}
						e.preventDefault();
						el.click();
					}
				});
			})(bld);
		}
		// Hide all child elements inside the product button from screen readers
		// so only our aria-label is announced (prevents duplicate name/price/owned reading).
		// aria-hidden alone isn't enough — NVDA's arrow/word navigation can still read
		// text content through it. display:none fully removes from the accessibility tree
		// and persists across frames (the game only writes textContent to children, not style).
		for (var c = 0; c < el.children.length; c++) {
			el.children[c].setAttribute('aria-hidden', 'true');
		}
		var contentDiv = el.querySelector('.content');
		if (contentDiv) contentDiv.style.display = 'none';
		if (!isMystery) {
			// Add info text (not a button) with building stats below
			MOD.ensureBuildingInfoText(bld);
		} else {
			// Hide info text for mystery buildings so the real name isn't revealed
			var infoText = l('a11y-building-info-' + bld.id);
			if (infoText) {
				infoText.style.display = 'none';
				infoText.setAttribute('aria-hidden', 'true');
			}
		}
	},
	enhanceMinigameHeader: function(bld, mgName, mg) {
		var MOD = this;
		if (!bld || !mg) return;
		var bldId = bld.id;
		var bldName = bld.name || bld.dname || 'Building';
		// Find the minigame container
		var mgContainer = l('row' + bldId + 'minigame');
		if (!mgContainer) return;
		// Level display element - include building name
		var levelEl = mgContainer.querySelector('.minigameLevel');
		if (levelEl) {
			MOD.setAttributeIfChanged(levelEl, 'role', 'status');
			MOD.setAttributeIfChanged(levelEl, 'aria-label', bldName + ' - ' + mgName + ' minigame, Level ' + mg.level);
		}
		// Level up button - include building name
		var levelUpBtn = mgContainer.querySelector('.minigameLevelUp');
		if (levelUpBtn) {
			var lumpCost = mg.level + 1; // Standard cost is level + 1 lumps
			var canAfford = Game.lumps >= lumpCost;
			var lbl = 'Level up ' + bldName + ' ' + mgName + ' button. ';
			lbl += 'Cost: ' + lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : '') + '. ';
			lbl += 'Current level: ' + mg.level + '. ';
			lbl += canAfford ? 'Can afford.' : 'Need more lumps.';
			MOD.setAttributeIfChanged(levelUpBtn, 'aria-label', lbl);
			MOD.setAttributeIfChanged(levelUpBtn, 'role', 'button');
			MOD.setAttributeIfChanged(levelUpBtn, 'tabindex', '0');
			if (!levelUpBtn.dataset.a11yEnhanced) {
				levelUpBtn.dataset.a11yEnhanced = 'true';
				levelUpBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); levelUpBtn.click(); }
				});
			}
		}
		// Mute button - simple label with building name
		var muteBtn = mgContainer.querySelector('.minigameMute');
		if (muteBtn) {
			var isMuted = Game.prefs && Game.prefs['minigameMute' + bldId];
			var muteLbl = (isMuted ? 'Unmute ' : 'Mute ') + bldName;
			MOD.setAttributeIfChanged(muteBtn, 'aria-label', muteLbl);
			MOD.setAttributeIfChanged(muteBtn, 'role', 'button');
			MOD.setAttributeIfChanged(muteBtn, 'tabindex', '0');
			if (!muteBtn.dataset.a11yEnhanced) {
				muteBtn.dataset.a11yEnhanced = 'true';
				muteBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); muteBtn.click(); }
				});
			}
		}
		// Close/minimize button - include building name
		var closeBtn = mgContainer.querySelector('.minigameClose');
		if (closeBtn) {
			MOD.setAttributeIfChanged(closeBtn, 'aria-label', 'Close ' + bldName + ' ' + mgName + ' minigame panel');
			MOD.setAttributeIfChanged(closeBtn, 'role', 'button');
			MOD.setAttributeIfChanged(closeBtn, 'tabindex', '0');
			if (!closeBtn.dataset.a11yEnhanced) {
				closeBtn.dataset.a11yEnhanced = 'true';
				closeBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeBtn.click(); }
				});
			}
		}
	},
	gardenReady: function() {
		// Check if garden is fully initialized and safe to access
		try {
			var farm = Game.Objects['Farm'];
			if (!farm) return false;
			if (!farm.minigame) return false;
			// Note: farm.minigame.freeze is the freeze feature, NOT initialization status
			if (!farm.minigame.plot) return false;
			if (!farm.minigame.plantsById) return false;
			// Check if plot is actually populated (not just empty array)
			if (!farm.minigame.plot.length || farm.minigame.plot.length < 1) return false;
			return true;
		} catch(e) {
			return false;
		}
	},
	enhanceGardenMinigame: function() {
		var MOD = this;
		// Don't do anything if garden isn't ready
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		// Wrap buildPanel/buildPlot to re-label elements after DOM rebuilds
		if (!MOD.gardenBuildPanelWrapped) {
			MOD.gardenBuildPanelWrapped = true;
			var origBuildPanel = g.buildPanel;
			g.buildPanel = function() {
				var result = origBuildPanel.apply(this, arguments);
				setTimeout(function() {
					if (MOD.gardenReady()) {
						MOD.labelOriginalGardenElements(Game.Objects['Farm'].minigame);
					}
				}, 0);
				return result;
			};
		}
		if (!MOD.gardenBuildPlotWrapped) {
			MOD.gardenBuildPlotWrapped = true;
			var origBuildPlot = g.buildPlot;
			g.buildPlot = function() {
				var result = origBuildPlot.apply(this, arguments);
				setTimeout(function() {
					if (MOD.gardenReady()) {
						MOD.labelOriginalGardenElements(Game.Objects['Farm'].minigame);
					}
				}, 0);
				return result;
			};
		}
		// Enhance the minigame header first
		MOD.enhanceMinigameHeader(Game.Objects['Farm'], 'Garden', g);
		// Label original garden elements directly
		MOD.labelOriginalGardenElements(g);
	},
	labelSingleGardenTile: function(g, x, y) {
		var tile = l('gardenTile-' + x + '-' + y);
		if (!tile) return;
		var t = g.plot[y] && g.plot[y][x];
		var lbl = 'Row ' + (y+1) + ', column ' + (x+1) + ': ';
		if (t && t[0] > 0) {
			var pl = g.plantsById[t[0] - 1];
			if (pl) {
				var mature = pl.mature || 100;
				var age = t[1];
				var pct = Math.floor((age / mature) * 100);
				// Stage calculation
				var stage, effectScale;
				if (age >= mature) {
					stage = 'mature'; effectScale = 100;
				} else if (age >= mature * 0.666) {
					stage = 'bloom'; effectScale = 50;
				} else if (age >= mature * 0.333) {
					stage = 'sprout'; effectScale = 25;
				} else {
					stage = 'bud'; effectScale = 10;
				}
				lbl += pl.name + ', ' + stage + ' (' + pct + '% grown, effects ' + effectScale + '%)';
				if (age >= mature) {
					lbl += ', may reproduce, drops seed when harvested';
				}
				// Time estimate
				var dragonBoost = 1 / (1 + 0.05 * Game.auraMult('Supreme Intellect'));
				var avgTick = pl.ageTick + pl.ageTickR / 2;
				var ageMult = (g.plotBoost && g.plotBoost[y] && g.plotBoost[y][x]) ? g.plotBoost[y][x][0] : 1;
				if (age < mature) {
					var matFrames = ((100 / (ageMult * avgTick)) * ((mature - age) / 100) * dragonBoost * g.stepT) * 30;
					var minuteFrames = Game.fps * 60;
					lbl += '. Matures in about ' + Game.sayTime(Math.ceil(matFrames / minuteFrames) * minuteFrames, -1);
				} else if (!pl.immortal) {
					var decayFrames = ((100 / (ageMult * avgTick)) * ((100 - age) / 100) * dragonBoost * g.stepT) * 30;
					var minuteFrames = Game.fps * 60;
					lbl += '. Decays in about ' + Game.sayTime(Math.ceil(decayFrames / minuteFrames) * minuteFrames, -1);
				} else {
					lbl += '. Does not decay';
				}
				// Plot boost info
				if (g.plotBoost && g.plotBoost[y] && g.plotBoost[y][x]) {
					var pb = g.plotBoost[y][x];
					if (pb[0] != 1) lbl += '. Aging multiplier: ' + Beautify(pb[0] * 100) + '%';
					if (pb[1] != 1) lbl += '. Effect multiplier: ' + Beautify(pb[1] * 100) + '%';
					if (pb[2] != 1) lbl += '. Weed repellent: ' + Beautify(100 - pb[2] * 100) + '%';
				}
			} else {
				lbl += 'Unknown plant';
			}
		} else {
			lbl += 'Empty';
		}
		tile.setAttribute('aria-label', lbl);
	},
	labelOriginalGardenElements: function(g) {
		var MOD = this;
		if (!g) return;

		// Label garden tiles - they use ID format: gardenTile-{x}-{y}
		for (var y = 0; y < 6; y++) {
			for (var x = 0; x < 6; x++) {
				var tile = l('gardenTile-' + x + '-' + y);
				if (!tile) continue;
				MOD.labelSingleGardenTile(g, x, y);
				MOD.setAttributeIfChanged(tile, 'role', 'button');
				MOD.setAttributeIfChanged(tile, 'tabindex', '0');
				if (!tile.getAttribute('data-a11y-kb')) {
					tile.setAttribute('data-a11y-kb', '1');
					(function(tileX, tileY) {
						tile.addEventListener('keydown', function(e) {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								MOD.handleTileActivation(tileX, tileY);
							}
						});
					})(x, y);
				}
				if (!tile.getAttribute('data-a11y-click')) {
					tile.setAttribute('data-a11y-click', '1');
					(function(tileX, tileY) {
						tile.addEventListener('click', function() {
							setTimeout(function() {
								if (MOD.gardenReady()) {
									var gRef = Game.Objects['Farm'].minigame;
									MOD.labelSingleGardenTile(gRef, tileX, tileY);
									// Update snapshot so tracker doesn't announce manual actions as spontaneous
									var t = gRef.plot[tileY] && gRef.plot[tileY][tileX];
									var key = tileX + ',' + tileY;
									if (t && t[0] > 0) {
										var pl = gRef.plantsById[t[0] - 1];
										if (pl) {
											var age = t[1], mat = pl.mature || 100;
											var stage = age >= mat ? 4 : age >= mat * 0.666 ? 3 : age >= mat * 0.333 ? 2 : 1;
											MOD.gardenPlotSnapshot[key] = { id: t[0] - 1, stage: stage, name: pl.name };
										}
									} else {
										MOD.gardenPlotSnapshot[key] = null;
									}
								}
							}, 50);
						});
					})(x, y);
				}
			}
		}

		// Label garden seeds - they use ID format: gardenSeed-{id}
		for (var seedId in g.plantsById) {
			var plant = g.plantsById[seedId];
			if (!plant) continue;
			var seed = l('gardenSeed-' + seedId);
			if (!seed) continue;
			var lbl;
			if (!plant.unlocked) {
				lbl = 'Locked: ' + plant.name;
			} else if (plant.plantable === false) {
				lbl = plant.name + '. Cannot be planted';
			} else if (Game.Has('Turbo-charged soil')) {
				lbl = plant.name + '. Free to plant';
			} else {
				var cost = g.getCost(plant);
				var canAfford = g.canPlant(plant);
				lbl = plant.name + '. Cost: ' + Beautify(Math.round(cost)) + ' cookies. ' + (canAfford ? 'Affordable' : 'Cannot afford');
			}
			MOD.setAttributeIfChanged(seed, 'aria-label', lbl);
			MOD.ensureSeedInfoText(g, plant, seed);
			MOD.setAttributeIfChanged(seed, 'role', 'button');
			MOD.setAttributeIfChanged(seed, 'tabindex', '0');
			if (!seed.getAttribute('data-a11y-kb')) {
				seed.setAttribute('data-a11y-kb', '1');
				(function(el, plantName, plantId) {
					el.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							el.dataset.shiftHeld = e.shiftKey ? '1' : '0';
							el.click();
						}
					});
					el.addEventListener('click', function(e) {
						var g = Game.Objects['Farm'].minigame;
						if (!g) return;
						var bulk = e.shiftKey || el.dataset.shiftHeld === '1';
						el.dataset.shiftHeld = '0';
						if (g.seedSelected == plantId) {
							MOD.gardenAnnounce((bulk ? 'Bulk selected ' : 'Selected ') + plantName);
						} else if (g.seedSelected < 0) {
							MOD.gardenAnnounce('Deselected ' + plantName);
						}
					});
				})(seed, plant.name, parseInt(seedId));
			}
			}

		// Label garden tools - they use ID format: gardenTool-{id}
		// Tool keys: 'info', 'harvestAll', 'freeze', 'convert'
		if (g.tools) {
			for (var toolKey in g.tools) {
				var tool = g.tools[toolKey];
				if (!tool) continue;
				var toolEl = l('gardenTool-' + tool.id);
				if (!toolEl) continue;
				var lbl = '';
				if (toolKey === 'info') {
					lbl = 'Garden effects and tips';
				} else if (toolKey === 'harvestAll') {
					lbl = 'Harvest all plants. Harvests all plants including immature ones';
					// Wrap harvestAll to announce what was harvested with maturity stages
					if (!g._a11yHarvestAllWrapped) {
						g._a11yHarvestAllWrapped = true;
						var origHarvestAll = g.harvestAll;
						g.harvestAll = function(type, mature, mortal) {
							var stages = ['bud', 'sprout', 'bloom', 'mature'];
							var snapshot = [];
							for (var y = 0; y < 6; y++) {
								for (var x = 0; x < 6; x++) {
									var tile = g.plot[y] && g.plot[y][x];
									if (!tile || tile[0] < 1) continue;
									var p = g.plantsById[tile[0] - 1];
									if (!p) continue;
									if (type && p !== type) continue;
									if (mortal && p.immortal) continue;
									if (mature && tile[1] < p.mature) continue;
									var stage = 1;
									if (tile[1] >= p.mature) stage = 4;
									else if (tile[1] >= p.mature * 0.666) stage = 3;
									else if (tile[1] >= p.mature * 0.333) stage = 2;
									snapshot.push(p.name + ' (' + stages[stage - 1] + ')');
								}
							}
							origHarvestAll.call(g, type, mature, mortal);
							if (snapshot.length > 0) {
								Game.mods['nvda accessibility'].gardenAnnounce('Harvested ' + snapshot.length + ' plant' + (snapshot.length !== 1 ? 's' : '') + ': ' + snapshot.join(', '));
							} else {
								Game.mods['nvda accessibility'].gardenAnnounce('No plants to harvest');
							}
						};
					}
				} else if (toolKey === 'freeze') {
					lbl = g.freeze ? 'Unfreeze garden. Currently FROZEN - plants are paused' : 'Freeze garden. Pauses all plant growth';
				} else if (toolKey === 'convert') {
					lbl = 'Sacrifice garden for 10 sugar lumps. WARNING: Destroys all plants and seeds';
				} else {
					lbl = tool.name || 'Garden tool';
				}
				toolEl.setAttribute('aria-label', lbl);
				MOD.setAttributeIfChanged(toolEl, 'role', 'button');
				MOD.setAttributeIfChanged(toolEl, 'tabindex', '0');
				if (!toolEl.getAttribute('data-a11y-kb')) {
					toolEl.setAttribute('data-a11y-kb', '1');
					(function(el, isInfo) {
						el.addEventListener('keydown', function(e) {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (isInfo) {
									Game.mods['nvda accessibility'].showGardenInfoAccessible();
								} else {
									el.click();
								}
							}
						});
					})(toolEl, toolKey === 'info');
				}
			}
		}
		// Also try to find tools by numeric ID (0, 1, 2, 3)
		for (var i = 0; i < 4; i++) {
			var toolEl = l('gardenTool-' + i);
			if (toolEl && !toolEl.getAttribute('aria-label')) {
				var labels = [
					'Garden effects and tips',
					'Harvest all plants. Harvests all plants including immature ones',
					g.freeze ? 'Unfreeze garden (currently frozen)' : 'Freeze garden',
					'Sacrifice garden for sugar lumps'
				];
				toolEl.setAttribute('aria-label', labels[i] || 'Garden tool ' + i);
				MOD.setAttributeIfChanged(toolEl, 'role', 'button');
				MOD.setAttributeIfChanged(toolEl, 'tabindex', '0');
				if (!toolEl.getAttribute('data-a11y-kb')) {
					toolEl.setAttribute('data-a11y-kb', '1');
					(function(el, isInfo) {
						el.addEventListener('keydown', function(e) {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (isInfo) {
									Game.mods['nvda accessibility'].showGardenInfoAccessible();
								} else {
									el.click();
								}
							}
						});
					})(toolEl, i === 0);
				}
			}
		}

		// Special handler for Garden Info button (tool index 0)
		// The info button's click does nothing, so we toggle an accessible info panel
		var infoBtn = l('gardenTool-0');
		if (!infoBtn && g.tools && g.tools.info) {
			infoBtn = l('gardenTool-' + g.tools.info.id);
		}
		if (infoBtn && !infoBtn.getAttribute('data-info-kb')) {
			infoBtn.setAttribute('data-info-kb', '1');
			infoBtn.setAttribute('aria-expanded', 'false');
			infoBtn.setAttribute('aria-controls', 'a11yGardenInfoPanel');
			infoBtn.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					e.stopPropagation();
					Game.mods['nvda accessibility'].toggleGardenInfoPanel();
				}
			});
			infoBtn.addEventListener('click', function(e) {
				Game.mods['nvda accessibility'].toggleGardenInfoPanel();
			});
		}

		// Add "Harvest Mature Only" button after the native Harvest All button
		var harvestAllBtn = l('gardenTool-1');
		if (harvestAllBtn && !l('a11yHarvestMatureBtn')) {
			var harvestMatureBtn = document.createElement('button');
			harvestMatureBtn.id = 'a11yHarvestMatureBtn';
			harvestMatureBtn.textContent = 'Harvest Mature Only';
			harvestMatureBtn.setAttribute('aria-label', 'Harvest mature plants only. Safely harvests only fully grown plants without affecting growing plants');
			harvestMatureBtn.style.cssText = 'padding:8px 12px;background:#363;border:2px solid #4a4;color:#fff;cursor:pointer;font-size:13px;margin:5px;';
			harvestMatureBtn.addEventListener('click', function() {
				var garden = Game.Objects['Farm'].minigame;
				var plants = MOD.getHarvestablePlants(garden);
				if (plants.length === 0) {
					MOD.gardenAnnounce('No mature plants to harvest');
					return;
				}
				var names = {};
				for (var i = 0; i < plants.length; i++) {
					garden.harvest(plants[i].x, plants[i].y);
					names[plants[i].name] = (names[plants[i].name] || 0) + 1;
				}
				var nameList = [];
				for (var n in names) {
					nameList.push(names[n] > 1 ? names[n] + ' ' + n : n);
				}
				MOD.gardenAnnounce('Harvested ' + plants.length + ' mature plant' + (plants.length !== 1 ? 's' : '') + ': ' + nameList.join(', '));
				MOD.updateGardenPanelStatus();
			});
			harvestMatureBtn.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					harvestMatureBtn.click();
				}
			});
			harvestAllBtn.parentNode.insertBefore(harvestMatureBtn, harvestAllBtn.nextSibling);
		}

		// Label soil selectors - they use ID format: gardenSoil-{id}
		for (var soilId in g.soils) {
			var soil = g.soils[soilId];
			if (!soil) continue;
			var soilEl = l('gardenSoil-' + soil.id);
			if (!soilEl) continue;
			var isActive = (g.soil == soil.id);
			var farmsOwned = Game.Objects['Farm'].amount || 0;
			var isLocked = soil.req && soil.req > farmsOwned;
			var lbl = soil.name;
			if (isLocked) {
				lbl += ' (unlocked at ' + soil.req + ' farms)';
			} else if (isActive) {
				lbl += ' (current soil)';
			}
			// Add soil effects
			var effects = [];
			if (soil.tick) effects.push('tick every ' + soil.tick + ' minutes');
			if (soil.effMult && soil.effMult !== 1) effects.push('plant effects ' + Math.round(soil.effMult * 100) + '%');
			if (soil.weedMult && soil.weedMult !== 1) effects.push('weeds ' + Math.round(soil.weedMult * 100) + '%');
			// Add special effects for pebbles and woodchips
			var soilKey = soil.key || '';
			if (soilKey === 'pebbles') effects.push('35% chance to auto-harvest seeds');
			if (soilKey === 'woodchips') effects.push('3x spread and mutation');
			if (effects.length > 0) lbl += '. ' + effects.join(', ');
			soilEl.setAttribute('aria-label', lbl);
			MOD.setAttributeIfChanged(soilEl, 'role', 'button');
			MOD.setAttributeIfChanged(soilEl, 'tabindex', '0');
			if (!soilEl.getAttribute('data-a11y-kb')) {
				soilEl.setAttribute('data-a11y-kb', '1');
				(function(el, id) {
					el.addEventListener('click', function() {
						var g = Game.Objects['Farm'].minigame;
						if (!g) return;
						// Only announce remaining cooldown if there's an active one from a previous switch
						if (g.nextSoil > Date.now() && g.soil != id) {
							var remainingMs = g.nextSoil - Date.now();
							// Don't announce if this is a fresh 10-minute cooldown (within 2 seconds of full)
							if (remainingMs < 598000) {
								var remaining = Game.sayTime(remainingMs / 1000 * 30 + 30, -1);
								MOD.announce('Can change soil in ' + remaining);
							}
						}
					});
					el.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							el.click();
						}
					});
				})(soilEl, soil.id);
			}
		}

		// Add section headings to original game elements (only once)
		var headingsToAdd = [
			{ id: 'a11yGardenToolsHeading', text: 'Tools', beforeId: 'gardenTools' },
			{ id: 'a11yGardenSoilHeading', text: 'Soil' + (Game.Has('Turbo-charged soil') ? '' : ', can switch every 10 minutes'), beforeId: 'gardenSoil-0' },
		];
		for (var i = 0; i < headingsToAdd.length; i++) {
			var h = headingsToAdd[i];
			if (!l(h.id)) {
				var heading = document.createElement('h3');
				heading.id = h.id;
				heading.textContent = h.text;
				heading.style.cssText = 'color:#6c6;margin:8px 0 4px 0;font-size:14px;';
				var target = l(h.beforeId);
				if (target && target.parentNode) {
					target.parentNode.insertBefore(heading, target);
				}
			}
		}
		// Seeds heading with discovery count (updated dynamically)
		var seedsUnlockedEl = l('gardenSeedsUnlocked');
		if (seedsUnlockedEl) {
			seedsUnlockedEl.setAttribute('aria-hidden', 'true');
			var seedsHeading = l('a11yGardenSeedsHeading');
			var seedsText = 'Seeds, ' + g.plantsUnlockedN + ' of ' + g.plantsN + ' discovered';
			if (!seedsHeading) {
				seedsHeading = document.createElement('h3');
				seedsHeading.id = 'a11yGardenSeedsHeading';
				seedsHeading.style.cssText = 'color:#6c6;margin:8px 0 4px 0;font-size:14px;';
				seedsUnlockedEl.parentNode.insertBefore(seedsHeading, seedsUnlockedEl);
			}
			seedsHeading.textContent = seedsText;
		}

		// Plots heading with size level
		var gardenPlot = l('gardenPlot');
		if (gardenPlot) {
			gardenPlot.removeAttribute('role');
			gardenPlot.removeAttribute('aria-label');
		}
		var plotSizeEl = l('gardenPlotSize');
		if (plotSizeEl) {
			plotSizeEl.setAttribute('aria-hidden', 'true');
		}
		var plotLevel = Math.max(1, Math.min(g.plotLimits.length, g.parent.level));
		var plotTotal = g.plotLimits.length;
		var plotHeading = l('a11yGardenPlotHeading');
		var plotText = 'Plots, ' + plotLevel + '/' + plotTotal + ' (upgrades with farm level)';
		if (plotLevel >= plotTotal) {
			plotText = 'Plots, max size';
		}
		if (!plotHeading) {
			plotHeading = document.createElement('h3');
			plotHeading.id = 'a11yGardenPlotHeading';
			plotHeading.style.cssText = 'color:#6c6;margin:8px 0 4px 0;font-size:14px;';
			var gardenField = l('gardenField');
			if (gardenField && gardenField.parentNode) {
				gardenField.parentNode.insertBefore(plotHeading, gardenField);
			}
		}
		plotHeading.textContent = plotText;

		// Create tick timer info bar at top of garden
		var gardenInfoBar = l('a11y-garden-info-bar');
		var gardenContent = l('gardenContent');
		if (gardenContent) {
			if (!gardenInfoBar) {
				gardenInfoBar = document.createElement('div');
				gardenInfoBar.id = 'a11y-garden-info-bar';
				gardenInfoBar.setAttribute('tabindex', '0');
				gardenInfoBar.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
				gardenContent.insertBefore(gardenInfoBar, gardenContent.firstChild);
			}
			var tickText;
			if (g.freeze) tickText = 'Garden is frozen. Unfreeze to resume.';
			else tickText = 'Next tick in ' + Game.sayTime((g.nextStep - Date.now()) / 1000 * 30 + 30, -1);
			var auraMult = Game.auraMult('Supreme Intellect');
			if (auraMult > 0) {
				tickText += '. Supreme Intellect aura: ' + Math.round(5 * auraMult) + ' percent faster growth';
			}
			MOD.setTextIfChanged(gardenInfoBar, tickText);
		}
		// Hide original tick timer from screen readers
		var origNextTick = l('gardenNextTick');
		if (origNextTick) origNextTick.setAttribute('aria-hidden', 'true');
		// Create lump refill proxy button at top of garden
		if (gardenInfoBar) {
			MOD.createLumpRefillProxy('a11y-garden-lump-refill', 'gardenLumpRefill', 'Refill soil timer and trigger 1 growth tick with 3x spread and mutation', gardenInfoBar);
		}
	},
	// Update a single plot button in-place (preserves focus)
	updatePlotButton: function(x, y) {
		var MOD = this;
		var btn = l('a11yPlot-' + x + '-' + y);
		if (!btn) return;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		var info = MOD.getGardenTileInfo(x, y);
		var selectedSeedName = '';
		if (g.seedSelected >= 0 && g.plantsById[g.seedSelected]) {
			selectedSeedName = g.plantsById[g.seedSelected].name;
		}
		var label = 'Row ' + (y+1) + ', column ' + (x+1) + ': ';
		if (info.isEmpty) {
			if (selectedSeedName) {
				label += 'Empty. Press Enter to plant ' + selectedSeedName;
				btn.style.background = '#2a3a2a';
				btn.style.border = '1px solid #4a4';
				btn.style.color = '#afa';
			} else {
				label += 'Empty. Select a seed first to plant';
				btn.style.background = '#333';
				btn.style.border = '1px solid #555';
				btn.style.color = '#fff';
			}
		} else if (info.isMature) {
			label += info.name + ', mature, READY. Press Enter to harvest';
			// Time estimate for decay
			if (info.plant && !info.plant.immortal) {
				var dragonBoost = 1 / (1 + 0.05 * Game.auraMult('Supreme Intellect'));
				var avgTick = info.plant.ageTick + info.plant.ageTickR / 2;
				var ageMult = (g.plotBoost && g.plotBoost[y] && g.plotBoost[y][x]) ? g.plotBoost[y][x][0] : 1;
				var decayFrames = ((100 / (ageMult * avgTick)) * ((100 - info.age) / 100) * dragonBoost * g.stepT) * 30;
				var minuteFrames = Game.fps * 60;
				label += '. Decays in about ' + Game.sayTime(Math.ceil(decayFrames / minuteFrames) * minuteFrames, -1);
			} else if (info.plant && info.plant.immortal) {
				label += '. Does not decay';
			}
			btn.style.background = '#3a3a2a';
			btn.style.border = '1px solid #aa4';
			btn.style.color = '#ffa';
		} else {
			label += info.name + ', ' + info.stage + ', ' + info.growth + '% grown';
			// Time estimate for maturation
			if (info.plant) {
				var dragonBoost = 1 / (1 + 0.05 * Game.auraMult('Supreme Intellect'));
				var avgTick = info.plant.ageTick + info.plant.ageTickR / 2;
				var ageMult = (g.plotBoost && g.plotBoost[y] && g.plotBoost[y][x]) ? g.plotBoost[y][x][0] : 1;
				var matFrames = ((100 / (ageMult * avgTick)) * ((info.matureAge - info.age) / 100) * dragonBoost * g.stepT) * 30;
				var minuteFrames = Game.fps * 60;
				label += '. Matures in about ' + Game.sayTime(Math.ceil(matFrames / minuteFrames) * minuteFrames, -1);
			}
			btn.style.background = '#2a2a3a';
			btn.style.border = '1px solid #55a';
			btn.style.color = '#aaf';
		}
		btn.textContent = label;
		btn.setAttribute('aria-label', label);
	},
	// Update all plot buttons in-place
	updateAllPlotButtons: function() {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		for (var y = 0; y < 6; y++) {
			for (var x = 0; x < 6; x++) {
				MOD.updatePlotButton(x, y);
			}
		}
	},
	// Get tile information at coordinates
	getGardenTileInfo: function(x, y) {
		var MOD = this;
		if (!MOD.gardenReady()) return { isEmpty: true, name: 'Empty', growth: 0, status: 'Empty' };
		var g = Game.Objects['Farm'].minigame;
		if (!g || !g.plot || !g.plot[y] || !g.plot[y][x]) {
			return { isEmpty: true, name: 'Empty', growth: 0, status: 'Empty' };
		}
		var tile = g.plot[y][x];
		if (!tile || tile[0] === 0) {
			return { isEmpty: true, name: 'Empty', growth: 0, status: 'Empty' };
		}
		var plantId = tile[0] - 1;
		var plant = g.plantsById[plantId];
		if (!plant) {
			return { isEmpty: false, name: 'Unknown', growth: 0, status: 'Unknown plant' };
		}
		var age = tile[1];
		var mature = plant.mature || 100;
		var growthPct = Math.floor((age / mature) * 100);
		var isMature = age >= mature;
		// Stage calculation matching game's tileTooltip logic
		var stageNum, stage, effectScale;
		if (age >= mature) {
			stageNum = 4; stage = 'mature'; effectScale = 100;
		} else if (age >= mature * 0.666) {
			stageNum = 3; stage = 'bloom'; effectScale = 50;
		} else if (age >= mature * 0.333) {
			stageNum = 2; stage = 'sprout'; effectScale = 25;
		} else {
			stageNum = 1; stage = 'bud'; effectScale = 10;
		}
		var status = isMature ? 'Mature' : (growthPct < 33 ? 'Budding' : 'Growing');
		return {
			isEmpty: false,
			name: plant.name,
			growth: growthPct,
			status: status,
			isMature: isMature,
			plantId: plantId,
			stage: stage,
			stageNum: stageNum,
			effectScale: effectScale,
			age: age,
			matureAge: mature,
			plant: plant
		};
	},
	// Announce message via Garden live region
	gardenAnnounce: function(message) {
		// Try garden virtual panel live region first, then fall back to global announcer
		var liveRegion = l('a11yGardenLiveRegion') || l('srAnnouncer');
		if (liveRegion) {
			liveRegion.textContent = '';
			setTimeout(function() {
				liveRegion.textContent = message;
			}, 50);
		}
	},
	// Toggle collapsible garden information panel
	toggleGardenInfoPanel: function() {
		var MOD = this;
		var panel = l('a11yGardenInfoPanel');
		var infoBtn = l('gardenTool-0');
		if (!infoBtn) {
			var M = Game.Objects['Farm'].minigame;
			if (M && M.tools && M.tools.info) {
				infoBtn = l('gardenTool-' + M.tools.info.id);
			}
		}

		// Helper to collapse panel
		var collapsePanel = function() {
			if (panel) panel.style.display = 'none';
			if (infoBtn) {
				infoBtn.setAttribute('aria-expanded', 'false');
				infoBtn.focus();
			}
		};

		// If panel exists, toggle it
		if (panel) {
			var isHidden = panel.style.display === 'none';
			panel.style.display = isHidden ? 'block' : 'none';
			if (infoBtn) infoBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
			if (isHidden) {
				// Update content and focus when showing
				MOD.updateGardenInfoPanelContent();
				var firstFocusable = panel.querySelector('[tabindex="0"]');
				if (firstFocusable) firstFocusable.focus();
			} else {
				// Return focus to button when hiding
				if (infoBtn) infoBtn.focus();
			}
			return;
		}

		// Create the panel
		var M = Game.Objects['Farm'].minigame;
		if (!M) return;

		panel = document.createElement('div');
		panel.id = 'a11yGardenInfoPanel';
		panel.setAttribute('aria-label', 'Garden Effects and Tips. Press Escape to close.');
		panel.style.cssText = 'background:#1a2a1a;border:2px solid #4a4;padding:15px;margin:10px 0;color:#cfc;font-size:13px;';

		// Escape key handler to collapse
		panel.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				collapsePanel();
			}
		});

		// Current effects section
		var effectsSection = document.createElement('div');
		effectsSection.id = 'a11yGardenInfoEffects';
		effectsSection.style.cssText = 'margin-bottom:15px;padding:10px;background:#0a1a0a;border:1px solid #3a3;';
		panel.appendChild(effectsSection);

		// Tips section
		var tipsSection = document.createElement('div');
		tipsSection.style.cssText = 'padding:10px;background:#0a1a0a;border:1px solid #3a3;';
		var tipsHeading = document.createElement('h3');
		tipsHeading.textContent = 'Garden Tips';
		tipsHeading.setAttribute('tabindex', '0');
		tipsHeading.style.cssText = 'margin:0 0 8px 0;color:#8f8;';
		tipsSection.appendChild(tipsHeading);
		var tipsList = document.createElement('ul');
		tipsList.style.cssText = 'margin:0;padding-left:20px;';
		var tips = [
			'Use Shift + Enter on a plot to plant a seed without deselecting it, so you can plant multiple of the same seed.',
			'Cross-breed plants by planting them close together.',
			'New plants grow in empty tiles nearby.',
			'Unlock seeds by harvesting mature plants.',
			'When you ascend, plants reset but seeds are kept.',
			'Garden has no effect while game is closed.'
		];
		tips.forEach(function(tip) {
			var li = document.createElement('li');
			li.textContent = tip;
			li.style.cssText = 'margin-bottom:12px;line-height:1.4;';
			tipsList.appendChild(li);
		});
		tipsSection.appendChild(tipsList);
		panel.appendChild(tipsSection);

		// Insert panel after the info button
		if (infoBtn && infoBtn.parentNode) {
			infoBtn.parentNode.insertBefore(panel, infoBtn.nextSibling);
		}

		// Update content and set expanded state
		MOD.updateGardenInfoPanelContent(effectsSection);
		if (infoBtn) infoBtn.setAttribute('aria-expanded', 'true');

		// Focus the first focusable element in effects section
		var firstFocusable = effectsSection.querySelector('[tabindex="0"]');
		if (firstFocusable) firstFocusable.focus();
	},
	// Update the garden info panel content
	updateGardenInfoPanelContent: function(effectsSectionEl) {
		var effectsSection = effectsSectionEl || l('a11yGardenInfoEffects');
		if (!effectsSection) return;

		var M = Game.Objects['Farm'].minigame;
		var effectsHeading = document.createElement('h3');
		effectsHeading.textContent = 'Current Garden Effects';
		effectsHeading.setAttribute('tabindex', '0');
		effectsHeading.style.cssText = 'margin:0 0 8px 0;color:#8f8;';

		effectsSection.innerHTML = '';
		effectsSection.appendChild(effectsHeading);

		if (!M || !M.tools || !M.tools.info || !M.tools.info.descFunc) {
			var noEffects = document.createElement('p');
			noEffects.textContent = 'No active plant effects. Plant seeds to gain bonuses!';
			noEffects.style.margin = '0';
			noEffects.setAttribute('tabindex', '0');
			effectsSection.appendChild(noEffects);
			return;
		}

		var descHtml = M.tools.info.descFunc();
		// Strip the tips section that follows the divider line
		var dividerIdx = descHtml.indexOf('<div class="line"></div>');
		if (dividerIdx > 0) descHtml = descHtml.substring(0, dividerIdx);
		if (!descHtml || descHtml.trim() === '') {
			var noEffects = document.createElement('p');
			noEffects.textContent = 'No active plant effects. Plant seeds to gain bonuses!';
			noEffects.style.margin = '0';
			noEffects.setAttribute('tabindex', '0');
			effectsSection.appendChild(noEffects);
			return;
		}

		// Parse HTML and split into individual effects
		var tempDiv = document.createElement('div');
		tempDiv.innerHTML = descHtml;

		// Split by <br> tags first
		var effectsHtml = descHtml.replace(/<br\s*\/?>/gi, '|||SPLIT|||');
		tempDiv.innerHTML = effectsHtml;
		var text = tempDiv.textContent || tempDiv.innerText || '';

		// Also split by bullet characters (•)
		text = text.replace(/•/g, '|||SPLIT|||');

		var effects = text.split('|||SPLIT|||')
			.map(function(e) { return e.replace(/\s+/g, ' ').trim(); })
			.filter(function(e) { return e.length > 0; });

		if (effects.length === 0) {
			var noEffects = document.createElement('p');
			noEffects.textContent = 'No active plant effects. Plant seeds to gain bonuses!';
			noEffects.style.margin = '0';
			noEffects.setAttribute('tabindex', '0');
			effectsSection.appendChild(noEffects);
			return;
		}

		// Create each effect as a navigable item (no extra bullets)
		effects.forEach(function(effect) {
			var effectDiv = document.createElement('div');
			effectDiv.textContent = effect;
			effectDiv.setAttribute('tabindex', '0');
			effectDiv.style.cssText = 'margin-bottom:8px;line-height:1.4;padding-left:5px;';
			effectsSection.appendChild(effectDiv);
		});
	},
	// Harvest plant at plot
	harvestPlot: function(x, y) {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		var info = MOD.getGardenTileInfo(x, y);
		if (info.isEmpty) {
			MOD.gardenAnnounce('Row ' + (y+1) + ', column ' + (x+1) + ', empty');
			return;
		}
		if (!info.isMature) {
			MOD.gardenAnnounce(info.name + ' at row ' + (y+1) + ', column ' + (x+1) + ' is ' + info.growth + '% grown, not ready to harvest');
			return;
		}
		g.harvest(x, y);
		MOD.gardenAnnounce('Harvested ' + info.name + ' from row ' + (y+1) + ', column ' + (x+1));
		MOD.updatePlotButton(x, y);
	},
	// Plant at plot (uses selected seed)
	plantAtPlot: function(x, y) {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		var info = MOD.getGardenTileInfo(x, y);
		// If plot has a plant, try to harvest it
		if (!info.isEmpty) {
			MOD.harvestPlot(x, y);
			return;
		}
		// Check if seed is selected
		if (g.seedSelected < 0) {
			MOD.gardenAnnounce('Select a seed first before planting');
			return;
		}
		var seed = g.plantsById[g.seedSelected];
		if (!seed) {
			MOD.gardenAnnounce('Invalid seed selected');
			return;
		}
		// Check affordability before planting for specific feedback
		if (!g.canPlant(seed)) {
			var timeStr = MOD.getTimeUntilAfford(g.getCost(seed));
			if (timeStr) {
				MOD.gardenAnnounce('Can afford in ' + timeStr);
			} else {
				MOD.gardenAnnounce('Cannot afford');
			}
			return;
		}
		var result = g.useTool(g.seedSelected, x, y);
		if (result) {
			MOD.updatePlotButton(x, y);
			// Update snapshot so the tracker doesn't announce this as a spontaneous appearance
			var tile = g.plot[y] && g.plot[y][x];
			if (tile && tile[0] > 0) {
				var pl = g.plantsById[tile[0] - 1];
				if (pl) {
					var key = x + ',' + y;
					var getStage = function(age, mat) { if (age >= mat) return 4; if (age >= mat * 0.666) return 3; if (age >= mat * 0.333) return 2; return 1; };
					MOD.gardenPlotSnapshot[key] = { id: tile[0] - 1, stage: getStage(tile[1], pl.mature || 100), name: pl.name };
				}
			}
		} else {
			MOD.gardenAnnounce('Cannot plant ' + seed.name + ' here');
		}
	},
	// Handle tile activation via keyboard (wraps plantAtPlot with deselection announcement)
	handleTileActivation: function(x, y) {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		var seedBefore = g.seedSelected;
		var seedName = (seedBefore >= 0 && g.plantsById[seedBefore])
			? g.plantsById[seedBefore].name : '';
		MOD.plantAtPlot(x, y);
		// Announce seed deselection (game resets seedSelected after planting unless Shift held)
		if (seedBefore >= 0 && g.seedSelected < 0) {
			setTimeout(function() {
				MOD.gardenAnnounce(seedName + ' seed deselected. Hold Shift while planting to keep seed selected');
			}, 800);
		}
		// Update tile label after planting/harvesting
		setTimeout(function() {
			if (MOD.gardenReady()) {
				MOD.labelSingleGardenTile(Game.Objects['Farm'].minigame, x, y);
			}
		}, 100);
	},
	// Get list of harvestable (mature) plants with coordinates
	getHarvestablePlants: function(g) {
		var plants = [];
		if (!g || !g.plot) return plants;
		for (var y = 0; y < 6; y++) {
			for (var x = 0; x < 6; x++) {
				var tile = g.plot[y] && g.plot[y][x];
				if (!tile || tile[0] === 0) continue;
				var plantId = tile[0] - 1;
				var plant = g.plantsById[plantId];
				if (!plant) continue;
				var age = tile[1];
				var mature = plant.mature || 100;
				if (age >= mature) {
					plants.push({
						name: plant.name,
						x: x,
						y: y
					});
				}
			}
		}
		return plants;
	},
	// Get list of unlocked seeds with effects
	getUnlockedSeeds: function(g) {
		var MOD = this;
		var seeds = [];
		if (!g || !g.plantsById) return seeds;
		for (var id in g.plantsById) {
			var plant = g.plantsById[id];
			if (!plant || !plant.unlocked) continue;
			var effect = plant.effsStr ? MOD.stripHtml(plant.effsStr) : 'No special effects';
			seeds.push({
				id: parseInt(id),
				name: plant.name,
				effect: effect
			});
		}
		return seeds;
	},
	// Track garden plot changes and announce stage transitions, decay, weeds, tile unlocks
	trackGardenPlotChanges: function() {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		var gardenIsOpen = Game.Objects['Farm'].onMinigame;
		var stages = ['bud', 'sprout', 'bloom', 'mature'];
		var getStage = function(age, mature) {
			if (age >= mature) return 4;
			if (age >= mature * 0.666) return 3;
			if (age >= mature * 0.333) return 2;
			return 1;
		};

		// First run: silently populate snapshot without announcing anything
		var isFirstRun = !MOD.gardenSnapshotInitialized;

		// Track harvest counter to distinguish manual harvests from natural decay
		var currentHarvests = g.harvests;
		var harvestHappened = MOD.gardenPrevHarvests >= 0 && currentHarvests > MOD.gardenPrevHarvests;
		MOD.gardenPrevHarvests = currentHarvests;

		var stageUps = [];
		var matured = [];
		var decayed = [];
		var weedAlerts = [];
		var newPlants = [];
		var snapshot = MOD.gardenPlotSnapshot;
		var newSnapshot = {};

		for (var y = 0; y < 6; y++) {
			for (var x = 0; x < 6; x++) {
				if (!g.isTileUnlocked(x, y)) continue;
				var tile = g.plot[y] && g.plot[y][x];
				var key = x + ',' + y;
				if (!tile || tile[0] < 1) {
					// Tile is empty — detect if a mature plant decayed (not manually harvested)
					if (!isFirstRun && !harvestHappened && snapshot[key] && snapshot[key].stage === 4 && !snapshot[key].immortal) {
						decayed.push(snapshot[key].name + ' at row ' + (y+1) + ', column ' + (x+1));
					}
					newSnapshot[key] = null;
					continue;
				}
				var plantId = tile[0] - 1;
				var plant = g.plantsById[plantId];
				if (!plant) { newSnapshot[key] = null; continue; }
				var age = tile[1];
				var stage = getStage(age, plant.mature || 100);
				var prev = snapshot[key];
				newSnapshot[key] = { id: plantId, stage: stage, name: plant.name, immortal: plant.immortal };

				if (!isFirstRun) {
					// Spontaneous appearance detection (crossbreeds, weeds, fungi)
					if (prev === undefined || prev === null) {
						// New plant appeared on a previously empty tile
						newPlants.push(plant.name + ' appeared at row ' + (y+1) + ', column ' + (x+1));
					} else if (prev && prev.id !== plantId) {
						// Plant was replaced by a different one — only weeds/fungi do this
						if (plant.weed || plant.fungus) {
							weedAlerts.push(plant.name + ' overtook ' + prev.name + ' at row ' + (y+1) + ', column ' + (x+1));
						}
					}

					// A1: Stage transition detection (only for plants that existed before)
				}
				if (!isFirstRun && prev && prev.id === plantId && stage > prev.stage) {
					if (stage === 4) {
						matured.push(plant.name + ' at row ' + (y+1) + ', column ' + (x+1));
					} else {
						stageUps.push(plant.name + ' at row ' + (y+1) + ', column ' + (x+1) + ' is now ' + stages[stage - 1]);
					}
				}

				}
		}
		MOD.gardenPlotSnapshot = newSnapshot;

		// A4: New tile unlocks
		var unlockedCount = 0;
		for (var y2 = 0; y2 < 6; y2++) {
			for (var x2 = 0; x2 < 6; x2++) {
				if (g.isTileUnlocked(x2, y2)) unlockedCount++;
			}
		}
		if (!isFirstRun && MOD.gardenPrevUnlockedTiles > 0 && unlockedCount > MOD.gardenPrevUnlockedTiles) {
			var newTiles = unlockedCount - MOD.gardenPrevUnlockedTiles;
			if (gardenIsOpen) MOD.gardenAnnounce('Garden expanded: ' + newTiles + ' new plot' + (newTiles !== 1 ? 's' : '') + ' available, ' + unlockedCount + ' total');
		}
		MOD.gardenPrevUnlockedTiles = unlockedCount;
		MOD.gardenSnapshotInitialized = true;

		// Only announce when garden panel is open (matches sighted experience)
		if (!gardenIsOpen) return;

		// Build announcements — prioritize urgent ones
		if (weedAlerts.length > 0) {
			MOD.announceUrgent('Warning: ' + weedAlerts.join('. '));
		}
		if (decayed.length > 0) {
			var decayedMsg = (decayed.length === 1)
				? decayed[0] + ' has decayed'
				: decayed.length + ' plants decayed: ' + decayed.join(', ');
			MOD.gardenAnnounce(decayedMsg);
		}
		if (newPlants.length > 0) {
			MOD.gardenAnnounce(newPlants.join('. '));
		}
		if (matured.length > 0) {
			var maturedMsg = (matured.length === 1)
				? matured[0] + ' is now mature'
				: matured.length + ' plants matured: ' + matured.join(', ');
			MOD.gardenAnnounce(maturedMsg);
		} else if (stageUps.length > 0) {
			MOD.gardenAnnounce(stageUps.join('. '));
		}
	},
	// Update Garden panel status and harvestable plants (lightweight refresh)
	updateGardenPanelStatus: function() {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		// Re-label the original garden elements
		MOD.labelOriginalGardenElements(g);
		// Update accessible plot buttons in-place
		MOD.updateAllPlotButtons();
	},
	getSpiritSlotEffect: function(god, slotIndex) {
		var MOD = this;
		var descKey = 'desc' + (slotIndex + 1);
		var parts = [];
		if (god.descBefore) parts.push(MOD.stripHtml(god.descBefore));
		if (god[descKey]) parts.push(MOD.stripHtml(god[descKey]));
		else if (god.desc1) parts.push(MOD.stripHtml(god.desc1));
		if (god.descAfter) parts.push(MOD.stripHtml(god.descAfter));
		return parts.join(' ');
	},
	pantheonReady: function() {
		try {
			var temple = Game.Objects['Temple'];
			if (!temple || !temple.minigame) return false;
			if (!temple.minigame.gods) return false;
			if (!temple.minigame.slot) return false;
			return true;
		} catch(e) {
			return false;
		}
	},
	enhancePantheonMinigame: function() {
		var MOD = this;
		if (!MOD.pantheonReady()) return;
		var pan = Game.Objects['Temple'].minigame;
		var slots = ['Diamond', 'Ruby', 'Jade'];
		// Enhance the minigame header
		MOD.enhanceMinigameHeader(Game.Objects['Temple'], 'Pantheon', pan);
		// Enhance spirit slots
		for (var i = 0; i < 3; i++) {
			var slotEl = l('templeSlot' + i);
			if (!slotEl) continue;
			var spiritId = pan.slot[i];
			var lbl = slots[i] + ' slot: ';
			if (spiritId !== -1 && pan.godsById[spiritId]) {
				var god = pan.godsById[spiritId];
				var effect = MOD.getSpiritSlotEffect(god, i);
				lbl += god.name + ', ' + effect + '. Press Enter to remove.';
				MOD.setAttributeIfChanged(slotEl, 'role', 'button');
			} else {
				lbl += 'Empty';
				slotEl.removeAttribute('role');
			}
			slotEl.setAttribute('aria-label', lbl);
			MOD.setAttributeIfChanged(slotEl, 'tabindex', '0');
			if (!slotEl.dataset.a11yEnhanced) {
				slotEl.dataset.a11yEnhanced = 'true';
				(function(slotIndex) {
					function removeGodFromSlot() {
						// Get fresh pantheon reference
						var curPan = Game.Objects['Temple'] && Game.Objects['Temple'].minigame;
						if (!curPan) return;
						var godId = curPan.slot[slotIndex];
						if (godId !== -1) {
							var god = curPan.godsById[godId];
							if (!god) return;
							// Move god element and a11y elements back to roster (matching game's dropGod behavior)
							var godEl = l('templeGod' + god.id);
							var placeholder = l('templeGodPlaceholder' + god.id);
							if (godEl && placeholder && placeholder.parentNode) {
								// Find button container before moving anything
								var btnContainer = godEl.nextSibling;
								if (!btnContainer || btnContainer.className !== 'a11y-spirit-controls') btnContainer = null;
								// Move a11y elements, then god, then buttons  - all before the placeholder
								var headingEl = l('a11y-god-heading-' + god.id);
								var flavorEl = l('a11y-god-flavor-' + god.id);
								var buffEl = l('a11y-god-buff-' + god.id);
								var toMove = [headingEl, flavorEl, buffEl, godEl, btnContainer];
								for (var ai = 0; ai < toMove.length; ai++) {
									if (toMove[ai]) placeholder.parentNode.insertBefore(toMove[ai], placeholder);
								}
								placeholder.style.display = 'none';
							}
							curPan.slotGod(god, -1);
							MOD.announce(god.name + ' removed from ' + slots[slotIndex] + ' slot');
							MOD.enhancePantheonMinigame();
						}
					}
					// keydown for focus mode and direct keyboard interaction
					slotEl.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							removeGodFromSlot();
						}
					});
					// click handles NVDA browse mode, which synthesizes click events on Enter for role="button"
					slotEl.addEventListener('click', function(e) {
						removeGodFromSlot();
					});
				})(i);
			}
		}
		// Move game's worship swaps info to after slots
		var lastSlot = l('templeSlot2');
		if (lastSlot) {
			var templeContent = l('templeContent');
			if (templeContent) {
				// Find the game's swap info element (contains "swap" text, typically at bottom)
				var allDivs = templeContent.querySelectorAll('div');
				for (var d = 0; d < allDivs.length; d++) {
					var div = allDivs[d];
					if (div.textContent && div.textContent.toLowerCase().indexOf('swap') !== -1 &&
						div.id !== 'a11y-pantheon-swaps' && !div.id.startsWith('templeSlot') && !div.id.startsWith('templeGod') && !div.id.startsWith('a11y-')) {
						// Move this element after the last slot
						if (!div.dataset.a11yMoved) {
							div.dataset.a11yMoved = 'true';
							MOD.setAttributeIfChanged(div, 'tabindex', '0');
							lastSlot.parentNode.insertBefore(div, lastSlot.nextSibling);
						}
						break;
					}
				}
			}
		}
		// Enhance spirit icons
		for (var id in pan.gods) {
			var god = pan.gods[id];
			var godEl = l('templeGod' + god.id);
			if (!godEl) continue;
			var slotted = pan.slot.indexOf(god.id);
			var descParts = [];
			if (god.activeDescFunc) {
				try { descParts.push(MOD.stripHtml(god.activeDescFunc())); } catch(e) {}
			}
			if (god.descBefore) descParts.push(MOD.stripHtml(god.descBefore));
			if (god.descAfter) descParts.push(MOD.stripHtml(god.descAfter));
			var cleanDesc = descParts.join('. ').replace(/ +\./g, '.').replace(/ +,/g, ',');
			var flavorText = god.quote ? MOD.stripHtml(god.quote).replace(/ +\./g, '.').replace(/ +,/g, ',') : '';
			// Hide the god element from screen readers
			godEl.setAttribute('aria-hidden', 'true');
			godEl.removeAttribute('tabindex');
			// Add h3 heading, flavor, buff, and slot buttons if not already added
			// Use the placeholder as anchor — the god element may be inside a slot
			var placeholder = l('templeGodPlaceholder' + god.id);
			var anchor = placeholder || godEl;
			if (!godEl.dataset.a11yEnhanced) {
				godEl.dataset.a11yEnhanced = 'true';
				// Add h3 heading before the anchor in the roster
				var heading = document.createElement('h3');
				heading.id = 'a11y-god-heading-' + god.id;
				heading.textContent = god.name + (slotted >= 0 ? ', in ' + slots[slotted] + ' slot' : '');
				heading.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
				anchor.parentNode.insertBefore(heading, anchor);
				// Add flavor text element
				var flavorEl = document.createElement('div');
				flavorEl.id = 'a11y-god-flavor-' + god.id;
				flavorEl.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
				anchor.parentNode.insertBefore(flavorEl, anchor);
				// Add buff text element
				var buffEl = document.createElement('div');
				buffEl.id = 'a11y-god-buff-' + god.id;
				buffEl.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
				anchor.parentNode.insertBefore(buffEl, anchor);
				MOD.createSpiritSlotButtons(god, anchor, pan, slots);
			}
			// Update heading, flavor and buff text (can change when god is slotted/unslotted)
			var headingEl = l('a11y-god-heading-' + god.id);
			var flavorEl = l('a11y-god-flavor-' + god.id);
			var buffEl = l('a11y-god-buff-' + god.id);
			if (headingEl) headingEl.textContent = god.name + (slotted >= 0 ? ', in ' + slots[slotted] + ' slot' : '');
			if (flavorEl) flavorEl.textContent = flavorText;
			if (buffEl) buffEl.textContent = cleanDesc;
			// Update slot button states (disabled for current slot)
			MOD.updateSpiritSlotButtons(god, slotted);
		}

		// Create lump refill proxy at top of pantheon (after last slot)
		// Use templeSlot2 as anchor — templeInfo may not have been moved yet on the first call
		// (its "swap" text isn't populated until the game's draw loop runs).
		// When templeInfo IS moved later, it lands between slot2 and our proxy, giving the
		// correct order: slots → swap info → lump refill → gods.
		var lastSlotAnchor = l('templeSlot2');
		if (lastSlotAnchor) {
			MOD.createLumpRefillProxy('a11y-temple-lump-refill', 'templeLumpRefill', 'Refill all worship swaps', lastSlotAnchor);
		}
	},
	createSpiritSlotButtons: function(god, anchorEl, pantheon, slots) {
		var MOD = this;
		var godId = god.id; // Store ID, not reference
		var godName = god.name;
		var container = document.createElement('div');
		container.className = 'a11y-spirit-controls';
		container.style.cssText = 'display:inline-block;margin-left:5px;';
		for (var i = 0; i < 3; i++) {
			(function(slotIndex, slotName) {
				var btn = document.createElement('button');
				btn.id = 'a11y-god-' + godId + '-slot-' + slotIndex;
				btn.textContent = slotName.charAt(0);
				btn.setAttribute('aria-label', 'Place ' + godName + ' in ' + slotName + ' slot');
				btn.style.cssText = 'width:24px;height:24px;margin:2px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;';
				btn.addEventListener('click', function(e) {
					e.stopPropagation();
					// Get fresh references to pantheon and god
					var pan = Game.Objects['Temple'] && Game.Objects['Temple'].minigame;
					if (!pan) return;
					var currentGod = pan.godsById[godId];
					if (!currentGod) return;
					// Already in this slot — do nothing
					if (currentGod.slot === slotIndex) return;
					// Slot occupied by another god — must remove that god first
					if (pan.slot[slotIndex] !== -1) {
						var occupant = pan.godsById[pan.slot[slotIndex]];
						MOD.announce(slots[slotIndex] + ' slot is occupied by ' + (occupant ? occupant.name : 'another spirit') + '. Remove it first.');
						return;
					}
					if (pan.swaps <= 0) {
						MOD.announce('Cannot place ' + godName + '. No worship swaps available.');
						return;
					}
					pan.slotGod(currentGod, slotIndex);
					pan.useSwap(1);
					MOD.announce(godName + ' placed in ' + slotName + ' slot');
					MOD.enhancePantheonMinigame();
				});
				container.appendChild(btn);
			})(i, slots[i]);
		}
		anchorEl.parentNode.insertBefore(container, anchorEl.nextSibling);
	},
	updateSpiritSlotButtons: function(god, currentSlot) {
		var MOD = this;
		var slots = ['Diamond', 'Ruby', 'Jade'];
		var descKeys = ['desc1', 'desc2', 'desc3'];
		// currentSlot: -1 if not slotted, 0/1/2 if in a slot
		for (var i = 0; i < 3; i++) {
			var btn = l('a11y-god-' + god.id + '-slot-' + i);
			if (!btn) continue;
			var lbl = 'Place ' + god.name + ' in ' + slots[i] + ' slot';
			var slotDesc = god[descKeys[i]] ? MOD.stripHtml(god[descKeys[i]]).replace(/ +\./g, '.').replace(/ +,/g, ',') : '';
			if (slotDesc) lbl += ', ' + slotDesc;
			MOD.setAttributeIfChanged(btn, 'aria-label', lbl);
		}
	},
		enhanceGrimoireMinigame: function() {
		var MOD = this, grim = Game.Objects['Wizard tower'] && Game.Objects['Wizard tower'].minigame;
		if (!grim) return;
		// Enhance the minigame header
		MOD.enhanceMinigameHeader(Game.Objects['Wizard tower'], 'Grimoire', grim);

		// Remove any old accessible panel if it exists
		var oldPanel = l('a11yGrimoirePanel');
		if (oldPanel) oldPanel.remove();

		// Fix grimoire container accessibility - remove aria-hidden only
		var grimContainer = l('row7minigame');
		if (grimContainer) {
			grimContainer.removeAttribute('aria-hidden');
			// Fix parent elements that might have aria-hidden
			var parent = grimContainer.parentNode;
			while (parent && parent !== document.body) {
				if (parent.getAttribute && parent.getAttribute('aria-hidden') === 'true') {
					parent.removeAttribute('aria-hidden');
				}
				parent = parent.parentNode;
			}
		}

		// Hide original game's magic/spells display text elements only
		// Be careful not to hide containers that contain the spell icons
		var origMagicBar = grimContainer ? grimContainer.querySelector('.grimoireBar') : null;
		if (origMagicBar) {
			// Only hide if it doesn't contain spell icons
			if (!origMagicBar.querySelector('.grimoireSpell')) {
				origMagicBar.setAttribute('aria-hidden', 'true');
			}
		}
		var origInfo = grimContainer ? grimContainer.querySelector('.grimoireInfo') : null;
		if (origInfo) {
			// Only hide if it doesn't contain spell icons
			if (!origInfo.querySelector('.grimoireSpell')) {
				origInfo.setAttribute('aria-hidden', 'true');
			}
		}
		// Also try to hide the magic meter text specifically
		var magicMeter = grimContainer ? grimContainer.querySelector('.grimoireMagicM') : null;
		if (magicMeter) {
			magicMeter.setAttribute('aria-hidden', 'true');
		}

		// Get current magic values
		var currentMagic = Math.floor(grim.magic);
		var maxMagic = Math.floor(grim.magicM);
		var spellsCast = grim.spellsCast || 0;
		var spellsCastTotal = grim.spellsCastTotal || 0;
		var magicRegen = (grim.magic < grim.magicM) ? ', recovering ' + Beautify((grim.magicPS || 0) * Game.fps, 2) + ' per second' : '';
		var magicText = 'Magic: ' + currentMagic + ' / ' + maxMagic + magicRegen + '. Spells cast: ' + spellsCast + ', total: ' + spellsCastTotal + '.';

		// Find the first spell to determine where spells are located
		var firstSpell = document.querySelector('.grimoireSpell');
		var spellContainer = firstSpell ? firstSpell.parentNode : grimContainer;

		// Add magic heading at the very top of the spell container (same container as spells)
		var magicLabelId = 'a11y-grimoire-magic';
		var existingMagicLabel = l(magicLabelId);
		if (!existingMagicLabel && spellContainer) {
			var magicLabel = document.createElement('h3');
			magicLabel.id = magicLabelId;
			magicLabel.setAttribute('tabindex', '0');
			magicLabel.style.cssText = 'display:block;font-size:12px;color:#fff;padding:5px;margin-bottom:10px;';
			magicLabel.textContent = magicText;
			spellContainer.insertBefore(magicLabel, spellContainer.firstChild);
			// Create announcer for spell cast outcomes
			var announcer = document.createElement('div');
			announcer.id = 'a11y-grimoire-announcer';
			announcer.setAttribute('role', 'status');
			announcer.setAttribute('aria-live', 'assertive');
			announcer.setAttribute('aria-atomic', 'true');
			announcer.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
			spellContainer.insertBefore(announcer, magicLabel.nextSibling);
		} else if (existingMagicLabel) {
			MOD.setTextIfChanged(existingMagicLabel, magicText);
		}

		// Add magic meter explanation info note (static, created once)
		var magicHeading = l('a11y-grimoire-magic');
		if (magicHeading && !l('a11y-grimoire-info')) {
			MOD.ensureInfoNote('a11y-grimoire-info', 'Maximum magic depends on Wizard Tower count and level. Magic refills over time, slower when lower.', magicHeading);
		}

		// Install persistent Game.Popup wrapper for spell outcome announcements
		if (!MOD._origGamePopup) {
			MOD._origGamePopup = Game.Popup;
			Game.Popup = function(text, x, y) {
				if (MOD.grimoireSpellCasting && !MOD.shimmerPopupActive) {
					var announcer = l('a11y-grimoire-announcer');
					if (announcer) {
						var cleanText = MOD.stripHtml(text || '');
						// Clear then set after a brief delay so repeated announcements are picked up
						announcer.textContent = '';
						setTimeout(function() { announcer.textContent = cleanText; }, 50);
					}
				}
				return MOD._origGamePopup(text, x, y);
			};
		}

		// Enhance spell buttons - order: effect, then cast button
		document.querySelectorAll('.grimoireSpell').forEach(function(b) {
			var id = b.id.replace('grimoireSpell', ''), sp = grim.spellsById[id];
			if (sp) {
				var cost = Math.floor(grim.getSpellCost(sp) * 100) / 100;
				var canCast = currentMagic >= cost;

				// Ensure spell button's parent is accessible
				var spellParent = b.parentNode;
				if (spellParent) {
					spellParent.removeAttribute('aria-hidden');
				}

				// Hide original spell icon from screen readers (it has no text)
				b.setAttribute('aria-hidden', 'true');

				// Remove old H3 headings and cost divs from previous version
				var oldHeading = l('a11y-spell-heading-' + sp.id);
				if (oldHeading) oldHeading.remove();
				var oldCost = l('a11y-spell-cost-' + sp.id);
				if (oldCost) oldCost.remove();

				// 1. Create cast button with aria-label including cost and status
				var castBtnId = 'a11y-spell-cast-' + sp.id;
				var existingCastBtn = l(castBtnId);
				var btnText = 'Cast ' + sp.name;
				var ariaLabel = sp.name + ', ' + cost + ' magic, ' + (canCast ? 'can cast' : 'cannot cast');
				if (!existingCastBtn) {
					var castBtn = document.createElement('button');
					castBtn.id = castBtnId;
					castBtn.type = 'button';
					castBtn.textContent = btnText;
					castBtn.setAttribute('aria-label', ariaLabel);
					castBtn.style.cssText = 'display:block;font-size:11px;color:#fff;background:#333;border:1px solid #666;padding:5px 10px;margin:5px 0 10px 0;cursor:pointer;';
					castBtn.addEventListener('click', (function(spell) { return function() {
						MOD.grimoireSpellCasting = true;
						var result = grim.castSpell(spell);
						// If castSpell returns false, not enough magic (no popup fired)
						if (result === false) {
							var announcer = l('a11y-grimoire-announcer');
							if (announcer) {
								announcer.textContent = '';
								setTimeout(function() {
									announcer.textContent = 'Not enough magic to cast ' + spell.name + '.';
								}, 50);
							}
						}
						// Refresh grimoire labels immediately after casting
						setTimeout(function() { MOD.enhanceGrimoireMinigame(); }, 100);
						// Update features panel immediately so buff time changes (e.g. Stretch Time) are reflected
						setTimeout(function() { MOD.updateFeaturesPanel(); }, 200);
						// Clear flag after 3s to cover Gambler's Fever Dream delayed cast
						setTimeout(function() { MOD.grimoireSpellCasting = false; }, 3000);
					}; })(sp));
					// Insert after the original spell icon
					if (b.nextSibling) {
						b.parentNode.insertBefore(castBtn, b.nextSibling);
					} else {
						b.parentNode.appendChild(castBtn);
					}
				} else {
					// Update aria-label on existing button for refresh cycles
					MOD.setAttributeIfChanged(existingCastBtn, 'aria-label', ariaLabel);
				}

				// 2. Add effect description after the cast button
				var effectId = 'a11y-spell-effect-' + sp.id;
				var existingEffect = l(effectId);
				var effectText = 'Effect: ' + MOD.stripHtml(sp.descFunc ? sp.descFunc() : (sp.desc || ''));
				if (sp.fail) {
					var backfireChance = Math.ceil(100 * grim.getFailChance(sp));
					effectText += '. Backfire (' + backfireChance + '% chance): ' + MOD.stripHtml(sp.failDesc || '');
				}
				var castBtnEl = l(castBtnId);
				if (!existingEffect && castBtnEl) {
					var effectDiv = document.createElement('div');
					effectDiv.id = effectId;
					MOD.setAttributeIfChanged(effectDiv, 'tabindex', '0');
					effectDiv.style.cssText = 'display:block;font-size:10px;color:#999;margin:2px 0;';
					effectDiv.textContent = effectText;
					if (castBtnEl.nextSibling) {
						castBtnEl.parentNode.insertBefore(effectDiv, castBtnEl.nextSibling);
					} else {
						castBtnEl.parentNode.appendChild(effectDiv);
					}
				} else if (existingEffect) {
					MOD.setTextIfChanged(existingEffect, effectText);
				}
			}
		});

		// Create lump refill proxy at top of grimoire (after info note)
		var grimoireInfoNote = l('a11y-grimoire-info');
		if (!grimoireInfoNote) grimoireInfoNote = l('a11y-grimoire-announcer');
		if (!grimoireInfoNote) grimoireInfoNote = l('a11y-grimoire-magic');
		if (grimoireInfoNote) {
			MOD.createLumpRefillProxy('a11y-grimoire-lump-refill', 'grimoireLumpRefill', 'Refill 100 magic', grimoireInfoNote);
		}
	},
	enhanceStockMarketMinigame: function() {
		var MOD = this, mkt = Game.Objects['Bank'] && Game.Objects['Bank'].minigame;
		if (!mkt) return;
		MOD.wrapStockMarketFunctions();
		// Enhance the minigame header
		MOD.enhanceMinigameHeader(Game.Objects['Bank'], 'Stock Market', mkt);
		// Create tick timer info bar at top of stock market
		var bankInfoBar = l('a11y-bank-info-bar');
		var bankContent = l('bankContent');
		if (bankContent) {
			if (!bankInfoBar) {
				bankInfoBar = document.createElement('div');
				bankInfoBar.id = 'a11y-bank-info-bar';
				bankInfoBar.setAttribute('tabindex', '0');
				bankInfoBar.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
				bankContent.insertBefore(bankInfoBar, bankContent.firstChild);
			}
			var tickText = 'Next tick in ' + Game.sayTime((Game.fps * mkt.secondsPerTick) - mkt.tickT + 30, -1);
			MOD.setTextIfChanged(bankInfoBar, tickText);
		}
		// Hide original tick timer from screen readers
		var origBankNextTick = l('bankNextTick');
		if (origBankNextTick) origBankNextTick.setAttribute('aria-hidden', 'true');
		// Hide visual-only graph icons from screen readers
		if (bankContent) {
			bankContent.querySelectorAll('.bankGraphIcon').forEach(function(icon) {
				icon.setAttribute('aria-hidden', 'true');
			});
		}
		// Enhance each stock row
		document.querySelectorAll('.bankGood').forEach(function(r) {
			var id = r.id.replace('bankGood-', ''), good = mkt.goodsById[id];
			if (!good) return;
			var goodName = good.name.replace('%1', Game.bakeryName);
			// Remove old role/aria-label from the row div
			r.removeAttribute('role');
			r.removeAttribute('aria-label');
			// Insert or update visually-hidden H3 heading
			var headingId = 'a11y-stock-heading-' + id;
			var heading = l(headingId);
			if (!heading) {
				heading = document.createElement('h3');
				heading.id = headingId;
				heading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
				r.insertBefore(heading, r.firstChild);
			}
			var delta = mkt.goodDelta(good.id);
			var trend = delta > 0 ? 'Rising' : (delta < 0 ? 'Falling' : 'Stable');
			trend += ' ' + (delta >= 0 ? '+' : '') + delta + '%';
			var maxStock = mkt.getGoodMaxStock(good);
			var lastBoughtAt = (good.prev && good.stock > 0) ? ', last bought at $' + Beautify(good.prev, 2) + ' each' : '';
			var headingText = goodName + ', ' + good.stock + ' of ' + maxStock + ' shares, $' + Beautify(mkt.getGoodPrice(good), 2) + ', ' + trend + lastBoughtAt;
			MOD.setTextIfChanged(heading, headingText);
			// Stock info div with value and warehouse details
			var goodPrice = mkt.getGoodPrice(good);
			var stockValue = good.stock > 0 ? Beautify(Game.cookiesPsRawHighest * goodPrice * good.stock) : '0';
			var trendText = '';
			if (good.vals && good.vals.length >= 2) {
				var newest = good.vals[0];
				var oldest = good.vals[good.vals.length - 1];
				var pctChange = oldest > 0 ? Math.round((newest - oldest) / oldest * 100) : 0;
				if (pctChange > 3) trendText = 'Graph: trending upward, up ' + pctChange + '%. ';
				else if (pctChange < -3) trendText = 'Graph: trending downward, down ' + Math.abs(pctChange) + '%. ';
				else trendText = 'Graph: trend is level. ';
			}
			var stockInfoText = trendText + 'Value of held stock: ' + stockValue + ' cookies. Increase warehouse storage with office upgrades and more ' + good.building.plural + ', plus 10 per ' + good.building.single + ' level (currently +' + (good.building.level * 10) + ')';
			MOD.ensureInfoNote('a11y-stock-info-' + id, stockInfoText, heading);
			if (good.desc) {
				var companyInfoId = 'a11y-stock-company-' + id;
				var companyText = MOD.stripHtml(good.desc);
				MOD.ensureInfoNote(companyInfoId, companyText, l('a11y-stock-info-' + id));
			}
			// Aria-hide visual-only .bankSymbol and .icon elements
			r.querySelectorAll('.bankSymbol, .icon').forEach(function(el) {
				el.setAttribute('aria-hidden', 'true');
			});
			// Enhance view/hide graph toggle
			var viewHideBtn = l('bankGood-' + id + '-viewHide');
			if (viewHideBtn) {
				var viewLabel = good.hidden ? 'Show ' + goodName + ' on graph' : 'Hide ' + goodName + ' on graph';
				MOD.setAttributeIfChanged(viewHideBtn, 'aria-label', viewLabel);
				MOD.setAttributeIfChanged(viewHideBtn, 'role', 'button');
				MOD.setAttributeIfChanged(viewHideBtn, 'tabindex', '0');
				if (!viewHideBtn.dataset.a11yEnhanced) {
					viewHideBtn.dataset.a11yEnhanced = 'true';
					viewHideBtn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); viewHideBtn.click(); }
					});
				}
			}
			// Enhance buy/sell buttons by class and ID
			var price = mkt.getGoodPrice(good);
			var overhead = 1 + 0.01 * (20 * Math.pow(0.95, mkt.brokers));
			var spaceLeft = maxStock - good.stock;
			r.querySelectorAll('.bankButton').forEach(function(btn) {
				var btnId = btn.id || '';
				var suffixMatch = btnId.match(/bankGood-\d+_(.*)/);
				if (!suffixMatch) return;
				var suffix = suffixMatch[1];
				var isSell = suffix.charAt(0) === '-';
				var label;
				if (isSell) {
					var sellPart = suffix.substring(1);
					var sellQty;
					if (sellPart === 'All') {
						sellQty = good.stock;
						if (sellQty > 0) {
							var revenue = Game.cookiesPsRawHighest * price * sellQty;
							var sellTime = Game.sayTime(price * sellQty * Game.fps, -1);
							label = 'Sell all ' + goodName + ', ' + sellQty + ' shares, earns ' + Beautify(revenue) + ' cookies';
							if (sellTime) label += ', worth ' + sellTime + ' of CpS';
						} else {
							label = 'Sell all ' + goodName + ', no shares owned';
						}
					} else {
						sellQty = parseInt(sellPart, 10);
						var actualSellQty = Math.min(sellQty, good.stock);
						if (actualSellQty > 0) {
							var revenue = Game.cookiesPsRawHighest * price * actualSellQty;
							var sellTime = Game.sayTime(price * actualSellQty * Game.fps, -1);
							label = 'Sell ' + sellPart + ' ' + goodName + ', earns ' + Beautify(revenue) + ' cookies';
							if (sellTime) label += ', worth ' + sellTime + ' of CpS';
						} else {
							label = 'Sell ' + sellPart + ' ' + goodName + ', no shares owned';
						}
					}
					if (good.last === 1) label += ', unavailable this tick';
				} else {
					var costPerUnit = Game.cookiesPsRawHighest * price * overhead;
					if (suffix === 'Max') {
						var affordable = costPerUnit > 0 ? Math.floor(Game.cookies / costPerUnit) : 0;
						var buyQty = Math.min(affordable, spaceLeft);
						if (buyQty > 0) {
							var cost = costPerUnit * buyQty;
							var buyTime = Game.sayTime(price * overhead * buyQty * Game.fps, -1);
							label = 'Buy maximum ' + goodName + ', ' + buyQty + ' shares, costs ' + Beautify(cost) + ' cookies';
							if (buyTime) label += ', worth ' + buyTime + ' of CpS';
						} else if (spaceLeft <= 0) {
							label = 'Buy maximum ' + goodName + ', warehouse full';
						} else {
							label = 'Buy maximum ' + goodName + ', cannot afford';
						}
					} else {
						var buyQty = parseInt(suffix, 10);
						var actualBuyQty = Math.min(buyQty, spaceLeft);
						if (actualBuyQty > 0 && Game.cookies >= costPerUnit * actualBuyQty) {
							var cost = costPerUnit * actualBuyQty;
							var buyTime = Game.sayTime(price * overhead * actualBuyQty * Game.fps, -1);
							label = 'Buy ' + suffix + ' ' + goodName + ', costs ' + Beautify(cost) + ' cookies';
							if (buyTime) label += ', worth ' + buyTime + ' of CpS';
						} else if (spaceLeft <= 0) {
							label = 'Buy ' + suffix + ' ' + goodName + ', warehouse full';
						} else {
							label = 'Buy ' + suffix + ' ' + goodName + ', costs ' + Beautify(costPerUnit * actualBuyQty) + ' cookies, cannot afford';
						}
					}
					if (good.last === 2) label += ', unavailable this tick';
				}
				MOD.setAttributeIfChanged(btn, 'aria-label', label);
				btn.removeAttribute('aria-hidden');
				MOD.setAttributeIfChanged(btn, 'role', 'button');
				MOD.setAttributeIfChanged(btn, 'tabindex', '0');
				if (!btn.dataset.a11yEnhanced) {
					btn.dataset.a11yEnhanced = 'true';
					btn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
					});
				}
			});
		});
		// Enhance profit display in header
		var bankBalance = l('bankBalance');
		if (bankBalance) {
			var profitLabel;
			if (mkt.profit > 0) profitLabel = 'Profit, $' + Beautify(mkt.profit, 2);
			else if (mkt.profit < 0) profitLabel = 'Loss, $' + Beautify(Math.abs(mkt.profit), 2);
			else profitLabel = 'Break even';
			MOD.setAttributeIfChanged(bankBalance, 'aria-label', profitLabel);
		}
		var bankHeader = l('bankHeader');
		if (bankHeader) {
			// Add general info heading for navigation
			if (!l('a11y-profits-heading')) {
				var profitsHeading = document.createElement('h3');
				profitsHeading.id = 'a11y-profits-heading';
				profitsHeading.textContent = 'General information';
				profitsHeading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
				bankHeader.insertBefore(profitsHeading, bankHeader.firstChild);
			}
			var summaryId = 'a11y-stock-summary';
			var summary = l(summaryId);
			if (!summary) {
				summary = document.createElement('div');
				summary.id = summaryId;
				summary.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
				summary.setAttribute('tabindex', '0');
				bankHeader.appendChild(summary);
			}
			var overheadPct = Beautify(20 * Math.pow(0.95, mkt.brokers), 2);
			var profitText;
			if (mkt.profit > 0) profitText = 'Profit $' + Beautify(mkt.profit, 2);
			else if (mkt.profit < 0) profitText = 'Loss $' + Beautify(Math.abs(mkt.profit), 2);
			else profitText = 'Break even';
			MOD.setTextIfChanged(summary, 'Stock Market: ' + profitText + '. Overhead: ' + overheadPct + '%');
		}
		// Enhance office upgrade button
		var officeUpgradeBtn = l('bankOfficeUpgrade');
		if (officeUpgradeBtn) {
			var office = mkt.offices[mkt.officeLevel];
			if (office && office.cost) {
				var upgradeLabel = 'Upgrade office from ' + office.name + ', costs ' + office.cost[0] + ' cursors, requires level ' + office.cost[1] + ' cursors';
				MOD.setAttributeIfChanged(officeUpgradeBtn, 'aria-label', upgradeLabel);
			} else if (office) {
				MOD.setAttributeIfChanged(officeUpgradeBtn, 'aria-label', office.name + ', fully upgraded');
			}
			MOD.setAttributeIfChanged(officeUpgradeBtn, 'role', 'button');
			MOD.setAttributeIfChanged(officeUpgradeBtn, 'tabindex', '0');
			if (!officeUpgradeBtn.dataset.a11yEnhanced) {
				officeUpgradeBtn.dataset.a11yEnhanced = 'true';
				officeUpgradeBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); officeUpgradeBtn.click(); }
				});
			}
			// Office info div with description
			var officeDesc = office ? MOD.stripHtml(office.desc || '') : '';
			var officeInfoText = 'Office level ' + (mkt.officeLevel + 1) + ': ' + (office ? office.name : 'Unknown') + '. ' + officeDesc;
			MOD.ensureInfoNote('a11y-office-info', officeInfoText, officeUpgradeBtn);
		}
		// Enhance hire broker button
		var hireBrokerBtn = l('bankBrokersBuy');
		if (hireBrokerBtn) {
			var brokerDisabled = hireBrokerBtn.classList.contains('bankButtonOff');
			var brokerLabel = 'Hire broker, ' + mkt.brokers + ' of ' + mkt.getMaxBrokers() + ' brokers, overhead ' + Beautify(20 * Math.pow(0.95, mkt.brokers), 2) + '%';
			var brokerPrice = mkt.getBrokerPrice();
			brokerLabel += ', costs ' + Beautify(brokerPrice) + ' cookies';
			if (brokerDisabled) {
				if (mkt.brokers >= mkt.getMaxBrokers()) {
					brokerLabel += ', maximum brokers hired';
				} else {
					brokerLabel += ', cannot afford';
				}
			}
			MOD.setAttributeIfChanged(hireBrokerBtn, 'aria-label', brokerLabel);
			MOD.setAttributeIfChanged(hireBrokerBtn, 'role', 'button');
			MOD.setAttributeIfChanged(hireBrokerBtn, 'tabindex', '0');
			if (!hireBrokerBtn.dataset.a11yEnhanced) {
				hireBrokerBtn.dataset.a11yEnhanced = 'true';
				hireBrokerBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hireBrokerBtn.click(); }
				});
			}
			// Broker info div with mechanics explanation
			var brokerOverheadPct = Beautify(20 * Math.pow(0.95, mkt.brokers), 2);
			var brokerInfoText = 'Buying goods incurs overhead of +20%. Each broker reduces this by 5%. Current overhead: ' + brokerOverheadPct + '%. Max brokers: ' + mkt.getMaxBrokers() + ' (highest grandmas owned divided by 10, plus grandma level). Broker cost: 20 minutes of CpS';
			MOD.ensureInfoNote('a11y-broker-info', brokerInfoText, hireBrokerBtn);
		}
		// Enhance loan buttons
		for (var loanId = 1; loanId <= 3; loanId++) {
			var loanBtn = l('bankLoan' + loanId);
			if (loanBtn && loanBtn.style.display !== 'none') {
				var loanType = mkt.loanTypes[loanId - 1];
				var isActive = Game.hasBuff('Loan ' + loanId) || Game.hasBuff('Loan ' + loanId + ' (interest)');
				var loanDisabled = loanBtn.classList.contains('bankButtonOff');
				var loanLabel = isActive ? loanType[0] + ', active' : 'Take out ' + loanType[0];
				if (loanDisabled && !isActive) loanLabel += ', unavailable';
				MOD.setAttributeIfChanged(loanBtn, 'aria-label', loanLabel);
				MOD.setAttributeIfChanged(loanBtn, 'role', 'button');
				MOD.setAttributeIfChanged(loanBtn, 'tabindex', '0');
				if (!loanBtn.dataset.a11yEnhanced) {
					loanBtn.dataset.a11yEnhanced = 'true';
					(function(btn) {
						btn.addEventListener('keydown', function(e) {
							if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
						});
					})(loanBtn);
				}
				// Loan info div with full mechanics
				// loanType: [name, mult, duration, paybackMult, paybackDuration, downpayment%, quote]
				var boostPct = '+' + Math.round((loanType[1] - 1) * 100) + '%';
				var boostDuration = Game.sayTime(60 * loanType[2] * Game.fps);
				var paybackPct = Math.round((loanType[3] - 1) * 100) + '%';
				var paybackDuration = Game.sayTime(60 * loanType[4] * Game.fps);
				var downpayment = Beautify(Game.cookies * loanType[5]);
				var downpaymentPct = loanType[5] * 100;
				var loanInfoText = boostPct + ' CpS for ' + boostDuration + ', then ' + paybackPct + ' CpS for ' + paybackDuration + '. Downpayment: ' + downpayment + ' cookies (' + downpaymentPct + '% of bank)';
				MOD.ensureInfoNote('a11y-loan-info-' + loanId, loanInfoText, loanBtn);
			}
		}
	},
	wrapStockMarketFunctions: function() {
		var MOD = this;
		if (MOD.stockMarketWrapped) return;
		var mkt = Game.Objects['Bank'] && Game.Objects['Bank'].minigame;
		if (!mkt) return;
		MOD.stockMarketWrapped = true;

		var origBuyGood = mkt.buyGood;
		mkt.buyGood = function(id, n) {
			var me = mkt.goodsById[id];
			if (!me) return origBuyGood.apply(this, arguments);
			var stockBefore = me.stock;
			var result = origBuyGood.apply(this, arguments);
			var goodName = me.name.replace('%1', Game.bakeryName);
			if (result) {
				var bought = me.stock - stockBefore;
				MOD.announce('Bought ' + bought + ' ' + goodName);
			} else {
				var reason;
				if (me.last === 2) {
					reason = 'Cannot buy and sell in the same tick';
				} else if (me.stock >= mkt.getGoodMaxStock(me)) {
					reason = 'Warehouse full';
				} else {
					reason = 'Cannot afford';
				}
				MOD.announce(goodName + ' purchase failed. ' + reason);
			}
			MOD.enhanceStockMarketMinigame();
			return result;
		};

		var origSellGood = mkt.sellGood;
		mkt.sellGood = function(id, n) {
			var me = mkt.goodsById[id];
			if (!me) return origSellGood.apply(this, arguments);
			var stockBefore = me.stock;
			var result = origSellGood.apply(this, arguments);
			var goodName = me.name.replace('%1', Game.bakeryName);
			if (result) {
				var sold = stockBefore - me.stock;
				MOD.announce('Sold ' + sold + ' ' + goodName);
			} else {
				var reason;
				if (me.last === 1) {
					reason = 'Cannot buy and sell in the same tick';
				} else if (me.stock <= 0) {
					reason = 'No shares owned';
				} else {
					reason = 'Cannot sell';
				}
				MOD.announce(goodName + ' sale failed. ' + reason);
			}
			MOD.enhanceStockMarketMinigame();
			return result;
		};
	},
	enhanceMainUI: function() {
		var MOD = this;
		// Create structural navigation headings
		MOD.addStructuralHeadings();
		// Legacy/Ascend button
		var lb = l('legacyButton');
		if (lb) {
			lb.setAttribute('role', 'button'); lb.setAttribute('tabindex', '0');
			MOD.updateLegacyButtonLabel();
			if (!lb.dataset.a11yEnhanced) {
				lb.dataset.a11yEnhanced = 'true';
				lb.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); PlaySound('snd/tick.mp3'); Game.Ascend(); } });
			}
		}
		// Menu buttons
		['prefsButton', 'statsButton', 'logButton'].forEach(function(id) {
			var b = l(id);
			if (b) {
				b.setAttribute('role', 'button');
				b.setAttribute('tabindex', '0');
				var labels = {
					'prefsButton': 'Options menu',
					'statsButton': 'Statistics menu',
					'logButton': 'Info and updates log'
				};
				b.setAttribute('aria-label', labels[id] || id);
			}
		});
		// Hide version badge and update notification — purely visual, not gameplay-relevant
		var versionNumber = l('versionNumber');
		if (versionNumber) versionNumber.setAttribute('aria-hidden', 'true');
		var checkForUpdate = l('checkForUpdate');
		if (checkForUpdate) checkForUpdate.setAttribute('aria-hidden', 'true');
		// Prompt close button (closes Options, Stats, Info, and dialog prompts)
		var promptClose = l('promptClose');
		if (promptClose && !promptClose.dataset.a11yEnhanced) {
			promptClose.setAttribute('role', 'button');
			promptClose.setAttribute('tabindex', '0');
			promptClose.setAttribute('aria-label', 'Close');
			promptClose.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
			});
			promptClose.dataset.a11yEnhanced = '1';
		}
		// Big cookie
		var bc = l('bigCookie');
		if (bc) bc.setAttribute('aria-label', 'Big cookie - Click to bake cookies');
		// Store section - H2 heading added in enhanceUpgradeShop
		// Upgrades section
		var up = l('upgrades');
		if (up) { up.setAttribute('role', 'region'); up.setAttribute('aria-label', 'Available Upgrades'); }
		// Buildings section - heading added in addStructuralHeadings
		// Create a wrapper region around just the building elements (not buy/sell buttons)
		var products = l('products');
		if (products && !l('a11yBuildingsRegion')) {
			var buildingsRegion = document.createElement('div');
			buildingsRegion.id = 'a11yBuildingsRegion';
			buildingsRegion.setAttribute('role', 'region');
			buildingsRegion.setAttribute('aria-label', 'Available Buildings');
			// Find first building element (product0) and insert wrapper before it
			var firstBuilding = l('product0');
			if (firstBuilding) {
				products.insertBefore(buildingsRegion, firstBuilding);
				// Move all product elements into the wrapper (use .product class to
				// avoid matching child elements like productName, productPrice, etc.)
				var productElements = products.querySelectorAll('.product');
				productElements.forEach(function(el) {
					buildingsRegion.appendChild(el);
				});
			}
		}
		// Hide native shimmer and buff elements - the mod's own panels cover these
		var shimmersL = l('shimmers');
		if (shimmersL) shimmersL.setAttribute('aria-hidden', 'true');
		var buffsL = l('buffs');
		if (buffsL) buffsL.setAttribute('aria-hidden', 'true');
	},
	addStructuralHeadings: function() {
		var MOD = this;
		// Add News heading as independent landmark (right under the legacy button area)
		if (!l('a11yNewsHeading')) {
			var newsHeading = document.createElement('h2');
			newsHeading.id = 'a11yNewsHeading';
			newsHeading.textContent = 'News';
			// Use clip-rect technique for better screen reader compatibility
			newsHeading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
			// Insert after the legacy button
			var legacyButton = l('legacyButton');
			if (legacyButton && legacyButton.parentNode) {
				legacyButton.parentNode.insertBefore(newsHeading, legacyButton.nextSibling);
			} else {
				// Fallback: insert at start of sectionLeft
				var sectionLeft = l('sectionLeft');
				if (sectionLeft) {
					sectionLeft.insertBefore(newsHeading, sectionLeft.firstChild);
				} else {
					// Last resort: append to body
					document.body.appendChild(newsHeading);
				}
			}
		}
		// Make ticker focusable and set aria-live off (users read it manually in browse mode)
		var tickerEl = l('commentsText1');
		if (tickerEl) {
			tickerEl.setAttribute('tabindex', '0');
			tickerEl.setAttribute('aria-live', 'off');
		}
		// Add Buildings heading between upgrades and building list in the store
		var products = l('products');
		if (products && !l('a11yBuildingsHeading')) {
			var buildingsHeading = document.createElement('h3');
			buildingsHeading.id = 'a11yBuildingsHeading';
			buildingsHeading.textContent = 'Buildings';
			buildingsHeading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
			// Insert before the products container (after upgrades, before buildings)
			products.parentNode.insertBefore(buildingsHeading, products);
		}
	},
	enhanceUpgradeShop: function() {
		var MOD = this;
		// Label all upgrades in store
		for (var i in Game.UpgradesInStore) {
			var u = Game.UpgradesInStore[i];
			if (u) MOD.populateUpgradeLabel(u);
		}
		var uc = l('upgrades');
		if (uc) {
			// Make the existing #storeTitle serve as the store heading
			var storeTitle = l('storeTitle');
			if (storeTitle) {
				MOD.setAttributeIfChanged(storeTitle, 'role', 'heading');
				storeTitle.setAttribute('aria-level', '2');
			}
			// Remove old separate heading if it exists from a prior version
			var oldHeading = l('a11yStoreHeading');
			if (oldHeading) oldHeading.remove();
		}
		// Update milk selector crate label (RebuildUpgrades recreates the crate DOM)
		MOD.updateMilkLabel();
		// Vault upgrades
		var vc = l('vaultUpgrades');
		if (vc) {
			MOD.setAttributeIfChanged(vc, 'role', 'region'); vc.setAttribute('aria-label', 'Vaulted');
			vc.querySelectorAll('.crate.upgrade').forEach(function(c) {
				var id = c.dataset.id;
				if (id && Game.UpgradesById[id]) {
					var upg = Game.UpgradesById[id];
					var n = upg.dname || upg.name;
					c.removeAttribute('aria-labelledby');
					c.setAttribute('aria-label', n + ' (Vaulted). Cost: ' + Beautify(Math.round(upg.getPrice())));
					MOD.setAttributeIfChanged(c, 'role', 'button');
					MOD.setAttributeIfChanged(c, 'tabindex', '0');
					for (var ci = 0; ci < c.children.length; ci++) {
						c.children[ci].setAttribute('aria-hidden', 'true');
					}
				}
			});
		}
		// Buy All Upgrades button — only exists when player has 'Inspired checklist'
		var buyAllBtn = l('storeBuyAllButton');
		if (buyAllBtn && !buyAllBtn.dataset.a11yEnhanced) {
			buyAllBtn.setAttribute('role', 'button');
			buyAllBtn.setAttribute('tabindex', '0');
			buyAllBtn.setAttribute('aria-label', 'Buy all affordable upgrades. Shift click to vault instead.');
			buyAllBtn.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					buyAllBtn.click();
				}
			});
			buyAllBtn.dataset.a11yEnhanced = 'true';
		}
	},
	stripHtml: function(h) {
		if (!h) return '';
		// Decode HTML entities using textarea
		var txt = document.createElement('textarea');
		txt.innerHTML = h;
		var decoded = txt.value;
		// Replace bullet with dash for readability
		decoded = decoded.replace(/•/g, ' - ');
		// Strip any remaining HTML tags and normalize whitespace
		return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
	},
	formatTime: function(ms) {
		if (ms <= 0) return '0s';
		var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
		if (h > 0) return h + 'h ' + (m % 60) + 'm';
		if (m > 0) return m + 'm ' + (s % 60) + 's';
		return s + 's';
	},
	getTimeUntilAfford: function(price) {
		try {
			if (!Game.Has('Genius accounting')) return '';
			var cookies = Game.cookies;
			if (cookies >= price) return 'Affordable now';
			var deficit = price - cookies;
			var cps = Game.cookiesPs;
			if (Game.cpsSucked) cps = cps * (1 - Game.cpsSucked);
			if (cps <= 0) return 'Cannot afford yet';
			var seconds = Math.ceil(deficit / cps);
			if (seconds < 60) return 'less than a minute';
			var minutes = Math.ceil(seconds / 60);
			if (minutes < 60) {
				return 'about ' + minutes + ' minute' + (minutes !== 1 ? 's' : '');
			}
			var hours = Math.floor(minutes / 60);
			var remainMin = minutes % 60;
			if (hours < 24) {
				if (remainMin > 0) return 'about ' + hours + ' hr ' + remainMin + ' min';
				return 'about ' + hours + ' hour' + (hours !== 1 ? 's' : '');
			}
			var days = Math.floor(hours / 24);
			var remainHr = hours % 24;
			if (remainHr > 0) return 'about ' + days + ' day' + (days !== 1 ? 's' : '') + ' ' + remainHr + ' hr';
			return 'about ' + days + ' day' + (days !== 1 ? 's' : '');
		} catch(e) {
			return 'Unknown';
		}
	},
	getBuildingInfoText: function(building) {
		var MOD = this;
		try {
			var lines = [];
			// Calculate price based on current bulk mode
			var isBuyMode = Game.buyMode === 1;
			var bulkAmount = Game.buyBulkShortcut ? Game.buyBulkOld : Game.buyBulk;

			if (isBuyMode) {
				var price;
				if (bulkAmount === -1) {
					price = building.bulkPrice || building.price;
				} else {
					price = building.getSumPrice ? building.getSumPrice(bulkAmount) : building.price * bulkAmount;
				}
				if (Game.cookies < price) {
					var timeStr = MOD.getTimeUntilAfford(price);
					if (timeStr) lines.push('Can afford in ' + timeStr);
				}
			}
			// In sell mode, don't show time until affordable

			if (building.amount > 0) {
				var eachCps = (building.storedTotalCps / building.amount) * Game.globalCpsMult;
				var totalCps = building.storedTotalCps * Game.globalCpsMult;
				lines.push('Each produces: ' + Beautify(eachCps, 1) + ' cookies per second');
				lines.push('Total production: ' + Beautify(totalCps, 1) + ' cookies per second');
				if (Game.cookiesPs > 0 && building.storedTotalCps > 0) {
					// Use the same formula as the game tooltip (line 8093 of game-main.js)
					var pct = ((building.storedTotalCps * Game.globalCpsMult) / Game.cookiesPs) * 100;
					var pctStr = pct < 0.1 ? 'Less than 0.1' : (Math.round(pct * 10) / 10);
					lines.push(pctStr + ' percent of total CpS');
				}
			}
			if (building.desc) {
				lines.push('Flavor: ' + MOD.stripHtml(building.desc));
			}
			return lines.join('. ');
		} catch(e) {
			return 'Info unavailable';
		}
	},
	ensureBuildingInfoButton: function(building) {
		// Redirect to text version
		this.ensureBuildingInfoText(building);
	},
	ensureBuildingInfoText: function(building) {
		var MOD = this;
		try {
			var productEl = l('product' + building.id);
			if (!productEl) return;
			var textId = 'a11y-building-info-' + building.id;
			var existingText = l(textId);
			var infoText = MOD.getBuildingInfoText(building);
			if (existingText) {
				existingText.textContent = infoText;
				existingText.removeAttribute('aria-label');
				existingText.removeAttribute('role');
				if (!existingText.hasAttribute('tabindex')) existingText.setAttribute('tabindex', '0');
				// Visibility is controlled by filterUnownedBuildings, not here
			} else {
				// Create info text element as description source for the building button
				var infoDiv = document.createElement('div');
				infoDiv.id = textId;
				infoDiv.className = 'a11y-building-info';
				infoDiv.style.cssText = 'display:block;padding:6px;margin:2px 0;font-size:11px;color:#aaa;background:#1a1a1a;border:1px solid #333;';
				infoDiv.setAttribute('tabindex', '0');
				infoDiv.textContent = infoText;
				if (productEl.nextSibling) {
					productEl.parentNode.insertBefore(infoDiv, productEl.nextSibling);
				} else {
					productEl.parentNode.appendChild(infoDiv);
				}
			}
		} catch(e) {}
	},
	getUpgradeInfoText: function(upgrade) {
		var MOD = this;
		try {
			var price = Math.round(upgrade.getPrice());
			var timeStr = MOD.getTimeUntilAfford(price);
			if (timeStr) return 'Time until affordable: ' + timeStr;
			return '';
		} catch(e) {
			return '';
		}
	},
	ensureUpgradeInfoButton: function(upgrade, crate) {
		var MOD = this;
		try {
			if (!crate || !upgrade) return;
			var btnId = 'a11y-info-btn-upgrade-' + upgrade.id;
			var btn = l(btnId);
			if (!btn) {
				btn = document.createElement('button');
				btn.id = btnId;
				btn.type = 'button';
				btn.textContent = 'i';
				btn.style.cssText = 'display:block;width:48px;height:20px;margin:2px auto;background:#1a1a1a;color:#fff;border:1px solid #444;cursor:pointer;font-size:11px;';
				if (crate.nextSibling) {
					crate.parentNode.insertBefore(btn, crate.nextSibling);
				} else {
					crate.parentNode.appendChild(btn);
				}
			}
			btn.setAttribute('aria-label', MOD.getUpgradeInfoText(upgrade));
			MOD.setAttributeIfChanged(btn, 'role', 'button');
			MOD.setAttributeIfChanged(btn, 'tabindex', '0');
		} catch(e) {}
	},
	populateUpgradeLabel: function(u) {
		if (!u) return;
		var MOD = this;
		var n = u.dname || u.name;
		var t = n + '. ';
		if (u.bought) {
			t += 'Purchased.';
		} else {
			var price = Math.round(u.getPrice());
			t += 'Cost: ' + Beautify(price) + '.';
			t += Game.cookies >= price ? ' Affordable.' : ' Cannot afford.';
		}
		// Find the button across upgrade containers and set aria-label directly
		var containers = [l('upgrades'), l('toggleUpgrades'), l('techUpgrades'), l('vaultUpgrades')];
		for (var ci = 0; ci < containers.length; ci++) {
			if (!containers[ci]) continue;
			var btn = containers[ci].querySelector('[data-id="' + u.id + '"]');
			if (btn) {
				btn.removeAttribute('aria-labelledby');
				btn.setAttribute('aria-label', t);
				MOD.setAttributeIfChanged(btn, 'role', 'button');
				MOD.setAttributeIfChanged(btn, 'tabindex', '0');
				// Hide child elements from screen reader so only aria-label is read
				for (var c = 0; c < btn.children.length; c++) {
					btn.children[c].setAttribute('aria-hidden', 'true');
				}
				if (!btn.dataset.a11yEnhanced) {
					btn.dataset.a11yEnhanced = 'true';
					btn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
					});
				}
				break;
			}
		}
		// Selector upgrades have their own label functions — re-apply after the generic label
		var selectorName = u.name || '';
		if (selectorName === 'Milk selector') MOD.updateMilkLabel();
		else if (selectorName === 'Background selector') MOD.updateBackgroundLabel();
		else if (selectorName === 'Golden cookie sound selector') MOD.updateSoundLabel();
		// Clear ariaReader label so game's crateTooltip text can't stick
		var a = l('ariaReader-upgrade-' + u.id);
		if (a) a.innerHTML = '';
		// Also add a visible/focusable text element below the upgrade
		MOD.ensureUpgradeInfoText(u);
	},
	ensureUpgradeInfoText: function(u) {
		var MOD = this;
		if (!u) return;
		// Skip bought non-toggle upgrades (toggle upgrades like Elder Pledge can be re-activated)
		if (u.bought && u.pool !== 'toggle') return;
		// Find the upgrade crate element
		var crate = null;
		var containers = [l('upgrades'), l('techUpgrades'), l('toggleUpgrades')];
		for (var ci = 0; ci < containers.length; ci++) {
			if (!containers[ci]) continue;
			crate = containers[ci].querySelector('[data-id="' + u.id + '"]');
			if (crate) break;
		}
		if (!crate) return;
		// Check if info text already exists
		var textId = 'a11y-upgrade-info-' + u.id;
		var existingText = l(textId);
		// Build the info text - cost is already in the button aria-label
		var infoText = '';
		var desc = MOD.stripHtml(u.desc || '');
		if (u.canBuy()) {
			infoText = desc;
		} else {
			var timeStr = MOD.getTimeUntilAfford(u.getPrice());
			if (timeStr) {
				infoText = 'Can afford in ' + timeStr + '. ' + desc;
			} else {
				infoText = desc;
			}
		}
		if (existingText) {
			existingText.textContent = infoText;
			existingText.removeAttribute('aria-label');
			existingText.removeAttribute('role');
		} else {
			// Create info text element (like Grimoire effect text - focusable but not a button)
			var infoDiv = document.createElement('div');
			infoDiv.id = textId;
			infoDiv.className = 'a11y-upgrade-info';
			infoDiv.style.cssText = 'display:block;padding:6px;margin:4px 0;font-size:12px;color:#ccc;background:#1a1a1a;border:1px solid #444;';
			infoDiv.setAttribute('tabindex', '0');
			infoDiv.textContent = infoText;
			// Insert after the crate
			if (crate.nextSibling) {
				crate.parentNode.insertBefore(infoDiv, crate.nextSibling);
			} else {
				crate.parentNode.appendChild(infoDiv);
			}
		}
	},
	labelLumpRefill: function(elementId, effectDesc) {
		var el = l(elementId);
		if (!el) return;
		var canRefill = Game.canRefillLump();
		var canAfford = Game.lumps >= 1;
		var lbl = effectDesc + '. Cost: 1 sugar lump';
		if (!canAfford) {
			lbl += ', cannot afford';
		} else if (canRefill) {
			lbl += ', ready';
		} else {
			lbl += ', usable in ' + Game.sayTime(Game.getLumpRefillRemaining() + Game.fps, -1);
		}
		this.setAttributeIfChanged(el, 'aria-label', lbl);
		MOD.setAttributeIfChanged(el, 'role', 'button');
		MOD.setAttributeIfChanged(el, 'tabindex', '0');
		if (!el.dataset.a11yEnhanced) {
			el.dataset.a11yEnhanced = 'true';
			el.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
			});
		}
	},
	createLumpRefillProxy: function(proxyId, origId, desc, afterEl) {
		var MOD = this;
		var proxy = l(proxyId);
		if (!proxy && afterEl && afterEl.parentNode) {
			proxy = document.createElement('button');
			proxy.id = proxyId;
			proxy.type = 'button';
			proxy.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
			proxy.addEventListener('click', function() {
				var orig = l(origId);
				if (orig) orig.click();
			});
			if (afterEl.nextSibling) {
				afterEl.parentNode.insertBefore(proxy, afterEl.nextSibling);
			} else {
				afterEl.parentNode.appendChild(proxy);
			}
		}
		if (proxy) {
			var canRefill = Game.canRefillLump();
			var canAfford = Game.lumps >= 1;
			var lbl = desc + '. Cost: 1 sugar lump';
			if (!canAfford) {
				lbl += ', cannot afford';
			} else if (canRefill) {
				lbl += ', ready';
			} else {
				lbl += ', usable in ' + Game.sayTime(Game.getLumpRefillRemaining() + Game.fps, -1);
			}
			MOD.setAttributeIfChanged(proxy, 'aria-label', lbl);
		}
		// Hide the original element from screen readers
		var orig = l(origId);
		if (orig) {
			orig.setAttribute('aria-hidden', 'true');
			MOD.setAttributeIfChanged(orig, 'tabindex', '-1');
		}
	},
	ensureInfoNote: function(id, text, afterEl) {
		var existing = l(id);
		if (existing) {
			this.setTextIfChanged(existing, text);
			existing.removeAttribute('aria-label');
			existing.removeAttribute('role');
		} else if (afterEl) {
			var div = document.createElement('div');
			div.id = id;
			div.setAttribute('tabindex', '0');
			div.textContent = text;
			div.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
			if (afterEl.nextSibling) {
				afterEl.parentNode.insertBefore(div, afterEl.nextSibling);
			} else {
				afterEl.parentNode.appendChild(div);
			}
		}
	},
	ensureSeedInfoText: function(g, plant, seedEl) {
		var MOD = this;
		if (!plant || !seedEl) return;
		var seedId = plant.id;
		var textId = 'a11y-garden-seed-info-' + seedId;
		var existingText = l(textId);
		var infoText = '';
	
		if (!plant.unlocked) {
			// Locked seeds are consolidated into a single summary element
			if (existingText) existingText.parentNode.removeChild(existingText);
			return;
		} else {
			var lines = [];
			// Time until affordable (only when not affordable — cost is already on the button)
			if (plant.plantable !== false && !Game.Has('Turbo-charged soil')) {
				var cost = g.getCost(plant);
				if (!g.canPlant(plant)) {
					var timeStr = MOD.getTimeUntilAfford(cost);
					if (timeStr) lines.push('Affordable in ' + timeStr + '.');
				}
			}

			// Effects — most important info
			if (plant.effsStr) {
				lines.push('Effects: ' + MOD.stripHtml(plant.effsStr) + '.');
			}

			// Maturation and lifespan
			var dragonBoost = 1 / (1 + 0.05 * Game.auraMult('Supreme Intellect'));
			var avgTick = plant.ageTick + plant.ageTickR / 2;
			var matFrames = ((100 / avgTick) * (plant.mature / 100) * dragonBoost * g.stepT) * 30;
			var approx = plant.ageTickR > 0 ? 'about ' : '';
			var minuteFrames = Game.fps * 60;
			var matFramesRounded = Math.ceil(matFrames / minuteFrames) * minuteFrames;
			var matLine = 'Maturation: ' + approx + Game.sayTime(matFramesRounded, -1) + '.';
			if (!plant.immortal) {
				var lifeFrames = ((100 / avgTick) * dragonBoost * g.stepT) * 30;
				var lifeFramesRounded = Math.ceil(lifeFrames / minuteFrames) * minuteFrames;
				matLine += ' Lifespan: ' + approx + Game.sayTime(lifeFramesRounded, -1) + '.';
			} else {
				matLine += ' Immortal.';
			}
			lines.push(matLine);

			// Details
			if (plant.detailsStr) {
				lines.push('Details: ' + MOD.stripHtml(plant.detailsStr) + '.');
			}

			infoText = lines.join(' ');
		}

		if (existingText) {
			existingText.textContent = infoText;
			existingText.removeAttribute('aria-label');
			existingText.removeAttribute('role');
		} else {
			var infoDiv = document.createElement('div');
			infoDiv.id = textId;
			infoDiv.className = 'a11y-seed-info';
			infoDiv.style.cssText = 'display:block;padding:6px;margin:4px 0;font-size:12px;color:#ccc;background:#1a1a1a;border:1px solid #444;';
			infoDiv.setAttribute('tabindex', '0');
			infoDiv.textContent = infoText;
			if (seedEl.nextSibling) {
				seedEl.parentNode.insertBefore(infoDiv, seedEl.nextSibling);
			} else {
				seedEl.parentNode.appendChild(infoDiv);
			}
		}

		// Clean up old separate quote element (now merged with type/mutations)
		var oldQuoteEl = l('a11y-garden-seed-quote-' + seedId);
		if (oldQuoteEl) oldQuoteEl.parentNode.removeChild(oldQuoteEl);

		// Combined type, mutations, and flavor text in one div
		var typeMutId = 'a11y-garden-seed-typemut-' + seedId;
		var afterInfo = l(textId) || seedEl;
		if (plant.unlocked) {
			var extraLines = [];
			if (plant.weed) extraLines.push('Type: Weed.');
			if (plant.fungus) extraLines.push('Type: Fungus.');
			if (plant.children && plant.children.length > 0) {
				var unlockedChildren = [];
				var lockedCount = 0;
				for (var i = 0; i < plant.children.length; i++) {
					var childKey = plant.children[i];
					var childPlant = g.plants[childKey];
					if (childPlant) {
						if (childPlant.unlocked) {
							unlockedChildren.push(childPlant.name);
						} else {
							lockedCount++;
						}
					}
				}
				if (unlockedChildren.length > 0 || lockedCount > 0) {
					var mutStr = 'Possible mutations: ';
					if (unlockedChildren.length > 0) {
						mutStr += unlockedChildren.join(', ');
					}
					if (lockedCount > 0) {
						if (unlockedChildren.length > 0) mutStr += ', ';
						mutStr += lockedCount + ' locked';
					}
					extraLines.push(mutStr + '.');
				}
			}
			if (plant.q) {
				extraLines.push(MOD.stripHtml(plant.q));
			}
			var extraText = extraLines.join(' ');
			if (extraText) {
				MOD.ensureInfoNote(typeMutId, extraText, afterInfo);
			} else {
				var existingExtra = l(typeMutId);
				if (existingExtra) existingExtra.parentNode.removeChild(existingExtra);
			}
		} else {
			var existingExtra = l(typeMutId);
			if (existingExtra) existingExtra.parentNode.removeChild(existingExtra);
		}
	},
	// labelUpgradeCrate (store version) removed  - populateUpgradeLabel now handles store upgrade buttons directly
	getToggleUpgradeEffect: function(u) {
		var MOD = this;
		if (!u) return '';
		var name = u.name.toLowerCase();
		// Provide clear effect descriptions for known toggle upgrades
		if (name === 'elder pledge') {
			var duration = Game.Has('Sacrificial rolling pins') ? '60 minutes' : '30 minutes';
			return 'Temporarily stops the Grandmapocalypse for ' + duration + '. Collects all wrinklers. Golden cookies return during this time. Cost increases each use.';
		}
		if (name === 'elder covenant') {
			return 'Permanently stops the Grandmapocalypse but reduces CpS by 5%. No more wrath cookies or wrinklers.';
		}
		if (name === 'revoke elder covenant') {
			return 'Cancels the Elder Covenant. Grandmapocalypse resumes and you regain the 5% CpS.';
		}
		if (name === 'milk selector') {
			return 'Opens a menu to choose which milk is displayed. Cosmetic only.';
		}
		if (name === 'background selector') {
			return 'Opens a menu to choose the game background. Cosmetic only.';
		}
		if (name === 'golden switch') {
			return 'Toggle: When ON, Golden Cookies stop spawning but you gain 50% more CpS. Turn OFF to resume Golden Cookies.';
		}
		if (name === 'shimmering veil') {
			return 'Toggle: When active, buildings produce 50% more but Golden Cookies break the veil. Heavenly upgrade required.';
		}
		if (name.includes('season')) {
			return 'Switches the current season. Each season has unique upgrades and cookies.';
		}
		// Default: use the upgrade's description
		return MOD.stripHtml(u.desc || '');
	},
	wrapPermanentSlotFunctions: function() {
		var MOD = this;
		// Wrap Game.AssignPermanentSlot so we can label the upgrade picker prompt
		if (Game.AssignPermanentSlot) {
			var origAssign = Game.AssignPermanentSlot;
			Game.AssignPermanentSlot = function(slot) {
				origAssign.apply(this, arguments);
				// Label the crates in the prompt after it renders
				setTimeout(function() { MOD.labelPermanentUpgradePrompt(); }, 50);
			};
		}
		// Wrap Game.PutUpgradeInPermanentSlot to announce selections and relabel
		if (Game.PutUpgradeInPermanentSlot) {
			var origPut = Game.PutUpgradeInPermanentSlot;
			Game.PutUpgradeInPermanentSlot = function(upgrade, slot) {
				origPut.apply(this, arguments);
				// Announce the selected upgrade
				var upg = Game.UpgradesById[upgrade];
				if (upg) {
					var name = upg.dname || upg.name;
					MOD.announce('Selected: ' + name);
				}
				// Relabel the selected upgrade display
				setTimeout(function() { MOD.labelPermanentUpgradePromptSelected(); }, 50);
			};
		}
		// Wrap Game.PickAscensionMode to label challenge mode crates in the prompt
		if (Game.PickAscensionMode) {
			var origPick = Game.PickAscensionMode;
			Game.PickAscensionMode = function() {
				origPick.apply(this, arguments);
				setTimeout(function() { MOD.labelChallengeModePrompt(); }, 50);
			};
		}
		// Wrap Game.UpdateAscensionModePrompt to re-label the button after it rebuilds
		if (Game.UpdateAscensionModePrompt) {
			var origUpdateMode = Game.UpdateAscensionModePrompt;
			Game.UpdateAscensionModePrompt = function() {
				origUpdateMode.apply(this, arguments);
				setTimeout(function() { MOD.labelAscendModeButton(); }, 50);
			};
		}
	},
	labelPermanentUpgradePrompt: function() {
		var MOD = this;
		var promptContent = l('promptContentPickPermaUpgrade');
		if (!promptContent) return;
		// Label all upgrade crate buttons in the picker list
		var crates = promptContent.querySelectorAll('button.crate[data-id]');
		crates.forEach(function(crate) {
			var upgId = parseInt(crate.getAttribute('data-id'));
			var upg = Game.UpgradesById[upgId];
			if (!upg) return;
			var name = upg.dname || upg.name;
			var desc = MOD.stripHtml(upg.desc || '');
			var lbl = name + '. ' + desc;
			// Populate the srOnly label inside the button (used by aria-labelledby)
			var srLabel = crate.querySelector('label.srOnly');
			if (srLabel) srLabel.textContent = lbl;
			// Also set aria-label directly as fallback
			crate.setAttribute('aria-label', lbl);
		});
		// Label the currently selected upgrade display
		MOD.labelPermanentUpgradePromptSelected();
		// Label the Confirm/Cancel option links as buttons
		var options = promptContent.parentElement ? promptContent.parentElement.querySelectorAll('a.option') : [];
		for (var i = 0; i < options.length; i++) {
			options[i].setAttribute('role', 'button');
		}
	},
	labelPermanentUpgradePromptSelected: function() {
		var MOD = this;
		// Label the "selected upgrade" display crate in the prompt
		var slotWrap = l('upgradeToSlotWrap');
		if (slotWrap) {
			var selectedCrate = slotWrap.querySelector('button.crate[data-id]');
			if (selectedCrate) {
				var upgId = parseInt(selectedCrate.getAttribute('data-id'));
				var upg = Game.UpgradesById[upgId];
				if (upg && Game.SelectingPermanentUpgrade !== -1) {
					var name = upg.dname || upg.name;
					var desc = MOD.stripHtml(upg.desc || '');
					var lbl = 'Selected upgrade: ' + name + '. ' + desc;
					var srLabel = selectedCrate.querySelector('label.srOnly');
					if (srLabel) srLabel.textContent = lbl;
					selectedCrate.setAttribute('aria-label', lbl);
				}
			}
		}
		// Label the empty slot indicator
		var slotNone = l('upgradeToSlotNone');
		if (slotNone) {
			slotNone.setAttribute('aria-label', 'No upgrade selected');
		}
	},
	labelChallengeModePrompt: function() {
		var MOD = this;
		var promptContent = l('promptContentPickChallengeMode');
		if (!promptContent) return;
		// Label each challenge mode crate
		for (var i in Game.ascensionModes) {
			var el = l('challengeModeSelector' + i);
			if (!el) continue;
			var mode = Game.ascensionModes[i];
			var name = mode.dname || mode.name || 'Unknown';
			var selected = (parseInt(i) === Game.nextAscensionMode) ? ' Currently selected.' : '';
			el.setAttribute('aria-label', name + '.' + selected);
			el.setAttribute('role', 'button');
			el.setAttribute('tabindex', '0');
			if (!el.dataset.a11yEnhanced) {
				el.dataset.a11yEnhanced = 'true';
				el.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.click(); }
				});
			}
		}
		// Label the Confirm option link
		var options = promptContent.parentElement ? promptContent.parentElement.querySelectorAll('a.option') : [];
		for (var j = 0; j < options.length; j++) {
			options[j].setAttribute('role', 'button');
		}
	},
	cleanupAscensionTree: function() {
		var upgrades = l('ascendUpgrades');
		if (!upgrades) return;
		// Hide the decorative first crate (no ID, pointer-events:none, transparent background)
		var crates = upgrades.querySelectorAll('.crate');
		for (var i = 0; i < crates.length; i++) {
			var c = crates[i];
			if (!c.id && c.style.pointerEvents === 'none') {
				c.setAttribute('aria-hidden', 'true');
			}
		}
		// Hide parent link connectors (decorative lines between tree nodes)
		upgrades.querySelectorAll('.parentLink').forEach(function(el) {
			el.setAttribute('aria-hidden', 'true');
		});
		// Hide inner .srOnly labels inside upgrade buttons — we use aria-label instead
		upgrades.querySelectorAll('.srOnly').forEach(function(el) {
			el.setAttribute('aria-hidden', 'true');
		});
	},
	enhanceAscensionUI: function() {
		var MOD = this;
		var ao = l('ascendOverlay');
		if (ao) { ao.removeAttribute('role'); ao.removeAttribute('aria-label'); }
		var ab = l('ascendButton');
		if (ab) {
			MOD.setAttributeIfChanged(ab, 'role', 'button'); MOD.setAttributeIfChanged(ab, 'tabindex', '0');
			ab.setAttribute('aria-label', 'Reincarnate');
			if (!ab.dataset.a11yEnhanced) {
				ab.dataset.a11yEnhanced = 'true';
				ab.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ab.click(); } });
			}
		}
		// Promote prestige level heading from h3 to h2
		var d1 = l('ascendData1');
		var prestigeH3 = d1 ? d1.querySelector('h3') : null;
		if (prestigeH3 && prestigeH3.tagName === 'H3') {
			var h2 = document.createElement('h2');
			h2.id = prestigeH3.id;
			h2.innerHTML = prestigeH3.innerHTML;
			prestigeH3.parentNode.replaceChild(h2, prestigeH3);
		}
		if (d1) {
			d1.removeAttribute('aria-hidden');
			d1.removeAttribute('tabindex');
			d1.setAttribute('aria-label', 'Prestige level: ' + Beautify(Game.prestige));
		}
		// Remove heading role from heavenly chips h3
		var d2 = l('ascendData2');
		var chipsH3 = d2 ? d2.querySelector('h3') : null;
		if (chipsH3) {
			chipsH3.setAttribute('role', 'presentation');
		}
		if (d2) {
			d2.removeAttribute('aria-hidden');
			d2.removeAttribute('tabindex');
			d2.setAttribute('aria-label', 'Heavenly chips available: ' + Beautify(Game.heavenlyChips));
		}
		// Label the challenge mode selector button
		MOD.labelAscendModeButton();
		// Hide decorative/instructional elements from screen readers
		var ai = l('ascendInfo');
		if (ai) ai.setAttribute('aria-hidden', 'true');
		var abg = l('ascendBG');
		if (abg) abg.setAttribute('aria-hidden', 'true');
		// Clean up the tree (decorative crates, parent links, inner labels)
		MOD.cleanupAscensionTree();
		MOD.enhanceHeavenlyUpgrades();
		MOD.enhancePermanentUpgradeSlots();
	},
	labelAscendModeButton: function() {
		var MOD = this;
		var modeBtn = l('ascendModeButton');
		if (!modeBtn) return;
		// The ascendModeButton contains a crate div that opens the challenge mode picker
		var crate = modeBtn.querySelector('.crate');
		if (crate) {
			var modeName = Game.ascensionModes && Game.ascensionModes[Game.nextAscensionMode]
				? Game.ascensionModes[Game.nextAscensionMode].dname : 'None';
			crate.setAttribute('aria-label', 'Challenge mode: ' + modeName + '. Click to change.');
			MOD.setAttributeIfChanged(crate, 'role', 'button');
			MOD.setAttributeIfChanged(crate, 'tabindex', '0');
			if (!crate.dataset.a11yEnhanced) {
				crate.dataset.a11yEnhanced = 'true';
				crate.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); crate.click(); }
				});
			}
		}
	},
	labelChallengeModeSelector: function() {
		var MOD = this;
		if (!Game.ascensionModes) return;
		for (var i in Game.ascensionModes) {
			var mode = Game.ascensionModes[i];
			var el = l('challengeModeSelector' + i);
			if (!el) continue;
			var selected = (parseInt(i) === Game.nextAscensionMode);
			var lbl = mode.dname + '. ';
			if (selected) lbl += 'Selected. ';
			lbl += MOD.stripHtml(mode.desc);
			el.setAttribute('aria-label', lbl);
			MOD.setAttributeIfChanged(el, 'role', 'button');
			MOD.setAttributeIfChanged(el, 'tabindex', '0');
			if (!el.dataset.a11yEnhanced) {
				el.dataset.a11yEnhanced = 'true';
				el.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
				});
			}
		}
	},
	updateAscendDataLabels: function() {
		var d1 = l('ascendData1');
		if (d1) d1.setAttribute('aria-label', 'Prestige level: ' + Beautify(Game.prestige));
		var d2 = l('ascendData2');
		if (d2) d2.setAttribute('aria-label', 'Heavenly chips available: ' + Beautify(Game.heavenlyChips));
	},
	enhancePermanentUpgradeSlots: function() {
		var MOD = this;
		// Find permanent upgrade slots (these are unlocked via heavenly upgrades)
		// Slots are typically named permanentUpgradeSlot0 through permanentUpgradeSlot4
		for (var i = 0; i < 5; i++) {
			var slotEl = l('permanentUpgradeSlot' + i);
			if (!slotEl) continue;
			MOD.setupPermanentSlot(slotEl, i);
		}
		// Also check for slots in the ascension screen
		document.querySelectorAll('.crate.enabled[id^="permanentUpgradeSlot"]').forEach(function(slot) {
			var slotNum = parseInt(slot.id.replace('permanentUpgradeSlot', ''));
			if (!isNaN(slotNum)) MOD.setupPermanentSlot(slot, slotNum);
		});
	},
	setupPermanentSlot: function(slotEl, slotIndex) {
		var MOD = this;
		if (!slotEl || slotEl.dataset.a11ySlotEnhanced) return;
		slotEl.dataset.a11ySlotEnhanced = 'true';
		// Get current upgrade in slot
		var currentUpgrade = Game.permanentUpgrades[slotIndex];
		var currentName = 'Empty';
		if (currentUpgrade !== -1 && Game.UpgradesById[currentUpgrade]) {
			currentName = Game.UpgradesById[currentUpgrade].dname || Game.UpgradesById[currentUpgrade].name;
		}
		var lbl = 'Permanent upgrade slot ' + (slotIndex + 1) + '. ';
		lbl += currentUpgrade === -1 ? 'Empty. ' : 'Contains: ' + currentName + '. ';
		lbl += 'Click to select an upgrade.';
		slotEl.setAttribute('aria-label', lbl);
		MOD.setAttributeIfChanged(slotEl, 'role', 'button');
		MOD.setAttributeIfChanged(slotEl, 'tabindex', '0');
		// Override click to show accessible selection dialog
		slotEl.addEventListener('click', function(e) {
			if (e.isTrusted || e.a11yTriggered) {
				e.preventDefault();
				e.stopPropagation();
				MOD.showUpgradeSelectionDialog(slotIndex);
			}
		}, true);
		slotEl.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				MOD.showUpgradeSelectionDialog(slotIndex);
			}
		});
	},
	showUpgradeSelectionDialog: function(slotIndex) {
		var MOD = this;
		// Remove existing dialog if present
		var existingDialog = l('a11yUpgradeDialog');
		if (existingDialog) existingDialog.remove();
		// Get available upgrades for permanent slots
		var availableUpgrades = [];
		for (var i in Game.UpgradesById) {
			var upg = Game.UpgradesById[i];
			if (upg && upg.bought && upg.pool !== 'prestige' && upg.pool !== 'toggle' && !upg.lasting) {
				// Check if not already in another slot
				var inOtherSlot = false;
				for (var j = 0; j < 5; j++) {
					if (j !== slotIndex && Game.permanentUpgrades[j] === upg.id) {
						inOtherSlot = true;
						break;
					}
				}
				if (!inOtherSlot) {
					availableUpgrades.push(upg);
				}
			}
		}
		// Create accessible dialog - positioned on screen, not hidden
		var dialog = document.createElement('div');
		dialog.id = 'a11yUpgradeDialog';
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-labelledby', 'a11yUpgradeDialogTitle');
		dialog.style.cssText = 'position:fixed;top:10%;left:10%;width:80%;max-width:600px;background:#1a1a2e;border:3px solid #c90;padding:20px;z-index:100000000;max-height:80vh;overflow-y:auto;color:#fff;font-family:Arial,sans-serif;';
		// Title - visible heading
		var title = document.createElement('h2');
		title.id = 'a11yUpgradeDialogTitle';
		title.textContent = 'Select Upgrade for Permanent Slot ' + (slotIndex + 1);
		title.style.cssText = 'margin:0 0 15px 0;color:#fc0;font-size:18px;';
		dialog.appendChild(title);
		// Instructions - visible text
		var instructions = document.createElement('p');
		instructions.textContent = availableUpgrades.length + ' upgrades available. Use Tab to navigate, Enter to select, Escape to cancel.';
		instructions.style.cssText = 'margin:0 0 15px 0;font-size:14px;color:#ccc;';
		dialog.appendChild(instructions);
		// Clear slot button
		var clearBtn = document.createElement('button');
		clearBtn.type = 'button';
		clearBtn.textContent = 'Clear slot (remove upgrade)';
		clearBtn.style.cssText = 'display:block;width:100%;padding:12px;margin:5px 0;background:#444;border:2px solid #666;color:#fff;cursor:pointer;text-align:left;font-size:14px;';
		clearBtn.addEventListener('click', function() {
			Game.permanentUpgrades[slotIndex] = -1;
			MOD.announce('Slot ' + (slotIndex + 1) + ' cleared.');
			dialog.remove();
			// Reset slot enhancement flag so it updates
			var slotEl = l('permanentUpgradeSlot' + slotIndex);
			if (slotEl) slotEl.dataset.a11ySlotEnhanced = '';
			MOD.enhancePermanentUpgradeSlots();
		});
		clearBtn.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') { dialog.remove(); }
		});
		dialog.appendChild(clearBtn);
		// Upgrade list - using visible buttons
		var listLabel = document.createElement('h3');
		listLabel.textContent = 'Available Upgrades:';
		listLabel.style.cssText = 'margin:15px 0 10px 0;color:#fc0;font-size:14px;';
		dialog.appendChild(listLabel);
		var listContainer = document.createElement('div');
		listContainer.setAttribute('role', 'list');
		listContainer.style.cssText = 'max-height:350px;overflow-y:auto;border:1px solid #666;padding:5px;background:#111;';
		if (availableUpgrades.length === 0) {
			var noUpgrades = document.createElement('p');
			noUpgrades.textContent = 'No upgrades available. Purchase upgrades during gameplay first.';
			noUpgrades.style.cssText = 'padding:10px;color:#aaa;';
			listContainer.appendChild(noUpgrades);
		} else {
			availableUpgrades.forEach(function(upg, idx) {
				var option = document.createElement('button');
				option.type = 'button';
				option.setAttribute('role', 'listitem');
				var upgName = upg.dname || upg.name;
				var upgDesc = MOD.stripHtml(upg.desc || '');
				// Visible text shows name, aria-label includes description
				option.textContent = upgName;
				option.setAttribute('aria-label', upgName + '. ' + upgDesc);
				option.style.cssText = 'display:block;width:100%;padding:12px;margin:3px 0;background:#333;border:2px solid #555;color:#fff;cursor:pointer;text-align:left;font-size:14px;';
				option.addEventListener('focus', function() { option.style.background = '#555'; option.style.borderColor = '#fc0'; });
				option.addEventListener('blur', function() { option.style.background = '#333'; option.style.borderColor = '#555'; });
				option.addEventListener('click', function() {
					Game.permanentUpgrades[slotIndex] = upg.id;
					MOD.announce('Set ' + upgName + ' in slot ' + (slotIndex + 1) + '.');
					dialog.remove();
					// Reset slot enhancement flag so it updates
					var slotEl = l('permanentUpgradeSlot' + slotIndex);
					if (slotEl) slotEl.dataset.a11ySlotEnhanced = '';
					MOD.enhancePermanentUpgradeSlots();
				});
				option.addEventListener('keydown', function(e) {
					if (e.key === 'Escape') { dialog.remove(); }
					if (e.key === 'ArrowDown') {
						e.preventDefault();
						var next = option.nextElementSibling;
						if (next) next.focus();
					}
					if (e.key === 'ArrowUp') {
						e.preventDefault();
						var prev = option.previousElementSibling;
						if (prev) prev.focus();
					}
				});
				listContainer.appendChild(option);
			});
		}
		dialog.appendChild(listContainer);
		// Cancel button
		var cancelBtn = document.createElement('button');
		cancelBtn.type = 'button';
		cancelBtn.textContent = 'Cancel';
		cancelBtn.style.cssText = 'display:block;width:100%;padding:12px;margin-top:15px;background:#600;border:2px solid #900;color:#fff;cursor:pointer;font-size:14px;';
		cancelBtn.addEventListener('click', function() { dialog.remove(); });
		cancelBtn.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') { dialog.remove(); }
		});
		dialog.appendChild(cancelBtn);
		// Add to page - visible on screen
		document.body.appendChild(dialog);
		// Focus first upgrade button or clear button
		var firstUpgrade = listContainer.querySelector('button');
		if (firstUpgrade) {
			firstUpgrade.focus();
		} else {
			clearBtn.focus();
		}
		// Handle escape key on dialog
		dialog.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') { dialog.remove(); }
		});
		MOD.announce('Upgrade selection dialog opened for slot ' + (slotIndex + 1) + '. ' + availableUpgrades.length + ' upgrades available. Use Tab to navigate.');
	},
	enhanceHeavenlyUpgrades: function() {
		var MOD = this;
		for (var i in Game.PrestigeUpgrades) {
			var u = Game.PrestigeUpgrades[i];
			if (!u) continue;
			if (u.pool === 'prestigeDecor') continue;
			MOD.labelHeavenlyUpgrade(u);
		}
	},
	labelHeavenlyUpgrade: function(u) {
		if (!u) return;
		var MOD = this;
		var n = u.dname || u.name;
		var p = Beautify(Math.round(u.getPrice()));
		// Split description into effect and flavor text (flavor is inside <q> tags)
		var effect = '';
		var flavor = '';
		if (u.desc) {
			var qMatch = u.desc.match(/<q>([\s\S]*?)<\/q>/);
			if (qMatch) {
				effect = MOD.stripHtml(u.desc.replace(/<q>[\s\S]*?<\/q>/, ''));
				flavor = MOD.stripHtml(qMatch[1]);
			} else {
				effect = MOD.stripHtml(u.desc);
			}
		}
		var cr = l('heavenlyUpgrade' + u.id);
		if (!cr) return;
		// Check if this is a ghosted (locked/future) upgrade
		var isGhosted = cr.classList.contains('ghosted');
		// Build description text (effect + flavor)
		var desc = '';
		if (effect) desc += effect + ' ';
		if (flavor) desc += flavor;
		desc = desc.trim();
		// Create or update a separate info div after the crate for description
		var infoId = 'a11y-heavenly-info-' + u.id;
		var infoEl = l(infoId);
		cr.removeAttribute('aria-describedby');
		if (desc) {
			if (!infoEl) {
				infoEl = document.createElement('div');
				infoEl.id = infoId;
				infoEl.setAttribute('tabindex', '0');
				if (cr.nextSibling) {
					cr.parentNode.insertBefore(infoEl, cr.nextSibling);
				} else {
					cr.parentNode.appendChild(infoEl);
				}
			}
			MOD.setTextIfChanged(infoEl, desc);
			infoEl.removeAttribute('aria-label');
			infoEl.removeAttribute('role');
		} else if (infoEl) {
			infoEl.remove();
		}
		if (isGhosted) {
			// Ghosted upgrades are not interactive but should be discoverable
			var t = n + '. Locked';
			// List missing parent upgrades so blind players can trace the ascension tree
			var missing = [];
			for (var pi = 0; pi < u.parents.length; pi++) {
				var parent = u.parents[pi];
				if (parent && parent !== -1 && !parent.bought) {
					missing.push(parent.dname || parent.name);
				}
			}
			if (missing.length > 0) {
				t += ', requires ' + missing.join(' and ');
			}
			t += '. Cost: ' + p + ' heavenly chips.';
			cr.removeAttribute('aria-labelledby');
			cr.setAttribute('aria-label', t);
			MOD.setAttributeIfChanged(cr, 'role', 'button');
			MOD.setAttributeIfChanged(cr, 'tabindex', '0');
			return;
		}
		// Skip upgrades that aren't purchasable and aren't bought (shouldn't normally be in the DOM)
		if (!u.bought && !u.canBePurchased && !Game.Has('Neuromancy')) return;
		var t = n + '. ';
		if (u.bought) {
			t += 'Owned.';
			// For permanent upgrade slots, show the assigned upgrade name
			var slotMatch = n.match(/Permanent upgrade slot (I+V?|IV|V)/);
			if (slotMatch) {
				var slotNames = {'I':0,'II':1,'III':2,'IV':3,'V':4};
				var slotIdx = slotNames[slotMatch[1]];
				if (slotIdx !== undefined && Game.permanentUpgrades[slotIdx] !== -1) {
					var assignedUpg = Game.UpgradesById[Game.permanentUpgrades[slotIdx]];
					if (assignedUpg) {
						t += ' Contains: ' + (assignedUpg.dname || assignedUpg.name) + '.';
					}
				} else if (slotIdx !== undefined) {
					t += ' Empty.';
				}
			}
		} else {
			var canAfford = Game.heavenlyChips >= u.getPrice();
			t += 'Cost: ' + p + ' heavenly chips. ';
			t += canAfford ? 'Affordable.' : 'Cannot afford.';
		}
		var ar = l('ariaReader-upgrade-' + u.id);
		if (ar) ar.innerHTML = t;
		cr.removeAttribute('aria-labelledby');
		cr.setAttribute('aria-label', t.trim());
		MOD.setAttributeIfChanged(cr, 'role', 'button');
		MOD.setAttributeIfChanged(cr, 'tabindex', '0');
		if (!cr.dataset.a11yEnhanced) {
			cr.dataset.a11yEnhanced = 'true';
			cr.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cr.click(); } });
		}
	},
	retryPendingInits: function() {
		var MOD = this;
		if (MOD.initRetriesComplete) return;
		var allDone = true;

		// Buildings region
		var region = l('a11yBuildingsRegion');
		if (!region || !region.children.length) {
			MOD.enhanceMainUI();
			allDone = false;
		}

		// Active buffs panel
		if (!l('a11yActiveBuffsPanel')) {
			MOD.createActiveBuffsPanel();
			allDone = false;
		}

		// Shimmer panel
		if (!l('a11yShimmerContainer')) {
			MOD.createShimmerPanel();
			allDone = false;
		}

		// Cookies per click display
		if (!l('a11yCpcDisplay')) {
			MOD.createMainInterfaceEnhancements();
			allDone = false;
		}

		// Game stats panel
		if (!l('a11yGameStatsPanel')) {
			MOD.createGameStatsPanel();
			allDone = false;
		}

		// Sugar lump
		var lumps = l('lumps');
		if (lumps && !lumps.dataset.a11yEnhanced) {
			MOD.enhanceSugarLump();
			allDone = false;
		}

		if (allDone) MOD.initRetriesComplete = true;
	},
	updateDynamicLabels: function() {
		var MOD = this;
		// Close all minigame panels once after load (minigame scripts load asynchronously)
		if (MOD.closeMinigamesOnLoad && Game.T > 60) {
			for (var bId in Game.ObjectsById) {
				var bld = Game.ObjectsById[bId];
				if (bld && bld.onMinigame) bld.switchMinigame(false);
			}
			MOD.closeMinigamesOnLoad = false;
		}
		// Track shimmers and buffs every 5 ticks for timely announcements
		if (Game.T % 5 === 0) {
			MOD.trackRapidFireEvents();
			MOD.trackShimmerAnnouncements();
			MOD.updateBuffTracker();
		}
		// Enhance notification dismiss buttons
		var noteDismissBtns = document.querySelectorAll('#notes .close');
		for (var ni = 0; ni < noteDismissBtns.length; ni++) {
			var noteBtn = noteDismissBtns[ni];
			if (!noteBtn.dataset.a11yEnhanced) {
				noteBtn.setAttribute('role', 'button');
				noteBtn.setAttribute('tabindex', '0');
				noteBtn.setAttribute('aria-label', noteBtn.classList.contains('sidenote') ? 'Dismiss all' : 'Dismiss');
				noteBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						this.click();
					}
				});
				noteBtn.dataset.a11yEnhanced = '1';
			}
		}
		// Enhance close buttons on menus, special panels, and choice selectors
		var closeBtns = document.querySelectorAll('.menuClose, #specialPopup .close, #toggleBox .close');
		for (var ci = 0; ci < closeBtns.length; ci++) {
			var closeBtn = closeBtns[ci];
			if (!closeBtn.dataset.a11yEnhanced) {
				closeBtn.setAttribute('role', 'button');
				closeBtn.setAttribute('tabindex', '0');
				closeBtn.setAttribute('aria-label', 'Close');
				closeBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						this.click();
					}
				});
				closeBtn.dataset.a11yEnhanced = '1';
			}
		}

		// Detect Grimoire panel open/close and enhance immediately
		var wizTower = Game.Objects['Wizard tower'];
		if (wizTower && wizTower.minigame) {
			if (wizTower.onMinigame && !MOD.lastGrimoireOpen) {
				MOD.enhanceGrimoireMinigame();
			}
			MOD.lastGrimoireOpen = wizTower.onMinigame;
		}
		// Detect minigame loads and enhance immediately on first availability
		var minigameBuildings = ['Farm', 'Bank', 'Temple', 'Wizard tower'];
		for (var mi = 0; mi < minigameBuildings.length; mi++) {
			var mbName = minigameBuildings[mi];
			var mb = Game.Objects[mbName];
			if (mb && mb.minigame && !MOD.minigameInitDone[mbName]) {
				if (mbName === 'Farm') {
					if (MOD.gardenReady()) {
						MOD.minigameInitDone[mbName] = true;
						MOD.enhanceGardenMinigame();
					}
				} else if (mbName === 'Temple') {
					if (MOD.pantheonReady()) {
						MOD.minigameInitDone[mbName] = true;
						MOD.enhancePantheonMinigame();
					}
				} else if (mbName === 'Wizard tower') {
					MOD.minigameInitDone[mbName] = true;
					MOD.enhanceGrimoireMinigame();
				} else if (mbName === 'Bank') {
					MOD.minigameInitDone[mbName] = true;
					MOD.enhanceStockMarketMinigame();
				}
			}
		}
		// Run building minigame labels every 30 ticks
		if (Game.T % 30 === 0) {
			MOD.enhanceBuildingMinigames();
			MOD.populateProductLabels();
			MOD.updateWrinklerLabels();
			MOD.updateSugarLumpLabel();
			if (Game.lumps !== undefined) MOD.trackedLumpState = { lumps: Game.lumps, lumpT: Game.lumpT };
			MOD.checkVeilState();
			MOD.updateAchievementTracker();
			MOD.updateSeasonTracker();
			MOD.updateLegacyButtonLabel();
			MOD.updateFeaturesPanel();
			MOD.updateMainInterfaceDisplays();
			MOD.updateGameStatsPanel();
		}
		// Regular updates every 60 ticks (2 seconds)
		if (Game.T % 60 === 0) {
			// Retry any failed initializations
			if (!MOD.initRetriesComplete) MOD.retryPendingInits();
			MOD.enhanceUpgradeShop();
			MOD.labelStatsUpgrades();
			MOD.updateDragonLabels();
			MOD.updateQoLLabels();
			MOD.filterUnownedBuildings();
			MOD.labelBuildingLevels();
			MOD.labelBuildingRows();
			// Update minigames when visible
			if (MOD.pantheonReady() && Game.Objects['Temple'].onMinigame) {
				MOD.enhancePantheonMinigame();
			}
			if (Game.Objects['Wizard tower'] && Game.Objects['Wizard tower'].minigame && Game.Objects['Wizard tower'].onMinigame) {
				MOD.enhanceGrimoireMinigame();
			}
			if (Game.Objects['Bank'] && Game.Objects['Bank'].minigame && Game.Objects['Bank'].onMinigame) {
				MOD.enhanceStockMarketMinigame();
			}
			// Update Garden panel when Farm minigame is visible
			if (MOD.gardenReady() && Game.Objects['Farm'].onMinigame) {
				if (!MOD.gardenBuildPanelWrapped) {
					MOD.enhanceGardenMinigame();
				}
				MOD.updateGardenPanelStatus();
			}
			// Track garden plot changes in background (keeps snapshot current); announcements only fire when garden is open
			if (MOD.gardenReady()) {
				MOD.trackGardenPlotChanges();
			}
			// Enhance jukebox and other toggleBox content
			MOD.enhanceToggleBoxContent();
		}
		// Refresh upgrade shop when store changes
		if (Game.storeToRefresh !== MOD.lastStoreRefresh) {
			MOD.lastStoreRefresh = Game.storeToRefresh;
			setTimeout(function() { MOD.enhanceUpgradeShop(); }, 50);
		}
		// Refresh product labels and filter immediately on buy/sell
		if (Game.BuildingsOwned !== MOD.lastBuildingsOwned) {
			MOD.lastBuildingsOwned = Game.BuildingsOwned;
			MOD.populateProductLabels();
			MOD.filterUnownedBuildings();
		}
		// Refresh product labels immediately on buy/sell mode or amount change
		if (Game.buyMode !== MOD.lastBuyMode || Game.buyBulk !== MOD.lastBuyBulk) {
			MOD.lastBuyMode = Game.buyMode;
			MOD.lastBuyBulk = Game.buyBulk;
			MOD.populateProductLabels();
		}
		// Menu enhancements - re-enhance after each UpdateMenu() rebuild
		if (Game.onMenu === 'stats') {
			MOD.enhanceStatsMenu();
		} else if (Game.onMenu === 'prefs') {
			MOD.enhanceOptionsMenu();
		} else if (Game.onMenu === 'log') {
			MOD.enhanceInfoMenu();
		}
		if (Game.OnAscend) {
			if (!MOD.wasOnAscend) {
				MOD.wasOnAscend = true;
				MOD.cleanupAscensionTree();
				MOD.enhanceHeavenlyUpgrades();
				MOD.enhancePermanentUpgradeSlots();
				MOD.labelStatsHeavenly();
				MOD.labelAscendModeButton();
				MOD.updateAscendDataLabels();
			}
			if (MOD.lastHeavenlyChips !== Game.heavenlyChips) {
				MOD.lastHeavenlyChips = Game.heavenlyChips;
				MOD.enhanceHeavenlyUpgrades();
				MOD.labelStatsHeavenly();
				MOD.updateAscendDataLabels();
				MOD.labelAscendModeButton();
			}
		} else {
			if (MOD.wasOnAscend) {
				// Leaving ascension - remove chips display
				var chipsDisplay = l('a11yHeavenlyChipsDisplay');
				if (chipsDisplay) chipsDisplay.remove();
			}
			MOD.wasOnAscend = false;
		}
	},
	populateProductLabels: function() {
		var MOD = this;
		// Populate ariaReader-product-* labels for buildings (created by game when screenreader=1)
		var isBuyMode = Game.buyMode === 1;
		var bulkAmount = Game.buyBulkShortcut ? Game.buyBulkOld : Game.buyBulk;

		for (var i in Game.ObjectsById) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			// Skip mystery buildings to avoid leaking their real name
			var highestOwned = MOD.highestOwnedBuildingId !== undefined ? MOD.highestOwnedBuildingId : -1;
			if (bld.amount === 0 && !bld.locked && (bld.id - highestOwned) >= 2) continue;
			var ariaLabel = l('ariaReader-product-' + bld.id);
			if (ariaLabel) {
				var owned = bld.amount || 0;
				var label = bld.name + '. ' + owned + ' owned. ';

				if (isBuyMode) {
					// Buy mode - show bulk price
					var price;
					if (bulkAmount === -1) {
						price = bld.bulkPrice || bld.price;
						label += 'Buy max. Cost: ' + Beautify(Math.round(price)) + ' cookies.';
					} else {
						price = bld.getSumPrice ? bld.getSumPrice(bulkAmount) : bld.price * bulkAmount;
						if (bulkAmount > 1) {
							label += 'Buy ' + bulkAmount + ' for ' + Beautify(Math.round(price)) + ' cookies.';
						} else {
							label += 'Cost: ' + Beautify(Math.round(price)) + ' cookies.';
						}
					}
					label += Game.cookies >= price ? ' Affordable.' : ' Cannot afford.';
				} else {
					// Sell mode - show sell value
					var sellPrice;
					if (bulkAmount === -1) {
						sellPrice = bld.getReverseSumPrice ? bld.getReverseSumPrice(owned) : Math.floor(bld.price * owned * 0.25);
						label += 'Sell all ' + owned + ' for ' + Beautify(Math.round(sellPrice)) + ' cookies.';
					} else {
						var sellAmount = Math.min(bulkAmount, owned);
						sellPrice = bld.getReverseSumPrice ? bld.getReverseSumPrice(sellAmount) : Math.floor(bld.price * sellAmount * 0.25);
						label += 'Sell ' + sellAmount + ' for ' + Beautify(Math.round(sellPrice)) + ' cookies.';
					}
				}

				MOD.setTextIfChanged(ariaLabel, label);
			}
		}
	},
	enhanceQoLSelectors: function() {
		var MOD = this;
		// Update milk selector crate label in the store
		MOD.updateMilkLabel();
		// Season selector - check if any season switcher upgrade is owned
		var seasonUnlocked = Game.Has('Season switcher');
		var seasonBox = l('seasonBox');
		if (seasonBox) {
			if (seasonUnlocked) {
				MOD.setAttributeIfChanged(seasonBox, 'role', 'button');
				MOD.setAttributeIfChanged(seasonBox, 'tabindex', '0');
				seasonBox.removeAttribute('aria-hidden');
				MOD.updateSeasonLabel();
				if (!seasonBox.dataset.a11yEnhanced) {
					seasonBox.dataset.a11yEnhanced = 'true';
					seasonBox.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seasonBox.click(); }
					});
				}
			} else {
				MOD.setAttributeIfChanged(seasonBox, 'tabindex', '-1');
				seasonBox.setAttribute('aria-hidden', 'true');
			}
		}
		// Generic store pre-buttons (only if visible/unlocked)
		document.querySelectorAll('.storePreButton').forEach(function(btn) {
			// Check if button is visible (display not none)
			var isVisible = btn.offsetParent !== null || getComputedStyle(btn).display !== 'none';
			if (isVisible) {
				MOD.setAttributeIfChanged(btn, 'role', 'button');
				MOD.setAttributeIfChanged(btn, 'tabindex', '0');
				btn.removeAttribute('aria-hidden');
				if (!btn.dataset.a11yEnhanced) {
					btn.dataset.a11yEnhanced = 'true';
					btn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
					});
				}
			} else {
				MOD.setAttributeIfChanged(btn, 'tabindex', '-1');
				btn.setAttribute('aria-hidden', 'true');
			}
		});
	},
	updateMilkLabel: function() {
		var MOD = this;
		var milkUpg = Game.Upgrades['Milk selector'];
		if (!milkUpg || !milkUpg.unlocked) return;
		var milkCrate = MOD.findSelectorCrate('Milk selector');
		if (milkCrate) {
			var milkName = 'Automatic';
			if (Game.milkType !== undefined && Game.milkType > 0 && Game.AllMilks && Game.AllMilks[Game.milkType]) {
				milkName = Game.AllMilks[Game.milkType].name || 'Milk ' + Game.milkType;
			} else if (Game.milkType === 0) {
				milkName = 'Automatic (based on achievements)';
			}
			milkCrate.setAttribute('aria-label', 'Milk selector. Current: ' + milkName + '. Click to open selector.');
		}
	},
	setupMilkSelectorOverride: function() {
		var MOD = this;
		var milkUpg = Game.Upgrades['Milk selector'];
		if (!milkUpg) return;
		var origBuy = Game.Upgrade.prototype.buy;
		milkUpg.buy = function(bypass) {
			var wasOpen = (Game.choiceSelectorOn === milkUpg.id);
			var panelExists = !!l('a11yMilkSelectorPanel');
			if (wasOpen || panelExists) {
				// Closing the selector
				origBuy.call(this, bypass);
				var panel = l('a11yMilkSelectorPanel');
				if (panel) panel.remove();
			} else {
				// Opening the selector
				origBuy.call(this, bypass);
				var toggleBox = l('toggleBox');
				if (toggleBox && toggleBox.style.display === 'block') {
					toggleBox.style.display = 'none';
					toggleBox.innerHTML = '';
					MOD.createMilkSelectorPanel(milkUpg);
				}
			}
		};
	},
	createMilkSelectorPanel: function(upgrade) {
		var MOD = this;
		var oldPanel = l('a11yMilkSelectorPanel');
		if (oldPanel) oldPanel.remove();
		// Get choices from the upgrade's choicesFunction
		var choices = upgrade.choicesFunction();
		if (!choices || !choices.length) return;
		var selectedId = Game.milkType || 0;
		// Assign IDs and sort like the game does
		for (var i = 0; i < choices.length; i++) {
			if (choices[i]) {
				choices[i].id = i;
				choices[i].order = choices[i].order || 0;
			}
		}
		choices.sort(function(a, b) {
			if (!a) return 1;
			if (!b) return -1;
			if (a.order > b.order) return 1;
			if (a.order < b.order) return -1;
			return 0;
		});
		// Create panel
		var panel = document.createElement('div');
		panel.id = 'a11yMilkSelectorPanel';
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #c90;padding:10px;margin:10px 0;';
		// Heading
		var heading = document.createElement('h3');
		heading.style.cssText = 'color:#fc0;margin:0 0 10px 0;font-size:14px;';
		heading.textContent = 'Milk selector';
		heading.setAttribute('tabindex', '-1');
		panel.appendChild(heading);
		// Close button
		var closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.textContent = 'Close';
		closeBtn.setAttribute('aria-label', 'Close milk selector');
		closeBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:5px 0;background:#633;border:1px solid #a66;color:#fff;cursor:pointer;';
		closeBtn.addEventListener('click', function() {
			panel.remove();
			Game.choiceSelectorOn = -1;
			PlaySound('snd/tickOff.mp3');
			var milkCrate = MOD.findSelectorCrate('Milk selector');
			if (milkCrate) milkCrate.focus();
		});
		panel.appendChild(closeBtn);
		// Escape key to close
		panel.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				panel.remove();
				Game.choiceSelectorOn = -1;
				PlaySound('snd/tickOff.mp3');
				var milkCrate = MOD.findSelectorCrate('Milk selector');
				if (milkCrate) milkCrate.focus();
			}
		});
		// Milk choice buttons
		for (var i = 0; i < choices.length; i++) {
			if (!choices[i]) continue;
			var choice = choices[i];
			var id = choice.id;
			var isSelected = (id == selectedId);
			if (choice.div) {
				var divider = document.createElement('hr');
				divider.style.cssText = 'border:1px solid #444;margin:5px 0;';
				panel.appendChild(divider);
			}
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.textContent = choice.name;
			btn.dataset.milkId = id;
			btn.dataset.milkName = choice.name;
			btn.setAttribute('aria-label', choice.name + (isSelected ? ', currently selected' : ''));
			btn.style.cssText = 'display:block;width:100%;padding:8px;margin:2px 0;background:' +
				(isSelected ? '#363' : '#336') + ';border:1px solid ' +
				(isSelected ? '#6a6' : '#66a') + ';color:#fff;cursor:pointer;font-size:13px;';
			(function(choiceId, choiceName) {
				btn.addEventListener('click', function() {
					upgrade.choicesPick(choiceId);
					MOD.announce('Milk changed to ' + choiceName);
					PlaySound('snd/tick.mp3');
					// Update all milk buttons to reflect new selection
					panel.querySelectorAll('button[data-milk-id]').forEach(function(b) {
						var bId = parseInt(b.dataset.milkId);
						var bSel = (bId === choiceId);
						b.setAttribute('aria-label', b.dataset.milkName + (bSel ? ', currently selected' : ''));
						b.style.background = bSel ? '#363' : '#336';
						b.style.borderColor = bSel ? '#6a6' : '#66a';
					});
					MOD.updateMilkLabel();
				});
			})(id, choice.name);
			panel.appendChild(btn);
		}
		// Insert into sectionLeft near other selector panels
		var sectionLeft = l('sectionLeft');
		var sectionLeftExtra = l('sectionLeftExtra');
		if (sectionLeft && sectionLeftExtra) {
			sectionLeft.insertBefore(panel, sectionLeftExtra);
		} else if (sectionLeft) {
			sectionLeft.appendChild(panel);
		}
		heading.focus();
	},
	updateBackgroundLabel: function() {
		var MOD = this;
		// Update the background selector crate in the store with the current background name
		var bgUpg = Game.Upgrades['Background selector'];
		if (!bgUpg || !bgUpg.unlocked) return;
		var bgCrate = MOD.findSelectorCrate('Background selector');
		if (bgCrate) {
			var bgName = 'Automatic';
			if (Game.bgType !== undefined && Game.bgType > 0 && Game.AllBGs && Game.AllBGs[Game.bgType]) {
				bgName = Game.AllBGs[Game.bgType].name || 'Background ' + Game.bgType;
			} else if (Game.bgType === 0) {
				bgName = 'Automatic (changes with milk)';
			}
			bgCrate.setAttribute('aria-label', 'Background selector. Current: ' + bgName + '. Click to open selector.');
		}
	},
	setupBackgroundSelectorOverride: function() {
		var MOD = this;
		var bgUpg = Game.Upgrades['Background selector'];
		if (!bgUpg) return;
		var origBuy = Game.Upgrade.prototype.buy;
		bgUpg.buy = function(bypass) {
			var wasOpen = (Game.choiceSelectorOn === bgUpg.id);
			var panelExists = !!l('a11yBgSelectorPanel');
			if (wasOpen || panelExists) {
				origBuy.call(this, bypass);
				var panel = l('a11yBgSelectorPanel');
				if (panel) panel.remove();
			} else {
				origBuy.call(this, bypass);
				var toggleBox = l('toggleBox');
				if (toggleBox && toggleBox.style.display === 'block') {
					toggleBox.style.display = 'none';
					toggleBox.innerHTML = '';
					MOD.createBackgroundSelectorPanel(bgUpg);
				}
			}
		};
	},
	createBackgroundSelectorPanel: function(upgrade) {
		var MOD = this;
		var oldPanel = l('a11yBgSelectorPanel');
		if (oldPanel) oldPanel.remove();
		var choices = upgrade.choicesFunction();
		if (!choices || !choices.length) return;
		var selectedId = Game.bgType || 0;
		// Assign IDs and sort like the game does
		for (var i = 0; i < choices.length; i++) {
			if (choices[i]) {
				choices[i].id = i;
				choices[i].order = choices[i].order || 0;
			}
		}
		choices.sort(function(a, b) {
			if (!a) return 1;
			if (!b) return -1;
			if (a.order > b.order) return 1;
			if (a.order < b.order) return -1;
			return 0;
		});
		// Create panel
		var panel = document.createElement('div');
		panel.id = 'a11yBgSelectorPanel';
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #c90;padding:10px;margin:10px 0;';
		// Heading
		var heading = document.createElement('h3');
		heading.style.cssText = 'color:#fc0;margin:0 0 10px 0;font-size:14px;';
		heading.textContent = 'Background selector';
		heading.setAttribute('tabindex', '-1');
		panel.appendChild(heading);
		// Close button
		var closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.textContent = 'Close';
		closeBtn.setAttribute('aria-label', 'Close background selector');
		closeBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:5px 0;background:#633;border:1px solid #a66;color:#fff;cursor:pointer;';
		closeBtn.addEventListener('click', function() {
			panel.remove();
			Game.choiceSelectorOn = -1;
			PlaySound('snd/tickOff.mp3');
		});
		panel.appendChild(closeBtn);
		// Escape key to close
		panel.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				panel.remove();
				Game.choiceSelectorOn = -1;
				PlaySound('snd/tickOff.mp3');
			}
		});
		// Background choice buttons
		for (var i = 0; i < choices.length; i++) {
			if (!choices[i]) continue;
			var choice = choices[i];
			var id = choice.id;
			var isSelected = (id == selectedId);
			if (choice.div) {
				var divider = document.createElement('hr');
				divider.style.cssText = 'border:1px solid #444;margin:5px 0;';
				panel.appendChild(divider);
			}
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.textContent = choice.name;
			btn.dataset.bgId = id;
			btn.dataset.bgName = choice.name;
			btn.setAttribute('aria-label', choice.name + (isSelected ? ', currently selected' : ''));
			btn.style.cssText = 'display:block;width:100%;padding:8px;margin:2px 0;background:' +
				(isSelected ? '#363' : '#336') + ';border:1px solid ' +
				(isSelected ? '#6a6' : '#66a') + ';color:#fff;cursor:pointer;font-size:13px;';
			(function(choiceId, choiceName) {
				btn.addEventListener('click', function() {
					upgrade.choicesPick(choiceId);
					MOD.announce('Background changed to ' + choiceName);
					PlaySound('snd/tick.mp3');
					panel.querySelectorAll('button[data-bg-id]').forEach(function(b) {
						var bId = parseInt(b.dataset.bgId);
						var bSel = (bId === choiceId);
						b.setAttribute('aria-label', b.dataset.bgName + (bSel ? ', currently selected' : ''));
						b.style.background = bSel ? '#363' : '#336';
						b.style.borderColor = bSel ? '#6a6' : '#66a';
					});
					MOD.updateBackgroundLabel();
				});
			})(id, choice.name);
			panel.appendChild(btn);
		}
		// Insert into sectionLeft near other selector panels
		var sectionLeft = l('sectionLeft');
		var sectionLeftExtra = l('sectionLeftExtra');
		if (sectionLeft && sectionLeftExtra) {
			sectionLeft.insertBefore(panel, sectionLeftExtra);
		} else if (sectionLeft) {
			sectionLeft.appendChild(panel);
		}
		heading.focus();
	},
	enhanceNotes: function() {
		var MOD = this;
		var notes = document.querySelectorAll('#notes .note');
		for (var i = 0; i < notes.length; i++) {
			var note = notes[i];
			if (note.dataset.a11yNoteEnhanced) continue;
			note.dataset.a11yNoteEnhanced = 'true';
			// Build an accessible label from the note's title and description
			var h3 = note.querySelector('h3');
			var h5 = note.querySelector('h5');
			var title = h3 ? MOD.stripHtml(h3.innerHTML) : '';
			var desc = h5 ? MOD.stripHtml(h5.innerHTML) : '';
			var label = title;
			if (desc) label += ', ' + desc;
			note.setAttribute('aria-label', label);
			note.setAttribute('tabindex', '0');
			// Make the close button inside this note accessible
			var closeBtn = note.querySelector('.close');
			if (closeBtn) {
				closeBtn.setAttribute('role', 'button');
				closeBtn.setAttribute('tabindex', '0');
				closeBtn.setAttribute('aria-label', 'Dismiss');
				if (!closeBtn.dataset.a11yEnhanced) {
					closeBtn.dataset.a11yEnhanced = '1';
					closeBtn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
					});
				}
			}
		}
	},
	enhanceToggleBoxContent: function() {
		var MOD = this;
		var toggleBox = l('toggleBox');
		if (!toggleBox || toggleBox.style.display === 'none') return;
		// Jukebox controls
		var playBtn = l('jukeboxMusicPlay');
		if (playBtn && !playBtn.dataset.a11yEnhanced) {
			playBtn.setAttribute('role', 'button');
			playBtn.setAttribute('tabindex', '0');
			playBtn.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
			});
			playBtn.dataset.a11yEnhanced = 'true';
		}
		var loopBtn = l('jukeboxMusicLoop');
		if (loopBtn && !loopBtn.dataset.a11yEnhanced) {
			loopBtn.setAttribute('role', 'button');
			loopBtn.setAttribute('tabindex', '0');
			loopBtn.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
			});
			loopBtn.dataset.a11yEnhanced = 'true';
		}
		var autoBtn = l('jukeboxMusicAuto');
		if (autoBtn && !autoBtn.dataset.a11yEnhanced) {
			autoBtn.setAttribute('role', 'button');
			autoBtn.setAttribute('tabindex', '0');
			autoBtn.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
			});
			autoBtn.dataset.a11yEnhanced = 'true';
		}
		// Update dynamic labels for jukebox state
		if (playBtn) {
			var playText = playBtn.textContent || '';
			MOD.setAttributeIfChanged(playBtn, 'aria-label', playText === 'Pause' || playText === loc('Pause') ? 'Pause' : 'Play');
		}
		if (loopBtn) {
			var loopOn = !loopBtn.classList.contains('off');
			MOD.setAttributeIfChanged(loopBtn, 'aria-label', 'Loop: ' + (loopOn ? 'on' : 'off'));
		}
		if (autoBtn) {
			var autoOn = !autoBtn.classList.contains('off');
			MOD.setAttributeIfChanged(autoBtn, 'aria-label', 'Auto: ' + (autoOn ? 'on' : 'off'));
		}
		// Seek slider
		var scrub = l('jukeboxMusicScrub');
		if (scrub) {
			MOD.setAttributeIfChanged(scrub, 'aria-label', 'Seek position');
		}
	},
	updateSeasonLabel: function() {
		var seasonBox = l('seasonBox');
		if (!seasonBox) return;
		if (!Game.Has('Season switcher')) return;
		var seasonName = 'No active season';
		if (Game.season && Game.seasons && Game.seasons[Game.season]) {
			seasonName = Game.seasons[Game.season].name || Game.season;
		}
		seasonBox.setAttribute('aria-label', 'Season selector. Current: ' + seasonName + '. Click to change or start a season.');
	},
	updateSoundLabel: function() {
		var MOD = this;
		var soundUpg = Game.Upgrades['Golden cookie sound selector'];
		if (!soundUpg || !soundUpg.unlocked) return;
		var soundCrate = MOD.findSelectorCrate('Golden cookie sound selector');
		if (soundCrate) {
			var chimeName = 'No sound';
			if (Game.chimeType !== undefined && Game.chimeType > 0) {
				var choices = soundUpg.choicesFunction();
				if (choices && choices[Game.chimeType]) {
					chimeName = choices[Game.chimeType].name || 'Sound ' + Game.chimeType;
				}
			}
			soundCrate.setAttribute('aria-label', 'Golden cookie sound selector. Current: ' + chimeName + '. Click to open selector.');
		}
	},
	setupSoundSelectorOverride: function() {
		var MOD = this;
		var soundUpg = Game.Upgrades['Golden cookie sound selector'];
		if (!soundUpg) return;
		var origBuy = Game.Upgrade.prototype.buy;
		soundUpg.buy = function(bypass) {
			var wasOpen = (Game.choiceSelectorOn === soundUpg.id);
			var panelExists = !!l('a11ySoundSelectorPanel');
			if (wasOpen || panelExists) {
				origBuy.call(this, bypass);
				var panel = l('a11ySoundSelectorPanel');
				if (panel) panel.remove();
			} else {
				origBuy.call(this, bypass);
				var toggleBox = l('toggleBox');
				if (toggleBox && toggleBox.style.display === 'block') {
					toggleBox.style.display = 'none';
					toggleBox.innerHTML = '';
					MOD.createSoundSelectorPanel(soundUpg);
				}
			}
		};
	},
	createSoundSelectorPanel: function(upgrade) {
		var MOD = this;
		var oldPanel = l('a11ySoundSelectorPanel');
		if (oldPanel) oldPanel.remove();
		var choices = upgrade.choicesFunction();
		if (!choices || !choices.length) return;
		var selectedId = Game.chimeType || 0;
		// Create panel
		var panel = document.createElement('div');
		panel.id = 'a11ySoundSelectorPanel';
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #c90;padding:10px;margin:10px 0;';
		// Heading
		var heading = document.createElement('h3');
		heading.style.cssText = 'color:#fc0;margin:0 0 10px 0;font-size:14px;';
		heading.textContent = 'Golden cookie sound selector';
		heading.setAttribute('tabindex', '-1');
		panel.appendChild(heading);
		// Close button
		var closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.textContent = 'Close';
		closeBtn.setAttribute('aria-label', 'Close sound selector');
		closeBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:5px 0;background:#633;border:1px solid #a66;color:#fff;cursor:pointer;';
		closeBtn.addEventListener('click', function() {
			panel.remove();
			Game.choiceSelectorOn = -1;
			PlaySound('snd/tickOff.mp3');
		});
		panel.appendChild(closeBtn);
		// Escape key to close
		panel.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				panel.remove();
				Game.choiceSelectorOn = -1;
				PlaySound('snd/tickOff.mp3');
			}
		});
		// Sound choice buttons
		for (var i = 0; i < choices.length; i++) {
			if (!choices[i]) continue;
			var choice = choices[i];
			var isSelected = (i == selectedId);
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.textContent = choice.name;
			btn.dataset.soundId = i;
			btn.dataset.soundName = choice.name;
			btn.setAttribute('aria-label', choice.name + (isSelected ? ', currently selected' : ''));
			btn.style.cssText = 'display:block;width:100%;padding:8px;margin:2px 0;background:' +
				(isSelected ? '#363' : '#336') + ';border:1px solid ' +
				(isSelected ? '#6a6' : '#66a') + ';color:#fff;cursor:pointer;font-size:13px;';
			(function(choiceId, choiceName) {
				btn.addEventListener('click', function() {
					upgrade.choicesPick(choiceId);
					MOD.announce('Golden cookie sound changed to ' + choiceName);
					panel.querySelectorAll('button[data-sound-id]').forEach(function(b) {
						var bId = parseInt(b.dataset.soundId);
						var bSel = (bId === choiceId);
						b.setAttribute('aria-label', b.dataset.soundName + (bSel ? ', currently selected' : ''));
						b.style.background = bSel ? '#363' : '#336';
						b.style.borderColor = bSel ? '#6a6' : '#66a';
					});
					MOD.updateSoundLabel();
				});
			})(i, choice.name);
			panel.appendChild(btn);
		}
		// Insert into sectionLeft
		var sectionLeft = l('sectionLeft');
		var sectionLeftExtra = l('sectionLeftExtra');
		if (sectionLeft && sectionLeftExtra) {
			sectionLeft.insertBefore(panel, sectionLeftExtra);
		} else if (sectionLeft) {
			sectionLeft.appendChild(panel);
		}
		heading.focus();
	},
	startBuffTimer: function() {
		// Removed duplicate buff region - using only the H2 Active Buffs panel
	},
	updateQoLLabels: function() {
		this.updateMilkLabel();
		this.updateBackgroundLabel();
		this.updateSeasonLabel();
		this.updateSoundLabel();
		// Re-check selector visibility/unlock state
		this.enhanceQoLSelectors();
	},

	// ============================================
	// MODULE: Game Stats Panel (end of sectionLeft)
	// ============================================
	createGameStatsPanel: function() {
		var MOD = this;
		var oldPanel = l('a11yGameStatsPanel');
		if (oldPanel) oldPanel.remove();
		var sectionLeft = l('sectionLeft');
		if (!sectionLeft) return;
		var panel = document.createElement('div');
		panel.id = 'a11yGameStatsPanel';
		panel.setAttribute('aria-label', 'Game Stats. Press Escape to close.');
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #6a6;padding:10px;margin:10px 0;position:relative;z-index:50;';
		// Collapsible heading — starts collapsed
		var heading = document.createElement('h2');
		heading.id = 'a11yGameStatsHeading';
		heading.textContent = 'Game Stats (' + (Game.AchievementsOwned || 0) + ' achievements)';
		heading.setAttribute('role', 'button');
		heading.setAttribute('tabindex', '0');
		heading.setAttribute('aria-expanded', 'false');
		heading.style.cssText = 'color:#afa;margin:0;font-size:16px;cursor:pointer;';
		var content = document.createElement('div');
		content.id = 'a11yGameStatsContent';
		content.style.cssText = 'color:#fff;font-size:14px;margin-top:10px;';
		content.style.display = 'none';
		var collapsePanel = function() {
			heading.setAttribute('aria-expanded', 'false');
			content.style.display = 'none';
			heading.style.margin = '0';
		};
		var expandPanel = function() {
			heading.setAttribute('aria-expanded', 'true');
			content.style.display = '';
			heading.style.margin = '0 0 10px 0';
		};
		var toggle = function() {
			if (heading.getAttribute('aria-expanded') === 'true') collapsePanel();
			else expandPanel();
		};
		heading.addEventListener('click', toggle);
		heading.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
		});
		// Escape key handler to collapse from anywhere in the panel
		panel.addEventListener('keydown', function(e) {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				collapsePanel();
				heading.focus();
			}
		});
		// Stat lines
		var stats = [
			{ id: 'a11yStatCps', text: 'Cookies per second: Loading...' },
			{ id: 'a11yStatCpc', text: 'Cookies per click: Loading...' },
			{ id: 'a11yStatBank', text: 'Cookies in bank: Loading...' },
			{ id: 'a11yStatBuildings', text: 'Buildings owned: Loading...' },
			{ id: 'a11yStatHeralds', text: 'Heralds: Loading...' },
			{ id: 'a11yStatPrestige', text: 'Prestige: Loading...' }
		];
		for (var i = 0; i < stats.length; i++) {
			var line = document.createElement('div');
			line.id = stats[i].id;
			line.setAttribute('tabindex', '0');
			line.textContent = stats[i].text;
			line.style.cssText = 'padding:2px 0;';
			content.appendChild(line);
		}
		panel.appendChild(heading);
		panel.appendChild(content);
		// Insert before the dragon/santa buttons so they stay grouped with big cookie/milk.
		var firstSpecialBtn = sectionLeft.querySelector('[data-special-tab]');
		if (firstSpecialBtn) {
			sectionLeft.insertBefore(panel, firstSpecialBtn);
		} else {
			sectionLeft.appendChild(panel);
		}
		MOD.updateGameStatsPanel();
	},
	updateGameStatsPanel: function() {
		var MOD = this;
		// Update achievement count in heading
		var heading = l('a11yGameStatsHeading');
		if (heading) {
			MOD.setTextIfChanged(heading, 'Game Stats (' + (Game.AchievementsOwned || 0) + ' achievements)');
		}
		var cpsEl = l('a11yStatCps');
		var cpcEl = l('a11yStatCpc');
		var bankEl = l('a11yStatBank');
		var bldEl = l('a11yStatBuildings');
		var heraldEl = l('a11yStatHeralds');
		if (!cpsEl) return;
		var cps = Game.cookiesPs || 0;
		MOD.setTextIfChanged(cpsEl, 'Cookies per second: ' + Beautify(cps, 1));
		var cpc = 0;
		try { cpc = Game.computedMouseCps || Game.mouseCps() || 0; } catch(e) {}
		MOD.setTextIfChanged(cpcEl, 'Cookies per click: ' + Beautify(cpc, 1));
		MOD.setTextIfChanged(bankEl, 'Cookies in bank: ' + Beautify(Game.cookies));
		MOD.setTextIfChanged(bldEl, 'Buildings owned: ' + Beautify(Game.BuildingsOwned));
		if (heraldEl) {
			var heralds = Math.floor(Game.heralds || 0);
			var heraldText;
			if (heralds > 0 && Game.Has('Heralds') && Game.ascensionMode !== 1) {
				heraldText = 'Heralds: ' + heralds + ', +' + heralds + '% cookies per second';
			} else if (heralds > 0 && !Game.Has('Heralds')) {
				heraldText = 'Heralds: ' + heralds + ', not active';
			} else if (heralds > 0 && Game.ascensionMode === 1) {
				heraldText = 'Heralds: ' + heralds + ', not active during Born Again';
			} else {
				heraldText = 'Heralds: none currently active';
			}
			MOD.setTextIfChanged(heraldEl, heraldText);
		}
		// Prestige details and run duration
		var prestigeEl = l('a11yStatPrestige');
		if (prestigeEl) {
			var prestigeText = '';
			// Run duration
			var runDate = new Date();
			runDate.setTime(Date.now() - Game.startDate);
			var runStr = Game.sayTime(runDate.getTime() / 1000 * Game.fps, -1);
			prestigeText = 'Run duration: ' + (runStr === '' ? 'just started' : runStr) + '. ';
			var currentPrestige = Game.prestige || 0;
			if (currentPrestige > 0) {
				prestigeText += 'Prestige level: ' + Beautify(currentPrestige) + ' (+' + Beautify(currentPrestige) + '% CpS)';
			} else {
				prestigeText += 'Prestige level: 0';
			}
			// Cookies needed for next prestige level (ascend gains already shown on Legacy button)
			var chipsOwned = Game.HowMuchPrestige(Game.cookiesReset);
			var ascendNowToOwn = Math.floor(Game.HowMuchPrestige(Game.cookiesReset + Game.cookiesEarned));
			var cookiesToNext = Game.HowManyCookiesReset(ascendNowToOwn + 1) - (Game.cookiesEarned + Game.cookiesReset);
			if (cookiesToNext >= 0) {
				prestigeText += ', ' + Beautify(cookiesToNext) + ' cookies to next prestige level';
			}
			MOD.setTextIfChanged(prestigeEl, prestigeText);
		}
	},

	// ============================================
	// MODULE: Active Buffs Panel (visible, with H2)
	// ============================================
	createActiveBuffsPanel: function() {
		var MOD = this;
		var oldPanel = l('a11yActiveBuffsPanel');
		if (oldPanel) oldPanel.remove();
		var panel = document.createElement('div');
		panel.id = 'a11yActiveBuffsPanel';
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #66a;padding:10px;margin:10px 0;';
		var featuresHeading = document.createElement('h2');
		featuresHeading.id = 'a11yFeaturesHeading';
		featuresHeading.textContent = 'Status and Effects';
		featuresHeading.style.cssText = 'color:#aaf;margin:0 0 10px 0;font-size:16px;';
		panel.appendChild(featuresHeading);
		var featuresList = document.createElement('div');
		featuresList.id = 'a11yFeaturesList';
		featuresList.style.cssText = 'color:#fff;font-size:14px;';
		// Initial placeholder — updateFeaturesPanel will manage children from here
		var noEffects = document.createElement('div');
		noEffects.id = 'a11yFeature-none';
		noEffects.setAttribute('tabindex', '0');
		noEffects.textContent = 'No active status effects';
		featuresList.appendChild(noEffects);
		panel.appendChild(featuresList);
		// Insert after wrinklers panel at end of document.body for flat navigation
		var wrinklerPanel = l('wrinklerOverlayContainer');
		if (wrinklerPanel && wrinklerPanel.nextSibling) {
			document.body.insertBefore(panel, wrinklerPanel.nextSibling);
		} else {
			var shimmerPanel = l('a11yShimmerContainer');
			if (shimmerPanel) {
				document.body.insertBefore(panel, shimmerPanel);
			} else {
				var srAnnouncer = l('srAnnouncer');
				if (srAnnouncer) {
					document.body.insertBefore(panel, srAnnouncer);
				} else {
					document.body.appendChild(panel);
				}
			}
		}
	},
	updateFeaturesPanel: function() {
		var MOD = this;
		var featuresList = l('a11yFeaturesList');
		if (!featuresList) return;
		// Build keyed items: [{key, text}] — keys are stable identifiers, text is plain text
		var items = [];
		// Dragon level
		if (Game.dragonLevel > 0) {
			items.push({key: 'dragon', text: 'Krumblor level: ' + Game.dragonLevel + ' of 27'});
		}
		// Dragon Aura 1
		if (Game.dragonLevel >= 5 && Game.dragonAura > 0 && Game.dragonAuras[Game.dragonAura]) {
			var aura = Game.dragonAuras[Game.dragonAura];
			var auraDesc = aura.desc ? MOD.stripHtml(aura.desc) : '';
			items.push({key: 'aura1', text: 'Dragon Aura 1: ' + (aura.dname || aura.name) + (auraDesc ? ', ' + auraDesc : '')});
		}
		// Dragon Aura 2
		if (Game.dragonLevel >= 27 && Game.dragonAura2 > 0 && Game.dragonAuras[Game.dragonAura2]) {
			var aura2 = Game.dragonAuras[Game.dragonAura2];
			var aura2Desc = aura2.desc ? MOD.stripHtml(aura2.desc) : '';
			items.push({key: 'aura2', text: 'Dragon Aura 2: ' + (aura2.dname || aura2.name) + (aura2Desc ? ', ' + aura2Desc : '')});
		}
		// Santa level
		if (Game.santaLevel > 0) {
			items.push({key: 'santa', text: 'Santa level: ' + Game.santaLevel + ' of 14'});
		}
		// Active season
		if (Game.season !== '' && Game.seasons[Game.season]) {
			items.push({key: 'season', text: 'Season: ' + Game.seasons[Game.season].name});
		}
		// Grandmapocalypse
		if (Game.elderWrath > 0) {
			var stages = {1: 'Awoken (stage 1)', 2: 'Displeased (stage 2)', 3: 'Angered (stage 3)'};
			items.push({key: 'grandma', text: 'Grandmapocalypse: ' + (stages[Game.elderWrath] || 'stage ' + Game.elderWrath)});
		}
		// Elder Pledge
		if (Game.pledgeT > 0) {
			var pledgeRemaining = Math.ceil(Game.pledgeT / Game.fps);
			items.push({key: 'pledge', text: 'Elder Pledge: active, ' + pledgeRemaining + 's remaining'});
		}
		// Elder Covenant
		if (Game.Has('Elder Covenant')) {
			items.push({key: 'covenant', text: 'Elder Covenant: active (CpS reduced 5%)'});
		}
		// Golden Switch
		if (Game.Has('Golden switch [off]')) {
			items.push({key: 'goldenswitch', text: 'Golden Switch: ON (+50% CpS, no golden cookies)'});
		}
		// Shimmering Veil
		if (Game.Has('Shimmering veil [off]')) {
			items.push({key: 'veil', text: 'Shimmering Veil: ON (+50% CpS)'});
		}
		// Active buffs (timed effects like Frenzy, Click Frenzy, etc.)
		if (Game.buffs) {
			for (var name in Game.buffs) {
				var b = Game.buffs[name];
				if (b && b.time > 0) {
					var remaining = Math.ceil(b.time / Game.fps);
					var desc = b.desc ? MOD.stripHtml(b.desc) : '';
					// Strip the "for X minutes/seconds!" duration from desc since we show accurate remaining time
					desc = desc.replace(/\s*for\s+[^!]*!\s*$/i, '').replace(/\s*for\s+[^.]*\.\s*$/i, '');
					var buffText = name + ': ' + remaining + 's remaining';
					if (desc) buffText += ', ' + desc;
					items.push({key: 'buff-' + name, text: buffText});
				}
			}
		}
		// Update each item's element — create if missing, update text, show/hide.
		// Never remove or reorder elements to avoid disrupting screen reader focus.
		var activeKeys = {};
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			activeKeys[item.key] = true;
			var elId = 'a11yFeature-' + item.key;
			var el = l(elId);
			if (!el) {
				el = document.createElement('div');
				el.id = elId;
				el.setAttribute('tabindex', '0');
				el.style.cssText = 'padding:4px 0;border-bottom:1px solid #444;';
				featuresList.appendChild(el);
			}
			MOD.setTextIfChanged(el, item.text);
			if (el.style.display === 'none') el.style.display = '';
			if (el.getAttribute('tabindex') === '-1') MOD.setAttributeIfChanged(el, 'tabindex', '0');
		}
		// Hide (don't remove) elements for inactive items
		var children = featuresList.children;
		for (var i = 0; i < children.length; i++) {
			var child = children[i];
			var childKey = child.id ? child.id.replace('a11yFeature-', '') : '';
			if (childKey && childKey !== 'none' && !activeKeys[childKey]) {
				if (child.style.display !== 'none') child.style.display = 'none';
				if (child.getAttribute('tabindex') !== '-1') MOD.setAttributeIfChanged(child, 'tabindex', '-1');
			}
		}
		// Show/hide the "no effects" placeholder
		var noEffectsEl = l('a11yFeature-none');
		if (noEffectsEl) {
			var shouldShow = items.length === 0;
			if (shouldShow && noEffectsEl.style.display === 'none') { noEffectsEl.style.display = ''; MOD.setAttributeIfChanged(noEffectsEl, 'tabindex', '0'); }
			else if (!shouldShow && noEffectsEl.style.display !== 'none') { noEffectsEl.style.display = 'none'; MOD.setAttributeIfChanged(noEffectsEl, 'tabindex', '-1'); }
		}
	},

	// ============================================
	// MODULE: Building Filter (match game behavior)
	// ============================================
	filterUnownedBuildings: function() {
		var MOD = this;
		var numBuildings = Game.ObjectsN || 0;

		// Find the highest OWNED building index (not just unlocked)
		var highestOwned = -1;
		for (var i = 0; i < numBuildings; i++) {
			var bld = Game.ObjectsById[i];
			if (bld && bld.amount > 0) {
				highestOwned = i;
			}
		}
		MOD.highestOwnedBuildingId = highestOwned;

		// Show: owned buildings + next 1 to work toward + 1 mystery
		for (var i = 0; i < numBuildings; i++) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			var productEl = l('product' + bld.id);
			if (!productEl) continue;

			// Find the info text for this building
			var infoBtn = l('a11y-building-info-' + bld.id);
			var levelLabel = l('a11yBuildingLevel' + bld.id);

			if (bld.amount > 0) {
				// Owned building - show with full info
				productEl.style.display = '';
				productEl.removeAttribute('aria-hidden');
				if (infoBtn) {
					infoBtn.style.display = '';
					infoBtn.removeAttribute('aria-hidden');
				}
				if (levelLabel) {
					levelLabel.style.display = '';
					levelLabel.removeAttribute('aria-hidden');
				}
			} else if (!bld.locked) {
				// Unlocked but not owned
				var distanceFromOwned = i - highestOwned;

				if (distanceFromOwned <= 1) {
					// Next building to work toward - show with full info
					productEl.style.display = '';
					productEl.removeAttribute('aria-hidden');
					if (infoBtn) {
						infoBtn.style.display = '';
						infoBtn.removeAttribute('aria-hidden');
					}
					if (levelLabel) {
						levelLabel.style.display = '';
						levelLabel.removeAttribute('aria-hidden');
					}
				} else if (distanceFromOwned <= 2) {
					// Show as mystery building (just cost)
					productEl.style.display = '';
					productEl.removeAttribute('aria-hidden');
					var cost = Beautify(bld.price);
					var mysteryLabel = 'Mystery building. Cost: ' + cost + ' cookies';
					var timeUntil = MOD.getTimeUntilAfford(bld.price);
					if (timeUntil) mysteryLabel += '. Time until affordable: ' + timeUntil;
					MOD.setAttributeIfChanged(productEl, 'aria-label', mysteryLabel);
					if (infoBtn) {
						infoBtn.style.display = 'none';
						MOD.setAttributeIfChanged(infoBtn, 'aria-hidden', 'true');
					}
					if (levelLabel) {
						levelLabel.style.display = 'none';
						MOD.setAttributeIfChanged(levelLabel, 'aria-hidden', 'true');
					}
				} else {
					// Too far ahead - hide completely
					productEl.style.display = 'none';
					MOD.setAttributeIfChanged(productEl, 'aria-hidden', 'true');
					if (infoBtn) {
						infoBtn.style.display = 'none';
						MOD.setAttributeIfChanged(infoBtn, 'aria-hidden', 'true');
					}
					if (levelLabel) {
						levelLabel.style.display = 'none';
						MOD.setAttributeIfChanged(levelLabel, 'aria-hidden', 'true');
					}
				}
			} else {
				// Locked building - hide completely
				productEl.style.display = 'none';
				MOD.setAttributeIfChanged(productEl, 'aria-hidden', 'true');
				if (infoBtn) {
					infoBtn.style.display = 'none';
					MOD.setAttributeIfChanged(infoBtn, 'aria-hidden', 'true');
				}
				if (levelLabel) {
					levelLabel.style.display = 'none';
					MOD.setAttributeIfChanged(levelLabel, 'aria-hidden', 'true');
				}
			}
		}
	},

	// ============================================
	// MODULE: Shimmer Announcements (buttons removed)
	// ============================================
	// Shimmer buttons and timer display removed in v8.
	// Live announcements for shimmer appearing/fading are handled by trackShimmerAnnouncements().

	// ============================================
	// MODULE: Building Levels (Sugar Lump)
	// ============================================
	labelBuildingLevels: function() {
		// Level/upgrade-cost/sugar-lump info is already on building row buttons above the store.
		// Remove any previously created level label elements to avoid duplication.
		var numBuildings = Game.ObjectsN || 0;
		for (var i = 0; i < numBuildings; i++) {
			var el = l('a11yBuildingLevel' + i);
			if (el) el.remove();
		}
	},

	// ============================================
	// MODULE: Statistics Enhancement
	// ============================================
	enhanceAchievementDetails: function() {
		// No longer needed - handled via enhanceStatsMenu
	},
	getAchievementCondition: function(ach) {
		if (!ach) return '';
		var name = ach.name.toLowerCase();
		// Cookie production achievements
		if (ach.desc && ach.desc.includes('cookies')) {
			var match = ach.desc.match(/(\d[\d,\.]*)\s*(cookie|CpS)/i);
			if (match) return 'Reach ' + match[0];
		}
		// Building achievements
		for (var bldName in Game.Objects) {
			if (name.includes(bldName.toLowerCase())) {
				return 'Related to ' + bldName + ' buildings';
			}
		}
		// Prestige achievements
		if (name.includes('prestige') || name.includes('legacy') || name.includes('ascen')) {
			return 'Prestige/Ascension related';
		}
		return '';
	},

	// ============================================
	// MODULE: Main Interface (Level Display + CPS)
	// ============================================
	getMilkInfo: function() {
		var milkProgress = Game.milkProgress || 0;
		var milkPercent = Math.floor(milkProgress * 100);
		var milkRank = Math.floor(milkProgress);
		var achievementsOwned = Game.AchievementsOwned || 0;
		var achievementsToNext = (milkRank + 1) * 25 - achievementsOwned;
		var maxRank = Game.Milks ? Game.Milks.length : 35;

		// Get current milk name from Game.Milks array
		var milkName = 'Plain milk';
		if (Game.Milks && Game.Milks[milkRank]) {
			milkName = Game.Milks[milkRank].name || milkName;
		}

		// Use game's romanize function for rank display
		var romanRank = typeof romanize === 'function' ? romanize(milkRank + 1) : (milkRank + 1);

		// Get kitten multiplier (same as shown in stats screen)
		var kittenMult = Game.cookiesMultByType && Game.cookiesMultByType['kittens'] ? Game.cookiesMultByType['kittens'] : 0;

		return {
			percent: milkPercent,
			rank: milkRank + 1,
			romanRank: romanRank,
			milkName: milkName,
			achievements: achievementsOwned,
			achievementsToNext: Math.max(0, achievementsToNext),
			maxRank: maxRank,
			kittenMult: kittenMult
		};
	},
	updateMilkDisplay: function() {
		var MOD = this;
		var milkDiv = l('a11yMilkDisplay');
		if (!milkDiv) return;

		var info = this.getMilkInfo();

		// All info in text content so NVDA reads it in browse mode
		var text = 'Milk: ' + info.milkName + ', rank ' + info.rank + ' of ' + info.maxRank;
		if (info.achievementsToNext > 0 && info.rank < info.maxRank) {
			text += ', ' + info.achievementsToNext + ' achievements until next rank';
		} else if (info.rank >= info.maxRank) {
			text += ', all milk flavors unlocked';
		}
		text += '. ' + info.achievements + ' total achievements. ';
		if (info.kittenMult > 1) {
			text += 'Kitten multiplier: ' + Beautify(info.kittenMult * 100) + '%.';
		}

		MOD.setTextIfChanged(milkDiv, text);
		milkDiv.removeAttribute('aria-label');
	},
	createMainInterfaceEnhancements: function() {
		var MOD = this;
		var bigCookie = l('bigCookie');
		if (!bigCookie) return;
		var sectionLeft = l('sectionLeft');
		if (!sectionLeft) return;
		var sectionLeftExtra = l('sectionLeftExtra');
		// Insert all elements as direct children of sectionLeft (before sectionLeftExtra)
		// to avoid absolute-positioned parent containers that break tab order.
		var insertPoint = sectionLeftExtra || null;
		// Create Cookies per Click display
		var oldCpc = l('a11yCpcDisplay');
		if (oldCpc) oldCpc.remove();
		var cpcDiv = document.createElement('div');
		cpcDiv.id = 'a11yCpcDisplay';
		cpcDiv.setAttribute('tabindex', '0');
		cpcDiv.textContent = 'Cookies per click: Loading...';
		cpcDiv.style.cssText = 'background:#1a1a1a;color:#fff;padding:8px;margin:5px;text-align:center;border:1px solid #444;font-size:12px;position:relative;z-index:50;';
		sectionLeft.insertBefore(cpcDiv, insertPoint);
		// Create Milk progress display
		var oldMilk = l('a11yMilkDisplay');
		if (oldMilk) oldMilk.remove();
		var milkDiv = document.createElement('div');
		milkDiv.id = 'a11yMilkDisplay';
		milkDiv.setAttribute('tabindex', '0');
		milkDiv.textContent = 'Milk: Loading...';
		milkDiv.style.cssText = 'background:#1a1a1a;color:#fff;padding:8px;margin:5px;text-align:center;border:1px solid #444;font-size:12px;position:relative;z-index:50;';
		sectionLeft.insertBefore(milkDiv, insertPoint);
		// Clean up old milk selector button from prior versions
		var oldMilkBtn = l('a11yMilkSelectorButton');
		if (oldMilkBtn) oldMilkBtn.remove();
		// Label mystery elements in the left column
		MOD.labelMysteryElements();
	},
	labelMysteryElements: function() {
		var MOD = this;
		// Label building rows in the left section (these have level buttons)
		MOD.labelBuildingRows();
		// Remove the cookies counter from tab order — Game Stats panel provides this info
		var cookiesDiv = l('cookies');
		if (cookiesDiv) {
			cookiesDiv.removeAttribute('tabindex');
			cookiesDiv.removeAttribute('aria-label');
		}
		// The golden cookie season popup area
		var seasonPopup = l('seasonPopup');
		if (seasonPopup) {
			seasonPopup.setAttribute('aria-label', 'Season special popup area');
		}
		// Label the left column sections
		var leftColumn = l('sectionLeft');
		if (leftColumn) {
			// Find all direct children divs and label them
			var children = leftColumn.children;
			for (var i = 0; i < children.length; i++) {
				var child = children[i];
				var id = child.id || '';
				if (id === 'cookies') {
					// Already handled
				} else if (id === 'bakeryName') {
					child.setAttribute('aria-label', 'Bakery name: ' + (child.textContent || ''));
					MOD.setAttributeIfChanged(child, 'tabindex', '0');
				} else if (id === 'bakeryNameInput') {
					// Text input for bakery name
				} else if (id === 'bigCookie') {
					// Already handled elsewhere
				} else if (id === 'cookieNumbers') {
					// This is for floating number animations - hide from screen readers
					child.setAttribute('aria-hidden', 'true');
				} else if (id === 'milkLayer' || id === 'milk') {
					child.setAttribute('aria-hidden', 'true'); // Visual only
				}
			}
		}
		// Find and label the percentage/progress number (often shows milk %)
		var milkProgress = l('milk');
		if (milkProgress) {
			milkProgress.setAttribute('aria-hidden', 'true');
		}
		// Hide FPS and undefined elements from screen readers
		if (leftColumn) {
			leftColumn.querySelectorAll('div, span').forEach(function(el) {
				if (el.id === 'cookies' || el.id === 'bigCookie' || el.id === 'cookieNumbers' || el.id === 'milkLayer' || el.id === 'milk' || el.id === 'lumps') return;
				var text = (el.textContent || '').trim();
				// Hide elements containing "undefined" or just a number (likely FPS)
				if (text.toLowerCase().includes('undefined') || /^\d+$/.test(text)) {
					el.setAttribute('aria-hidden', 'true');
					MOD.setAttributeIfChanged(el, 'tabindex', '-1');
				}
			});
		}
		// Also hide any standalone 2-3 digit numbers anywhere in the game area (FPS display)
		document.querySelectorAll('#game div, #game span').forEach(function(el) {
			if (el.children.length > 0) return; // Only leaf nodes
			if (el.id === 'lumps' || el.closest('#lumps')) return; // Don't hide sugar lump elements
			var text = (el.textContent || '').trim();
			if (/^\d{2,3}$/.test(text)) {
				el.setAttribute('aria-hidden', 'true');
				MOD.setAttributeIfChanged(el, 'tabindex', '-1');
			}
		});
		// Label menu buttons area
		var menuButtons = document.querySelectorAll('#prefsButton, #statsButton, #logButton');
		menuButtons.forEach(function(btn) {
			MOD.setAttributeIfChanged(btn, 'tabindex', '0');
		});
		// Update Milk display
		MOD.updateMilkDisplay();
		// Find any unlabeled number displays
		MOD.findAndLabelUnknownDisplays();
	},
	labelCookieNumbers: function(el) {
		if (!el) return;
		// This area often shows the milk percentage
		var text = el.textContent || el.innerText || '';
		if (text) {
			var milkPct = Game.milkProgress ? Math.floor(Game.milkProgress * 100) : 0;
			el.setAttribute('aria-label', 'Milk progress: ' + milkPct + '% (based on achievements)');
		}
	},
	labelBuildingRows: function() {
		var MOD = this;
		// Minigame name mapping for buildings that have minigames
		var minigameNames = {
			'Farm': 'Garden',
			'Temple': 'Pantheon',
			'Wizard tower': 'Grimoire',
			'Bank': 'Stock Market'
		};
		// Create a visually-hidden Cursor row in #rows so the Cursor level-up button
		// appears alongside all other building level-up buttons.
		// The game places the Cursor's productLevel0 in #sectionLeftExtra (below the big cookie),
		// making it impossible for screen reader users to find when navigating building rows.
		var cursorBld = Game.ObjectsById[0];
		var rowsContainer = l('rows');
		if (cursorBld && rowsContainer && !l('a11yCursorRow')) {
			var cursorRow = document.createElement('div');
			cursorRow.id = 'a11yCursorRow';
			var cursorBtn = document.createElement('div');
			cursorBtn.id = 'a11yCursorLevelBtn';
			cursorBtn.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
			cursorBtn.setAttribute('role', 'button');
			cursorBtn.setAttribute('tabindex', '0');
			cursorBtn.onclick = function() { Game.ObjectsById[0].levelUp(); };
			cursorBtn.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					Game.ObjectsById[0].levelUp();
				}
			});
			cursorRow.appendChild(cursorBtn);
			rowsContainer.insertBefore(cursorRow, rowsContainer.firstChild);
		}
		// Update the Cursor level button label
		if (cursorBld) {
			var cursorLevelBtn = l('a11yCursorLevelBtn');
			if (cursorLevelBtn) {
				MOD.setAttributeIfChanged(cursorLevelBtn, 'aria-label', MOD.getBuildingLevelLabel(cursorBld));
			}
			// Hide the original productLevel0 in sectionLeftExtra from screen readers
			var origCursorLevel = l('productLevel0');
			if (origCursorLevel) {
				origCursorLevel.setAttribute('aria-hidden', 'true');
				MOD.setAttributeIfChanged(origCursorLevel, 'tabindex', '-1');
			}
			var origCursorMgBtn = l('productMinigameButton0');
			if (origCursorMgBtn) {
				origCursorMgBtn.setAttribute('aria-hidden', 'true');
				MOD.setAttributeIfChanged(origCursorMgBtn, 'tabindex', '-1');
			}
		}
		// Label building rows in the game area (left section)
		// These are the rows that show building sprites and have level/minigame buttons
		// Use Game.ObjectsN for proper iteration count
		var numBuildings = Game.ObjectsN || 0;
		for (var i = 0; i < numBuildings; i++) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			// The building row element
			var rowEl = l('row' + bld.id);
			if (rowEl) {
				// Get level - use parseInt to handle string values
				var level = parseInt(bld.level) || 0;
				var lumpCost = level + 1;
				// Check if this building has a minigame and if it's unlocked (level >= 1)
				var hasMinigame = minigameNames[bld.name] !== undefined;
				var minigameUnlocked = hasMinigame && level >= 1;
				var minigameName = minigameNames[bld.name] || '';
				// Also check if minigame object exists (for loaded state)
				if (bld.minigame && bld.minigame.name) {
					minigameName = bld.minigame.name;
					minigameUnlocked = true;
				}
				// Don't set aria-label on the row — it masks the buttons inside
				rowEl.removeAttribute('aria-label');
				// Find and label clickable elements within the row
				rowEl.querySelectorAll('div[onclick], .rowSpecial, .rowCanvas').forEach(function(el) {
					var onclick = el.getAttribute('onclick') || '';
					if (onclick.includes('levelUp') || onclick.includes('Level')) {
						MOD.setAttributeIfChanged(el, 'aria-label', MOD.getBuildingLevelLabel(bld));
						MOD.setAttributeIfChanged(el, 'role', 'button');
						MOD.setAttributeIfChanged(el, 'tabindex', '0');
					} else if (onclick.includes('minigame') || onclick.includes('Minigame')) {
						if (minigameUnlocked && minigameName) {
							// Check if minigame is currently open - multiple ways to detect
							var mgContainer = l('row' + bld.id + 'minigame');
							var isOpen = false;
							if (mgContainer) {
								isOpen = mgContainer.style.display !== 'none' &&
										 mgContainer.style.visibility !== 'hidden' &&
										 mgContainer.classList.contains('rowMinigame');
							}
							if (bld.onMinigame) isOpen = true;
							MOD.setAttributeIfChanged(el, 'aria-label', (isOpen ? 'Close ' : 'Open ') + minigameName);
						} else if (hasMinigame) {
							MOD.setAttributeIfChanged(el, 'aria-label', minigameName + ' (unlock at level 1)');
						} else {
							MOD.setAttributeIfChanged(el, 'aria-label', bld.name + ' (no minigame)');
						}
						MOD.setAttributeIfChanged(el, 'role', 'button');
						MOD.setAttributeIfChanged(el, 'tabindex', '0');
					} else if (onclick.includes('Mute')) {
						MOD.setAttributeIfChanged(el, 'aria-label', 'Mute ' + bld.name);
						MOD.setAttributeIfChanged(el, 'role', 'button');
						MOD.setAttributeIfChanged(el, 'tabindex', '0');
					}
				});
				// Also check for .level elements in the row
				var levelEl = rowEl.querySelector('.level, .objectLevel');
				if (levelEl) {
					MOD.setAttributeIfChanged(levelEl, 'aria-label', MOD.getBuildingLevelLabel(bld));
					MOD.setAttributeIfChanged(levelEl, 'role', 'button');
					MOD.setAttributeIfChanged(levelEl, 'tabindex', '0');
				}
			}
			// Also label the productLevel button in the right section (this is the main level upgrade button)
			var productLevelEl = l('productLevel' + bld.id);
			if (productLevelEl) {
				MOD.setAttributeIfChanged(productLevelEl, 'aria-label', MOD.getBuildingLevelLabel(bld));
				MOD.setAttributeIfChanged(productLevelEl, 'role', 'button');
				MOD.setAttributeIfChanged(productLevelEl, 'tabindex', '0');
			}
			// Also label the productMinigameButton in the right section (opens/closes minigame)
			var productMgBtn = l('productMinigameButton' + bld.id);
			if (productMgBtn) {
				if (minigameUnlocked && minigameName) {
					var isOpen = bld.onMinigame ? true : false;
					MOD.setAttributeIfChanged(productMgBtn, 'aria-label', (isOpen ? 'Close ' : 'Open ') + minigameName);
				} else if (hasMinigame) {
					MOD.setAttributeIfChanged(productMgBtn, 'aria-label', minigameName + ' (unlock at level 1)');
				}
				if (hasMinigame) {
					MOD.setAttributeIfChanged(productMgBtn, 'role', 'button');
					MOD.setAttributeIfChanged(productMgBtn, 'tabindex', '0');
				} else {
					productMgBtn.setAttribute('aria-hidden', 'true');
					MOD.setAttributeIfChanged(productMgBtn, 'tabindex', '-1');
				}
			}
		}
		// Also label any standalone level elements in the left section
		var sectionLeft = l('sectionLeft');
		if (sectionLeft) {
			sectionLeft.querySelectorAll('.level, [class*="level"], [onclick*="levelUp"]').forEach(function(el) {
				if (!el.getAttribute('aria-label')) {
					// Try to determine which building this belongs to
					var parent = el.closest('[id^="row"]');
					if (parent) {
						var rowId = parent.id.replace('row', '');
						var bld = Game.ObjectsById[rowId];
						if (bld) {
							MOD.setAttributeIfChanged(el, 'aria-label', MOD.getBuildingLevelLabel(bld));
							MOD.setAttributeIfChanged(el, 'role', 'button');
							MOD.setAttributeIfChanged(el, 'tabindex', '0');
						}
					}
				}
			});
		}
	},
	findAndLabelUnknownDisplays: function() {
		var MOD = this;
		// Hide FPS counter from screen readers
		var fpsEl = l('fps');
		if (fpsEl) {
			fpsEl.setAttribute('aria-hidden', 'true');
		}
		// Hide standalone numbers, "undefined" text, and fix bad labels across the page
		var sectionLeft = l('sectionLeft');
		var sectionMiddle = l('sectionMiddle');
		var sections = [sectionLeft, sectionMiddle];
		sections.forEach(function(section) {
			if (!section) return;
			section.querySelectorAll('div, span, button').forEach(function(el) {
				if (el.getAttribute('aria-hidden') === 'true') return;
				if (el.getAttribute('role') === 'button') return;
				if (el.id === 'lumps' || el.closest('#lumps')) return; // Don't hide sugar lump elements
				var text = (el.textContent || '').trim();
				var label = (el.getAttribute('aria-label') || '').toLowerCase();
				// Hide elements with just numbers (FPS) or containing "undefined"
				if (/^\d+$/.test(text) || text.toLowerCase().includes('undefined') || label.includes('undefined')) {
					el.setAttribute('aria-hidden', 'true');
				}
			});
		});
		// Hide numbers near menu buttons (likely FPS) and fix undefined labels
		var prefsButton = l('prefsButton');
		if (prefsButton) {
			var parent = prefsButton.parentNode;
			if (parent) {
				for (var i = 0; i < parent.children.length; i++) {
					var child = parent.children[i];
					if (child.id === 'prefsButton' || child.id === 'statsButton' || child.id === 'logButton') continue;
					if (child.id === 'lumps' || child.closest('#lumps')) continue; // Don't hide sugar lump elements
					var text = (child.textContent || '').trim();
					var label = (child.getAttribute('aria-label') || '').toLowerCase();
					// Hide standalone numbers and undefined text/labels
					if (/^\d+$/.test(text) || text.toLowerCase().includes('undefined') || label.includes('undefined')) {
						child.setAttribute('aria-hidden', 'true');
					}
				}
			}
		}
		// Also scan for any elements with "undefined" in aria-label anywhere on page
		document.querySelectorAll('[aria-label*="undefined"]').forEach(function(el) {
			if (el.id === 'lumps' || el.closest('#lumps')) return; // Don't hide sugar lump elements
			el.setAttribute('aria-hidden', 'true');
		});
	},
	updateMainInterfaceDisplays: function() {
		var MOD = this;
		// Update Cookies per Click display
		var cpcDiv = l('a11yCpcDisplay');
		if (cpcDiv) {
			var cpc = 0;
			try {
				cpc = Game.computedMouseCps || Game.mouseCps() || 0;
			} catch(e) {}
			var cpcText = 'Cookies per click: ' + Beautify(cpc, 1);
			MOD.setTextIfChanged(cpcDiv, cpcText);
			MOD.setAttributeIfChanged(cpcDiv, 'aria-label', cpcText);
		}
		// Update any mystery number labels
		MOD.findAndLabelUnknownDisplays();
	},

	// ============================================
	// Tech Upgrades Labels (research panel in main view)
	// ============================================
	labelStatsUpgrades: function() {
		// Tech upgrades in the store are handled by populateUpgradeLabel via enhanceUpgradeShop
	},
	labelStatsHeavenly: function() {
		var MOD = this;
		if (!Game.OnAscend) return;
		// Add heavenly chips display if not present
		MOD.addHeavenlyChipsDisplay();
		// Hide debug upgrades from the ascension screen
		document.querySelectorAll('.crate').forEach(function(crate) {
			var onclick = crate.getAttribute('onclick') || '';
			var match = onclick.match(/Game\.UpgradesById\[(\d+)\]/);
			if (!match) return;
			var upgradeId = parseInt(match[1]);
			var upgrade = Game.UpgradesById[upgradeId];
			if (!upgrade) return;
			if (upgrade.pool === 'debug') {
				crate.style.display = 'none';
			}
		});
	},
	addHeavenlyChipsDisplay: function() {
		var MOD = this;
		if (!Game.OnAscend) return;
		var displayId = 'a11yHeavenlyChipsDisplay';
		var existing = l(displayId);
		var chips = Beautify(Game.heavenlyChips);
		var text = 'Heavenly chips available: ' + chips;
		if (existing) {
			existing.textContent = text;
			existing.setAttribute('aria-label', text);
		} else {
			var display = document.createElement('div');
			display.id = displayId;
			display.style.cssText = 'position:fixed;top:10px;left:10px;background:#000;color:#fc0;padding:10px;border:2px solid #fc0;font-size:16px;z-index:10000;';
			display.setAttribute('tabindex', '0');
			display.setAttribute('role', 'status');
			display.setAttribute('aria-live', 'polite');
			display.setAttribute('aria-label', text);
			display.textContent = text;
			document.body.appendChild(display);
		}
	},

	save: function() { return ''; },
	load: function(s) {}
});
