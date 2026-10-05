// Little sound effects, made in the browser (no audio files to download).
//
//   playSound("tap")      any button
//   playSound("pop")      reacting to a post, comment, or picking an emoji
//   playSound("send")     sending a message or comment
//   playSound("receive")  a new message arrives while the chat is open
//   playSound("notify")   a new notification / message / friend request
//
// Buttons can choose their sound with data-sound="pop" (or "none" for silence).
// Everything else that's clickable plays "tap" automatically (see startClickSounds).

const KEY = "sounds";
let ctx = null;

export function soundsOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsOn(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Phones keep audio paused until the first tap
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// One soft note. freq can glide from [start, end].
function tone(ac, { freq, type = "sine", start = 0, length = 0.12, volume = 0.08 }) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  const [from, to] = Array.isArray(freq) ? freq : [freq, freq];
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  // quick fade in and out so it doesn't click
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const SOUNDS = {
  tap: (ac) => tone(ac, { freq: [1100, 700], length: 0.045, volume: 0.035 }),
  pop: (ac) => {
    tone(ac, { freq: [380, 900], length: 0.09, volume: 0.09 });
    tone(ac, { freq: [900, 1250], start: 0.06, length: 0.07, volume: 0.04 });
  },
  send: (ac) => tone(ac, { freq: [520, 1300], type: "triangle", length: 0.13, volume: 0.06 }),
  receive: (ac) => {
    tone(ac, { freq: 880, length: 0.16, volume: 0.06 });
    tone(ac, { freq: 1320, start: 0.09, length: 0.22, volume: 0.05 });
  },
  notify: (ac) => {
    tone(ac, { freq: 660, length: 0.18, volume: 0.06 });
    tone(ac, { freq: 990, start: 0.12, length: 0.28, volume: 0.05 });
  },
};

let lastPlayed = 0;

export function playSound(name) {
  if (!soundsOn() || !SOUNDS[name]) return;
  // Two sounds at the same moment (e.g. tap + pop) just sound messy
  const now = performance.now();
  if (now - lastPlayed < 40) return;
  lastPlayed = now;
  try {
    const ac = audio();
    if (ac) SOUNDS[name](ac);
  } catch {
    /* sound is only a bonus */
  }
}

// One listener for the whole app: every button click makes a sound.
export function startClickSounds() {
  function onClick(e) {
    const target = e.target.closest?.("[data-sound], button, a[href], [role='button'], [role='tab']");
    if (!target || target.disabled) return;
    const name = target.dataset.sound || "tap";
    if (name !== "none") playSound(name);
  }
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
