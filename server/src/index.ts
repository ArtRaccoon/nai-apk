import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import FormData from 'form-data';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

type User = { id: string; identifier: string; passwordHash: string; chatId?: string; linkCode?: string };
type Store = { users: User[] };
const dataFile = process.env.DATA_FILE || 'data.json';
const load = (): Store => existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : { users: [] };
const save = (data: Store) => writeFileSync(dataFile, JSON.stringify(data, null, 2));
const secret = process.env.JWT_SECRET || 'development-only-change-me';
const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const raw = req.headers.authorization?.replace('Bearer ', '');
    const claims = jwt.verify(raw || '', secret) as { sub: string };
    if (!load().users.some((user) => user.id === claims.sub)) throw new Error();
    (req as any).userId = claims.sub;
    next();
  } catch { res.status(401).json({ error: 'Требуется вход.' }); }
}
function userId(req: express.Request) { return (req as any).userId as string; }
function issue(user: User) { return { token: jwt.sign({ sub: user.id }, secret, { expiresIn: '30d' }), user: { id: user.id, identifier: user.identifier } }; }

app.post('/auth/register', async (req, res) => {
  const identifier = String(req.body.identifier || '').trim(), password = String(req.body.password || '');
  if (identifier.length < 3 || password.length < 8) return res.status(400).json({ error: 'Никнейм — от 3 символов, пароль — от 8.' });
  const db = load();
  if (db.users.some((user) => user.identifier.toLowerCase() === identifier.toLowerCase())) return res.status(409).json({ error: 'Этот пользователь уже существует.' });
  const user: User = { id: randomBytes(12).toString('hex'), identifier, passwordHash: await bcrypt.hash(password, 12) };
  db.users.push(user); save(db); res.json(issue(user));
});
app.post('/auth/login', async (req, res) => {
  const user = load().users.find((entry) => entry.identifier.toLowerCase() === String(req.body.identifier || '').trim().toLowerCase());
  if (!user || !await bcrypt.compare(String(req.body.password || ''), user.passwordHash)) return res.status(401).json({ error: 'Неверный логин или пароль.' });
  res.json(issue(user));
});
app.post('/tg/link/start', auth, (req, res) => {
  const bot = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
  if (!bot) return res.status(503).json({ error: 'Telegram username не настроен.' });
  const db = load(), user = db.users.find((entry) => entry.id === userId(req))!;
  user.linkCode = randomBytes(5).toString('hex'); save(db);
  res.json({ linkCode: user.linkCode, deepLink: `https://t.me/${bot}?start=${user.linkCode}` });
});
app.get('/tg/status', auth, (req, res) => {
  const user = load().users.find((entry) => entry.id === userId(req));
  res.json({ linked: Boolean(user?.chatId) });
});
app.post('/tg/mirror', auth, async (req, res) => {
  // Reload the user so a bot /start binding made after app login is visible here.
  const user = load().users.find((entry) => entry.id === userId(req));
  if (!user?.chatId) return res.json({ mirrored: false, reason: 'not_linked' });
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  if (!bot) return res.status(503).json({ error: 'Telegram bot не настроен.' });
  const { imageBase64, prompt = '', seed, model, size } = req.body;
  if (typeof imageBase64 !== 'string') return res.status(400).json({ error: 'Нет изображения.' });
  const form = new FormData();
  form.append('chat_id', user.chatId);
  form.append('caption', `${String(prompt).slice(0, 600) || 'Без промпта'}\nseed: ${seed} · ${model} · ${size}`);
  form.append('photo', Buffer.from(imageBase64, 'base64'), { filename: 'generation.png', contentType: 'image/png' });
  const response = await fetch(`https://api.telegram.org/bot${bot}/sendPhoto`, { method: 'POST', headers: form.getHeaders(), body: form as any });
  if (!response.ok) return res.status(502).json({ error: 'Telegram не принял изображение.' });
  res.json({ mirrored: true });
});
async function poll() {
  const bot = process.env.TELEGRAM_BOT_TOKEN; if (!bot) return;
  let offset = 0;
  for (;;) try {
    const response = await fetch(`https://api.telegram.org/bot${bot}/getUpdates?timeout=25&offset=${offset}`);
    const data: any = await response.json();
    for (const update of data.result || []) {
      offset = update.update_id + 1;
      const match = (update.message?.text || '').match(/^\/start\s+([a-f0-9]+)$/i);
      if (!match) continue;
      const db = load(), user = db.users.find((entry) => entry.linkCode === match[1]);
      if (!user) continue;
      user.chatId = String(update.message.chat.id); user.linkCode = undefined; save(db);
      await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: user.chatId, text: '✅ Telegram привязан. Новые генерации будут приходить сюда.' }) });
    }
  } catch (error) { console.error('Telegram polling error', error); }
}
app.listen(Number(process.env.PORT || 3000), () => console.log('Server listening'));
poll();
