"""Small shared tools used by all the routes."""
import io

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func

from auth import is_admin
from database import (
    Photo, Post, PostPhoto, Comment, Reaction, SavedPost, Rating, Notification, utc_now,
)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10 MB (photos are shrunk before saving)


# ---------- Times ----------

def iso_time(dt):
    """Sends the time with a "Z" so the browser knows it's UTC."""
    return dt.isoformat() + "Z" if dt else None


def is_active_until(dt):
    return bool(dt and dt > utc_now())


# ---------- Photos ----------

async def save_photo(photo: UploadFile, db, max_side=1280):
    """Checks a photo, shrinks it, saves it in the database, and returns its address."""
    if photo.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Photo must be JPG, PNG, or WEBP")
    contents = await photo.read()
    if len(contents) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail="Photo must be smaller than 10 MB")
    try:
        image = Image.open(io.BytesIO(contents))
        image = ImageOps.exif_transpose(image)  # keeps phone photos the right way up
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="That file is not a valid photo")

    image.thumbnail((max_side, max_side))  # shrink big phone photos
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=82, optimize=True)

    saved = Photo(data=output.getvalue(), content_type="image/jpeg")
    db.add(saved)
    db.flush()  # gives the photo its id
    return f"/photos/{saved.id}"


def delete_photo(image_url, db):
    if image_url and image_url.startswith("/photos/"):
        photo = db.get(Photo, int(image_url.rsplit("/", 1)[1]))
        if photo:
            db.delete(photo)


# ---------- People ----------

def public_user(user):
    if user is None:
        return None
    return {
        "id": user.id,
        "name": user.name,
        "contact": user.contact,
        "avatar_url": user.avatar_url,
        "verified": is_active_until(user.verified_until),
    }


def user_info(user):
    """Everything about yourself (sent only to you)."""
    return {
        **public_user(user),
        "email": user.email,
        "bio": user.bio or "",
        "is_admin": is_admin(user),
        "verified_until": iso_time(user.verified_until),
        "created_at": iso_time(user.created_at),
    }


def notify(db, user_id, type, text, actor=None, post_id=None):
    """Adds a notification (never notifies you about your own actions)."""
    if actor is not None and actor.id == user_id:
        return
    db.add(Notification(
        user_id=user_id,
        actor_id=actor.id if actor else None,
        type=type,
        text=text,
        post_id=post_id,
    ))


def seller_rating(db, user_id):
    avg, count = db.query(func.avg(Rating.stars), func.count(Rating.id)).filter(Rating.seller_id == user_id).one()
    return {"average": round(float(avg), 1) if avg else None, "count": count}


# ---------- Posts ----------

def posts_info(posts, me, db):
    """Turns many posts into what the feed needs, using only a few
    database queries (fast even with lots of posts)."""
    if not posts:
        return []
    ids = [p.id for p in posts]

    reactions = {}
    my_reactions = {}
    for r in db.query(Reaction).filter(Reaction.post_id.in_(ids)).all():
        reactions.setdefault(r.post_id, {})
        reactions[r.post_id][r.emoji] = reactions[r.post_id].get(r.emoji, 0) + 1
        if r.user_id == me.id:
            my_reactions[r.post_id] = r.emoji

    comment_counts = dict(
        db.query(Comment.post_id, func.count(Comment.id))
        .filter(Comment.post_id.in_(ids)).group_by(Comment.post_id).all()
    )

    photos = {}
    for ph in db.query(PostPhoto).filter(PostPhoto.post_id.in_(ids)).order_by(PostPhoto.position).all():
        photos.setdefault(ph.post_id, []).append(ph.url)

    saved = {s.post_id for s in db.query(SavedPost).filter(SavedPost.user_id == me.id, SavedPost.post_id.in_(ids))}
    rated = {r.post_id for r in db.query(Rating).filter(Rating.rater_id == me.id, Rating.post_id.in_(ids))}

    result = []
    for post in posts:
        post_photos = photos.get(post.id) or ([post.image_url] if post.image_url else [])
        counts = reactions.get(post.id, {})
        is_buyer = post.buyer_id == me.id
        result.append({
            "id": post.id,
            "type": post.type,
            "title": post.title,
            "price": post.price,
            "category": post.category,
            "description": post.description,
            "meetup_spot": post.meetup_spot,
            "photos": post_photos,
            "image_url": post_photos[0] if post_photos else None,
            "status": post.status,
            "hidden": bool(post.hidden),
            "boosted": is_active_until(post.boosted_until),
            "boosted_until": iso_time(post.boosted_until),
            "created_at": iso_time(post.created_at),
            "edited": post.updated_at is not None,
            "user": public_user(post.user),
            "reactions": counts,
            "reaction_total": sum(counts.values()),
            "my_reaction": my_reactions.get(post.id),
            "comment_count": comment_counts.get(post.id, 0),
            "saved": post.id in saved,
            "is_mine": post.user_id == me.id,
            "is_buyer": is_buyer,
            "can_rate": is_buyer and post.status == "sold" and post.id not in rated,
        })
    return result


def post_info(post, me, db):
    return posts_info([post], me, db)[0]


def get_post_or_404(post_id, db, me=None):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.hidden and me is not None and post.user_id != me.id and not is_admin(me):
        raise HTTPException(status_code=404, detail="Post not found")
    return post
