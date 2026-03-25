/**
 * de-icons-patch.js
 *
 * Replaces Figma's Windows-style caption button SVG icons with proper
 * DE-native icons (GNOME Adwaita / KDE Breeze / freedesktop symbolic).
 *
 * Strategy:
 *  1. Detect icon theme from system settings (gsettings / kreadconfig5)
 *  2. Search for freedesktop symbolic SVG files in /usr/share/icons/THEME/...
 *  3. Extract path data from the SVG
 *  4. Fall back to embedded path data if the file isn't found
 *  5. Inject JS into the shell renderer that replaces the SVG content
 *
 * Wire in from frame-fix-wrapper.js:
 *   const deIcons = require('./de-icons-patch');
 *   // after intercepting electron module:
 *   deIcons.applyToWebContents(webContents);
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Icon theme detection
// ---------------------------------------------------------------------------

function getIconThemeName(de) {
	try {
		if (de === 'kde') {
			const { execSync } = require('child_process');
			return execSync('kreadconfig5 --group Icons --key Theme', { encoding: 'utf8', stdio: 'pipe' }).trim() || 'breeze';
		}
		// GNOME / Cinnamon / XFCE use GTK / gsettings
		const { execSync } = require('child_process');
		const raw = execSync('gsettings get org.gnome.desktop.interface icon-theme', { encoding: 'utf8', stdio: 'pipe' }).trim();
		return raw.replace(/^'|'$/g, '') || 'Adwaita';
	} catch {
		return de === 'kde' ? 'breeze' : 'Adwaita';
	}
}

// ---------------------------------------------------------------------------
// Icon file lookup (freedesktop icon naming spec)
// ---------------------------------------------------------------------------

const ICON_NAMES = {
	close:    'window-close-symbolic',
	minimize: 'window-minimize-symbolic',
	maximize: 'window-maximize-symbolic',
	menu:     'open-menu-symbolic',          // hamburger/arrow menu button
};

// Search order: scalable symbolic first (always crisp), then sized
const SUBDIR_PATTERNS = [
	'symbolic/actions',
	'scalable/actions',
	'actions/symbolic',
	'16x16/actions',
	'actions/16',
	'22x22/actions',
	'actions/22',
];

function findIconFile(theme, iconName) {
	const home = process.env.HOME || '';
	const bases = [
		`/usr/share/icons/${theme}`,
		`${home}/.local/share/icons/${theme}`,
		`/usr/local/share/icons/${theme}`,
	];

	// Also check parent theme (index.theme Inherits=)
	for (const base of bases) {
		for (const sub of SUBDIR_PATTERNS) {
			for (const suffix of ['-symbolic.svg', '.svg']) {
				const p = path.join(base, sub, iconName.replace(/-symbolic$/, '') + suffix);
				if (fs.existsSync(p)) return p;
				const p2 = path.join(base, sub, iconName + suffix);
				if (fs.existsSync(p2)) return p2;
			}
		}
	}
	return null;
}

// Extract all <path d="..."> from an SVG file
function extractPaths(svgFile) {
	try {
		const src = fs.readFileSync(svgFile, 'utf8');
		const paths = [];
		const re = /<path\b[^>]+\bd="([^"]+)"/g;
		let m;
		while ((m = re.exec(src)) !== null) paths.push(m[1]);
		return paths.length ? paths : null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Embedded fallback paths  (16×16 viewBox)
// Used when the system icon file is not found.
//
// GNOME Adwaita symbolic  — clean geometric shapes, 1px stroke weight
// KDE Breeze              — slightly bolder, rounder
// ---------------------------------------------------------------------------

const FALLBACK = {
	gnome: {
		// Adwaita window-close-symbolic: thin diagonal X
		close:    ['M3.293 2.293 2.293 3.293 7 8l-4.707 4.707 1 1L8 9l4.707 4.707 1-1L9 8l4.707-4.707-1-1L8 7z'],
		// Adwaita window-minimize-symbolic: horizontal bar, bottom-aligned
		minimize: ['M2 11h12v1.5H2z'],
		// Adwaita window-maximize-symbolic: square outline
		maximize: ['M3 3v10h10V3zm1.5 1.5h7v7h-7z'],
		// open-menu-symbolic (hamburger)
		menu:     ['M2 4h12v1.5H2zm0 5h12v1.5H2z'],
	},

	kde: {
		// Exact paths from /usr/share/icons/breeze/actions/16/window-close.svg
		// Two-layer X: thin guide lines + solid filled polygon
		close: [
			'm4 4 8 8m-8 0 8-8',
			'M 4,3.1523438 3.1523438,4 7.1523437,8 3.1523438,12 4,12.847656 8,8.8476563 12,12.847656 12.847656,12 8.8476563,8 12.847656,4 12,3.1523438 8,7.1523437 Z',
		],
		// Breeze window-minimize: bottom-aligned bar (matching Adwaita position)
		minimize: ['M2 10.5h12V12H2z'],
		// Breeze window-maximize: outer frame with inner square
		maximize: ['M2 2v12h12V2zm1.5 1.5h9v9h-9z'],
		// Breeze open-menu: 3 bars at even spacing
		menu:     ['M2 4h12v1.5H2zm0 4.75h12v1.5H2zm0 4.75h12v1.5H2z'],
	},

	generic: {
		close:    ['M2 2l12 12m0-12L2 14'],
		minimize: ['M2 10h12v2H2z'],
		maximize: ['M2 2v12h12V2zm1 1h10v10H3z'],
		menu:     ['M2 3.5h12v1H2zm0 5h12v1H2zm0 5h12v1H2z'],
	},
};

// 'xfce' and 'cinnamon' use Adwaita-like or their own GTK theme — fall back to gnome paths
FALLBACK.xfce      = FALLBACK.gnome;
FALLBACK.cinnamon  = FALLBACK.gnome;

// ---------------------------------------------------------------------------
// Resolve icon paths (system theme → fallback)
// ---------------------------------------------------------------------------

function resolveIcons(de) {
	const theme   = getIconThemeName(de);
	const fallback = FALLBACK[de] || FALLBACK.generic;

	console.log(`[DE Icons] Theme: ${theme}, DE: ${de}`);

	const result = {};
	for (const [key, name] of Object.entries(ICON_NAMES)) {
		const file = findIconFile(theme, name);
		if (file) {
			const paths = extractPaths(file);
			if (paths) {
				result[key] = { paths, source: file };
				console.log(`[DE Icons] ${key}: loaded from ${file}`);
				continue;
			}
		}
		// Fallback to embedded
		result[key] = { paths: fallback[key], source: 'embedded' };
		console.log(`[DE Icons] ${key}: using embedded fallback (${de})`);
	}
	return result;
}

// ---------------------------------------------------------------------------
// JS snippet injected into the shell renderer
// Replaces the SVG content of each caption button
// ---------------------------------------------------------------------------

function buildInjectedJS(icons) {
	// Serialise icon map to JSON so it travels into the renderer as a literal
	const iconMap = JSON.stringify(
		Object.fromEntries(
			Object.entries(icons).map(([k, v]) => [k, v.paths])
		)
	);

	return `
(function replaceCaptionIcons() {
  const ICONS = ${iconMap};
  const BTN_ICONS = {
    __MENU_CAPTION_BUTTON__:     ICONS.menu,
    __MINIMIZE_CAPTION_BUTTON__: ICONS.minimize,
    __MAXIMIZE_CAPTION_BUTTON__: ICONS.maximize,
    __CLOSE_CAPTION_BUTTON__:    ICONS.close,
  };
  const NS = 'http://www.w3.org/2000/svg';

  function apply() {
    let replaced = 0;
    for (const [id, paths] of Object.entries(BTN_ICONS)) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const svg = btn.querySelector('svg');
      if (!svg) continue;
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('width',   '14');
      svg.setAttribute('height',  '14');
      // Remove existing paths
      svg.querySelectorAll('path').forEach(el => el.remove());
      // Insert new paths
      for (const d of paths) {
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('d',    d);
        el.setAttribute('fill', 'currentColor');
        svg.appendChild(el);
      }
      replaced++;
    }
    return replaced;
  }

  // Figma renders dynamically — retry until all 4 buttons exist
  let attempts = 0;
  const interval = setInterval(() => {
    if (apply() >= 4 || ++attempts > 50) clearInterval(interval);
  }, 200);
})();
`.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _icons = null;

/**
 * Call once with the detected DE.
 * Resolves icon paths from the system theme (or fallback) up front.
 */
function init(de) {
	_icons = resolveIcons(de);
}

/**
 * Inject the icon-replacement script into a shell WebContents.
 * Call from app.on('web-contents-created', ...) → wc.on('dom-ready', ...).
 *
 * @param {Electron.WebContents} wc
 */
function applyToWebContents(wc) {
	if (!_icons) {
		console.warn('[DE Icons] call init(de) before applyToWebContents');
		return;
	}
	const js = buildInjectedJS(_icons);
	wc.executeJavaScript(js).catch(() => {});
}

module.exports = { init, applyToWebContents, resolveIcons, findIconFile, getIconThemeName };
