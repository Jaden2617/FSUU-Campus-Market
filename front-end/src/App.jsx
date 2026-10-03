import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import AuthPage from "./components/AuthPage";
import Feed from "./components/Feed";
import Messages from "./components/Messages";
import CreatePostModal from "./components/CreatePostModal";
import ProfileModal from "./components/ProfileModal";
import Avatar from "./components/Avatar";
import Icon from "./components/Icon";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [page, setPage] = useState("feed"); // "feed" or "messages"
  const [search, setSearch] = useState("");
  const [createType, setCreateType] = useState(null); // null = modal closed
  const [newPost, setNewPost] = useState(null);
  const [chatWith, setChatWith] = useState(null); // { user, post } when "Message" is clicked
  const [unread, setUnread] = useState(0);
  const [showProfile, setShowProfile] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setPage("feed");
  }, []);

  // Every component uses this to talk to the backend.
  // If the login expired, it logs you out automatically.
  const call = useCallback(
    (path, options = {}) =>
      api(path, { ...options, token }).catch((err) => {
        if (err.status === 401) logout();
        throw err;
      }),
    [token, logout]
  );

  function handleLogin(data) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  // Check for new messages every 5 seconds (for the red badge)
  const refreshUnread = useCallback(() => {
    if (!token) return;
    call("/unread-count").then((d) => setUnread(d.count)).catch(() => {});
  }, [token, call]);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(refreshUnread, 5000);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  // Save new profile info (name, contact, picture) everywhere
  function updateUser(updated) {
    localStorage.setItem("user", JSON.stringify(updated));
    setUser(updated);
  }

  function openChat(otherUser, post) {
    setChatWith({ user: otherUser, post });
    setPage("messages");
  }

  if (!token || !user) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <nav className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => setPage("feed")}>
            <span className="brand-mark">CM</span>
            <span className="brand-text">FSUU Campus Market</span>
          </button>

          <label className="search">
            <Icon name="search" size={18} />
            <input
              placeholder="Search the market"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage("feed");
              }}
            />
          </label>

          <div className="nav-tabs">
            <button
              className={`nav-tab ${page === "feed" ? "active" : ""}`}
              onClick={() => setPage("feed")}
              title="News Feed"
            >
              <Icon name="home" size={22} />
              <span className="nav-label">Feed</span>
            </button>
            <button
              className={`nav-tab ${page === "messages" ? "active" : ""}`}
              onClick={() => setPage("messages")}
              title="Messages"
            >
              <Icon name="chat" size={22} />
              <span className="nav-label">Messages</span>
              {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
          </div>

          <div className="nav-user">
            <button className="nav-profile" onClick={() => setShowProfile(true)} title="Your profile">
              <Avatar user={user} size={34} />
              <span className="nav-name">{user.name.split(" ")[0]}</span>
            </button>
            <button className="icon-btn" onClick={logout} title="Log out">
              <Icon name="logout" size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="main">
        {page === "feed" ? (
          <Feed
            call={call}
            user={user}
            search={search}
            newPost={newPost}
            onCreate={(type) => setCreateType(type)}
            onOpenProfile={() => setShowProfile(true)}
            onMessage={openChat}
          />
        ) : (
          <Messages
            call={call}
            user={user}
            chatWith={chatWith}
            onChatOpened={() => setChatWith(null)}
            onRead={refreshUnread}
          />
        )}
      </main>

      {page === "feed" && (
        <button className="fab" onClick={() => setCreateType("selling")} title="Create a post">
          <Icon name="plus" size={28} />
        </button>
      )}

      {showProfile && (
        <ProfileModal call={call} user={user} onClose={() => setShowProfile(false)} onUpdated={updateUser} />
      )}

      {createType && (
        <CreatePostModal
          call={call}
          user={user}
          defaultType={createType}
          onClose={() => setCreateType(null)}
          onCreated={(post) => {
            setNewPost(post);
            setCreateType(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
