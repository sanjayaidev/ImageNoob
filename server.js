// Sanjay Image Studio — Transloadit only.
// One file, no database. Images are saved in the ./outputs folder.

import dotenv from 'dotenv';
import express from 'express';
import { Transloadit } from 'transloadit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '.env');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

dotenv.config({ path: ENV_PATH });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const PORT = Number(process.env.PORT) || 3000;
// Local by default: only your own computer can open it.
const HOST = process.env.HOST || '127.0.0.1';

// ---------- Options shown in the UI ----------

const MODELS = [
  { id: 'google/nano-banana', label: 'Nano Banana (default)', canEdit: true },
  { id: 'google/nano-banana-2', label: 'Nano Banana 2 (newer)', canEdit: true },
  { id: 'google/nano-banana-pro', label: 'Nano Banana Pro (best quality)', canEdit: true },
  { id: 'flux-schnell', label: 'Flux Schnell (fast, create only)', canEdit: false },
];
const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const FORMATS = ['png', 'jpeg', 'webp'];

// ---------- Small helpers ----------

const isConfigured = () =>
  Boolean(process.env.TRANSLOADIT_AUTH_KEY && process.env.TRANSLOADIT_AUTH_SECRET);

function saveEnv(updates) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) {
      text = text.replace(re, () => line);
    } else {
      if (text && !text.endsWith('\n')) text += '\n';
      text += line + '\n';
    }
    process.env[key] = value;
  }
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}
function writeHistory(items) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(items, null, 2));
}

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanPrompt(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new UserError('Please type what you want first.');
  }
  const text = value.trim();
  if (text.length > 2000) throw new UserError('That description is too long. Please keep it under 2000 characters.');
  return text;
}

// Google models can return JPEG bytes even when PNG was requested, so we
// look at the file's first bytes instead of trusting the requested format.
function sniffExtension(buf, fallback) {
  if (buf.length > 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  }
  return fallback === 'jpeg' ? 'jpg' : fallback || 'png';
}

function pick(value, allowed, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) throw new UserError(`Unknown ${label}.`);
  return value;
}

// Turn Transloadit / network errors into something a beginner can act on.
function friendlyError(err) {
  const raw = String(err?.code || err?.message || err || '');
  if (/AUTH_KEY|SIGNATURE|AUTH_EXPIRED|ACCOUNT_UNKNOWN|UNAUTHORIZED/i.test(raw)) {
    return new UserError('Transloadit did not accept your keys. Click "Change keys" and paste them again.', 401);
  }
  if (/LIMIT|QUOTA|PLAN|PAYMENT|CREDIT/i.test(raw)) {
    return new UserError('Your Transloadit account looks out of quota or credits. Check your plan on transloadit.com.', 402);
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(raw)) {
    return new UserError('Could not reach Transloadit. Check your internet connection and try again.', 502);
  }
  if (/timeout|timed out/i.test(raw)) {
    return new UserError('This took too long. Try again, or try a simpler description.', 504);
  }
  const msg = err?.message || 'Something went wrong while making the image.';
  return new UserError(msg, 502);
}

// ---------- Talking to Transloadit ----------

async function runAssembly(steps, imagePath) {
  if (!isConfigured()) {
    throw new UserError('Add your Transloadit keys first (see the box at the top of the page).', 401);
  }
  const client = new Transloadit({
    authKey: process.env.TRANSLOADIT_AUTH_KEY,
    authSecret: process.env.TRANSLOADIT_AUTH_SECRET,
  });

  let assembly;
  try {
    assembly = await client.createAssembly({
      params: { steps },
      files: imagePath ? { image: imagePath } : undefined,
      waitForCompletion: true,
      timeout: 5 * 60 * 1000,
    });
  } catch (err) {
    throw friendlyError(err);
  }

  if (assembly.error) {
    throw friendlyError(new Error(`${assembly.error}: ${assembly.message || ''}`));
  }
  const out = assembly.results?.result?.[0];
  if (!out) {
    throw new UserError('Transloadit finished but did not return an image. Try a different description.', 502);
  }
  return out;
}

async function saveResult(out, { type, prompt, model, format }) {
  const url = out.ssl_url || out.url;
  if (!url) throw new UserError('Transloadit did not return a download link.', 502);

  const res = await fetch(url);
  if (!res.ok) throw new UserError('The image was made but could not be downloaded.', 502);
  const buffer = Buffer.from(await res.arrayBuffer());

  const ext = sniffExtension(buffer, out.ext || format);
  const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const file = `${id}.${ext}`;
  await fsp.writeFile(path.join(OUTPUT_DIR, file), buffer);

  const item = { id, type, prompt, model, file, createdAt: new Date().toISOString() };
  writeHistory([item, ...readHistory()]);
  return { ...item, url: `/outputs/${file}` };
}

