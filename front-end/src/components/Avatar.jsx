import { imageUrl } from "../api";
import Icon from "./Icon";

// Shows the profile picture, or the person's initials if they don't have one
const shades = ["#1d4ed8", "#0369a1", "#4338ca", "#0e7490", "#1e40af", "#2563eb", "#0284c7"];

export default function Avatar({ user, size = 40 }) {
  const style = { width: size, height: size, fontSize: size * 0.38 };

  if (user?.avatar_url) {
    return <img className="avatar" src={imageUrl(user.avatar_url)} alt={user.name} style={style} />;
  }

  const initials = (user?.name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <div className="avatar" style={{ ...style, background: shades[(user?.id || 0) % shades.length] }}>
      {initials}
    </div>
  );
}

// Blue check for paid Verified Sellers
export function VerifiedBadge({ size = 16 }) {
  return (
    <span className="verified-badge" title="Verified Seller" style={{ width: size, height: size }}>
      <Icon name="check" size={size * 0.7} />
    </span>
  );
}

// A person's name that opens their profile, with the badge if verified
export function UserName({ user, onOpen }) {
  if (!user) return null;
  return (
    <a className="user-name" href={`#/profile/${user.id}`} onClick={onOpen}>
      {user.name}
      {user.verified && <VerifiedBadge />}
    </a>
  );
}
