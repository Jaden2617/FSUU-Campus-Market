import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { navigate } from "../router";
import Avatar from "./Avatar";
import Icon from "./Icon";
import Modal from "./Modal";
import NotificationsPanel from "./NotificationsPanel";

function Badge({ count }) {
  if (!count) return null;
  return <span className="badge">{count > 9 ? "9+" : count}</span>;
}

// Closes a dropdown when you click anywhere else
function useOutsideClose(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, setOpen]);
  return ref;
}

export default function TopBar({ page }) {
  const { user, badges, search, setSearch } = useApp();
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useOutsideClose(bellOpen, setBellOpen);
  const menuRef = useOutsideClose(menuOpen, setMenuOpen);

  return (
    <nav className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#/" onClick={() => setSearch("")}>
          <span className="brand-mark">UM</span>
          <span className="brand-text">Urios Market</span>
        </a>

        <label className="search">
          <Icon name="search" size={18} />
          <input
            placeholder="Search the market"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (page !== "feed" && page !== "saved") navigate("/");
            }}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch("")} title="Clear">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>

        <div className="nav-tabs">
          <a className={`nav-tab ${page === "feed" ? "active" : ""}`} href="#/" title="News Feed">
            <Icon name="home" size={22} />
            <span className="nav-label">Feed</span>
          </a>
          <a className={`nav-tab ${page === "friends" ? "active" : ""}`} href="#/friends" title="Friends">
            <Icon name="users" size={22} />
            <span className="nav-label">Friends</span>
            <Badge count={badges.friend_requests} />
          </a>
          <a className={`nav-tab ${page === "messages" ? "active" : ""}`} href="#/messages" title="Messages">
            <Icon name="chat" size={22} />
            <span className="nav-label">Messages</span>
            <Badge count={badges.messages} />
          </a>
        </div>

        <div className="nav-right">
          <div className="dropdown-wrap desktop-only" ref={bellRef}>
            <button
              className={`round-btn ${bellOpen ? "active" : ""}`}
              onClick={() => setBellOpen(!bellOpen)}
              title="Notifications"
            >
              <Icon name="bell" size={21} />
              <Badge count={badges.notifications} />
            </button>
            {bellOpen && (
              <div className="dropdown notif-dropdown">
                <NotificationsPanel onNavigate={() => setBellOpen(false)} />
              </div>
            )}
          </div>

          <div className="dropdown-wrap" ref={menuRef}>
            <button className="nav-profile" onClick={() => setMenuOpen(!menuOpen)} title="Menu">
              <Avatar user={user} size={34} />
              <span className="nav-name">{user.name.split(" ")[0]}</span>
            </button>
            {menuOpen && (
              <div className="dropdown menu-dropdown">
                <UserMenu close={() => setMenuOpen(false)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function UserMenu({ close }) {
  const { user, theme, setTheme, sounds, setSounds, install, logout, openProfileEdit, openVerify } = useApp();
  const [showIosHelp, setShowIosHelp] = useState(false);

  function go(path) {
    navigate(path);
    close();
  }

  return (
    <div className="menu">
      <button className="menu-profile" onClick={() => go(`/profile/${user.id}`)}>
        <Avatar user={user} size={44} />
        <div>
          <strong>{user.name}</strong>
          <span className="muted small">See your profile</span>
        </div>
      </button>
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => { openProfileEdit(); close(); }}>
        <Icon name="edit" size={19} /> Edit profile
      </button>
      <button className="menu-item" onClick={() => go("/saved")}>
        <Icon name="bookmark" size={19} /> Saved posts
      </button>
      {!user.verified && (
        <button className="menu-item" onClick={() => { openVerify(); close(); }}>
          <Icon name="shield" size={19} /> Get the Verified Seller badge
        </button>
      )}
      {user.is_admin && (
        <button className="menu-item" onClick={() => go("/admin")}>
          <Icon name="chart" size={19} /> Admin dashboard
        </button>
      )}
      <button className="menu-item" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <button className="menu-item" data-sound="none" onClick={() => setSounds(!sounds)}>
        <Icon name={sounds ? "volume" : "volumeOff"} size={19} />
        Sound effects
        <span className={`switch ${sounds ? "on" : ""}`} aria-hidden="true" />
      </button>
      {!install.installed && (install.canPrompt || install.ios) && (
        <button
          className="menu-item"
          onClick={async () => {
            if (install.canPrompt) {
              await install.install();
              close();
            } else {
              setShowIosHelp(true);
            }
          }}
        >
          <Icon name="download" size={19} /> Install the app
        </button>
      )}
      <div className="menu-sep" />
      <button className="menu-item" onClick={logout}>
        <Icon name="logout" size={19} /> Log out
      </button>

      {showIosHelp && (
        <Modal title="Install on iPhone" onClose={() => { setShowIosHelp(false); close(); }}>
          <ol className="steps-list">
            <li>Open this site in <strong>Safari</strong>.</li>
            <li>Tap the <strong>Share</strong> button (the square with an arrow).</li>
            <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
          <p className="muted small">Urios Market will open from your home screen like a normal app.</p>
        </Modal>
      )}
    </div>
  );
}
