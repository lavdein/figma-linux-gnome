/**
 * de-style-patch.js
 *
 * DE-aware visual fixes for Figma Desktop on Linux.
 * Self-contained module — wire in via frame-fix-wrapper.js:
 *   require('./de-style-patch').apply(electron);
 *
 * Handles:
 *  1. Caption buttons (Menu/Min/Max/Close) styled to match GNOME or KDE
 *  2. Tray notification window position (0,0 → under tray icon via cursor)
 *  3. Tray window shadow / border-radius matching the DE window style
 */

'use strict';

// ---------------------------------------------------------------------------
// DE detection
// ---------------------------------------------------------------------------

function detectDE() {
	const xdg = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();
	const session = (process.env.DESKTOP_SESSION || '').toLowerCase();

	if (xdg.includes('GNOME') || session.includes('gnome')) return 'gnome';
	if (xdg.includes('KDE') || process.env.KDE_FULL_SESSION)           return 'kde';
	if (xdg.includes('XFCE') || session.includes('xfce'))              return 'xfce';
	if (xdg.includes('CINNAMON') || session.includes('cinnamon'))       return 'cinnamon';
	return 'generic';
}

// ---------------------------------------------------------------------------
// Per-DE config
// ---------------------------------------------------------------------------

// Border radius used by each DE's window manager — applied to tray window.
const DE_RADIUS = {
	gnome:    '12px',
	kde:      '8px',
	xfce:     '4px',
	cinnamon: '6px',
	generic:  '0px',
};

// Caption button styles per DE.
// These are injected into the shell (tab bar) renderer.
const DE_CAPTION_CSS = {
	gnome: `
		/* GNOME Adwaita caption buttons */
		.tab_bar--captionContainer--87q2H {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 0 8px;
		}
		.tab_bar--captionButton--JvJqp {
			width: 24px;
			height: 24px;
			border-radius: 50%;
			background: transparent;
			border: none;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background 0.1s;
			cursor: default;
		}
		.tab_bar--captionButton--JvJqp:hover {
			background: rgba(0,0,0,0.12);
		}
		.tab_bar--captionButton--JvJqp svg path {
			fill: currentColor;
			fill-opacity: 0.7;
		}
		/* Close button: Adwaita red */
		.tab_bar--closeCaptionButton--Drt6v {
			background: #c01c28 !important;
		}
		.tab_bar--closeCaptionButton--Drt6v:hover {
			background: #e01b24 !important;
		}
		.tab_bar--closeCaptionButton--Drt6v svg path {
			fill: #fff !important;
			fill-opacity: 1 !important;
		}
	`,

	kde: `
		/* KDE Breeze caption buttons */
		.tab_bar--captionContainer--87q2H {
			display: flex;
			align-items: center;
			gap: 2px;
			padding: 0 4px;
		}
		.tab_bar--captionButton--JvJqp {
			width: 28px;
			height: 28px;
			border-radius: 4px;
			background: transparent;
			border: none;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: background 0.1s;
			cursor: default;
		}
		.tab_bar--captionButton--JvJqp:hover {
			background: rgba(0,0,0,0.10);
		}
		.tab_bar--captionButton--JvJqp:active {
			background: rgba(0,0,0,0.20);
		}
		.tab_bar--captionButton--JvJqp svg path {
			fill: currentColor;
			fill-opacity: 0.8;
		}
		/* Close button: Breeze red on hover */
		.tab_bar--closeCaptionButton--Drt6v:hover {
			background: #da4453 !important;
		}
		.tab_bar--closeCaptionButton--Drt6v:hover svg path {
			fill: #fff !important;
			fill-opacity: 1 !important;
		}
	`,

	xfce: `
		/* XFCE plain style */
		.tab_bar--captionButton--JvJqp {
			width: 22px;
			height: 22px;
			border-radius: 2px;
			background: transparent;
			border: none;
		}
		.tab_bar--captionButton--JvJqp:hover {
			background: rgba(0,0,0,0.15);
		}
	`,

	cinnamon: `
		/* Cinnamon: similar to GNOME but smaller radius */
		.tab_bar--captionButton--JvJqp {
			width: 24px;
			height: 24px;
			border-radius: 4px;
			background: transparent;
			border: none;
		}
		.tab_bar--captionButton--JvJqp:hover {
			background: rgba(0,0,0,0.12);
		}
		.tab_bar--closeCaptionButton--Drt6v {
			background: #c0392b !important;
		}
		.tab_bar--closeCaptionButton--Drt6v:hover {
			background: #e74c3c !important;
		}
		.tab_bar--closeCaptionButton--Drt6v svg path {
			fill: #fff !important;
			fill-opacity: 1 !important;
		}
	`,

	generic: `
		.tab_bar--captionButton--JvJqp {
			width: 24px;
			height: 24px;
			border-radius: 2px;
			background: transparent;
			border: none;
		}
		.tab_bar--captionButton--JvJqp:hover {
			background: rgba(0,0,0,0.12);
		}
	`,
};

