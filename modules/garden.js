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
	var selectedSeed = -1;
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
		var status = isMature ? 'Mature' : (growthPct < 33 ? 'Budding' : 'Growing');

		return {
			isEmpty: false,
			name: plant.name,
			growth: growthPct,
			status: status,
			isMature: isMature,
			plantId: plantId
		};
	}

	/**
	 * Announce tile information via live region
	 */
	function announceTile(x, y) {
		var info = getTileInfo(x, y);
		var text = 'Plot ' + (x + 1) + ',' + (y + 1) + ': ';

		if (info.isEmpty) {
			text += 'Empty';
			if (selectedSeed >= 0) {
				var g = getGarden();
				var seed = g.plantsById[selectedSeed];
				if (seed) {
					text += '. Press Enter to plant ' + seed.name;
				}
			}
		} else {
			text += info.name + ', ' + info.growth + '%, ' + info.status;
			if (info.isMature) {
				text += '. Press Enter to harvest';
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

		if (info.isEmpty && selectedSeed >= 0) {
			// Plant the selected seed
			g.useTool(selectedSeed, x, y);
			var seed = g.plantsById[selectedSeed];
			announce('Planted ' + (seed ? seed.name : 'seed') + ' at ' + (x + 1) + ',' + (y + 1));
		} else if (!info.isEmpty && info.isMature) {
			// Harvest mature plant
			g.harvest(x, y);
			announce('Harvested ' + info.name + ' from ' + (x + 1) + ',' + (y + 1));
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

		// Tools section
		var toolsHeading = document.createElement('h3');
		toolsHeading.textContent = 'Tools';
		toolsHeading.style.cssText = 'color:#ccc;margin:15px 0 5px 0;font-size:14px;';
		panel.appendChild(toolsHeading);

		var toolsDiv = document.createElement('div');
		toolsDiv.style.cssText = 'margin-bottom:10px;';

		// Harvest All button
		var harvestBtn = createToolButton('Harvest All', 'Harvest all mature plants', function() {
			var g = getGarden();
			if (g && g.harvestAll) {
				g.harvestAll();
				announce('Harvested all mature plants');
			}
		});
		toolsDiv.appendChild(harvestBtn);

		// Freeze/Unfreeze button
		var freezeBtn = createToolButton(
			g.freeze ? 'Unfreeze Garden' : 'Freeze Garden',
			g.freeze ? 'Resume plant growth' : 'Pause all plant growth',
			function() {
				var g = getGarden();
				g.freeze = g.freeze ? 0 : 1;
				announce(g.freeze ? 'Garden frozen' : 'Garden unfrozen');
				this.textContent = g.freeze ? 'Unfreeze Garden' : 'Freeze Garden';
			}
		);
		toolsDiv.appendChild(freezeBtn);

		panel.appendChild(toolsDiv);

		// Seeds section
		var seedsHeading = document.createElement('h3');
		seedsHeading.textContent = 'Seeds (select one, then use grid to plant)';
		seedsHeading.style.cssText = 'color:#ccc;margin:15px 0 5px 0;font-size:14px;';
		panel.appendChild(seedsHeading);

		var seedsDiv = document.createElement('div');
		seedsDiv.id = 'a11yGardenSeedsContainer';
		seedsDiv.setAttribute('role', 'listbox');
		seedsDiv.setAttribute('aria-label', 'Available seeds');
		seedsDiv.style.cssText = 'max-height:150px;overflow-y:auto;background:#222;padding:5px;';

		// Add seed buttons
		for (var id in g.plantsById) {
			var plant = g.plantsById[id];
			if (!plant || !plant.unlocked) continue;

			(function(p, seedId) {
				var seedBtn = document.createElement('button');
				seedBtn.setAttribute('role', 'option');
				seedBtn.setAttribute('aria-selected', selectedSeed == seedId ? 'true' : 'false');
				seedBtn.textContent = p.name + (selectedSeed == seedId ? ' (SELECTED)' : '');
				seedBtn.style.cssText = 'display:block;width:100%;padding:6px;margin:2px 0;background:' +
					(selectedSeed == seedId ? '#353' : '#333') +
					';border:1px solid ' + (selectedSeed == seedId ? '#4a4' : '#555') +
					';color:#fff;cursor:pointer;text-align:left;';

				seedBtn.addEventListener('click', function() {
					selectedSeed = parseInt(seedId);
					g.seedSelected = selectedSeed;
					announce(p.name + ' seed selected. Enter grid and press Enter on empty plot to plant');
					updateSeedSelection();
				});

				seedsDiv.appendChild(seedBtn);
			})(plant, id);
		}

		panel.appendChild(seedsDiv);

		// Insert panel
		container.parentNode.insertBefore(panel, container.nextSibling);
		panelCreated = true;

		// Add global keyboard listener for grid navigation
		document.addEventListener('keydown', handleKeyDown);
	}

	/**
	 * Create a tool button
	 */
	function createToolButton(text, ariaLabel, onClick) {
		var btn = document.createElement('button');
		btn.textContent = text;
		btn.setAttribute('aria-label', ariaLabel);
		btn.style.cssText = 'padding:8px 12px;margin:2px;background:#363;border:1px solid #4a4;color:#fff;cursor:pointer;';
		btn.addEventListener('click', onClick);
		return btn;
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
	 * Update seed selection visual state
	 */
	function updateSeedSelection() {
		var container = document.getElementById('a11yGardenSeedsContainer');
		if (!container) return;

		var buttons = container.querySelectorAll('button');
		var g = getGarden();

		buttons.forEach(function(btn, idx) {
			var plantId = Object.keys(g.plantsById).filter(function(k) {
				return g.plantsById[k].unlocked;
			})[idx];

			if (plantId !== undefined) {
				var plant = g.plantsById[plantId];
				var isSelected = selectedSeed == plantId;
				btn.textContent = plant.name + (isSelected ? ' (SELECTED)' : '');
				btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
				btn.style.background = isSelected ? '#353' : '#333';
				btn.style.borderColor = isSelected ? '#4a4' : '#555';
			}
		});
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
