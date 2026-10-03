import io
import os
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Form, File, UploadFile, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy import or_, and_

from database import User, Post, Comment, Reaction, Message, Photo
from auth import get_db, hash_password, check_password, create_token, get_current_user

# ⚠️ Change this to the ending of your FSUU email (keep the @).
# Online, it is set in Render's "Environment" settings instead.
SCHOOL_EMAIL = os.getenv("SCHOOL_EMAIL", "@urios.edu.ph").strip().lower()

CATEGORIES = ["Food", "Preloved", "Services", "School Supplies", "Gadgets", "Others"]
REACTIONS = ["👍", "❤️", "😮", "😂"]

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10 MB (photos are shrunk before saving)

app = FastAPI(title="FSUU Campus Market")

# Login uses a token in the request header (not cookies),
# so it's safe to let the website call the API from any address.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Old photos from before this update (saved as files on your computer)
UPLOAD_DIR = "uploads"
if os.path.isdir(UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ---------- Data shapes ----------

class RegisterData(BaseModel):
    name: str
    email: str
    contact: str
    password: str


class LoginData(BaseModel):
    email: str
    password: str


class CommentData(BaseModel):
    text: str


class ReactData(BaseModel):
    emoji: str


class StatusData(BaseModel):
    status: str


class MessageData(BaseModel):
    receiver_id: int
    text: str
    post_id: Optional[int] = None


class ProfileData(BaseModel):
    name: str
    contact: str


# ---------- Helpers ----------

def user_info(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "contact": user.contact,
        "avatar_url": user.avatar_url,
    }


def public_user(user):
    return {"id": user.id, "name": user.name, "contact": user.contact, "avatar_url": user.avatar_url}


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

    # Shrink big phone photos so they load fast and take less space
    image.thumbnail((max_side, max_side))
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=82, optimize=True)

    saved = Photo(data=output.getvalue(), content_type="image/jpeg")
    db.add(saved)
    db.flush()  # gives the photo its id
    return f"/photos/{saved.id}"


def delete_photo(image_url, db):
    if not image_url:
        return
    if image_url.startswith("/photos/"):
        photo = db.get(Photo, int(image_url.rsplit("/", 1)[1]))
        if photo:
            db.delete(photo)
    else:  # old photo saved as a file
        path = os.path.join(UPLOAD_DIR, os.path.basename(image_url))
        if os.path.exists(path):
            os.remove(path)


def post_info(post, me, db):
    """Turns a Post into what the News Feed needs: counts, my reaction, seller."""
    reactions = db.query(Reaction).filter(Reaction.post_id == post.id).all()
    counts = {}
    my_reaction = None
    for r in reactions:
        counts[r.emoji] = counts.get(r.emoji, 0) + 1
        if r.user_id == me.id:
            my_reaction = r.emoji
    comment_count = db.query(Comment).filter(Comment.post_id == post.id).count()

    return {
        "id": post.id,
        "type": post.type,
        "title": post.title,
        "price": post.price,
        "category": post.category,
        "description": post.description,
        "image_url": post.image_url,
        "status": post.status,
        "created_at": post.created_at.isoformat(),
        "user": public_user(post.user),
        "reactions": counts,
        "reaction_total": len(reactions),
        "my_reaction": my_reaction,
        "comment_count": comment_count,
        "is_mine": post.user_id == me.id,
    }


def comment_info(comment):
    return {
        "id": comment.id,
        "text": comment.text,
        "created_at": comment.created_at.isoformat(),
        "user": public_user(comment.user),
    }


def message_info(msg):
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "receiver_id": msg.receiver_id,
        "post_id": msg.post_id,
        "text": msg.text,
        "created_at": msg.created_at.isoformat(),
    }


def get_post_or_404(post_id, db):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return post


# ---------- Accounts ----------

@app.get("/")
def home():
    return {"message": "Campus Market is running!"}


