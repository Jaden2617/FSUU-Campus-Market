import { useEffect, useRef, useState } from "react";
import { useApp } from "../context";
import { imageUrl } from "../api";
import Avatar from "./Avatar";
import Icon from "./Icon";
import Modal from "./Modal";

// Create a new post, or edit one (when `post` is given)
export default function PostEditor({ post, defaultType = "selling", onClose, onSaved }) {
  const { call, user, config } = useApp();
  const editing = Boolean(post);
  const [type, setType] = useState(post?.type || defaultType);
  const [form, setForm] = useState({
    title: post?.title || "",
    price: post?.price ?? "",
    category: post?.category || config.categories[0],
    description: post?.description || "",
    meetup_spot: post?.meetup_spot || "",
  });
  const [kept, setKept] = useState(post?.photos || []); // photos already uploaded
  const [added, setAdded] = useState([]); // new photos: { file, preview }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef(null);

  const isLooking = type === "looking";
  const max = config.max_photos || 4;
  const total = kept.length + added.length;

  useEffect(() => () => added.forEach((a) => URL.revokeObjectURL(a.preview)), [added]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function addPhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) {
      setError("Each photo must be smaller than 10 MB");
      return;
    }
    const room = max - total;
    if (files.length > room) setError(`You can add up to ${max} photos`);
    else setError("");
    setAdded([...added, ...files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
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
    data.append("price", form.price === null ? "" : String(form.price));
    if (form.meetup_spot) data.append("meetup_spot", form.meetup_spot);
    if (editing) data.append("keep_photos", JSON.stringify(kept));
    added.forEach((a) => data.append("photos", a.file));

    try {
      const saved = await call(editing ? `/posts/${post.id}` : "/posts", { method: editing ? "PUT" : "POST", form: data });
      onSaved(saved, !editing);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "Edit post" : "Create post"} onClose={onClose} as="form" onSubmit={handleSubmit}>
      <div className="modal-user">
        <Avatar user={user} size={40} />
        <div>
          <strong>{user.name}</strong>
          <span className="muted small">
            Buyers can message you here{user.contact ? ` or at ${user.contact}` : ""}
          </span>
        </div>
      </div>

      <div className="type-toggle">
        <button type="button" className={!isLooking ? "active" : ""} onClick={() => setType("selling")}>
          <Icon name="tag" size={18} /> I'm selling
        </button>
        <button type="button" className={isLooking ? "active" : ""} onClick={() => setType("looking")}>
          <Icon name="look" size={18} /> I'm looking for
        </button>
      </div>

      <div className="photo-grid">
        {kept.map((url) => (
          <div className="photo-thumb" key={url}>
            <img src={imageUrl(url)} alt="" />
            <button type="button" onClick={() => setKept(kept.filter((u) => u !== url))} title="Remove photo">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        {added.map((a) => (
          <div className="photo-thumb" key={a.preview}>
            <img src={a.preview} alt="" />
            <button type="button" onClick={() => setAdded(added.filter((x) => x !== a))} title="Remove photo">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        {total < max && (
          <button type="button" className={`photo-add ${total === 0 ? "big" : ""}`} onClick={() => fileInput.current.click()}>
            <Icon name="camera" size={total === 0 ? 30 : 22} />
            <span>{total === 0 ? (isLooking ? "Add a sample photo (optional)" : "Add photos of your item") : "Add"}</span>
            <span className="muted small">
              {total}/{max}
            </span>
          </button>
        )}
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} hidden />
      </div>

      <input
        name="title"
        placeholder={isLooking ? "What are you looking for? (e.g. Calculus book)" : "Item name"}
        value={form.title}
        onChange={handleChange}
        required
        maxLength={120}
      />
      <div className="row-2">
        <input
          name="price"
          type="number"
          min="0"
          step="any"
          placeholder={isLooking ? "Budget ₱ (optional)" : "Price ₱"}
          value={form.price ?? ""}
          onChange={handleChange}
          required={!isLooking}
        />
        <select name="category" value={form.category} onChange={handleChange}>
          {config.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <label className="field">
        <span>
          <Icon name="pin" size={14} /> Meetup spot on campus
        </span>
        <select name="meetup_spot" value={form.meetup_spot} onChange={handleChange}>
          <option value="">Choose a safe meetup spot (optional)</option>
          {config.meetup_spots.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <textarea
        name="description"
        placeholder={isLooking ? "Add details: condition, size, when you need it..." : "Describe your item: condition, size, inclusions..."}
        value={form.description}
        onChange={handleChange}
      />

      {error && <p className="error">{error}</p>}

      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? (editing ? "Saving..." : "Posting...") : editing ? "Save changes" : "Post"}
      </button>
    </Modal>
  );
}
