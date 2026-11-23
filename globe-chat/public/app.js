// =====================================================
//  State
// =====================================================
let selected = null;   // GeoJSON feature of the selected country, or null
let hovered = null;    // feature under the mouse
let myName = '';
let collapsed = false; // is the chat panel hidden?
let unread = 0;        // new messages that arrived while it was hidden

const socket = io();   // connects to the same server that served this page

// =====================================================
//  DOM references
// =====================================================
const els = {
  layout:   document.getElementById('layout'),
  globe:    document.getElementById('globe'),
  stars:    document.getElementById('stars'),
  warp:     document.getElementById('warp'),
  link:     document.getElementById('link'),
  linkText: document.getElementById('link-text'),
  readout:  document.getElementById('readout'),
  readoutName:   document.getElementById('readout-name'),
  readoutCoords: document.getElementById('readout-coords'),
  expand:   document.getElementById('chat-expand'),
  expandLabel: document.getElementById('chat-expand-label'),
  unread:   document.getElementById('chat-unread'),
  collapse: document.getElementById('chat-collapse'),
  me:       document.getElementById('me'),
  title:    document.getElementById('chat-title'),
  online:   document.getElementById('chat-online'),
  close:    document.getElementById('chat-close'),
  messages: document.getElementById('chat-messages'),
  empty:    document.getElementById('chat-empty'),
  status:   document.getElementById('chat-status'),
  form:     document.getElementById('chat-form'),
  input:    document.getElementById('chat-input'),
  send:     document.getElementById('chat-send'),
};

const codeOf = (f) => f.properties.ADM0_A3;   // 3 letter code, e.g. "FRA"
const nameOf = (f) => f.properties.ADMIN;     // display name, e.g. "France"

// =====================================================
//  Globe
// =====================================================
const globe = new Globe(els.globe)
  .backgroundColor('rgba(0,0,0,0)')                 // see-through, so the stars show behind
  .globeImageUrl('/textures/earth-night.jpg')        // Earth at night with city lights
  .atmosphereColor('#7fb2ff')
  .atmosphereAltitude(0.18)
  .polygonSideColor(() => 'rgba(242,181,68,0.12)')
  .polygonStrokeColor(() => 'rgba(242,181,68,0.3)')  // thin gold borders
  .polygonLabel((f) => nameOf(f))
  .polygonsTransitionDuration(200)
  .onPolygonHover((f) => {
    hovered = f;
    els.globe.style.cursor = f ? 'pointer' : 'grab';
    refreshGlobe();
  })
  .onPolygonClick((f, _event, coords) => selectCountry(f, coords))
  .onGlobeClick(() => selectCountry(null));   // clicking the ocean deselects

globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.35;

// Softer, more even lighting so the night side and its city lights stay visible
const [ambientLight, sunLight] = globe.lights();
ambientLight.intensity *= 1.5;
sunLight.intensity *= 0.35;

// Passing new accessor functions tells globe.gl to recolor the countries.
// Countries are mostly see-through so the city lights underneath stay visible.
function refreshGlobe() {
  globe
    .polygonAltitude((f) => (f === selected ? 0.04 : f === hovered ? 0.015 : 0.006))
    .polygonCapColor((f) =>
      f === selected ? 'rgba(242,181,68,0.45)' : f === hovered ? 'rgba(242,181,68,0.2)' : 'rgba(0,0,0,0)'
    );
}

function resizeGlobe() {
  globe.width(els.globe.clientWidth).height(els.globe.clientHeight);
}
// Resize the globe whenever its box changes size: window resizes AND the chat opening/closing
new ResizeObserver(resizeGlobe).observe(els.globe);
resizeGlobe();
refreshGlobe();

fetch('countries.geojson')
  .then((res) => res.json())
  .then((geo) => globe.polygonsData(geo.features.filter((f) => codeOf(f) !== 'ATA'))); // skip Antarctica

// =====================================================
//  Selecting a country
// =====================================================
function selectCountry(feature, coords) {
  if (feature === selected) return;
  selected = feature;
  refreshGlobe();

  if (!feature) {
    socket.emit('leave');
    setChatEnabled(false);
    setReadout(null);
    globe.controls().autoRotate = true;
    return;
  }

  globe.controls().autoRotate = false;
  if (coords) globe.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 1.8 }, 900);
  starfield.jump();   // stars streak past while the globe flies to the country

  setChatEnabled(true);
  setReadout(feature, coords);
  joinRoom();
}

