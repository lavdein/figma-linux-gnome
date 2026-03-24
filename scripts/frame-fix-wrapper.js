// Inject frame fix before main app loads
const Module = require('module');
const originalRequire = Module.prototype.require;

const WIN_USER_AGENT =
	process.env.FIGMA_USER_AGENT_OVERRIDE ||
	'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.7559.220 Safari/537.36';

// Set FIGMA_USE_NATIVE_FRAME=1 to use native Linux window decorations.
// Default (0): Figma renders its own Windows-style titlebar and buttons.
const useNativeFrame = process.env.FIGMA_USE_NATIVE_FRAME === '1';

console.log(`[Frame Fix] Wrapper loaded (native frame: ${useNativeFrame})`);

Module.prototype.require = function(id) {
	const module = originalRequire.apply(this, arguments);

	if (id === 'electron' || id === 'electron/main') {
		console.log('[Frame Fix] Intercepting electron module');
		const OriginalBrowserWindow = module.BrowserWindow;
		const OriginalMenu = module.Menu;

		// Override UA so Local Fonts Agent accepts us as a Windows client
		if (process.platform === 'linux' && module.app && !module.app.__figma_linux_patched) {
			module.app.__figma_linux_patched = true;

			module.app.on('ready', () => {
				if (module.session && module.session.defaultSession) {
					module.session.defaultSession.setUserAgent(WIN_USER_AGENT);
					console.log('[Frame Fix] Default session UA set to Windows UA');
				}
			});

			module.app.on('web-contents-created', (_event, webContents) => {
				webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
					details.requestHeaders['User-Agent'] = WIN_USER_AGENT;
					callback({ requestHeaders: details.requestHeaders });
				});
			});
		}

		if (OriginalBrowserWindow && !OriginalBrowserWindow.__figma_patched) {
			module.BrowserWindow = class BrowserWindowWithFrame extends OriginalBrowserWindow {
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
						}
					}

					super(options);

					// Per-window UA override (belt-and-suspenders for Local Fonts Agent)
					if (process.platform === 'linux') {
						try {
							this.webContents.setUserAgent(WIN_USER_AGENT);
						} catch (e) {}
					}

					if (process.platform === 'linux' && !isTrayWindow) {
						this.setMenuBarVisibility(false);

						if (useNativeFrame) {
							// Hide Figma's own caption buttons — native frame provides its own
							this.webContents.on('dom-ready', () => {
								this.webContents.insertCSS(
									'#__MINIMIZE_CAPTION_BUTTON__,' +
									'#__MAXIMIZE_CAPTION_BUTTON__,' +
									'#__CLOSE_CAPTION_BUTTON__ { display: none !important; }'
								).catch(() => {});
							});
						}

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

			for (const key of Object.getOwnPropertyNames(OriginalBrowserWindow)) {
				if (key !== 'prototype' && key !== 'length' && key !== 'name') {
					try {
						const descriptor = Object.getOwnPropertyDescriptor(OriginalBrowserWindow, key);
						if (descriptor) Object.defineProperty(module.BrowserWindow, key, descriptor);
					} catch (e) {}
				}
			}

			module.BrowserWindow.__figma_patched = true;
		}

		// Intercept Menu.setApplicationMenu to hide menu bar on Linux
		if (OriginalMenu && !OriginalMenu.__figma_patched) {
			const originalSetAppMenu = OriginalMenu.setApplicationMenu.bind(OriginalMenu);
			module.Menu.setApplicationMenu = function(menu) {
				console.log('[Frame Fix] Intercepting setApplicationMenu');
				originalSetAppMenu(menu);
				if (process.platform === 'linux') {
					for (const win of module.BrowserWindow.getAllWindows()) {
						win.setMenuBarVisibility(false);
					}
					console.log('[Frame Fix] Menu bar hidden on all windows');
				}
			};
			OriginalMenu.__figma_patched = true;
		}
	}

	return module;
};
