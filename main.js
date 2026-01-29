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
		// Shimmer tracking - announce once on appear and once when fading
		this.announcedShimmers = {}; // Track shimmers we've announced appearing
		this.fadingShimmers = {}; // Track shimmers we've announced as fading
		this.shimmerButtons = {}; // Track shimmer buttons by ID
		// Wrinkler tracking - announce once on spawn
		this.announcedWrinklers = {}; // Track wrinklers we've announced spawning
		// Override Game.DrawBuildings to inject accessibility labels
		MOD.overrideDrawBuildings();
		// Track if we've announced the fix
		MOD.announcedFix = false;
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
			// Also refresh again shortly after in case store updates
			setTimeout(function() { MOD.enhanceUpgradeShop(); }, 100);
			setTimeout(function() { MOD.enhanceUpgradeShop(); }, 500);
		});
		// Also track store refresh flag
		MOD.lastStoreRefresh = Game.storeToRefresh;
		Game.registerHook('reset', function(hard) {
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
		Game.Notify('Accessibility Enhanced', 'Version 11.7 - Bulk pricing, News heading, buff list fixes.', [10, 0], 6);
		this.announce('NVDA Accessibility mod version 11.7 loaded.');
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
		// Loop through all buildings
		for (var i in Game.ObjectsById) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			// Get the building's DOM element via bld.l
			var bldEl = bld.l;
			if (!bldEl) continue;
			var bldName = bld.name || 'Building';
			var mg = bld.minigame;
			var mgName = mg ? mg.name : '';
			var level = parseInt(bld.level) || 0;
			var lumpCost = level + 1;
			var costText = (typeof Game.sayLumps === 'function') ? Game.sayLumps(lumpCost) : lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : '');
			// Construct the full label - always show level if > 0
			var fullLabel = bldName;
			if (level > 0) {
				fullLabel += ', Level ' + level;
			}
			if (mg && mgName) {
				fullLabel += ' (' + mgName + ')';
			}
			if (level > 0) {
				fullLabel += '. Upgrade cost: ' + costText;
			}
			// Apply label to the building's main container
			bldEl.setAttribute('aria-label', fullLabel);
			// Find and label the level div within the building row
			var levelDiv = bldEl.querySelector('.level, .objectLevel, [class*="evel"]');
			if (levelDiv) {
				levelDiv.setAttribute('aria-label', fullLabel);
				levelDiv.setAttribute('role', 'button');
				levelDiv.setAttribute('tabindex', '0');
			}
			// Find the mute button and label it
			var muteBtn = bldEl.querySelector('.objectMute, [onclick*="Mute"], [class*="mute"]');
			if (muteBtn) {
				muteBtn.setAttribute('aria-label', 'Mute ' + bldName);
				muteBtn.setAttribute('role', 'button');
				muteBtn.setAttribute('tabindex', '0');
			}
			// Find the minigame/view button and label it based on level
			var mgBtn = bldEl.querySelector('.objectMinigame, [onclick*="minigame"], [onclick*="switchMinigame"]');
			if (mgBtn) {
				// Check if minigame is unlocked (level >= 1) and has a minigame
				var hasMinigame = bld.minigameUrl || bld.minigameName;
				var minigameUnlocked = level >= 1 && hasMinigame;

				if (minigameUnlocked && mg) {
					// Minigame is unlocked and loaded - check open/close state using onMinigame flag
					var isOpen = bld.onMinigame ? true : false;
					mgBtn.setAttribute('aria-label', (isOpen ? 'Close ' : 'Open ') + mgName);
				} else if (minigameUnlocked) {
					// Minigame unlocked but object not loaded yet
					mgBtn.setAttribute('aria-label', 'Open ' + (mgName || bld.minigameName || 'minigame'));
				} else if (hasMinigame && level < 1) {
					// Has minigame but not unlocked yet
					mgBtn.setAttribute('aria-label', 'Level up ' + bldName + ' to unlock ' + (mgName || bld.minigameName || 'minigame') + ' (1 sugar lump)');
				}
				mgBtn.setAttribute('role', 'button');
				mgBtn.setAttribute('tabindex', '0');
			}
			// Debug: Log Wizard Tower specifically
			if (bldName === 'Wizard tower') {
				console.log('[A11y Mod] Labeled Wizard tower: ' + fullLabel + ', Level: ' + level + ', Minigame: ' + (mg ? 'Yes' : 'No'));
			}
		}
		// Also label Special Tabs
		MOD.labelSpecialTabs();
	},
	labelSpecialTabs: function() {
		var MOD = this;
		// Label Special Tabs (Dragon, Santa, etc.) - these sit between Sugar Lumps and Store
		if (Game.SpecialTabs) {
			for (var i = 0; i < Game.SpecialTabs.length; i++) {
				var tabName = Game.SpecialTabs[i];
				var tabEl = l('specialTab' + tabName) || l(tabName + 'Tab') || l(tabName);
				if (!tabEl) continue;
				var label = '';
				if (tabName === 'dragon' || tabName === 'Dragon') {
					label = 'Krumblor the Dragon';
				} else if (tabName === 'santa' || tabName === 'Santa') {
					label = "Santa's Progress";
				} else {
					label = tabName + ' tab';
				}
				tabEl.setAttribute('aria-label', label);
				tabEl.setAttribute('role', 'button');
				tabEl.setAttribute('tabindex', '0');
			}
		}
		// Also check for dragon/santa buttons directly in the DOM
		var dragonBtn = l('specialTab0') || document.querySelector('[onclick*="dragon"], [onclick*="Dragon"], .dragonButton');
		if (dragonBtn) {
			dragonBtn.setAttribute('aria-label', 'Krumblor the Dragon');
			dragonBtn.setAttribute('role', 'button');
			dragonBtn.setAttribute('tabindex', '0');
		}
		var santaBtn = l('specialTab1') || document.querySelector('[onclick*="santa"], [onclick*="Santa"], .santaButton');
		if (santaBtn) {
			santaBtn.setAttribute('aria-label', "Santa's Progress");
			santaBtn.setAttribute('role', 'button');
			santaBtn.setAttribute('tabindex', '0');
		}
		// Label any other special tab buttons in the special section
		var specialSection = l('specialPopup') || l('specials') || document.querySelector('.specialSection, #specials');
		if (specialSection) {
			specialSection.querySelectorAll('[onclick]').forEach(function(btn) {
				if (!btn.getAttribute('aria-label')) {
					var onclickStr = btn.getAttribute('onclick') || '';
					if (onclickStr.includes('dragon') || onclickStr.includes('Dragon')) {
						btn.setAttribute('aria-label', 'Krumblor the Dragon');
					} else if (onclickStr.includes('santa') || onclickStr.includes('Santa')) {
						btn.setAttribute('aria-label', "Santa's Progress");
					} else if (onclickStr.includes('season') || onclickStr.includes('Season')) {
						btn.setAttribute('aria-label', 'Season Switcher');
					}
					btn.setAttribute('role', 'button');
					btn.setAttribute('tabindex', '0');
				}
			});
		}
		// Find special tabs in the row between sugar lumps and store
		document.querySelectorAll('.row.specialTabButton, .specialTabButton, [id^="specialTab"]').forEach(function(tab) {
			if (!tab.getAttribute('aria-label')) {
				var text = tab.textContent || tab.innerText || '';
				var onclickStr = tab.getAttribute('onclick') || '';
				if (text.includes('Krumblor') || onclickStr.includes('dragon')) {
					tab.setAttribute('aria-label', 'Krumblor the Dragon');
				} else if (text.includes('Santa') || onclickStr.includes('santa')) {
					tab.setAttribute('aria-label', "Santa's Progress");
				} else if (text) {
					tab.setAttribute('aria-label', text.trim());
				}
				tab.setAttribute('role', 'button');
				tab.setAttribute('tabindex', '0');
			}
		});
		// One-time aria-live confirmation
		if (!MOD.announcedFix) {
			MOD.announcedFix = true;
			MOD.announce('NVDA Accessibility mod loaded successfully.');
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
			var oldBtnContainer = l('wrinklerButtonContainer');
			if (oldBtnContainer) oldBtnContainer.remove();
			var oldNoWrinklersMsg = l('a11yNoWrinklersMsg');
			if (oldNoWrinklersMsg) oldNoWrinklersMsg.remove();
		}
		// Create "no wrinklers" message
		var noWrinklersMsg = document.createElement('div');
		noWrinklersMsg.id = 'a11yNoWrinklersMsg';
		noWrinklersMsg.setAttribute('tabindex', '0');
		noWrinklersMsg.style.cssText = 'padding:8px;color:#ccc;font-size:12px;';
		noWrinklersMsg.textContent = 'No wrinklers present.';
		c.appendChild(noWrinklersMsg);
		// Create button container
		var btnContainer = document.createElement('div');
		btnContainer.id = 'wrinklerButtonContainer';
		btnContainer.setAttribute('role', 'list');
		btnContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
		c.appendChild(btnContainer);

		for (var i = 0; i < 12; i++) {
			var btn = document.createElement('button');
			btn.id = 'wrinklerOverlay' + i;
			btn.setAttribute('role', 'listitem');
			btn.setAttribute('tabindex', '0');
			btn.style.cssText = 'padding:8px 12px;background:#1a1a1a;color:#fff;border:1px solid #666;cursor:pointer;font-size:12px;';
			btn.setAttribute('aria-label', 'Wrinkler slot ' + (i + 1) + ': Empty');
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
			btnContainer.appendChild(btn);
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
				o.setAttribute('aria-label', t + 'Wrinkler ' + (i + 1) + ': ' + s + ' cookies sucked. Click to pop.');
				o.style.display = 'inline-block';

				// Announce new wrinkler spawn (only once per wrinkler)
				if (!MOD.announcedWrinklers[i]) {
					MOD.announcedWrinklers[i] = true;
					var wrinklerType = w.type === 1 ? 'A shiny wrinkler' : 'A wrinkler';
					MOD.announceUrgent(wrinklerType + ' has appeared!');
				}
			} else {
				o.setAttribute('aria-label', 'Wrinkler slot ' + (i + 1) + ': Empty');
				o.style.display = 'none';
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
		heading.textContent = 'Active Shimmers';
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
		var popup = l('specialPopup');
		if (!popup) return;
		// Label option buttons
		popup.querySelectorAll('.option').forEach(function(b) {
			b.setAttribute('role', 'button');
			b.setAttribute('tabindex', '0');
			if (!b.dataset.a11yEnhanced) {
				b.dataset.a11yEnhanced = 'true';
				b.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
				});
			}
		});
		// Pet dragon button
		var petBtn = popup.querySelector('[onclick*="PetDragon"]');
		if (petBtn) {
			petBtn.setAttribute('aria-label', 'Pet Krumblor');
			petBtn.setAttribute('role', 'button');
			petBtn.setAttribute('tabindex', '0');
			if (!petBtn.dataset.a11yEnhanced) {
				petBtn.dataset.a11yEnhanced = 'true';
				petBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); petBtn.click(); }
				});
			}
		}
		// Upgrade dragon button
		var upgradeBtn = popup.querySelector('[onclick*="UpgradeDragon"]');
		if (upgradeBtn) {
			var level = Game.dragonLevel || 0;
			var lbl = 'Upgrade Krumblor. Current level: ' + level + '.';
			upgradeBtn.setAttribute('aria-label', lbl);
			upgradeBtn.setAttribute('role', 'button');
			upgradeBtn.setAttribute('tabindex', '0');
			if (!upgradeBtn.dataset.a11yEnhanced) {
				upgradeBtn.dataset.a11yEnhanced = 'true';
				upgradeBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); upgradeBtn.click(); }
				});
			}
		}
		// Dragon aura slots - add click-based selection
		MOD.enhanceDragonAuraSlots(popup);
	},
	enhanceDragonAuraSlots: function(popup) {
		var MOD = this;
		if (!popup) return;
		// Find aura slots
		var auraSlots = popup.querySelectorAll('.crate.enabled[onclick*="DragonAura"], .dragonAuraSlot, [id*="dragonAura"]');
		auraSlots.forEach(function(slot, idx) {
			var slotNum = idx;
			var currentAura = slotNum === 0 ? Game.dragonAura : Game.dragonAura2;
			var auraName = (Game.dragonAuraNames && Game.dragonAuraNames[currentAura]) || 'None';
			var lbl = 'Dragon Aura slot ' + (slotNum + 1) + ': ' + auraName + '. Click to change.';
			slot.setAttribute('aria-label', lbl);
			slot.setAttribute('role', 'button');
			slot.setAttribute('tabindex', '0');
			if (!slot.dataset.a11yAuraEnhanced) {
				slot.dataset.a11yAuraEnhanced = 'true';
				slot.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						MOD.showDragonAuraDialog(slotNum);
					}
				});
				slot.addEventListener('click', function(e) {
					if (e.isTrusted) {
						e.preventDefault();
						e.stopPropagation();
						MOD.showDragonAuraDialog(slotNum);
					}
				}, true);
			}
		});
	},
	showDragonAuraDialog: function(slotIndex) {
		var MOD = this;
		// Remove existing dialog
		var existing = l('a11yDragonAuraDialog');
		if (existing) existing.remove();
		// Get available auras
		var auras = [];
		if (Game.dragonAuraNames) {
			for (var i = 0; i < Game.dragonAuraNames.length; i++) {
				if (Game.dragonAuraNames[i]) {
					auras.push({ id: i, name: Game.dragonAuraNames[i] });
				}
			}
		}
		// Create dialog
		var dialog = document.createElement('div');
		dialog.id = 'a11yDragonAuraDialog';
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('aria-label', 'Select Dragon Aura for slot ' + (slotIndex + 1));
		dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;border:3px solid #c90;padding:20px;z-index:100000000;max-height:80vh;overflow-y:auto;min-width:400px;color:#fff;font-family:Merriweather,Georgia,serif;';
		// Title
		var title = document.createElement('h2');
		title.textContent = 'Select Aura for Slot ' + (slotIndex + 1);
		title.style.cssText = 'margin:0 0 15px 0;color:#fc0;';
		dialog.appendChild(title);
		// Aura list
		var list = document.createElement('div');
		list.setAttribute('role', 'listbox');
		list.style.cssText = 'max-height:300px;overflow-y:auto;';
		auras.forEach(function(aura) {
			var btn = document.createElement('button');
			btn.textContent = aura.name;
			btn.setAttribute('role', 'option');
			btn.setAttribute('aria-label', aura.name);
			btn.style.cssText = 'display:block;width:100%;padding:10px;margin:2px 0;background:#333;border:1px solid #666;color:#fff;cursor:pointer;text-align:left;font-size:14px;';
			btn.addEventListener('click', function() {
				if (slotIndex === 0) {
					Game.dragonAura = aura.id;
				} else {
					Game.dragonAura2 = aura.id;
				}
				MOD.announce(aura.name + ' set as Dragon Aura ' + (slotIndex + 1));
				dialog.remove();
				MOD.enhanceDragonUI();
			});
			btn.addEventListener('keydown', function(e) {
				if (e.key === 'Escape') dialog.remove();
				if (e.key === 'ArrowDown' && btn.nextElementSibling) btn.nextElementSibling.focus();
				if (e.key === 'ArrowUp' && btn.previousElementSibling) btn.previousElementSibling.focus();
			});
			list.appendChild(btn);
		});
		dialog.appendChild(list);
		// Cancel button
		var cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Cancel';
		cancelBtn.style.cssText = 'display:block;width:100%;padding:10px;margin-top:10px;background:#600;border:2px solid #900;color:#fff;cursor:pointer;';
		cancelBtn.addEventListener('click', function() { dialog.remove(); });
		cancelBtn.addEventListener('keydown', function(e) { if (e.key === 'Escape') dialog.remove(); });
		dialog.appendChild(cancelBtn);
		document.body.appendChild(dialog);
		// Focus first aura
		var firstBtn = list.querySelector('button');
		if (firstBtn) firstBtn.focus();
		MOD.announce('Dragon Aura selection dialog opened. ' + auras.length + ' auras available.');
	},
	updateDragonLabels: function() {
		this.enhanceDragonUI();
	},
	enhanceSantaUI: function() {
		var MOD = this;
		// Santa panel appears in specialPopup when opened
		var popup = l('specialPopup');
		if (!popup) return;
		// Look for Santa content
		var santaContent = popup.querySelector('.santaLevel, [onclick*="PetSanta"], [onclick*="UpgradeSanta"]');
		if (!santaContent) return;
		// Label the pet santa button
		var petBtn = popup.querySelector('[onclick*="PetSanta"]');
		if (petBtn) {
			petBtn.setAttribute('aria-label', 'Pet Santa');
			petBtn.setAttribute('role', 'button');
			petBtn.setAttribute('tabindex', '0');
			if (!petBtn.dataset.a11yEnhanced) {
				petBtn.dataset.a11yEnhanced = 'true';
				petBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); petBtn.click(); }
				});
			}
		}
		// Label the upgrade santa button
		var upgradeBtn = popup.querySelector('[onclick*="UpgradeSanta"]');
		if (upgradeBtn) {
			var level = Game.santaLevel || 0;
			var maxLevel = 14;
			var lbl = 'Upgrade Santa. Current level: ' + level + ' of ' + maxLevel + '.';
			if (level < maxLevel) {
				lbl += ' Click to upgrade.';
			} else {
				lbl += ' Maximum level reached.';
			}
			upgradeBtn.setAttribute('aria-label', lbl);
			upgradeBtn.setAttribute('role', 'button');
			upgradeBtn.setAttribute('tabindex', '0');
			if (!upgradeBtn.dataset.a11yEnhanced) {
				upgradeBtn.dataset.a11yEnhanced = 'true';
				upgradeBtn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); upgradeBtn.click(); }
				});
			}
		}
		// Label any option buttons
		popup.querySelectorAll('.option').forEach(function(opt) {
			opt.setAttribute('role', 'button');
			opt.setAttribute('tabindex', '0');
			if (!opt.dataset.a11yEnhanced) {
				opt.dataset.a11yEnhanced = 'true';
				opt.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opt.click(); }
				});
			}
		});
	},
	updateSantaLabels: function() {
		this.enhanceSantaUI();
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
				var r = orig.call(this, me);
				var variant = MOD.getShimmerVariantName(me);
				if (me.lastPopText) {
					MOD.announceUrgent(variant + ' clicked! ' + MOD.stripHtml(me.lastPopText));
				} else {
					MOD.announceUrgent(variant + ' clicked!');
				}
				return r;
			};
		}
		if (Game.shimmerTypes && Game.shimmerTypes.reindeer) {
			var origR = Game.shimmerTypes.reindeer.popFunc;
			Game.shimmerTypes.reindeer.popFunc = function(me) {
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
	 * Announces once when appearing, once when fading (2 seconds before disappearing)
	 */
	trackShimmerAnnouncements: function() {
		var MOD = this;
		if (!Game.shimmers) return;

		var currentShimmerIds = {};
		var FADE_WARNING_FRAMES = 150; // 5 seconds at 30fps

		// Process each active shimmer
		Game.shimmers.forEach(function(shimmer) {
			var id = shimmer.id;
			currentShimmerIds[id] = true;

			// Get variant name
			var variant = MOD.getShimmerVariantName(shimmer);

			// Announce appearance (only once per shimmer)
			if (!MOD.announcedShimmers[id]) {
				MOD.announcedShimmers[id] = true;
				MOD.announceUrgent('A ' + variant + ' has appeared!');
			}

			// Check if fading (5 seconds before disappearing)
			// shimmer.life is remaining life in frames, shimmer.dur is total duration
			if (shimmer.life !== undefined && shimmer.life <= FADE_WARNING_FRAMES) {
				if (!MOD.fadingShimmers[id]) {
					MOD.fadingShimmers[id] = true;
					MOD.announceUrgent(variant + ' is fading!');
				}
			}
		});

		// Clean up tracking for shimmers that no longer exist
		for (var id in MOD.announcedShimmers) {
			if (!currentShimmerIds[id]) {
				delete MOD.announcedShimmers[id];
				delete MOD.fadingShimmers[id];
			}
		}

		// Update shimmer buttons
		MOD.updateShimmerButtons();
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
		// Force aria-label onto the parent row container
		var rowContainer = bldEl.closest('.row') || bldEl;
		// If minigame exists and is active
		if (mg) {
			var level = mg.level || 0;
			var lumpCost = level + 1;
			var costText = lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : '');
			// Build full label for the row
			var fullLabel = bldName + ' (' + mgName + '), Level ' + level + ', Cost to upgrade: ' + costText;
			// Apply to row container
			rowContainer.setAttribute('aria-label', fullLabel);
			// Find ALL clickable divs with onclick but no text content
			bldEl.querySelectorAll('div[onclick]').forEach(function(clickDiv) {
				var text = (clickDiv.textContent || '').trim();
				var onclickStr = clickDiv.getAttribute('onclick') || '';
				// Force re-label every time (don't check a11yEnhanced for labels)
				if (!text || text.match(/^[\d\s]*$/)) {
					// No meaningful text - determine what this button does
					var labelSet = false;
					if (onclickStr.includes('Mute') || onclickStr.includes('mute') || clickDiv.classList.contains('objectMute')) {
						clickDiv.setAttribute('aria-label', 'Mute ' + bldName);
						labelSet = true;
					} else if (onclickStr.includes('minigame') || onclickStr.includes('Minigame')) {
						clickDiv.setAttribute('aria-label', 'Open ' + mgName);
						labelSet = true;
					} else if (onclickStr.includes('level') || onclickStr.includes('Level') || onclickStr.includes('lump')) {
						clickDiv.setAttribute('aria-label', bldName + ' (' + mgName + '), Level ' + level + ', Cost to upgrade: ' + costText);
						labelSet = true;
					}
					// Only make focusable if we set a label
					if (labelSet) {
						clickDiv.setAttribute('role', 'button');
						clickDiv.setAttribute('tabindex', '0');
					}
				}
			});
			// Also check for the specific level element
			var levelEl = bldEl.querySelector('.label');
			if (levelEl) {
				levelEl.setAttribute('aria-label', bldName + ' (' + mgName + '), Level ' + level + ', Cost to upgrade: ' + costText);
				levelEl.setAttribute('role', 'button');
				levelEl.setAttribute('tabindex', '0');
			}
			// Debug: Log when we successfully label Wizard Tower
			if (bldName === 'Wizard tower') {
				console.log('[A11y Mod] Successfully labeled Wizard tower (' + mgName + '), Level ' + level);
			}
		} else if (bld.minigameUrl && !bld.minigameLoaded) {
			// Building has a minigame but it's not loaded yet
			bldEl.querySelectorAll('div[onclick]').forEach(function(clickDiv) {
				var onclickStr = clickDiv.getAttribute('onclick') || '';
				if (onclickStr.includes('minigame') || onclickStr.includes('lump')) {
					clickDiv.setAttribute('aria-label', 'Unlock ' + (mgName || 'minigame') + ' for 1 sugar lump');
					clickDiv.setAttribute('role', 'button');
					clickDiv.setAttribute('tabindex', '0');
				}
			});
		}
		// Handle mute button specifically using bld.muteL
		if (bld.muteL) {
			bld.muteL.setAttribute('aria-label', 'Mute ' + bldName);
			bld.muteL.setAttribute('role', 'button');
			bld.muteL.setAttribute('tabindex', '0');
		}
	},
	enhanceStoreControls: function() {
		var MOD = this;
		// Buy/Sell toggles
		var storeBulkBuy = l('storeBulkBuy');
		var storeBulkSell = l('storeBulkSell');
		if (storeBulkBuy) {
			storeBulkBuy.setAttribute('aria-label', 'Buy mode - purchase buildings');
			storeBulkBuy.setAttribute('role', 'button');
			storeBulkBuy.setAttribute('tabindex', '0');
			if (!storeBulkBuy.dataset.a11yEnhanced) {
				storeBulkBuy.dataset.a11yEnhanced = 'true';
				storeBulkBuy.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); storeBulkBuy.click(); }
				});
			}
		}
		if (storeBulkSell) {
			storeBulkSell.setAttribute('aria-label', 'Sell mode - sell buildings');
			storeBulkSell.setAttribute('role', 'button');
			storeBulkSell.setAttribute('tabindex', '0');
			if (!storeBulkSell.dataset.a11yEnhanced) {
				storeBulkSell.dataset.a11yEnhanced = 'true';
				storeBulkSell.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); storeBulkSell.click(); }
				});
			}
		}
		// Amount multipliers (1, 10, 100, Max)
		var amounts = [
			{ id: 'storeBulk1', label: 'Buy or sell 1 at a time' },
			{ id: 'storeBulk10', label: 'Buy or sell 10 at a time' },
			{ id: 'storeBulk100', label: 'Buy or sell 100 at a time' },
			{ id: 'storeBulkMax', label: 'Buy maximum amount' }
		];
		amounts.forEach(function(amt) {
			var btn = l(amt.id);
			if (btn) {
				btn.setAttribute('aria-label', amt.label);
				btn.setAttribute('role', 'button');
				btn.setAttribute('tabindex', '0');
				if (!btn.dataset.a11yEnhanced) {
					btn.dataset.a11yEnhanced = 'true';
					btn.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
					});
				}
			}
		});
	},
	enhanceBuildingProduct: function(el, bld, mgName, mg) {
		var MOD = this;
		if (!el || !bld) return;
		var owned = bld.amount || 0;

		// Determine buy/sell mode and bulk amount
		var isBuyMode = Game.buyMode === 1;
		var bulkAmount = Game.buyBulk;

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
			if (Game.cookies >= price) {
				lbl += ', Affordable';
			} else {
				var timeUntil = MOD.getTimeUntilAfford(price);
				lbl += ', ' + timeUntil;
			}
			if (quantityLabel) {
				lbl += ', ' + actionLabel + ' ' + quantityLabel + ' ' + priceStr;
			} else {
				lbl += ', Cost: ' + priceStr;
			}
			lbl += ', ' + owned + ' owned';
			el.setAttribute('aria-label', lbl);
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
			el.setAttribute('aria-label', lbl);
		}

		el.setAttribute('role', 'button');
		el.setAttribute('tabindex', '0');
		// Add info text (not a button) with building stats below
		MOD.ensureBuildingInfoText(bld);
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
			levelEl.setAttribute('aria-label', bldName + ' - ' + mgName + ' minigame, Level ' + mg.level);
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
			levelUpBtn.setAttribute('aria-label', lbl);
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
			muteBtn.setAttribute('aria-label', muteLbl);
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
			closeBtn.setAttribute('aria-label', 'Close ' + bldName + ' ' + mgName + ' minigame panel');
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
		// Enhance the minigame header first
		MOD.enhanceMinigameHeader(Game.Objects['Farm'], 'Garden', g);
		// Label original garden elements directly
		MOD.labelOriginalGardenElements(g);
		// Note: Garden accessible panel removed - using virtual grid from garden.js instead
	},
	labelOriginalGardenElements: function(g) {
		var MOD = this;
		if (!g) return;

		// Label garden tiles - they use ID format: gardenTile-{x}-{y}
		for (var y = 0; y < 6; y++) {
			for (var x = 0; x < 6; x++) {
				var tile = l('gardenTile-' + x + '-' + y);
				if (!tile) continue;
				var t = g.plot[y] && g.plot[y][x];
				var lbl = 'Row ' + (y+1) + ', column ' + (x+1) + ': ';
				if (t && t[0] > 0) {
					var pl = g.plantsById[t[0] - 1];
					if (pl) {
						var mature = pl.mature || 100;
						var pct = Math.floor((t[1] / mature) * 100);
						lbl += pl.name + ', ' + pct + '% grown';
						if (t[1] >= mature) lbl += ', READY to harvest';
					} else {
						lbl += 'Unknown plant';
					}
				} else {
					lbl += 'Empty';
				}
				tile.setAttribute('aria-label', lbl);
				tile.setAttribute('role', 'button');
				tile.setAttribute('tabindex', '0');
				if (!tile.getAttribute('data-a11y-kb')) {
					tile.setAttribute('data-a11y-kb', '1');
					(function(el) {
						el.addEventListener('keydown', function(e) {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								el.click();
							}
						});
					})(tile);
				}
			}
		}

		// Label garden seeds - they use ID format: gardenSeed-{id}
		for (var seedId in g.plantsById) {
			var plant = g.plantsById[seedId];
			if (!plant) continue;
			var seed = l('gardenSeed-' + seedId);
			if (!seed) continue;
			var isSelected = (g.seedSelected == seedId);
			var lbl = (isSelected ? 'Selected: ' : '') + plant.name;
			if (!plant.unlocked) {
				lbl = 'Locked seed: ' + plant.name;
			} else if (plant.effsStr) {
				lbl += '. ' + MOD.stripHtml(plant.effsStr);
			}
			seed.setAttribute('aria-label', lbl);
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
					lbl = 'Harvest all plants. Click to harvest all mature plants in your garden';
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
					'Harvest all plants',
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
			if (soil.weedMult && soil.weedMult !== 1) effects.push('weeds ' + Math.round(soil.weedMult * 100) + '%');
			if (soil.ageTick && soil.ageTick !== 1) effects.push('growth ' + Math.round(soil.ageTick * 100) + '%');
			if (soil.effMult && soil.effMult !== 1) effects.push('effects ' + Math.round(soil.effMult * 100) + '%');
			if (effects.length > 0) lbl += '. ' + effects.join(', ');
			soilEl.setAttribute('aria-label', lbl);
			soilEl.setAttribute('role', 'button');
			soilEl.setAttribute('tabindex', '0');
			if (!soilEl.getAttribute('data-a11y-kb')) {
				soilEl.setAttribute('data-a11y-kb', '1');
				(function(el, id) {
					el.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							var g = Game.Objects['Farm'].minigame;
							if (g && g.changeSoil) {
								g.changeSoil(id);
							}
						}
					});
				})(soilEl, soil.id);
			}
		}

		// Add section headings to original game elements (only once)
		var headingsToAdd = [
			{ id: 'a11yGardenToolsHeading', text: 'Tools', beforeId: 'gardenTools' },
			{ id: 'a11yGardenSoilHeading', text: 'Soil', beforeId: 'gardenSoil-0' },
			{ id: 'a11yGardenSeedsHeading', text: 'Seeds', beforeId: 'gardenSeedsUnlocked' },
			{ id: 'a11yGardenPlotHeading', text: 'Plot', beforeId: 'gardenPlot' },
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
		panel.setAttribute('role', 'region');
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
			label += info.name + ', READY. Press Enter to harvest';
			btn.style.background = '#3a3a2a';
			btn.style.border = '1px solid #aa4';
			btn.style.color = '#ffa';
		} else {
			label += info.name + ', ' + info.growth + '% grown';
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
		var status = isMature ? 'Mature' : (growthPct < 33 ? 'Budding' : 'Growing');
		return {
			isEmpty: false,
			name: plant.name,
			growth: growthPct,
			status: status,
			isMature: isMature,
			plantId: plantId
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
		panel.setAttribute('role', 'region');
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

		// Header
		var heading = document.createElement('h3');
		heading.textContent = 'Garden Information';
		heading.style.cssText = 'margin:0 0 10px 0;color:#8f8;font-size:15px;';
		panel.appendChild(heading);

		// Current effects section
		var effectsSection = document.createElement('div');
		effectsSection.id = 'a11yGardenInfoEffects';
		effectsSection.style.cssText = 'margin-bottom:15px;padding:10px;background:#0a1a0a;border:1px solid #3a3;';
		panel.appendChild(effectsSection);

		// Tips section
		var tipsSection = document.createElement('div');
		tipsSection.setAttribute('tabindex', '0');
		tipsSection.style.cssText = 'padding:10px;background:#0a1a0a;border:1px solid #3a3;';
		var tipsHeading = document.createElement('h4');
		tipsHeading.textContent = 'Tips';
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

		// Insert panel near the garden tools
		var gardenContent = l('gardenContent') || l('gardenPanel');
		if (gardenContent) {
			gardenContent.insertBefore(panel, gardenContent.firstChild);
		} else {
			// Fallback: insert after the info button
			if (infoBtn && infoBtn.parentNode) {
				infoBtn.parentNode.insertBefore(panel, infoBtn.nextSibling);
			}
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
		var effectsHeading = document.createElement('h4');
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
			MOD.gardenAnnounce('Row ' + (y+1) + ', column ' + (x+1) + ' is empty');
			return;
		}
		if (!info.isMature) {
			MOD.gardenAnnounce(info.name + ' at row ' + (y+1) + ', column ' + (x+1) + ' is ' + info.growth + '% grown, not ready to harvest');
			return;
		}
		g.harvest(x, y);
		MOD.gardenAnnounce('Harvested ' + info.name + ' from row ' + (y+1) + ', column ' + (x+1));
		setTimeout(function() { MOD.updateAllPlotButtons(); MOD.updateGardenPanelStatus(); }, 100);
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
		// Plant the seed
		var result = g.useTool(g.seedSelected, x, y);
		if (result) {
			MOD.gardenAnnounce('Planted ' + seed.name + ' at row ' + (y+1) + ', column ' + (x+1));
		} else {
			MOD.gardenAnnounce('Cannot plant ' + seed.name + '. Not enough cookies or tile is locked');
		}
		setTimeout(function() { MOD.updateAllPlotButtons(); MOD.updateGardenPanelStatus(); }, 100);
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
		// Enhance spirit slots - clicking clears the slot
		for (var i = 0; i < 3; i++) {
			var slotEl = l('templeSlot' + i);
			if (!slotEl) continue;
			var spiritId = pan.slot[i];
			var lbl = slots[i] + ' slot: ';
			if (spiritId !== -1 && pan.gods[spiritId]) {
				var god = pan.gods[spiritId];
				lbl += god.name + '. Click to remove.';
			} else {
				lbl += 'Empty';
			}
			slotEl.setAttribute('aria-label', lbl);
			slotEl.setAttribute('role', 'button');
			slotEl.setAttribute('tabindex', '0');
			if (!slotEl.dataset.a11yEnhanced) {
				slotEl.dataset.a11yEnhanced = 'true';
				(function(slotIndex) {
					slotEl.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							if (pan.slot[slotIndex] !== -1) {
								pan.slotGod(pan.gods[pan.slot[slotIndex]], -1);
								MOD.announce(slots[slotIndex] + ' slot cleared');
								MOD.enhancePantheonMinigame();
							}
						}
					});
				})(i);
			}
		}
		// Enhance spirit icons and add slot assignment buttons
		for (var id in pan.gods) {
			var god = pan.gods[id];
			var godEl = l('templeGod' + god.id);
			if (!godEl) continue;
			var slotted = pan.slot.indexOf(parseInt(id));
			var inSlot = slotted >= 0 ? ' Currently in ' + slots[slotted] + ' slot.' : '';
			var desc = god.desc1 || god.desc || '';
			godEl.setAttribute('aria-label', god.name + '.' + inSlot + ' ' + MOD.stripHtml(desc));
			godEl.setAttribute('role', 'button');
			godEl.setAttribute('tabindex', '0');
			// Add slot selection buttons after each spirit
			if (!godEl.dataset.a11yEnhanced) {
				godEl.dataset.a11yEnhanced = 'true';
				MOD.createSpiritSlotButtons(god, godEl, pan, slots);
			}
		}
	},
	createSpiritSlotButtons: function(god, godEl, pantheon, slots) {
		var MOD = this;
		var container = document.createElement('div');
		container.className = 'a11y-spirit-controls';
		container.style.cssText = 'display:inline-block;margin-left:5px;';
		for (var i = 0; i < 3; i++) {
			(function(slotIndex, slotName) {
				var btn = document.createElement('button');
				btn.textContent = slotName.charAt(0);
				btn.setAttribute('aria-label', 'Place ' + god.name + ' in ' + slotName + ' slot');
				btn.style.cssText = 'width:24px;height:24px;margin:2px;background:#333;color:#fff;border:1px solid #666;cursor:pointer;';
				btn.addEventListener('click', function(e) {
					e.stopPropagation();
					pantheon.slotGod(god, slotIndex);
					MOD.announce(god.name + ' placed in ' + slotName + ' slot');
					MOD.enhancePantheonMinigame();
				});
				btn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						e.stopPropagation();
						pantheon.slotGod(god, slotIndex);
						MOD.announce(god.name + ' placed in ' + slotName + ' slot');
						MOD.enhancePantheonMinigame();
					}
				});
				container.appendChild(btn);
			})(i, slots[i]);
		}
		godEl.parentNode.insertBefore(container, godEl.nextSibling);
	},
	enhanceGrimoireMinigame: function() {
		var MOD = this, grim = Game.Objects['Wizard tower'] && Game.Objects['Wizard tower'].minigame;
		if (!grim) return;
		// Enhance the minigame header
		MOD.enhanceMinigameHeader(Game.Objects['Wizard tower'], 'Grimoire', grim);
		// Magic meter status
		var magicMeter = document.querySelector('.grimoireMagicM');
		if (magicMeter) {
			magicMeter.setAttribute('role', 'status');
			magicMeter.setAttribute('aria-label', 'Magic: ' + Math.floor(grim.magic) + ' of ' + Math.floor(grim.magicM));
		}
		// Enhance spell buttons - name, cost, and whether castable
		document.querySelectorAll('.grimoireSpell').forEach(function(b) {
			var id = b.id.replace('grimoireSpell', ''), sp = grim.spellsById[id];
			if (sp) {
				var cost = Math.floor(grim.getSpellCost(sp) * 100) / 100;
				var currentMagic = Math.floor(grim.magic);
				var canCast = currentMagic >= cost;
				// Button label: name, cost, whether castable
				var lbl = sp.name + '. Cost: ' + cost + ' magic. ';
				lbl += canCast ? 'Can cast.' : 'Not enough magic.';
				b.setAttribute('aria-label', lbl);
				b.setAttribute('role', 'button');
				b.setAttribute('tabindex', '0');
				if (!b.dataset.a11yEnhanced) {
					b.dataset.a11yEnhanced = 'true';
					b.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); }
					});
				}
				// Add effect text below spell (not a button)
				MOD.ensureSpellEffectText(sp, b);
			}
		});
	},
	ensureSpellEffectText: function(spell, spellEl) {
		var MOD = this;
		try {
			var textId = 'a11y-spell-effect-' + spell.id;
			var existingText = l(textId);
			if (!existingText) {
				var effectDiv = document.createElement('div');
				effectDiv.id = textId;
				effectDiv.style.cssText = 'display:block;padding:4px;margin:2px 0;font-size:11px;color:#ccc;';
				effectDiv.setAttribute('tabindex', '0');
				effectDiv.textContent = 'Effect: ' + MOD.stripHtml(spell.desc || '');
				if (spellEl.nextSibling) {
					spellEl.parentNode.insertBefore(effectDiv, spellEl.nextSibling);
				} else {
					spellEl.parentNode.appendChild(effectDiv);
				}
			}
		} catch(e) {}
	},
	enhanceStockMarketMinigame: function() {
		var MOD = this, mkt = Game.Objects['Bank'] && Game.Objects['Bank'].minigame;
		if (!mkt) return;
		// Enhance the minigame header
		MOD.enhanceMinigameHeader(Game.Objects['Bank'], 'Stock Market', mkt);
		// Enhance stock rows
		document.querySelectorAll('.bankGood').forEach(function(r) {
			var id = r.id.replace('bankGood-', ''), good = mkt.goodsById[id];
			if (good) {
				r.setAttribute('role', 'region');
				var trend = good.d > 0 ? 'Rising' : (good.d < 0 ? 'Falling' : 'Stable');
				var lbl = 'Stock: ' + good.name + '. Price: $' + Beautify(good.val, 2) + '. ';
				lbl += 'Owned: ' + good.stock + ' shares. Trend: ' + trend + '.';
				r.setAttribute('aria-label', lbl);
			}
		});
		// Enhance buy/sell buttons
		document.querySelectorAll('.bankButton').forEach(function(btn) {
			var txt = btn.textContent || btn.innerText || '';
			var parent = btn.closest('.bankGood');
			var goodName = '';
			if (parent) {
				var id = parent.id.replace('bankGood-', '');
				var good = mkt.goodsById[id];
				if (good) goodName = good.name;
			}
			if (txt.includes('Buy')) {
				btn.setAttribute('aria-label', 'Buy ' + goodName + ' stock button');
			} else if (txt.includes('Sell')) {
				btn.setAttribute('aria-label', 'Sell ' + goodName + ' stock button');
			} else if (txt.includes('Max')) {
				btn.setAttribute('aria-label', 'Buy maximum ' + goodName + ' stock button');
			}
			btn.setAttribute('role', 'button');
			btn.setAttribute('tabindex', '0');
			if (!btn.dataset.a11yEnhanced) {
				btn.dataset.a11yEnhanced = 'true';
				btn.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
				});
			}
		});
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
		// Store section - H3 heading added in enhanceUpgradeShop, no H2 needed here
		// Upgrades section
		var up = l('upgrades');
		if (up) { up.setAttribute('role', 'region'); up.setAttribute('aria-label', 'Available Upgrades'); }
		// Buildings section - heading added in addStructuralHeadings
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
				var storeHeading = document.createElement('h3');
				storeHeading.id = 'a11yStoreHeading';
				storeHeading.textContent = 'Store';
				storeHeading.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
				uc.parentNode.insertBefore(storeHeading, uc);
			}
			// Label all upgrade crates
			uc.querySelectorAll('.crate.upgrade, button.crate.upgrade').forEach(function(c) {
				var id = c.dataset.id;
				if (id && Game.UpgradesById[id]) {
					var upg = Game.UpgradesById[id];
					MOD.labelUpgradeCrate(c, upg, false, upg.pool === 'toggle');
				}
			});
		}
		var vc = l('vaultUpgrades');
		if (vc) {
			vc.setAttribute('role', 'region'); vc.setAttribute('aria-label', 'Vaulted');
			vc.querySelectorAll('.crate.upgrade').forEach(function(c) {
				var id = c.dataset.id;
				if (id && Game.UpgradesById[id]) MOD.labelUpgradeCrate(c, Game.UpgradesById[id], true, false);
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
			var bulkAmount = Game.buyBulk;

			if (isBuyMode) {
				var price;
				if (bulkAmount === -1) {
					price = building.bulkPrice || building.price;
				} else {
					price = building.getSumPrice ? building.getSumPrice(bulkAmount) : building.price * bulkAmount;
				}
				var timeLabel = bulkAmount > 1 ? 'Time until ' + bulkAmount + ' affordable: ' : 'Time until affordable: ';
				if (bulkAmount === -1) timeLabel = 'Time until max affordable: ';
				lines.push(timeLabel + MOD.getTimeUntilAfford(price));
			}
			// In sell mode, don't show time until affordable

			if (building.amount > 0 && building.storedCps) {
				lines.push('Each produces: ' + Beautify(building.storedCps, 1) + ' cookies per second');
				lines.push('Total production: ' + Beautify(building.storedTotalCps, 1) + ' cookies per second');
				if (Game.cookiesPs > 0) {
					var pct = Math.round((building.storedTotalCps / Game.cookiesPs) * 100);
					lines.push('This is ' + pct + ' percent of total production');
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
		var a = l('ariaReader-upgrade-' + u.id);
		if (a) {
			var n = u.dname || u.name;
			var p = Beautify(Math.round(u.getPrice()));
			var t = n + '. ';
			if (u.bought) {
				t += 'Purchased. ';
			} else if (u.canBuy()) {
				t += 'Affordable. Cost: ' + p + '. ';
			} else {
				// Cannot afford - show time until affordable
				var timeText = MOD.getTimeUntilAfford(u.getPrice());
				t += 'Cannot afford, ' + timeText + '. Cost: ' + p + '. ';
			}
			// For toggle upgrades, use our enhanced effect description
			if (u.pool === 'toggle') {
				t += MOD.getToggleUpgradeEffect(u);
			} else if (u.desc) {
				t += MOD.stripHtml(u.desc);
			}
			a.innerHTML = t;
		}
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
		// Build the info text matching the button label format
		var price = Beautify(Math.round(u.getPrice()));
		var infoText = '';
		if (u.canBuy()) {
			infoText = 'Affordable. Cost: ' + price + '. ' + MOD.stripHtml(u.desc || '');
		} else {
			var timeText = MOD.getTimeUntilAfford(u.getPrice());
			infoText = 'Cannot afford, ' + timeText + '. Cost: ' + price + '. ' + MOD.stripHtml(u.desc || '');
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
	labelUpgradeCrate: function(c, u, v, isToggle) {
		var MOD = this;
		if (!c || !u) return;
		var n = u.dname || u.name;
		// Build comprehensive label
		var lbl = n;
		if (v) lbl += ' (Vaulted)';
		if (u.bought) lbl += ' (Purchased)';
		// For toggle upgrades, add effect description
		if (isToggle || u.pool === 'toggle') {
			lbl += '. ' + MOD.getToggleUpgradeEffect(u);
		}
		c.setAttribute('aria-label', lbl);
		c.setAttribute('role', 'button');
		c.setAttribute('tabindex', '0');
		if (!c.dataset.a11yEnhanced) {
			c.dataset.a11yEnhanced = 'true';
			c.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
		}
	},
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
		var d1 = l('ascendData1'), d2 = l('ascendData2');
		if (d1) d1.setAttribute('aria-hidden', 'true');
		if (d2) d2.setAttribute('aria-hidden', 'true');
		MOD.enhanceHeavenlyUpgrades();
		MOD.enhancePermanentUpgradeSlots();
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
	updateDynamicLabels: function() {
		var MOD = this;
		// Track shimmer appearances every 5 ticks for timely announcements
		if (Game.T % 5 === 0) {
			MOD.trackShimmerAnnouncements();
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
			MOD.updateLegacyButtonLabel();
			MOD.updateActiveBuffsPanel();
			MOD.updateMainInterfaceDisplays();
		}
		// Regular updates every 60 ticks (2 seconds)
		if (Game.T % 60 === 0) {
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
				if (!l('a11yGardenPanel')) {
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
			}
			if (MOD.lastHeavenlyChips !== Game.heavenlyChips) {
				MOD.lastHeavenlyChips = Game.heavenlyChips;
				MOD.enhanceHeavenlyUpgrades();
				MOD.labelStatsHeavenly();
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
		// Populate ariaReader-product-* labels for buildings (created by game when screenreader=1)
		var isBuyMode = Game.buyMode === 1;
		var bulkAmount = Game.buyBulk;

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

				if (bld.storedTotalCps) {
					label += ' Produces: ' + Beautify(bld.storedTotalCps, 1) + ' CPS total.';
				}
				ariaLabel.textContent = label;
			}
		}
	},
	enhanceQoLSelectors: function() {
		var MOD = this;
		// Check if milk selector is unlocked (requires "Milk selector" heavenly upgrade)
		var milkUnlocked = Game.Has('Milk selector');
		var milkBox = l('milkBox');
		if (milkBox) {
			if (milkUnlocked) {
				milkBox.setAttribute('role', 'button');
				milkBox.setAttribute('tabindex', '0');
				milkBox.removeAttribute('aria-hidden');
				MOD.updateMilkLabel();
				if (!milkBox.dataset.a11yEnhanced) {
					milkBox.dataset.a11yEnhanced = 'true';
					milkBox.addEventListener('keydown', function(e) {
						if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); milkBox.click(); }
					});
				}
			} else {
				milkBox.setAttribute('tabindex', '-1');
				milkBox.setAttribute('aria-hidden', 'true');
			}
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
		var milkBox = l('milkBox');
		if (!milkBox) return;
		if (!Game.Has('Milk selector')) return;
		var milkName = 'Automatic';
		if (Game.milkType !== undefined && Game.milkType > 0 && Game.Milks && Game.Milks[Game.milkType]) {
			milkName = Game.Milks[Game.milkType].name || 'Milk ' + Game.milkType;
		} else if (Game.milkType === 0) {
			milkName = 'Automatic (based on achievements)';
		}
		milkBox.setAttribute('aria-label', 'Milk selector. Current: ' + milkName + '. Click to change milk appearance.');
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
		var heading = document.createElement('h2');
		heading.id = 'a11yBuffsHeading';
		heading.textContent = 'Active Buffs';
		heading.style.cssText = 'color:#aaf;margin:0 0 10px 0;font-size:16px;';
		panel.appendChild(heading);
		var buffList = document.createElement('div');
		buffList.id = 'a11yBuffList';
		buffList.style.cssText = 'color:#fff;font-size:14px;';
		buffList.textContent = 'No active buffs';
		panel.appendChild(buffList);
		// Insert after Wrinklers panel if exists, otherwise after products
		var wrinklerPanel = l('wrinklerOverlayContainer');
		if (wrinklerPanel && wrinklerPanel.parentNode) {
			wrinklerPanel.parentNode.insertBefore(panel, wrinklerPanel.nextSibling);
		} else {
			products.parentNode.insertBefore(panel, products.nextSibling);
		}
	},
	updateActiveBuffsPanel: function() {
		var MOD = this;
		var buffList = l('a11yBuffList');
		if (!buffList || !Game.buffs) return;
		var buffs = [];
		for (var name in Game.buffs) {
			var b = Game.buffs[name];
			if (b && b.time > 0) {
				var remaining = Math.ceil(b.time / Game.fps);
				var desc = b.desc ? MOD.stripHtml(b.desc) : '';
				buffs.push({ name: name, time: remaining, desc: desc });
			}
		}
		if (buffs.length === 0) {
			buffList.innerHTML = '<div tabindex="0">No active buffs</div>';
		} else {
			var html = '';
			buffs.forEach(function(buff) {
				html += '<div tabindex="0" style="padding:4px 0;border-bottom:1px solid #444;">';
				html += '<strong>' + buff.name + '</strong>: ' + buff.time + 's remaining';
				if (buff.desc) html += '<br><span style="color:#aaa;font-size:12px;">' + buff.desc + '</span>';
				html += '</div>';
			});
			buffList.innerHTML = html;
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

		// Show: owned buildings + next 1 to work toward + 1 mystery
		for (var i = 0; i < numBuildings; i++) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			var productEl = l('product' + bld.id);
			if (!productEl) continue;

			// Find the info button for this building
			var infoBtn = l('a11y-info-btn-building-' + bld.id);
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
					productEl.setAttribute('aria-label', 'Mystery building. Cost: ' + cost + ' cookies. Time until affordable: ' + timeUntil);
					if (infoBtn) {
						infoBtn.style.display = 'none';
						infoBtn.setAttribute('aria-hidden', 'true');
					}
					if (levelLabel) {
						levelLabel.style.display = 'none';
						levelLabel.setAttribute('aria-hidden', 'true');
					}
				} else {
					// Too far ahead - hide completely
					productEl.style.display = 'none';
					productEl.setAttribute('aria-hidden', 'true');
					if (infoBtn) {
						infoBtn.style.display = 'none';
						infoBtn.setAttribute('aria-hidden', 'true');
					}
					if (levelLabel) {
						levelLabel.style.display = 'none';
						levelLabel.setAttribute('aria-hidden', 'true');
					}
				}
			} else {
				// Locked building - hide completely
				productEl.style.display = 'none';
				productEl.setAttribute('aria-hidden', 'true');
				if (infoBtn) {
					infoBtn.style.display = 'none';
					infoBtn.setAttribute('aria-hidden', 'true');
				}
				if (levelLabel) {
					levelLabel.style.display = 'none';
					levelLabel.setAttribute('aria-hidden', 'true');
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
		var MOD = this;
		var numBuildings = Game.ObjectsN || 0;
		for (var i = 0; i < numBuildings; i++) {
			var bld = Game.ObjectsById[i];
			if (!bld || !bld.l) continue;
			// Get the actual level value - use parseInt to handle string values
			var level = parseInt(bld.level) || 0;
			var lumpCost = level + 1;
			// Find or create level label
			var levelLabelId = 'a11yBuildingLevel' + bld.id;
			var levelLabel = l(levelLabelId);
			if (!levelLabel) {
				levelLabel = document.createElement('div');
				levelLabel.id = levelLabelId;
				levelLabel.setAttribute('role', 'status');
				levelLabel.setAttribute('tabindex', '0');
				levelLabel.style.cssText = 'background:#222;color:#fff;padding:4px 8px;margin:2px 0;font-size:11px;border:1px solid #444;';
				var productEl = l('product' + bld.id);
				if (productEl && productEl.parentNode) {
					productEl.parentNode.insertBefore(levelLabel, productEl.nextSibling);
				}
			}
			var minigameName = bld.minigame ? bld.minigame.name : '';
			var text = 'Level ' + level;
			if (minigameName) text += ' (' + minigameName + ')';
			text += '. Upgrade cost: ' + lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : '');
			if (Game.lumps >= lumpCost) {
				text += ' (Can afford)';
			}
			levelLabel.textContent = text;
			levelLabel.setAttribute('aria-label', bld.name + ' ' + text);
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

		// Get current milk name from Game.Milks array
		var milkName = 'Plain milk';
		if (Game.Milks && Game.Milks[milkRank]) {
			milkName = Game.Milks[milkRank].name || milkName;
		}

		// Use game's romanize function for rank display
		var romanRank = typeof romanize === 'function' ? romanize(milkRank + 1) : (milkRank + 1);

		return {
			percent: milkPercent,
			rank: milkRank + 1,
			romanRank: romanRank,
			milkName: milkName,
			achievements: achievementsOwned,
			achievementsToNext: Math.max(0, achievementsToNext),
			maxRank: Game.Milks ? Game.Milks.length : 35
		};
	},
	updateMilkDisplay: function() {
		var milkDiv = l('a11yMilkDisplay');
		if (!milkDiv) return;

		var info = this.getMilkInfo();

		// Build detailed aria-label for screen readers
		var label = 'Milk: ' + info.milkName + '. ';
		label += 'Rank ' + info.romanRank + ' (' + info.rank + ' of ' + info.maxRank + '). ';
		label += info.percent + '% progress. ';
		label += info.achievements + ' achievements. ';
		if (info.achievementsToNext > 0 && info.rank < info.maxRank) {
			label += info.achievementsToNext + ' more for next rank.';
		} else if (info.rank >= info.maxRank) {
			label += 'Maximum rank achieved!';
		}

		// Shorter visible text
		var displayText = 'Milk: ' + info.milkName + ' (Rank ' + info.romanRank + ', ' + info.percent + '%)';

		milkDiv.textContent = displayText;
		milkDiv.setAttribute('aria-label', label);
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
				rowEl.setAttribute('aria-label', rowLabel);
				// Find and label clickable elements within the row
				rowEl.querySelectorAll('div[onclick], .rowSpecial, .rowCanvas').forEach(function(el) {
					var onclick = el.getAttribute('onclick') || '';
					if (onclick.includes('levelUp') || onclick.includes('Level')) {
						el.setAttribute('aria-label', bld.name + ' Level ' + level + '. Click to upgrade for ' + lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : ''));
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
							el.setAttribute('aria-label', (isOpen ? 'Close ' : 'Open ') + minigameName);
						} else if (hasMinigame) {
							el.setAttribute('aria-label', minigameName + ' (unlock at level 1)');
						} else {
							el.setAttribute('aria-label', bld.name + ' (no minigame)');
						}
						el.setAttribute('role', 'button');
						el.setAttribute('tabindex', '0');
					} else if (onclick.includes('Mute')) {
						el.setAttribute('aria-label', 'Mute ' + bld.name);
						el.setAttribute('role', 'button');
						el.setAttribute('tabindex', '0');
					}
				});
				// Also check for .level elements in the row
				var levelEl = rowEl.querySelector('.level, .objectLevel');
				if (levelEl) {
					levelEl.setAttribute('aria-label', bld.name + ' Level ' + level + '. Click to upgrade for ' + lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : ''));
					levelEl.setAttribute('role', 'button');
					levelEl.setAttribute('tabindex', '0');
				}
			}
			// Also label the productLevel button in the right section (this is the main level upgrade button)
			var productLevelEl = l('productLevel' + bld.id);
			if (productLevelEl) {
				productLevelEl.setAttribute('aria-label', bld.name + ' Level ' + level + '. Click to upgrade for ' + lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : ''));
				productLevelEl.setAttribute('role', 'button');
				productLevelEl.setAttribute('tabindex', '0');
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
							var level = parseInt(bld.level) || 0;
							var lumpCost = level + 1;
							el.setAttribute('aria-label', bld.name + ' Level ' + level + '. Click to upgrade for ' + lumpCost + ' sugar lump' + (lumpCost > 1 ? 's' : ''));
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
			cpcDiv.textContent = 'Cookies per click: ' + Beautify(cpc, 1);
			cpcDiv.setAttribute('aria-label', 'Cookies per click: ' + Beautify(cpc, 1));
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
		// Label upgrades in the store
		var upgradesDiv = l('upgrades');
		if (upgradesDiv) {
			upgradesDiv.querySelectorAll('.crate.upgrade').forEach(function(crate) {
				MOD.labelUpgradeCrate(crate);
			});
		}
		// Label tech upgrades if visible
		var techDiv = l('techUpgrades');
		if (techDiv) {
			techDiv.querySelectorAll('.crate.upgrade').forEach(function(crate) {
				MOD.labelUpgradeCrate(crate);
			});
		}
	},
	labelUpgradeCrate: function(crate) {
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
