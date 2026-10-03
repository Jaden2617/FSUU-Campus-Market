import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { navigate } from "../router";
import { imageUrl } from "../api";
import PostCard from "./PostCard";
import Avatar from "./Avatar";
import Icon from "./Icon";

const TYPES = [
  { value: "all", label: "All posts", icon: "grid" },
  { value: "selling", label: "For sale", icon: "tag" },
  { value: "looking", label: "Looking for", icon: "look" },
];

// Shows a sponsored card after every 5 posts
const AD_EVERY = 5;

export default function Feed({ mode = "all" }) {
  const { call, user, config, search, openCreate, openProfileEdit, postEvent } = useApp();
  const [posts, setPosts] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [ads, setAds] = useState([]);
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const sentinel = useRef(null);
  const saved = mode === "saved";

  const buildQuery = useCallback(
    (before) => {
      const params = new URLSearchParams({ type, category, q: search });
      if (saved) params.set("saved", "true");
      if (before) params.set("before", before);
      return `/posts?${params}`;
    },
    [type, category, search, saved]
  );

  // Load the first page whenever a filter or the search box changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      call(buildQuery())
        .then((data) => {
          setPosts(data.posts);
          setNextBefore(data.next_before);
          setError("");
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [call, buildQuery]);

  useEffect(() => {
    if (!saved) call("/ads").then(setAds).catch(() => {});
  }, [call, saved]);

  const loadMore = useCallback(() => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    call(buildQuery(nextBefore))
      .then((data) => {
        setPosts((current) => [...current, ...data.posts.filter((p) => !current.some((c) => c.id === p.id))]);
        setNextBefore(data.next_before);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [call, buildQuery, nextBefore, loadingMore]);

  // Load more posts automatically when you scroll to the bottom
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // A post was created or edited somewhere else in the app
  useEffect(() => {
    if (!postEvent) return;
    const { post, isNew } = postEvent;
    setPosts((current) =>
      isNew && !saved ? [post, ...current.filter((p) => p.id !== post.id)] : current.map((p) => (p.id === post.id ? post : p))
    );
  }, [postEvent, saved]);

  function updatePost(updated) {
    setPosts((current) =>
      saved && !updated.saved ? current.filter((p) => p.id !== updated.id) : current.map((p) => (p.id === updated.id ? updated : p))
    );
  }

  function removePost(id) {
    setPosts((current) => current.filter((p) => p.id !== id));
  }

  return (
    <div className="feed-layout">
      <aside className="sidebar">
        <div className="card side-card">
          <a className="side-item side-me" href={`#/profile/${user.id}`}>
            <Avatar user={user} size={30} />
            {user.name}
          </a>
          <h3>Browse</h3>
          {TYPES.map((t) => (
            <button
              key={t.value}
              className={`side-item ${!saved && type === t.value ? "active" : ""}`}
              onClick={() => {
                setType(t.value);
                if (saved) navigate("/");
              }}
            >
              <Icon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}
          <button className={`side-item ${saved ? "active" : ""}`} onClick={() => navigate(saved ? "/" : "/saved")}>
            <Icon name="bookmark" size={18} />
            Saved
          </button>

          <h3>Categories</h3>
          <div className="chips">
            {["All", ...config.categories].map((c) => (
              <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="feed">
        {saved ? (
          <div className="card page-title">
            <Icon name="bookmark" size={22} />
            <div>
              <h2>Saved posts</h2>
              <p className="muted small">Posts you bookmarked to check later.</p>
            </div>
          </div>
        ) : (
          <div className="card composer">
            <Avatar user={user} size={42} />
            <button className="composer-input" onClick={() => openCreate("selling")}>
              What are you selling or looking for, {user.name.split(" ")[0]}?
            </button>
            <div className="composer-actions">
              <button className="composer-btn sell" onClick={() => openCreate("selling")}>
                <Icon name="tag" size={18} /> Sell an item
              </button>
              <button className="composer-btn look" onClick={() => openCreate("looking")}>
                <Icon name="look" size={18} /> Looking for
              </button>
            </div>
          </div>
        )}

        {!saved && !user.avatar_url && (
          <div className="card nudge">
            <span className="nudge-icon">
              <Icon name="camera" size={22} />
            </span>
            <div>
              <strong>Add a profile picture</strong>
              <p className="muted small">Buyers and sellers trust people they can recognize.</p>
            </div>
            <button className="btn-secondary" onClick={openProfileEdit}>
              Add photo
            </button>
          </div>
        )}

        {search && <p className="results-note">Results for “{search}”</p>}
        {error && <p className="error">{error}</p>}

        {loading && posts.length === 0 && (
          <>
            <div className="card skeleton" />
            <div className="card skeleton" />
          </>
        )}

        {!loading && posts.length === 0 && !error && (
          <div className="card empty">
            <div className="empty-emoji">{saved ? "🔖" : "🛍️"}</div>
            <h3>{saved ? "No saved posts yet" : "Nothing here yet"}</h3>
            <p className="muted">
              {saved
                ? "Tap the bookmark on any post to save it here."
                : "Be the first to post. Tap the + button to sell something or ask for what you need."}
            </p>
          </div>
        )}

        {posts.map((post, i) => (
          <Fragment key={post.id}>
            <PostCard post={post} onChange={updatePost} onDelete={removePost} />
            {ads.length > 0 && (i + 1) % AD_EVERY === 0 && <AdCard ad={ads[Math.floor(i / AD_EVERY) % ads.length]} />}
          </Fragment>
        ))}
        {ads.length > 0 && posts.length > 0 && posts.length < AD_EVERY && !loading && <AdCard ad={ads[0]} />}

        <div ref={sentinel} />
        {loadingMore && <p className="muted center">Loading more...</p>}
        {!nextBefore && posts.length > 8 && <p className="muted center small">You're all caught up ✨</p>}
      </section>
    </div>
  );
}

function AdCard({ ad }) {
  const content = (
    <>
      <header className="ad-head">
        <span className="ad-logo">
          <Icon name="megaphone" size={18} />
        </span>
        <div>
          <strong>{ad.business_name}</strong>
          <span className="muted small">Sponsored</span>
        </div>
      </header>
      <div className="post-body">
        <h3 className="post-title">{ad.title}</h3>
        {ad.text && <p className="post-desc">{ad.text}</p>}
      </div>
      {ad.image_url && (
        <div className="post-photo">
          <img src={imageUrl(ad.image_url)} alt={ad.title} loading="lazy" />
        </div>
      )}
      {ad.link_url && (
        <div className="ad-link">
          <Icon name="link" size={16} /> Learn more
        </div>
      )}
    </>
  );
  return ad.link_url ? (
    <a className="card post ad-card" href={ad.link_url} target="_blank" rel="noopener noreferrer sponsored">
      {content}
    </a>
  ) : (
    <article className="card post ad-card">{content}</article>
  );
}
