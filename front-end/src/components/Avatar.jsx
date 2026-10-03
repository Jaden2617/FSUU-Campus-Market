import { imageUrl } from "../api";

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
