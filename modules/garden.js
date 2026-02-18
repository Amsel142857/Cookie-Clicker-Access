/**
 * Garden Module - Virtual Grid Navigation System
 *
 * Fixes the freeze issue by replacing 36 real HTML buttons with a single
 * aria-live region and internal coordinate tracking. Arrow keys navigate
 * the virtual grid, updating the live region with tile information.
 */

var GardenModule = (function() {
	'use strict';

	// Virtual focus coordinates
	var focusX = 0;
	var focusY = 0;
	var isActive = false;
	var liveRegion = null;
	var panelCreated = false;

	/**
	 * Check if Garden minigame is ready
	 */
	function isReady() {
		return Game.Objects['Farm'] &&
			   Game.Objects['Farm'].minigame &&
			   Game.Objects['Farm'].level >= 1;
	}

	/**
	 * Get the Garden minigame object
	 */
	function getGarden() {
		return Game.Objects['Farm'].minigame;
	}

	/**
	 * Get tile data at coordinates using native function
	 */
	function getTileInfo(x, y) {
		var g = getGarden();
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
	}

	/**
	 * Announce tile information via live region
	 */
	function announceTile(x, y) {
		var info = getTileInfo(x, y);
		var text = 'R' + (y + 1) + ', C' + (x + 1) + ': ';

		if (info.isEmpty) {
			text += 'Empty';
			var g = getGarden();
			if (g.seedSelected >= 0) {
				var seed = g.plantsById[g.seedSelected];
				if (seed) {
					text += '. Press Enter to plant ' + seed.name;
				}
			}
		} else {
			text += info.name + ', ' + info.stage + ', ' + info.growth + '%';
			if (info.isMature) {
				text += '. Press Enter to harvest';
				if (info.plant && !info.plant.immortal) {
					var g = getGarden();
					var dragonBoost = 1 / (1 + 0.05 * Game.auraMult('Supreme Intellect'));
					var avgTick = info.plant.ageTick + info.plant.ageTickR / 2;
					var ageMult = (g.plotBoost && g.plotBoost[y] && g.plotBoost[y][x]) ? g.plotBoost[y][x][0] : 1;
					var decayFrames = ((100 / (ageMult * avgTick)) * ((100 - info.age) / 100) * dragonBoost * g.stepT) * 30;
					var minuteFrames = Game.fps * 60;
					text += '. Decays in about ' + Game.sayTime(Math.ceil(decayFrames / minuteFrames) * minuteFrames, -1);
				} else if (info.plant && info.plant.immortal) {
					text += '. Does not decay';
				}
			} else {
				if (info.plant) {
					var g = getGarden();
					var dragonBoost = 1 / (1 + 0.05 * Game.auraMult('Supreme Intellect'));
					var avgTick = info.plant.ageTick + info.plant.ageTickR / 2;
					var ageMult = (g.plotBoost && g.plotBoost[y] && g.plotBoost[y][x]) ? g.plotBoost[y][x][0] : 1;
					var matFrames = ((100 / (ageMult * avgTick)) * ((info.matureAge - info.age) / 100) * dragonBoost * g.stepT) * 30;
					var minuteFrames = Game.fps * 60;
					text += '. Matures in about ' + Game.sayTime(Math.ceil(matFrames / minuteFrames) * minuteFrames, -1);
				}
			}
		}

		if (liveRegion) {
			liveRegion.textContent = '';
			setTimeout(function() {
				liveRegion.textContent = text;
			}, 50);
		}
	}

	/**
	 * Handle keyboard navigation in the virtual grid
	 */
	function handleKeyDown(e) {
		if (!isActive || !isReady()) return;

		var g = getGarden();
		var maxX = g.plotWidth - 1;
		var maxY = g.plotHeight - 1;
		var handled = false;

		switch (e.key) {
			case 'ArrowUp':
				if (focusY > 0) {
					focusY--;
					handled = true;
				}
				break;
			case 'ArrowDown':
				if (focusY < maxY) {
					focusY++;
					handled = true;
				}
				break;
			case 'ArrowLeft':
				if (focusX > 0) {
					focusX--;
					handled = true;
				}
				break;
			case 'ArrowRight':
				if (focusX < maxX) {
					focusX++;
					handled = true;
				}
				break;
			case 'Enter':
			case ' ':
				// Interact with tile (plant or harvest)
				interactWithTile(focusX, focusY);
				handled = true;
				break;
			case 'Escape':
				deactivate();
				handled = true;
				break;
			case 'Home':
				focusX = 0;
				focusY = 0;
				handled = true;
				break;
			case 'End':
				focusX = maxX;
				focusY = maxY;
				handled = true;
				break;
		}

		if (handled) {
			e.preventDefault();
			e.stopPropagation();
			if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') {
				announceTile(focusX, focusY);
			}
		}
	}

	/**
	 * Interact with tile at coordinates (plant or harvest)
	 */
	function interactWithTile(x, y) {
		var g = getGarden();
		if (!g) return;

		var info = getTileInfo(x, y);

		if (info.isEmpty && g.seedSelected >= 0) {
			// Plant the selected seed
			g.useTool(g.seedSelected, x, y);
			var seed = g.plantsById[g.seedSelected];
			announce('Planted ' + (seed ? seed.name : 'seed') + ' at R' + (y + 1) + ', C' + (x + 1));
			// Update ARIA labels after game processes the plant action
			setTimeout(function() {
				if (Game.mods && Game.mods['nvda accessibility']) {
					Game.mods['nvda accessibility'].labelOriginalGardenElements(g);
				}
			}, 100);
		} else if (!info.isEmpty && info.isMature) {
			// Harvest mature plant
			g.harvest(x, y);
			announce('Harvested ' + info.name + ' from R' + (y + 1) + ', C' + (x + 1));
			// Update ARIA labels after game processes the harvest action
			setTimeout(function() {
				if (Game.mods && Game.mods['nvda accessibility']) {
					Game.mods['nvda accessibility'].labelOriginalGardenElements(g);
				}
			}, 100);
		} else if (!info.isEmpty) {
			announce(info.name + ' is not ready to harvest. ' + info.growth + '% grown');
		} else {
			announce('Select a seed first, then press Enter to plant');
		}
	}

	/**
	 * Generic announcement helper
	 */
	function announce(text) {
		var announcer = document.getElementById('srAnnouncer');
		if (announcer) {
			announcer.textContent = '';
			setTimeout(function() {
				announcer.textContent = text;
			}, 50);
		}
	}

	/**
	 * Activate virtual grid navigation
	 */
	function activate() {
		if (!isReady()) return;
		isActive = true;
		var g = getGarden();
		focusX = Math.min(focusX, g.plotWidth - 1);
		focusY = Math.min(focusY, g.plotHeight - 1);
		announceTile(focusX, focusY);
		announce('Garden grid active. Use arrow keys to navigate, Enter to interact, Escape to exit');
	}

	/**
	 * Deactivate virtual grid navigation
	 */
	function deactivate() {
		isActive = false;
		announce('Exited garden grid navigation');
	}

	/**
	 * Create the accessible Garden panel with live region
	 */
	function createPanel() {
		if (!isReady()) return;
		if (panelCreated && document.getElementById('a11yGardenVirtualPanel')) return;

		var g = getGarden();
		var container = document.getElementById('row2minigame') || document.getElementById('gardenContent');
		if (!container) return;

		// Remove old panel if exists
		var oldPanel = document.getElementById('a11yGardenVirtualPanel');
		if (oldPanel) oldPanel.remove();

		// Create panel
		var panel = document.createElement('div');
		panel.id = 'a11yGardenVirtualPanel';
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', 'Garden Accessible Controls');
		panel.style.cssText = 'background:#1a2a1a;border:2px solid #4a4;padding:10px;margin:10px 0;';

		// Heading
		var heading = document.createElement('h2');
		heading.textContent = 'Garden - Level ' + (g.parent.level || 1);
		heading.style.cssText = 'color:#6c6;margin:0 0 10px 0;font-size:16px;';
		panel.appendChild(heading);

		// Status info
		var status = document.createElement('div');
		status.id = 'a11yGardenStatusInfo';
		status.setAttribute('tabindex', '0');
		status.style.cssText = 'color:#aaa;margin-bottom:10px;padding:5px;background:#222;';
		updateStatusInfo(status, g);
		panel.appendChild(status);

		// Live region for grid navigation announcements
		liveRegion = document.createElement('div');
		liveRegion.id = 'a11yGardenLiveRegion';
		liveRegion.setAttribute('role', 'status');
		liveRegion.setAttribute('aria-live', 'polite');
		liveRegion.setAttribute('aria-atomic', 'true');
		liveRegion.style.cssText = 'padding:8px;background:#252;border:1px solid #4a4;margin:10px 0;color:#cfc;';
		liveRegion.textContent = 'Press "Enter Garden Grid" to navigate plots';
		panel.appendChild(liveRegion);

		// Enter Grid button
		var enterGridBtn = document.createElement('button');
		enterGridBtn.textContent = 'Enter Garden Grid';
		enterGridBtn.setAttribute('aria-label', 'Enter Garden Grid. Navigate with arrow keys, Enter to plant/harvest, Escape to exit');
		enterGridBtn.style.cssText = 'padding:10px 15px;background:#363;border:2px solid #4a4;color:#fff;cursor:pointer;font-size:14px;margin:5px;';
		enterGridBtn.addEventListener('click', function() {
			activate();
		});
		enterGridBtn.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				activate();
			}
		});
		panel.appendChild(enterGridBtn);

		// Insert panel
		container.parentNode.insertBefore(panel, container.nextSibling);
		panelCreated = true;

		// Add global keyboard listener for grid navigation
		document.addEventListener('keydown', handleKeyDown);
	}

	/**
	 * Update status info display
	 */
	function updateStatusInfo(statusEl, g) {
		var freezeStatus = g.freeze ? 'FROZEN' : 'Active';
		var soilName = g.soils && g.soils[g.soil] ? g.soils[g.soil].name : 'Unknown';
		statusEl.innerHTML = '<strong>Status:</strong> ' + freezeStatus +
			' | <strong>Soil:</strong> ' + soilName +
			' | <strong>Grid:</strong> ' + g.plotWidth + 'x' + g.plotHeight;
	}

	/**
	 * Remove the panel and cleanup
	 */
	function destroy() {
		var panel = document.getElementById('a11yGardenVirtualPanel');
		if (panel) panel.remove();
		document.removeEventListener('keydown', handleKeyDown);
		panelCreated = false;
		isActive = false;
	}

	// Public API
	return {
		init: createPanel,
		destroy: destroy,
		isReady: isReady,
		activate: activate,
		deactivate: deactivate,
		refresh: function() {
			if (isReady()) {
				destroy();
				createPanel();
			}
		}
	};
})();

// Export for use in main mod
if (typeof module !== 'undefined' && module.exports) {
	module.exports = GardenModule;
}
