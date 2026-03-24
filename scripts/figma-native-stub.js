// Stub implementation of Figma native modules (bindings.node + desktop_rust.node) for Linux
// These modules are Windows-specific native addons that need stubbing on Linux

let nativeTheme = null;
try {
	nativeTheme = require('electron').nativeTheme;
} catch (e) {
	// May fail in utility process where electron main APIs aren't available
}

// Optional integration with external font agent (e.g. figma-agent-linux).
// Вызов делаем синхронно через spawnSync(curl ...), чтобы не ломать ожидания
// Figma от desktop_rust.getFonts (синхронный API).
const { spawnSync } = require('child_process');

let cachedFontsJson = null;
let cachedFontsTimestamp = 0;
const FONTS_CACHE_TTL_MS = 60_000;

function getFontsFromExternalAgent() {
	const now = Date.now();
	if (cachedFontsJson && now - cachedFontsTimestamp < FONTS_CACHE_TTL_MS) {
		return cachedFontsJson;
	}

	const endpoint =
		process.env.FIGMA_FONT_AGENT_URL ||
		'http://127.0.0.1:44950/figma/font-files';

	try {
		const result = spawnSync('curl', ['-fsSL', endpoint], {
			encoding: 'utf8',
			timeout: 2_000,
		});

		if (
			result.status === 0 &&
			typeof result.stdout === 'string' &&
			result.stdout.trim().startsWith('{')
		) {
			cachedFontsJson = result.stdout;
			cachedFontsTimestamp = now;
			return cachedFontsJson;
		}
	} catch (_err) {
		// If anything goes wrong (no curl, no agent, timeout),
		// fall back to previous cache or empty object.
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
