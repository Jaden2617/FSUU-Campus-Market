import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import Icon from "./Icon";

export default function ProfileModal({ call, user, onClose, onUpdated }) {
  const [form, setForm] = useState({ name: user.name, contact: user.contact });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  // Close the window with the Esc key
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(action, successText) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      onUpdated(await action());
      setMessage(successText);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handlePhoto(e) {
    const file = e.target.files[0];
    e.target.value = ""; // lets you pick the same file again later
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be smaller than 5 MB");
      return;
    }
    const data = new FormData();
    data.append("photo", file);
    run(() => call("/me/avatar", { method: "POST", form: data }), "Profile picture updated!");
  }

  function removePhoto() {
    run(() => call("/me/avatar", { method: "DELETE" }), "Profile picture removed.");
  }

  function saveProfile(e) {
    e.preventDefault();
    run(() => call("/me", { method: "PATCH", body: form }), "Profile saved!");
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card modal profile-modal" onSubmit={saveProfile}>
        <header className="modal-head">
          <h2>Your profile</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="profile-photo">
          <button
            type="button"
            className="avatar-edit"
            onClick={() => fileInput.current.click()}
            disabled={busy}
            title="Change profile picture"
          >
            <Avatar user={user} size={120} />
            <span className="avatar-edit-icon">
              <Icon name="camera" size={20} />
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhoto}
            hidden
          />
          <div className="profile-photo-actions">
            <button type="button" className="btn-secondary" onClick={() => fileInput.current.click()} disabled={busy}>
              <Icon name="camera" size={18} />
              {user.avatar_url ? "Change photo" : "Upload photo"}
            </button>
            {user.avatar_url && (
              <button type="button" className="link-btn danger" onClick={removePhoto} disabled={busy}>
                Remove photo
              </button>
            )}
          </div>
          <p className="muted small">A clear photo of your face helps buyers trust you.</p>
        </div>

        <label className="field">
          <span>Full name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Contact (FB name or phone)</span>
          <input
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>FSUU email</span>
          <input value={user.email} disabled />
        </label>

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}

        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
