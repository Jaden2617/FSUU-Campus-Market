"""News Feed posts: create, edit, photos, reactions, comments, save, sold, ratings."""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_

import config
from auth import get_db, get_current_user, is_admin
from database import (
    User, Post, PostPhoto, Comment, CommentReaction, Reaction, SavedPost, Rating, Message,
    Notification, Report, PaymentRequest, utc_now,
)
from helpers import (
    save_photo, delete_photo, posts_info, post_info, get_post_or_404,
    public_user, iso_time, notify,
)

router = APIRouter()
PAGE_SIZE = 20


class CommentData(BaseModel):
    text: str
    parent_id: Optional[int] = None


class ReactData(BaseModel):
    emoji: str


class StatusData(BaseModel):
    status: str
    buyer_id: Optional[int] = None


class RateData(BaseModel):
    stars: int
    comment: str = ""


def _clean_fields(type, title, price, category, meetup_spot):
    if type not in ("selling", "looking"):
        raise HTTPException(status_code=400, detail="Post type must be selling or looking")
    if not title.strip():
        raise HTTPException(status_code=400, detail="Please add a title")
    price_value = None
    if price is not None and str(price).strip() != "":
        try:
            price_value = float(price)
        except ValueError:
            raise HTTPException(status_code=400, detail="Price must be a number")
        if price_value < 0:
            raise HTTPException(status_code=400, detail="Price can't be negative")
    if type == "selling" and price_value is None:
        raise HTTPException(status_code=400, detail="Please add a price")
    if category not in config.CATEGORIES:
        category = "Others"
    if meetup_spot and meetup_spot not in config.MEETUP_SPOTS:
        meetup_spot = None
    return title.strip()[:120], price_value, category, meetup_spot or None


async def _add_photos(post, files, start_position, db):
    urls = []
    for i, file in enumerate(files):
        url = await save_photo(file, db)
        db.add(PostPhoto(post_id=post.id, url=url, position=start_position + i))
        urls.append(url)
    return urls


def _visible_posts(db, me):
    """Posts everyone can see: not hidden by admin, seller not banned."""
    return db.query(Post).join(User, Post.user_id == User.id).filter(
        or_(Post.hidden == False, Post.hidden.is_(None)),  # noqa: E712
        or_(User.banned == False, User.banned.is_(None)),  # noqa: E712
    )


# ---------- Feed ----------

@router.get("/posts")
def get_posts(
    type: str = "all",
    category: str = "All",
    q: str = "",
    saved: bool = False,
    user_id: Optional[int] = None,
    before: Optional[int] = None,
    db=Depends(get_db),
    me=Depends(get_current_user),
):
    if user_id is not None and (user_id == me.id or is_admin(me)):
        query = db.query(Post).filter(Post.user_id == user_id)  # your own profile shows hidden posts too
    else:
        query = _visible_posts(db, me)
        if user_id is not None:
            query = query.filter(Post.user_id == user_id)

    if saved:
        saved_ids = db.query(SavedPost.post_id).filter(SavedPost.user_id == me.id)
        query = query.filter(Post.id.in_(saved_ids))
    if type in ("selling", "looking"):
        query = query.filter(Post.type == type)
    if category != "All":
        query = query.filter(Post.category == category)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Post.title.ilike(like), Post.description.ilike(like)))

    # Boosted posts go on top of the main feed (first page only)
    boosted = []
    is_main_feed = user_id is None and not saved
    if is_main_feed:
        now = utc_now()
        if before is None:
            boosted = (
                query.filter(Post.boosted_until > now, Post.status == "available")
                .order_by(Post.boosted_until.desc()).limit(5).all()
            )
        boosted_ids = [p.id for p in query.filter(Post.boosted_until > now, Post.status == "available").all()]
        if boosted_ids:
            query = query.filter(Post.id.notin_(boosted_ids))

    if before is not None:
        query = query.filter(Post.id < before)
    page = query.order_by(Post.id.desc()).limit(PAGE_SIZE + 1).all()
    has_more = len(page) > PAGE_SIZE
    page = page[:PAGE_SIZE]

    return {
        "posts": posts_info(boosted + page, me, db),
        "next_before": page[-1].id if has_more and page else None,
    }


