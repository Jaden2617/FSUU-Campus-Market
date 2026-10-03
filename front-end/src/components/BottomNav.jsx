import { useApp } from "../context";
import Icon from "./Icon";

// The tab bar at the bottom of the screen on phones
export default function BottomNav({ page }) {
  const { badges, openCreate } = useApp();
  const tab = (name, href, icon, label, count) => (
    <a className={`bottom-tab ${page === name ? "active" : ""}`} href={href}>
      <span className="bottom-icon">
        <Icon name={icon} size={23} />
        {count > 0 && <span className="badge">{count > 9 ? "9+" : count}</span>}
      </span>
      <span>{label}</span>
    </a>
  );

  return (
    <nav className="bottom-nav">
      {tab("feed", "#/", "home", "Feed", 0)}
      {tab("friends", "#/friends", "users", "Friends", badges.friend_requests)}
      <button className="bottom-create" onClick={() => openCreate("selling")} title="Create a post">
        <Icon name="plus" size={26} />
      </button>
      {tab("messages", "#/messages", "chat", "Chats", badges.messages)}
      {tab("notifications", "#/notifications", "bell", "Alerts", badges.notifications)}
    </nav>
  );
}
