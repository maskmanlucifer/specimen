# Making a plugin

A plugin adds one figure type. On the canvas it shows a live preview. In a published story it is a numbered figure that readers can play with.

A plugin is a folder with plain files. There is no build step.

```
my-plugin/
  plugin.json   name, version, settings and inputs
  figure.js     draws the figure
  style.css     styles for the figure (optional)
  README.md     notes for other people (optional)
```

Use **Plugins → Make a plugin** to write one with a live preview. When you save it, Specimen writes the folder to `plugins/<id>/` in your default storage.

## plugin.json

```json
{
  "id": "ripple-tank",
  "name": "Ripple tank",
  "version": "0.4.0",
  "description": "Two point sources and their interference pattern.",
  "author": "you",
  "category": "figures",
  "permissions": [],
  "inputs": [],
  "settings": [
    { "type": "range", "key": "wavelength", "label": "Wavelength", "min": 10, "max": 60, "step": 1, "unit": "px", "default": 26 },
    { "type": "boolean", "key": "nodes", "label": "Show nodes", "default": false }
  ],
  "stepped": true,
  "height": 240
}
```

- `category`: `figures`, `audio`, `data` or `math`.
- `settings`: the side panel makes one control for each setting. The types are `select`, `range`, `boolean` and `text`.
- `inputs`: cards that the figure reads, for example `{ "key": "audio", "label": "Input audio", "accepts": ["audio"] }`. You must also add the `read-inputs` permission.
- `stepped`: `true` shows the ◀ PREV / ▶ PLAY / NEXT ▶ controls.
- `height`: the default figure height in pixels.

## figure.js

The page gives the global object `specimen` to your script.

```js
specimen.render(({ root, settings, inputs, step, theme, width, height }) => {
  root.innerHTML = `<svg width="${width}" height="${height}">…</svg>`;
});
```

| API | Description |
|---|---|
| `specimen.render(fn)` | Specimen calls `fn` again when settings, inputs, the step, the theme or the size change. |
| `specimen.setSteps(n)` | Sets the number of steps for a stepped figure. |
| `specimen.goTo(n)` | Moves to step `n`. |
| `await specimen.audio(key)` | Gives the decoded `AudioBuffer` of a linked audio input. |
| `specimen.still = () => element` | Optional. Gives the canvas or SVG element to export as the still image for print. |

`inputs[key]` has `cardType`, `title`, `text` and, for audio and video, `bytes` (an `ArrayBuffer`) and `duration`.

Use the CSS variables `--ink`, `--ink-2`, `--muted`, `--faint`, `--line`, `--paper`, `--surface`, `--accent` and `--hot`. Then the figure follows the light and dark themes.

## The sandbox

Each figure runs in an `<iframe sandbox="allow-scripts">` with a strict Content Security Policy:

- No network requests. Linked media comes to the figure as bytes.
- No cookies, no storage and no access to the page around it.
- Inline scripts and `eval` are permitted. Thus a plugin can compile a formula that a reader types.

## Versions

A board records the plugin version that it uses. When you update a plugin, published figures do not change until you publish the board again.
