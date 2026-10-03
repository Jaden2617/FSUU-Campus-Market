"""Private chats: text, photos, "Seen", and "typing..."."""
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy import or_, and_

from auth import get_db, get_current_user
from database import User, Post, Message
from helpers import public_user, iso_time, save_photo

router = APIRouter()

# Who is typing to whom: {(typer_id, other_id): time}. Kept in memory because
# it only matters for a few seconds.
_typing = {}


def message_info(msg):
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "receiver_id": msg.receiver_id,
        "post_id": msg.post_id,
        "text": msg.text,
        "image_url": msg.image_url,
        "is_read": bool(msg.is_read),
        "created_at": iso_time(msg.created_at),
    }


@router.get("/conversations")
def conversations(db=Depends(get_db), me=Depends(get_current_user)):
    """One row per person you've chatted with, newest first."""
    msgs = (
        db.query(Message)
        .filter(or_(Message.sender_id == me.id, Message.receiver_id == me.id))
        .order_by(Message.id.desc()).limit(500).all()
    )
    seen = {}
    for m in msgs:
        other_id = m.receiver_id if m.sender_id == me.id else m.sender_id
        if other_id not in seen:
            preview = m.text or ("📷 Photo" if m.image_url else "")
            seen[other_id] = {
                "user_id": other_id,
                "last_message": preview,
                "last_from_me": m.sender_id == me.id,
                "last_seen": bool(m.is_read) if m.sender_id == me.id else None,
                "created_at": iso_time(m.created_at),
                "unread": 0,
            }
        if m.receiver_id == me.id and not m.is_read:
            seen[other_id]["unread"] += 1

    users = {u.id: u for u in db.query(User).filter(User.id.in_(list(seen)))} if seen else {}
    result = []
    for other_id, row in seen.items():
        if other_id in users:
            row["user"] = public_user(users[other_id])
            row["typing"] = time.time() - _typing.get((other_id, me.id), 0) < 5
            result.append(row)
    return result


@router.get("/messages/{other_id}")
def get_messages(other_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    other = db.get(User, other_id)
    if not other:
        raise HTTPException(status_code=404, detail="User not found")
    msgs = (
        db.query(Message)
        .filter(or_(
            and_(Message.sender_id == me.id, Message.receiver_id == other_id),
            and_(Message.sender_id == other_id, Message.receiver_id == me.id),
        ))
        .order_by(Message.id).all()
    )
    changed = False
    for m in msgs:
        if m.receiver_id == me.id and not m.is_read:
            m.is_read = True
            changed = True
    if changed:
        db.commit()

    post_ids = {m.post_id for m in msgs if m.post_id}
    posts = {
        p.id: {"id": p.id, "title": p.title, "price": p.price, "type": p.type, "image_url": p.image_url}
        for p in db.query(Post).filter(Post.id.in_(post_ids)).all()
    } if post_ids else {}

    return {
        "user": public_user(other),
        "messages": [message_info(m) for m in msgs],
        "posts": posts,
        "typing": time.time() - _typing.get((other_id, me.id), 0) < 5,
        "blocked": bool(other.banned),
    }


@router.post("/messages")
async def send_message(
    receiver_id: int = Form(...),
    text: str = Form(""),
    post_id: Optional[int] = Form(None),
    photo: Optional[UploadFile] = File(None),
    db=Depends(get_db),
    me=Depends(get_current_user),
):
    if receiver_id == me.id:
        raise HTTPException(status_code=400, detail="You can't message yourself")
    receiver = db.get(User, receiver_id)
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")
    if receiver.banned:
        raise HTTPException(status_code=400, detail="This account is suspended")
    has_photo = photo is not None and photo.filename
    if not text.strip() and not has_photo:
        raise HTTPException(status_code=400, detail="Message can't be empty")
    if post_id is not None and not db.get(Post, post_id):
        post_id = None

    image_url = await save_photo(photo, db) if has_photo else None
    msg = Message(sender_id=me.id, receiver_id=receiver_id, post_id=post_id,
                  text=text.strip()[:2000], image_url=image_url)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    _typing.pop((me.id, receiver_id), None)
    return message_info(msg)


@router.post("/typing/{other_id}")
def typing(other_id: int, me=Depends(get_current_user)):
    _typing[(me.id, other_id)] = time.time()
    return {"ok": True}
