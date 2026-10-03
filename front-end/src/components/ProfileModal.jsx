import { useRef, useState } from "react";
import { useApp } from "../context";
import Avatar from "./Avatar";
import Icon from "./Icon";
import Modal from "./Modal";

export default function ProfileModal({ onClose }) {
  const { call, user, updateUser } = useApp();
  const [form, setForm] = useState({ name: user.name, contact: user.contact, bio: user.bio || "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  async function run(action, successText) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      updateUser(await action());
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
    if (file.size > 10 * 1024 * 1024) {
      setError("Photo must be smaller than 10 MB");
      return;
    }
    const data = new FormData();
    data.append("photo", file);
    run(() => call("/me/avatar", { method: "POST", form: data }), "Profile picture updated!");
  }

  function saveProfile(e) {
    e.preventDefault();
    run(() => call("/me", { method: "PATCH", body: form }), "Profile saved!");
  }

  return (
    <Modal title="Edit profile" onClose={onClose} as="form" onSubmit={saveProfile}>
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
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} hidden />
        <div className="profile-photo-actions">
          <button type="button" className="btn-secondary" onClick={() => fileInput.current.click()} disabled={busy}>
            <Icon name="camera" size={18} />
            {user.avatar_url ? "Change photo" : "Upload photo"}
          </button>
          {user.avatar_url && (
            <button
              type="button"
              className="link-btn danger"
              onClick={() => run(() => call("/me/avatar", { method: "DELETE" }), "Profile picture removed.")}
              disabled={busy}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span>Full name</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} />
      </label>
      <label className="field">
        <span>Contact (FB name or phone)</span>
        <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} required maxLength={80} />
      </label>
      <label className="field">
        <span>Bio</span>
        <textarea
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          placeholder="e.g. BSIT 3 • I sell ube pandesal every Friday"
          maxLength={300}
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
    </Modal>
  );
}
