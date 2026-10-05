import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { navigate } from "../router";
import { peso, timeAgo } from "../api";
import Avatar, { UserName } from "./Avatar";
import Icon from "./Icon";
import PhotoCarousel from "./PhotoCarousel";
import Comments from "./Comments";
import { ConfirmDialog, MarkSoldModal, PaymentModal, RateModal, ReportModal } from "./Dialogs";

export default function PostCard({ post, onChange, onDelete, startWithComments = false }) {
  const { call, user, config, openChat, openEdit, toast } = useApp();
  const [showPicker, setShowPicker] = useState(false);
  const [showComments, setShowComments] = useState(startWithComments);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // "sold" | "rate" | "report" | "boost" | "delete"
  const [error, setError] = useState("");

  const isLooking = post.type === "looking";
  const isDone = post.status !== "available";
  const author = post.is_mine ? user : post.user; // shows your newest photo right away

  // ---- Reactions: hover (laptop) or long-press (phone) opens the picker ----
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const reactWrap = useRef(null);
  const menuRef = useRef(null);

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

  // Tapping anywhere else closes the reaction picker / the ⋯ menu
  useEffect(() => {
    if (!showPicker && !menuOpen) return;
    function closeIfOutside(e) {
      if (reactWrap.current && !reactWrap.current.contains(e.target)) setShowPicker(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [showPicker, menuOpen]);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  async function run(action) {
    setError("");
    try {
      return await action();
    } catch (err) {
      setError(err.message);
    }
  }

  async function react(emoji) {
    setShowPicker(false);
    const updated = await run(() => call(`/posts/${post.id}/react`, { method: "POST", body: { emoji } }));
    if (updated) onChange(updated);
  }

  function toggleComments() {
    setShowComments(!showComments);
  }

  useEffect(() => {
    if (startWithComments) setShowComments(true);
  }, [startWithComments]);

  async function setStatus(status) {
    const updated = await run(() => call(`/posts/${post.id}/status`, { method: "PATCH", body: { status } }));
    if (updated) onChange(updated);
  }

  async function toggleSave() {
    const updated = await run(() => call(`/posts/${post.id}/save`, { method: "POST" }));
    if (updated) {
      onChange(updated);
      toast(updated.saved ? "Saved for later" : "Removed from saved");
    }
  }

  async function remove() {
    const ok = await run(() => call(`/posts/${post.id}`, { method: "DELETE" }));
    setDialog(null);
    if (ok) {
      onDelete(post.id);
      toast("Post deleted");
    }
  }

  async function adminHide() {
    const res = await run(() => call(`/admin/posts/${post.id}/hide`, { method: "POST", body: { value: !post.hidden } }));
    if (res) {
      onChange({ ...post, hidden: res.hidden });
      toast(res.hidden ? "Post hidden from the feed" : "Post visible again");
    }
  }

  const reactionSummary = Object.entries(post.reactions)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji]) => emoji)
    .join("");

  const menuItem = (icon, label, onClick, danger = false) => (
    <button
      className={`menu-item ${danger ? "danger" : ""}`}
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
    >
      <Icon name={icon} size={18} /> {label}
    </button>
  );

  return (
    <article className={`card post ${isDone ? "is-done" : ""} ${post.boosted ? "is-boosted" : ""}`}>
      {post.hidden && (
        <div className="post-banner warn">
          <Icon name="eyeOff" size={16} /> Hidden by an admin. Only you{user.is_admin ? " and admins" : ""} can see this.
        </div>
      )}
      {post.can_rate && (
        <div className="post-banner rate">
          <span>
            <Icon name="star" size={16} /> You bought this! How was the seller?
          </span>
          <button className="btn-small" onClick={() => setDialog("rate")}>
            Rate
          </button>
        </div>
      )}

      <header className="post-head">
        <a href={`#/profile/${author.id}`} className="post-avatar">
          <Avatar user={author} size={42} />
        </a>
        <div className="post-meta">
          <UserName user={author} />
          <span className="muted small">
            <a href={`#/post/${post.id}`} className="time-link">
              {timeAgo(post.created_at)}
            </a>{" "}
            · {post.category}
            {post.edited && " · Edited"}
          </span>
        </div>
        <div className="post-badges">
          {post.boosted && (
            <span className="boost-badge" title="Boosted post">
              <Icon name="bolt" size={12} filled /> Boosted
            </span>
          )}
          <span className={`type-badge ${isLooking ? "looking" : "selling"}`}>{isLooking ? "Looking for" : "For sale"}</span>
        </div>
        <div className="dropdown-wrap" ref={menuRef}>
          <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} title="More options">
            <Icon name="more" size={22} />
          </button>
          {menuOpen && (
            <div className="dropdown post-menu">
              {post.is_mine ? (
                <>
                  {menuItem("edit", "Edit post", () => openEdit(post))}
                  {!isDone && !isLooking && !post.hidden &&
                    menuItem("bolt", post.boosted ? "Boost for longer" : "Boost post", () => setDialog("boost"))}
                  {isDone
                    ? menuItem("back", "Mark as available", () => setStatus("available"))
                    : isLooking
                      ? menuItem("check", "Mark as found", () => setStatus("found"))
                      : menuItem("check", "Mark as sold", () => setDialog("sold"))}
                  {menuItem("bookmark", post.saved ? "Unsave" : "Save post", toggleSave)}
                  {menuItem("trash", "Delete post", () => setDialog("delete"), true)}
                </>
              ) : (
                <>
                  {menuItem("bookmark", post.saved ? "Unsave" : "Save post", toggleSave)}
                  {menuItem("user", "View seller's profile", () => navigate(`/profile/${post.user.id}`))}
                  {menuItem("flag", "Report post", () => setDialog("report"), true)}
                </>
              )}
              {user.is_admin && !post.is_mine &&
                menuItem(post.hidden ? "eye" : "eyeOff", post.hidden ? "Unhide (admin)" : "Hide post (admin)", adminHide, !post.hidden)}
              {user.is_admin && !post.is_mine && menuItem("trash", "Delete (admin)", () => setDialog("delete"), true)}
            </div>
          )}
        </div>
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
        {post.meetup_spot && (
          <p className="meetup">
            <Icon name="pin" size={15} /> Meetup: {post.meetup_spot}
          </p>
        )}
        {post.description && <p className="post-desc">{post.description}</p>}
      </div>

      <PhotoCarousel photos={post.photos} alt={post.title} />

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
              {config.reactions.map((emoji) => (
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
          <button className="action" onClick={() => openEdit(post)}>
            <Icon name="edit" size={18} /> Edit
          </button>
        ) : (
          <button className="action primary" onClick={() => openChat(post.user, post)}>
            <Icon name="chat" size={18} /> Message
          </button>
        )}
      </div>

      {error && <p className="error post-error">{error}</p>}

      {showComments && (
        <Comments
          post={post}
          onCountChange={(change) => onChange({ ...post, comment_count: Math.max(0, post.comment_count + change) })}
        />
      )}

      {dialog === "sold" && (
        <MarkSoldModal
          post={post}
          onClose={() => setDialog(null)}
          onDone={(p) => {
            onChange(p);
            setDialog(null);
            toast("Marked as sold");
          }}
        />
      )}
      {dialog === "rate" && (
        <RateModal
          post={post}
          onClose={() => setDialog(null)}
          onDone={(p) => {
            onChange(p);
            setDialog(null);
          }}
        />
      )}
      {dialog === "report" && <ReportModal postId={post.id} onClose={() => setDialog(null)} />}
      {dialog === "boost" && <PaymentModal kind="boost" post={post} onClose={() => setDialog(null)} />}
      {dialog === "delete" && (
        <ConfirmDialog
          title="Delete post?"
          text={`“${post.title}” will be removed for everyone. This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={remove}
          onClose={() => setDialog(null)}
        />
      )}
    </article>
  );
}
