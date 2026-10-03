import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context";
import { longDate, timeAgo } from "../api";
import Avatar, { VerifiedBadge } from "./Avatar";
import Icon from "./Icon";
import { Stars } from "./Modal";
import PostCard from "./PostCard";
import { ConfirmDialog, ReportModal } from "./Dialogs";

export default function ProfilePage({ userId }) {
  const { call, user: me, openChat, openProfileEdit, openVerify, toast, postEvent } = useApp();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState(null);
  const [ratings, setRatings] = useState(null);
  const [friends, setFriends] = useState(null);
  const [dialog, setDialog] = useState(null);
  const isMe = userId === me.id;

  const loadProfile = useCallback(() => {
    call(`/users/${userId}`).then(setProfile).catch((err) => setError(err.message));
  }, [call, userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (tab === "posts" && posts === null) call(`/posts?user_id=${userId}`).then((d) => setPosts(d.posts)).catch(() => setPosts([]));
    if (tab === "reviews" && ratings === null) call(`/users/${userId}/ratings`).then(setRatings).catch(() => setRatings([]));
    if (tab === "friends" && friends === null) call(`/users/${userId}/friends`).then(setFriends).catch(() => setFriends([]));
  }, [tab, call, userId, posts, ratings, friends]);

  useEffect(() => {
    if (!postEvent || !isMe) return;
    const { post, isNew } = postEvent;
    setPosts((list) => (list === null ? list : isNew ? [post, ...list] : list.map((p) => (p.id === post.id ? post : p))));
  }, [postEvent, isMe]);

  async function friendAction(method) {
    try {
      const res = await call(`/friends/${userId}`, { method });
      setProfile((p) => ({
        ...p,
        friend_status: res.friend_status,
        friend_count: p.friend_count + (res.friend_status === "friends" ? 1 : p.friend_status === "friends" ? -1 : 0),
      }));
      setFriends(null);
      setDialog(null);
      if (res.friend_status === "request_sent") toast("Friend request sent");
      if (res.friend_status === "friends") toast(`You and ${profile.name.split(" ")[0]} are now friends`);
    } catch (err) {
      toast(err.message);
    }
  }

  async function toggleBan() {
    try {
      const res = await call(`/admin/users/${userId}/ban`, { method: "POST", body: { value: !profile.banned } });
      setProfile({ ...profile, banned: res.banned });
      setDialog(null);
      toast(res.banned ? "User suspended" : "User unsuspended");
    } catch (err) {
      toast(err.message);
    }
  }

  if (error) {
    return (
      <div className="page-narrow">
        <div className="card empty">
          <div className="empty-emoji">🙈</div>
          <h3>Profile not found</h3>
          <p className="muted">This account may have been removed.</p>
        </div>
      </div>
    );
  }
  if (!profile) return <div className="page-narrow"><div className="card skeleton tall" /></div>;

  const shown = isMe ? { ...profile, ...me } : profile;
  const firstName = shown.name.split(" ")[0];

  let friendButtons = null;
  if (!isMe) {
    const s = profile.friend_status;
    if (s === "none")
      friendButtons = (
        <button className="btn-primary btn-inline" onClick={() => friendAction("POST")}>
          <Icon name="userPlus" size={18} /> Add friend
        </button>
      );
    else if (s === "request_sent")
      friendButtons = (
        <button className="btn-secondary" onClick={() => friendAction("DELETE")}>
          <Icon name="close" size={18} /> Cancel request
        </button>
      );
    else if (s === "request_received")
      friendButtons = (
        <>
          <button className="btn-primary btn-inline" onClick={() => friendAction("POST")}>
            <Icon name="userCheck" size={18} /> Accept
          </button>
          <button className="btn-secondary" onClick={() => friendAction("DELETE")}>Decline</button>
        </>
      );
    else if (s === "friends")
      friendButtons = (
        <button className="btn-secondary" onClick={() => setDialog("unfriend")}>
          <Icon name="userCheck" size={18} /> Friends
        </button>
      );
  }

  return (
    <div className="profile-page">
      <section className="card profile-card">
        <div className="profile-cover" />
        <div className="profile-main">
          <div className="profile-avatar">
            <Avatar user={shown} size={128} />
          </div>
          <div className="profile-info">
            <h1>
              {shown.name}
              {shown.verified && <VerifiedBadge size={22} />}
            </h1>
            {profile.banned && <span className="status-badge danger">SUSPENDED</span>}
            {shown.bio && <p className="profile-bio">{shown.bio}</p>}
            <div className="profile-facts">
              <span>
                {profile.rating.count ? (
                  <>
                    <Stars value={profile.rating.average} size={15} /> <strong>{profile.rating.average}</strong> ({profile.rating.count} review
                    {profile.rating.count > 1 ? "s" : ""})
                  </>
                ) : (
                  <span className="muted">No reviews yet</span>
                )}
              </span>
              <span>
                <Icon name="users" size={15} /> {profile.friend_count} friend{profile.friend_count === 1 ? "" : "s"}
              </span>
              <span>
                <Icon name="tag" size={15} /> {profile.active_posts} for sale · {profile.sold_posts} sold
              </span>
              <span>
                <Icon name="user" size={15} /> Joined {longDate(profile.member_since)}
              </span>
              {shown.contact && (
                <span>
                  <Icon name="phone" size={15} /> {shown.contact}
                </span>
              )}
            </div>
          </div>
          <div className="profile-actions">
            {isMe ? (
              <>
                <button className="btn-secondary" onClick={openProfileEdit}>
                  <Icon name="edit" size={18} /> Edit profile
                </button>
                {!me.verified && (
                  <button className="btn-primary btn-inline" onClick={openVerify}>
                    <Icon name="shield" size={18} /> Get verified
                  </button>
                )}
              </>
            ) : (
              <>
                {friendButtons}
                <button className="btn-secondary" onClick={() => openChat(profile)}>
                  <Icon name="chat" size={18} /> Message
                </button>
                <button className="icon-btn bordered" onClick={() => setDialog("report")} title={`Report ${firstName}`}>
                  <Icon name="flag" size={18} />
                </button>
                {me.is_admin && (
                  <button className="icon-btn bordered danger" onClick={() => setDialog("ban")} title={profile.banned ? "Unsuspend" : "Suspend user"}>
                    <Icon name="ban" size={18} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="tabs">
          {[
            ["posts", "Posts"],
            ["reviews", `Reviews${profile.rating.count ? ` (${profile.rating.count})` : ""}`],
            ["friends", `Friends (${profile.friend_count})`],
          ].map(([key, label]) => (
            <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="profile-content">
        {tab === "posts" && (
          <>
            {posts === null && <div className="card skeleton" />}
            {posts?.length === 0 && (
              <div className="card empty">
                <div className="empty-emoji">📭</div>
                <p className="muted">{isMe ? "You haven't posted anything yet. Tap + to sell something." : `${firstName} hasn't posted anything yet.`}</p>
              </div>
            )}
            {posts?.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                onChange={(u) => setPosts(posts.map((x) => (x.id === u.id ? u : x)))}
                onDelete={(id) => {
                  setPosts(posts.filter((x) => x.id !== id));
                  loadProfile();
                }}
              />
            ))}
          </>
        )}

        {tab === "reviews" && (
          <div className="card list-card">
            {ratings === null && <p className="muted">Loading...</p>}
            {ratings?.length === 0 && (
              <p className="muted empty-line">
                No reviews yet. Reviews appear after a seller marks an item as sold to a buyer, and the buyer rates the deal.
              </p>
            )}
            {ratings?.map((r) => (
              <div className="review" key={r.id}>
                <a href={`#/profile/${r.rater?.id}`}>
                  <Avatar user={r.rater} size={40} />
                </a>
                <div>
                  <div className="review-top">
                    <strong>{r.rater?.name}</strong>
                    <Stars value={r.stars} size={14} />
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  <span className="muted small">
                    Bought “{r.post_title}” · {timeAgo(r.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "friends" && (
          <div className="card list-card">
            {friends === null && <p className="muted">Loading...</p>}
            {friends?.length === 0 && <p className="muted empty-line">No friends yet.</p>}
            <div className="people-grid">
              {friends?.map((f) => (
                <a key={f.id} className="person-tile" href={`#/profile/${f.id}`}>
                  <Avatar user={f} size={64} />
                  <span>
                    {f.name}
                    {f.verified && <VerifiedBadge size={14} />}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {dialog === "report" && <ReportModal userId={userId} name={firstName} onClose={() => setDialog(null)} />}
      {dialog === "unfriend" && (
        <ConfirmDialog
          title={`Unfriend ${firstName}?`}
          text="You can add them again later."
          confirmLabel="Unfriend"
          danger
          onConfirm={() => friendAction("DELETE")}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "ban" && (
        <ConfirmDialog
          title={profile.banned ? `Unsuspend ${firstName}?` : `Suspend ${firstName}?`}
          text={profile.banned ? "They will be able to log in again." : "They will be logged out and can't log in. Their posts will be hidden."}
          confirmLabel={profile.banned ? "Unsuspend" : "Suspend"}
          danger={!profile.banned}
          onConfirm={toggleBan}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
