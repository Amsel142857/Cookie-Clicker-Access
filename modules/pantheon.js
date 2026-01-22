/**
 * Pantheon Module - State Machine for Spirit Placement
 *
 * Fixes the desync issue by implementing a clear "Select and Place" flow
 * instead of drag-and-drop. Uses a state machine to track selection.
 */

var PantheonModule = (function() {
	'use strict';

	// State machine
	var selectedSpirit = null;
	var panelCreated = false;

	// Slot names
	var SLOTS = ['Diamond', 'Ruby', 'Jade'];
	var SLOT_COLORS = ['#9cf', '#f99', '#9f9'];

	/**
	 * Check if Pantheon minigame is ready
	 */
	function isReady() {
		return Game.Objects['Temple'] &&
			   Game.Objects['Temple'].minigame &&
			   Game.Objects['Temple'].level >= 1;
	}

	/**
	 * Get the Pantheon minigame object
	 */
	function getPantheon() {
		return Game.Objects['Temple'].minigame;
	}

	/**
	 * Announce via screen reader
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
	 * Get time until next swap is available
	 */
	function getSwapCooldownText() {
		var pan = getPantheon();
		if (!pan) return '';

		// Calculate time until next swap
		var lastSwapT = pan.swapT || 0;
		var cooldown = 600 * Game.fps; // 10 minutes in frames at 30fps
		var elapsed = Game.T - lastSwapT;
		var remaining = cooldown - elapsed;

		if (remaining <= 0) return '';

		var seconds = Math.ceil(remaining / Game.fps);
		var minutes = Math.floor(seconds / 60);
		seconds = seconds % 60;

		if (minutes > 0) {
			return minutes + ' minute' + (minutes !== 1 ? 's' : '') + ' ' + seconds + ' second' + (seconds !== 1 ? 's' : '');
		}
		return seconds + ' second' + (seconds !== 1 ? 's' : '');
	}

	/**
	 * Select a spirit (Step A of state machine)
	 */
	function selectSpirit(spirit) {
		if (!spirit) {
			selectedSpirit = null;
			announce('Spirit selection cleared');
			updatePanel();
			return;
		}

		selectedSpirit = spirit;
		announce(spirit.name + ' selected. Choose a slot: Diamond, Ruby, or Jade');
		updatePanel();
	}

	/**
	 * Place selected spirit in slot (Step B of state machine)
	 */
	function placeInSlot(slotIndex) {
		var pan = getPantheon();
		if (!pan) return;

		// Validation: Check swaps available
		if (pan.swaps <= 0) {
			var cooldownText = getSwapCooldownText();
			var msg = 'No worship swaps available.';
			if (cooldownText) {
				msg += ' Next swap in ' + cooldownText;
			}
			announce(msg);
			return;
		}

		if (!selectedSpirit) {
			announce('Select a spirit first, then choose a slot');
			return;
		}

		// Place the spirit using native function
		var spiritId = selectedSpirit.id;
		pan.slotGod(pan.gods[spiritId], slotIndex);

		announce(selectedSpirit.name + ' placed in ' + SLOTS[slotIndex] + ' slot');

		// Clear selection
		selectedSpirit = null;
		updatePanel();
	}

	/**
	 * Remove spirit from slot
	 */
	function removeFromSlot(slotIndex) {
		var pan = getPantheon();
		if (!pan) return;

		var currentSpiritId = pan.slot[slotIndex];
		if (currentSpiritId === -1) {
			announce(SLOTS[slotIndex] + ' slot is already empty');
			return;
		}

		var spirit = pan.gods[currentSpiritId];
		pan.slotGod(spirit, -1);

		announce((spirit ? spirit.name : 'Spirit') + ' removed from ' + SLOTS[slotIndex] + ' slot');
		updatePanel();
	}

	/**
	 * Get active effects summary by parsing spirit descriptions
	 */
	function getActiveEffectsSummary() {
		var pan = getPantheon();
		if (!pan) return 'Pantheon not available';

		var effects = [];

		for (var i = 0; i < 3; i++) {
			var spiritId = pan.slot[i];
			if (spiritId === -1) continue;

			var spirit = pan.gods[spiritId];
			if (!spirit) continue;

			// Get the description for this slot level
			var desc = '';
			if (i === 0 && spirit.desc1) desc = spirit.desc1;
			else if (i === 1 && spirit.desc2) desc = spirit.desc2;
			else if (i === 2 && spirit.desc3) desc = spirit.desc3;
			else desc = spirit.desc || '';

			// Strip HTML tags
			desc = desc.replace(/<[^>]*>/g, '');

			effects.push(SLOTS[i] + ': ' + spirit.name + ' - ' + desc);
		}

		if (effects.length === 0) {
			return 'No spirits currently slotted';
		}

		return effects.join(' | ');
	}

	/**
	 * Create the accessible Pantheon panel
	 */
	function createPanel() {
		if (!isReady()) return;

		var pan = getPantheon();
		var container = document.getElementById('row6minigame');
		if (!container) return;

		// Remove old panel
		var oldPanel = document.getElementById('a11yPantheonStateMachine');
		if (oldPanel) oldPanel.remove();

		// Create panel
		var panel = document.createElement('div');
		panel.id = 'a11yPantheonStateMachine';
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', 'Pantheon Accessible Controls');
		panel.style.cssText = 'background:#1a1a2e;border:2px solid #66a;padding:10px;margin:10px 0;';

		// Heading with swap count
		var heading = document.createElement('h2');
		heading.textContent = 'Pantheon - ' + pan.swaps + ' Worship Swap' + (pan.swaps !== 1 ? 's' : '') + ' available';
		heading.style.cssText = 'color:#aaf;margin:0 0 10px 0;font-size:16px;';
		panel.appendChild(heading);

		// Selection status
		var selectionStatus = document.createElement('div');
		selectionStatus.id = 'a11yPantheonSelection';
		selectionStatus.setAttribute('role', 'status');
		selectionStatus.setAttribute('aria-live', 'polite');
		selectionStatus.style.cssText = 'padding:8px;background:#252540;border:1px solid #66a;margin:10px 0;color:#ccf;';
		selectionStatus.textContent = selectedSpirit ?
			'Selected: ' + selectedSpirit.name + '. Choose a slot below.' :
			'Select a spirit from the list below';
		panel.appendChild(selectionStatus);

		// SLOTS SECTION (moved to top as per requirements)
		var slotsHeading = document.createElement('h3');
		slotsHeading.textContent = 'Worship Slots (click to place selected spirit)';
		slotsHeading.style.cssText = 'color:#ccc;margin:15px 0 5px 0;font-size:14px;';
		panel.appendChild(slotsHeading);

		var slotsDiv = document.createElement('div');
		slotsDiv.style.cssText = 'display:flex;gap:10px;margin-bottom:15px;';

		for (var i = 0; i < 3; i++) {
			(function(slotIndex) {
				var slotDiv = document.createElement('div');
				slotDiv.style.cssText = 'flex:1;background:#222;padding:10px;border:2px solid ' + SLOT_COLORS[slotIndex] + ';';

				var slotLabel = document.createElement('div');
				slotLabel.style.cssText = 'color:' + SLOT_COLORS[slotIndex] + ';font-weight:bold;margin-bottom:5px;';
				slotLabel.textContent = SLOTS[slotIndex] + ' Slot';
				slotDiv.appendChild(slotLabel);

				var currentSpiritId = pan.slot[slotIndex];
				var currentSpirit = currentSpiritId !== -1 ? pan.gods[currentSpiritId] : null;

				var currentLabel = document.createElement('div');
				currentLabel.style.cssText = 'color:#aaa;margin-bottom:8px;';
				currentLabel.textContent = currentSpirit ? currentSpirit.name : 'Empty';
				slotDiv.appendChild(currentLabel);

				// Place button
				var placeBtn = document.createElement('button');
				placeBtn.textContent = 'Place Here';
				placeBtn.setAttribute('aria-label', 'Place ' + (selectedSpirit ? selectedSpirit.name : 'selected spirit') + ' in ' + SLOTS[slotIndex] + ' slot');
				placeBtn.style.cssText = 'padding:6px 12px;background:#336;border:1px solid #66a;color:#fff;cursor:pointer;margin-right:5px;';
				placeBtn.disabled = !selectedSpirit;
				placeBtn.style.opacity = selectedSpirit ? '1' : '0.5';
				placeBtn.addEventListener('click', function() {
					placeInSlot(slotIndex);
				});
				slotDiv.appendChild(placeBtn);

				// Remove button (if slot has a spirit)
				if (currentSpirit) {
					var removeBtn = document.createElement('button');
					removeBtn.textContent = 'Remove';
					removeBtn.setAttribute('aria-label', 'Remove ' + currentSpirit.name + ' from ' + SLOTS[slotIndex] + ' slot');
					removeBtn.style.cssText = 'padding:6px 12px;background:#633;border:1px solid #a66;color:#fff;cursor:pointer;';
					removeBtn.addEventListener('click', function() {
						removeFromSlot(slotIndex);
					});
					slotDiv.appendChild(removeBtn);
				}

				slotsDiv.appendChild(slotDiv);
			})(i);
		}

		panel.appendChild(slotsDiv);

		// SPIRITS SECTION
		var spiritsHeading = document.createElement('h3');
		spiritsHeading.textContent = 'Available Spirits (click to select)';
		spiritsHeading.style.cssText = 'color:#ccc;margin:15px 0 5px 0;font-size:14px;';
		panel.appendChild(spiritsHeading);

		var spiritsDiv = document.createElement('div');
		spiritsDiv.setAttribute('role', 'listbox');
		spiritsDiv.setAttribute('aria-label', 'Spirits');
		spiritsDiv.style.cssText = 'max-height:200px;overflow-y:auto;background:#222;padding:5px;';

		for (var id in pan.gods) {
			var spirit = pan.gods[id];
			if (!spirit) continue;

			(function(s) {
				var slottedIn = pan.slot.indexOf(parseInt(s.id));
				var isSelected = selectedSpirit && selectedSpirit.id === s.id;

				var spiritBtn = document.createElement('button');
				spiritBtn.setAttribute('role', 'option');
				spiritBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');

				var btnText = s.name;
				if (slottedIn >= 0) {
					btnText += ' (in ' + SLOTS[slottedIn] + ')';
				}
				if (isSelected) {
					btnText += ' [SELECTED]';
				}
				spiritBtn.textContent = btnText;

				// Description for aria-label
				var desc = s.desc1 || s.desc || '';
				desc = desc.replace(/<[^>]*>/g, '');
				spiritBtn.setAttribute('aria-label', s.name + (slottedIn >= 0 ? ', currently in ' + SLOTS[slottedIn] + ' slot' : '') + '. ' + desc);

				spiritBtn.style.cssText = 'display:block;width:100%;padding:8px;margin:2px 0;background:' +
					(isSelected ? '#336' : '#333') +
					';border:1px solid ' + (isSelected ? '#66a' : '#555') +
					';color:#fff;cursor:pointer;text-align:left;';

				spiritBtn.addEventListener('click', function() {
					selectSpirit(s);
				});

				spiritsDiv.appendChild(spiritBtn);
			})(spirit);
		}

		panel.appendChild(spiritsDiv);

		// Clear selection button
		var clearBtn = document.createElement('button');
		clearBtn.textContent = 'Clear Selection';
		clearBtn.setAttribute('aria-label', 'Clear spirit selection');
		clearBtn.style.cssText = 'padding:8px 15px;background:#444;border:1px solid #666;color:#fff;cursor:pointer;margin:10px 0;';
		clearBtn.addEventListener('click', function() {
			selectSpirit(null);
		});
		panel.appendChild(clearBtn);

		// ACTIVE EFFECTS SUMMARY
		var effectsHeading = document.createElement('h3');
		effectsHeading.textContent = 'Active Effects Summary';
		effectsHeading.style.cssText = 'color:#ccc;margin:15px 0 5px 0;font-size:14px;';
		panel.appendChild(effectsHeading);

		var effectsDiv = document.createElement('div');
		effectsDiv.id = 'a11yPantheonEffects';
		effectsDiv.setAttribute('tabindex', '0');
		effectsDiv.style.cssText = 'padding:10px;background:#222;border:1px solid #444;color:#aaa;font-size:12px;';
		effectsDiv.textContent = getActiveEffectsSummary();
		panel.appendChild(effectsDiv);

		// Insert panel
		container.parentNode.insertBefore(panel, container.nextSibling);
		panelCreated = true;
	}

	/**
	 * Update the panel (refresh)
	 */
	function updatePanel() {
		if (panelCreated) {
			createPanel();
		}
	}

	/**
	 * Destroy the panel
	 */
	function destroy() {
		var panel = document.getElementById('a11yPantheonStateMachine');
		if (panel) panel.remove();
		panelCreated = false;
		selectedSpirit = null;
	}

	// Public API
	return {
		init: createPanel,
		destroy: destroy,
		isReady: isReady,
		refresh: updatePanel,
		selectSpirit: selectSpirit,
		placeInSlot: placeInSlot,
		getActiveEffects: getActiveEffectsSummary
	};
})();

// Export for use in main mod
if (typeof module !== 'undefined' && module.exports) {
	module.exports = PantheonModule;
}