// Country name and coordinates in the bottom left of the view
function setReadout(feature, coords) {
  els.readout.classList.toggle('active', !!feature);
  els.readoutName.textContent = feature ? nameOf(feature) : 'Pick a country to open its channel';
  els.readoutCoords.textContent = feature && coords ? formatCoords(coords) : '';
}

function formatCoords({ lat, lng }) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lng).toFixed(2)}° ${ew}`;
}

// =====================================================
//  Starfield
//  Stars drift slowly behind the globe. When you pick a country they streak
//  into hyperspace on a second layer in front of the globe, then settle again.
// =====================================================
const starfield = (() => {
  const back = els.stars.getContext('2d');   // calm stars, behind the globe
  const front = els.warp.getContext('2d');   // streaks, in front of the globe
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;  // respect the OS setting
  const COUNT = 650;
  const JUMP_MS = 1100;
  const STAR_COLOR = '#e6eeff';
  const stars = [];
  let width = 0, height = 0;
  let jumpStart = -Infinity;
  let frontDirty = false;

  // Each star has an x/y spread around the center and a depth z (1 = far away, near 0 = right in front of you)
  function placeStar(star, far) {
    star.x = Math.random() * 2 - 1;
    star.y = Math.random() * 2 - 1;
    star.z = far ? 0.7 + Math.random() * 0.3 : 0.15 + Math.random() * 0.85;
    star.brightness = 0.45 + Math.random() * 0.55;
  }
  for (let i = 0; i < COUNT; i++) { const s = {}; placeStar(s, false); stars.push(s); }

  // Turn a star's 3D position into a point on screen (closer stars sit further from the center)
  function toScreen(star, z) {
    const spread = Math.max(width, height) * 0.25;
    return [width / 2 + (star.x / z) * spread, height / 2 + (star.y / z) * spread];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = els.stars.clientWidth;
    height = els.stars.clientHeight;
    for (const canvas of [els.stars, els.warp]) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (still) draw(0);
  }

  function draw(warp) {
    const jumping = warp > 0.02;
    back.clearRect(0, 0, width, height);
    if (jumping || frontDirty) front.clearRect(0, 0, width, height);
    frontDirty = jumping;

    const speed = 0.0004 + warp * 0.022;   // tiny drift normally, very fast during a jump

    for (const star of stars) {
      if (!still) star.z -= speed;
      if (star.z <= 0.03) { placeStar(star, true); continue; }

      const [x, y] = toScreen(star, star.z);
      if (x < -50 || x > width + 50 || y < -50 || y > height + 50) { placeStar(star, true); continue; }

      const closeness = 1 - star.z;   // 0 far .. 1 close

      if (jumping) {
        // A line from a little further back to where the star is now: a streak
        const [tx, ty] = toScreen(star, Math.min(star.z + 0.04 + warp * 0.3, 1.3));
        front.globalAlpha = star.brightness * (0.2 + closeness * 0.6) * Math.min(1, warp * 1.4);
        front.strokeStyle = STAR_COLOR;
        front.lineWidth = 0.5 + closeness * 1.5;
        front.beginPath();
        front.moveTo(tx, ty);
        front.lineTo(x, y);
        front.stroke();
      } else {
        const size = 0.7 + closeness * 1.6;
        back.globalAlpha = star.brightness * (0.45 + closeness * 0.55);
        back.fillStyle = STAR_COLOR;
        back.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    back.globalAlpha = 1;
    front.globalAlpha = 1;
  }

  function frame(now) {
    // Jump strength rises then falls over JUMP_MS (a smooth hump from 0 to 1 and back)
    const t = (now - jumpStart) / JUMP_MS;
    const warp = t >= 0 && t < 1 ? Math.sin(Math.PI * t) ** 1.5 : 0;
    draw(warp);
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(els.stars);
  resize();
  if (!still) requestAnimationFrame(frame);

  return { jump() { if (!still) jumpStart = performance.now(); } };
})();

// Ask the server to put us in this country's room and send its recent messages
function joinRoom() {
  if (!selected) return;
  const feature = selected;
  els.messages.replaceChildren();
  els.empty.textContent = 'Loading comments…';
  setUnread(0);

  socket.emit('join', codeOf(feature), (res) => {
    // If the user clicked a different country before the reply came back, ignore it
    if (selected !== feature) return;
    if (!res?.ok) return showStatus(res?.error || 'Could not join chat');
    els.empty.textContent = `No comments on ${nameOf(feature)} yet. Start the conversation.`;
    res.messages.forEach(renderMessage);
  });
}

// =====================================================
//  Chat panel
// =====================================================
function setChatEnabled(enabled) {
  els.input.disabled = !enabled;
  els.send.disabled = !enabled;
  els.close.hidden = !enabled;
  els.online.textContent = '';
  showStatus('');

  els.expandLabel.textContent = enabled ? nameOf(selected) : 'Chat';

  if (enabled) {
    const name = nameOf(selected);
    els.title.textContent = `${name} chat`;
    els.input.placeholder = `Comment on ${name} news…`;
    els.input.focus();
  } else {
    els.title.textContent = 'Country chat';
    els.input.placeholder = 'Select a country to use chat';
    els.input.value = '';
    els.messages.replaceChildren();
    els.empty.textContent = 'Select a country to use chat';
  }
}

function renderMessage(msg) {
  const mine = msg.user === myName;
  const li = document.createElement('li');
  li.className = mine ? 'msg mine' : 'msg';

  // Top line: who sent it on the left, time on the right
  const meta = document.createElement('div');
  meta.className = 'meta';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = mine ? 'You' : msg.user;
  const when = document.createElement('time');
  when.className = 'when';
  when.dateTime = new Date(msg.ts).toISOString();
  when.textContent = new Date(msg.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  meta.append(who, when);

  // textContent (not innerHTML) so nobody can inject HTML or scripts into the page
  const body = document.createElement('p');
  body.textContent = msg.text;

  li.append(meta, body);
  els.messages.append(li);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function showStatus(text) {
  els.status.textContent = text;
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text || !selected) return;

  els.input.value = '';
  socket.emit('message', text, (res) => {
    if (res?.ok) return showStatus('');
    els.input.value = text;            // give the text back so it isn't lost
    showStatus(res?.error || 'Message not sent');
  });
});

els.close.addEventListener('click', () => selectCountry(null));

// =====================================================
//  Retractable chat panel
// =====================================================
function setCollapsed(value) {
  collapsed = value;
  els.layout.classList.toggle('chat-collapsed', collapsed);   // style.css does the hiding
  els.collapse.setAttribute('aria-expanded', String(!collapsed));
  els.expand.setAttribute('aria-expanded', String(!collapsed));

  if (!collapsed) {
    setUnread(0);
    els.messages.scrollTop = els.messages.scrollHeight;
    if (selected) els.input.focus();
  }
  // Remember the choice for next visit (wrapped in try because some browsers block storage)
  try { localStorage.setItem('chatCollapsed', collapsed ? '1' : '0'); } catch {}
}

function setUnread(count) {
  unread = count;
  els.unread.textContent = count === 0 ? '' : count > 99 ? '99+' : String(count);
}

els.collapse.addEventListener('click', () => setCollapsed(true));
els.expand.addEventListener('click', () => setCollapsed(false));

let startCollapsed = false;
try { startCollapsed = localStorage.getItem('chatCollapsed') === '1'; } catch {}
setCollapsed(startCollapsed);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Escape first leaves theater mode (the TV keeps playing in the floating monitor).
  // Only when there's no theater to leave does it deselect the country.
  if (liveTV.handleEscape()) return;
  selectCountry(null);
});

// =====================================================
//  Socket events from the server
// =====================================================
socket.on('welcome', ({ name }) => {
  myName = name;
  els.me.textContent = `Chatting as ${name}`;
});

socket.on('message', (msg) => {
  if (!selected || msg.country !== codeOf(selected)) return;
  renderMessage(msg);
  if (collapsed && msg.user !== myName) setUnread(unread + 1);   // badge on the hidden tab
});

socket.on('presence', ({ country, count }) => {
  if (selected && country === codeOf(selected)) els.online.textContent = `${count} online`;
});

// Connection light in the top bar
function setLink(state, text) {
  els.link.dataset.state = state;
  els.linkText.textContent = text;
}

// If the connection drops and comes back, rejoin the room we were in
socket.on('connect', () => {
  setLink('connected', 'Connected');
  showStatus('');
  if (selected) joinRoom();
});
socket.on('disconnect', () => {
  setLink('lost', 'Reconnecting');
  showStatus('Connection lost. Reconnecting…');
});

// =====================================================
//  Live TV
//  The channel list lives in channels.js. Each channel gets a pin on the globe.
//  Clicking a pin opens theater mode. "Back to globe" shrinks the player into a
//  floating monitor so you can keep exploring while it plays. Theater mode can
//  also go full screen. All of this is ONE box (<section id="tv">) that changes
//  shape, so the video never has to reload when you switch views.
// =====================================================
const liveTV = (() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    viewport: $('viewport'),
    button: $('tv-button'),
    root: $('tv'),
    frame: $('tv-frame'),
    back: $('tv-back'),
    title: $('tv-title'),
    youtube: $('tv-youtube'),
    expand: $('tv-expand'),
    exitFull: $('tv-exit-full'),
    stop: $('tv-stop'),
    unmute: $('tv-unmute'),
    full: $('tv-full'),
    prev: $('tv-prev'),
    next: $('tv-next'),
    num: $('tv-num'),
    name: $('tv-name'),
    from: $('tv-from'),
    upnext: $('tv-upnext'),
    guide: $('tv-guide'),
    keypad: $('tv-keypad'),
    blocked: $('tv-blocked'),
    blockedText: $('tv-blocked-text'),
    blockedLink: $('tv-blocked-link'),
  };

  let mode = 'off';       // 'off', 'theater' or 'float'
  let current = 0;        // which channel is playing (its position in CHANNELS)
  let pinsOn = true;      // are the pins showing on the globe?
  let muted = true;       // browsers only allow videos to start on their own when muted
  let openGroup = null;   // which shared pin (like "Europe") has its list open

  const count = CHANNELS.length;
  const numberOf = (i) => String(i + 1).padStart(2, '0');   // 0 -> "01"

  // ---------- Pins on the globe ----------
  // One pin per channel, except channels in the same group share one pin.
  // Europe has 5 channels close together, and 5 separate pins would pile on top of each other.
  const pins = [];
  CHANNELS.forEach((ch, i) => {
    let pin = ch.group && pins.find((p) => p.group === ch.group);
    if (!pin) {
      pin = { group: ch.group || null, members: [] };
      pins.push(pin);
    }
    pin.members.push(i);
  });
  for (const pin of pins) {
    // A shared pin sits in the middle of its channels (the average of their positions)
    pin.lat = pin.members.reduce((sum, i) => sum + CHANNELS[i].lat, 0) / pin.members.length;
    pin.lng = pin.members.reduce((sum, i) => sum + CHANNELS[i].lng, 0) / pin.members.length;
    pin.el = makePin(pin);
  }

  function makeButton(className, text, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;   // textContent, never innerHTML, same safety rule as the chat
    btn.addEventListener('click', onClick);
    return btn;
  }

  function makePin(pin) {
    const wrap = document.createElement('div');
    wrap.className = 'tv-pin-wrap';
    // Stop clicks on a pin from also reaching the globe underneath (which would select a country)
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
      wrap.addEventListener(type, (e) => e.stopPropagation());
    }

    if (!pin.group) {
      const ch = CHANNELS[pin.members[0]];
      const btn = makeButton('tv-pin', ch.short, () => watch(pin.members[0]));
      btn.setAttribute('aria-label', `Watch ${ch.name}, live from ${ch.place}`);
      wrap.append(btn);
      return wrap;
    }

    // Shared pin: the button opens a small list of its channels
    const btn = makeButton('tv-pin', `${pin.group} · ${pin.members.length}`, () => {
      openGroup = openGroup === pin.group ? null : pin.group;
      render();
    });
    btn.setAttribute('aria-expanded', 'false');
    const list = document.createElement('div');
    list.className = 'tv-cluster';
    list.hidden = true;
    for (const i of pin.members) {
      const item = makeButton('tv-cluster-item', CHANNELS[i].name, () => watch(i));
      item.dataset.index = i;
      list.append(item);
    }
    wrap.append(btn, list);
    return wrap;
  }

  // globe.gl draws these HTML elements on the globe and hides them when they're on the far side
  globe
    .htmlElementsData(pins)
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(0.01)
    .htmlElement((pin) => pin.el)
    .htmlTransitionDuration(0);

  function refreshPins() {
    // The pins stay on the globe; style.css hides them while .pins-off is set.
    // Hidden in theater mode (the globe is covered). Always shown with the floating monitor:
    // they're how you change channels there.
    const show = mode === 'float' || (mode === 'off' && pinsOn);
    el.viewport.classList.toggle('pins-off', !show);
  }

  // ---------- Channel keypad (theater mode) ----------
  const keys = CHANNELS.map((ch, i) => {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'tv-key';
    const top = document.createElement('span');
    top.className = 'tv-key-top';
    const num = document.createElement('span');
    num.className = 'tv-key-num';
    num.textContent = numberOf(i);
    const led = document.createElement('i');
    led.className = 'tv-led';
    led.setAttribute('aria-hidden', 'true');
    top.append(num, led);
    const name = document.createElement('span');
    name.className = 'tv-key-name';
    name.textContent = ch.short;
    key.append(top, name);
    key.addEventListener('click', () => tune(i));
    el.keypad.append(key);
    return key;
  });

  // ---------- The chat follows what you watch ----------
  // Watching NHK World opens the Japan chat, and so on. Euronews has no single
  // home country, so it leaves whatever chat is open alone.
  const offMap = new Map();   // countries too small for the map (Singapore) get a stand-in
  function followChat(ch) {
    if (!ch.country) return;
    let feature = (globe.polygonsData() || []).find((f) => codeOf(f) === ch.country);
    if (!feature) {
      if (!offMap.has(ch.country)) offMap.set(ch.country, { properties: { ADM0_A3: ch.country, ADMIN: ch.place } });
      feature = offMap.get(ch.country);
    }
    selectCountry(feature, { lat: ch.lat, lng: ch.lng });
  }

  // ---------- Playing a channel ----------
  // First ask our own server which video the channel has live right now (server.js looks
  // at youtube.com/channel/<id>/live), then play that exact video. Playing by video ID is
  // what makes BBC News, Sky News and WION work: YouTube's channel-wide "live_stream" link
  // sometimes picks a video those channels don't allow on other sites. If the lookup fails,
  // we still fall back to that channel-wide link.
  let loadCount = 0;   // lets a slow lookup notice that you've already changed channel or stopped

  async function load() {
    const ch = CHANNELS[current];
    const ticket = ++loadCount;
    showBlocked(false);

    let videoId = null;
    try {
      const res = await fetch(`/api/live/${ch.youtube}`);
      videoId = (await res.json()).videoId;
    } catch {
      // server unreachable: use the fallback below
    }
    if (ticket !== loadCount || mode === 'off') return;   // you moved on while we were waiting

    const params = new URLSearchParams({
      autoplay: '1',
      mute: muted ? '1' : '0',
      playsinline: '1',     // phones play it in the page instead of jumping to full screen
      enablejsapi: '1',     // lets us talk to the player (unmute, and hear about errors)
      rel: '0',
      origin: location.origin,
    });
    if (!videoId) params.set('channel', ch.youtube);
    el.frame.src = `https://www.youtube.com/embed/${videoId || 'live_stream'}?${params}`;
  }

  // If a channel still won't play here, show a clear message and a YouTube link
  // instead of YouTube's grey error screen.
  function showBlocked(on) {
    const ch = CHANNELS[current];
    el.blocked.hidden = !on;
    el.blockedText.textContent = `${ch.name} can't play here right now. The channel may not allow its stream on other websites.`;
    el.blockedLink.href = `https://www.youtube.com/${ch.handle}/live`;
    el.unmute.hidden = on || !muted;
  }

  // The YouTube player only reports events (like errors) after we say we're listening.
  // It can take a moment to get ready, so we say it a few times after each load.
  el.frame.addEventListener('load', () => {
    const hello = () => el.frame.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'tv' }), 'https://www.youtube.com');
    hello();
    setTimeout(hello, 1000);
    setTimeout(hello, 3000);
  });
  window.addEventListener('message', (e) => {
    if (e.source !== el.frame.contentWindow || e.origin !== 'https://www.youtube.com') return;
    let data;
    try { data = JSON.parse(e.data); } catch { return; }
    // Error codes: 101 and 150 = the owner doesn't allow other websites, 100 = video gone, 2/5 = player error
    if (data.event === 'onError') showBlocked(true);
  });

  function setChannel(i) {
    current = (i + count) % count;   // wraps around: next after the last channel is the first
    load();
    followChat(CHANNELS[current]);
  }

  // Clicking a pin: theater mode, unless the floating monitor is open, then it just switches channel there
  function watch(i) {
    openGroup = null;
    setChannel(i);
    if (mode === 'float') render();
    else setMode('theater');
  }

  // Keypad and ◀ ▶: change channel, stay where you are
  function tune(i) {
    setChannel(i);
    render();
  }

  function setMode(next) {
    if (next !== 'theater' && document.fullscreenElement === el.root) {
      document.exitFullscreen().catch(() => {});
    }
    mode = next;
    if (mode === 'off') {
      loadCount++;                    // cancel a lookup that's still in progress
      el.frame.src = 'about:blank';   // unloading the player is what actually stops the sound
      setGuide(false);
      showBlocked(false);
    }
    refreshPins();
    render();
  }

  function setGuide(open) {
    el.root.classList.toggle('guide-open', open);
    el.guide.setAttribute('aria-expanded', String(open));
  }

  // ---------- Update everything on screen to match the state above ----------
  function render() {
    const ch = CHANNELS[current];
    el.root.hidden = mode === 'off';
    el.root.dataset.mode = mode;   // style.css lays the box out differently for each mode
    el.viewport.classList.toggle('tv-floating', mode === 'float');
    el.button.setAttribute('aria-pressed', String(mode !== 'off' || pinsOn));

    el.title.textContent = ch.name;
    el.num.textContent = numberOf(current);
    el.name.textContent = ch.name;
    el.from.textContent = `Live from ${ch.place}`;
    el.upnext.textContent = `Up next: ${CHANNELS[(current + 1) % count].name}`;
    el.youtube.href = `https://www.youtube.com/${ch.handle}/live`;
    el.unmute.hidden = !muted || !el.blocked.hidden;

    keys.forEach((key, i) => {
      key.classList.toggle('on', i === current);
      key.setAttribute('aria-pressed', String(i === current));
    });

    for (const pin of pins) {
      const btn = pin.el.firstChild;
      // In the floating monitor, the pin of what's playing glows gold
      btn.classList.toggle('on', mode === 'float' && pin.members.includes(current));
      if (!pin.group) continue;
      btn.setAttribute('aria-expanded', String(openGroup === pin.group));
      pin.el.querySelector('.tv-cluster').hidden = openGroup !== pin.group;
      for (const item of pin.el.querySelectorAll('.tv-cluster-item')) {
        item.classList.toggle('on', mode !== 'off' && Number(item.dataset.index) === current);
      }
    }
  }

  // ---------- Buttons ----------
  el.button.addEventListener('click', () => {
    if (mode !== 'off') return setMode('off');   // while watching, the top bar button stops the TV
    pinsOn = !pinsOn;                              // otherwise it shows or hides the pins
    openGroup = null;
    refreshPins();
    render();
  });
  el.back.addEventListener('click', () => setMode('float'));
  el.expand.addEventListener('click', () => setMode('theater'));
  el.stop.addEventListener('click', () => setMode('off'));
  el.prev.addEventListener('click', () => tune(current - 1));
  el.next.addEventListener('click', () => tune(current + 1));
  el.guide.addEventListener('click', () => setGuide(!el.root.classList.contains('guide-open')));

  // Browsers block sound until you click something, so the video starts muted.
  // This sends "unmute" to the YouTube player inside the frame.
  el.unmute.addEventListener('click', () => {
    muted = false;
    for (const func of ['unMute', 'playVideo']) {
      el.frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com');
    }
    render();
  });

  // Full screen uses the browser's built-in full screen (the same thing YouTube's button does).
  // Esc to leave it is handled by the browser itself.
  el.full.addEventListener('click', () => {
    const request = el.root.requestFullscreen?.();   // older browsers don't have it: then nothing happens
    if (request) request.catch(() => {});
  });
  el.exitFull.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const full = document.fullscreenElement === el.root;
    el.root.classList.toggle('is-full', full);
    if (!full) setGuide(false);
  });

  refreshPins();
  render();

  return {
    // Called by the Escape key handler above. Returns true if it used the key.
    handleEscape() {
      if (mode !== 'theater') return false;
      setMode('float');
      return true;
    },
  };
})();
