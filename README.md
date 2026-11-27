# Image Studio (Transloadit only)

Make pictures from a description, or upload a photo and tell it what to change.
Everything runs through **Transloadit** — no database, no other AI accounts, no extra image host.

## Start it (3 steps)

1. **Install Node.js** (once): https://nodejs.org — choose the "LTS" download.
2. **Double-click**
   - Windows: `start.bat`
   - Mac: `start.command`  (if Mac blocks it: right-click → Open)
   - Linux: run `npm install` then `npm start`
3. The page opens in your browser. The first time, paste your **Transloadit Auth Key and Auth Secret** into the box and press Save.

Keep the black start window open while you use the app. Close it to stop.

## Where do I get the keys?

Free account at https://transloadit.com → Dashboard → **Credentials** (Auth Keys) → copy the Auth Key and Auth Secret.

## How to use

- **Create a new picture**: type what you want, pick a shape, press the button.
- **Edit my picture**: upload a photo, type what should change ("make the sky a sunset"), press the button.
- Every picture is saved in the `outputs` folder and shown under "Your pictures".
- On a finished picture, press **Edit this picture** to keep refining it.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "Transloadit did not accept your keys" | Press **Change keys** at the bottom and paste them again. |
| "out of quota or credits" | Check your plan on transloadit.com. |
| Page says it cannot reach the server | The start window was closed. Start it again. |
| Edit fails with a certain picture maker | Pick **Nano Banana** under *More options*. |

## What changed from the old version

Removed: Alibaba, Cloudflare, Pixazo, imgbb, Postgres, chat/prompt-generator, Railway config.
Kept: Transloadit generate + edit, the picture history (now just files on disk).

Transloadit's own download links are temporary, so the app saves each result into `outputs/` right away.

## Optional: put it online

Not needed for normal use. If you do host it (e.g. Railway with the included `Dockerfile`):

- Set `TRANSLOADIT_AUTH_KEY` and `TRANSLOADIT_AUTH_SECRET` as environment variables (saving keys from the web page is disabled online on purpose).
- **Set `APP_PASSWORD`**, otherwise anyone with the link can spend your Transloadit credits.
- Hosting disks are often wiped on redeploy, so download pictures you want to keep.