@app.get("/photos/{photo_id}")
def get_photo(photo_id: int, db=Depends(get_db)):
    photo = db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    # Photos never change, so the browser can keep them for a long time
    return Response(
        content=photo.data,
        media_type=photo.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.post("/register")
def register(data: RegisterData, db=Depends(get_db)):
    email = data.email.strip().lower()
    if not email.endswith(SCHOOL_EMAIL):
        raise HTTPException(status_code=400, detail=f"Only FSUU emails ({SCHOOL_EMAIL}) can register")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not data.name.strip() or not data.contact.strip():
        raise HTTPException(status_code=400, detail="Please fill in your name and contact")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="This email is already registered")

    user = User(
        name=data.name.strip(),
        email=email,
        contact=data.contact.strip(),
        password_hash=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user.id), "user": user_info(user)}


@app.post("/login")
def login(data: LoginData, db=Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.strip().lower()).first()
    if not user or not check_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Wrong email or password")
    return {"token": create_token(user.id), "user": user_info(user)}


@app.get("/me")
def me(user=Depends(get_current_user)):
    return user_info(user)


@app.patch("/me")
def update_profile(data: ProfileData, db=Depends(get_db), me=Depends(get_current_user)):
    if not data.name.strip() or not data.contact.strip():
        raise HTTPException(status_code=400, detail="Name and contact can't be empty")
    me.name = data.name.strip()
    me.contact = data.contact.strip()
    db.commit()
    return user_info(me)


@app.post("/me/avatar")
async def upload_avatar(photo: UploadFile = File(...), db=Depends(get_db), me=Depends(get_current_user)):
    new_url = await save_photo(photo, db, max_side=400)
    delete_photo(me.avatar_url, db)  # remove the old picture
    me.avatar_url = new_url
    db.commit()
    return user_info(me)


@app.delete("/me/avatar")
def remove_avatar(db=Depends(get_db), me=Depends(get_current_user)):
    delete_photo(me.avatar_url, db)
    me.avatar_url = None
    db.commit()
    return user_info(me)


# ---------- News Feed posts ----------

@app.get("/posts")
def get_posts(
    type: str = "all",
    category: str = "All",
    q: str = "",
    db=Depends(get_db),
    me=Depends(get_current_user),
):
    query = db.query(Post)
    if type in ("selling", "looking"):
        query = query.filter(Post.type == type)
    if category != "All":
        query = query.filter(Post.category == category)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Post.title.ilike(like), Post.description.ilike(like)))
    posts = query.order_by(Post.id.desc()).limit(100).all()
    return [post_info(p, me, db) for p in posts]


