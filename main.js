Game.registerMod("nvda accessibility", {
	init: function() {
		var MOD = this;
		this.createLiveRegion();
		this.createAssertiveLiveRegion();
			if (!Game.prefs.screenreader) { Game.prefs.screenreader = 1; }
		if (Game.volume !== undefined) { Game.volumeMusic = 0; }
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
		// Wrap Game.RebuildUpgrades to immediately re-label upgrades after DOM rebuild
		var origRebuildUpgrades = Game.RebuildUpgrades;
		Game.RebuildUpgrades = function() {
			origRebuildUpgrades.apply(this, arguments);
			setTimeout(function() { MOD.enhanceUpgradeShop(); }, 0);
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
		// Track which aura slot is being edited for inline picker
		MOD.editingAuraSlot = -1;
		MOD.selectedAuraForSlot = -1;
		MOD.initRetriesComplete = false;
		MOD.minigameInitDone = {};
		MOD.gardenBuildPanelWrapped = false;
		MOD.gardenBuildPlotWrapped = false;
		MOD.stockMarketWrapped = false;
		MOD.highestOwnedBuildingId = -1;
		setTimeout(function() {
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
			MOD.enhanceStatisticsScreen();
			MOD.enhanceQoLSelectors();
			MOD.setupMilkSelectorOverride();
			MOD.enhanceBuildingMinigames();
			MOD.startBuffTimer();
			// New modules
			MOD.createActiveBuffsPanel();
			MOD.createShimmerPanel();
			MOD.createMainInterfaceEnhancements();
			MOD.filterUnownedBuildings();
			MOD.labelBuildingLevels();
			// Initialize Statistics Module
			MOD.labelStatsUpgradesAndAchievements();
		}, 500);
		Game.registerHook('draw', function() {
			MOD.updateDynamicLabels();
		});
		// Hook into purchases to immediately refresh upgrade labels
		Game.registerHook('buy', function() {
			// Immediate refresh on purchase
			MOD.enhanceUpgradeShop();
			MOD.populateProductLabels();
			// Also refresh again shortly after in case store updates
			setTimeout(function() { MOD.enhanceUpgradeShop(); MOD.populateProductLabels(); }, 100);
			setTimeout(function() { MOD.enhanceUpgradeShop(); MOD.populateProductLabels(); }, 500);
		});
		// Also track store refresh flag
		MOD.lastStoreRefresh = Game.storeToRefresh;
		Game.registerHook('reset', function(hard) {
			MOD.minigameInitDone = {};
			MOD.gardenBuildPanelWrapped = false;
			MOD.gardenBuildPlotWrapped = false;
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
				MOD.filterUnownedBuildings();
				// Re-initialize Statistics Module after reset
				MOD.labelStatsUpgradesAndAchievements();
			}, 100);
		});
		Game.Notify('Accessibility Enhanced', 'Version 13', [10, 0], 6);
		this.announce('NVDA Accessibility mod version 13 loaded.');
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
					mgBtn.setAttribute('role', 'button');
					mgBtn.setAttribute('tabindex', '0');
				} else {
					mgBtn.setAttribute('aria-hidden', 'true');
					mgBtn.setAttribute('tabindex', '-1');
				}
			}
		}
		// Also label Special Tabs
		MOD.labelSpecialTabs();
	},
	labelSpecialTabs: function() {
		var MOD = this;
		// Special tabs (Dragon, Santa) are drawn on canvas with no HTML representation.
		// Create accessible HTML buttons overlaying the canvas area in sectionLeft.
		if (!Game.specialTabs || Game.specialTabs.length === 0) {
			// No special tabs available, remove any existing buttons
			var existing = l('a11ySpecialTabButtons');
			if (existing) existing.style.display = 'none';
			return;
		}
		// Create or find the container
		var container = l('a11ySpecialTabButtons');
		if (!container) {
			container = document.createElement('div');
			container.id = 'a11ySpecialTabButtons';
			container.style.cssText = 'position:absolute;left:0;bottom:24px;z-index:100;pointer-events:none;';
			var sectionLeft = l('sectionLeft');
			if (!sectionLeft) return;
			sectionLeft.appendChild(container);
		}
		container.style.display = '';
		// Build the set of tabs that should exist
		var tabNames = {};
		for (var i = 0; i < Game.specialTabs.length; i++) {
			tabNames[Game.specialTabs[i]] = true;
		}
		// Remove buttons for tabs that no longer exist
		var existingBtns = container.querySelectorAll('[data-special-tab]');
		for (var i = 0; i < existingBtns.length; i++) {
			if (!tabNames[existingBtns[i].dataset.specialTab]) {
				existingBtns[i].remove();
			}
		}
		// Create or update buttons for each tab
		for (var i = 0; i < Game.specialTabs.length; i++) {
			var tabName = Game.specialTabs[i];
			var btnId = 'a11ySpecialTab_' + tabName;
			var btn = l(btnId);
			if (!btn) {
				btn = document.createElement('div');
				btn.id = btnId;
				btn.dataset.specialTab = tabName;
				btn.setAttribute('role', 'button');
				btn.setAttribute('tabindex', '0');
				btn.style.cssText = 'width:48px;height:48px;pointer-events:auto;cursor:pointer;';
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
				btn.addEventListener('keydown', (function(name) {
					return function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							if (Game.specialTab === name) {
								Game.ToggleSpecialMenu(0);
							} else {
								Game.specialTab = name;
								Game.ToggleSpecialMenu(1);
							}
							PlaySound('snd/press.mp3');
						}
					};
				})(tabName));
				container.appendChild(btn);
			}
			// Update label - changes based on open/closed state
			var label = '';
			var isSelected = (Game.specialTab === tabName);
			if (tabName === 'dragon') {
				label = isSelected ? 'Close Krumblor the Dragon' : 'Krumblor the Dragon';
			} else if (tabName === 'santa') {
				label = isSelected ? "Close Santa's Progress" : "Santa's Progress";
			} else {
				label = isSelected ? ('Close ' + tabName) : (tabName + ' tab');
			}
			MOD.setAttributeIfChanged(btn, 'aria-label', label);
		}
	},
	createLiveRegion: function() {
		if (l('srAnnouncer')) return;
		var a = document.createElement('div');
		a.id = 'srAnnouncer';
		a.setAttribute('aria-live', 'polite');
		a.setAttribute('aria-atomic', 'true');
		a.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
		document.body.appendChild(a);
	},
	createAssertiveLiveRegion: function() {
		if (l('srAnnouncerUrgent')) return;
		var a = document.createElement('div');
		a.id = 'srAnnouncerUrgent';
		a.setAttribute('aria-live', 'assertive');
		a.setAttribute('aria-atomic', 'true');
		a.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
		document.body.appendChild(a);
	},
	announce: function(t) {
		var a = l('srAnnouncer');
		var u = l('srAnnouncerUrgent');
		// Clear both regions so only the latest message persists
		if (a) a.textContent = '';
		if (u) u.textContent = '';
		if (a) { setTimeout(function() { a.textContent = t; }, 50); }
	},
	announceUrgent: function(t) {
		var a = l('srAnnouncer');
		var u = l('srAnnouncerUrgent');
		// Clear both regions so only the latest message persists
		if (a) a.textContent = '';
		if (u) u.textContent = '';
		if (u) { setTimeout(function() { u.textContent = t; }, 50); }
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
			// Insert after products
			var products = l('products');
			if (products && products.parentNode) {
				products.parentNode.insertBefore(c, products.nextSibling);
			} else {
				document.body.appendChild(c);
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
						MOD.announce('Popped wrinkler! Recovered ' + rewardText + ' cookies.');
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
				var s = Beautify(w.sucked), t = w.type === 1 ? 'Shiny ' : '';
				o.textContent = t + 'Wrinkler: ' + s + ' cookies sucked. Click to pop.';
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

		// Insert after Active Buffs panel if exists, otherwise after products
		var buffsPanel = l('a11yActiveBuffsPanel');
		var products = l('products');
		if (buffsPanel && buffsPanel.parentNode) {
			buffsPanel.parentNode.insertBefore(c, buffsPanel.nextSibling);
		} else if (products && products.parentNode) {
			products.parentNode.insertBefore(c, products.nextSibling);
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

		// Process each active shimmer
		Game.shimmers.forEach(function(shimmer) {
			var id = shimmer.id;
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
			noShimmersMsg.style.display = Game.shimmers.length > 0 ? 'none' : 'block';
		}
	},
	enhanceSugarLump: function() {
		var lc = l('lumps');
		if (!lc) return;
		lc.setAttribute('role', 'button');
		lc.setAttribute('tabindex', '0');
		if (!lc.dataset.a11yEnhanced) {
			lc.dataset.a11yEnhanced = 'true';
			lc.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lc.click(); }
			});
		}
	},
	updateSugarLumpLabel: function() {
		var MOD = this;
		var lc = l('lumps');
		if (!lc || Game.lumpT === undefined) return;
		var types = ['Normal', 'Bifurcated', 'Golden', 'Meaty', 'Caramelized'];
		var type = types[Game.lumpCurrentType] || 'Normal';
		var ripe = Game.lumpRipeAge - (Date.now() - Game.lumpT);
		var mature = Game.lumpMatureAge - (Date.now() - Game.lumpT);
		var status = '';
		var isRipeNow = ripe <= 0;
		if (ripe <= 0 && mature <= 0) status = 'Mature and ready';
		else if (ripe <= 0) status = 'Ripe. Mature in ' + this.formatTime(mature);
		else status = 'Growing. Ripe in ' + this.formatTime(ripe);
		lc.setAttribute('aria-label', type + ' sugar lump. ' + status + '. You have ' + Beautify(Game.lumps) + ' lumps.');
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
		// Insert directly after the tab button container in sectionLeft
		var insertAfter = l('a11ySpecialTabButtons');
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
				Game.ClickSpecialPic();
				MOD.announce('Petted Krumblor');
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
				Game.UpgradeDragon();
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
				if (slotNum === 0) Game.dragonAura = selected;
				else Game.dragonAura2 = selected;
				// Pay cost if aura actually changed and player owns buildings
				if (selected !== currentAura && highestBuilding !== 0) {
					highestBuilding.sacrifice(1);
				}
				Game.recalculateGains = 1;
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
		// Focus the first aura button
		if (firstBtn) firstBtn.focus();
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
		var insertAfter = l('a11ySpecialTabButtons');
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
	enhanceStatisticsScreen: function() {
		// Removed - stats now labeled on-demand
	},
	labelStatisticsContent: function() {
		var MOD = this, menu = l('menu');
		if (!menu || Game.onMenu !== 'stats') return;
		if (MOD.statsLabelingInProgress) return;
		MOD.statsLabelingInProgress = true;
		// Process in batches to avoid blocking
		var crates = menu.querySelectorAll('.crate:not([data-a11y-stats])');
		var index = 0;
		var batchSize = 20;
		function processBatch() {
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
				setTimeout(processBatch, 10);
			} else {
				MOD.statsLabelingInProgress = false;
			}
		}
		setTimeout(processBatch, 50);
	},
	labelAllStatsCrates: function() {
		this.labelStatisticsContent();
	},
	labelStatsAchievementIcon: function(icon, ach, isShadow) {
		if (!icon || !ach) return;
		var MOD = this;
		var lbl = '';
		if (ach.won) {
			// Unlocked - show full info
			var n = ach.dname || ach.name;
			var d = MOD.stripHtml(ach.desc || '');
			var pool = (isShadow || ach.pool === 'shadow') ? ' [Shadow Achievement]' : '';
			lbl = n + '. Unlocked.' + pool + ' ' + d;
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
		if (!icon.getAttribute('role')) icon.setAttribute('role', 'button');
		if (!icon.getAttribute('tabindex')) icon.setAttribute('tabindex', '0');
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
		var d = MOD.stripHtml(upg.desc || '');
		var lbl = n + '. ' + d;
		// Populate the aria-labelledby target label (created by game when screenreader=1)
		var ariaLabel = l('ariaReader-upgrade-' + upg.id);
		if (ariaLabel) {
			ariaLabel.textContent = lbl;
		}
		// Also set aria-label directly
		icon.setAttribute('aria-label', lbl);
		if (!icon.getAttribute('role')) icon.setAttribute('role', 'button');
		if (!icon.getAttribute('tabindex')) icon.setAttribute('tabindex', '0');
	},
	// Legacy functions for backwards compatibility
	enhanceAchievementIcons: function() { this.labelAllStatsCrates(); },
	enhanceUpgradeIcons: function() { this.labelAllStatsCrates(); },
	labelAchievementIcon: function(i, a) { this.labelStatsAchievementIcon(i, a, false); },
	labelUpgradeIcon: function(i, u) { this.labelStatsUpgradeIcon(i, u, false); },
	setupNewsTicker: function() {
		// News ticker disabled - too noisy for screen readers
		// Users can manually navigate to read if needed
	},
	setupGoldenCookieAnnouncements: function() {
		var MOD = this;
		// Override pop functions to announce when clicked
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

				var r = orig.call(this, me);

				// Restore original Game.Popup
				Game.Popup = origPopup;

				// Mark as clicked so we don't announce "has faded" for clicked shimmers
				if (MOD.announcedShimmers[me.id]) {
					MOD.announcedShimmers[me.id].clicked = true;
				}

				// Check if this is a storm drop or chain cookie
				var isStormDrop = me.forceObj && me.forceObj.type === 'cookie storm drop';

				// Count storm clicks for summary
				if (isStormDrop && MOD.cookieStormActive) {
					MOD.stormClickCount++;
					return r; // Suppress individual announcement
				}

				// Suppress during active chain
				if (MOD.cookieChainActive) {
					return r;
				}

				var variant = MOD.getShimmerVariantName(me);

				// Non-buff effects: include the captured popup text in the announcement
				// Buff effects: just announce "clicked!"  - the buff tracker handles the rest
				var nonBuffEffects = ['multiply cookies', 'ruin cookies', 'blab',
				                      'free sugar lump', 'chain cookie'];
				var lastEffect = Game.shimmerTypes.golden.last;
				if (capturedPopup && nonBuffEffects.indexOf(lastEffect) !== -1) {
					MOD.announceUrgent(variant + ' clicked! ' + MOD.stripHtml(capturedPopup));
				} else {
					MOD.announceUrgent(variant + ' clicked!');
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
				var r = origR.call(this, me);
				MOD.announceUrgent('Reindeer clicked!');
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
				MOD.cookieChainActive = true;
				MOD.announceUrgent('Cookie chain started');
			} else if (currentChain === 0 && MOD.cookieChainActive) {
				MOD.cookieChainActive = false;
				var total = chainData.totalFromChain || 0;
				if (total > 0) {
					MOD.announceUrgent('Cookie chain ended. Earned ' + Beautify(total) + ' cookies');
				} else {
					MOD.announceUrgent('Cookie chain ended');
				}
			}
		}

		// Check Cookie Storm status
		var stormActive = Game.hasBuff && Game.hasBuff('Cookie storm');

		if (stormActive && !MOD.cookieStormActive) {
			MOD.cookieStormActive = true;
			MOD.stormClickCount = 0;
			MOD.announceUrgent('Cookie storm started');
		} else if (!stormActive && MOD.cookieStormActive) {
			MOD.cookieStormActive = false;
			if (MOD.stormClickCount > 0) {
				MOD.announceUrgent('Cookie storm ended. Collected ' + MOD.stormClickCount + ' cookies');
			} else {
				MOD.announceUrgent('Cookie storm ended');
			}
			MOD.stormClickCount = 0;
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
		// Announce new buffs with full duration
		for (var n in cur) {
			if (!MOD.lastBuffs[n]) {
				var duration = Math.ceil(cur[n].maxTime / Game.fps);
				MOD.announce(n + ' started for ' + duration + ' seconds!');
			}
		}
		// Announce ended buffs
		for (var n in MOD.lastBuffs) {
			if (!cur[n]) MOD.announce(n + ' ended.');
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
		if (bld.muteL) {
			MOD.setAttributeIfChanged(bld.muteL, 'aria-label', 'Mute ' + bldName);
			bld.muteL.setAttribute('role', 'button');
			bld.muteL.setAttribute('tabindex', '0');
		}
	},
	enhanceStoreControls: function() {
		var MOD = this;
		// Buy/Sell toggles
		var storeBulkBuy = l('storeBulkBuy');
		var storeBulkSell = l('storeBulkSell');
		var buyLabel = (Game.buyMode === 1 ? 'Selected, ' : '') + 'Buy mode';
		var sellLabel = (Game.buyMode === -1 ? 'Selected, ' : '') + 'Sell mode';
		if (storeBulkBuy) {
			MOD.setAttributeIfChanged(storeBulkBuy, 'aria-label', buyLabel);
			storeBulkBuy.setAttribute('role', 'button');
			storeBulkBuy.setAttribute('tabindex', '0');
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
			storeBulkSell.setAttribute('role', 'button');
			storeBulkSell.setAttribute('tabindex', '0');
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
		var buyBulk = Game.buyBulk;
		var amounts = [
			{ id: 'storeBulk1', label: 'Buy or sell 1 at a time', value: 1 },
			{ id: 'storeBulk10', label: 'Buy or sell 10 at a time', value: 10 },
			{ id: 'storeBulk100', label: 'Buy or sell 100 at a time', value: 100 },
			{ id: 'storeBulkMax', label: 'Buy or sell maximum amount', value: -1 }
		];
		amounts.forEach(function(amt) {
			var btn = l(amt.id);
			if (btn) {
				var label = (buyBulk === amt.value ? 'Selected, ' : '') + amt.label;
				MOD.setAttributeIfChanged(btn, 'aria-label', label);
				btn.setAttribute('role', 'button');
				btn.setAttribute('tabindex', '0');
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
		el.setAttribute('role', 'button');
		el.setAttribute('tabindex', '0');
		// Hide all child elements inside the product button from screen readers
		// so only our aria-label is announced (prevents duplicate name/price/owned reading)
		for (var c = 0; c < el.children.length; c++) {
			el.children[c].setAttribute('aria-hidden', 'true');
		}
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
			levelEl.setAttribute('role', 'status');
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
			levelUpBtn.setAttribute('role', 'button');
			levelUpBtn.setAttribute('tabindex', '0');
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
			muteBtn.setAttribute('role', 'button');
			muteBtn.setAttribute('tabindex', '0');
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
			closeBtn.setAttribute('role', 'button');
			closeBtn.setAttribute('tabindex', '0');
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
		var lbl = 'R' + (y+1) + ', C' + (x+1) + ': ';
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
					lbl += '. Matures in about ' + Game.sayTime(matFrames, -1);
				} else if (!pl.immortal) {
					var decayFrames = ((100 / (ageMult * avgTick)) * ((100 - age) / 100) * dragonBoost * g.stepT) * 30;
					lbl += '. Decays in about ' + Game.sayTime(decayFrames, -1);
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
				tile.setAttribute('role', 'button');
				tile.setAttribute('tabindex', '0');
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
			seed.setAttribute('aria-label', lbl);
			MOD.ensureSeedInfoText(g, plant, seed);
			seed.setAttribute('role', 'button');
			seed.setAttribute('tabindex', '0');
			if (!seed.getAttribute('data-a11y-kb')) {
				seed.setAttribute('data-a11y-kb', '1');
				(function(el) {
					el.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							el.click();
						}
					});
				})(seed);
			}
			// Add click handler for immediate "Selected"/"Deselected" announcement
			if (!seed.getAttribute('data-a11y-click')) {
				seed.setAttribute('data-a11y-click', '1');
				(function(el, plantName, plantId) {
					el.addEventListener('click', function() {
						var g = Game.Objects['Farm'].minigame;
						if (!g) return;
						if (g.seedSelected == plantId) {
							MOD.gardenAnnounce('Selected ' + plantName);
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
					lbl = 'Garden information and tips';
				} else if (toolKey === 'harvestAll') {
					lbl = 'Harvest all plants. Harvests all plants including immature ones';
				} else if (toolKey === 'freeze') {
					lbl = g.freeze ? 'Unfreeze garden. Currently FROZEN - plants are paused' : 'Freeze garden. Pauses all plant growth';
				} else if (toolKey === 'convert') {
					lbl = 'Sacrifice garden for 10 sugar lumps. WARNING: Destroys all plants and seeds';
				} else {
					lbl = tool.name || 'Garden tool';
				}
				toolEl.setAttribute('aria-label', lbl);
				toolEl.setAttribute('role', 'button');
				toolEl.setAttribute('tabindex', '0');
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
					'Garden information and tips',
					'Harvest all plants. Harvests all plants including immature ones',
					g.freeze ? 'Unfreeze garden (currently frozen)' : 'Freeze garden',
					'Sacrifice garden for sugar lumps'
				];
				toolEl.setAttribute('aria-label', labels[i] || 'Garden tool ' + i);
				toolEl.setAttribute('role', 'button');
				toolEl.setAttribute('tabindex', '0');
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
				for (var i = 0; i < plants.length; i++) {
					garden.harvest(plants[i].x, plants[i].y);
				}
				MOD.gardenAnnounce('Harvested ' + plants.length + ' mature plant' + (plants.length !== 1 ? 's' : ''));
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
			soilEl.setAttribute('role', 'button');
			soilEl.setAttribute('tabindex', '0');
			if (!soilEl.getAttribute('data-a11y-kb')) {
				soilEl.setAttribute('data-a11y-kb', '1');
				(function(el, id) {
					el.addEventListener('click', function() {
						var g = Game.Objects['Farm'].minigame;
						if (g && g.nextSoil > Date.now()) {
							var remaining = Game.sayTime((g.nextSoil - Date.now()) / 1000 * 30 + 30, -1);
							MOD.announce('Can change soil in ' + remaining);
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
			{ id: 'a11yGardenSoilHeading', text: 'Soil', beforeId: 'gardenSoil-0' },
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
	createGardenAccessiblePanel: function(g) {
		var MOD = this;
		if (!g) return;
		// Remove old panel if exists
		var oldPanel = l('a11yGardenPanel');
		if (oldPanel) oldPanel.remove();
		// Check if garden minigame is visible
		var gardenContainer = l('row2minigame');
		if (!gardenContainer) {
			gardenContainer = l('gardenContent');
		}
		if (!gardenContainer) return;

		// Gather statistics for announcement
		var unlockedSeeds = MOD.getUnlockedSeeds(g);
		var harvestable = MOD.getHarvestablePlants(g);
		var plantsCount = 0;
		for (var py = 0; py < 6; py++) {
			for (var px = 0; px < 6; px++) {
				var tile = g.plot[py] && g.plot[py][px];
				if (tile && tile[0] > 0) plantsCount++;
			}
		}

		// Create accessible panel
		var panel = document.createElement('div');
		panel.id = 'a11yGardenPanel';
		panel.setAttribute('aria-labelledby', 'a11yGardenHeading');
		panel.style.cssText = 'background:#1a2a1a;border:2px solid #4a4;padding:10px;margin:10px 0;';

		// H2 Title for navigation
		var title = document.createElement('h2');
		title.id = 'a11yGardenHeading';
		title.textContent = 'Garden Information - Level ' + (parseInt(g.parent.level) || 0);
		title.style.cssText = 'color:#6c6;margin:0 0 10px 0;font-size:16px;';
		panel.appendChild(title);

		// Status summary (focusable)
		var statusDiv = document.createElement('div');
		statusDiv.id = 'a11yGardenStatus';
		statusDiv.setAttribute('tabindex', '0');
		statusDiv.style.cssText = 'color:#aaa;margin-bottom:10px;padding:5px;background:#222;';
		var freezeStatus = g.freeze ? 'FROZEN' : 'Active';
		var soilName = g.soilsById && g.soil !== undefined && g.soilsById[g.soil] ? g.soilsById[g.soil].name : 'Unknown';
		statusDiv.textContent = 'Status: ' + freezeStatus + ' | Soil: ' + soilName + ' | ' + plantsCount + ' plants, ' + harvestable.length + ' ready to harvest';
		panel.appendChild(statusDiv);

		// Live region for announcements
		var announcer = document.createElement('div');
		announcer.id = 'a11yGardenAnnouncer';
		announcer.setAttribute('role', 'status');
		announcer.setAttribute('aria-live', 'polite');
		announcer.setAttribute('aria-atomic', 'true');
		announcer.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
		announcer.textContent = 'Garden panel loaded. ' + unlockedSeeds.length + ' seeds unlocked, ' + plantsCount + ' plots with plants, ' + harvestable.length + ' ready to harvest';
		panel.appendChild(announcer);

		// Insert panel after the garden minigame
		gardenContainer.parentNode.insertBefore(panel, gardenContainer.nextSibling);
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
		var label = 'R' + (y+1) + ', C' + (x+1) + ': ';
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
				label += '. Decays in about ' + Game.sayTime(decayFrames, -1);
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
				label += '. Matures in about ' + Game.sayTime(matFrames, -1);
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
		panel.setAttribute('aria-label', 'Garden Information. Press Escape to close.');
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
			MOD.gardenAnnounce('R' + (y+1) + ', C' + (x+1) + ', empty');
			return;
		}
		if (!info.isMature) {
			MOD.gardenAnnounce(info.name + ' at R' + (y+1) + ', C' + (x+1) + ' is ' + info.growth + '% grown, not ready to harvest');
			return;
		}
		g.harvest(x, y);
		MOD.gardenAnnounce('Harvested ' + info.name + ' from R' + (y+1) + ', C' + (x+1));
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
			var cost = g.getCost(seed);
			var cps = Game.cookiesPs;
			if (Game.cpsSucked) cps = cps * (1 - Game.cpsSucked);
			if (cps > 0) {
				MOD.gardenAnnounce('Can afford in ' + MOD.getTimeUntilAfford(cost));
			}
			return;
		}
		var result = g.useTool(g.seedSelected, x, y);
		if (result) {
			MOD.gardenAnnounce('Planted ' + seed.name + ' at R' + (y+1) + ', C' + (x+1));
			MOD.updatePlotButton(x, y);
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
	// Update Garden panel status and harvestable plants (lightweight refresh)
	updateGardenPanelStatus: function() {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		// Re-label the original garden elements
		MOD.labelOriginalGardenElements(g);
		// Update accessible plot buttons in-place
		MOD.updateAllPlotButtons();
		// Update status in virtual panel if it exists
		var statusInfo = l('a11yGardenStatusInfo');
		if (statusInfo && typeof GardenModule !== 'undefined') {
			var freezeStatus = g.freeze ? 'FROZEN' : 'Active';
			var soilName = g.soilsById && g.soilsById[g.soil] ? g.soilsById[g.soil].name : 'Unknown';
			statusInfo.innerHTML = '<strong>Status:</strong> ' + freezeStatus +
				' | <strong>Soil:</strong> ' + soilName +
				' | <strong>Grid:</strong> ' + g.plotWidth + 'x' + g.plotHeight;
		}
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
		// Reorder DOM elements: slots first, then gods in order
		var firstSlot = l('templeSlot0');
		if (firstSlot && firstSlot.parentNode && !firstSlot.parentNode.dataset.a11yReordered) {
			var parent = firstSlot.parentNode;
			// Move slots to the beginning (in reverse order so they end up 0, 1, 2)
			for (var i = 2; i >= 0; i--) {
				var slotEl = l('templeSlot' + i);
				if (slotEl) {
					parent.insertBefore(slotEl, parent.firstChild);
				}
			}
			// Move gods after slots (sorted by id)
			var godIds = Object.keys(pan.gods).sort(function(a, b) { return parseInt(a) - parseInt(b); });
			var lastSlot = l('templeSlot2');
			var insertPoint = lastSlot ? lastSlot.nextSibling : null;
			for (var j = 0; j < godIds.length; j++) {
				var godId = pan.gods[godIds[j]].id;
				var godEl = l('templeGod' + godId);
				if (godEl) {
					// Move elements in order: heading, flavor, buff, god, buttons
					var headingEl = l('a11y-god-heading-' + godId);
					var flavorEl = l('a11y-god-flavor-' + godId);
					var buffEl = l('a11y-god-buff-' + godId);
					var elementsToMove = [headingEl, flavorEl, buffEl, godEl];
					for (var k = 0; k < elementsToMove.length; k++) {
						if (elementsToMove[k]) {
							if (insertPoint) {
								parent.insertBefore(elementsToMove[k], insertPoint);
							} else {
								parent.appendChild(elementsToMove[k]);
							}
						}
					}
					// Move button container if it exists (inserted after god)
					var btnContainer = godEl.nextSibling;
					if (btnContainer && btnContainer.className === 'a11y-spirit-controls') {
						if (insertPoint) {
							parent.insertBefore(btnContainer, insertPoint);
						} else {
							parent.appendChild(btnContainer);
						}
					}
				}
			}
			parent.dataset.a11yReordered = 'true';
		}
		// Enhance spirit slots
		for (var i = 0; i < 3; i++) {
			var slotEl = l('templeSlot' + i);
			if (!slotEl) continue;
			var spiritId = pan.slot[i];
			var lbl = slots[i] + ' slot: ';
			if (spiritId !== -1 && pan.godsById[spiritId]) {
				var god = pan.godsById[spiritId];
				lbl += god.name + '. Press Enter to remove.';
				slotEl.setAttribute('role', 'button');
			} else {
				lbl += 'Empty';
				slotEl.removeAttribute('role');
			}
			slotEl.setAttribute('aria-label', lbl);
			slotEl.setAttribute('tabindex', '0');
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
							div.setAttribute('tabindex', '0');
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
			if (god.descBefore) descParts.push(MOD.stripHtml(god.descBefore));
			if (god.descAfter) descParts.push(MOD.stripHtml(god.descAfter));
			var cleanDesc = descParts.join('. ').replace(/ +\./g, '.').replace(/ +,/g, ',');
			var flavorText = god.quote ? MOD.stripHtml(god.quote).replace(/ +\./g, '.').replace(/ +,/g, ',') : '';
			// Hide the god element from screen readers
			godEl.setAttribute('aria-hidden', 'true');
			godEl.removeAttribute('tabindex');
			// Add h3 heading, flavor, buff, and slot buttons if not already added
			if (!godEl.dataset.a11yEnhanced) {
				godEl.dataset.a11yEnhanced = 'true';
				// Add h3 heading before god element
				var heading = document.createElement('h3');
				heading.id = 'a11y-god-heading-' + god.id;
				heading.textContent = god.name + (slotted >= 0 ? ', in ' + slots[slotted] + ' slot' : '');
				heading.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
				godEl.parentNode.insertBefore(heading, godEl);
				// Add flavor text element
				var flavorEl = document.createElement('div');
				flavorEl.id = 'a11y-god-flavor-' + god.id;
				flavorEl.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
				godEl.parentNode.insertBefore(flavorEl, godEl);
				// Add buff text element
				var buffEl = document.createElement('div');
				buffEl.id = 'a11y-god-buff-' + god.id;
				buffEl.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
				godEl.parentNode.insertBefore(buffEl, godEl);
				MOD.createSpiritSlotButtons(god, godEl, pan, slots);
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
	createSpiritSlotButtons: function(god, godEl, pantheon, slots) {
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
		godEl.parentNode.insertBefore(container, godEl.nextSibling);
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
		var magicText = 'Magic: ' + currentMagic + ' / ' + maxMagic + '. Spells cast: ' + spellsCast + ', total: ' + spellsCastTotal + '.';

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
				if (MOD.grimoireSpellCasting) {
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
					effectDiv.setAttribute('tabindex', '0');
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
			var trend = good.d > 0 ? 'Rising' : (good.d < 0 ? 'Falling' : 'Stable');
			trend += ' ' + (delta >= 0 ? '+' : '') + delta + '%';
			var maxStock = mkt.getGoodMaxStock(good);
			var headingText = goodName + ', ' + good.stock + ' of ' + maxStock + ' shares, $' + Beautify(mkt.getGoodPrice(good), 2) + ', ' + trend;
			MOD.setTextIfChanged(heading, headingText);
			// Stock info div with value and warehouse details
			var goodPrice = mkt.getGoodPrice(good);
			var stockValue = good.stock > 0 ? Beautify(Game.cookiesPsRawHighest * goodPrice * good.stock) : '0';
			var stockInfoText = 'Value of held stock: ' + stockValue + ' cookies. Warehouse: ' + good.stock + ' of ' + maxStock + '. Increase storage with office upgrades and more ' + good.building.plural + ', plus 10 per ' + good.building.single + ' level (currently +' + (good.building.level * 10) + '). Average worth depends on ' + good.building.plural + ' and Bank level';
			MOD.ensureInfoNote('a11y-stock-info-' + id, stockInfoText, heading);
			// Aria-hide visual-only .bankSymbol elements
			r.querySelectorAll('.bankSymbol').forEach(function(sym) {
				sym.setAttribute('aria-hidden', 'true');
			});
			// Enhance view/hide graph toggle
			var viewHideBtn = l('bankGood-' + id + '-viewHide');
			if (viewHideBtn) {
				var viewLabel = good.hidden ? 'Show ' + goodName + ' on graph' : 'Hide ' + goodName + ' on graph';
				MOD.setAttributeIfChanged(viewHideBtn, 'aria-label', viewLabel);
				viewHideBtn.setAttribute('role', 'button');
				viewHideBtn.setAttribute('tabindex', '0');
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
							label = 'Sell all ' + goodName + ', ' + sellQty + ' shares, earns ' + Beautify(revenue) + ' cookies';
						} else {
							label = 'Sell all ' + goodName + ', no shares owned';
						}
					} else {
						sellQty = parseInt(sellPart, 10);
						var actualSellQty = Math.min(sellQty, good.stock);
						if (actualSellQty > 0) {
							var revenue = Game.cookiesPsRawHighest * price * actualSellQty;
							label = 'Sell ' + sellPart + ' ' + goodName + ', earns ' + Beautify(revenue) + ' cookies';
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
							label = 'Buy maximum ' + goodName + ', ' + buyQty + ' shares, costs ' + Beautify(cost) + ' cookies';
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
							label = 'Buy ' + suffix + ' ' + goodName + ', costs ' + Beautify(cost) + ' cookies';
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
				btn.setAttribute('role', 'button');
				btn.setAttribute('tabindex', '0');
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
				MOD.setAttributeIfChanged(officeUpgradeBtn, 'aria-disabled', 'true');
			}
			officeUpgradeBtn.setAttribute('role', 'button');
			officeUpgradeBtn.setAttribute('tabindex', '0');
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
			MOD.setAttributeIfChanged(hireBrokerBtn, 'aria-disabled', brokerDisabled ? 'true' : 'false');
			hireBrokerBtn.setAttribute('role', 'button');
			hireBrokerBtn.setAttribute('tabindex', '0');
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
				MOD.setAttributeIfChanged(loanBtn, 'aria-disabled', loanDisabled ? 'true' : 'false');
				loanBtn.setAttribute('role', 'button');
				loanBtn.setAttribute('tabindex', '0');
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
				var price = mkt.getGoodPrice(me);
				var overhead = 1 + 0.01 * (20 * Math.pow(0.95, mkt.brokers));
				var cost = Game.cookiesPsRawHighest * price * overhead * bought;
				MOD.announce('Bought ' + bought + ' ' + goodName + ' for ' + Beautify(cost) + ' cookies');
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
				var price = mkt.getGoodPrice(me);
				var revenue = Game.cookiesPsRawHighest * price * sold;
				MOD.announce('Sold ' + sold + ' ' + goodName + ' for ' + Beautify(revenue) + ' cookies');
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
				// Move all product elements into the wrapper
				var productElements = products.querySelectorAll('[id^="product"]');
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
		// Make ticker focusable if it exists
		var ticker = l('ticker');
		if (ticker) {
			ticker.setAttribute('tabindex', '0');
			ticker.setAttribute('aria-live', 'off');
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
			// Add Store heading right before the upgrades container
			if (!l('a11yStoreHeading')) {
				var storeHeading = document.createElement('h2');
				storeHeading.id = 'a11yStoreHeading';
				storeHeading.textContent = 'Store';
				storeHeading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
				uc.parentNode.insertBefore(storeHeading, uc);
			}
		}
		// Vault upgrades
		var vc = l('vaultUpgrades');
		if (vc) {
			vc.setAttribute('role', 'region'); vc.setAttribute('aria-label', 'Vaulted');
			vc.querySelectorAll('.crate.upgrade').forEach(function(c) {
				var id = c.dataset.id;
				if (id && Game.UpgradesById[id]) {
					var upg = Game.UpgradesById[id];
					var n = upg.dname || upg.name;
					c.removeAttribute('aria-labelledby');
					c.setAttribute('aria-label', n + ' (Vaulted). Cost: ' + Beautify(Math.round(upg.getPrice())));
					c.setAttribute('role', 'button');
					c.setAttribute('tabindex', '0');
					for (var ci = 0; ci < c.children.length; ci++) {
						c.children[ci].setAttribute('aria-hidden', 'true');
					}
				}
			});
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
			var cookies = Game.cookies;
			if (cookies >= price) return 'Affordable now';
			var deficit = price - cookies;
			var cps = Game.cookiesPs;
			if (Game.cpsSucked) cps = cps * (1 - Game.cpsSucked);
			if (cps <= 0) return 'Cannot afford yet';
			var seconds = Math.ceil(deficit / cps);
			if (seconds < 60) return seconds + ' second' + (seconds !== 1 ? 's' : '');
			var minutes = Math.floor(seconds / 60);
			var remainSec = seconds % 60;
			if (minutes < 60) {
				if (remainSec > 0) return minutes + ' min ' + remainSec + ' sec';
				return minutes + ' minute' + (minutes !== 1 ? 's' : '');
			}
			var hours = Math.floor(minutes / 60);
			var remainMin = minutes % 60;
			if (hours < 24) {
				if (remainMin > 0) return hours + ' hr ' + remainMin + ' min';
				return hours + ' hour' + (hours !== 1 ? 's' : '');
			}
			var days = Math.floor(hours / 24);
			var remainHr = hours % 24;
			if (remainHr > 0) return days + ' day' + (days !== 1 ? 's' : '') + ' ' + remainHr + ' hr';
			return days + ' day' + (days !== 1 ? 's' : '');
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
					var cps = Game.cookiesPs;
					if (Game.cpsSucked) cps = cps * (1 - Game.cpsSucked);
					if (cps > 0) {
						lines.push('Can afford in ' + MOD.getTimeUntilAfford(price));
					}
				}
			}
			// In sell mode, don't show time until affordable

			if (building.amount > 0 && building.storedCps) {
				lines.push('Each produces: ' + Beautify(building.storedCps, 1) + ' cookies per second');
				lines.push('Total production: ' + Beautify(building.storedTotalCps, 1) + ' cookies per second');
				if (Game.cookiesPs > 0) {
					var pct = Math.round((building.storedTotalCps / Game.cookiesPs) * 100);
					if (pct < 1) {
						lines.push('This is less than 1 percent of total production');
					} else {
						lines.push('This is ' + pct + ' percent of total production');
					}
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
				existingText.setAttribute('aria-label', infoText);
				existingText.style.display = '';
				existingText.removeAttribute('aria-hidden');
			} else {
				// Create info text element (not a button - just focusable text)
				var infoDiv = document.createElement('div');
				infoDiv.id = textId;
				infoDiv.className = 'a11y-building-info';
				infoDiv.style.cssText = 'display:block;padding:6px;margin:2px 0;font-size:11px;color:#aaa;background:#1a1a1a;border:1px solid #333;';
				infoDiv.setAttribute('tabindex', '0');
				infoDiv.setAttribute('role', 'note');
				infoDiv.setAttribute('aria-label', infoText);
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
			return 'Time until affordable: ' + MOD.getTimeUntilAfford(price);
		} catch(e) {
			return 'Time unknown';
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
			btn.setAttribute('role', 'button');
			btn.setAttribute('tabindex', '0');
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
		var containers = [l('upgrades'), l('toggleUpgrades'), l('vaultUpgrades')];
		for (var ci = 0; ci < containers.length; ci++) {
			if (!containers[ci]) continue;
			var btn = containers[ci].querySelector('[data-id="' + u.id + '"]');
			if (btn) {
				btn.removeAttribute('aria-labelledby');
				btn.setAttribute('aria-label', t);
				btn.setAttribute('role', 'button');
				btn.setAttribute('tabindex', '0');
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
		// Clear ariaReader label so game's crateTooltip text can't stick
		var a = l('ariaReader-upgrade-' + u.id);
		if (a) a.innerHTML = '';
		// Also add a visible/focusable text element below the upgrade (skip for toggles - they have click menus)
		if (u.pool !== 'toggle') {
			MOD.ensureUpgradeInfoText(u);
		}
	},
	ensureUpgradeInfoText: function(u) {
		var MOD = this;
		if (!u || u.bought) return;
		// Find the upgrade crate element in the upgrades container
		var upgradesContainer = l('upgrades');
		if (!upgradesContainer) return;
		var crate = upgradesContainer.querySelector('[data-id="' + u.id + '"]');
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
			var cps = Game.cookiesPs;
			if (Game.cpsSucked) cps = cps * (1 - Game.cpsSucked);
			if (cps > 0) {
				infoText = 'Can afford in ' + MOD.getTimeUntilAfford(u.getPrice()) + '. ' + desc;
			} else {
				infoText = desc;
			}
		}
		if (existingText) {
			existingText.textContent = infoText;
			existingText.setAttribute('aria-label', infoText);
		} else {
			// Create info text element (like Grimoire effect text - focusable but not a button)
			var infoDiv = document.createElement('div');
			infoDiv.id = textId;
			infoDiv.className = 'a11y-upgrade-info';
			infoDiv.style.cssText = 'display:block;padding:6px;margin:4px 0;font-size:12px;color:#ccc;background:#1a1a1a;border:1px solid #444;';
			infoDiv.setAttribute('tabindex', '0');
			infoDiv.setAttribute('role', 'note');
			infoDiv.setAttribute('aria-label', infoText);
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
		el.setAttribute('role', 'button');
		el.setAttribute('tabindex', '0');
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
			orig.setAttribute('tabindex', '-1');
		}
	},
	ensureInfoNote: function(id, text, afterEl) {
		var existing = l(id);
		if (existing) {
			this.setTextIfChanged(existing, text);
			this.setAttributeIfChanged(existing, 'aria-label', text);
		} else if (afterEl) {
			var div = document.createElement('div');
			div.id = id;
			div.setAttribute('tabindex', '0');
			div.setAttribute('role', 'note');
			div.setAttribute('aria-label', text);
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
					lines.push('Affordable in ' + MOD.getTimeUntilAfford(cost) + '.');
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
			var matTicks = Math.ceil((100 / (avgTick / dragonBoost)) * (plant.mature / 100));
			var matLine = 'Maturation: ' + Game.sayTime(matFrames, -1) + ' (' + matTicks + ' tick' + (matTicks !== 1 ? 's' : '') + ').';
			if (!plant.immortal) {
				var lifeFrames = ((100 / avgTick) * dragonBoost * g.stepT) * 30;
				var lifeTicks = Math.ceil(100 / (avgTick / dragonBoost));
				matLine += ' Lifespan: ' + Game.sayTime(lifeFrames, -1) + ' (' + lifeTicks + ' tick' + (lifeTicks !== 1 ? 's' : '') + ').';
			} else {
				matLine += ' Immortal.';
			}
			lines.push(matLine);

			// Type
			if (plant.weed) lines.push('Type: Weed.');
			if (plant.fungus) lines.push('Type: Fungus.');

			// Details
			if (plant.detailsStr) {
				lines.push('Details: ' + MOD.stripHtml(plant.detailsStr) + '.');
			}

			// Mutations
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
					var mutStr = 'Mutations: ';
					if (unlockedChildren.length > 0) {
						mutStr += unlockedChildren.join(', ');
					}
					if (lockedCount > 0) {
						if (unlockedChildren.length > 0) mutStr += ', ';
						mutStr += lockedCount + ' locked';
					}
					lines.push(mutStr + '.');
				}
			}

			// Flavor quote
			if (plant.q) {
				lines.push('"' + MOD.stripHtml(plant.q) + '"');
			}

			infoText = lines.join(' ');
		}

		if (existingText) {
			existingText.textContent = infoText;
			existingText.setAttribute('aria-label', infoText);
		} else {
			var infoDiv = document.createElement('div');
			infoDiv.id = textId;
			infoDiv.className = 'a11y-seed-info';
			infoDiv.style.cssText = 'display:block;padding:6px;margin:4px 0;font-size:12px;color:#ccc;background:#1a1a1a;border:1px solid #444;';
			infoDiv.setAttribute('tabindex', '0');
			infoDiv.setAttribute('role', 'note');
			infoDiv.setAttribute('aria-label', infoText);
			infoDiv.textContent = infoText;
			if (seedEl.nextSibling) {
				seedEl.parentNode.insertBefore(infoDiv, seedEl.nextSibling);
			} else {
				seedEl.parentNode.appendChild(infoDiv);
			}
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
	enhanceAscensionUI: function() {
		var MOD = this;
		var ao = l('ascendOverlay');
		if (ao) { ao.setAttribute('role', 'region'); ao.setAttribute('aria-label', 'Ascension'); }
		var ab = l('ascendButton');
		if (ab) {
			ab.setAttribute('role', 'button'); ab.setAttribute('tabindex', '0');
			ab.setAttribute('aria-label', 'Reincarnate');
			if (!ab.dataset.a11yEnhanced) {
				ab.dataset.a11yEnhanced = 'true';
				ab.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ab.click(); } });
			}
		}
		// Make prestige and heavenly chips data accessible
		var d1 = l('ascendData1');
		if (d1) {
			d1.removeAttribute('aria-hidden');
			d1.setAttribute('tabindex', '0');
			d1.setAttribute('aria-label', 'Prestige level: ' + Beautify(Game.prestige));
		}
		var d2 = l('ascendData2');
		if (d2) {
			d2.removeAttribute('aria-hidden');
			d2.setAttribute('tabindex', '0');
			d2.setAttribute('aria-label', 'Heavenly chips: ' + Beautify(Game.heavenlyChips));
		}
		// Label the challenge mode selector button
		MOD.labelAscendModeButton();
		// Hide decorative/instructional elements from screen readers
		var ai = l('ascendInfo');
		if (ai) ai.setAttribute('aria-hidden', 'true');
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
			crate.setAttribute('role', 'button');
			crate.setAttribute('tabindex', '0');
			if (!crate.dataset.a11yEnhanced) {
				crate.dataset.a11yEnhanced = 'true';
				crate.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); crate.click(); }
				});
			}
		}
	},
	updateAscendDataLabels: function() {
		var d1 = l('ascendData1');
		if (d1) d1.setAttribute('aria-label', 'Prestige level: ' + Beautify(Game.prestige));
		var d2 = l('ascendData2');
		if (d2) d2.setAttribute('aria-label', 'Heavenly chips: ' + Beautify(Game.heavenlyChips));
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
		slotEl.setAttribute('role', 'button');
		slotEl.setAttribute('tabindex', '0');
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
		for (var i in Game.PrestigeUpgrades) { var u = Game.PrestigeUpgrades[i]; if (u) MOD.labelHeavenlyUpgrade(u); }
	},
	labelHeavenlyUpgrade: function(u) {
		if (!u) return;
		var MOD = this;
		var n = u.dname || u.name;
		var p = Beautify(Math.round(u.getPrice()));
		var desc = u.desc ? MOD.stripHtml(u.desc) : '';
		var t = n + '. ';
		// Check owned status properly
		if (u.bought) {
			t += 'Owned. ';
		} else {
			var canAfford = Game.heavenlyChips >= u.getPrice();
			t += (canAfford ? 'Can afford. ' : 'Cannot afford. ');
			t += 'Cost: ' + p + ' heavenly chips. ';
		}
		// Add description/effect
		if (desc) {
			t += desc;
		}
		var ar = l('ariaReader-upgrade-' + u.id);
		if (ar) ar.innerHTML = t;
		var cr = l('heavenlyUpgrade' + u.id);
		if (cr) {
			cr.removeAttribute('aria-labelledby');
			cr.setAttribute('aria-label', t);
			cr.setAttribute('role', 'button');
			cr.setAttribute('tabindex', '0');
			if (!cr.dataset.a11yEnhanced) {
				cr.dataset.a11yEnhanced = 'true';
				cr.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cr.click(); } });
			}
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
		// Track shimmer appearances every 5 ticks for timely announcements
		if (Game.T % 5 === 0) {
			MOD.trackRapidFireEvents();
			MOD.trackShimmerAnnouncements();
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
						MOD.createEnhancedPantheonPanel();
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
			MOD.checkVeilState();
			MOD.updateBuffTracker();
			MOD.updateAchievementTracker();
			MOD.updateSeasonTracker();
			MOD.updateLegacyButtonLabel();
			MOD.updateFeaturesPanel();
			MOD.updateMainInterfaceDisplays();
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
				MOD.createEnhancedPantheonPanel();
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
		}
		// Refresh upgrade shop when store changes
		if (Game.storeToRefresh !== MOD.lastStoreRefresh) {
			MOD.lastStoreRefresh = Game.storeToRefresh;
			setTimeout(function() { MOD.enhanceUpgradeShop(); }, 50);
		}
		// Statistics menu - only label once when opened
		if (Game.onMenu === 'stats' && !MOD.statsLabeled) {
			MOD.statsLabeled = true;
			setTimeout(function() { MOD.labelStatisticsContent(); }, 200);
		} else if (Game.onMenu !== 'stats') {
			MOD.statsLabeled = false;
		}
		if (Game.OnAscend) {
			if (!MOD.wasOnAscend) {
				MOD.wasOnAscend = true;
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
		// Milk selector button in sectionLeft (below milk display)
		var milkUpg = Game.Upgrades['Milk selector'];
		var milkUnlocked = milkUpg && milkUpg.unlocked;
		var milkBtn = l('a11yMilkSelectorButton');
		if (milkBtn) {
			if (milkUnlocked) {
				milkBtn.style.display = '';
				MOD.updateMilkLabel();
			} else {
				milkBtn.style.display = 'none';
			}
		}
		// Hide the store crate since we have a dedicated button below the milk display
		var milkCrate = MOD.findSelectorCrate('Milk selector');
		if (milkCrate) {
			milkCrate.setAttribute('tabindex', '-1');
			milkCrate.setAttribute('aria-hidden', 'true');
		}
		// Check if background selector is unlocked (requires "Background selector" heavenly upgrade)
		var bgUnlocked = Game.Has('Background selector');
		var bgBox = l('backgroundBox');
		if (bgBox) {
			if (bgUnlocked) {
				bgBox.setAttribute('role', 'button');
				bgBox.setAttribute('tabindex', '0');
				bgBox.removeAttribute('aria-hidden');
				MOD.updateBackgroundLabel();
				if (!bgBox.dataset.a11yEnhanced) {
					bgBox.dataset.a11yEnhanced = 'true';
					bgBox.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bgBox.click(); }
					});
				}
			} else {
				bgBox.setAttribute('tabindex', '-1');
				bgBox.setAttribute('aria-hidden', 'true');
			}
		}
		// Season selector - check if any season switcher upgrade is owned
		var seasonUnlocked = Game.Has('Season switcher');
		var seasonBox = l('seasonBox');
		if (seasonBox) {
			if (seasonUnlocked) {
				seasonBox.setAttribute('role', 'button');
				seasonBox.setAttribute('tabindex', '0');
				seasonBox.removeAttribute('aria-hidden');
				MOD.updateSeasonLabel();
				if (!seasonBox.dataset.a11yEnhanced) {
					seasonBox.dataset.a11yEnhanced = 'true';
					seasonBox.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seasonBox.click(); }
					});
				}
			} else {
				seasonBox.setAttribute('tabindex', '-1');
				seasonBox.setAttribute('aria-hidden', 'true');
			}
		}
		// Sound/Volume selector
		var soundBox = l('soundBox');
		if (soundBox) {
			soundBox.setAttribute('role', 'button');
			soundBox.setAttribute('tabindex', '0');
			MOD.updateSoundLabel();
			if (!soundBox.dataset.a11yEnhanced) {
				soundBox.dataset.a11yEnhanced = 'true';
				soundBox.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); soundBox.click(); }
				});
			}
		}
		// Generic store pre-buttons (only if visible/unlocked)
		document.querySelectorAll('.storePreButton').forEach(function(btn) {
			// Check if button is visible (display not none)
			var isVisible = btn.offsetParent !== null || getComputedStyle(btn).display !== 'none';
			if (isVisible) {
				btn.setAttribute('role', 'button');
				btn.setAttribute('tabindex', '0');
				btn.removeAttribute('aria-hidden');
				if (!btn.dataset.a11yEnhanced) {
					btn.dataset.a11yEnhanced = 'true';
					btn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
					});
				}
			} else {
				btn.setAttribute('tabindex', '-1');
				btn.setAttribute('aria-hidden', 'true');
			}
		});
	},
	updateMilkLabel: function() {
		var milkUpg = Game.Upgrades['Milk selector'];
		if (!milkUpg || !milkUpg.unlocked) return;
		var milkName = 'Automatic';
		if (Game.milkType !== undefined && Game.milkType > 0 && Game.AllMilks && Game.AllMilks[Game.milkType]) {
			milkName = Game.AllMilks[Game.milkType].name || 'Milk ' + Game.milkType;
		} else if (Game.milkType === 0) {
			milkName = 'Automatic (based on achievements)';
		}
		// Update the main button in sectionLeft
		var milkBtn = l('a11yMilkSelectorButton');
		if (milkBtn) {
			this.setTextIfChanged(milkBtn, 'Milk selector: ' + milkName);
			milkBtn.removeAttribute('aria-label');
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
		});
		panel.appendChild(closeBtn);
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
		// Insert after the milk selector button in sectionLeft
		var milkBtn = l('a11yMilkSelectorButton');
		if (milkBtn) {
			milkBtn.parentNode.insertBefore(panel, milkBtn.nextSibling);
		} else {
			// Fallback: insert into sectionLeft before sectionLeftExtra
			var sectionLeft = l('sectionLeft');
			var sectionLeftExtra = l('sectionLeftExtra');
			if (sectionLeft && sectionLeftExtra) {
				sectionLeft.insertBefore(panel, sectionLeftExtra);
			} else if (sectionLeft) {
				sectionLeft.appendChild(panel);
			}
		}
		heading.focus();
	},
	updateBackgroundLabel: function() {
		var bgBox = l('backgroundBox');
		if (!bgBox) return;
		if (!Game.Has('Background selector')) return;
		var bgName = 'Automatic';
		if (Game.bgType !== undefined && Game.bgType > 0 && Game.Backgrounds && Game.Backgrounds[Game.bgType]) {
			bgName = Game.Backgrounds[Game.bgType].name || 'Background ' + Game.bgType;
		} else if (Game.bgType === 0) {
			bgName = 'Automatic (changes with milk)';
		}
		bgBox.setAttribute('aria-label', 'Background selector. Current: ' + bgName + '. Click to change background.');
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
		var soundBox = l('soundBox');
		if (!soundBox) return;
		var volume = Game.volume !== undefined ? Game.volume : 50;
		var status = volume > 0 ? 'On (' + volume + '%)' : 'Muted';
		soundBox.setAttribute('aria-label', 'Sound selector. Volume: ' + status + '. Click to adjust sound settings.');
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
	// MODULE: Active Buffs Panel (visible, with H2)
	// ============================================
	createActiveBuffsPanel: function() {
		var MOD = this;
		var oldPanel = l('a11yActiveBuffsPanel');
		if (oldPanel) oldPanel.remove();
		// Create panel after buildings section
		var products = l('products');
		if (!products) return;
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
		featuresList.textContent = 'No active status effects';
		panel.appendChild(featuresList);
		// Insert after Wrinklers panel if exists, otherwise after products
		var wrinklerPanel = l('wrinklerOverlayContainer');
		if (wrinklerPanel && wrinklerPanel.parentNode) {
			wrinklerPanel.parentNode.insertBefore(panel, wrinklerPanel.nextSibling);
		} else {
			products.parentNode.insertBefore(panel, products.nextSibling);
		}
	},
	updateFeaturesPanel: function() {
		var MOD = this;
		var featuresList = l('a11yFeaturesList');
		if (!featuresList) return;
		var items = [];
		// Dragon level
		if (Game.dragonLevel > 0) {
			items.push('Krumblor level: ' + Game.dragonLevel + ' of 25');
		}
		// Dragon Aura 1
		if (Game.dragonLevel >= 5 && Game.dragonAura > 0 && Game.dragonAuras[Game.dragonAura]) {
			var aura = Game.dragonAuras[Game.dragonAura];
			var auraDesc = aura.desc ? MOD.stripHtml(aura.desc) : '';
			items.push('Dragon Aura 1: ' + (aura.dname || aura.name) + (auraDesc ? ', ' + auraDesc : ''));
		}
		// Dragon Aura 2
		if (Game.dragonLevel >= 19 && Game.dragonAura2 > 0 && Game.dragonAuras[Game.dragonAura2]) {
			var aura2 = Game.dragonAuras[Game.dragonAura2];
			var aura2Desc = aura2.desc ? MOD.stripHtml(aura2.desc) : '';
			items.push('Dragon Aura 2: ' + (aura2.dname || aura2.name) + (aura2Desc ? ', ' + aura2Desc : ''));
		}
		// Santa level
		if (Game.santaLevel > 0) {
			items.push('Santa level: ' + Game.santaLevel + ' of 14');
		}
		// Active season
		if (Game.season !== '' && Game.seasons[Game.season]) {
			items.push('Season: ' + Game.seasons[Game.season].name);
		}
		// Grandmapocalypse
		if (Game.elderWrath > 0) {
			var stages = {1: 'Awoken (stage 1)', 2: 'Displeased (stage 2)', 3: 'Angered (stage 3)'};
			items.push('Grandmapocalypse: ' + (stages[Game.elderWrath] || 'stage ' + Game.elderWrath));
		}
		// Elder Pledge
		if (Game.pledgeT > 0) {
			var pledgeRemaining = Math.ceil(Game.pledgeT / Game.fps);
			items.push('Elder Pledge: active, ' + pledgeRemaining + 's remaining');
		}
		// Elder Covenant
		if (Game.Has('Elder Covenant')) {
			items.push('Elder Covenant: active (CpS reduced 5%)');
		}
		// Golden Switch
		if (Game.Has('Golden switch [on]')) {
			items.push('Golden Switch: ON (+50% CpS, no golden cookies)');
		}
		// Shimmering Veil
		if (Game.Has('Shimmering veil [on]')) {
			items.push('Shimmering Veil: ON (+50% CpS)');
		}
		// Active buffs (timed effects like Frenzy, Click Frenzy, etc.)
		if (Game.buffs) {
			for (var name in Game.buffs) {
				var b = Game.buffs[name];
				if (b && b.time > 0) {
					var remaining = Math.ceil(b.time / Game.fps);
					var desc = b.desc ? MOD.stripHtml(b.desc) : '';
					var buffText = '<strong>' + name + '</strong>: ' + remaining + 's remaining';
					if (desc) buffText += '<br><span style="color:#aaa;font-size:12px;">' + desc + '</span>';
					items.push(buffText);
				}
			}
		}
		if (items.length === 0) {
			featuresList.innerHTML = '<div tabindex="0">No active status effects</div>';
		} else {
			var html = '';
			items.forEach(function(item) {
				html += '<div tabindex="0" style="padding:4px 0;border-bottom:1px solid #444;">' + item + '</div>';
			});
			featuresList.innerHTML = html;
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
					var timeUntil = MOD.getTimeUntilAfford(bld.price);
					MOD.setAttributeIfChanged(productEl, 'aria-label', 'Mystery building. Cost: ' + cost + ' cookies. Time until affordable: ' + timeUntil);
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
	// MODULE: Enhanced Pantheon
	// ============================================
	createEnhancedPantheonPanel: function() {
		var MOD = this;
		if (!MOD.pantheonReady()) return;
		var pan = Game.Objects['Temple'].minigame;
		var oldPanel = l('a11yPantheonPanel');
		if (oldPanel) oldPanel.remove();
		// Find pantheon container
		var panContainer = l('row6minigame');
		if (!panContainer || panContainer.style.display === 'none') return;
		var panel = document.createElement('div');
		panel.id = 'a11yPantheonPanel';
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', 'Pantheon Controls');
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #a6a;padding:10px;margin:10px 0;';
		// Title with worship swaps
		var swaps = pan.swaps || 0;
		var heading = document.createElement('h3');
		heading.textContent = 'Pantheon - ' + swaps + ' Worship Swap' + (swaps !== 1 ? 's' : '') + ' available';
		heading.style.cssText = 'color:#a6f;margin:0 0 10px 0;font-size:14px;';
		panel.appendChild(heading);
		var slots = ['Diamond', 'Ruby', 'Jade'];
		var slotMultipliers = [100, 50, 25]; // Effect percentages
		// Create slot sections
		for (var i = 0; i < 3; i++) {
			var slotDiv = document.createElement('div');
			slotDiv.style.cssText = 'margin:10px 0;padding:10px;background:#222;border:1px solid #666;';
			var slotHeading = document.createElement('h4');
			slotHeading.style.cssText = 'color:#fc0;margin:0 0 5px 0;font-size:13px;';
			var spiritId = pan.slot[i];
			if (spiritId !== -1 && pan.gods[spiritId]) {
				var god = pan.gods[spiritId];
				slotHeading.textContent = slots[i] + ' Slot: ' + god.name;
				// Show spirit effect
				var effectDiv = document.createElement('div');
				effectDiv.style.cssText = 'color:#ccc;font-size:12px;margin:5px 0;';
				var descKey = 'desc' + (i + 1);
				effectDiv.textContent = 'Effect (' + slotMultipliers[i] + '%): ' + MOD.stripHtml(god[descKey] || god.desc1 || '');
				slotDiv.appendChild(slotHeading);
				slotDiv.appendChild(effectDiv);
				// Clear button
				var clearBtn = document.createElement('button');
				clearBtn.type = 'button';
				clearBtn.textContent = 'Remove ' + god.name;
				clearBtn.style.cssText = 'padding:5px 10px;background:#633;border:1px solid #966;color:#fff;cursor:pointer;margin-top:5px;';
				(function(slotIdx, godObj) {
					clearBtn.addEventListener('click', function() {
						pan.slotGod(godObj, -1);
						MOD.announce(godObj.name + ' removed from ' + slots[slotIdx] + ' slot');
						MOD.createEnhancedPantheonPanel();
						MOD.enhancePantheonMinigame();
					});
				})(i, god);
				slotDiv.appendChild(clearBtn);
			} else {
				slotHeading.textContent = slots[i] + ' Slot: Empty';
				slotDiv.appendChild(slotHeading);
			}
			panel.appendChild(slotDiv);
		}
		// Spirit selection section
		var spiritHeading = document.createElement('h4');
		spiritHeading.textContent = 'Available Spirits:';
		spiritHeading.style.cssText = 'color:#fc0;margin:15px 0 10px 0;font-size:13px;';
		panel.appendChild(spiritHeading);
		for (var id in pan.gods) {
			var god = pan.gods[id];
			var inSlot = pan.slot.indexOf(parseInt(id));
			if (inSlot >= 0) continue; // Skip if already slotted
			var spiritDiv = document.createElement('div');
			spiritDiv.style.cssText = 'margin:5px 0;padding:8px;background:#333;border:1px solid #555;';
			var spiritName = document.createElement('strong');
			spiritName.textContent = god.name;
			spiritName.style.color = '#fff';
			spiritDiv.appendChild(spiritName);
			var spiritDesc = document.createElement('div');
			spiritDesc.textContent = MOD.stripHtml(god.desc1 || '');
			spiritDesc.style.cssText = 'color:#aaa;font-size:11px;margin:3px 0;';
			spiritDiv.appendChild(spiritDesc);
			// Slot buttons
			var btnContainer = document.createElement('div');
			btnContainer.style.marginTop = '5px';
			for (var s = 0; s < 3; s++) {
				(function(slotIdx, godObj) {
					var slotBtn = document.createElement('button');
					slotBtn.type = 'button';
					slotBtn.textContent = slots[slotIdx].charAt(0);
					slotBtn.setAttribute('aria-label', 'Place ' + godObj.name + ' in ' + slots[slotIdx] + ' slot');
					slotBtn.style.cssText = 'padding:5px 10px;margin:2px;background:#363;border:1px solid #6a6;color:#fff;cursor:pointer;';
					slotBtn.addEventListener('click', function() {
						pan.slotGod(godObj, slotIdx);
						MOD.announce(godObj.name + ' placed in ' + slots[slotIdx] + ' slot');
						MOD.createEnhancedPantheonPanel();
						MOD.enhancePantheonMinigame();
					});
					btnContainer.appendChild(slotBtn);
				})(s, god);
			}
			spiritDiv.appendChild(btnContainer);
			panel.appendChild(spiritDiv);
		}
		panContainer.parentNode.insertBefore(panel, panContainer.nextSibling);
	},

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
		// Consolidated into labelAllStatsCrates - no longer needed separately
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
		// Create Cookies per Click display only
		var oldCpc = l('a11yCpcDisplay');
		if (oldCpc) oldCpc.remove();
		var cpcDiv = document.createElement('div');
		cpcDiv.id = 'a11yCpcDisplay';
		cpcDiv.setAttribute('tabindex', '0');
		cpcDiv.textContent = 'Cookies per click: Loading...';
		cpcDiv.setAttribute('aria-label', 'Cookies per click: Loading...');
		cpcDiv.style.cssText = 'background:#1a1a1a;color:#fff;padding:8px;margin:5px;text-align:center;border:1px solid #444;font-size:12px;';
		bigCookie.parentNode.insertBefore(cpcDiv, bigCookie.nextSibling);
		// Create Milk progress display
		var oldMilk = l('a11yMilkDisplay');
		if (oldMilk) oldMilk.remove();
		var milkDiv = document.createElement('div');
		milkDiv.id = 'a11yMilkDisplay';
		milkDiv.setAttribute('tabindex', '0');
		milkDiv.textContent = 'Milk: Loading...';
		milkDiv.setAttribute('aria-label', 'Milk progress: Loading...');
		milkDiv.style.cssText = 'background:#1a1a1a;color:#fff;padding:8px;margin:5px;text-align:center;border:1px solid #444;font-size:12px;';
		cpcDiv.parentNode.insertBefore(milkDiv, cpcDiv.nextSibling);
		// Create Milk selector button (in sectionLeft, below milk display, above dragon button)
		var oldMilkBtn = l('a11yMilkSelectorButton');
		if (oldMilkBtn) oldMilkBtn.remove();
		var milkBtn = document.createElement('button');
		milkBtn.type = 'button';
		milkBtn.id = 'a11yMilkSelectorButton';
		milkBtn.setAttribute('role', 'button');
		milkBtn.setAttribute('tabindex', '0');
		milkBtn.style.cssText = 'display:none;width:calc(100% - 10px);padding:8px;margin:5px;background:#336;border:1px solid #66a;color:#fff;cursor:pointer;font-size:12px;text-align:center;position:relative;z-index:50;';
		milkBtn.addEventListener('click', function() {
			var milkUpg = Game.Upgrades['Milk selector'];
			if (milkUpg) milkUpg.buy();
		});
		// Insert into sectionLeft directly (not inside cookieAnchor which is absolutely positioned)
		var sectionLeft = l('sectionLeft');
		if (sectionLeft) {
			// Insert before sectionLeftExtra (which is after cookieAnchor)
			var sectionLeftExtra = l('sectionLeftExtra');
			if (sectionLeftExtra) {
				sectionLeft.insertBefore(milkBtn, sectionLeftExtra);
			} else {
				sectionLeft.appendChild(milkBtn);
			}
		}
		// Set initial label and visibility
		var milkSelectorUpg = Game.Upgrades['Milk selector'];
		if (milkSelectorUpg && milkSelectorUpg.unlocked) {
			milkBtn.style.display = '';
			MOD.updateMilkLabel();
		} else {
			milkBtn.textContent = 'Milk selector';
			milkBtn.setAttribute('aria-label', 'Milk selector');
		}
		// Label mystery elements in the left column
		MOD.labelMysteryElements();
	},
	labelMysteryElements: function() {
		var MOD = this;
		// Label building rows in the left section (these have level buttons)
		MOD.labelBuildingRows();
		// The cookies counter display - do NOT use role="status" as it causes constant announcements
		var cookiesDiv = l('cookies');
		if (cookiesDiv) {
			cookiesDiv.setAttribute('tabindex', '0');
			cookiesDiv.setAttribute('aria-label', 'Cookie count (tab here to check current cookies)');
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
					child.setAttribute('tabindex', '0');
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
					el.setAttribute('tabindex', '-1');
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
				el.setAttribute('tabindex', '-1');
			}
		});
		// Label menu buttons area
		var menuButtons = document.querySelectorAll('#prefsButton, #statsButton, #logButton');
		menuButtons.forEach(function(btn) {
			btn.setAttribute('tabindex', '0');
		});
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
				origCursorLevel.setAttribute('tabindex', '-1');
			}
			var origCursorMgBtn = l('productMinigameButton0');
			if (origCursorMgBtn) {
				origCursorMgBtn.setAttribute('aria-hidden', 'true');
				origCursorMgBtn.setAttribute('tabindex', '-1');
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
				// Label the main row
				var rowLabel = bld.name + ' building row. Level ' + level + '.';
				if (minigameUnlocked && minigameName) rowLabel += ' Has ' + minigameName + ' minigame.';
				MOD.setAttributeIfChanged(rowEl, 'aria-label', rowLabel);
				// Find and label clickable elements within the row
				rowEl.querySelectorAll('div[onclick], .rowSpecial, .rowCanvas').forEach(function(el) {
					var onclick = el.getAttribute('onclick') || '';
					if (onclick.includes('levelUp') || onclick.includes('Level')) {
						MOD.setAttributeIfChanged(el, 'aria-label', MOD.getBuildingLevelLabel(bld));
						el.setAttribute('role', 'button');
						el.setAttribute('tabindex', '0');
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
						el.setAttribute('role', 'button');
						el.setAttribute('tabindex', '0');
					} else if (onclick.includes('Mute')) {
						MOD.setAttributeIfChanged(el, 'aria-label', 'Mute ' + bld.name);
						el.setAttribute('role', 'button');
						el.setAttribute('tabindex', '0');
					}
				});
				// Also check for .level elements in the row
				var levelEl = rowEl.querySelector('.level, .objectLevel');
				if (levelEl) {
					MOD.setAttributeIfChanged(levelEl, 'aria-label', MOD.getBuildingLevelLabel(bld));
					levelEl.setAttribute('role', 'button');
					levelEl.setAttribute('tabindex', '0');
				}
			}
			// Also label the productLevel button in the right section (this is the main level upgrade button)
			var productLevelEl = l('productLevel' + bld.id);
			if (productLevelEl) {
				MOD.setAttributeIfChanged(productLevelEl, 'aria-label', MOD.getBuildingLevelLabel(bld));
				productLevelEl.setAttribute('role', 'button');
				productLevelEl.setAttribute('tabindex', '0');
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
					productMgBtn.setAttribute('role', 'button');
					productMgBtn.setAttribute('tabindex', '0');
				} else {
					productMgBtn.setAttribute('aria-hidden', 'true');
					productMgBtn.setAttribute('tabindex', '-1');
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
							el.setAttribute('role', 'button');
							el.setAttribute('tabindex', '0');
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
		// Update Milk display
		MOD.updateMilkDisplay();
	},

	// ============================================
	// Statistics Menu - Upgrades & Achievements Labels
	// ============================================
	labelStatsUpgradesAndAchievements: function() {
		var MOD = this;
		MOD.labelStatsUpgrades();
		MOD.labelStatsAchievements();
	},
	labelStatsUpgrades: function() {
		var MOD = this;
		// Label tech upgrades if visible (store upgrades are handled by populateUpgradeLabel)
		var techDiv = l('techUpgrades');
		if (techDiv) {
			techDiv.querySelectorAll('.crate.upgrade').forEach(function(crate) {
				MOD.labelStatsCrate(crate);
			});
		}
	},
	labelStatsCrate: function(crate) {
		var MOD = this;
		if (!crate) return;
		// Try to get upgrade from onclick attribute
		var onclick = crate.getAttribute('onclick') || '';
		var match = onclick.match(/Game\.UpgradesById\[(\d+)\]/);
		if (!match) return;
		var upgradeId = parseInt(match[1]);
		var upgrade = Game.UpgradesById[upgradeId];
		if (!upgrade) return;
		// Skip debug upgrades entirely
		if (upgrade.pool === 'debug') {
			crate.style.display = 'none';
			return;
		}
		// Statistics menu only shows owned upgrades, so just label them
		var name = upgrade.dname || upgrade.name;
		var desc = MOD.stripHtml(upgrade.desc || '');
		var lbl = name + '. ' + desc;
		crate.setAttribute('aria-label', lbl);
		crate.setAttribute('role', 'button');
		crate.setAttribute('tabindex', '0');
		if (!crate.dataset.a11yLabeled) {
			crate.dataset.a11yLabeled = 'true';
			crate.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); crate.click(); }
			});
		}
	},
	labelStatsAchievements: function() {
		// Consolidated into labelAllStatsCrates - no longer needed separately
	},
	labelStatsScreen: function() {
		var MOD = this;
		if (Game.onMenu !== 'stats') return;
		MOD.labelStatsUpgrades();
		MOD.labelStatsAchievements();
		// Label section headers
		document.querySelectorAll('.section .title').forEach(function(title) {
			var section = title.closest('.section');
			if (section && !section.getAttribute('role')) {
				section.setAttribute('role', 'region');
				section.setAttribute('aria-label', title.textContent);
			}
		});
	},
	labelStatsHeavenly: function() {
		var MOD = this;
		if (!Game.OnAscend) return;
		// Add heavenly chips display if not present
		MOD.addHeavenlyChipsDisplay();
		// Label heavenly upgrades on ascension screen - show names and costs for shopping
		document.querySelectorAll('.crate').forEach(function(crate) {
			var onclick = crate.getAttribute('onclick') || '';
			var match = onclick.match(/Game\.UpgradesById\[(\d+)\]/);
			if (!match) return;
			var upgradeId = parseInt(match[1]);
			var upgrade = Game.UpgradesById[upgradeId];
			if (!upgrade) return;
			// Skip non-prestige and debug upgrades
			if (upgrade.pool === 'debug') {
				crate.style.display = 'none';
				return;
			}
			if (upgrade.pool !== 'prestige') return;
			// Ascension menu - show name and cost so player can shop
			var name = upgrade.dname || upgrade.name;
			var lbl = '';
			if (upgrade.bought) {
				lbl = name + '. Owned.';
			} else {
				var price = upgrade.getPrice ? upgrade.getPrice() : upgrade.basePrice;
				lbl = name + '. Cost: ' + Beautify(price) + ' heavenly chips.';
			}
			crate.setAttribute('aria-label', lbl);
			crate.setAttribute('role', 'button');
			crate.setAttribute('tabindex', '0');
			if (!crate.dataset.a11yLabeled) {
				crate.dataset.a11yLabeled = 'true';
				crate.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); crate.click(); }
				});
			}
		});
	},
	addHeavenlyChipsDisplay: function() {
		var MOD = this;
		if (!Game.OnAscend) return;
		var displayId = 'a11yHeavenlyChipsDisplay';
		var existing = l(displayId);
		var chips = Beautify(Game.heavenlyChips);
		var text = 'Heavenly Chips: ' + chips;
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
