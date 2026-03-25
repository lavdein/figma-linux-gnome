// Inject frame fix before main app loads
const Module = require('module');
const originalRequire = Module.prototype.require;

// DE-aware patches (loaded here, applied after electron is intercepted)
const deStyle = require('./de-style-patch');
const deIcons = require('./de-icons-patch');
deIcons.init(deStyle.de);

const MAIN_WINDOW_CSS = deStyle.buildMainWindowCSS(deStyle.de);

// Only spoof the OS identifier — Chrome version stays in sync with bundled Electron.
const WIN_USER_AGENT =
	process.env.FIGMA_USER_AGENT_OVERRIDE ||
	`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '130.0.0.0'} Safari/537.36`;

// Set FIGMA_USE_NATIVE_FRAME=1 to use native Linux window decorations.
const useNativeFrame = process.env.FIGMA_USE_NATIVE_FRAME === '1';

console.log(`[Frame Fix] Wrapper loaded (native frame: ${useNativeFrame})`);

// Created once on the first electron intercept; returned by the module Proxy.
let BrowserWindowWithFrame = null;
// Proxy wrapping the real electron module — intercepts .BrowserWindow access.
let electronProxy = null;

function buildBrowserWindowWithFrame(OriginalBrowserWindow) {
	const cls = class BrowserWindowWithFrame extends OriginalBrowserWindow {
		constructor(options) {
			const preloadPath = options?.webPreferences?.preload || '';
			const isTrayWindow = preloadPath.includes('tray_binding_renderer');

			if (isTrayWindow) {
				console.log('[Frame Fix] Tray notification BrowserWindow detected');
			} else {
				console.log('[Frame Fix] BrowserWindow constructor called');
			}

			if (process.platform === 'linux' && !isTrayWindow) {
				options = options || {};
				if (useNativeFrame) {
					const originalFrame = options.frame;
					options.frame = true;
					options.autoHideMenuBar = true;
					delete options.titleBarStyle;
					delete options.titleBarOverlay;
					console.log(`[Frame Fix] Native frame: modified frame from ${originalFrame} to true`);
				} else if (MAIN_WINDOW_CSS) {
					// Transparent window lets the compositor clip to the rounded
					// corner shape defined by our injected html CSS.
					options.transparent = true;
					// Remove any opaque backgroundColor — Figma may set one that
					// would fill our transparent corners with a solid color.
					delete options.backgroundColor;
					console.log(`[Frame Fix] Transparent window enabled for DE rounded corners (${deStyle.de})`);
				}
			}

			super(options);

			// Per-window UA override (belt-and-suspenders for Local Fonts Agent)
			if (process.platform === 'linux') {
				try {
					this.webContents.setUserAgent(WIN_USER_AGENT);
				} catch (e) {}
			}

			if (process.platform === 'linux' && !isTrayWindow && !useNativeFrame && MAIN_WINDOW_CSS) {
				// Figma calls setBackgroundColor(theme_color) via nativeTheme listener,
				// which would fill our transparent corners with an opaque color.
				// Override the method on this instance to keep the background transparent.
				const origSetBG = this.setBackgroundColor.bind(this);
				this.setBackgroundColor = () => origSetBG('#00000000');
				this.setBackgroundColor();
				console.log('[Frame Fix] setBackgroundColor locked to transparent');
			}

			if (process.platform === 'linux' && !isTrayWindow) {
				this.setMenuBarVisibility(false);

				// Keep menu bar hidden after every show event
				this.on('show', () => {
					this.setMenuBarVisibility(false);
				});

				if (useNativeFrame) {
					// Hide Figma's own caption buttons — native frame provides its own
					this.webContents.on('dom-ready', () => {
						this.webContents.insertCSS(
							'#__MINIMIZE_CAPTION_BUTTON__,' +
							'#__MAXIMIZE_CAPTION_BUTTON__,' +
							'#__CLOSE_CAPTION_BUTTON__ { display: none !important; }'
						).catch(() => {});
					});
				} else if (MAIN_WINDOW_CSS) {
					// Rounded corners: border-radius on the html root clips web content
					this.webContents.on('dom-ready', () => {
						this.webContents.insertCSS(MAIN_WINDOW_CSS).catch(() => {});
					});
				}

				// Wayland resize fix: patch getContentBounds() to bypass Chromium's stale
				// LayoutManagerBase cache. The cache only updates on _NET_WM_STATE changes,
				// which KWin tiling and Wayland compositors skip. getSize() is always fresh.
				let frameW = 0;
				let frameH = 0;
				let calibrated = false;
				const origGetContentBounds = this.getContentBounds.bind(this);

				this.getContentBounds = () => {
					if (calibrated && !this.isDestroyed()) {
						const [w, h] = this.getSize();
						const width = w - frameW;
						const height = h - frameH;
						// Guard against stale data during transitions
						if (width > 0 && height > 0) {
							return { x: 0, y: 0, width, height };
						}
					}
					return origGetContentBounds();
				};

				// Re-emit resize after state transitions so Figma recalculates child views
				const reemitResize = () => {
					if (this.isDestroyed()) return;
					this.emit('resize');
					setTimeout(() => {
						if (!this.isDestroyed()) this.emit('resize');
					}, 16);
				};

				this.on('maximize', reemitResize);
				this.on('unmaximize', reemitResize);
				this.on('enter-full-screen', reemitResize);
				this.on('leave-full-screen', reemitResize);

				this.once('ready-to-show', () => {
					this.setMenuBarVisibility(false);
					if (useNativeFrame) {
						// One-time size jiggle forces Chromium layout cache flush.
						// Skipped for frameless/transparent windows to avoid visual flash.
						const [w, h] = this.getSize();
						this.setSize(w + 1, h + 1);
						setTimeout(() => {
							if (this.isDestroyed()) return;
							this.setSize(w, h);
							// Calibrate frame overhead at rest: diff between window size and content bounds.
							// Under XWayland/Wayland, frame overhead is typically 0x0.
							setTimeout(() => {
								if (this.isDestroyed()) return;
								const [winW, winH] = this.getSize();
								const cb = origGetContentBounds();
								const fw = winW - cb.width;
								const fh = winH - cb.height;
								if (cb.width > 0 && cb.height > 0 && fw >= 0 && fh >= 0 && fw < 200 && fh < 200) {
									frameW = fw;
									frameH = fh;
									calibrated = true;
									console.log(`[Frame Fix] Frame overhead calibrated: ${fw}x${fh}`);
								} else {
									frameW = 0;
									frameH = 0;
									calibrated = true;
									console.log(`[Frame Fix] Calibration fallback. win=${winW}x${winH} content=${cb.width}x${cb.height}`);
								}
							}, 100);
						}, 50);
					} else {
						// Frameless/transparent: no frame overhead to calibrate
						calibrated = true;
					}
				});

				// Fallback calibration if ready-to-show doesn't fire
				this.once('show', () => {
					setTimeout(() => {
						if (this.isDestroyed() || calibrated) return;
						console.log('[Frame Fix] Fallback calibration via show event');
						const [winW, winH] = this.getSize();
						const cb = origGetContentBounds();
						const fw = winW - cb.width;
						const fh = winH - cb.height;
						if (cb.width > 0 && cb.height > 0 && fw >= 0 && fh >= 0 && fw < 200 && fh < 200) {
							frameW = fw;
							frameH = fh;
						}
						calibrated = true;
						console.log(`[Frame Fix] Fallback calibrated: ${frameW}x${frameH}`);
					}, 500);
				});

				if (process.env.FIGMA_DEBUG === '1') {
					this.webContents.on('dom-ready', () => {
						this.webContents.openDevTools({ mode: 'detach' });
					});
				}
			}

			if (isTrayWindow && process.env.FIGMA_DEBUG === '1') {
				console.log('[Frame Fix] DEBUG: Opening DevTools for tray window');
				this.webContents.on('dom-ready', () => {
					this.webContents.openDevTools({ mode: 'detach' });
				});
			}
		}
	};

	// Copy static properties (getAllWindows, fromId, etc.)
	for (const key of Object.getOwnPropertyNames(OriginalBrowserWindow)) {
		if (key !== 'prototype' && key !== 'length' && key !== 'name') {
			try {
				const descriptor = Object.getOwnPropertyDescriptor(OriginalBrowserWindow, key);
				if (descriptor) Object.defineProperty(cls, key, descriptor);
			} catch (e) {}
		}
	}

	return cls;
}

