import { useEffect, useState } from "react";
import { useApp } from "../context";
import { navigate } from "../router";
import PostCard from "./PostCard";
import Icon from "./Icon";

// One post on its own page (opened from a notification or a shared link)
export default function PostPage({ postId }) {
  const { call, postEvent } = useApp();
  const [post, setPost] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    call(`/posts/${postId}`).then(setPost).catch((err) => setError(err.message));
  }, [call, postId]);

  useEffect(() => {
    if (postEvent && postEvent.post.id === postId) setPost(postEvent.post);
  }, [postEvent, postId]);

  return (
    <div className="page-narrow">
      <button className="back-link" onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}>
        <Icon name="back" size={18} /> Back
      </button>
      {error && (
        <div className="card empty">
          <div className="empty-emoji">🔍</div>
          <h3>This post isn't available</h3>
          <p className="muted">It may have been deleted or hidden.</p>
        </div>
      )}
      {!post && !error && <div className="card skeleton" />}
      {post && <PostCard post={post} onChange={setPost} onDelete={() => navigate("/")} startWithComments />}
    </div>
  );
}
