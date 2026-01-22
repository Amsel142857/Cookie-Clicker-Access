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
			MOD.createShimmerOverlay();
			MOD.createMainInterfaceEnhancements();
			MOD.filterUnownedBuildings();
			MOD.labelBuildingLevels();
		}, 500);
		Game.registerHook('draw', function() {
			MOD.updateDynamicLabels();
		});
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
				MOD.createMainInterfaceEnhancements();
				MOD.filterUnownedBuildings();
			}, 100);
		});
		Game.Notify('Accessibility Enhanced', 'Version 6 with enhanced modules.', [10, 0], 6);
		this.announce('NVDA Accessibility mod version 6 loaded. New features: Active Buffs panel, CPS display, building levels, enhanced Pantheon, shimmer overlay.');
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
				if (level >= 1 && mg) {
					// Check if minigame is currently open - multiple ways to detect
					var mgContainer = l('row' + bld.id + 'minigame');
					var isOpen = false;
					if (mgContainer) {
						// Check if container is visible
						isOpen = mgContainer.style.display !== 'none' &&
								 mgContainer.style.visibility !== 'hidden' &&
								 mgContainer.classList.contains('rowMinigame');
					}
					// Also check if the building's onMinigame property is set
					if (bld.onMinigame) isOpen = true;
					mgBtn.setAttribute('aria-label', (isOpen ? 'Close ' : 'Open ') + mgName);
				} else if (level >= 1 && mgName) {
					// Minigame unlocked but object not loaded yet
					mgBtn.setAttribute('aria-label', 'Open ' + mgName);
				} else if (bld.minigameUrl) {
					mgBtn.setAttribute('aria-label', 'Level up ' + bldName + ' to unlock ' + (mgName || 'minigame') + ' (1 sugar lump)');
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
			MOD.announce('Accessibility Fix: Special Tabs and Buildings labeled.');
		}
	},
	createLiveRegion: function() {
		if (l('srAnnouncer')) return;
		var a = document.createElement('div');
		a.id = 'srAnnouncer';
		a.setAttribute('role', 'status');
		a.setAttribute('aria-live', 'polite');
		a.setAttribute('aria-atomic', 'true');
		a.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
		document.body.appendChild(a);
	},
	createAssertiveLiveRegion: function() {
		if (l('srAnnouncerUrgent')) return;
		var a = document.createElement('div');
		a.id = 'srAnnouncerUrgent';
		a.setAttribute('role', 'alert');
		a.setAttribute('aria-live', 'assertive');
		a.setAttribute('aria-atomic', 'true');
		a.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
		document.body.appendChild(a);
	},
	announce: function(t) {
		var a = l('srAnnouncer');
		if (a) { a.textContent = ''; setTimeout(function() { a.textContent = t; }, 50); }
	},
	announceUrgent: function(t) {
		var a = l('srAnnouncerUrgent');
		if (a) { a.textContent = ''; setTimeout(function() { a.textContent = t; }, 50); }
	},
	createWrinklerOverlays: function() {
		var MOD = this;
		MOD.wrinklerOverlays.forEach(function(o) { if (o && o.parentNode) o.parentNode.removeChild(o); });
		MOD.wrinklerOverlays = [];
		var c = l('wrinklerOverlayContainer');
		if (!c) {
			c = document.createElement('div');
			c.id = 'wrinklerOverlayContainer';
			c.setAttribute('role', 'region');
			c.setAttribute('aria-labelledby', 'a11yWrinklersHeading');
			c.style.cssText = 'background:#2a1a1a;border:2px solid #a66;padding:10px;margin:10px 0;';
			// Add heading
			var heading = document.createElement('h2');
			heading.id = 'a11yWrinklersHeading';
			heading.textContent = 'Wrinklers';
			heading.style.cssText = 'color:#faa;margin:0 0 10px 0;font-size:16px;';
			c.appendChild(heading);
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
		} else {
			// Remove the old button container if it exists
			var oldBtnContainer = l('wrinklerButtonContainer');
			if (oldBtnContainer) oldBtnContainer.remove();
		}
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
		for (var i = 0; i < Game.wrinklers.length && i < MOD.wrinklerOverlays.length; i++) {
			var w = Game.wrinklers[i], o = MOD.wrinklerOverlays[i];
			if (!o) continue;
			if (w && w.phase > 0) {
				var s = Beautify(w.sucked), t = w.type === 1 ? 'Shiny ' : '';
				o.setAttribute('aria-label', t + 'Wrinkler ' + (i + 1) + ': ' + s + ' cookies sucked. Click to pop.');
				o.style.display = 'inline-block';
			} else {
				o.setAttribute('aria-label', 'Wrinkler slot ' + (i + 1) + ': Empty');
				o.style.display = 'none';
			}
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
		var MOD = this;
		var obs = new MutationObserver(function(m) { m.forEach(function(mut) { if (mut.addedNodes.length) MOD.labelStatisticsContent(); }); });
		var menu = l('menu');
		if (menu) obs.observe(menu, { childList: true, subtree: true });
	},
	labelStatisticsContent: function() {
		var MOD = this, menu = l('menu');
		if (!menu) return;
		menu.querySelectorAll('.title').forEach(function(t) { t.setAttribute('role', 'heading'); t.setAttribute('aria-level', '2'); });
		menu.querySelectorAll('.listing b').forEach(function(s) { if (s.textContent.endsWith(':')) { s.setAttribute('role', 'heading'); s.setAttribute('aria-level', '3'); } });
		MOD.enhanceAchievementIcons();
		MOD.enhanceUpgradeIcons();
	},
	enhanceAchievementIcons: function() {
		var MOD = this, menu = l('menu');
		if (!menu) return;
		menu.querySelectorAll('.crate.achievement').forEach(function(i) {
			var id = i.dataset.id;
			if (id && Game.AchievementsById[id]) MOD.labelAchievementIcon(i, Game.AchievementsById[id]);
		});
	},
	enhanceUpgradeIcons: function() {
		var MOD = this, menu = l('menu');
		if (!menu) return;
		menu.querySelectorAll('.crate.upgrade').forEach(function(i) {
			var id = i.dataset.id;
			if (id && Game.UpgradesById[id]) MOD.labelUpgradeIcon(i, Game.UpgradesById[id]);
		});
	},
	labelAchievementIcon: function(icon, ach) {
		if (!icon || !ach) return;
		var n = ach.dname || ach.name, d = this.stripHtml(ach.desc || ''), w = ach.won ? 'Unlocked' : 'Locked';
		var lbl = 'Achievement: ' + n + '. Status: ' + w + '. ' + d;
		icon.setAttribute('aria-label', lbl);
		icon.setAttribute('role', 'button');
		icon.setAttribute('tabindex', '0');
		if (!icon.dataset.a11yEnhanced) {
			icon.dataset.a11yEnhanced = 'true';
			icon.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); icon.click(); }
			});
		}
	},
	labelUpgradeIcon: function(icon, upg) {
		if (!icon || !upg) return;
		var n = upg.dname || upg.name, d = this.stripHtml(upg.desc || ''), w = upg.bought ? 'Owned' : 'Not owned';
		var lbl = 'Upgrade: ' + n + '. Status: ' + w + '. ' + d;
		icon.setAttribute('aria-label', lbl);
		icon.setAttribute('role', 'button');
		icon.setAttribute('tabindex', '0');
		if (!icon.dataset.a11yEnhanced) {
			icon.dataset.a11yEnhanced = 'true';
			icon.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); icon.click(); }
			});
		}
	},
	setupNewsTicker: function() {
		// News ticker disabled - too noisy for screen readers
		// Users can manually navigate to read if needed
	},
	setupGoldenCookieAnnouncements: function() {
		var MOD = this;
		if (Game.shimmerTypes && Game.shimmerTypes.golden) {
			var orig = Game.shimmerTypes.golden.popFunc;
			Game.shimmerTypes.golden.popFunc = function(me) {
				var r = orig.call(this, me);
				if (me.lastPopText) MOD.announceUrgent(MOD.stripHtml(me.lastPopText));
				else MOD.announceUrgent(Game.lastWrath ? 'Wrath cookie clicked!' : 'Golden cookie clicked!');
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
		if (MOD.lastAchievementCount === 0) { MOD.lastAchievementCount = cnt; return; }
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
					if (onclickStr.includes('Mute') || onclickStr.includes('mute') || clickDiv.classList.contains('objectMute')) {
						clickDiv.setAttribute('aria-label', 'Mute ' + bldName);
					} else if (onclickStr.includes('minigame') || onclickStr.includes('Minigame')) {
						clickDiv.setAttribute('aria-label', 'Open ' + mgName);
					} else if (onclickStr.includes('level') || onclickStr.includes('Level') || onclickStr.includes('lump')) {
						clickDiv.setAttribute('aria-label', bldName + ' (' + mgName + '), Level ' + level + ', Cost to upgrade: ' + costText);
					}
					clickDiv.setAttribute('role', 'button');
					clickDiv.setAttribute('tabindex', '0');
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
			var isMuted = bld.muteL.classList.contains('on');
			bld.muteL.setAttribute('aria-label', (isMuted ? 'Unmute ' : 'Mute ') + bldName);
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
		// Simplified main button - just name and quantity
		var lbl = bld.name + ', ' + owned + ' owned';
		el.setAttribute('aria-label', lbl);
		el.setAttribute('role', 'button');
		el.setAttribute('tabindex', '0');
		// Add info button with full details
		MOD.ensureBuildingInfoButton(bld);
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
		// Create accessible garden panel with real buttons
		MOD.createGardenAccessiblePanel(g);
	},
	labelOriginalGardenElements: function(g) {
		var MOD = this;
		if (!g) return;

		// Label garden tiles - they use ID format: gardenTile-{x}-{y}
		for (var y = 0; y < g.plotHeight; y++) {
			for (var x = 0; x < g.plotWidth; x++) {
				var tile = l('gardenTile-' + x + '-' + y);
				if (!tile) continue;
				var t = g.plot[y] && g.plot[y][x];
				var lbl = 'Plot row ' + (y+1) + ', column ' + (x+1) + ': ';
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
			}
		}

		// Label garden seeds - they use ID format: gardenSeed-{id}
		for (var seedId in g.plantsById) {
			var plant = g.plantsById[seedId];
			if (!plant) continue;
			var seed = l('gardenSeed-' + seedId);
			if (!seed) continue;
			var isSelected = (g.seedSelected == seedId);
			var lbl = (isSelected ? 'Selected: ' : 'Seed: ') + plant.name;
			if (!plant.unlocked) {
				lbl = 'Locked seed: ' + plant.name;
			} else if (plant.effsStr) {
				lbl += '. ' + MOD.stripHtml(plant.effsStr);
			}
			seed.setAttribute('aria-label', lbl);
			seed.setAttribute('role', 'button');
			seed.setAttribute('tabindex', '0');
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
			}
		}

		// Label soil selectors - they use ID format: gardenSoil-{id}
		for (var soilId in g.soils) {
			var soil = g.soils[soilId];
			if (!soil) continue;
			var soilEl = l('gardenSoil-' + soilId);
			if (!soilEl) continue;
			var isActive = (g.soil == soilId);
			var lbl = soil.name + (isActive ? ' (current soil)' : '');
			// Add soil effects
			var effects = [];
			if (soil.weedMult && soil.weedMult !== 1) effects.push('weeds ' + Math.round(soil.weedMult * 100) + '%');
			if (soil.ageTick && soil.ageTick !== 1) effects.push('growth ' + Math.round(soil.ageTick * 100) + '%');
			if (soil.effMult && soil.effMult !== 1) effects.push('effects ' + Math.round(soil.effMult * 100) + '%');
			if (effects.length > 0) lbl += '. ' + effects.join(', ');
			soilEl.setAttribute('aria-label', lbl);
			soilEl.setAttribute('role', 'button');
			soilEl.setAttribute('tabindex', '0');
		}
	},
	createGardenAccessiblePanel: function(g) {
		var MOD = this;
		if (!g) return;
		// Remove old panel if exists
		var oldPanel = l('a11yGardenPanel');
		if (oldPanel) oldPanel.remove();
		// Check if garden minigame is visible - look for the actual minigame div
		var gardenContainer = l('row2minigame');
		if (!gardenContainer) {
			// Try alternative - look for gardenContent
			gardenContainer = l('gardenContent');
		}
		if (!gardenContainer) return;
		// Create accessible panel
		var panel = document.createElement('div');
		panel.id = 'a11yGardenPanel';
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-labelledby', 'a11yGardenHeading');
		panel.style.cssText = 'background:#1a2a1a;border:2px solid #4a4;padding:10px;margin:10px 0;';
		// H2 Title for navigation
		var title = document.createElement('h2');
		title.id = 'a11yGardenHeading';
		title.textContent = 'Garden - Level ' + (parseInt(g.parent.level) || 0);
		title.style.cssText = 'color:#6c6;margin:0 0 10px 0;font-size:16px;';
		panel.appendChild(title);
		// Status info
		var statusDiv = document.createElement('div');
		statusDiv.id = 'a11yGardenStatus';
		statusDiv.style.cssText = 'color:#aaa;margin-bottom:10px;padding:5px;background:#222;';
		var freezeStatus = g.freeze ? 'FROZEN (plants not growing)' : 'Active';
		var soilName = g.soils && g.soil !== undefined && g.soils[g.soil] ? g.soils[g.soil].name : 'Unknown';
		statusDiv.innerHTML = '<strong>Status:</strong> ' + freezeStatus + ' | <strong>Soil:</strong> ' + soilName;
		statusDiv.setAttribute('tabindex', '0');
		panel.appendChild(statusDiv);

		// Instructions section
		var instructDiv = document.createElement('div');
		instructDiv.style.cssText = 'background:#222;padding:8px;margin:10px 0;border:1px solid #444;color:#aaa;font-size:12px;';
		instructDiv.setAttribute('tabindex', '0');
		instructDiv.innerHTML = '<strong>How to plant:</strong> 1) Select a seed below. 2) Click an empty plot to plant it. ' +
			'<strong>How to harvest:</strong> Click a plot with a mature plant (100% grown), or use Harvest All button.';
		panel.appendChild(instructDiv);

		// Tools section
		var toolsHeading = document.createElement('h4');
		toolsHeading.textContent = 'Tools:';
		toolsHeading.style.cssText = 'color:#ccc;margin:10px 0 5px 0;font-size:12px;';
		panel.appendChild(toolsHeading);
		var toolsDiv = document.createElement('div');
		toolsDiv.style.cssText = 'margin-bottom:10px;';
		// Harvest All button
		var harvestBtn = document.createElement('button');
		harvestBtn.type = 'button';
		harvestBtn.textContent = 'Harvest All';
		harvestBtn.setAttribute('aria-label', 'Harvest All. Instantly harvest all mature plants in your garden');
		harvestBtn.style.cssText = 'padding:8px 12px;margin:2px;background:#363;border:1px solid #4a4;color:#fff;cursor:pointer;';
		harvestBtn.addEventListener('click', function() {
			var harvestTool = l('gardenTool-1');
			if (harvestTool) harvestTool.click();
			MOD.announce('Harvested all mature plants');
		});
		toolsDiv.appendChild(harvestBtn);
		// Freeze button
		if (g.freeze !== undefined) {
			var freezeBtn = document.createElement('button');
			freezeBtn.type = 'button';
			freezeBtn.textContent = g.freeze ? 'Unfreeze Garden' : 'Freeze Garden';
			freezeBtn.setAttribute('aria-label', g.freeze ? 'Unfreeze Garden. Resume plant growth' : 'Freeze Garden. Pause all plant growth');
			freezeBtn.style.cssText = 'padding:8px 12px;margin:2px;background:#336;border:1px solid #44a;color:#fff;cursor:pointer;';
			freezeBtn.addEventListener('click', function() {
				var freezeTool = l('gardenTool-2');
				if (freezeTool) freezeTool.click();
				MOD.announce(g.freeze ? 'Garden frozen' : 'Garden unfrozen');
			});
			toolsDiv.appendChild(freezeBtn);
		}
		panel.appendChild(toolsDiv);
		// Soil selector section
		if (g.soils) {
			var soilHeading = document.createElement('h4');
			soilHeading.textContent = 'Soil Type:';
			soilHeading.style.cssText = 'color:#ccc;margin:10px 0 5px 0;font-size:12px;';
			panel.appendChild(soilHeading);
			var soilDiv = document.createElement('div');
			soilDiv.style.cssText = 'margin-bottom:10px;';
			for (var soilId in g.soils) {
				var soil = g.soils[soilId];
				if (!soil) continue;
				(function(s, sid) {
					var soilBtn = document.createElement('button');
					soilBtn.type = 'button';
					var isActive = (g.soil == sid);
					soilBtn.textContent = s.name + (isActive ? ' (active)' : '');
					var effects = [];
					if (s.weedMult && s.weedMult !== 1) effects.push('Weeds: ' + Math.round(s.weedMult * 100) + '%');
					if (s.ageTick && s.ageTick !== 1) effects.push('Growth: ' + Math.round(s.ageTick * 100) + '%');
					if (s.effMult && s.effMult !== 1) effects.push('Effects: ' + Math.round(s.effMult * 100) + '%');
					var effectStr = effects.length > 0 ? effects.join(', ') : 'Standard';
					soilBtn.setAttribute('aria-label', s.name + (isActive ? ' (currently active)' : '') + '. ' + effectStr);
					soilBtn.style.cssText = 'padding:6px 10px;margin:2px;background:' + (isActive ? '#353' : '#333') + ';border:1px solid ' + (isActive ? '#4a4' : '#555') + ';color:#fff;cursor:pointer;font-size:11px;';
					soilBtn.addEventListener('click', function() {
						g.soil = parseInt(sid);
						MOD.announce(s.name + ' soil selected');
						MOD.createGardenAccessiblePanel(g); // Refresh panel
					});
					soilDiv.appendChild(soilBtn);
				})(soil, soilId);
			}
			panel.appendChild(soilDiv);
		}
		// Seeds section
		var currentSeed = g.seedSelected >= 0 && g.plantsById[g.seedSelected] ? g.plantsById[g.seedSelected].name : 'None';
		var seedsHeading = document.createElement('h4');
		seedsHeading.textContent = 'Seeds - Currently selected: ' + currentSeed;
		seedsHeading.style.cssText = 'color:#ccc;margin:10px 0 5px 0;font-size:12px;';
		seedsHeading.setAttribute('tabindex', '0');
		panel.appendChild(seedsHeading);
		var seedsDiv = document.createElement('div');
		seedsDiv.style.cssText = 'margin-bottom:10px;max-height:150px;overflow-y:auto;';
		for (var seedId in g.plantsById) {
			var plant = g.plantsById[seedId];
			if (!plant || !plant.unlocked) continue;
			(function(p, id) {
				var isSelected = (g.seedSelected == id);
				var seedBtn = document.createElement('button');
				seedBtn.type = 'button';
				seedBtn.textContent = (isSelected ? '>> ' : '') + p.name + (isSelected ? ' (SELECTED)' : '');
				var effectText = p.effsStr ? MOD.stripHtml(p.effsStr) : 'No special effects';
				seedBtn.setAttribute('aria-label', (isSelected ? 'Currently selected: ' : 'Select seed: ') + p.name + '. ' + effectText + '. Click to select, then click a plot to plant.');
				seedBtn.style.cssText = 'display:block;width:100%;padding:6px;margin:2px 0;background:' + (isSelected ? '#353' : '#333') + ';border:1px solid ' + (isSelected ? '#4a4' : '#555') + ';color:#fff;cursor:pointer;text-align:left;font-size:12px;';
				seedBtn.addEventListener('click', function() {
					var seedEl = l('gardenSeed-' + id);
					if (seedEl) seedEl.click();
					MOD.announce(p.name + ' seed selected. Now click a plot to plant it.');
					// Refresh the panel to show updated selection
					setTimeout(function() { MOD.createGardenAccessiblePanel(g); }, 100);
				});
				seedsDiv.appendChild(seedBtn);
			})(plant, seedId);
		}
		panel.appendChild(seedsDiv);
		// Plot grid section
		var plotHeading = document.createElement('h4');
		plotHeading.textContent = 'Garden Plots (' + g.plotWidth + 'x' + g.plotHeight + '):';
		plotHeading.style.cssText = 'color:#ccc;margin:10px 0 5px 0;font-size:12px;';
		panel.appendChild(plotHeading);
		var plotDiv = document.createElement('div');
		plotDiv.style.cssText = 'display:grid;grid-template-columns:repeat(' + g.plotWidth + ', 1fr);gap:2px;';
		for (var y = 0; y < g.plotHeight; y++) {
			for (var x = 0; x < g.plotWidth; x++) {
				(function(px, py) {
					var plotBtn = document.createElement('button');
					plotBtn.type = 'button';
					plotBtn.id = 'a11yGardenPlot-' + py + '-' + px;
					plotBtn.style.cssText = 'padding:8px 4px;background:#222;border:1px solid #444;color:#fff;cursor:pointer;font-size:10px;min-height:40px;';
					// Set label based on plot contents
					var t = g.plot[py] && g.plot[py][px];
					var lbl = 'Row ' + (py+1) + ', Column ' + (px+1) + ': ';
					var isEmpty = true;
					var isReady = false;
					if (t && t[0] > 0) {
						isEmpty = false;
						var pl = g.plantsById[t[0] - 1];
						if (pl) {
							var mature = pl.mature || 100;
							var pct = Math.floor((t[1] / mature) * 100);
							lbl += pl.name + ', ' + pct + '% grown';
							plotBtn.textContent = pl.name.substring(0, 3) + ' ' + pct + '%';
							if (t[1] >= mature) {
								isReady = true;
								lbl += '. READY TO HARVEST - click to harvest';
								plotBtn.style.background = '#353';
							}
						}
					} else {
						lbl += 'Empty';
						if (g.seedSelected >= 0 && g.plantsById[g.seedSelected]) {
							lbl += '. Click to plant ' + g.plantsById[g.seedSelected].name;
						} else {
							lbl += '. Select a seed first, then click here to plant';
						}
						plotBtn.textContent = '-';
					}
					plotBtn.setAttribute('aria-label', lbl);
					plotBtn.addEventListener('click', function() {
						// Click the actual tile using its ID
						var actualTile = l('gardenTile-' + px + '-' + py);
						if (actualTile) {
							actualTile.click();
							// Announce what happened
							setTimeout(function() {
								var newT = g.plot[py] && g.plot[py][px];
								if (newT && newT[0] > 0) {
									var newPl = g.plantsById[newT[0] - 1];
									if (newPl) {
										MOD.announce('Planted ' + newPl.name + ' at row ' + (py+1) + ', column ' + (px+1));
									}
								} else {
									MOD.announce('Harvested plant from row ' + (py+1) + ', column ' + (px+1));
								}
								MOD.createGardenAccessiblePanel(g); // Refresh panel
							}, 100);
						}
					});
					plotDiv.appendChild(plotBtn);
				})(x, y);
			}
		}
		panel.appendChild(plotDiv);
		// Insert panel after the garden minigame
		gardenContainer.parentNode.insertBefore(panel, gardenContainer.nextSibling);
	},
	updateGardenPlotLabels: function() {
		var MOD = this;
		if (!MOD.gardenReady()) return;
		var g = Game.Objects['Farm'].minigame;
		// Update status display
		var statusDiv = l('a11yGardenStatus');
		if (statusDiv) {
			var freezeStatus = g.freeze ? 'FROZEN (plants not growing)' : 'Active';
			var soilName = g.soils && g.soil !== undefined && g.soils[g.soil] ? g.soils[g.soil].name : 'Unknown';
			statusDiv.innerHTML = '<strong>Status:</strong> ' + freezeStatus + ' | <strong>Soil:</strong> ' + soilName;
		}
		// Also re-label the original garden elements
		MOD.labelOriginalGardenElements(g);
		// Update accessible panel plot labels
		for (var y = 0; y < g.plotHeight; y++) {
			for (var x = 0; x < g.plotWidth; x++) {
				var plotBtn = l('a11yGardenPlot-' + y + '-' + x);
				if (!plotBtn) continue;
				var t = g.plot[y] && g.plot[y][x];
				var lbl = 'Row ' + (y+1) + ' Col ' + (x+1) + ': ';
				if (t && t[0] > 0) {
					var pl = g.plantsById[t[0] - 1];
					if (pl) {
						var mature = pl.mature || 100;
						var pct = Math.floor((t[1] / mature) * 100);
						lbl += pl.name + ' ' + pct + '%';
						plotBtn.textContent = pl.name.substring(0, 3) + ' ' + pct + '%';
						if (t[1] >= mature) {
							lbl += ' READY';
							plotBtn.style.background = '#353';
						} else {
							plotBtn.style.background = '#222';
						}
					}
				} else {
					lbl += 'Empty';
					plotBtn.textContent = '-';
					plotBtn.style.background = '#222';
				}
				plotBtn.setAttribute('aria-label', lbl);
			}
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
		// Enhance spell buttons - simplified labels
		document.querySelectorAll('.grimoireSpell').forEach(function(b) {
			var id = b.id.replace('grimoireSpell', ''), sp = grim.spellsById[id];
			if (sp) {
				var cost = Math.floor(grim.getSpellCost(sp) * 100) / 100;
				// Simple button label: just name and cost
				var lbl = sp.name + ', ' + cost + ' magic';
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
		// Store section
		var st = l('storeTitle');
		if (st) { st.setAttribute('role', 'heading'); st.setAttribute('aria-level', '2'); }
		// Upgrades section
		var up = l('upgrades');
		if (up) { up.setAttribute('role', 'region'); up.setAttribute('aria-label', 'Available Upgrades'); }
		// Buildings section
		var pr = l('products');
		if (pr) { pr.setAttribute('role', 'region'); pr.setAttribute('aria-label', 'Buildings for purchase'); }
	},
	addStructuralHeadings: function() {
		var MOD = this;
		// Add Buildings heading between upgrades and building list in the store
		var products = l('products');
		if (products && !l('a11yBuildingsHeading')) {
			var buildingsHeading = document.createElement('h3');
			buildingsHeading.id = 'a11yBuildingsHeading';
			buildingsHeading.textContent = 'Buildings';
			buildingsHeading.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
			// Insert before the products container (after upgrades, before buildings)
			products.parentNode.insertBefore(buildingsHeading, products);
		}
		// Note: Store heading already exists via #storeTitle element
		// Add heading for selectors area
		MOD.addSelectorsHeading();
	},
	addSelectorsHeading: function() {
		var MOD = this;
		// Find the selectors container (usually above the store)
		var storePreButtons = document.querySelector('.storePreButtons');
		if (storePreButtons && !l('a11ySelectorsHeading')) {
			var selectorsHeading = document.createElement('h3');
			selectorsHeading.id = 'a11ySelectorsHeading';
			selectorsHeading.textContent = 'Appearance Selectors';
			selectorsHeading.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
			storePreButtons.insertBefore(selectorsHeading, storePreButtons.firstChild);
			storePreButtons.setAttribute('role', 'region');
			storePreButtons.setAttribute('aria-labelledby', 'a11ySelectorsHeading');
		}
	},
	enhanceUpgradeShop: function() {
		var MOD = this;
		for (var i in Game.UpgradesInStore) { var u = Game.UpgradesInStore[i]; if (u) MOD.populateUpgradeLabel(u); }
		var uc = l('upgrades');
		if (uc) uc.querySelectorAll('.crate.upgrade, button.crate.upgrade').forEach(function(c) {
			var id = c.dataset.id;
			if (id && Game.UpgradesById[id]) MOD.labelUpgradeCrate(c, Game.UpgradesById[id]);
		});
		var vc = l('vaultUpgrades');
		if (vc) {
			vc.setAttribute('role', 'region'); vc.setAttribute('aria-label', 'Vaulted');
			vc.querySelectorAll('.crate.upgrade').forEach(function(c) {
				var id = c.dataset.id;
				if (id && Game.UpgradesById[id]) MOD.labelUpgradeCrate(c, Game.UpgradesById[id], true);
			});
		}
	},
	stripHtml: function(h) { return h ? h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''; },
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
			lines.push('Time until affordable: ' + MOD.getTimeUntilAfford(building.price));
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
		var MOD = this;
		try {
			var productEl = l('product' + building.id);
			if (!productEl) return;
			var btnId = 'a11y-info-btn-building-' + building.id;
			var btn = l(btnId);
			if (!btn) {
				btn = document.createElement('button');
				btn.id = btnId;
				btn.type = 'button';
				btn.textContent = 'Info';
				btn.style.cssText = 'display:block;width:100%;padding:5px;margin-top:2px;background:#1a1a1a;color:#fff;border:1px solid #444;cursor:pointer;font-size:12px;';
				if (productEl.nextSibling) {
					productEl.parentNode.insertBefore(btn, productEl.nextSibling);
				} else {
					productEl.parentNode.appendChild(btn);
				}
			}
			btn.setAttribute('aria-label', MOD.getBuildingInfoText(building));
			btn.setAttribute('role', 'button');
			btn.setAttribute('tabindex', '0');
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
		var a = l('ariaReader-upgrade-' + u.id);
		if (a) {
			var n = u.dname || u.name, p = Beautify(Math.round(u.getPrice())), s = u.bought ? 'Purchased' : (u.canBuy() ? 'Affordable' : 'Too expensive');
			var t = n + '. ' + s + '. ';
			if (!u.bought) t += 'Price: ' + p + '. ';
			if (u.desc) t += this.stripHtml(u.desc);
			a.innerHTML = t;
		}
	},
	labelUpgradeCrate: function(c, u, v) {
		var MOD = this;
		if (!c || !u) return;
		var n = u.dname || u.name;
		// Simplified main button - just name (and vaulted status if applicable)
		var lbl = n;
		if (v) lbl += ' (Vaulted)';
		if (u.bought) lbl = n + ' (Purchased)';
		c.setAttribute('aria-label', lbl);
		c.setAttribute('role', 'button');
		c.setAttribute('tabindex', '0');
		if (!c.dataset.a11yEnhanced) {
			c.dataset.a11yEnhanced = 'true';
			c.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
		}
		// Add info button with full details (not for vaulted or purchased)
		if (!v && !u.bought) {
			MOD.ensureUpgradeInfoButton(u, c);
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
		var MOD = this, n = u.dname || u.name, p = Beautify(Math.round(u.getPrice()));
		var can = Game.heavenlyChips >= u.getPrice() && !u.bought;
		var s = u.bought ? 'Purchased' : (can ? 'Affordable' : 'Too expensive');
		var t = 'Heavenly: ' + n + '. ' + s + '.';
		if (!u.bought) t += ' Cost: ' + p + ' chips.';
		if (u.desc) t += ' ' + MOD.stripHtml(u.desc);
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
		// Run building minigame labels every 15 ticks to catch UI refreshes
		if (Game.T % 15 === 0) {
			MOD.enhanceBuildingMinigames();
		}
		if (Game.T % 30 === 0) {
			MOD.updateWrinklerLabels();
			MOD.updateSugarLumpLabel();
			MOD.checkVeilState();
			MOD.updateBuffTracker();
			MOD.updateAchievementTracker();
			MOD.updateLegacyButtonLabel();
			MOD.updateActiveBuffsPanel();
			MOD.updateShimmerOverlay();
			MOD.updateMainInterfaceDisplays();
			// Update garden labels more frequently
			if (MOD.gardenReady()) {
				MOD.labelOriginalGardenElements(Game.Objects['Farm'].minigame);
			}
		}
		if (Game.T % 60 === 0) {
			MOD.enhanceUpgradeShop();
			MOD.updateDragonLabels();
			MOD.updateQoLLabels();
			MOD.filterUnownedBuildings();
			MOD.labelBuildingLevels();
			MOD.labelBuildingRows();
			if (Game.onMenu === 'stats') MOD.enhanceAchievementDetails();
			if (MOD.gardenReady()) {
				// Create panel if it doesn't exist, otherwise just update labels
				if (!l('a11yGardenPanel')) {
					MOD.enhanceGardenMinigame();
				} else {
					MOD.updateGardenPlotLabels();
				}
			}
			if (MOD.pantheonReady()) {
				if (!l('a11yPantheonPanel')) {
					MOD.createEnhancedPantheonPanel();
				}
			}
			if (Game.Objects['Wizard tower'] && Game.Objects['Wizard tower'].minigame) MOD.enhanceGrimoireMinigame();
			if (Game.Objects['Bank'] && Game.Objects['Bank'].minigame) MOD.enhanceStockMarketMinigame();
		}
		if (Game.OnAscend) {
			if (!MOD.wasOnAscend) {
				MOD.wasOnAscend = true;
				MOD.enhanceHeavenlyUpgrades();
				MOD.enhancePermanentUpgradeSlots();
			}
			if (MOD.lastHeavenlyChips !== Game.heavenlyChips) {
				MOD.lastHeavenlyChips = Game.heavenlyChips;
				MOD.enhanceHeavenlyUpgrades();
			}
		} else MOD.wasOnAscend = false;
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
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-labelledby', 'a11yBuffsHeading');
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #66a;padding:10px;margin:10px 0;';
		var heading = document.createElement('h2');
		heading.id = 'a11yBuffsHeading';
		heading.textContent = 'Active Buffs';
		heading.style.cssText = 'color:#aaf;margin:0 0 10px 0;font-size:16px;';
		panel.appendChild(heading);
		var buffList = document.createElement('div');
		buffList.id = 'a11yBuffList';
		buffList.setAttribute('role', 'list');
		buffList.style.cssText = 'color:#fff;font-size:14px;';
		buffList.textContent = 'No active buffs';
		panel.appendChild(buffList);
		// Insert after products
		products.parentNode.insertBefore(panel, products.nextSibling);
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
			buffList.innerHTML = '<div role="listitem" tabindex="0">No active buffs</div>';
		} else {
			var html = '';
			buffs.forEach(function(buff) {
				html += '<div role="listitem" tabindex="0" style="padding:4px 0;border-bottom:1px solid #444;">';
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

		// Find the highest unlocked building index
		var highestUnlocked = -1;
		for (var i = 0; i < numBuildings; i++) {
			var bld = Game.ObjectsById[i];
			if (bld && !bld.locked) {
				highestUnlocked = i;
			}
		}

		// Show buildings like the game: unlocked ones + a few mystery ones
		for (var i = 0; i < numBuildings; i++) {
			var bld = Game.ObjectsById[i];
			if (!bld) continue;
			var productEl = l('product' + bld.id);
			if (!productEl) continue;

			// Find the info button for this building
			var infoBtn = l('a11y-info-btn-building-' + bld.id);
			var levelLabel = l('a11yBuildingLevel' + bld.id);

			if (bld.locked) {
				// This building is locked
				var distanceFromUnlocked = i - highestUnlocked;

				if (distanceFromUnlocked <= 4) {
					// Show as mystery building (just cost, no details)
					productEl.style.display = '';
					productEl.removeAttribute('aria-hidden');

					// Update label to show it's a mystery building with just cost
					var cost = Beautify(bld.price);
					var timeUntil = MOD.getTimeUntilAfford(bld.price);
					productEl.setAttribute('aria-label', 'Mystery building. Cost: ' + cost + ' cookies. Time until affordable: ' + timeUntil);

					// Hide the detailed info button for mystery buildings
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
				// Unlocked building - show with full info
				productEl.style.display = '';
				productEl.removeAttribute('aria-hidden');

				// Show the info button and level label
				if (infoBtn) {
					infoBtn.style.display = '';
					infoBtn.removeAttribute('aria-hidden');
				}
				if (levelLabel) {
					levelLabel.style.display = '';
					levelLabel.removeAttribute('aria-hidden');
				}

				// Update the main label with name and amount owned
				productEl.setAttribute('aria-label', bld.name + ', ' + bld.amount + ' owned. Cost: ' + Beautify(bld.price) + ' cookies');
			}
		}
	},

	// ============================================
	// MODULE: Enhanced Shimmer Labels
	// ============================================
	createShimmerOverlay: function() {
		var MOD = this;
		var oldOverlay = l('a11yShimmerOverlay');
		if (oldOverlay) oldOverlay.remove();
		var overlay = document.createElement('div');
		overlay.id = 'a11yShimmerOverlay';
		overlay.setAttribute('role', 'region');
		overlay.setAttribute('aria-label', 'Special Cookies');
		overlay.setAttribute('aria-live', 'polite');
		overlay.style.cssText = 'position:fixed;top:10px;left:10px;background:#000;border:2px solid #fc0;padding:10px;z-index:99999;display:none;';
		document.body.appendChild(overlay);
	},
	updateShimmerOverlay: function() {
		var MOD = this;
		var overlay = l('a11yShimmerOverlay');
		if (!overlay) return;
		if (!Game.shimmers || Game.shimmers.length === 0) {
			overlay.style.display = 'none';
			return;
		}
		var html = '<h3 style="color:#fc0;margin:0 0 5px 0;">Active Shimmers:</h3>';
		Game.shimmers.forEach(function(shimmer, idx) {
			var type = 'Unknown';
			if (shimmer.type === 'golden') {
				type = shimmer.wrath ? 'Wrath Cookie' : 'Golden Cookie';
			} else if (shimmer.type === 'reindeer') {
				type = 'Reindeer';
			}
			html += '<button type="button" id="a11yShimmer' + idx + '" style="display:block;width:100%;padding:8px;margin:2px 0;background:#333;border:1px solid #fc0;color:#fff;cursor:pointer;">';
			html += type + ' - Click to collect';
			html += '</button>';
		});
		overlay.innerHTML = html;
		overlay.style.display = 'block';
		// Add click handlers
		Game.shimmers.forEach(function(shimmer, idx) {
			var btn = l('a11yShimmer' + idx);
			if (btn) {
				btn.addEventListener('click', function() {
					shimmer.pop();
				});
			}
		});
	},

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
		var MOD = this;
		var menu = l('menu');
		if (!menu || Game.onMenu !== 'stats') return;
		menu.querySelectorAll('.crate.achievement').forEach(function(crate) {
			var id = crate.dataset.id;
			if (!id) return;
			var ach = Game.AchievementsById[id];
			if (!ach) return;
			var name = ach.dname || ach.name;
			var desc = MOD.stripHtml(ach.desc || '');
			var status = ach.won ? 'Unlocked' : 'Locked';
			// Try to determine unlock condition
			var condition = MOD.getAchievementCondition(ach);
			var lbl = name + '. ' + status + '. ' + desc;
			if (condition) lbl += ' Requirement: ' + condition;
			crate.setAttribute('aria-label', lbl);
			crate.setAttribute('role', 'listitem');
			crate.setAttribute('tabindex', '0');
		});
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
		cpcDiv.style.cssText = 'background:#1a1a1a;color:#fff;padding:8px;margin:5px;text-align:center;border:1px solid #444;font-size:12px;';
		bigCookie.parentNode.insertBefore(cpcDiv, bigCookie.nextSibling);
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
					// This shows milk percentage and other numbers
					child.setAttribute('tabindex', '0');
					MOD.labelCookieNumbers(child);
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
		// Look for the FPS/performance counter
		var fpsEl = l('fps');
		if (fpsEl) {
			var fpsText = (fpsEl.textContent || '').trim();
			fpsEl.setAttribute('tabindex', '0');
			fpsEl.setAttribute('aria-label', 'Frame rate: ' + fpsText + ' FPS (game performance)');
		}
		// Check for any element showing a number 70-100 that could be FPS percentage
		var sectionLeft = l('sectionLeft');
		var sectionMiddle = l('sectionMiddle');
		var sections = [sectionLeft, sectionMiddle, document.body];
		sections.forEach(function(section) {
			if (!section) return;
			section.querySelectorAll('div, span').forEach(function(el) {
				if (el.getAttribute('aria-label')) return; // Already labeled
				if (el.id && el.id !== '') return; // Has an ID, likely known
				var text = (el.textContent || '').trim();
				var num = parseInt(text);
				// Check for number in the 70-100 range without % sign (likely FPS)
				if (!isNaN(num) && num >= 70 && num <= 100 && !text.includes('%')) {
					el.setAttribute('tabindex', '0');
					// Check if it matches current FPS
					var currentFps = Game.fps || 30;
					var fpsPercent = Math.round((Game.actualFps || currentFps) / 30 * 100);
					if (Math.abs(num - fpsPercent) < 5 || Math.abs(num - (Game.actualFps || 30)) < 5) {
						el.setAttribute('aria-label', 'Frame rate indicator: ' + num + ' (game performance, starts at 100, drops with lag)');
					} else {
						el.setAttribute('aria-label', 'Performance or efficiency: ' + num);
					}
				}
			});
		});
		// Also check the topBar and other areas
		var topBar = l('topBar');
		if (topBar) {
			topBar.querySelectorAll('div, span').forEach(function(el) {
				if (el.getAttribute('aria-label')) return;
				var text = (el.textContent || '').trim();
				var num = parseInt(text);
				if (!isNaN(num) && num >= 70 && num <= 100 && !text.includes('%')) {
					el.setAttribute('tabindex', '0');
					el.setAttribute('aria-label', 'Performance indicator: ' + num);
				}
			});
		}
		// Check near menu buttons
		var prefsButton = l('prefsButton');
		if (prefsButton) {
			var parent = prefsButton.parentNode;
			if (parent) {
				for (var i = 0; i < parent.children.length; i++) {
					var child = parent.children[i];
					if (child.getAttribute('aria-label')) continue;
					if (child.id === 'prefsButton' || child.id === 'statsButton' || child.id === 'logButton') continue;
					var text = (child.textContent || '').trim();
					var num = parseInt(text);
					if (!isNaN(num) && num >= 0 && num <= 100) {
						child.setAttribute('tabindex', '0');
						child.setAttribute('aria-label', 'FPS or performance: ' + num + ' (typically starts at 100, decreases with game lag)');
					}
				}
			}
		}
		// Log mystery values for debugging
		console.log('[A11y] Game.fps:', Game.fps, 'Game.actualFps:', Game.actualFps, 'Game.cpsSucked:', Game.cpsSucked);
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
	},

	save: function() { return ''; },
	load: function(s) {}
});