@router.get("/posts/{post_id}")
def get_post(post_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    return post_info(get_post_or_404(post_id, db, me), me, db)


# ---------- Create / edit / delete ----------

@router.post("/posts")
async def create_post(
    type: str = Form("selling"),
    title: str = Form(...),
    price: Optional[str] = Form(None),
    category: str = Form(...),
    description: str = Form(""),
    meetup_spot: Optional[str] = Form(None),
    photos: Optional[List[UploadFile]] = File(None),
    db=Depends(get_db),
    me=Depends(get_current_user),
):
    title, price_value, category, meetup_spot = _clean_fields(type, title, price, category, meetup_spot)
    files = [f for f in (photos or []) if f and f.filename]
    if len(files) > config.MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"You can add up to {config.MAX_PHOTOS} photos")

    post = Post(
        user_id=me.id, type=type, title=title, price=price_value, category=category,
        description=description.strip()[:2000], meetup_spot=meetup_spot,
    )
    db.add(post)
    db.flush()
    urls = await _add_photos(post, files, 0, db)
    post.image_url = urls[0] if urls else None
    db.commit()
    db.refresh(post)
    return post_info(post, me, db)


@router.put("/posts/{post_id}")
async def edit_post(
    post_id: int,
    type: str = Form("selling"),
    title: str = Form(...),
    price: Optional[str] = Form(None),
    category: str = Form(...),
    description: str = Form(""),
    meetup_spot: Optional[str] = Form(None),
    keep_photos: str = Form("[]"),  # photos to keep, as a JSON list
    photos: Optional[List[UploadFile]] = File(None),
    db=Depends(get_db),
    me=Depends(get_current_user),
):
    post = get_post_or_404(post_id, db)
    if post.user_id != me.id:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")
    title, price_value, category, meetup_spot = _clean_fields(type, title, price, category, meetup_spot)

    try:
        keep = [u for u in json.loads(keep_photos) if isinstance(u, str)]
    except ValueError:
        keep = []
    files = [f for f in (photos or []) if f and f.filename]

    current = db.query(PostPhoto).filter(PostPhoto.post_id == post.id).order_by(PostPhoto.position).all()
    current_urls = [ph.url for ph in current] or ([post.image_url] if post.image_url else [])
    keep = [u for u in keep if u in current_urls]
    if len(keep) + len(files) > config.MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"You can add up to {config.MAX_PHOTOS} photos")

    # Remove photos that were taken out
    for url in current_urls:
        if url not in keep:
            delete_photo(url, db)
    db.query(PostPhoto).filter(PostPhoto.post_id == post.id).delete()
    for i, url in enumerate(keep):
        db.add(PostPhoto(post_id=post.id, url=url, position=i))
    new_urls = await _add_photos(post, files, len(keep), db)
    all_urls = keep + new_urls

    post.type, post.title, post.price, post.category = type, title, price_value, category
    post.description = description.strip()[:2000]
    post.meetup_spot = meetup_spot
    post.image_url = all_urls[0] if all_urls else None
    post.updated_at = utc_now()
    db.commit()
    db.refresh(post)
    return post_info(post, me, db)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db)
    if post.user_id != me.id and not is_admin(me):
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    for ph in db.query(PostPhoto).filter(PostPhoto.post_id == post_id).all():
        delete_photo(ph.url, db)
    if post.image_url and not db.query(PostPhoto).filter(PostPhoto.post_id == post_id).count():
        delete_photo(post.image_url, db)
    db.query(PostPhoto).filter(PostPhoto.post_id == post_id).delete()
    comment_ids = [c.id for c in db.query(Comment.id).filter(Comment.post_id == post_id)]
    if comment_ids:
        db.query(CommentReaction).filter(CommentReaction.comment_id.in_(comment_ids)).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.post_id == post_id).delete()
    db.query(Reaction).filter(Reaction.post_id == post_id).delete()
    db.query(SavedPost).filter(SavedPost.post_id == post_id).delete()
    # Keep ratings, messages, reports and payments, but unlink them from the post
    for model in (Rating, Message, Notification, Report, PaymentRequest):
        db.query(model).filter(model.post_id == post_id).update({model.post_id: None})
    db.delete(post)
    db.commit()
    return {"ok": True}


