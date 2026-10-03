import { useEffect, useRef, useState } from "react";
import { REACTIONS, imageUrl, peso, timeAgo } from "../api";
import Avatar from "./Avatar";
import Icon from "./Icon";

export default function PostCard({ post, call, user, onChange, onDelete, onMessage }) {
  const [showPicker, setShowPicker] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const isLooking = post.type === "looking";
  const author = post.is_mine ? user : post.user; // shows your newest photo right away
  const isDone = post.status !== "available";

  // ---- Reactions: hover (laptop) or long-press (phone) opens the picker ----
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const reactWrap = useRef(null);

  function startPress(e) {
    if (e.pointerType === "mouse") return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setShowPicker(true);
      if (navigator.vibrate) navigator.vibrate(15); // small buzz, like Facebook
    }, 400);
  }

  function cancelPress() {
    clearTimeout(pressTimer.current);
  }

  function handleLikeClick() {
    if (longPressed.current) {
      longPressed.current = false; // it was a long press: keep the picker open
      return;
    }
    react(post.my_reaction || "👍");
  }

  // Tapping anywhere else closes the picker
  useEffect(() => {
    if (!showPicker) return;
    function closeIfOutside(e) {
      if (reactWrap.current && !reactWrap.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [showPicker]);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  async function react(emoji) {
    setShowPicker(false);
    try {
      onChange(await call(`/posts/${post.id}/react`, { method: "POST", body: { emoji } }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleComments() {
    const opening = !showComments;
    setShowComments(opening);
    if (opening) {
      try {
        setComments(await call(`/posts/${post.id}/comments`));
      } catch (err) {
        setError(err.message);
      }
    }
  }

  async function addComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const comment = await call(`/posts/${post.id}/comments`, { method: "POST", body: { text: commentText } });
      setComments([...comments, comment]);
      setCommentText("");
      onChange({ ...post, comment_count: post.comment_count + 1 });
    } catch (err) {
      setError(err.message);
    }
  }

  async function setStatus(status) {
    try {
      onChange(await call(`/posts/${post.id}/status`, { method: "PATCH", body: { status } }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    try {
      await call(`/posts/${post.id}`, { method: "DELETE" });
      onDelete(post.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const reactionSummary = Object.entries(post.reactions)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji]) => emoji)
    .join("");

  return (
    <article className={`card post ${isDone ? "is-done" : ""}`}>
      <header className="post-head">
        <Avatar user={author} size={42} />
        <div className="post-meta">
          <strong>{author.name}</strong>
          <span className="muted small">
            {timeAgo(post.created_at)} · {post.category}
          </span>
        </div>
        <span className={`type-badge ${isLooking ? "looking" : "selling"}`}>
          {isLooking ? "Looking for" : "For sale"}
        </span>
      </header>

      <div className="post-body">
        <h3 className="post-title">
          {post.title}
          {isDone && <span className="status-badge">{post.status === "sold" ? "SOLD" : "FOUND"}</span>}
        </h3>
        {post.price !== null && (
          <p className="post-price">
            {isLooking ? "Budget: " : ""}
            {peso(post.price)}
          </p>
        )}
        {post.description && <p className="post-desc">{post.description}</p>}
      </div>

      {post.image_url && (
        <div className="post-photo">
          <img src={imageUrl(post.image_url)} alt={post.title} loading="lazy" />
        </div>
      )}

      {(post.reaction_total > 0 || post.comment_count > 0) && (
        <div className="post-stats">
          <span>
            {post.reaction_total > 0 && (
              <>
                <span className="stat-emojis">{reactionSummary}</span> {post.reaction_total}
              </>
            )}
          </span>
          {post.comment_count > 0 && (
            <button className="link-btn muted" onClick={toggleComments}>
              {post.comment_count} comment{post.comment_count > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      <div className="post-actions">
        <div
          className="react-wrap"
          ref={reactWrap}
          onPointerLeave={(e) => e.pointerType === "mouse" && setShowPicker(false)}
        >
          {showPicker && (
            <div className="react-picker">
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => react(emoji)} title="React">
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <button
            className={`action ${post.my_reaction ? "reacted" : ""}`}
            onClick={handleLikeClick}
            onPointerEnter={(e) => e.pointerType === "mouse" && setShowPicker(true)}
            onPointerDown={startPress}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
            onPointerLeave={cancelPress}
            onContextMenu={(e) => e.preventDefault()}
            title="Tap to like. Hold (or hover) for more reactions"
          >
            <span className="action-emoji">{post.my_reaction || "👍"}</span>
            {post.my_reaction ? "Reacted" : "Like"}
          </button>
        </div>

        <button className="action" onClick={toggleComments}>
          <Icon name="comment" size={18} /> Comment
        </button>

        {post.is_mine ? (
          isDone ? (
            <button className="action" onClick={() => setStatus("available")}>
              <Icon name="back" size={18} /> Mark available
            </button>
          ) : (
            <button className="action" onClick={() => setStatus(isLooking ? "found" : "sold")}>
              <Icon name="check" size={18} /> {isLooking ? "Mark found" : "Mark sold"}
            </button>
          )
        ) : (
          <button className="action primary" onClick={() => onMessage(post.user, post)}>
            <Icon name="chat" size={18} /> Message
          </button>
        )}
      </div>

      {post.is_mine && (
        <div className="owner-row">
          {confirmDelete ? (
            <>
              <span className="muted small">Delete this post?</span>
              <button className="link-btn danger" onClick={remove}>Yes, delete</button>
              <button className="link-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <button className="link-btn muted small" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={14} /> Delete post
            </button>
          )}
        </div>
      )}

      {error && <p className="error post-error">{error}</p>}

      {showComments && (
        <div className="comments">
          {comments.map((c) => {
            const commenter = c.user.id === user.id ? user : c.user;
            return (
            <div className="comment" key={c.id}>
              <Avatar user={commenter} size={32} />
              <div>
                <div className="comment-bubble">
                  <strong>{commenter.name}</strong>
                  <p>{c.text}</p>
                </div>
                <span className="muted small">{timeAgo(c.created_at)}</span>
              </div>
            </div>
            );
          })}
          <form className="comment-form" onSubmit={addComment}>
            <Avatar user={user} size={32} />
            <input
              placeholder={isLooking ? "Have this? Let them know..." : "Ask if it's still available..."}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button className="icon-btn send" type="submit" title="Send" disabled={!commentText.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
