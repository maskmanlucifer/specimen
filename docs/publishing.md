# Publishing

When you publish a board, Specimen makes a static copy of it. The copy has these files:

```
index.html        the story, rendered on the server (it is readable without JavaScript)
reader.js         makes the figures interactive (React is included)
reader.css
katex/            math fonts and styles
board.json        the public board: private cards, links to them and the research log are removed
media/…           only the media that public cards use
plugins/<id>/     the source of each figure plugin that the board uses
```

All paths in `index.html` are relative. Thus you can put the folder at any URL path.

## Where the copy goes

Select the target in the Publish dialog.

| Target | What Specimen does |
|---|---|
| Share link | Writes the copy to `<board>/published/` in your storage. This server shows it at `/s/<storage>/<board>/`. |
| Folder | Writes the copy to `<folder>/<board>/`. |
| GitHub Pages | Commits the copy to `<board>/` on the `gh-pages` branch. The token needs the "contents: write" permission. |
| Netlify | Keeps a local copy of all your published boards and deploys it as one site. |
| Cloudflare Pages | Same as Netlify, with `wrangler pages deploy`. The target is `account-id/project-name`. |
| My server | Same, with `rsync` over SSH. The target is `user@host:/path`. |

Unpublish removes the copy from the target and sets the board back to draft.

## Add a board to your own site (for example, `maskman/lucifer`)

Use the **Folder** target. It writes plain static files into the site's `public/` folder. The site build then copies them without change.

1. In Settings → Publishing, add a Folder host. Set the folder to the `public/` folder of the site, plus a subfolder. For example:

   ```
   /Users/as/Desktop/maskman/lucifer/public/notes
   ```

2. In the Publish dialog, select **Folder**. As the custom domain, type the public address of that subfolder. For example:

   ```
   maskmanlucifer.github.io/lucifer/notes
   ```

   Specimen then shows the correct public link after it publishes.

3. Publish. The board is now at `public/notes/<board>/index.html`.

4. Link to it from the site. In a Create React App site, files in `public/` are served under the `homepage` path:

   ```jsx
   <a href={`${process.env.PUBLIC_URL}/notes/how-compression-works/`}>How compression works</a>
   ```

5. Deploy the site as usual (for `lucifer`: `npm run deploy`).

When you publish again, Specimen replaces only that board's folder.
