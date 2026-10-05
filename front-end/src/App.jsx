import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, CATEGORIES, REACTIONS } from "./api";
import { AppContext } from "./context";
import { useRoute, navigate } from "./router";
import { registerServiceWorker, useInstallPrompt } from "./pwa";
import { playSound, setSoundsOn, soundsOn, startClickSounds } from "./sounds";
import AuthPage from "./components/AuthPage";
import Feed from "./components/Feed";
import PostPage from "./components/PostPage";
import ProfilePage from "./components/ProfilePage";
import FriendsPage from "./components/FriendsPage";
import Messages from "./components/Messages";
import NotificationsPanel from "./components/NotificationsPanel";
import AdminPage from "./components/AdminPage";
import PostEditor from "./components/PostEditor";
import ProfileModal from "./components/ProfileModal";
import { PaymentModal } from "./components/Dialogs";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import ServerWake from "./components/ServerWake";
import Icon from "./components/Icon";

const DEFAULT_CONFIG = {
  categories: CATEGORIES,
  reactions: REACTIONS,
  meetup_spots: [],
  report_reasons: [],
  boost_plans: [],
  max_photos: 4,
};

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function startingTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => readJSON("user"));
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [badges, setBadges] = useState({ messages: 0, notifications: 0, friend_requests: 0 });
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null); // { type } to create, { post } to edit
  const [showProfileEdit, setShowProfileEdit] = useState(false); // true, or "welcome" for new Google users
  const [showVerify, setShowVerify] = useState(false);
  const [pendingChat, setPendingChat] = useState(null);
  const [postEvent, setPostEvent] = useState(null); // tells pages a post was created/edited
  const [toastText, setToastText] = useState("");
  const [theme, setThemeState] = useState(startingTheme);
  const [sounds, setSoundsState] = useState(soundsOn);
  const toastTimer = useRef(null);
  const install = useInstallPrompt();
  const { parts } = useRoute();

  // ---- Theme (light / dark) ----
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b1220" : "#1e3a8a");
  }, [theme]);

  const setTheme = useCallback((value) => {
    localStorage.setItem("theme", value);
    setThemeState(value);
  }, []);

  // ---- Sound effects ----
  useEffect(() => startClickSounds(), []);

  const setSounds = useCallback((on) => {
    setSoundsOn(on);
    setSoundsState(on);
    if (on) playSound("pop");
  }, []);

  // ---- Phone app (PWA) ----
  useEffect(() => {
    registerServiceWorker();
  }, []);

  // ---- Settings from the backend ----
  useEffect(() => {
    api("/config").then((c) => setConfig({ ...DEFAULT_CONFIG, ...c })).catch(() => {});
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    navigate("/");
  }, []);

  // Every page uses this to talk to the backend.
  // If the login expired, it logs you out automatically.
  const call = useCallback(
    (path, options = {}) =>
      api(path, { ...options, token }).catch((err) => {
        if (err.status === 401) logout();
        throw err;
      }),
    [token, logout]
  );

  const updateUser = useCallback((updated) => {
    localStorage.setItem("user", JSON.stringify(updated));
    setUser(updated);
  }, []);

  function handleLogin(data) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    // New Google accounts don't have a contact yet: ask for it right away
    if (!data.user.contact) setShowProfileEdit("welcome");
  }

  // Keep your own info fresh (e.g. after an admin approves your badge)
  useEffect(() => {
    if (token) call("/me").then(updateUser).catch(() => {});
  }, [token, call, updateUser]);

  // ---- Red badge numbers (checked every 10 seconds while the tab is open) ----
  const lastBadges = useRef(null);
  const refreshBadges = useCallback(() => {
    if (!token || document.visibilityState === "hidden") return;
    call("/badges")
      .then((next) => {
        // Chime when something new arrives (not on the first check after opening the app)
        const before = lastBadges.current;
        if (before) {
          const onChats = window.location.hash.startsWith("#/messages");
          const more =
            next.notifications > before.notifications ||
            next.friend_requests > before.friend_requests ||
            (!onChats && next.messages > before.messages); // the open chat plays its own sound
          if (more) playSound("notify");
        }
        lastBadges.current = next;
        setBadges(next);
      })
      .catch(() => {});
  }, [token, call]);

  useEffect(() => {
    lastBadges.current = null; // new login: don't chime for old notifications
  }, [token]);

  useEffect(() => {
    refreshBadges();
    const timer = setInterval(refreshBadges, 10000);
    document.addEventListener("visibilitychange", refreshBadges);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshBadges);
    };
  }, [refreshBadges]);

  const toast = useCallback((text) => {
    setToastText(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(""), 2800);
  }, []);

  const openChat = useCallback((otherUser, post) => {
    setPendingChat({ user: otherUser, post });
    navigate(`/messages/${otherUser.id}`);
  }, []);

  const ctx = useMemo(
    () => ({
      user,
      updateUser,
      call,
      config,
      badges,
      refreshBadges,
      toast,
      openChat,
      openCreate: (type = "selling") => setEditor({ type }),
      openEdit: (post) => setEditor({ post }),
      openProfileEdit: () => setShowProfileEdit(true),
      openVerify: () => setShowVerify(true),
      postEvent,
      theme,
      setTheme,
      sounds,
      setSounds,
      install,
      logout,
      search,
      setSearch,
    }),
    [user, updateUser, call, config, badges, refreshBadges, toast, openChat, postEvent, theme, setTheme, sounds, setSounds, install, logout, search]
  );

  if (!token || !user) {
    return (
      <>
        <ServerWake />
        <AuthPage onLogin={handleLogin} config={config} />
      </>
    );
  }

  // ---- Pick the page from the address (#/profile/5, #/messages, ...) ----
  const [page, id] = parts;
  let content;
  let showFab = false;
  if (page === "post" && id) {
    content = <PostPage key={id} postId={Number(id)} />;
  } else if (page === "profile" && id) {
    content = <ProfilePage key={id} userId={Number(id)} />;
    showFab = Number(id) === user.id;
  } else if (page === "friends") {
    content = <FriendsPage />;
  } else if (page === "messages") {
    content = (
      <Messages
        activeId={id ? Number(id) : null}
        pendingChat={pendingChat}
        onPendingUsed={() => setPendingChat(null)}
      />
    );
  } else if (page === "notifications") {
    content = (
      <div className="page-narrow">
        <NotificationsPanel full />
      </div>
    );
  } else if (page === "admin" && user.is_admin) {
    content = <AdminPage />;
  } else if (page === "saved") {
    content = <Feed key="saved" mode="saved" />;
    showFab = true;
  } else {
    content = <Feed key="feed" mode="all" />;
    showFab = true;
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <ServerWake />
        <TopBar page={page || "feed"} />

        <main className={`main ${page === "messages" ? "main-messages" : ""}`}>{content}</main>

        {showFab && (
          <button className="fab" onClick={() => setEditor({ type: "selling" })} title="Create a post">
            <Icon name="plus" size={28} />
          </button>
        )}

        <BottomNav page={page || "feed"} />

        {editor && (
          <PostEditor
            post={editor.post}
            defaultType={editor.type}
            onClose={() => setEditor(null)}
            onSaved={(post, isNew) => {
              setEditor(null);
              setPostEvent({ post, isNew, at: Date.now() });
              toast(isNew ? "Posted!" : "Post updated");
            }}
          />
        )}

        {showProfileEdit && <ProfileModal welcome={showProfileEdit === "welcome"} onClose={() => setShowProfileEdit(false)} />}
        {showVerify && <PaymentModal kind="verified" onClose={() => setShowVerify(false)} />}

        {toastText && (
          <div className="toast" role="status">
            {toastText}
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}

export default App;
