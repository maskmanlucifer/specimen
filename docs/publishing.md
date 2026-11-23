# Publishing

The Publish dialog has two ways to share a board. Both use only the public parts of the board: private cards, links to them, the research log and left-out media are removed.

## Share link (Google Drive)

For a board in Google Drive. Specimen copies the public media to `<board>/published/` in your Drive, makes each copy readable by anyone with the link, and writes one `share.json` file with the board and its figure plugins.

The link opens the app's reader page (`#/s/<file id>`). Readers do not sign in. The page reads the public Drive files with a Google API key that is restricted to the Drive API and to the app's address.

**Unpublish** deletes the `published/` folder, so the link stops working.

A board in this browser cannot get a share link. Use **Move it to Google Drive** in the dialog first.

## Static site (download)

For a board in any storage. Specimen builds a static site and downloads `<board>-site.zip`:

```
<board>/
  index.html        the story, pre-rendered (readable without JavaScript)
  reader.js         makes the figures interactive (React is included)
  reader.css
  katex/            math fonts and styles
  board.json        the public board
  media/…           only the media that public cards use
  plugins/<id>/     the source of each figure plugin that the board uses
```

All paths in `index.html` are relative, so the folder works at any URL path.

### Add a board to your own site

1. Publish → **Download a static site**.
2. Unzip it into the folder that your site serves as-is, for example `public/notes/` in a React or Vite site.
3. Commit and deploy the site. The board is at `/notes/<board>/`.

To update the page, publish again and replace the folder.
