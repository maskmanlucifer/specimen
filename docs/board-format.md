# The board format

A board is a folder in your storage:

```
/Specimen/
  plugins/<id>/            your own plugins
  how-shazam-works/
    board.json             the board
    media/                 files that cards use
    published/             the share-link copy (when published that way)
```

`board.json` is plain JSON. The schema is in `packages/schema/src/board.ts`. These are the main fields:

| Field | Description |
|---|---|
| `format` | Format version. It is `1` now. |
| `title`, `dek`, `author` | The story title, the lead paragraph and the byline. |
| `visibility` | `draft`, `published` or `unlisted`. |
| `rev` | Revision number. The server increases it for each save. A save from an older revision gets a conflict. |
| `sections` | Areas on the canvas: `id`, `title`, `x`, `y`, `w`, `h` and an optional `intro`. |
| `cards` | The cards. See the types below. |
| `links` | Connections between cards: `from`, `to` and an optional `label`. |
| `trail` | Section ids in story order. |
| `plugins` | The plugin version that each figure uses. |
| `log` | The research log. It is not published. |
| `excludeMedia` | Media paths to leave out of published copies. |

## Card types

All cards have `id`, `type`, `sectionId`, `x`, `y`, `w`, `tags`, `private` and an optional `source` (`url`, `label`, `locator`). A source becomes a footnote in the story.

| Type | Extra fields |
|---|---|
| `note`, `question` | `text` |
| `fact` | `text`, `verified` |
| `quote` | `text`, `cite` |
| `link` | `url`, `title`, `site`, `description`, `image` |
| `image` | `src`, `caption`, `alt` |
| `audio` | `src`, `title`, `duration`, `peaks`, `markers`, `loop`, `transcript` |
| `video` | `src` (a file or a YouTube/Vimeo link), `title`, `duration` |
| `document` | `src`, `title`, `pages` |
| `code` | `lang`, `code`, `highlight` (line numbers) |
| `math` | `tex` |
| `figure` | `plugin`, `title`, `caption`, `settings`, `inputs`, `still` |

A `src` that does not start with `http` is a path in the board folder, for example `media/clip-01.mp3`.

## How the story is made

`buildStory()` in `packages/schema/src/story.ts` turns a board into a story:

1. It puts the sections in `trail` order.
2. In each section, it puts the cards in reading order: by rows from top to bottom, then from left to right.
3. It gives numbers to the figures in that order.
4. It collects the sources as numbered footnotes, one for each different source.
5. It removes private cards.
