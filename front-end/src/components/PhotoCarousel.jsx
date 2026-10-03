import { useEffect, useRef, useState } from "react";
import { imageUrl } from "../api";
import Icon from "./Icon";

// Swipeable photos (swipe on phones, arrows on laptops). Tap to view full size.
export default function PhotoCarousel({ photos, alt }) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState(false);
  const track = useRef(null);

  function goTo(i) {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (!photos?.length) return null;
  const many = photos.length > 1;

  return (
    <div className="carousel">
      <div className="carousel-track" ref={track} onScroll={onScroll}>
        {photos.map((url, i) => (
          <button key={url} className="carousel-slide" onClick={() => setViewer(true)} aria-label={`Photo ${i + 1}`}>
            <img src={imageUrl(url)} alt={`${alt} (${i + 1})`} loading="lazy" />
          </button>
        ))}
      </div>
      {many && (
        <>
          {index > 0 && (
            <button className="carousel-arrow left" onClick={() => goTo(index - 1)} aria-label="Previous photo">
              <Icon name="back" size={20} />
            </button>
          )}
          {index < photos.length - 1 && (
            <button className="carousel-arrow right" onClick={() => goTo(index + 1)} aria-label="Next photo">
              <Icon name="next" size={20} />
            </button>
          )}
          <div className="carousel-dots">
            {photos.map((url, i) => (
              <span key={url} className={i === index ? "on" : ""} />
            ))}
          </div>
          <span className="carousel-count">
            {index + 1}/{photos.length}
          </span>
        </>
      )}
      {viewer && <PhotoViewer photos={photos} start={index} onClose={() => setViewer(false)} />}
    </div>
  );
}

function PhotoViewer({ photos, start, onClose }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, photos.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, onClose]);

  return (
    <div className="viewer" onClick={onClose}>
      <img src={imageUrl(photos[i])} alt="" onClick={(e) => e.stopPropagation()} />
      <button className="viewer-close" onClick={onClose} aria-label="Close">
        <Icon name="close" size={26} />
      </button>
      {i > 0 && (
        <button className="viewer-arrow left" onClick={(e) => { e.stopPropagation(); setI(i - 1); }} aria-label="Previous">
          <Icon name="back" size={28} />
        </button>
      )}
      {i < photos.length - 1 && (
        <button className="viewer-arrow right" onClick={(e) => { e.stopPropagation(); setI(i + 1); }} aria-label="Next">
          <Icon name="next" size={28} />
        </button>
      )}
    </div>
  );
}
