import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context";
import Avatar, { VerifiedBadge } from "./Avatar";
import Icon from "./Icon";

export default function FriendsPage() {
  const { call, refreshBadges, toast, openChat } = useApp();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);

  const load = useCallback(() => {
    call("/friends").then(setData).catch(() => setData({ friends: [], incoming: [], outgoing: [] }));
  }, [call]);

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

      {data?.incoming.length > 0 && (
        <div className="card list-card">
          <h3 className="list-title">
            Friend requests <span className="count">{data.incoming.length}</span>
          </h3>
          {data.incoming.map((u) => (
            <div className="person-row" key={u.id}>
              <a href={`#/profile/${u.id}`}><Avatar user={u} size={52} /></a>
              {name(u)}
              <div className="row-actions">
                <button className="btn-primary btn-sm" onClick={() => act(u.id, "POST", `You and ${u.name.split(" ")[0]} are now friends`)}>
                  Confirm
                </button>
                <button className="btn-secondary btn-sm" onClick={() => act(u.id, "DELETE")}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="card list-card">
          <h3 className="list-title">
            Your friends <span className="count">{data.friends.length}</span>
          </h3>
          {data.friends.length === 0 && (
            <p className="muted empty-line">No friends yet. Search for classmates above, or tap “Add friend” on someone's profile.</p>
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
        </div>
      )}

      {data?.outgoing.length > 0 && (
        <div className="card list-card">
          <h3 className="list-title">Requests you sent</h3>
          {data.outgoing.map((u) => (
            <div className="person-row" key={u.id}>
              <a href={`#/profile/${u.id}`}><Avatar user={u} size={44} /></a>
              {name(u)}
              <button className="btn-secondary btn-sm" onClick={() => act(u.id, "DELETE")}>Cancel</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
