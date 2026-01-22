/**
 * Audio Cues Module - Earcons for Accessibility
 *
 * Provides audio feedback for:
 * - Affordability: tick sound when building/upgrade becomes affordable
 * - Production: ambient sound when CPS display focused, pitch-shifted by buffs
 * - Magic: notification when Grimoire magic is full
 */

var AudioCuesModule = (function() {
	'use strict';

	// State tracking
	var lastAffordableBuildings = {};
	var lastAffordableUpgrades = {};
	var lastMagicFull = false;
	var isCpsFocused = false;
	var productionInterval = null;

	// AudioContext for pitch shifting
	var audioContext = null;
	var productionOscillator = null;
	var productionGain = null;

	// Configuration
	var config = {
		affordabilityEnabled: true,
		productionEnabled: true,
		magicEnabled: true,
		volume: 0.3
	};

	/**
	 * Initialize AudioContext (must be after user interaction)
	 */
	function initAudioContext() {
		if (audioContext) return;

		try {
			audioContext = new (window.AudioContext || window.webkitAudioContext)();
		} catch (e) {
			console.log('[A11y Audio] Could not create AudioContext:', e);
		}
	}

	/**
	 * Play the tick sound (Sugar Lump Ripe) for affordability
	 */
	function playAffordabilitySound() {
		if (!config.affordabilityEnabled) return;

		try {
			// Use Cookie Clicker's built-in PlaySound if available
			if (typeof PlaySound === 'function') {
				PlaySound('snd/tick.mp3', 0.5);
			} else {
				// Fallback: create audio element
				var audio = new Audio('snd/tick.mp3');
				audio.volume = config.volume;
				audio.play().catch(function() {});
			}
		} catch (e) {
			// Silent fail - audio may not be available
		}
	}

	/**
	 * Play magic full notification sound
	 */
	function playMagicFullSound() {
		if (!config.magicEnabled) return;

		try {
			if (typeof PlaySound === 'function') {
				PlaySound('snd/shimmerClick.mp3', 0.5);
			} else {
				var audio = new Audio('snd/shimmerClick.mp3');
				audio.volume = config.volume;
				audio.play().catch(function() {});
			}

			// Also announce
			announce('Grimoire magic is full');
		} catch (e) {}
	}

	/**
	 * Get current buff multiplier for pitch calculation
	 * Returns: < 1 for Clot (lower pitch), > 1 for Frenzy (higher pitch), 1 for normal
	 */
	function getBuffMultiplier() {
		if (!Game.buffs) return 1;

		var mult = 1;

		// Check for Frenzy-type buffs (higher production = higher pitch)
		if (Game.buffs['Frenzy']) mult *= 1.5;
		if (Game.buffs['Dragon Harvest']) mult *= 1.3;
		if (Game.buffs['Elder frenzy']) mult *= 2;
		if (Game.buffs['Click frenzy']) mult *= 1.2;

		// Check for Clot (lower production = lower pitch)
		if (Game.buffs['Clot']) mult *= 0.5;

		// Building special buffs
		if (Game.buffs['High-five']) mult *= 1.1;
		if (Game.buffs['Congregation']) mult *= 1.1;

		return mult;
	}

	/**
	 * Start production sound (when CPS display is focused)
	 * Uses pitch shifting based on current buffs
	 */
	function startProductionSound() {
		if (!config.productionEnabled || !audioContext) return;

		// Resume context if suspended
		if (audioContext.state === 'suspended') {
			audioContext.resume();
		}

		// Stop existing oscillator
		stopProductionSound();

		try {
			// Create oscillator for ambient "baking" sound
			productionOscillator = audioContext.createOscillator();
			productionGain = audioContext.createGain();

			// Base frequency - a warm, low hum
			var baseFreq = 110; // A2 note
			var buffMult = getBuffMultiplier();

			// Adjust pitch based on buffs
			// Clot: lower pitch (0.5x = one octave down)
			// Frenzy: higher pitch (1.5x = perfect fifth up)
			productionOscillator.frequency.value = baseFreq * buffMult;

			// Use triangle wave for softer sound
			productionOscillator.type = 'triangle';

			// Set volume low enough to be ambient
			productionGain.gain.value = config.volume * 0.3;

			// Connect nodes
			productionOscillator.connect(productionGain);
			productionGain.connect(audioContext.destination);

			// Start oscillator
			productionOscillator.start();

			// Update pitch periodically based on buff changes
			productionInterval = setInterval(function() {
				if (productionOscillator) {
					var newMult = getBuffMultiplier();
					productionOscillator.frequency.value = baseFreq * newMult;
				}
			}, 500);

		} catch (e) {
			console.log('[A11y Audio] Error starting production sound:', e);
		}
	}

	/**
	 * Stop production sound
	 */
	function stopProductionSound() {
		if (productionInterval) {
			clearInterval(productionInterval);
			productionInterval = null;
		}

		if (productionOscillator) {
			try {
				productionOscillator.stop();
				productionOscillator.disconnect();
			} catch (e) {}
			productionOscillator = null;
		}

		if (productionGain) {
			try {
				productionGain.disconnect();
			} catch (e) {}
			productionGain = null;
		}
	}

	/**
	 * Check for newly affordable buildings/upgrades
	 */
	function checkAffordability() {
		if (!config.affordabilityEnabled) return;

		var cookies = Game.cookies;
		var playSound = false;

		// Check buildings
		for (var i in Game.ObjectsById) {
			var building = Game.ObjectsById[i];
			var wasAffordable = lastAffordableBuildings[building.name];
			var isAffordable = cookies >= building.getPrice();

			if (isAffordable && !wasAffordable && building.amount > 0) {
				// Building just became affordable (and we've bought at least one before)
				playSound = true;
			}

			lastAffordableBuildings[building.name] = isAffordable;
		}

		// Check upgrades in store
		for (var j in Game.UpgradesInStore) {
			var upgrade = Game.UpgradesInStore[j];
			var wasUpgradeAffordable = lastAffordableUpgrades[upgrade.name];
			var isUpgradeAffordable = cookies >= upgrade.getPrice();

			if (isUpgradeAffordable && !wasUpgradeAffordable) {
				playSound = true;
			}

			lastAffordableUpgrades[upgrade.name] = isUpgradeAffordable;
		}

		if (playSound) {
			playAffordabilitySound();
		}
	}

	/**
	 * Check if Grimoire magic is full
	 */
	function checkMagicFull() {
		if (!config.magicEnabled) return;

		var wizardTower = Game.Objects['Wizard tower'];
		if (!wizardTower || !wizardTower.minigame) return;

		var grim = wizardTower.minigame;
		var isFull = grim.magic >= grim.magicM;

		if (isFull && !lastMagicFull) {
			playMagicFullSound();
		}

		lastMagicFull = isFull;
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
	 * Set up CPS display focus tracking
	 */
	function setupCpsFocusTracking() {
		var cpsDisplay = document.getElementById('cookies');
		if (!cpsDisplay) return;

		cpsDisplay.setAttribute('tabindex', '0');
		cpsDisplay.setAttribute('role', 'status');

		cpsDisplay.addEventListener('focus', function() {
			isCpsFocused = true;
			initAudioContext();
			startProductionSound();
		});

		cpsDisplay.addEventListener('blur', function() {
			isCpsFocused = false;
			stopProductionSound();
		});
	}

	/**
	 * Main update loop - called periodically
	 */
	function update() {
		checkAffordability();
		checkMagicFull();
	}

	/**
	 * Initialize the module
	 */
	function init() {
		setupCpsFocusTracking();

		// Initialize affordability tracking
		for (var i in Game.ObjectsById) {
			var building = Game.ObjectsById[i];
			lastAffordableBuildings[building.name] = Game.cookies >= building.getPrice();
		}

		for (var j in Game.UpgradesInStore) {
			var upgrade = Game.UpgradesInStore[j];
			lastAffordableUpgrades[upgrade.name] = Game.cookies >= upgrade.getPrice();
		}

		// Check magic status
		var wizardTower = Game.Objects['Wizard tower'];
		if (wizardTower && wizardTower.minigame) {
			lastMagicFull = wizardTower.minigame.magic >= wizardTower.minigame.magicM;
		}
	}

	/**
	 * Cleanup
	 */
	function destroy() {
		stopProductionSound();

		if (audioContext) {
			audioContext.close();
			audioContext = null;
		}

		lastAffordableBuildings = {};
		lastAffordableUpgrades = {};
	}

	/**
	 * Configure options
	 */
	function configure(options) {
		if (options.affordabilityEnabled !== undefined) {
			config.affordabilityEnabled = options.affordabilityEnabled;
		}
		if (options.productionEnabled !== undefined) {
			config.productionEnabled = options.productionEnabled;
		}
		if (options.magicEnabled !== undefined) {
			config.magicEnabled = options.magicEnabled;
		}
		if (options.volume !== undefined) {
			config.volume = Math.max(0, Math.min(1, options.volume));
		}
	}

	// Public API
	return {
		init: init,
		update: update,
		destroy: destroy,
		configure: configure,
		playAffordabilitySound: playAffordabilitySound,
		playMagicFullSound: playMagicFullSound,
		startProductionSound: startProductionSound,
		stopProductionSound: stopProductionSound
	};
})();

// Export for use in main mod
if (typeof module !== 'undefined' && module.exports) {
	module.exports = AudioCuesModule;
}
