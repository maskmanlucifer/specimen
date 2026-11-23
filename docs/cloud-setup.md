# Cloud setup: Google Drive through your own Supabase

Specimen works without an account. Boards then stay in your browser (IndexedDB).

To keep boards in your Google Drive and open them on every device, connect your own Supabase project. Supabase signs you in with Google. A small Edge Function keeps the Google refresh token, so the browser gets fresh Drive access without a new sign-in every hour.

There is no Specimen server. You own every part: the Supabase project, the Google project and the Drive files.

Time: about 10 minutes. Cost: the free plans of Supabase and Google Cloud are enough.

## What you need

- A Supabase account: <https://supabase.com>
- A Google account
- Node.js 20 or later (for the Supabase CLI, through `npx`)
- The address where you open Specimen, for example `https://you.github.io/specimen/app/` or `http://localhost:5173/`

## 1. Create the Supabase project

1. In Supabase, select **New project**. Pick the region nearest to you.
2. Open **Project Settings → API**. Copy these two values:
   - **Project URL**, for example `https://abcd1234.supabase.co`
   - **anon public** key (also called the publishable key)

Do not copy the `service_role` key. Specimen never needs it.

## 2. Create the Google OAuth client

1. Open <https://console.cloud.google.com> and create a project, for example `specimen`.
2. Open **APIs & Services → Library**. Enable the **Google Drive API**.
3. Open **Google Auth Platform → Branding**. Set the app name (`Specimen`) and the support email.
4. Open **Audience**. Select **External**, then select **Publish app**. The app asks only for `drive.file`, which Google does not treat as a sensitive scope. If you keep the app in testing mode, Google stops the refresh token after 7 days.
5. Open **Data access → Add or remove scopes**. Add `.../auth/drive.file`, `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
6. Open **Clients → Create client**:
   - Type: **Web application**
   - **Authorised JavaScript origins**: the origin where you open Specimen, for example `https://you.github.io` and `http://localhost:5173`
   - **Authorised redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`
7. Copy the **Client ID** and the **Client secret**.

Optional, for share links: open **APIs & Services → Credentials → Create credentials → API key**. Restrict it to the **Google Drive API** and to your site's address (**HTTP referrers**). Readers use this key to open public share links without a sign-in.

## 3. Turn on Google sign-in in Supabase

1. In Supabase, open **Authentication → Sign In / Providers → Google**. Turn it on. Paste the Client ID and the Client secret.
2. Open **Authentication → URL Configuration**:
   - **Site URL**: your Specimen address, for example `https://you.github.io/specimen/app/`
   - **Redirect URLs**: the same address, and `http://localhost:5173/` if you also run Specimen on your computer

## 4. Add the table and the Edge Function

Run these commands from the root of the Specimen repository:

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push                      # creates public.google_tokens (RLS on, no browser access)
npx supabase functions deploy drive-token
npx supabase secrets set \
  GOOGLE_CLIENT_ID=<client id> \
  GOOGLE_CLIENT_SECRET=<client secret> \
  TOKEN_KEY=$(openssl rand -base64 32)
```

`TOKEN_KEY` encrypts the stored refresh tokens. Keep it only in Supabase secrets. If you lose it, each person signs in with Google again. Nothing else is lost.

## 5. Connect Specimen

1. Open Specimen. Go to **Settings → Storage → Your Supabase project → Set up**.
2. Paste the Project URL and the anon key. Paste the Google API key if you made one.
3. Select **Add Google Drive**, then **Continue with Google**.

New boards now go to `My Drive/Specimen/`. To move an older board from this browser to Drive, open the board, select **Publish**, then **Move it to Google Drive**.

## What is stored where

| Data | Place |
| --- | --- |
| Boards, media, your plugins | `My Drive/Specimen/` (only files that Specimen created) |
| Google refresh token, encrypted | `public.google_tokens` in your Supabase project |
| Supabase URL and anon key | `localStorage` in your browser |
| Settings, activity, no-account boards | IndexedDB in your browser |

## Disconnect

**Settings → Danger zone → Disconnect Google** revokes the Google token and deletes the stored row. Your Drive files stay where they are.

## For a deployment (optional)

To build Specimen with your project already set, so that visitors do not paste anything, set these variables at build time. They are public values:

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_GOOGLE_API_KEY=<api key>        # optional, for share links
```