// ---------- Web server ----------

const app = express();
app.use(express.json({ limit: '25mb' }));

// Optional password for when you put this online: set APP_PASSWORD.
if (process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const given = Buffer.from(header.replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
    const a = Buffer.from(given);
    const b = Buffer.from(process.env.APP_PASSWORD);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Image Studio"');
    res.status(401).send('Password needed');
  });
}

app.use('/outputs', express.static(OUTPUT_DIR, { index: false }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.get('/api/status', (req, res) => {
  res.json({ configured: isConfigured(), models: MODELS, aspects: ASPECTS });
});

// Save the keys from the web page (only works from the same computer).
app.post('/api/setup', (req, res) => {
  const ip = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) {
    throw new UserError('For safety, keys can only be saved from the computer running the server. Set them as environment variables instead.', 403);
  }
  const authKey = String(req.body?.authKey || '').trim();
  const authSecret = String(req.body?.authSecret || '').trim();
  const valid = /^[A-Za-z0-9_-]{8,128}$/;
  if (!valid.test(authKey) || !valid.test(authSecret)) {
    throw new UserError('Those keys do not look right. Copy them again from Transloadit without spaces.');
  }
  saveEnv({ TRANSLOADIT_AUTH_KEY: authKey, TRANSLOADIT_AUTH_SECRET: authSecret });
  res.json({ configured: true });
});

app.post('/api/generate', wrap(async (req, res) => {
  const prompt = cleanPrompt(req.body?.prompt);
  const model = pick(req.body?.model, MODELS.map((m) => m.id), MODELS[0].id, 'model');
  const aspect = pick(req.body?.aspectRatio, ASPECTS, '1:1', 'shape');
  const format = pick(req.body?.format, FORMATS, 'png', 'format');

  const out = await runAssembly({
    result: {
      robot: '/image/generate',
      result: true,
      interpolate: { prompt: false }, // treat the prompt as plain text
      prompt,
      model,
      format,
      aspect_ratio: aspect,
    },
  });
  res.json(await saveResult(out, { type: 'generate', prompt, model, format }));
}));

app.post('/api/edit', wrap(async (req, res) => {
  const prompt = cleanPrompt(req.body?.prompt);
  const editModels = MODELS.filter((m) => m.canEdit).map((m) => m.id);
  const model = pick(req.body?.model, editModels, editModels[0], 'model');
  const format = pick(req.body?.format, FORMATS, 'png', 'format');

  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.image || '');
  if (!match) throw new UserError('Please choose a PNG, JPG or WebP image to edit.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 15 * 1024 * 1024) throw new UserError('That image is too big. Please use one under 15 MB.');

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'studio-'));
  const tmpFile = path.join(tmpDir, `source.${match[1] === 'jpeg' ? 'jpg' : match[1]}`);
  try {
    await fsp.writeFile(tmpFile, bytes);
    const out = await runAssembly(
      {
        ':original': { robot: '/upload/handle' },
        result: {
          robot: '/image/generate',
          use: [{ as: 'image', fields: 'image', name: ':original' }],
          result: true,
          interpolate: { prompt: false }, // treat the prompt as plain text
          prompt,
          model,
          format,
        },
      },
      tmpFile,
    );
    res.json(await saveResult(out, { type: 'edit', prompt, model, format }));
  } finally {
    fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}));

app.get('/api/gallery', (req, res) => {
  const items = readHistory()
    .filter((i) => fs.existsSync(path.join(OUTPUT_DIR, i.file)))
    .slice(0, 60)
    .map((i) => ({ ...i, url: `/outputs/${i.file}` }));
  res.json(items);
});

app.delete('/api/gallery/:id', wrap(async (req, res) => {
  const history = readHistory();
  const item = history.find((i) => i.id === req.params.id);
  if (!item) throw new UserError('That image was already removed.', 404);
  await fsp.rm(path.join(OUTPUT_DIR, item.file), { force: true });
  writeHistory(history.filter((i) => i.id !== item.id));
  res.json({ ok: true });
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

app.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Image Studio is running at ${url}`);
  console.log('  Keep this window open while you use it. Press Ctrl+C to stop.\n');
  if (process.env.AUTO_OPEN === '1') {
    const [cmd, args] =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
});
