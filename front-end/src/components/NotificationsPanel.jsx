import { useEffect, useState } from "react";
import { useApp } from "../context";
import { navigate } from "../router";
import { timeAgo } from "../api";
import Avatar from "./Avatar";
import Icon from "./Icon";

const TYPE_ICONS = {
  comment: "comment",
  reaction: "star",
  friend_request: "userPlus",
  friend_accept: "userCheck",
  sold_to_you: "tag",
  rating: "star",
  payment: "bolt",
  admin: "shield",
};

export default function NotificationsPanel({ full = false, onNavigate }) {
  const { call, user, refreshBadges } = useApp();
  const [items, setItems] = useState(null);

  useEffect(() => {
    call("/notifications").then(setItems).catch(() => setItems([]));
  }, [call]);

  async function open(n) {
    if (!n.is_read) {
      call(`/notifications/${n.id}/read`, { method: "POST" }).then(refreshBadges).catch(() => {});
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    if (n.type === "friend_request") navigate("/friends");
    else if (n.post_id) navigate(`/post/${n.post_id}`);
    else if (n.actor) navigate(`/profile/${n.actor.id}`);
    else navigate(`/profile/${user.id}`);
    onNavigate?.();
  }

  async function readAll() {
    await call("/notifications/read-all", { method: "POST" }).catch(() => {});
    setItems((list) => list.map((x) => ({ ...x, is_read: true })));
    refreshBadges();
  }

  const unread = items?.filter((n) => !n.is_read).length || 0;

  return (
    <div className={`notif-panel ${full ? "card full" : ""}`}>
      <header className="notif-head">
        <h2>Notifications</h2>
        {unread > 0 && (
          <button className="link-btn small" onClick={readAll}>
            Mark all as read
          </button>
        )}
      </header>

      {items === null && <p className="muted notif-empty">Loading...</p>}
      {items?.length === 0 && (
        <div className="notif-empty">
          <Icon name="bell" size={36} />
          <p className="muted">No notifications yet. When people react, comment, or add you, it shows here.</p>
        </div>
      )}

      <div className="notif-list">
        {items?.map((n) => (
          <button key={n.id} className={`notif ${n.is_read ? "" : "unread"}`} onClick={() => open(n)}>
            <span className="notif-avatar">
              {n.actor ? <Avatar user={n.actor} size={46} /> : <span className="notif-system"><Icon name="shield" size={22} /></span>}
              <span className={`notif-type t-${n.type}`}>
                <Icon name={TYPE_ICONS[n.type] || "bell"} size={12} />
              </span>
            </span>
            <span className="notif-text">
              <span>{n.text}</span>
              <span className="notif-time">{timeAgo(n.created_at)}</span>
            </span>
            {!n.is_read && <span className="unread-dot" />}
          </button>
        ))}
      </div>
    </div>
  );
}