// ---------------------------------------------------------------------------
// Tray window CSS: shadow + border-radius per DE
// ---------------------------------------------------------------------------

function buildTrayWindowCSS(de) {
	const radius = DE_RADIUS[de] || '0px';
	return `
		/* Remove compositor double-shadow */
		html, body {
			background: transparent !important;
		}
		[class*="desktop_dropdown_container--container"] {
			border-radius: ${radius} !important;
			box-shadow: 0 4px 24px rgba(0,0,0,0.22) !important;
		}
		[class*="desktop_dropdown_container--notificationContainer"] {
			border-radius: ${radius} !important;
			overflow: hidden !important;
		}
	`.replace(/\n\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Tray window positioning: fix 0,0 bug using cursor position
// ---------------------------------------------------------------------------

/**
 * Call after the tray is created. Wraps tray show-events so the notification
 * window is positioned near the tray icon using cursor coords as a fallback.
 *
 * @param {Electron.Tray}      tray
 * @param {() => Electron.BrowserWindow|null} getTrayWindow
 * @param {Electron.Screen}    screen
 */
function patchTrayPosition(tray, getTrayWindow, screen) {
	function positionWindow() {
		const win = getTrayWindow();
		if (!win || win.isDestroyed()) return;

		const bounds = tray.getBounds();
		// On Linux, getBounds() often returns {x:0,y:0,width:0,height:0}
		if (bounds.x !== 0 || bounds.y !== 0) return; // real bounds — let Figma handle it

		const cursor  = screen.getCursorScreenPoint();
		const display = screen.getDisplayNearestPoint(cursor);
		const wa      = display.workArea;
		const [winW, winH] = win.getSize();

		// Determine tray edge: if cursor is in the bottom quarter → bottom tray
		const inBottomEdge = cursor.y > wa.y + wa.height * 0.75;
		const inTopEdge    = cursor.y < wa.y + wa.height * 0.25;

		let x = Math.round(cursor.x - winW / 2);
		let y;

		if (inBottomEdge) {
			y = wa.y + wa.height - winH; // above bottom taskbar
		} else if (inTopEdge) {
			y = wa.y;                    // below top bar
		} else {
			// Side panel — align vertically near cursor
			y = Math.round(cursor.y - winH / 2);
		}

		// Clamp to work area
		x = Math.max(wa.x, Math.min(x, wa.x + wa.width  - winW));
		y = Math.max(wa.y, Math.min(y, wa.y + wa.height - winH));

		win.setPosition(x, y, false);
		console.log(`[DE Patch] Tray window repositioned to (${x},${y}) via cursor fallback`);
	}

	tray.on('click',        positionWindow);
	tray.on('double-click', positionWindow);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const de = detectDE();
console.log(`[DE Patch] Detected desktop environment: ${de}`);

/**
 * Wire the patch into a live Electron module.
 * Call this once from frame-fix-wrapper.js after intercepting require('electron').
 *
 * @param {object} electron  - the electron module
 */
function apply(electron) {
	const { app, BrowserWindow, screen } = electron;
	if (!app) return;

	const captionCSS  = (DE_CAPTION_CSS[de] || DE_CAPTION_CSS.generic).replace(/\n\s+/g, ' ');
	const trayCSS     = buildTrayWindowCSS(de);

	app.on('web-contents-created', (_event, wc) => {
		wc.on('dom-ready', () => {
			const url = wc.getURL();

			// Shell window — inject caption button styles
			if (url.includes('shell.html') || url.includes('desktop_shell')) {
				wc.insertCSS(captionCSS).catch(() => {});
				console.log('[DE Patch] Caption button CSS injected into shell');
			}

			// Tray notification window — inject shadow/radius fixes
			if (url.includes('tray') || url.includes('feed') || url.includes('notification')) {
				wc.insertCSS(trayCSS).catch(() => {});
				console.log('[DE Patch] Tray window CSS injected');
			}
		});
	});

	console.log(`[DE Patch] applied (de=${de})`);
}

module.exports = { apply, detectDE, patchTrayPosition, de, DE_RADIUS, DE_CAPTION_CSS };
