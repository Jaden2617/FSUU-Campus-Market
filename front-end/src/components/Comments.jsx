import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { timeAgo } from "../api";
import Avatar, { UserName } from "./Avatar";
import Icon from "./Icon";
import { ConfirmDialog } from "./Dialogs";

// How many replies to show before "View more replies"
const SHOWN_REPLIES = 2;

// The comments under a post: replies (one level, like Facebook), reactions and editing.
// onCountChange(+1 / -n) keeps the post's comment counter right.
export default function Comments({ post, onCountChange }) {
  const { call, user } = useApp();
  const [comments, setComments] = useState(null); // null = still loading
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null); // { threadId, name }
  const [replyText, setReplyText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [expanded, setExpanded] = useState({}); // threads showing all replies
  const [deleting, setDeleting] = useState(null); // comment waiting for "Delete?" confirm
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    call(`/posts/${post.id}/comments`)
      .then((list) => !cancelled && setComments(list))
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setComments([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [call, post.id]);

  async function run(action) {
    setError("");
    try {
      return await action();
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  // Swap one comment in the list with its new version
  function replaceComment(updated) {
    setComments((list) => list.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function send(body) {
    setSending(true);
    const comment = await run(() => call(`/posts/${post.id}/comments`, { method: "POST", body }));
    setSending(false);
    if (comment) {
      setComments((list) => [...list, comment]);
      onCountChange(1);
    }
    return comment;
  }

  async function addComment(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    if (await send({ text })) setText("");
  }

  async function addReply(e) {
    e.preventDefault();
    if (!replyText.trim() || sending) return;
    const reply = await send({ text: replyText, parent_id: replyTo.targetId });
    if (reply) {
      setExpanded((x) => ({ ...x, [replyTo.threadId]: true }));
      setReplyTo(null);
      setReplyText("");
    }
  }

  function startReply(comment) {
    const threadId = comment.parent_id || comment.id;
    const isReplyToReply = Boolean(comment.parent_id);
    setEditingId(null);
    setReplyTo({ threadId, targetId: comment.id, name: comment.user.name });
    // Replying to a reply: start with their name so people know who you're answering
    setReplyText(isReplyToReply && comment.user.id !== user.id ? `@${comment.user.name.split(" ")[0]} ` : "");
  }

  async function react(comment, emoji) {
    const updated = await run(() => call(`/comments/${comment.id}/react`, { method: "POST", body: { emoji } }));
    if (updated) replaceComment(updated);
  }

  async function saveEdit(comment, newText) {
    if (!newText.trim()) return;
    const updated = await run(() => call(`/comments/${comment.id}`, { method: "PUT", body: { text: newText } }));
    if (updated) {
      replaceComment(updated);
      setEditingId(null);
    }
  }

  async function remove(comment) {
    const res = await run(() => call(`/comments/${comment.id}`, { method: "DELETE" }));
    setDeleting(null);
    if (res) {
      const gone = new Set(res.deleted_ids || [comment.id]);
      setComments((list) => list.filter((c) => !gone.has(c.id)));
      onCountChange(-gone.size);
      if (replyTo && gone.has(replyTo.targetId)) setReplyTo(null);
    }
  }

  if (comments === null) {
    return (
      <div className="comments">
        <p className="muted small">Loading comments...</p>
      </div>
    );
  }

  const threads = comments.filter((c) => !c.parent_id);
  const repliesOf = (id) => comments.filter((c) => c.parent_id === id);

  const item = (c) => (
    <CommentItem
      key={c.id}
      comment={c}
      me={user}
      canDelete={c.user.id === user.id || post.is_mine || user.is_admin}
      editing={editingId === c.id}
      onReply={() => startReply(c)}
      onReact={(emoji) => react(c, emoji)}
      onEdit={() => {
        setReplyTo(null);
        setEditingId(c.id);
      }}
      onCancelEdit={() => setEditingId(null)}
      onSaveEdit={(newText) => saveEdit(c, newText)}
      onDelete={() => setDeleting(c)}
    />
  );

  return (
    <div className="comments">
      {threads.map((thread) => {
        const replies = repliesOf(thread.id);
        const hiddenCount = expanded[thread.id] ? 0 : Math.max(0, replies.length - SHOWN_REPLIES);
        const shown = replies.slice(hiddenCount);
        const replyingHere = replyTo?.threadId === thread.id;
        return (
          <div className="comment-thread" key={thread.id}>
            {item(thread)}
            {(replies.length > 0 || replyingHere) && (
              <div className="replies">
                {hiddenCount > 0 && (
                  <button className="link-btn muted more-replies" onClick={() => setExpanded((x) => ({ ...x, [thread.id]: true }))}>
                    <Icon name="comment" size={14} /> View {hiddenCount} more {hiddenCount === 1 ? "reply" : "replies"}
                  </button>
                )}
                {shown.map(item)}
                {replyingHere && (
                  <form className="comment-form reply-form" onSubmit={addReply}>
                    <Avatar user={user} size={26} />
                    <div className="reply-input">
                      <span className="replying-to">
                        Replying to <strong>{replyTo.name}</strong>
                        <button type="button" className="link-btn muted small" onClick={() => setReplyTo(null)}>
                          Cancel
                        </button>
                      </span>
                      <div className="reply-row">
                        <input
                          autoFocus
                          placeholder="Write a reply..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => e.key === "Escape" && setReplyTo(null)}
                          maxLength={1000}
                        />
                        <button className="icon-btn send" type="submit" title="Send reply" disabled={!replyText.trim() || sending}>
                          <Icon name="send" size={17} />
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="error small">{error}</p>}

      <form className="comment-form" onSubmit={addComment}>
        <Avatar user={user} size={32} />
        <input
          placeholder={post.type === "looking" ? "Have this? Let them know..." : "Ask if it's still available..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
        <button className="icon-btn send" type="submit" title="Send" disabled={!text.trim() || sending}>
          <Icon name="send" size={18} />
        </button>
      </form>

      {deleting && (
        <ConfirmDialog
          title="Delete comment?"
          text={
            repliesOf(deleting.id).length > 0
              ? "This comment and its replies will be removed. This can't be undone."
              : "This comment will be removed. This can't be undone."
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function CommentItem({ comment, me, canDelete, editing, onReply, onReact, onEdit, onCancelEdit, onSaveEdit, onDelete }) {
  const author = comment.user.id === me.id ? me : comment.user; // shows your newest photo right away
  const isMine = comment.user.id === me.id;
  const isReply = Boolean(comment.parent_id);
  const [draft, setDraft] = useState(comment.text);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) setDraft(comment.text);
  }, [editing, comment.text]);

  async function save(e) {
    e?.preventDefault();
    if (!draft.trim() || saving) return;
    if (draft.trim() === comment.text) {
      onCancelEdit();
      return;
    }
    setSaving(true);
    await onSaveEdit(draft);
    setSaving(false);
  }

  const summary = Object.entries(comment.reactions || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([emoji]) => emoji)
    .join("");

  return (
    <div className={`comment ${isReply ? "is-reply" : ""}`}>
      <a href={`#/profile/${author.id}`} className="comment-avatar">
        <Avatar user={author} size={isReply ? 26 : 32} />
      </a>
      <div className="comment-main">
        {editing ? (
          <form className="comment-edit" onSubmit={save}>
            <textarea
              autoFocus
              value={draft}
              rows={Math.min(5, Math.max(1, Math.ceil(draft.length / 45)))}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelEdit();
                if (e.key === "Enter" && !e.shiftKey) save(e);
              }}
              maxLength={1000}
            />
            <div className="comment-edit-actions">
              <span className="muted small">Esc to cancel · Enter to save</span>
              <button type="button" className="btn-small ghost" onClick={onCancelEdit}>
                Cancel
              </button>
              <button type="submit" className="btn-small" disabled={!draft.trim() || saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="comment-bubble-wrap">
            <div className="comment-bubble">
              <UserName user={author} />
              <p>{comment.text}</p>
            </div>
            {comment.reaction_total > 0 && (
              <span className="comment-reactions" title={`${comment.reaction_total} reaction${comment.reaction_total > 1 ? "s" : ""}`}>
                <span className="comment-reactions-emoji">{summary}</span>
                {comment.reaction_total > 1 && <span>{comment.reaction_total}</span>}
              </span>
            )}
          </div>
        )}

        {!editing && (
          <div className="comment-meta">
            <span className="muted">{timeAgo(comment.created_at)}</span>
            <CommentReactButton myReaction={comment.my_reaction} onReact={onReact} />
            <button className="comment-action" onClick={onReply}>
              Reply
            </button>
            {isMine && (
              <button className="comment-action" onClick={onEdit}>
                Edit
              </button>
            )}
            {canDelete && (
              <button className="comment-action" onClick={onDelete}>
                Delete
              </button>
            )}
            {comment.edited && <span className="muted edited-tag">Edited</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// "Like" under a comment: tap = 👍, hover (laptop) or hold (phone) = choose a reaction
function CommentReactButton({ myReaction, onReact }) {
  const { config } = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const pressTimer = useRef(null);
  const hoverTimer = useRef(null);
  const longPressed = useRef(false);

  useEffect(() => {
    if (!open) return;
    function closeIfOutside(e) {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [open]);

  useEffect(
    () => () => {
      clearTimeout(pressTimer.current);
      clearTimeout(hoverTimer.current);
    },
    []
  );

  function startPress(e) {
    if (e.pointerType === "mouse") return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setOpen(true);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 400);
  }

  function cancelPress() {
    clearTimeout(pressTimer.current);
  }

  function choose(emoji) {
    setOpen(false);
    onReact(emoji);
  }

  const labels = { "👍": "Like", "❤️": "Love", "😮": "Wow", "😂": "Haha" };

  return (
    <span
      className="comment-react"
      ref={wrap}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        hoverTimer.current = setTimeout(() => setOpen(true), 350);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimeout(hoverTimer.current);
        setOpen(false);
      }}
    >
      {open && (
        <span className="react-picker small">
          {config.reactions.map((emoji) => (
            <button key={emoji} type="button" onClick={() => choose(emoji)} title={labels[emoji] || "React"}>
              {emoji}
            </button>
          ))}
        </span>
      )}
      <button
        type="button"
        className={`comment-action ${myReaction ? "reacted" : ""} ${myReaction === "❤️" ? "love" : ""}`}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          clearTimeout(hoverTimer.current);
          setOpen(false);
          onReact(myReaction || "👍");
        }}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
        title="Tap to like. Hold (or hover) for more reactions"
      >
        {myReaction ? `${myReaction} ${labels[myReaction] || "Reacted"}` : "Like"}
      </button>
    </span>
  );
}