# ---------- Sold / found ----------

@router.get("/posts/{post_id}/buyers")
def possible_buyers(post_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    """People who messaged or commented about this post (to pick who bought it)."""
    post = get_post_or_404(post_id, db)
    if post.user_id != me.id:
        raise HTTPException(status_code=403, detail="Not your post")
    ids = {m.sender_id for m in db.query(Message).filter(Message.post_id == post_id, Message.sender_id != me.id)}
    ids |= {m.receiver_id for m in db.query(Message).filter(Message.post_id == post_id, Message.sender_id == me.id)}
    ids |= {c.user_id for c in db.query(Comment).filter(Comment.post_id == post_id, Comment.user_id != me.id)}
    users = db.query(User).filter(User.id.in_(ids)).all() if ids else []
    return [public_user(u) for u in users]


@router.patch("/posts/{post_id}/status")
def update_status(post_id: int, data: StatusData, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db)
    if post.user_id != me.id:
        raise HTTPException(status_code=403, detail="You can only change your own posts")
    if data.status not in ("available", "sold", "found"):
        raise HTTPException(status_code=400, detail="Unknown status")

    post.status = data.status
    if data.status == "available":
        post.buyer_id = None
    elif data.status == "sold" and data.buyer_id and data.buyer_id != me.id and db.get(User, data.buyer_id):
        post.buyer_id = data.buyer_id
        notify(db, data.buyer_id, "sold_to_you",
               f"{me.name} marked “{post.title}” as sold to you. Rate your deal!", actor=me, post_id=post.id)
    db.commit()
    return post_info(post, me, db)


@router.post("/posts/{post_id}/rate")
def rate_seller(post_id: int, data: RateData, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db)
    if post.buyer_id != me.id or post.status != "sold":
        raise HTTPException(status_code=403, detail="Only the buyer can rate this deal")
    if not 1 <= data.stars <= 5:
        raise HTTPException(status_code=400, detail="Stars must be 1 to 5")
    if db.query(Rating).filter(Rating.post_id == post_id, Rating.rater_id == me.id).first():
        raise HTTPException(status_code=400, detail="You already rated this deal")
    db.add(Rating(post_id=post_id, post_title=post.title, rater_id=me.id, seller_id=post.user_id,
                  stars=data.stars, comment=data.comment.strip()[:500]))
    notify(db, post.user_id, "rating", f"{me.name} gave you {data.stars}★ for “{post.title}”", actor=me, post_id=post_id)
    db.commit()
    return post_info(post, me, db)


# ---------- Reactions, comments, saves ----------

@router.post("/posts/{post_id}/react")
def react(post_id: int, data: ReactData, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db, me)
    if data.emoji not in config.REACTIONS:
        raise HTTPException(status_code=400, detail="Unknown reaction")
    existing = db.query(Reaction).filter(Reaction.post_id == post_id, Reaction.user_id == me.id).first()
    if existing and existing.emoji == data.emoji:
        db.delete(existing)            # same reaction again = remove it
    elif existing:
        existing.emoji = data.emoji    # different reaction = change it
    else:
        db.add(Reaction(post_id=post_id, user_id=me.id, emoji=data.emoji))
        notify(db, post.user_id, "reaction", f"{me.name} reacted {data.emoji} to “{post.title}”", actor=me, post_id=post_id)
    db.commit()
    return post_info(post, me, db)


def comments_info(comments, me, db):
    """Turns comments into what the app needs, with their reactions
    (one extra database query no matter how many comments)."""
    ids = [c.id for c in comments]
    reactions = {}
    if ids:
        for r in db.query(CommentReaction).filter(CommentReaction.comment_id.in_(ids)):
            reactions.setdefault(r.comment_id, []).append(r)
    result = []
    for c in comments:
        counts = {}
        mine = None
        for r in reactions.get(c.id, []):
            counts[r.emoji] = counts.get(r.emoji, 0) + 1
            if r.user_id == me.id:
                mine = r.emoji
        result.append({
            "id": c.id,
            "parent_id": c.parent_id,
            "text": c.text,
            "created_at": iso_time(c.created_at),
            "edited": c.updated_at is not None,
            "user": public_user(c.user),
            "reactions": counts,
            "reaction_total": sum(counts.values()),
            "my_reaction": mine,
        })
    return result


def comment_info(comment, me, db):
    return comments_info([comment], me, db)[0]


def get_comment_or_404(comment_id, db, me):
    comment = db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    get_post_or_404(comment.post_id, db, me)  # also hides comments on hidden posts
    return comment


@router.get("/posts/{post_id}/comments")
def get_comments(post_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    get_post_or_404(post_id, db, me)
    comments = db.query(Comment).filter(Comment.post_id == post_id).order_by(Comment.id).all()
    return comments_info(comments, me, db)


@router.post("/posts/{post_id}/comments")
def add_comment(post_id: int, data: CommentData, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db, me)
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment can't be empty")

    replying_to = None
    parent_id = None
    if data.parent_id:
        replying_to = db.get(Comment, data.parent_id)
        if not replying_to or replying_to.post_id != post_id:
            raise HTTPException(status_code=404, detail="That comment was deleted")
        # Replies stay one level deep (like Facebook): a reply to a reply joins the same thread
        parent_id = replying_to.parent_id or replying_to.id

    comment = Comment(post_id=post_id, user_id=me.id, parent_id=parent_id, text=text[:1000])
    db.add(comment)
    short = text[:60]
    if replying_to:
        notify(db, replying_to.user_id, "reply", f"{me.name} replied to your comment on “{post.title}”: {short}",
               actor=me, post_id=post_id)
    if not replying_to or replying_to.user_id != post.user_id:
        notify(db, post.user_id, "comment", f"{me.name} commented on “{post.title}”: {short}", actor=me, post_id=post_id)
    db.commit()
    db.refresh(comment)
    return comment_info(comment, me, db)


@router.put("/comments/{comment_id}")
def edit_comment(comment_id: int, data: CommentData, db=Depends(get_db), me=Depends(get_current_user)):
    comment = get_comment_or_404(comment_id, db, me)
    if comment.user_id != me.id:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment can't be empty")
    if text[:1000] != comment.text:
        comment.text = text[:1000]
        comment.updated_at = utc_now()
        db.commit()
    return comment_info(comment, me, db)


@router.post("/comments/{comment_id}/react")
def react_to_comment(comment_id: int, data: ReactData, db=Depends(get_db), me=Depends(get_current_user)):
    comment = get_comment_or_404(comment_id, db, me)
    if data.emoji not in config.REACTIONS:
        raise HTTPException(status_code=400, detail="Unknown reaction")
    existing = db.query(CommentReaction).filter(
        CommentReaction.comment_id == comment_id, CommentReaction.user_id == me.id).first()
    if existing and existing.emoji == data.emoji:
        db.delete(existing)            # same reaction again = remove it
    elif existing:
        existing.emoji = data.emoji    # different reaction = change it
    else:
        db.add(CommentReaction(comment_id=comment_id, user_id=me.id, emoji=data.emoji))
        notify(db, comment.user_id, "reaction",
               f"{me.name} reacted {data.emoji} to your comment: {comment.text[:50]}", actor=me, post_id=comment.post_id)
    db.commit()
    return comment_info(comment, me, db)


@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    comment = db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    post = db.get(Post, comment.post_id)
    if comment.user_id != me.id and (not post or post.user_id != me.id) and not is_admin(me):
        raise HTTPException(status_code=403, detail="You can't delete this comment")
    # Deleting a comment also deletes its replies
    ids = [comment.id] + [c.id for c in db.query(Comment.id).filter(Comment.parent_id == comment.id)]
    db.query(CommentReaction).filter(CommentReaction.comment_id.in_(ids)).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted_ids": ids}


@router.post("/posts/{post_id}/save")
def toggle_save(post_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db, me)
    existing = db.query(SavedPost).filter(SavedPost.post_id == post_id, SavedPost.user_id == me.id).first()
    if existing:
        db.delete(existing)
    else:
        db.add(SavedPost(post_id=post_id, user_id=me.id))
    db.commit()
    return post_info(post, me, db)
