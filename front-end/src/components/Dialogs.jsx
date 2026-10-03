import { useEffect, useState } from "react";
import { useApp } from "../context";
import { longDate, peso } from "../api";
import Avatar from "./Avatar";
import Modal, { Stars } from "./Modal";
import Icon from "./Icon";

// "Are you sure?" pop-up
export function ConfirmDialog({ title, text, confirmLabel = "Yes", danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="dialog-text">{text}</p>
      <div className="dialog-actions">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className={danger ? "btn-danger" : "btn-primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// Seller picks who bought the item, so the buyer can leave a rating
export function MarkSoldModal({ post, onClose, onDone }) {
  const { call } = useApp();
  const [buyers, setBuyers] = useState(null);
  const [buyerId, setBuyerId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    call(`/posts/${post.id}/buyers`).then(setBuyers).catch(() => setBuyers([]));
  }, [call, post.id]);

  async function confirm() {
    try {
      onDone(await call(`/posts/${post.id}/status`, {
        method: "PATCH",
        body: { status: "sold", buyer_id: buyerId ? Number(buyerId) : null },
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Mark as sold" onClose={onClose}>
      <p className="dialog-text">Who bought <strong>{post.title}</strong>? They'll be asked to rate you.</p>
      {buyers === null && <p className="muted">Loading...</p>}
      <div className="pick-list">
        {buyers?.map((b) => (
          <label key={b.id} className={`pick ${String(b.id) === buyerId ? "on" : ""}`}>
            <input type="radio" name="buyer" value={b.id} checked={String(b.id) === buyerId} onChange={(e) => setBuyerId(e.target.value)} />
            <Avatar user={b} size={36} />
            <span>{b.name}</span>
          </label>
        ))}
        <label className={`pick ${buyerId === "" ? "on" : ""}`}>
          <input type="radio" name="buyer" value="" checked={buyerId === ""} onChange={() => setBuyerId("")} />
          <span className="pick-icon"><Icon name="user" size={18} /></span>
          <span>Someone else / not on Urios Market</span>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={confirm}>Mark as sold</button>
      </div>
    </Modal>
  );
}

export function RateModal({ post, onClose, onDone }) {
  const { call, toast } = useApp();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!stars) {
      setError("Tap the stars to rate");
      return;
    }
    try {
      onDone(await call(`/posts/${post.id}/rate`, { method: "POST", body: { stars, comment } }));
      toast("Thanks for rating!");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={`Rate ${post.user.name.split(" ")[0]}`} onClose={onClose} as="form" onSubmit={submit}>
      <p className="dialog-text">How was your deal for <strong>{post.title}</strong>?</p>
      <div className="rate-stars">
        <Stars value={stars} onChange={setStars} size={34} />
      </div>
      <textarea placeholder="Say something about the seller (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button className="btn-primary" type="submit">Submit rating</button>
    </Modal>
  );
}

export function ReportModal({ postId, userId, name, onClose }) {
  const { call, config, toast } = useApp();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!reason) {
      setError("Please choose a reason");
      return;
    }
    try {
      await call("/reports", { method: "POST", body: { post_id: postId || null, user_id: userId || null, reason, details } });
      toast("Report sent. Thanks for keeping Urios Market safe!");
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={postId ? "Report post" : `Report ${name || "user"}`} onClose={onClose} as="form" onSubmit={submit}>
      <p className="dialog-text">Why are you reporting this? Admins will review it. The person won't know who reported.</p>
      <div className="pick-list">
        {config.report_reasons.map((r) => (
          <label key={r} className={`pick ${reason === r ? "on" : ""}`}>
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
            <span>{r}</span>
          </label>
        ))}
      </div>
      <textarea placeholder="More details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button className="btn-danger" type="submit">Send report</button>
    </Modal>
  );
}

// GCash payment for boosting a post or getting the Verified Seller badge
export function PaymentModal({ kind, post, onClose }) {
  const { call, config, toast, user } = useApp();
  const plans = config.boost_plans || [];
  const [days, setDays] = useState(plans[0]?.days || 1);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [mine, setMine] = useState(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    call("/payments/mine").then(setMine).catch(() => {});
  }, [call]);

  const isBoost = kind === "boost";
  const amount = isBoost ? plans.find((p) => p.days === days)?.price : config.verified_price;
  const pending = mine?.payments.find(
    (p) => p.status === "pending" && p.kind === kind && (!isBoost || p.post_id === post?.id)
  );

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await call("/payments", { method: "POST", body: { kind, post_id: post?.id, days: isBoost ? days : null, reference } });
      setSent(true);
      toast("Payment sent! The admin will confirm it soon.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={isBoost ? "Boost your post" : "Verified Seller badge"} onClose={onClose} as="form" onSubmit={submit}>
      {isBoost ? (
        <p className="dialog-text">
          <Icon name="bolt" size={16} /> Show <strong>{post.title}</strong> at the top of everyone's feed.
        </p>
      ) : (
        <p className="dialog-text">
          Get a blue check next to your name for {config.verified_days} days. Buyers trust verified sellers more.
          {mine?.verified && (
            <span className="success block-gap">You're verified until {longDate(mine.verified_until)}. Paying again adds more days.</span>
          )}
        </p>
      )}

      {sent || pending ? (
        <div className="success">
          {sent ? "Sent! " : ""}Your payment (ref {sent ? reference : pending.reference}) is waiting for the admin to confirm.
          You'll get a notification when it's approved.
        </div>
      ) : (
        <>
          {isBoost && (
            <div className="plan-list">
              {plans.map((p) => (
                <button type="button" key={p.days} className={`plan ${days === p.days ? "on" : ""}`} onClick={() => setDays(p.days)}>
                  <strong>{p.days} day{p.days > 1 ? "s" : ""}</strong>
                  <span>{peso(p.price)}</span>
                </button>
              ))}
            </div>
          )}

          <ol className="steps-list">
            <li>
              Open GCash and send <strong>{peso(amount || 0)}</strong> to <strong>{config.gcash_number}</strong> ({config.gcash_name}).
            </li>
            <li>Copy the <strong>Reference No.</strong> from your GCash receipt.</li>
            <li>Paste it below. The admin will check it and turn on your {isBoost ? "boost" : "badge"}.</li>
          </ol>
          <input
            placeholder="GCash reference number (e.g. 1234 567 890123)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            inputMode="numeric"
            required
          />
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" type="submit">
            I've paid {peso(amount || 0)}
          </button>
          <p className="muted small center">Paying as {user.name}</p>
        </>
      )}
    </Modal>
  );
}
