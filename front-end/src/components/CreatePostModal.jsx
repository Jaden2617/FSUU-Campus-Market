import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "../api";
import Avatar from "./Avatar";
import Icon from "./Icon";

export default function CreatePostModal({ call, user, defaultType, onClose, onCreated }) {
  const [type, setType] = useState(defaultType);
  const [form, setForm] = useState({ title: "", price: "", category: "Food", description: "" });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);

  const isLooking = type === "looking";

  // Close the window with the Esc key
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be smaller than 5 MB");
      return;
    }
    setError("");
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhoto(null);
    setPreview("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const data = new FormData();
    data.append("type", type);
    data.append("title", form.title);
    data.append("category", form.category);
    data.append("description", form.description);
    if (form.price !== "") data.append("price", form.price);
    if (photo) data.append("photo", photo);

    try {
      const post = await call("/posts", { method: "POST", form: data });
      onCreated(post);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card modal" onSubmit={handleSubmit}>
        <header className="modal-head">
          <h2>Create post</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal-user">
          <Avatar user={user} size={40} />
          <div>
            <strong>{user.name}</strong>
            <span className="muted small">Buyers contact you here or at {user.contact}</span>
          </div>
        </div>

        <div className="type-toggle">
          <button
            type="button"
            className={!isLooking ? "active" : ""}
            onClick={() => setType("selling")}
          >
            <Icon name="tag" size={18} /> I'm selling
          </button>
          <button
            type="button"
            className={isLooking ? "active" : ""}
            onClick={() => setType("looking")}
          >
            <Icon name="look" size={18} /> I'm looking for
          </button>
        </div>

        <label className="upload-box">
          {preview ? (
            <img src={preview} alt="Preview" />
          ) : (
            <span className="upload-hint">
              <Icon name="camera" size={28} />
              {isLooking ? "Add a sample photo (optional)" : "Add a photo of your item"}
            </span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhoto}
            hidden
          />
        </label>
        {preview && (
          <button type="button" className="link-btn small" onClick={clearPhoto}>
            Remove photo
          </button>
        )}

        <input
          name="title"
          placeholder={isLooking ? "What are you looking for? (e.g. Calculus book)" : "Item name"}
          value={form.title}
          onChange={handleChange}
          required
          autoFocus
        />
        <div className="row-2">
          <input
            name="price"
            type="number"
            min="0"
            placeholder={isLooking ? "Budget ₱ (optional)" : "Price ₱"}
            value={form.price}
            onChange={handleChange}
            required={!isLooking}
          />
          <select name="category" value={form.category} onChange={handleChange}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <textarea
          name="description"
          placeholder={isLooking ? "Add details: condition, size, when you need it..." : "Describe your item: condition, meetup spot..."}
          value={form.description}
          onChange={handleChange}
        />

        {error && <p className="error">{error}</p>}

        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "Posting..." : "Post"}
        </button>
      </form>
    </div>
  );
}
