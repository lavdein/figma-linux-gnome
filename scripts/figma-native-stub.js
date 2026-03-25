// Stub implementation of Figma native modules (bindings.node + desktop_rust.node) for Linux
// These modules are Windows-specific native addons that need stubbing on Linux

let nativeTheme = null;
try {
	nativeTheme = require('electron').nativeTheme;
} catch (e) {
	// May fail in utility process where electron main APIs aren't available
}

// Optional integration with external font agent (e.g. figma-agent-linux).
// getFonts() is a sync API so we always return from cache immediately;
// a background http.get keeps the cache fresh — no blocking, no curl dep.
const http = require('http');

const FONT_AGENT_URL = process.env.FIGMA_FONT_AGENT_URL || 'http://127.0.0.1:44950/figma/font-files';
const FONTS_CACHE_TTL_MS = 60_000;

let cachedFontsJson = null;
let cachedFontsTimestamp = 0;
let fetchInProgress = false;

function fetchFontsInBackground() {
	if (fetchInProgress) return;
	fetchInProgress = true;
	try {
		const req = http.get(FONT_AGENT_URL, { timeout: 2000 }, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => {
				fetchInProgress = false;
				if (res.statusCode === 200 && data.trim().startsWith('{')) {
					cachedFontsJson = data;
					cachedFontsTimestamp = Date.now();
				}
			});
		});
		req.on('error', () => { fetchInProgress = false; });
		req.on('timeout', () => { req.destroy(); fetchInProgress = false; });
	} catch (_err) {
		fetchInProgress = false;
	}
}

// Pre-fetch at startup so fonts are ready by the time Figma first calls getFonts()
fetchFontsInBackground();

function getFontsFromExternalAgent() {
	if (!cachedFontsJson || Date.now() - cachedFontsTimestamp >= FONTS_CACHE_TTL_MS) {
		fetchFontsInBackground();
	}
	return cachedFontsJson || JSON.stringify({});
}

// ---- bindings.node stubs ----
// All methods that xe.* references in main.js

module.exports = {
	// System detection
	isSystemDarkMode: () => nativeTheme ? nativeTheme.shouldUseDarkColors : false,
	isP3ColorSpaceCapable: () => false,
	getCurrentKeyboardLayout: () => 'com.apple.keylayout.US',
	getExecutableVersion: () => '0.0.0',
	getBundleVersion: () => '0',
	getAppPathForProtocol: () => '',
	getActiveNSScreens: () => [],
	getOSNotificationsEnabled: () => true,

	// Window management
	isWindowUnderPoint: () => false,
	getWindowUnderCursor: () => null,
	getWindowScreenshot: () => null,
	forceFocusWindow: () => {},

	// Panel management (macOS-specific NSPanel)
	makePanel: () => null,
	showPanel: () => {},
	hidePanel: () => {},
	positionPanel: () => {},
	destroyPanel: () => {},
	getPanelVisibility: () => false,

	// GPU stats (Windows-specific)
	getWindowsGPUStats: () => ({}),
	getGpuProcessMemorySharedUsageMB: () => 0,
	getGpuProcessMemoryDedicatedUsageMB: () => 0,
	getGpu3dUsageAsync: (callback) => { if (callback) callback(0); },

	// Cursor/Eyedropper (Windows/macOS native)
	startEyedropperSession: () => {},
	stopEyedropperSession: () => {},
	sampleEyedropperAtPoint: () => null,
	setEyedropperCursor: () => {},
	setDefaultCursor: () => {},
	requestEyedropperPermission: () => true,
	updateEyedropperColorSpace: () => {},
	startCursorTracker: () => {},

	// Haptic feedback (macOS-specific)
	triggerHaptic: () => {},

	// File type registration (Windows-specific)
	registerFileTypes: () => {},
	unregisterFileTypes: () => {},

	// Menu shortcuts
	setMenuShortcuts: () => {},

	// Spellcheck / Dictionary
	SetDictionary: () => {},
	GetAvailableDictionaries: () => [],

	// macOS-specific
	launchApp: () => {},
	removeBundleDirectory: () => {},
	removeAgentRegistryLoginItem: () => {},
};

// ---- desktop_rust.node stubs ----
// Used by main.js directly (kl variable) and by bindings_worker.js utility process
// Provides font enumeration on Windows/macOS via native Rust code
module.exports.desktop_rust = {
	// Font enumeration - returns JSON string of font data
	getFonts: () => getFontsFromExternalAgent(),
	// Returns timestamp of last font modification
	getFontsModifiedAt: () => 0,
	// Returns JSON string of fonts modified since last check
	getModifiedFonts: () => JSON.stringify({}),
};
