"""Profiles, friends, and notifications."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, and_

from auth import get_db, get_current_user, is_admin
from database import User, Friendship, Post, Rating, Message, Notification
from helpers import public_user, iso_time, notify, seller_rating

router = APIRouter()


def _friendship(db, a, b):
    return db.query(Friendship).filter(or_(
        and_(Friendship.requester_id == a, Friendship.addressee_id == b),
        and_(Friendship.requester_id == b, Friendship.addressee_id == a),
    )).first()


def _friend_status(db, me_id, other_id):
    if me_id == other_id:
        return "self"
    f = _friendship(db, me_id, other_id)
    if not f:
        return "none"
    if f.status == "accepted":
        return "friends"
    return "request_sent" if f.requester_id == me_id else "request_received"


def _friend_ids(db, user_id):
    rows = db.query(Friendship).filter(
        Friendship.status == "accepted",
        or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
    ).all()
    return [f.addressee_id if f.requester_id == user_id else f.requester_id for f in rows]


def _active_users(db, ids):
    if not ids:
        return []
    return db.query(User).filter(User.id.in_(ids), or_(User.banned == False, User.banned.is_(None))).order_by(User.name).all()  # noqa: E712


def _get_user_or_404(db, user_id, me):
    user = db.get(User, user_id)
    if not user or (user.banned and not is_admin(me)) or not user.email_verified:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ---------- Profiles ----------

@router.get("/users/search")
def search_users(q: str = "", db=Depends(get_db), me=Depends(get_current_user)):
    if not q.strip():
        return []
    users = (
        db.query(User)
        .filter(User.name.ilike(f"%{q.strip()}%"), or_(User.banned == False, User.banned.is_(None)),  # noqa: E712
                User.email_verified == True)  # noqa: E712
        .order_by(User.name).limit(20).all()
    )
    return [{**public_user(u), "friend_status": _friend_status(db, me.id, u.id)} for u in users]


@router.get("/users/{user_id}")
def get_profile(user_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    user = _get_user_or_404(db, user_id, me)
    visible = db.query(Post).filter(Post.user_id == user_id, or_(Post.hidden == False, Post.hidden.is_(None)))  # noqa: E712
    return {
        **public_user(user),
        "bio": user.bio or "",
        "member_since": iso_time(user.created_at),
        "rating": seller_rating(db, user_id),
        "friend_count": len(_friend_ids(db, user_id)),
        "friend_status": _friend_status(db, me.id, user_id),
        "active_posts": visible.filter(Post.status == "available").count(),
        "sold_posts": visible.filter(Post.status == "sold").count(),
        "banned": bool(user.banned),
    }


@router.get("/users/{user_id}/ratings")
def get_ratings(user_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    _get_user_or_404(db, user_id, me)
    ratings = db.query(Rating).filter(Rating.seller_id == user_id).order_by(Rating.id.desc()).limit(50).all()
    raters = {u.id: u for u in db.query(User).filter(User.id.in_([r.rater_id for r in ratings]))} if ratings else {}
    return [{
        "id": r.id,
        "stars": r.stars,
        "comment": r.comment,
        "post_title": r.post_title,
        "created_at": iso_time(r.created_at),
        "rater": public_user(raters.get(r.rater_id)),
    } for r in ratings]


@router.get("/users/{user_id}/friends")
def get_user_friends(user_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    _get_user_or_404(db, user_id, me)
    return [public_user(u) for u in _active_users(db, _friend_ids(db, user_id))]


# ---------- Friends ----------

@router.get("/friends")
def my_friends(db=Depends(get_db), me=Depends(get_current_user)):
    pending = db.query(Friendship).filter(
        Friendship.status == "pending",
        or_(Friendship.requester_id == me.id, Friendship.addressee_id == me.id),
    ).order_by(Friendship.id.desc()).all()
    incoming_ids = [f.requester_id for f in pending if f.addressee_id == me.id]
    outgoing_ids = [f.addressee_id for f in pending if f.requester_id == me.id]
    return {
        "friends": [public_user(u) for u in _active_users(db, _friend_ids(db, me.id))],
        "incoming": [public_user(u) for u in _active_users(db, incoming_ids)],
        "outgoing": [public_user(u) for u in _active_users(db, outgoing_ids)],
    }


@router.post("/friends/{user_id}")
def add_friend(user_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    """Sends a friend request, or accepts theirs if they already sent one."""
    if user_id == me.id:
        raise HTTPException(status_code=400, detail="You can't add yourself")
    _get_user_or_404(db, user_id, me)
    f = _friendship(db, me.id, user_id)
    if f is None:
        db.add(Friendship(requester_id=me.id, addressee_id=user_id))
        notify(db, user_id, "friend_request", f"{me.name} sent you a friend request", actor=me)
    elif f.status == "pending" and f.addressee_id == me.id:
        f.status = "accepted"
        notify(db, user_id, "friend_accept", f"{me.name} accepted your friend request", actor=me)
    db.commit()
    return {"friend_status": _friend_status(db, me.id, user_id)}


@router.delete("/friends/{user_id}")
def remove_friend(user_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    """Cancels your request, declines theirs, or unfriends."""
    f = _friendship(db, me.id, user_id)
    if f:
        db.delete(f)
        db.commit()
    return {"friend_status": _friend_status(db, me.id, user_id)}


# ---------- Notifications ----------

@router.get("/notifications")
def get_notifications(db=Depends(get_db), me=Depends(get_current_user)):
    items = (
        db.query(Notification).filter(Notification.user_id == me.id)
        .order_by(Notification.id.desc()).limit(50).all()
    )
    return [{
        "id": n.id,
        "type": n.type,
        "text": n.text,
        "post_id": n.post_id,
        "is_read": bool(n.is_read),
        "created_at": iso_time(n.created_at),
        "actor": public_user(n.actor),
    } for n in items]


@router.post("/notifications/read-all")
def read_all(db=Depends(get_db), me=Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == me.id, Notification.is_read == False).update(  # noqa: E712
        {Notification.is_read: True, Notification.seen: True})
    db.commit()
    return {"ok": True}


@router.post("/notifications/seen")
def mark_seen(db=Depends(get_db), me=Depends(get_current_user)):
    """Opening the notifications clears the red number (like Facebook).
    Each one stays highlighted until it's clicked."""
    db.query(Notification).filter(Notification.user_id == me.id, Notification.seen == False).update(  # noqa: E712
        {Notification.seen: True})
    db.commit()
    return {"ok": True}


@router.post("/notifications/{notification_id}/read")
def read_one(notification_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    n = db.get(Notification, notification_id)
    if n and n.user_id == me.id:
        n.is_read = True
        n.seen = True
        db.commit()
    return {"ok": True}


@router.get("/badges")
def badges(db=Depends(get_db), me=Depends(get_current_user)):
    """The red numbers on the top bar, in one quick request."""
    return {
        "messages": db.query(Message).filter(Message.receiver_id == me.id, Message.is_read == False).count(),  # noqa: E712
        "notifications": db.query(Notification).filter(
            Notification.user_id == me.id, Notification.is_read == False, Notification.seen == False).count(),  # noqa: E712
        "friend_requests": db.query(Friendship).filter(Friendship.addressee_id == me.id, Friendship.status == "pending").count(),
    }
