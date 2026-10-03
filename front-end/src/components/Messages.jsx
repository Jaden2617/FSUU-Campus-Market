import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { navigate } from "../router";
import { imageUrl, peso, shortDateTime, timeAgo } from "../api";
import Avatar, { UserName } from "./Avatar";
import Icon from "./Icon";

// Runs a function every few seconds, but only while the tab is visible
function usePolling(fn, ms) {
  useEffect(() => {
    fn();
    const timer = setInterval(() => document.visibilityState === "visible" && fn(), ms);
    return () => clearInterval(timer);
  }, [fn, ms]);
}

export default function Messages({ activeId, pendingChat, onPendingUsed }) {
  const { call, user, refreshBadges } = useApp();
  const [convos, setConvos] = useState([]);
  const [thread, setThread] = useState(null); // { user, messages, posts, typing }
  const [draft, setDraft] = useState("");
  const [aboutPost, setAboutPost] = useState(null);
  const [photo, setPhoto] = useState(null); // { file, preview }
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const fileInput = useRef(null);
  const lastTypingPing = useRef(0);
  const [newChatUser, setNewChatUser] = useState(null);

  // Clicked "Message" on a post or profile: open that chat with a ready-made first message
  useEffect(() => {
    if (!pendingChat || pendingChat.user.id !== activeId) return;
    const { user: other, post } = pendingChat;
    setNewChatUser(other);
    setAboutPost(post || null);
    setDraft(
      post
        ? post.type === "looking"
          ? `Hi! I have "${post.title}" that you're looking for.`
          : `Hi! Is "${post.title}" still available?`
        : ""
    );
    onPendingUsed();
  }, [pendingChat, activeId, onPendingUsed]);

  const loadConvos = useCallback(() => {
    call("/conversations").then(setConvos).catch(() => {});
  }, [call]);
  usePolling(loadConvos, 5000);

  const loadThread = useCallback(() => {
    if (!activeId) return;
    call(`/messages/${activeId}`)
      .then((data) => {
        setThread(data);
        refreshBadges();
      })
      .catch((err) => setError(err.message));
  }, [call, activeId, refreshBadges]);

  useEffect(() => {
    setThread(null);
    setError("");
    setPhoto(null);
  }, [activeId]);
  usePolling(loadThread, 3000);

  // Scroll to the newest message
  const count = thread?.messages.length || 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [count, activeId, thread?.typing]);

  function onDraftChange(e) {
    setDraft(e.target.value);
    const now = Date.now();
    if (activeId && now - lastTypingPing.current > 3000) {
      lastTypingPing.current = now;
      call(`/typing/${activeId}`, { method: "POST" }).catch(() => {});
    }
  }

  function pickPhoto(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Photo must be smaller than 10 MB");
      return;
    }
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  async function send(e) {
    e.preventDefault();
    if ((!draft.trim() && !photo) || !activeId || sending) return;
    setError("");
    setSending(true);
    const form = new FormData();
    form.append("receiver_id", activeId);
    form.append("text", draft);
    if (aboutPost) form.append("post_id", aboutPost.id);
    if (photo) form.append("photo", photo.file);
    try {
      await call("/messages", { method: "POST", form });
      setDraft("");
      setAboutPost(null);
      setPhoto(null);
      lastTypingPing.current = 0;
      loadThread();
      loadConvos();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const activeUser =
    thread?.user || convos.find((c) => c.user.id === activeId)?.user || (newChatUser?.id === activeId ? newChatUser : null);

  // A brand-new chat isn't in the list yet, so show it at the top
  const list =
    activeUser && !convos.some((c) => c.user.id === activeUser.id)
      ? [{ user: activeUser, last_message: "New conversation", unread: 0 }, ...convos]
      : convos;

  const messages = thread?.messages || [];
  const lastMine = [...messages].reverse().find((m) => m.sender_id === user.id);
  const lastMessage = messages[messages.length - 1];

  return (
    <div className={`card messenger ${activeId ? "has-active" : ""}`}>
      <aside className="convo-list">
        <h2>Chats</h2>
        {list.length === 0 && (
          <p className="muted convo-empty">No messages yet. Tap “Message” on any post or profile to start chatting.</p>
        )}
        {list.map((c) => (
          <a key={c.user.id} className={`convo ${activeId === c.user.id ? "active" : ""}`} href={`#/messages/${c.user.id}`}>
            <Avatar user={c.user} size={48} />
            <div className="convo-text">
              <strong>{c.user.name}</strong>
              <span className={c.unread ? "unread-text" : "muted"}>
                {c.typing ? (
                  <em className="typing-text">typing...</em>
                ) : (
                  <>
                    {c.last_from_me ? "You: " : ""}
                    {c.last_message}
                  </>
                )}
              </span>
            </div>
            <div className="convo-side">
              {c.created_at && <span className="muted small">{timeAgo(c.created_at)}</span>}
              {c.unread > 0 ? (
                <span className="dot">{c.unread}</span>
              ) : (
                c.last_from_me && c.last_seen && <Avatar user={c.user} size={16} />
              )}
            </div>
          </a>
        ))}
      </aside>

      <section className="chat">
        {!activeId ? (
          <div className="chat-empty">
            <Icon name="chat" size={48} />
            <h3>Your messages</h3>
            <p className="muted">Pick a chat, or message a seller from the feed.</p>
          </div>
        ) : (
          <>
            <header className="chat-head">
              <button className="icon-btn back-btn" onClick={() => navigate("/messages")} title="Back">
                <Icon name="back" size={20} />
              </button>
              {activeUser && (
                <>
                  <a href={`#/profile/${activeUser.id}`}>
                    <Avatar user={activeUser} size={40} />
                  </a>
                  <div>
                    <UserName user={activeUser} />
                    <span className="muted small">{thread?.typing ? "typing..." : activeUser.contact}</span>
                  </div>
                </>
              )}
            </header>

            <div className="chat-body">
              {thread && messages.length === 0 && (
                <p className="muted chat-hint">Say hi! Agree on a price and a safe meetup spot on campus.</p>
              )}
              {messages.map((m, i) => {
                const mine = m.sender_id === user.id;
                const post = m.post_id && thread.posts[m.post_id];
                const showPost = post && messages[i - 1]?.post_id !== m.post_id;
                const prev = messages[i - 1];
                const showTime = !prev || new Date(m.created_at) - new Date(prev.created_at) > 30 * 60 * 1000;
                return (
                  <div key={m.id}>
                    {showTime && <div className="chat-time">{shortDateTime(m.created_at)}</div>}
                    {showPost && (
                      <a className={`chat-item ${mine ? "mine" : ""}`} href={`#/post/${post.id}`}>
                        {post.image_url && <img src={imageUrl(post.image_url)} alt="" />}
                        <div>
                          <span className="muted small">About</span>
                          <strong>{post.title}</strong>
                          {post.price !== null && <span className="small">{peso(post.price)}</span>}
                        </div>
                      </a>
                    )}
                    <div className={`bubble-row ${mine ? "mine" : ""}`}>
                      <div className={`bubble ${m.image_url && !m.text ? "photo-only" : ""}`} title={shortDateTime(m.created_at)}>
                        {m.image_url && (
                          <a href={imageUrl(m.image_url)} target="_blank" rel="noreferrer">
                            <img className="bubble-photo" src={imageUrl(m.image_url)} alt="Sent photo" />
                          </a>
                        )}
                        {m.text && <span>{m.text}</span>}
                      </div>
                    </div>
                    {m === lastMine && m === lastMessage && (
                      <div className="seen">{m.is_read ? "Seen" : "Sent"}</div>
                    )}
                  </div>
                );
              })}
              {thread?.typing && (
                <div className="bubble-row">
                  <div className="bubble typing-bubble">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {aboutPost && (
              <div className="about-bar">
                <span>
                  About: <strong>{aboutPost.title}</strong>
                </span>
                <button className="icon-btn" onClick={() => setAboutPost(null)} title="Remove">
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            {photo && (
              <div className="photo-preview-bar">
                <img src={photo.preview} alt="" />
                <span className="muted small">Photo ready to send</span>
                <button className="icon-btn" onClick={() => setPhoto(null)} title="Remove photo">
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            {error && <p className="error chat-error">{error}</p>}
            {thread?.blocked ? (
              <p className="muted center chat-blocked">This account is suspended. You can't reply.</p>
            ) : (
              <form className="chat-input" onSubmit={send}>
                <button type="button" className="icon-btn" onClick={() => fileInput.current.click()} title="Send a photo">
                  <Icon name="image" size={22} />
                </button>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} hidden />
                <input placeholder="Type a message..." value={draft} onChange={onDraftChange} />
                <button className="icon-btn send" type="submit" disabled={(!draft.trim() && !photo) || sending} title="Send">
                  <Icon name="send" size={20} />
                </button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
