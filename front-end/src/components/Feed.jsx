import { useEffect, useState } from "react";
import { CATEGORIES } from "../api";
import PostCard from "./PostCard";
import Avatar from "./Avatar";
import Icon from "./Icon";

const TYPES = [
  { value: "all", label: "All posts", icon: "grid" },
  { value: "selling", label: "For sale", icon: "tag" },
  { value: "looking", label: "Looking for", icon: "look" },
];

export default function Feed({ call, user, search, newPost, onCreate, onMessage, onOpenProfile }) {
  const [posts, setPosts] = useState([]);
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Load the feed whenever a filter or the search box changes
  useEffect(() => {
    const params = new URLSearchParams({ type, category, q: search });
    const timer = setTimeout(() => {
      setLoading(true);
      call(`/posts?${params}`)
        .then((data) => {
          setPosts(data);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250); // small wait so we don't search on every key press
    return () => clearTimeout(timer);
  }, [call, type, category, search]);

  // Put a brand-new post at the top of the feed
  useEffect(() => {
    if (newPost) {
      setPosts((current) => [newPost, ...current.filter((p) => p.id !== newPost.id)]);
    }
  }, [newPost]);

  function updatePost(updated) {
    setPosts((current) => current.map((p) => (p.id === updated.id ? updated : p)));
  }

  function removePost(id) {
    setPosts((current) => current.filter((p) => p.id !== id));
  }

  return (
    <div className="feed-layout">
      <aside className="sidebar">
        <div className="card side-card">
          <h3>Browse</h3>
          {TYPES.map((t) => (
            <button
              key={t.value}
              className={`side-item ${type === t.value ? "active" : ""}`}
              onClick={() => setType(t.value)}
            >
              <Icon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}

          <h3>Categories</h3>
          <div className="chips">
            {["All", ...CATEGORIES].map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? "active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="feed">
        <div className="card composer">
          <Avatar user={user} size={42} />
          <button className="composer-input" onClick={() => onCreate("selling")}>
            What are you selling or looking for, {user.name.split(" ")[0]}?
          </button>
          <div className="composer-actions">
            <button className="composer-btn sell" onClick={() => onCreate("selling")}>
              <Icon name="tag" size={18} /> Sell an item
            </button>
            <button className="composer-btn look" onClick={() => onCreate("looking")}>
              <Icon name="look" size={18} /> Looking for
            </button>
          </div>
        </div>

        {!user.avatar_url && (
          <div className="card nudge">
            <span className="nudge-icon">
              <Icon name="camera" size={22} />
            </span>
            <div>
              <strong>Add a profile picture</strong>
              <p className="muted small">Buyers and sellers trust people they can recognize.</p>
            </div>
            <button className="btn-secondary" onClick={onOpenProfile}>Add photo</button>
          </div>
        )}

        {search && <p className="results-note">Results for “{search}”</p>}
        {error && <p className="error">{error}</p>}

        {loading && posts.length === 0 && <div className="card empty">Loading the feed...</div>}

        {!loading && posts.length === 0 && !error && (
          <div className="card empty">
            <div className="empty-emoji">🛍️</div>
            <h3>Nothing here yet</h3>
            <p className="muted">Be the first to post. Tap the + button to sell something or ask for what you need.</p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            call={call}
            user={user}
            onChange={updatePost}
            onDelete={removePost}
            onMessage={onMessage}
          />
        ))}
      </section>
    </div>
  );
}
