import { useCallback, useEffect, useRef, useState } from "react";
import { imageUrl, peso, timeAgo } from "../api";
import Avatar from "./Avatar";
import Icon from "./Icon";

export default function Messages({ call, user, chatWith, onChatOpened, onRead }) {
  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null); // the person you're chatting with
  const [thread, setThread] = useState({ messages: [], posts: {} });
  const [draft, setDraft] = useState("");
  const [aboutPost, setAboutPost] = useState(null); // item the next message is about
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  // Clicked "Message" on a post: open that chat with a ready-made first message
  useEffect(() => {
    if (!chatWith) return;
    const { user: other, post } = chatWith;
    setActive(other);
    setAboutPost(post || null);
    if (post) {
      setDraft(
        post.type === "looking"
          ? `Hi! I have "${post.title}" that you're looking for.`
          : `Hi! Is "${post.title}" still available?`
      );
    }
    onChatOpened();
  }, [chatWith, onChatOpened]);

  // Conversation list (refreshes every 4 seconds)
  const loadConvos = useCallback(() => {
    call("/conversations").then(setConvos).catch(() => {});
  }, [call]);

  useEffect(() => {
    loadConvos();
    const timer = setInterval(loadConvos, 4000);
    return () => clearInterval(timer);
  }, [loadConvos]);

  // Open chat (refreshes every 3 seconds so new messages appear)
  const activeId = active?.id;
  const loadThread = useCallback(() => {
    if (!activeId) return;
    call(`/messages/${activeId}`)
      .then((data) => {
        setThread({ messages: data.messages, posts: data.posts });
        onRead();
      })
      .catch((err) => setError(err.message));
  }, [call, activeId, onRead]);

  useEffect(() => {
    setThread({ messages: [], posts: {} });
    loadThread();
    const timer = setInterval(loadThread, 3000);
    return () => clearInterval(timer);
  }, [loadThread]);

  // Scroll to the newest message
  const messageCount = thread.messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount, activeId]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim() || !active) return;
    setError("");
    try {
      await call("/messages", {
        method: "POST",
        body: { receiver_id: active.id, text: draft, post_id: aboutPost?.id ?? null },
      });
      setDraft("");
      setAboutPost(null);
      loadThread();
      loadConvos();
    } catch (err) {
      setError(err.message);
    }
  }

  // A brand-new chat isn't in the list yet, so show it at the top
  const list =
    active && !convos.some((c) => c.user.id === active.id)
      ? [{ user: active, last_message: "New conversation", unread: 0, isNew: true }, ...convos]
      : convos;

  return (
    <div className={`card messenger ${active ? "has-active" : ""}`}>
      <aside className="convo-list">
        <h2>Chats</h2>
        {list.length === 0 && (
          <p className="muted convo-empty">
            No messages yet. Tap “Message” on any post in the feed to start chatting.
          </p>
        )}
        {list.map((c) => (
          <button
            key={c.user.id}
            className={`convo ${active?.id === c.user.id ? "active" : ""}`}
            onClick={() => {
              setActive(c.user);
              setAboutPost(null);
              setDraft("");
            }}
          >
            <Avatar user={c.user} size={46} />
            <div className="convo-text">
              <strong>{c.user.name}</strong>
              <span className={c.unread ? "unread-text" : "muted"}>
                {c.last_from_me ? "You: " : ""}
                {c.last_message}
              </span>
            </div>
            <div className="convo-side">
              {c.created_at && <span className="muted small">{timeAgo(c.created_at)}</span>}
              {c.unread > 0 && <span className="dot">{c.unread}</span>}
            </div>
          </button>
        ))}
      </aside>

      <section className="chat">
        {!active ? (
          <div className="chat-empty">
            <Icon name="chat" size={48} />
            <h3>Your messages</h3>
            <p className="muted">Pick a chat, or message a seller from the feed.</p>
          </div>
        ) : (
          <>
            <header className="chat-head">
              <button className="icon-btn back-btn" onClick={() => setActive(null)} title="Back">
                <Icon name="back" size={20} />
              </button>
              <Avatar user={active} size={40} />
              <div>
                <strong>{active.name}</strong>
                <span className="muted small">{active.contact}</span>
              </div>
            </header>

            <div className="chat-body">
              {thread.messages.length === 0 && (
                <p className="muted chat-hint">Say hi! Agree on a price and a meetup spot on campus.</p>
              )}
              {thread.messages.map((m, i) => {
                const mine = m.sender_id === user.id;
                const post = m.post_id && thread.posts[m.post_id];
                const showPost = post && thread.messages[i - 1]?.post_id !== m.post_id;
                return (
                  <div key={m.id}>
                    {showPost && (
                      <div className={`chat-item ${mine ? "mine" : ""}`}>
                        {post.image_url && <img src={imageUrl(post.image_url)} alt="" />}
                        <div>
                          <span className="muted small">About</span>
                          <strong>{post.title}</strong>
                          {post.price !== null && <span className="small">{peso(post.price)}</span>}
                        </div>
                      </div>
                    )}
                    <div className={`bubble-row ${mine ? "mine" : ""}`}>
                      <div className="bubble" title={new Date(m.created_at).toLocaleString()}>
                        {m.text}
                      </div>
                    </div>
                  </div>
                );
              })}
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
            {error && <p className="error chat-error">{error}</p>}

            <form className="chat-input" onSubmit={send}>
              <input
                placeholder="Type a message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <button className="icon-btn send" type="submit" disabled={!draft.trim()} title="Send">
                <Icon name="send" size={20} />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