Module.prototype.require = function(id) {
	const realModule = originalRequire.apply(this, arguments);

	if (id === 'electron' || id === 'electron/main') {
		// Build the proxy only once — subsequent require('electron') calls
		// return the same proxy so Figma always sees BrowserWindowWithFrame.
		if (!electronProxy) {
			console.log('[Frame Fix] Intercepting electron module (first time, building proxy)');

			const OriginalBrowserWindow = realModule.BrowserWindow;
			const OriginalMenu = realModule.Menu;

			if (OriginalBrowserWindow) {
				BrowserWindowWithFrame = buildBrowserWindowWithFrame(OriginalBrowserWindow);
				console.log('[Frame Fix] BrowserWindowWithFrame created');
			}

			// Patch app — UA override, DE style, web-contents events
			if (process.platform === 'linux' && realModule.app && !realModule.app.__figma_linux_patched) {
				realModule.app.__figma_linux_patched = true;
				deStyle.apply(realModule);

				realModule.app.on('ready', () => {
					if (realModule.session && realModule.session.defaultSession) {
						realModule.session.defaultSession.setUserAgent(WIN_USER_AGENT);
						console.log('[Frame Fix] Default session UA set to Windows UA');
					}
				});

				realModule.app.on('web-contents-created', (_event, webContents) => {
					webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
						details.requestHeaders['User-Agent'] = WIN_USER_AGENT;
						callback({ requestHeaders: details.requestHeaders });
					});

					// GNOME uses CSS mask icons via de-style-patch.js — no JS injection needed.
					// For other DEs, only inject into the main shell, not tray/sub-frames.
					if (deStyle.de !== 'gnome') {
						webContents.on('dom-ready', () => {
							const url = webContents.getURL();
							if (url.includes('shell.html') || url.includes('desktop_shell') || url.includes('figma.com')) {
								deIcons.applyToWebContents(webContents);
							}
						});
					}
				});
			}

			// Intercept Menu.setApplicationMenu to hide menu bar on Linux
			if (OriginalMenu && !OriginalMenu.__figma_patched) {
				const originalSetAppMenu = OriginalMenu.setApplicationMenu.bind(OriginalMenu);
				realModule.Menu.setApplicationMenu = function(menu) {
					originalSetAppMenu(menu);
					if (process.platform === 'linux') {
						for (const win of OriginalBrowserWindow.getAllWindows()) {
							win.setMenuBarVisibility(false);
						}
					}
				};
				OriginalMenu.__figma_patched = true;
			}

			// The Proxy intercepts .BrowserWindow on the module so Figma always
			// gets BrowserWindowWithFrame regardless of whether the module property
			// is writable/configurable.
			electronProxy = BrowserWindowWithFrame
				? new Proxy(realModule, {
					get(target, prop, receiver) {
						if (prop === 'BrowserWindow') return BrowserWindowWithFrame;
						return Reflect.get(target, prop, receiver);
					},
				})
				: realModule;
		}

		return electronProxy;
	}

	return realModule;
};
