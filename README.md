# Specimen

Specimen is a research board for one topic at a time. You paste notes, sources, photos, audio and code onto a canvas. You connect the items that relate. Then you publish the board as a calm, illustrated page that readers can read and play with.

- Your files stay in storage that you own: a local folder, Google Drive, Dropbox, OneDrive, S3, Cloudflare R2, WebDAV or Nextcloud.
- A board is a plain folder: `board.json` and a `media/` folder. Any tool can read it.
- A published board is static HTML. You can put it on any host.

## Quick start

You need Node.js 22 or later and pnpm.

```sh
pnpm install
pnpm build          # builds the reader bundle and the web client
pnpm start          # serves the app on http://localhost:3000
```

For development, run the API and the Vite dev server together:

```sh
pnpm dev            # API on :3000, web client on :5173 (open this one)
```

With no settings, Specimen runs for one user, with no sign-in. It keeps boards in `./.data/Specimen`.

## Run with Docker

```sh
docker build -t specimen .
docker run -p 3000:3000 -v "$PWD/specimen-data:/data" specimen
```

## Settings

All settings are environment variables. All of them are optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `PUBLIC_URL` | `http://localhost:$PORT` | Public address. OAuth redirects and email links use it. |
| `DATA_DIR` | `./.data` | Instance file, encryption key and the default local storage. |
| `AUTH` | `none` | `none` (no sign-in), `password` (one user) or `hosted` (Google, GitHub, email link). |
| `PASSWORD` | – | Necessary when `AUTH=password`. |
| `SECRET` | random, in `DATA_DIR/secret.key` | Key that encrypts stored access tokens. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | – | Google sign-in and Google Drive storage. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | – | GitHub sign-in. |
| `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET` | – | Dropbox storage. |
| `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET` | – | OneDrive storage. |
| `SMTP_URL` | – | `smtp://user:pass@host:587` for email sign-in links. Without it, the server writes the link to its log. |
| `MAIL_FROM` | `Specimen <no-reply@localhost>` | Sender of sign-in emails. |

The OAuth redirect URL for every provider is `$PUBLIC_URL/api/oauth/callback`.

## Repository layout

| Path | Content |
|---|---|
| `packages/schema` | The board format (zod), the plugin manifest, the story builder and the API types. |
| `packages/story` | The published reader (React), the plugin sandbox and shared render parts. It also builds `reader.js` for static pages. |
| `apps/server` | The HTTP API (Hono): sign-in, storage adapters, boards, plugins and publishing. |
| `apps/web` | The web client (React and Vite): landing, dashboard, board editor, plugins and settings. |
| `plugins/` | Built-in figure plugins. Each one is a plain folder. |
| `docs/` | Design references and guides. |

## Guides

- [Publishing, and adding a board to your own site](docs/publishing.md)
- [Making a plugin](docs/plugins.md)
- [The board format](docs/board-format.md)

## Tests

```sh
pnpm test           # schema, server (API, storage adapters, publishing, sign-in) and web paste rules
pnpm typecheck
```

The server tests run real S3 and WebDAV protocol servers (`s3rver`, `webdav-server`). The Google Drive, Dropbox and OneDrive adapters need live accounts, so the tests do not cover them.

## License

MIT
