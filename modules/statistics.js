/**
 * Statistics Module - Aria Labels for Upgrades & Achievements
 *
 * Provides accessible labels for all upgrade icons and achievement icons
 * using Game.Upgrades and Game.Achievements data.
 */

var StatisticsModule = (function() {
	'use strict';

	var labeledElements = new Set();

	/**
	 * Strip HTML tags from text
	 */
	function stripHtml(html) {
		if (!html) return '';
		return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
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
	 * Label all regular upgrades in the upgrades container
	 */
	function labelRegularUpgrades() {
		// Find upgrade containers - they can be in multiple places
		var containers = [
			document.getElementById('upgrades'),
			document.getElementById('techUpgrades'),
			document.querySelector('.listing.crateBox')
		];

		containers.forEach(function(container) {
			if (!container) return;

			// Find all upgrade crates
			var crates = container.querySelectorAll('.crate.upgrade');
			crates.forEach(function(crate) {
				labelUpgradeCrate(crate);
			});
		});

		// Also label upgrades shown in stats menu
		if (Game.onMenu === 'stats') {
			document.querySelectorAll('.crate.upgrade').forEach(function(crate) {
				labelUpgradeCrate(crate);
			});
		}
	}

	/**
	 * Label a single upgrade crate element
	 */
	function labelUpgradeCrate(crate) {
		if (!crate) return;

		// Get upgrade ID from various sources
		var upgradeId = crate.dataset.id ||
						crate.getAttribute('data-id') ||
						extractIdFromOnclick(crate.getAttribute('onclick'));

		if (upgradeId === null || upgradeId === undefined) return;

		var upgrade = Game.UpgradesById[upgradeId] || findUpgradeByName(crate);
		if (!upgrade) return;

		var label = buildUpgradeLabel(upgrade);

		crate.setAttribute('aria-label', label);
		crate.setAttribute('role', 'button');
		crate.setAttribute('tabindex', '0');

		// Add keyboard support if not already added
		if (!crate.dataset.a11yLabeled) {
			crate.dataset.a11yLabeled = 'true';
			crate.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					crate.click();
				}
			});
		}

		labeledElements.add(crate);
	}

	/**
	 * Build a comprehensive label for an upgrade
	 */
	function buildUpgradeLabel(upgrade) {
		var parts = [upgrade.name];

		// Status
		if (upgrade.bought) {
			parts.push('(Owned)');
		} else if (upgrade.unlocked) {
			parts.push('(Available)');
		} else {
			parts.push('(Locked)');
		}

		// Cost (if not bought)
		if (!upgrade.bought && upgrade.basePrice !== undefined) {
			var price = upgrade.getPrice ? upgrade.getPrice() : upgrade.basePrice;
			parts.push('Cost: ' + Beautify(price) + ' cookies');
		}

		// Description
		var desc = stripHtml(upgrade.desc || upgrade.ddesc || '');
		if (desc) {
			parts.push(desc);
		}

		// Type indicators
		if (upgrade.pool === 'prestige') {
			parts.push('[Heavenly Upgrade]');
		} else if (upgrade.pool === 'toggle') {
			parts.push('[Toggle]');
		} else if (upgrade.pool === 'tech') {
			parts.push('[Research]');
		} else if (upgrade.tier) {
			parts.push('[Tier ' + upgrade.tier + ']');
		}

		return parts.join('. ');
	}

	/**
	 * Label all achievements
	 */
	function labelAchievements() {
		// Find achievement containers
		var containers = [
			document.getElementById('achievementsCrate'),
			document.querySelector('.listing.crateBox')
		];

		containers.forEach(function(container) {
			if (!container) return;

			var crates = container.querySelectorAll('.crate.achievement');
			crates.forEach(function(crate) {
				labelAchievementCrate(crate);
			});
		});

		// Also label achievements in stats menu
		if (Game.onMenu === 'stats') {
			document.querySelectorAll('.crate.achievement').forEach(function(crate) {
				labelAchievementCrate(crate);
			});
		}
	}

	/**
	 * Label a single achievement crate element
	 */
	function labelAchievementCrate(crate) {
		if (!crate) return;

		var achievementId = crate.dataset.id ||
							crate.getAttribute('data-id') ||
							extractIdFromOnclick(crate.getAttribute('onclick'));

		if (achievementId === null || achievementId === undefined) return;

		var achievement = Game.AchievementsById[achievementId] || findAchievementByName(crate);
		if (!achievement) return;

		var label = buildAchievementLabel(achievement);

		crate.setAttribute('aria-label', label);
		crate.setAttribute('role', 'listitem');
		crate.setAttribute('tabindex', '0');

		if (!crate.dataset.a11yLabeled) {
			crate.dataset.a11yLabeled = 'true';
		}

		labeledElements.add(crate);
	}

	/**
	 * Build a comprehensive label for an achievement
	 */
	function buildAchievementLabel(achievement) {
		var parts = [achievement.name];

		// Status
		if (achievement.won) {
			parts.push('(Unlocked)');
		} else {
			parts.push('(Locked)');
		}

		// Shadow achievement indicator
		if (achievement.pool === 'shadow') {
			parts.push('[Shadow Achievement]');
		}

		// Description
		var desc = stripHtml(achievement.desc || achievement.ddesc || '');
		if (desc) {
			// For locked achievements, may want to hide spoilers
			if (achievement.won || !achievement.hide) {
				parts.push(desc);
			} else {
				parts.push('Hidden achievement');
			}
		}

		// Category if available
		if (achievement.order !== undefined) {
			// Determine category based on order ranges
			var category = getAchievementCategory(achievement);
			if (category) {
				parts.push('[' + category + ']');
			}
		}

		return parts.join('. ');
	}

	/**
	 * Get achievement category based on its properties
	 */
	function getAchievementCategory(achievement) {
		// Check various achievement pools and types
		if (achievement.pool === 'shadow') return 'Shadow';

		// Check by name patterns for common categories
		var name = achievement.name.toLowerCase();
		if (name.includes('bake') || name.includes('cookie')) return 'Production';
		if (name.includes('click')) return 'Clicking';
		if (name.includes('golden')) return 'Golden Cookies';
		if (name.includes('ascen')) return 'Ascension';
		if (name.includes('build') || name.includes('own')) return 'Buildings';
		if (name.includes('upgrade')) return 'Upgrades';

		return null;
	}

	/**
	 * Label Heavenly Upgrades (Ascension screen)
	 */
	function labelHeavenlyUpgrades() {
		if (!Game.OnAscend) return;

		// Find the heavenly upgrades container
		var container = document.getElementById('heavenlyUpgrades');
		if (!container) return;

		var crates = container.querySelectorAll('.crate.heavenly, .crate.upgrade');
		crates.forEach(function(crate) {
			var upgradeId = crate.dataset.id ||
							crate.getAttribute('data-id') ||
							extractIdFromOnclick(crate.getAttribute('onclick'));

			if (upgradeId === null || upgradeId === undefined) return;

			var upgrade = Game.UpgradesById[upgradeId];
			if (!upgrade) return;

			var label = buildHeavenlyUpgradeLabel(upgrade);

			crate.setAttribute('aria-label', label);
			crate.setAttribute('role', 'button');
			crate.setAttribute('tabindex', '0');

			if (!crate.dataset.a11yLabeled) {
				crate.dataset.a11yLabeled = 'true';
				crate.addEventListener('keydown', function(e) {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						crate.click();
					}
				});
			}
		});
	}

	/**
	 * Build label for heavenly upgrade
	 */
	function buildHeavenlyUpgradeLabel(upgrade) {
		var parts = [upgrade.name];

		// Status
		if (upgrade.bought) {
			parts.push('(Owned)');
		} else if (upgrade.unlocked) {
			parts.push('(Available to purchase)');
		} else {
			parts.push('(Locked - requirements not met)');
		}

		// Cost in heavenly chips
		if (!upgrade.bought && upgrade.basePrice !== undefined) {
			var price = upgrade.getPrice ? upgrade.getPrice() : upgrade.basePrice;
			parts.push('Cost: ' + Beautify(price) + ' heavenly chips');
		}

		// Description
		var desc = stripHtml(upgrade.desc || upgrade.ddesc || '');
		if (desc) {
			parts.push(desc);
		}

		parts.push('[Heavenly Upgrade]');

		// Parents (prerequisites)
		if (upgrade.parents && upgrade.parents.length > 0) {
			var parentNames = upgrade.parents.map(function(p) {
				return p.name;
			}).join(', ');
			parts.push('Requires: ' + parentNames);
		}

		return parts.join('. ');
	}

	/**
	 * Extract upgrade/achievement ID from onclick attribute
	 */
	function extractIdFromOnclick(onclick) {
		if (!onclick) return null;

		// Match patterns like Game.UpgradesById[123] or similar
		var match = onclick.match(/\[(\d+)\]/);
		if (match) return parseInt(match[1]);

		return null;
	}

	/**
	 * Try to find upgrade by matching element text/title to upgrade names
	 */
	function findUpgradeByName(element) {
		var text = element.title || element.textContent || '';
		text = text.trim().toLowerCase();

		for (var id in Game.Upgrades) {
			if (Game.Upgrades[id].name.toLowerCase() === text) {
				return Game.Upgrades[id];
			}
		}
		return null;
	}

	/**
	 * Try to find achievement by matching element text/title
	 */
	function findAchievementByName(element) {
		var text = element.title || element.textContent || '';
		text = text.trim().toLowerCase();

		for (var id in Game.Achievements) {
			if (Game.Achievements[id].name.toLowerCase() === text) {
				return Game.Achievements[id];
			}
		}
		return null;
	}

	/**
	 * Label all statistics screen elements
	 */
	function labelStatisticsScreen() {
		if (Game.onMenu !== 'stats') return;

		labelRegularUpgrades();
		labelAchievements();

		// Add section headings if not present
		addSectionAccessibility();
	}

	/**
	 * Add accessibility to statistics sections
	 */
	function addSectionAccessibility() {
		// Find and label major sections
		var sections = document.querySelectorAll('.section');
		sections.forEach(function(section) {
			var title = section.querySelector('.title');
			if (title && !section.getAttribute('aria-labelledby')) {
				var titleId = 'a11y-section-' + Math.random().toString(36).substr(2, 9);
				title.id = titleId;
				section.setAttribute('role', 'region');
				section.setAttribute('aria-labelledby', titleId);
			}
		});

		// Make listing boxes navigable
		var listings = document.querySelectorAll('.listing');
		listings.forEach(function(listing) {
			listing.setAttribute('role', 'list');
		});
	}

	/**
	 * Initialize - label all current elements
	 */
	function init() {
		labelRegularUpgrades();
		labelAchievements();

		if (Game.OnAscend) {
			labelHeavenlyUpgrades();
		}

		if (Game.onMenu === 'stats') {
			labelStatisticsScreen();
		}
	}

	/**
	 * Refresh labels (call after game state changes)
	 */
	function refresh() {
		init();
	}

	/**
	 * Cleanup
	 */
	function destroy() {
		labeledElements.forEach(function(el) {
			el.removeAttribute('aria-label');
			el.removeAttribute('data-a11y-labeled');
		});
		labeledElements.clear();
	}

	// Public API
	return {
		init: init,
		refresh: refresh,
		destroy: destroy,
		labelUpgrades: labelRegularUpgrades,
		labelAchievements: labelAchievements,
		labelHeavenly: labelHeavenlyUpgrades,
		labelStats: labelStatisticsScreen
	};
})();

// Export for use in main mod
if (typeof module !== 'undefined' && module.exports) {
	module.exports = StatisticsModule;
}
