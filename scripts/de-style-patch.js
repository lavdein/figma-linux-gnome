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
			gap: 8px !important;
			padding: 0 8px !important;
			height: 100%;
		}
		.tab_bar--captionButton--JvJqp {
			display: flex;
			align-items: center;
			justify-content: center;
			border: none !important;
			cursor: default;
			transition: background-color 120ms ease !important;
		}
		/* Min/Max/Close — round pill with constant subtle bg */
		.tab_bar--captionButton--JvJqp:not(#__MENU_CAPTION_BUTTON__) {
			width: 24px !important;
			height: 24px !important;
			border-radius: 50% !important;
			background-color: var(--color-bghovertransparent) !important;
			color: var(--color-icon) !important;
		}
		.tab_bar--captionButton--JvJqp:not(#__MENU_CAPTION_BUTTON__):hover {
			background-color: var(--color-bgtransparent-secondary-hover) !important;
			color: var(--color-icon-hover) !important;
		}
		.tab_bar--captionButton--JvJqp:not(#__MENU_CAPTION_BUTTON__):active {
			background-color: var(--color-bgtransparent-secondary-pressed) !important;
		}
		/* Close button — red on hover */
		.tab_bar--closeCaptionButton--Drt6v:hover {
			background-color: var(--color-bg-danger-hover) !important;
			color: var(--color-icon-ondanger) !important;
		}
		.tab_bar--closeCaptionButton--Drt6v:active {
			background-color: var(--color-bg-danger-pressed) !important;
			color: var(--color-icon-ondanger) !important;
		}
		/* Menu button — square, flat, larger, no bg until hover */
		#__MENU_CAPTION_BUTTON__ {
			width: 24px !important;
			height: 24px !important;
			border-radius: 6px !important;
			background-color: transparent !important;
			color: var(--color-icon) !important;
		}
		#__MENU_CAPTION_BUTTON__:hover {
			background-color: var(--color-bgtransparent-secondary-hover) !important;
		}
		#__MENU_CAPTION_BUTTON__:active {
			background-color: var(--color-bgtransparent-secondary-pressed) !important;
		}
		.tab_bar--captionButton--JvJqp:focus-visible {
			outline: 2px solid var(--color-border-selected) !important;
			outline-offset: -2px;
		}
		/* Hide original SVGs, replace with CSS mask icons */
		.tab_bar--captionButton--JvJqp .svg {
			display: none !important;
		}
		.tab_bar--captionButton--JvJqp .svg-container::after {
			content: "";
			display: block;
			width: 16px;
			height: 16px;
			background-color: currentColor;
			-webkit-mask-size: contain;
			-webkit-mask-repeat: no-repeat;
			-webkit-mask-position: center;
			mask-size: contain;
			mask-repeat: no-repeat;
			mask-position: center;
		}
		#__MENU_CAPTION_BUTTON__ .svg-container::after {
			-webkit-mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxkZWZzPgogIDxzdHlsZSBpZD0iY3VycmVudC1jb2xvci1zY2hlbWUiIHR5cGU9InRleHQvY3NzIj4uQ29sb3JTY2hlbWUtVGV4dCB7CiAgICAgICAgY29sb3I6IzM2MzYzNjsKICAgICAgfTwvc3R5bGU+CiA8L2RlZnM+CiA8ZyBjbGFzcz0iQ29sb3JTY2hlbWUtVGV4dCIgdHJhbnNmb3JtPSJtYXRyaXgoMCAtMSAtMSAwIC00MTMgLTgzLjk5NykiIGZpbGw9ImN1cnJlbnRDb2xvciI+CiAgPHJlY3QgeD0iLTkyLjk5NyIgeT0iLTQxOCIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcng9IjEiIHJ5PSIxIi8+CiAgPHJlY3QgeD0iLTkyLjk5NyIgeT0iLTQyMiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcng9IjEiIHJ5PSIxIi8+CiAgPHJlY3QgeD0iLTkyLjk5NyIgeT0iLTQyNiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcng9IjEiIHJ5PSIxIi8+CiA8L2c+Cjwvc3ZnPgo=");
			mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxkZWZzPgogIDxzdHlsZSBpZD0iY3VycmVudC1jb2xvci1zY2hlbWUiIHR5cGU9InRleHQvY3NzIj4uQ29sb3JTY2hlbWUtVGV4dCB7CiAgICAgICAgY29sb3I6IzM2MzYzNjsKICAgICAgfTwvc3R5bGU+CiA8L2RlZnM+CiA8ZyBjbGFzcz0iQ29sb3JTY2hlbWUtVGV4dCIgdHJhbnNmb3JtPSJtYXRyaXgoMCAtMSAtMSAwIC00MTMgLTgzLjk5NykiIGZpbGw9ImN1cnJlbnRDb2xvciI+CiAgPHJlY3QgeD0iLTkyLjk5NyIgeT0iLTQxOCIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcng9IjEiIHJ5PSIxIi8+CiAgPHJlY3QgeD0iLTkyLjk5NyIgeT0iLTQyMiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcng9IjEiIHJ5PSIxIi8+CiAgPHJlY3QgeD0iLTkyLjk5NyIgeT0iLTQyNiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgcng9IjEiIHJ5PSIxIi8+CiA8L2c+Cjwvc3ZnPgo=");
		}
		#__MINIMIZE_CAPTION_BUTTON__ .svg-container::after {
			-webkit-mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxyZWN0IHg9IjQiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjEiIHJ4PSIuNSIgcnk9Ii41IiBmaWxsPSIjMzYzNjM2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iLjQyNzYyIiBzdHlsZT0icGFpbnQtb3JkZXI6c3Ryb2tlIGZpbGwgbWFya2VycyIvPgo8L3N2Zz4K");
			mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxyZWN0IHg9IjQiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjEiIHJ4PSIuNSIgcnk9Ii41IiBmaWxsPSIjMzYzNjM2IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iLjQyNzYyIiBzdHlsZT0icGFpbnQtb3JkZXI6c3Ryb2tlIGZpbGwgbWFya2VycyIvPgo8L3N2Zz4K");
		}
		#__MAXIMIZE_CAPTION_BUTTON__ .svg-container::after {
			-webkit-mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxwYXRoIGQ9Im02IDRjLTEuMTA4IDAtMiAwLjg5Mi0yIDJ2NGMwIDEuMTA4IDAuODkyMDEgMiAyIDJoNGMxLjEwOCAwIDItMC44OTIgMi0ydi00YzAtMS4xMDgtMC44OTIwMS0yLTItMnptMCAxaDRjMC41NTQgMCAxIDAuNDQ2MDIgMSAxdjRjMCAwLjU1Mzk4LTAuNDQ2MDIgMS0xIDFoLTRjLTAuNTUzOTcgMC0wLjk5OTk5LTAuNDQ2MDItMC45OTk5OS0xdi00YzAtMC41NTM5OCAwLjQ0NjAyLTEgMC45OTk5OS0xeiIgZmlsbD0iIzM2MzYzNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNzc3OCIgc3R5bGU9InBhaW50LW9yZGVyOnN0cm9rZSBmaWxsIG1hcmtlcnMiLz4KPC9zdmc+Cg==");
			mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxwYXRoIGQ9Im02IDRjLTEuMTA4IDAtMiAwLjg5Mi0yIDJ2NGMwIDEuMTA4IDAuODkyMDEgMiAyIDJoNGMxLjEwOCAwIDItMC44OTIgMi0ydi00YzAtMS4xMDgtMC44OTIwMS0yLTItMnptMCAxaDRjMC41NTQgMCAxIDAuNDQ2MDIgMSAxdjRjMCAwLjU1Mzk4LTAuNDQ2MDIgMS0xIDFoLTRjLTAuNTUzOTcgMC0wLjk5OTk5LTAuNDQ2MDItMC45OTk5OS0xdi00YzAtMC41NTM5OCAwLjQ0NjAyLTEgMC45OTk5OS0xeiIgZmlsbD0iIzM2MzYzNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuNzc3OCIgc3R5bGU9InBhaW50LW9yZGVyOnN0cm9rZSBmaWxsIG1hcmtlcnMiLz4KPC9zdmc+Cg==");
		}
		#__CLOSE_CAPTION_BUTTON__ .svg-container::after {
			-webkit-mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxwYXRoIGQ9Im00LjQ2NDcgMy45NjQ4Yy0wLjEyNzc1IDAtMC4yNTU1IDAuMDQ4NTY3LTAuMzUzMzkgMC4xNDY0OS0wLjE5NTc4IDAuMTk1ODYtMC4xOTU3OCAwLjUxMTE2IDAgMC43MDcwM2wzLjE4MTYgMy4xODE2LTMuMTgxNiAzLjE4MTZjLTAuMTk1NzggMC4xOTU4Ni0wLjE5NTc4IDAuNTExMTYgMCAwLjcwNzAzIDAuMTk1NzggMC4xOTU4NiAwLjUxMTE4IDAuMTk1ODYgMC43MDcwNCAwbDMuMTgxNi0zLjE4MTYgMy4xODE2IDMuMTgxNmMwLjE5NTc4IDAuMTk1ODYgMC41MTExNCAwLjE5NTg2IDAuNzA3MDQgMCAwLjE5NTc4LTAuMTk1ODYgMC4xOTU3OC0wLjUxMTE2IDAtMC43MDcwM2wtMy4xODE2LTMuMTgxNiAzLjE4MTYtMy4xODE2YzAuMTk1NzgtMC4xOTU4NiAwLjE5NTc4LTAuNTExMTYgMC0wLjcwNzAzLTAuMTk1NzgtMC4xOTU4Ni0wLjUxMTE4LTAuMTk1ODYtMC43MDcwNCAwbC0zLjE4MTYgMy4xODE2LTMuMTgxNi0zLjE4MTZjLTAuMDk3ODktMC4wOTc5MjgtMC4yMjU2NC0wLjE0NjQ5LTAuMzUzMzktMC4xNDY0OXoiIGZpbGw9IiMzNjM2MzYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLXdpZHRoPSIxLjkxNDkiIHN0eWxlPSJwYWludC1vcmRlcjpzdHJva2UgZmlsbCBtYXJrZXJzIi8+Cjwvc3ZnPgo=");
			mask-image: url("data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KIDxwYXRoIGQ9Im00LjQ2NDcgMy45NjQ4Yy0wLjEyNzc1IDAtMC4yNTU1IDAuMDQ4NTY3LTAuMzUzMzkgMC4xNDY0OS0wLjE5NTc4IDAuMTk1ODYtMC4xOTU3OCAwLjUxMTE2IDAgMC43MDcwM2wzLjE4MTYgMy4xODE2LTMuMTgxNiAzLjE4MTZjLTAuMTk1NzggMC4xOTU4Ni0wLjE5NTc4IDAuNTExMTYgMCAwLjcwNzAzIDAuMTk1NzggMC4xOTU4NiAwLjUxMTE4IDAuMTk1ODYgMC43MDcwNCAwbDMuMTgxNi0zLjE4MTYgMy4xODE2IDMuMTgxNmMwLjE5NTc4IDAuMTk1ODYgMC41MTExNCAwLjE5NTg2IDAuNzA3MDQgMCAwLjE5NTc4LTAuMTk1ODYgMC4xOTU3OC0wLjUxMTE2IDAtMC43MDcwM2wtMy4xODE2LTMuMTgxNiAzLjE4MTYtMy4xODE2YzAuMTk1NzgtMC4xOTU4NiAwLjE5NTc4LTAuNTExMTYgMC0wLjcwNzAzLTAuMTk1NzgtMC4xOTU4Ni0wLjUxMTE4LTAuMTk1ODYtMC43MDcwNCAwbC0zLjE4MTYgMy4xODE2LTMuMTgxNi0zLjE4MTZjLTAuMDk3ODktMC4wOTc5MjgtMC4yMjU2NC0wLjE0NjQ5LTAuMzUzMzktMC4xNDY0OXoiIGZpbGw9IiMzNjM2MzYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLXdpZHRoPSIxLjkxNDkiIHN0eWxlPSJwYWludC1vcmRlcjpzdHJva2UgZmlsbCBtYXJrZXJzIi8+Cjwvc3ZnPgo=");
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
		/* Cinnamon: flat buttons, close gets red on hover (Mint theme default) */
		.tab_bar--captionButton--JvJqp {
			width: 24px;
			height: 24px;
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
			background: rgba(0,0,0,0.12);
		}
		.tab_bar--closeCaptionButton--Drt6v:hover {
			background: #c0392b !important;
		}
		.tab_bar--closeCaptionButton--Drt6v:hover svg path {
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
// Main window CSS: rounded corners per DE (requires transparent: true in BrowserWindow)
// ---------------------------------------------------------------------------

const DE_MAIN_RADIUS = {
	gnome:    '12px',
	kde:      '8px',
	xfce:     '4px',
	cinnamon: '6px',
	generic:  '0px',
};

// Window rounding via transparent BrowserWindow + CSS clip-path.
// Disabled for now — Figma's shell WebContentsView has no opaque background,
// making the transparent approach unreliable. Returns '' so frame-fix-wrapper.js
// does NOT enable transparent:true on the BrowserWindow.
function buildMainWindowCSS(_de) {
	return '';
}

function buildCanvasWindowCSS(_de) {
	return '';
}

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
	const { app } = electron;
	if (!app) return;

	const captionCSS = (DE_CAPTION_CSS[de] || DE_CAPTION_CSS.generic).replace(/\n\s+/g, ' ');
	const trayCSS    = buildTrayWindowCSS(de);

	app.on('web-contents-created', (_event, wc) => {
		wc.on('dom-ready', () => {
			const url = wc.getURL();
			const isTrayUrl  = url.includes('tray') || url.includes('feed') || url.includes('notification');
			const isShellUrl = url.includes('shell.html') || url.includes('desktop_shell');

			if (isShellUrl) {
				wc.insertCSS(captionCSS).catch(() => {});
				console.log('[DE Patch] Caption CSS injected into shell');
			} else if (isTrayUrl) {
				wc.insertCSS(trayCSS).catch(() => {});
				console.log('[DE Patch] Tray CSS injected');
			}
		});
	});

	console.log(`[DE Patch] applied (de=${de})`);
}

module.exports = { apply, detectDE, patchTrayPosition, buildMainWindowCSS, buildCanvasWindowCSS, de, DE_RADIUS, DE_MAIN_RADIUS, DE_CAPTION_CSS };
