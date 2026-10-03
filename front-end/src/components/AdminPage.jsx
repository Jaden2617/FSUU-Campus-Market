import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { imageUrl, peso, timeAgo } from "../api";
import Avatar from "./Avatar";
import Icon from "./Icon";

const TABS = [
  ["stats", "Stats", "chart"],
  ["reports", "Reports", "flag"],
  ["payments", "GCash", "bolt"],
  ["ads", "Ads", "megaphone"],
  ["users", "Users", "users"],
];

export default function AdminPage() {
  const { call } = useApp();
  const [tab, setTab] = useState("stats");
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(() => {
    call("/admin/stats").then(setStats).catch(() => {});
  }, [call]);

  useEffect(() => {
    loadStats();
  }, [loadStats, tab]);

  const counts = { reports: stats?.totals.open_reports, payments: stats?.totals.pending_payments };

  return (
    <div className="admin-page">
      <div className="card admin-head">
        <h1>
          <Icon name="shield" size={24} /> Admin dashboard
        </h1>
        <div className="tabs">
          {TABS.map(([key, label, icon]) => (
            <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              <Icon name={icon} size={17} /> {label}
              {counts[key] > 0 && <span className="count">{counts[key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === "stats" && <StatsTab stats={stats} />}
      {tab === "reports" && <ReportsTab onChange={loadStats} />}
      {tab === "payments" && <PaymentsTab onChange={loadStats} />}
      {tab === "ads" && <AdsTab />}
      {tab === "users" && <UsersTab />}
    </div>
  );
}

// ---------------- Stats ----------------

function StatTile({ label, value, sub }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

function StatsTab({ stats }) {
  if (!stats) return <div className="card skeleton tall" />;
  const t = stats.totals;
  return (
    <>
      <div className="stat-grid">
        <StatTile label="Users" value={t.users} sub={`+${t.new_users_week} this week`} />
        <StatTile label="Posts" value={t.posts} sub={`+${t.new_posts_week} this week`} />
        <StatTile label="For sale now" value={t.active_listings} sub={`${t.looking_for} looking-for posts`} />
        <StatTile label="Sold / found" value={t.sold} sub={`${t.ratings} ratings given`} />
        <StatTile label="Messages" value={t.messages} sub={`${t.comments} comments`} />
        <StatTile label="Reactions" value={t.reactions} sub={`${t.friendships} friendships`} />
        <StatTile label="Revenue" value={peso(t.revenue)} sub="approved boosts + badges" />
        <StatTile label="Needs review" value={t.open_reports + t.pending_payments} sub={`${t.open_reports} reports · ${t.pending_payments} payments`} />
      </div>

      <div className="chart-grid">
        <div className="card chart-card">
          <h3>New posts per day</h3>
          <p className="muted small">Last 14 days</p>
          <BarChart data={stats.posts_per_day} unit="post" />
        </div>
        <div className="card chart-card">
          <h3>New users per day</h3>
          <p className="muted small">Last 14 days</p>
          <BarChart data={stats.users_per_day} unit="user" />
        </div>
      </div>

      <div className="card chart-card">
        <h3>Posts by category</h3>
        {stats.categories.length === 0 && <p className="muted">No posts yet.</p>}
        <div className="hbars">
          {stats.categories.map((c) => {
            const max = stats.categories[0].count || 1;
            return (
              <div className="hbar-row" key={c.name} title={`${c.name}: ${c.count}`}>
                <span className="hbar-label">{c.name}</span>
                <span className="hbar-track">
                  <span className="hbar" style={{ width: `${Math.max(2, (c.count / max) * 100)}%` }} />
                </span>
                <span className="hbar-value">{c.count}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted small center">Use these numbers for the Key Metrics box of your Lean Canvas.</p>
    </>
  );
}

// Simple bar chart (one color, hover a bar to see the number)
function BarChart({ data, unit }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const label = (d) => new Date(`${d.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="bar-chart" role="img" aria-label={`${total} ${unit}s in the last 14 days`}>
      <div className="bar-area">
        <span className="bar-max">{max}</span>
        {data.map((d, i) => (
          <div
            key={d.date}
            className="bar-slot"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onClick={() => setHover(i)}
          >
            <div className={`bar ${hover === i ? "hover" : ""}`} style={{ height: d.count ? `max(3px, ${(d.count / max) * 100}%)` : 0 }} />
            {hover === i && (
              <div className="bar-tip">
                <strong>{d.count}</strong> {unit}
                {d.count === 1 ? "" : "s"}
                <span>{label(d)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="bar-axis">
        <span>{label(data[0])}</span>
        <span>{label(data[data.length - 1])}</span>
      </div>
    </div>
  );
}

// ---------------- Reports ----------------

function ReportsTab({ onChange }) {
  const { call, toast } = useApp();
  const [status, setStatus] = useState("open");
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    call(`/admin/reports?status=${status}`).then(setItems).catch(() => setItems([]));
  }, [call, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id, action, message) {
    try {
      await call(`/admin/reports/${id}`, { method: "POST", body: { action } });
      toast(message);
      load();
      onChange();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div className="card list-card">
      <div className="filter-row">
        {["open", "resolved", "dismissed"].map((s) => (
          <button key={s} className={`chip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {items === null && <p className="muted">Loading...</p>}
      {items?.length === 0 && <p className="muted empty-line">No {status} reports. 🎉</p>}
      {items?.map((r) => (
        <div className="admin-item" key={r.id}>
          <div className="admin-item-top">
            <span className="pill danger">{r.reason}</span>
            <span className="muted small">{timeAgo(r.created_at)}</span>
          </div>
          {r.post && (
            <a className="admin-post" href={`#/post/${r.post.id}`}>
              {r.post.image_url && <img src={imageUrl(r.post.image_url)} alt="" />}
              <span>
                Post: <strong>{r.post.title}</strong> {r.post.hidden && <em className="muted">(hidden)</em>}
              </span>
            </a>
          )}
          {r.reported_user && (
            <p className="small">
              Reported user: <a href={`#/profile/${r.reported_user.id}`}>{r.reported_user.name}</a>
              {r.reported_user_banned && <em className="muted"> (suspended)</em>}
            </p>
          )}
          {r.details && <p className="admin-details">“{r.details}”</p>}
          <p className="muted small">
            Reported by <a href={`#/profile/${r.reporter.id}`}>{r.reporter.name}</a>
          </p>
          {status === "open" && (
            <div className="row-actions">
              {r.post && !r.post.hidden && (
                <button className="btn-danger btn-sm" onClick={() => act(r.id, "hide_post", "Post hidden")}>
                  <Icon name="eyeOff" size={15} /> Hide post
                </button>
              )}
              {r.reported_user && !r.reported_user_banned && (
                <button className="btn-danger btn-sm" onClick={() => act(r.id, "ban_user", "User suspended")}>
                  <Icon name="ban" size={15} /> Suspend user
                </button>
              )}
              <button className="btn-secondary btn-sm" onClick={() => act(r.id, "resolve", "Marked as resolved")}>
                Resolved
              </button>
              <button className="btn-secondary btn-sm" onClick={() => act(r.id, "dismiss", "Report dismissed")}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- GCash payments ----------------

function PaymentsTab({ onChange }) {
  const { call, toast, config } = useApp();
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    call(`/admin/payments?status=${status}`).then(setItems).catch(() => setItems([]));
  }, [call, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id, action) {
    try {
      await call(`/admin/payments/${id}`, { method: "POST", body: { action } });
      toast(action === "approve" ? "Approved and turned on" : "Payment rejected");
      load();
      onChange();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div className="card list-card">
      <p className="muted small">
        Check your GCash app ({config.gcash_number}) for each reference number before approving.
      </p>
      <div className="filter-row">
        {["pending", "approved", "rejected"].map((s) => (
          <button key={s} className={`chip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {items === null && <p className="muted">Loading...</p>}
      {items?.length === 0 && <p className="muted empty-line">No {status} payments.</p>}
      {items?.map((p) => (
        <div className="admin-item payment-item" key={p.id}>
          <Avatar user={p.user} size={44} />
          <div className="payment-info">
            <strong>{p.user?.name}</strong>
            <span>
              {p.kind === "boost" ? (
                <>
                  <Icon name="bolt" size={14} /> Boost {p.days} day{p.days > 1 ? "s" : ""}: {p.post_title || "(deleted post)"}
                </>
              ) : (
                <>
                  <Icon name="shield" size={14} /> Verified Seller badge ({p.days} days)
                </>
              )}
            </span>
            <span className="muted small">
              Ref <code>{p.reference}</code> · {timeAgo(p.created_at)}
            </span>
          </div>
          <strong className="payment-amount">{peso(p.amount)}</strong>
          {status === "pending" && (
            <div className="row-actions">
              <button className="btn-primary btn-sm" onClick={() => act(p.id, "approve")}>Approve</button>
              <button className="btn-secondary btn-sm" onClick={() => act(p.id, "reject")}>Reject</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- Ads ----------------

function AdsTab() {
  const { call, toast } = useApp();
  const [ads, setAds] = useState(null);
  const [form, setForm] = useState({ business_name: "", title: "", text: "", link_url: "" });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  const load = useCallback(() => {
    call("/admin/ads").then(setAds).catch(() => setAds([]));
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setError("");
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => data.append(k, v));
    if (photo) data.append("photo", photo);
    try {
      await call("/admin/ads", { method: "POST", form: data });
      setForm({ business_name: "", title: "", text: "", link_url: "" });
      setPhoto(null);
      toast("Ad published");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggle(ad) {
    await call(`/admin/ads/${ad.id}`, { method: "PATCH", body: { value: !ad.active } }).catch(() => {});
    load();
  }

  async function remove(ad) {
    await call(`/admin/ads/${ad.id}`, { method: "DELETE" }).catch(() => {});
    toast("Ad deleted");
    load();
  }

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  return (
    <>
      <form className="card list-card ad-form" onSubmit={create}>
        <h3 className="list-title">New sponsored post</h3>
        <p className="muted small">For nearby businesses (printing shops, cafés, school supplies). It shows after every 5 posts in the feed.</p>
        <input name="business_name" placeholder="Business name" value={form.business_name} onChange={change} required />
        <input name="title" placeholder="Headline (e.g. 20% off printing this week)" value={form.title} onChange={change} required />
        <textarea name="text" placeholder="Details (optional)" value={form.text} onChange={change} />
        <input name="link_url" placeholder="Link (optional, e.g. facebook.com/theirpage)" value={form.link_url} onChange={change} />
        <div className="ad-photo-row">
          <button type="button" className="btn-secondary" onClick={() => fileInput.current.click()}>
            <Icon name="image" size={18} /> {photo ? "Change photo" : "Add photo"}
          </button>
          {photo && <span className="muted small">{photo.name}</span>}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => setPhoto(e.target.files[0] || null)} />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" type="submit">Publish ad</button>
      </form>

      <div className="card list-card">
        <h3 className="list-title">All ads</h3>
        {ads?.length === 0 && <p className="muted empty-line">No ads yet.</p>}
        {ads?.map((ad) => (
          <div className="admin-item payment-item" key={ad.id}>
            {ad.image_url ? <img className="ad-thumb" src={imageUrl(ad.image_url)} alt="" /> : <span className="ad-thumb"><Icon name="megaphone" size={20} /></span>}
            <div className="payment-info">
              <strong>{ad.title}</strong>
              <span className="muted small">
                {ad.business_name} · {ad.active ? "Showing" : "Paused"}
              </span>
            </div>
            <div className="row-actions">
              <button className="btn-secondary btn-sm" onClick={() => toggle(ad)}>{ad.active ? "Pause" : "Show"}</button>
              <button className="btn-danger btn-sm" onClick={() => remove(ad)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- Users ----------------

function UsersTab() {
  const { call, toast } = useApp();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState(null);

  const load = useCallback(() => {
    call(`/admin/users?q=${encodeURIComponent(q)}`).then(setUsers).catch(() => setUsers([]));
  }, [call, q]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleBan(u) {
    try {
      await call(`/admin/users/${u.id}/ban`, { method: "POST", body: { value: !u.banned } });
      toast(u.banned ? "User unsuspended" : "User suspended");
      load();
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div className="card list-card">
      <label className="search-box">
        <Icon name="search" size={18} />
        <input placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {users === null && <p className="muted">Loading...</p>}
      {users?.map((u) => (
        <div className="admin-item payment-item" key={u.id}>
          <a href={`#/profile/${u.id}`}>
            <Avatar user={u} size={42} />
          </a>
          <div className="payment-info">
            <a href={`#/profile/${u.id}`}>
              <strong>{u.name}</strong>
            </a>
            <span className="muted small">
              {u.email} · {u.posts} post{u.posts === 1 ? "" : "s"} · joined {timeAgo(u.created_at)}
            </span>
            <span className="tag-row">
              {u.is_admin && <span className="pill">Admin</span>}
              {u.verified && <span className="pill">Verified</span>}
              {u.banned && <span className="pill danger">Suspended</span>}
              {!u.email_verified && <span className="pill">Email not verified</span>}
            </span>
          </div>
          {!u.is_admin && (
            <button className={u.banned ? "btn-secondary btn-sm" : "btn-danger btn-sm"} onClick={() => toggleBan(u)}>
              {u.banned ? "Unsuspend" : "Suspend"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
