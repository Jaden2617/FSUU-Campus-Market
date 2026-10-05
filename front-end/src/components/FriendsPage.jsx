import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context";
import { timeAgo } from "../api";
import Avatar, { VerifiedBadge } from "./Avatar";
import Icon from "./Icon";

export default function FriendsPage() {
  const { call, refreshBadges, toast, openChat } = useApp();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState(null); // "requests" | "sent" | "friends" (null = pick for me)

  const load = useCallback(() => {
    call("/friends").then(setData).catch(() => setData({ friends: [], incoming: [], outgoing: [] }));
  }, [call]);

  // Open on "Requests" when someone is waiting for your answer, otherwise on your friends
  const shown = tab || (data?.incoming.length ? "requests" : "friends");

  useEffect(() => {
    load();
  }, [load]);

  // Search people by name
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => call(`/users/search?q=${encodeURIComponent(query)}`).then(setResults).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [query, call]);

  async function act(userId, method, message) {
    try {
      const res = await call(`/friends/${userId}`, { method });
      if (message) toast(message);
      setResults((list) => list?.map((u) => (u.id === userId ? { ...u, friend_status: res.friend_status } : u)));
      load();
      refreshBadges();
    } catch (err) {
      toast(err.message);
    }
  }

  function SearchButton({ person }) {
    const s = person.friend_status;
    if (s === "self") return <span className="muted small">You</span>;
    if (s === "friends") return <span className="pill"><Icon name="userCheck" size={14} /> Friends</span>;
    if (s === "request_sent")
      return <button className="btn-secondary btn-sm" onClick={() => act(person.id, "DELETE")}>Cancel</button>;
    if (s === "request_received")
      return <button className="btn-primary btn-sm" onClick={() => act(person.id, "POST", "Friend added")}>Accept</button>;
    return (
      <button className="btn-primary btn-sm" onClick={() => act(person.id, "POST", "Friend request sent")}>
        <Icon name="userPlus" size={15} /> Add
      </button>
    );
  }

  const name = (u) => (
    <a className="person-name" href={`#/profile/${u.id}`}>
      {u.name}
      {u.verified && <VerifiedBadge size={14} />}
    </a>
  );

  return (
    <div className="page-narrow friends-page">
      <div className="card friends-search">
        <h2>Friends</h2>
        <label className="search-box">
          <Icon name="search" size={18} />
          <input placeholder="Find classmates by name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {results && (
          <div className="people-list">
            {results.length === 0 && <p className="muted">No one found named “{query}”.</p>}
            {results.map((u) => (
              <div className="person-row" key={u.id}>
                <a href={`#/profile/${u.id}`}><Avatar user={u} size={44} /></a>
                {name(u)}
                <SearchButton person={u} />
              </div>
            ))}
          </div>
        )}
      </div>

      {data === null && <div className="card skeleton" />}

      {data && (
        <div className="card friends-card">
          <div className="tabs friends-tabs" role="tablist">
            <button role="tab" aria-selected={shown === "requests"} className={`tab ${shown === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}>
              Requests {data.incoming.length > 0 && <span className="count">{data.incoming.length}</span>}
            </button>
            <button role="tab" aria-selected={shown === "sent"} className={`tab ${shown === "sent" ? "active" : ""}`} onClick={() => setTab("sent")}>
              Sent {data.outgoing.length > 0 && <span className="tab-num">{data.outgoing.length}</span>}
            </button>
            <button role="tab" aria-selected={shown === "friends"} className={`tab ${shown === "friends" ? "active" : ""}`} onClick={() => setTab("friends")}>
              Your friends <span className="tab-num">{data.friends.length}</span>
            </button>
          </div>

          <div className="list-card">
            {shown === "requests" && (
              <>
                <p className="muted small tab-hint">People who want to be your friend.</p>
                {data.incoming.length === 0 && <EmptyLine icon="userPlus" text="No friend requests right now." />}
                {data.incoming.map((u) => (
                  <div className="person-row" key={u.id}>
                    <a href={`#/profile/${u.id}`}><Avatar user={u} size={52} /></a>
                    <div className="person-info">
                      {name(u)}
                      {u.requested_at && <span className="muted small">Sent you a request · {timeAgo(u.requested_at)}</span>}
                    </div>
                    <div className="row-actions">
                      <button className="btn-primary btn-sm" onClick={() => act(u.id, "POST", `You and ${u.name.split(" ")[0]} are now friends`)}>
                        Confirm
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => act(u.id, "DELETE", "Request removed")}>Delete</button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {shown === "sent" && (
              <>
                <p className="muted small tab-hint">Requests you sent that haven't been answered yet.</p>
                {data.outgoing.length === 0 && (
                  <EmptyLine icon="search" text="You haven't sent any requests. Search for classmates above, or tap “Add friend” on someone's profile." />
                )}
                {data.outgoing.map((u) => (
                  <div className="person-row" key={u.id}>
                    <a href={`#/profile/${u.id}`}><Avatar user={u} size={52} /></a>
                    <div className="person-info">
                      {name(u)}
                      {u.requested_at && <span className="muted small">Request sent · {timeAgo(u.requested_at)}</span>}
                    </div>
                    <button className="btn-secondary btn-sm" onClick={() => act(u.id, "DELETE", "Request cancelled")}>Cancel request</button>
                  </div>
                ))}
              </>
            )}

            {shown === "friends" && (
              <>
                {data.friends.length === 0 && (
                  <EmptyLine icon="users" text="No friends yet. Search for classmates above, or tap “Add friend” on someone's profile." />
                )}
                {data.friends.map((u) => (
                  <div className="person-row" key={u.id}>
                    <a href={`#/profile/${u.id}`}><Avatar user={u} size={52} /></a>
                    {name(u)}
                    <button className="icon-btn bordered" onClick={() => openChat(u)} title="Message">
                      <Icon name="chat" size={18} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyLine({ icon, text }) {
  return (
    <div className="friends-empty">
      <Icon name={icon} size={30} />
      <p className="muted">{text}</p>
    </div>
  );
}
