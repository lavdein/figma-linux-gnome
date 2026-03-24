# Future Work Notes

## Готовые модули (не подключены к билду)

### `scripts/de-style-patch.js` — CSS стили кнопок + tray window
### `scripts/de-icons-patch.js` — замена SVG иконок на системные

Подключить в `frame-fix-wrapper.js`:

```js
const deStyle = require('./de-style-patch');
const deIcons = require('./de-icons-patch');

// после определения de:
deIcons.init(de);         // резолвит иконки из /usr/share/icons/THEME/ или fallback

// в app.on('web-contents-created', (_, wc) => { wc.on('dom-ready', () => { ... }) }):
deStyle.apply(electron);  // CSS: форма кнопок, hover, border-radius tray-окна
deIcons.applyToWebContents(wc);  // JS: заменяет SVG пути в кнопках
```

Для `patchTrayPosition` — вызывать при создании трея (нужен доступ к инстансу `tray` и геттеру tray-окна).


## 1. Caption buttons: GNOME / KDE native styling

The caption container renders Figma's own Windows-style SVG icons:

```html
<div class="tab_bar--captionContainer--87q2H">
  <button id="__MENU_CAPTION_BUTTON__" ...>     <!-- hamburger/arrow -->
  <button id="__MINIMIZE_CAPTION_BUTTON__" ...> <!-- horizontal bar  -->
  <button id="__MAXIMIZE_CAPTION_BUTTON__" ...> <!-- square           -->
  <button id="__CLOSE_CAPTION_BUTTON__" ...>    <!-- X               -->
</div>
```

**Goal:** style buttons to match the active DE:
- **GNOME:** Adwaita-style, round red close button, flat minimize/maximize
- **KDE Plasma:** Breeze-style icons and hover effects

**Options:**
- Read `$XDG_CURRENT_DESKTOP` / `$DESKTOP_SESSION` in the launcher, inject a
  DE-specific CSS class into `shell.html` at build time
- Use Electron `nativeTheme` API for dark/light colors
- Replace SVG icons via CSS `content` or `executeJavaScript` at `dom-ready`

---

## 2. Tray notification dropdown opens at 0,0 instead of below tray icon

**Symptom:** the feed/notification window appears at screen position `(0,0)`.

**Root cause (suspected):** on Linux, `Tray.getBounds()` returns
`{x:0, y:0, width:0, height:0}` — appindicator does not expose real tray icon
bounds to Electron. Figma uses those bounds to position the window.

**Options:**
- After `tray.on('click')` / `tray.on('double-click')`, use
  `screen.getCursorScreenPoint()` as a fallback — cursor is on the icon when
  clicked, so this gives a reliable anchor point
- Patch the code that calls `trayWindow.setPosition()` / `setBounds()` to
  substitute cursor position when bounds are `(0,0)`
- Use `display.workArea` to pin the window to bottom-right corner as a fallback

---

## 3. Weird outline / shadow artifact around notification window

**Symptom:** unexpected visual border or double-shadow around the tray
notification window, suspected to be caused by compositor shadows overlapping
CSS `box-shadow`.

**Suspected causes:**
- `hasShadow: true` on the tray `BrowserWindow` — compositor adds its own
  shadow on top of Figma's CSS shadow
- CSS `box-shadow` / `border-radius` on `.desktop_dropdown_container--container`
  not being clipped to the window bounds
- Transparent background + compositor shadow frame drawn over the window edge

**Options:**
- Set `hasShadow: false` on the tray BrowserWindow in the build.sh patch
  (find the `new BrowserWindow({...})` that creates the tray window by looking
  for `setAlwaysOnTop(!0,"pop-up-menu")` nearby)
- Inject CSS on tray window only: `box-shadow: none !important; border-radius: 0 !important;`
  (already partially done in the CSS patch block in `build.sh`)
- Ensure `transparent: true` + `frame: false` are correctly set for the tray
  window so the compositor handles transparency cleanly without double-drawing
