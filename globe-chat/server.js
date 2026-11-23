// server.js: serves the website and runs one chat room per country
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// maxHttpBufferSize: refuse any single message bigger than 10 KB before it's even read
const io = new Server(server, { maxHttpBufferSize: 10_000 });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/globe.gl/dist')));
// Earth textures (night lights, etc.) that come with the globe library
app.use('/textures', express.static(path.join(__dirname, 'node_modules/three-globe/example/img')));

// ---------- Live TV: which video each channel has live right now ----------
// YouTube's "live_stream?channel=" player link sometimes picks a video the channel doesn't let
// other websites play (BBC News, Sky News and WION did this), even though the live video
// youtube.com shows for them IS allowed. So the server opens youtube.com/channel/<id>/live,
// the same page you'd see on YouTube, takes the video ID from it, and the page plays that
// exact video. Answers are remembered for 10 minutes so YouTube isn't asked on every click.
const YT_CHANNEL_ID = /^UC[\w-]{22}$/;
const LIVE_CACHE_MS = 10 * 60 * 1000;   // remember a found video for 10 minutes
const MISS_CACHE_MS = 2 * 60 * 1000;    // if nothing was found, try again after 2 minutes
const liveCache = new Map();            // channel ID -> { videoId, at }

async function findLiveVideo(channelId) {
  const cached = liveCache.get(channelId);
  if (cached && Date.now() - cached.at < (cached.videoId ? LIVE_CACHE_MS : MISS_CACHE_MS)) {
    return cached.videoId;
  }
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(8000),   // give up after 8 seconds
  });
  const html = await res.text();
  // The video ID is in the page's canonical link, and again in its player data
  const match =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/) ||
    html.match(/"videoDetails":\{"videoId":"([\w-]{11})"/);
  const videoId = match ? match[1] : null;
  liveCache.set(channelId, { videoId, at: Date.now() });
  return videoId;
}

app.get('/api/live/:channelId', async (req, res) => {
  const { channelId } = req.params;
  if (!YT_CHANNEL_ID.test(channelId)) return res.status(400).json({ error: 'Invalid channel' });
  try {
    res.json({ videoId: await findLiveVideo(channelId) });
  } catch (err) {
    console.error(`Could not look up the live video for ${channelId}: ${err.message}`);
    res.json({ videoId: null });   // the page then falls back to YouTube's channel link
  }
});

const MAX_HISTORY = 50;        // messages kept per country
const MAX_LENGTH = 500;        // characters per message
const MIN_INTERVAL_MS = 1000;  // basic spam protection: 1 message per second
const COUNTRY_CODE = /^[A-Z]{3}$/;

// ---------- Saving chats to a file ----------
// Every message is written to data/chat-history.json, so chats survive
// the server stopping (closing VS Code, Ctrl+C, restarting your Mac).
const DATA_FILE = path.join(__dirname, 'data', 'chat-history.json');
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

function loadHistory() {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return new Map(Object.entries(saved));        // { "FRA": [...] } -> Map
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();    // no file yet: first run
    // File exists but can't be read: stop instead of overwriting it
    console.error(`Could not read ${DATA_FILE}: ${err.message}`);
    process.exit(1);
  }
}

function saveHistory() {
  const json = JSON.stringify(Object.fromEntries(history), null, 2);
  const temp = DATA_FILE + '.tmp';
  try {
    // Write to a scratch file, then swap it in. If the server crashes mid-save,
    // the real file is never left half-written.
    fs.writeFileSync(temp, json);
    fs.renameSync(temp, DATA_FILE);
  } catch (err) {
    console.error('Could not save chats:', err.message);
  }
}

// Chat history by country, e.g. { "FRA": [msg, msg], "JPN": [msg] }
// Loaded from the file when the server starts.
const history = loadHistory();
const savedCount = [...history.values()].reduce((sum, list) => sum + list.length, 0);
console.log(`Loaded ${savedCount} saved messages across ${history.size} countries`);

const roomFor = (code) => `country:${code}`;

// ---------- Cleaning what people type ----------
// Characters people can paste in that are invisible or cause trouble:
//   \u0000-\u001F, \u007F-\u009F   control characters (beeps, null bytes, etc.)
//   ​, ⁠, ﻿          zero-width spaces that make a message look empty
//   ‪-‮, ⁦-⁩    direction overrides that display text backwards
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F​⁠﻿‪-‮⁦-⁩]/g;

function cleanText(text) {
  const cleaned = text
    .normalize('NFC')          // store accented letters one consistent way
    .replace(/\s+/g, ' ')      // turn tabs, newlines and long runs of spaces into one space
    .replace(UNSAFE_CHARS, '') // remove the characters listed above
    .trim();
  // Cut by characters, not bytes, so an emoji at the limit isn't split in half
  return Array.from(cleaned).slice(0, MAX_LENGTH).join('');
}

function broadcastPresence(code) {
  if (!code) return;
  const count = io.sockets.adapter.rooms.get(roomFor(code))?.size ?? 0;
  io.to(roomFor(code)).emit('presence', { country: code, count });
}

io.on('connection', (socket) => {
  socket.data.name = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
  socket.data.country = null;
  socket.data.lastMessageAt = 0;
  socket.emit('welcome', { name: socket.data.name });

  // User selected a country on the globe
  socket.on('join', (code, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    if (typeof code !== 'string' || !COUNTRY_CODE.test(code)) {
      return ack({ ok: false, error: 'Invalid country' });
    }

    const previous = socket.data.country;
    if (previous) socket.leave(roomFor(previous));

    socket.join(roomFor(code));
    socket.data.country = code;

    ack({ ok: true, messages: history.get(code) ?? [] });
    broadcastPresence(code);
    if (previous && previous !== code) broadcastPresence(previous);
  });

  // User deselected the country
  socket.on('leave', () => {
    const previous = socket.data.country;
    if (!previous) return;
    socket.leave(roomFor(previous));
    socket.data.country = null;
    broadcastPresence(previous);
  });

  // User sent a comment
  socket.on('message', (text, ack) => {
    if (typeof ack !== 'function') ack = () => {};
    const code = socket.data.country;

    // The real rule lives here: no country selected means no chatting,
    // even if someone re-enables the input box with dev tools.
    if (!code) return ack({ ok: false, error: 'Select a country to use chat' });
    if (typeof text !== 'string') return ack({ ok: false, error: 'Invalid message' });

    text = cleanText(text);
    if (!text) return ack({ ok: false, error: 'Message is empty' });

    const now = Date.now();
    if (now - socket.data.lastMessageAt < MIN_INTERVAL_MS) {
      return ack({ ok: false, error: 'Slow down a little' });
    }
    socket.data.lastMessageAt = now;

    const msg = { id: `${now}-${socket.id}`, country: code, user: socket.data.name, text, ts: now };

    const list = history.get(code) ?? [];
    list.push(msg);
    if (list.length > MAX_HISTORY) list.shift();
    history.set(code, list);
    saveHistory();

    io.to(roomFor(code)).emit('message', msg);   // only people viewing this country get it
    ack({ ok: true });
  });

  socket.on('disconnect', () => broadcastPresence(socket.data.country));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Global News running at http://localhost:${PORT}`));