@app.post("/posts")
async def create_post(
    type: str = Form("selling"),
    title: str = Form(...),
    price: Optional[float] = Form(None),
    category: str = Form(...),
    description: str = Form(""),
    photo: Optional[UploadFile] = File(None),
    db=Depends(get_db),
    me=Depends(get_current_user),
):
    if type not in ("selling", "looking"):
        raise HTTPException(status_code=400, detail="Post type must be selling or looking")
    if not title.strip():
        raise HTTPException(status_code=400, detail="Please add a title")
    if type == "selling" and price is None:
        raise HTTPException(status_code=400, detail="Please add a price")
    if price is not None and price < 0:
        raise HTTPException(status_code=400, detail="Price can't be negative")
    if category not in CATEGORIES:
        category = "Others"

    image_url = await save_photo(photo, db) if photo and photo.filename else None

    post = Post(
        user_id=me.id,
        type=type,
        title=title.strip(),
        price=price,
        category=category,
        description=description.strip(),
        image_url=image_url,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post_info(post, me, db)


@app.patch("/posts/{post_id}/status")
def update_status(post_id: int, data: StatusData, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db)
    if post.user_id != me.id:
        raise HTTPException(status_code=403, detail="You can only change your own posts")
    if data.status not in ("available", "sold", "found"):
        raise HTTPException(status_code=400, detail="Unknown status")
    post.status = data.status
    db.commit()
    return post_info(post, me, db)


@app.delete("/posts/{post_id}")
def delete_post(post_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db)
    if post.user_id != me.id:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    db.query(Comment).filter(Comment.post_id == post_id).delete()
    db.query(Reaction).filter(Reaction.post_id == post_id).delete()
    db.query(Message).filter(Message.post_id == post_id).update({Message.post_id: None})
    delete_photo(post.image_url, db)
    db.delete(post)
    db.commit()
    return {"ok": True}


# ---------- Reactions ----------

@app.post("/posts/{post_id}/react")
def react(post_id: int, data: ReactData, db=Depends(get_db), me=Depends(get_current_user)):
    post = get_post_or_404(post_id, db)
    if data.emoji not in REACTIONS:
        raise HTTPException(status_code=400, detail="Unknown reaction")

    existing = db.query(Reaction).filter(Reaction.post_id == post_id, Reaction.user_id == me.id).first()
    if existing and existing.emoji == data.emoji:
        db.delete(existing)            # same reaction again = remove it
    elif existing:
        existing.emoji = data.emoji    # different reaction = change it
    else:
        db.add(Reaction(post_id=post_id, user_id=me.id, emoji=data.emoji))
    db.commit()
    return post_info(post, me, db)


# ---------- Comments ----------

@app.get("/posts/{post_id}/comments")
def get_comments(post_id: int, db=Depends(get_db), me=Depends(get_current_user)):
    get_post_or_404(post_id, db)
    comments = db.query(Comment).filter(Comment.post_id == post_id).order_by(Comment.id).all()
    return [comment_info(c) for c in comments]


@app.post("/posts/{post_id}/comments")
def add_comment(post_id: int, data: CommentData, db=Depends(get_db), me=Depends(get_current_user)):
    get_post_or_404(post_id, db)
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Comment can't be empty")
    comment = Comment(post_id=post_id, user_id=me.id, text=data.text.strip()[:1000])
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment_info(comment)


# ---------- Messaging ----------

@app.get("/conversations")
def conversations(db=Depends(get_db), me=Depends(get_current_user)):
    """One row per person you've chatted with, newest first."""
    msgs = (
        db.query(Message)
        .filter(or_(Message.sender_id == me.id, Message.receiver_id == me.id))
        .order_by(Message.id.desc())
        .all()
    )
    seen = {}
    for m in msgs:
        other_id = m.receiver_id if m.sender_id == me.id else m.sender_id
        if other_id not in seen:
            other = db.get(User, other_id)
            seen[other_id] = {
                "user": public_user(other),
                "last_message": m.text,
                "last_from_me": m.sender_id == me.id,
                "created_at": m.created_at.isoformat(),
                "unread": 0,
            }
        if m.receiver_id == me.id and not m.is_read:
            seen[other_id]["unread"] += 1
    return list(seen.values())


@app.get("/unread-count")
def unread_count(db=Depends(get_db), me=Depends(get_current_user)):
    count = db.query(Message).filter(Message.receiver_id == me.id, Message.is_read == False).count()  # noqa: E712
    return {"count": count}


@app.get("/messages/{other_id}")
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
        .order_by(Message.id)
        .all()
    )
    # Mark their messages to me as read
    for m in msgs:
        if m.receiver_id == me.id and not m.is_read:
            m.is_read = True
    db.commit()

    # Items mentioned in this chat, so the chat can show "About: Cellphone"
    post_ids = {m.post_id for m in msgs if m.post_id}
    posts = {p.id: {"id": p.id, "title": p.title, "price": p.price, "type": p.type, "image_url": p.image_url}
             for p in db.query(Post).filter(Post.id.in_(post_ids)).all()} if post_ids else {}

    return {
        "user": public_user(other),
        "messages": [message_info(m) for m in msgs],
        "posts": posts,
    }


@app.post("/messages")
def send_message(data: MessageData, db=Depends(get_db), me=Depends(get_current_user)):
    if data.receiver_id == me.id:
        raise HTTPException(status_code=400, detail="You can't message yourself")
    if not db.get(User, data.receiver_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Message can't be empty")
    if data.post_id is not None and not db.get(Post, data.post_id):
        data.post_id = None
    msg = Message(sender_id=me.id, receiver_id=data.receiver_id, post_id=data.post_id, text=data.text.strip()[:2000])
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return message_info(msg)
