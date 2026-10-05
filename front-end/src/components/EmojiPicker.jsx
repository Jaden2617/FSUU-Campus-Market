import { useEffect, useRef, useState } from "react";

// Emoji groups shown as tabs (like Messenger)
const GROUPS = [
  {
    icon: "😀",
    name: "Smileys",
    list: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾",
  },
  {
    icon: "👍",
    name: "People",
    list: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🙏 🤝 👏 🙌 👐 🤲 💪 🫶 ✍️ 💅 🤳 👀 👁️ 👅 👄 🧠 🫡 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧑‍🎓 🧑‍🏫 🧑‍💻 🧑‍🍳 🧑‍🔧 👮 🕺 💃 🏃 🚶 👫 👬 👭 👪",
  },
  {
    icon: "❤️",
    name: "Hearts",
    list: "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥 💋 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊 🎈 🎁 🏆 🥇 🥈 🥉",
  },
  {
    icon: "🍔",
    name: "Food",
    list: "🍔 🍟 🍕 🌭 🥪 🌮 🌯 🍗 🍖 🥓 🍳 🥚 🍚 🍛 🍜 🍝 🍲 🍣 🍱 🥟 🍤 🍙 🍘 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥐 🍞 🥖 🧇 🥞 🧈 🍎 🍌 🍍 🥭 🍉 🍇 🍓 🍒 🥥 🥑 🍅 🌽 🥕 🧋 🥤 🧃 ☕ 🍵 🥛 🍺 🧊",
  },
  {
    icon: "📚",
    name: "Things",
    list: "📚 📖 📝 ✏️ 🖊️ 🖍️ 📏 📐 📎 ✂️ 🎒 🧮 💻 🖥️ ⌨️ 🖱️ 📱 📲 ☎️ 🎧 🎮 📷 📸 🔋 🔌 💡 🔦 🕯️ 👕 👖 👗 👟 👠 👜 🎓 🧢 👓 ⌚ 💍 🛍️ 🧸 🎸 ⚽ 🏀 🏐 🏸 🚲 🛵 🚗 🚌 🏫 🏠 ⛪ 🏪 💸 💰 💵 🪙 💳 🧾 📦 🏷️ 🔑 🔒 ⏰ 📅 📍 🗺️",
  },
  {
    icon: "✅",
    name: "Symbols",
    list: "✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ❓ ❗ ‼️ ⁉️ ⚠️ 🚫 ⛔ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🆗 🆕 🆓 🔝 🔜 💲 ♻️ 🔁 🔄 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ 🔺 🔻 💬 💭 🗯️ 🔔 🔕 📣 📢 ⏳ ⌛ 🌞 🌙 ☁️ 🌧️ ⛈️ 🌈 ☔ 🌸 🌺 🌻 🌹 🌷 🌴 🍀",
  },
].map((g) => ({ ...g, list: g.list.split(" ") }));

const RECENT_KEY = "recentEmojis";

function loadRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(saved) ? saved.slice(0, 24) : [];
  } catch {
    return [];
  }
}

function saveRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode: just don't remember */
  }
}

// Puts an emoji where the cursor is in an input (or at the end).
// Returns the new text.
export function insertEmoji(inputRef, text, emoji) {
  const el = inputRef?.current;
  if (!el || el.selectionStart == null || document.activeElement !== el) return text + emoji;
  const start = el.selectionStart;
  const end = el.selectionEnd ?? start;
  const next = text.slice(0, start) + emoji + text.slice(end);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + emoji.length, start + emoji.length);
  });
  return next;
}

// True when a message is only 1–3 emojis (shown big, like Messenger)
export function isOnlyEmoji(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || !/^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(trimmed)) return false;
  if (/^[\d#*\s]+$/.test(trimmed)) return false; // plain numbers aren't emojis
  const count =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? [...new Intl.Segmenter().segment(trimmed.replace(/\s/g, ""))].length
      : [...trimmed.replace(/\s/g, "")].length;
  return count <= 3;
}

// The smiley button + emoji panel.
// side: which edge the panel lines up with ("left" or "right")
export default function EmojiPicker({ onPick, side = "left", size = 22, className = "" }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const [tab, setTab] = useState(() => (loadRecent().length ? "recent" : 0));
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    function closeIfOutside(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    function closeOnEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEsc);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEsc);
    };
  }, [open]);

  function pick(emoji) {
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 24);
    setRecent(next);
    saveRecent(next);
    onPick(emoji);
  }

  const showing = tab === "recent" ? recent : GROUPS[tab].list;
  const title = tab === "recent" ? "Recently used" : GROUPS[tab].name;

  return (
    <span className={`emoji-wrap ${className}`} ref={wrap}>
      <button
        type="button"
        className={`icon-btn emoji-toggle ${open ? "active" : ""}`}
        onMouseDown={(e) => e.preventDefault()} // keeps the cursor in the text box
        onClick={() => setOpen(!open)}
        title="Choose an emoji"
        aria-label="Choose an emoji"
        aria-expanded={open}
      >
        <SmileIcon size={size} />
      </button>

      {open && (
        <div className={`emoji-panel side-${side}`} role="dialog" aria-label="Emojis">
          <div className="emoji-title">{title}</div>
          <div className="emoji-grid">
            {showing.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-cell"
                data-sound="pop"
                onMouseDown={(e) => e.preventDefault()} // keeps the cursor in the text box
                onClick={() => pick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="emoji-tabs">
            {recent.length > 0 && (
              <button
                type="button"
                className={tab === "recent" ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTab("recent")}
                title="Recently used"
              >
                🕘
              </button>
            )}
            {GROUPS.map((g, i) => (
              <button
                key={g.name}
                type="button"
                className={tab === i ? "active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTab(i)}
                title={g.name}
              >
                {g.icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

function SmileIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}
