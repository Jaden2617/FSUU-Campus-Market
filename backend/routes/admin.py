"""Admin page: stats, reports, GCash approvals, ads, and users."""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_

from auth import get_db, get_admin, is_admin
from database import (
    User, Post, Comment, Reaction, Message, Friendship, Rating, Report,
    PaymentRequest, Ad, utc_now,
)
from helpers import public_user, iso_time, notify, save_photo, delete_photo
from routes.market import payment_info, ad_info

router = APIRouter(prefix="/admin")


class ActionData(BaseModel):
    action: str


class FlagData(BaseModel):
    value: bool


# ---------- Stats (your Key Metrics) ----------

@router.get("/stats")
def stats(db=Depends(get_db), admin=Depends(get_admin)):
    now = utc_now()
    week_ago = now - timedelta(days=7)
    start = (now - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)

    def daily(model):
        counts = {}
        for (created,) in db.query(model.created_at).filter(model.created_at >= start):
            key = created.date().isoformat()
            counts[key] = counts.get(key, 0) + 1
        days = [(start + timedelta(days=i)).date().isoformat() for i in range(14)]
        return [{"date": d, "count": counts.get(d, 0)} for d in days]

    categories = (
        db.query(Post.category, func.count(Post.id)).group_by(Post.category)
        .order_by(func.count(Post.id).desc()).all()
    )
    revenue = db.query(func.coalesce(func.sum(PaymentRequest.amount), 0)).filter(PaymentRequest.status == "approved").scalar()

    return {
        "totals": {
            "users": db.query(User).filter(User.email_verified == True).count(),  # noqa: E712
            "new_users_week": db.query(User).filter(User.created_at >= week_ago).count(),
            "posts": db.query(Post).count(),
            "new_posts_week": db.query(Post).filter(Post.created_at >= week_ago).count(),
            "active_listings": db.query(Post).filter(Post.status == "available", Post.type == "selling").count(),
            "looking_for": db.query(Post).filter(Post.status == "available", Post.type == "looking").count(),
            "sold": db.query(Post).filter(Post.status.in_(["sold", "found"])).count(),
            "messages": db.query(Message).count(),
            "comments": db.query(Comment).count(),
            "reactions": db.query(Reaction).count(),
            "friendships": db.query(Friendship).filter(Friendship.status == "accepted").count(),
            "ratings": db.query(Rating).count(),
            "revenue": int(revenue or 0),
            "open_reports": db.query(Report).filter(Report.status == "open").count(),
            "pending_payments": db.query(PaymentRequest).filter(PaymentRequest.status == "pending").count(),
        },
        "posts_per_day": daily(Post),
        "users_per_day": daily(User),
        "categories": [{"name": c, "count": n} for c, n in categories],
    }


# ---------- Reports ----------

@router.get("/reports")
def list_reports(status: str = "open", db=Depends(get_db), admin=Depends(get_admin)):
    reports = db.query(Report).filter(Report.status == status).order_by(Report.id.desc()).limit(100).all()
    result = []
    for r in reports:
        post = db.get(Post, r.post_id) if r.post_id else None
        result.append({
            "id": r.id,
            "reason": r.reason,
            "details": r.details,
            "status": r.status,
            "created_at": iso_time(r.created_at),
            "reporter": public_user(db.get(User, r.reporter_id)),
            "reported_user": public_user(db.get(User, r.reported_user_id)) if r.reported_user_id else None,
            "reported_user_banned": bool(db.get(User, r.reported_user_id).banned) if r.reported_user_id else False,
            "post": {"id": post.id, "title": post.title, "hidden": bool(post.hidden), "image_url": post.image_url} if post else None,
        })
    return result


@router.post("/reports/{report_id}")
def handle_report(report_id: int, data: ActionData, db=Depends(get_db), admin=Depends(get_admin)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if data.action == "dismiss":
        report.status = "dismissed"
    elif data.action == "hide_post":
        post = db.get(Post, report.post_id) if report.post_id else None
        if post:
            post.hidden = True
            notify(db, post.user_id, "admin", f"Your post “{post.title}” was hidden by an admin after a report.", post_id=post.id)
        report.status = "resolved"
    elif data.action == "ban_user":
        user = db.get(User, report.reported_user_id) if report.reported_user_id else None
        if user and not is_admin(user):
            user.banned = True
        report.status = "resolved"
    elif data.action == "resolve":
        report.status = "resolved"
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    db.commit()
    return {"ok": True}


# ---------- GCash payments ----------

@router.get("/payments")
def list_payments(status: str = "pending", db=Depends(get_db), admin=Depends(get_admin)):
    items = db.query(PaymentRequest).filter(PaymentRequest.status == status).order_by(PaymentRequest.id.desc()).limit(100).all()
    return [{**payment_info(p, db), "user": public_user(db.get(User, p.user_id))} for p in items]


@router.post("/payments/{payment_id}")
def review_payment(payment_id: int, data: ActionData, db=Depends(get_db), admin=Depends(get_admin)):
    p = db.get(PaymentRequest, payment_id)
    if not p or p.status != "pending":
        raise HTTPException(status_code=404, detail="Payment not found or already reviewed")
    now = utc_now()
    if data.action == "approve":
        if p.kind == "boost":
            post = db.get(Post, p.post_id) if p.post_id else None
            if post:
                start = post.boosted_until if post.boosted_until and post.boosted_until > now else now
                post.boosted_until = start + timedelta(days=p.days)
                notify(db, p.user_id, "payment", f"Payment approved! “{post.title}” is boosted for {p.days} day(s). ⚡", post_id=post.id)
        else:
            user = db.get(User, p.user_id)
            start = user.verified_until if user.verified_until and user.verified_until > now else now
            user.verified_until = start + timedelta(days=p.days)
            notify(db, p.user_id, "payment", f"Payment approved! You're a Verified Seller for {p.days} days. ✔")
        p.status = "approved"
    elif data.action == "reject":
        p.status = "rejected"
        notify(db, p.user_id, "payment", f"Your GCash payment (ref {p.reference}) could not be confirmed. Message the admin if this is a mistake.")
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    p.reviewed_at = now
    db.commit()
    return {"ok": True}


# ---------- Ads ----------

@router.get("/ads")
def list_ads(db=Depends(get_db), admin=Depends(get_admin)):
    return [ad_info(a) for a in db.query(Ad).order_by(Ad.id.desc()).all()]


@router.post("/ads")
async def create_ad(
    business_name: str = Form(...),
    title: str = Form(...),
    text: str = Form(""),
    link_url: str = Form(""),
    photo: Optional[UploadFile] = File(None),
    db=Depends(get_db),
    admin=Depends(get_admin),
):
    if not business_name.strip() or not title.strip():
        raise HTTPException(status_code=400, detail="Business name and title are required")
    link = link_url.strip()
    if link and not link.startswith(("http://", "https://")):
        link = "https://" + link
    image_url = await save_photo(photo, db) if photo is not None and photo.filename else None
    ad = Ad(business_name=business_name.strip()[:80], title=title.strip()[:120],
            text=text.strip()[:500], link_url=link or None, image_url=image_url)
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return ad_info(ad)


@router.patch("/ads/{ad_id}")
def toggle_ad(ad_id: int, data: FlagData, db=Depends(get_db), admin=Depends(get_admin)):
    ad = db.get(Ad, ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Ad not found")
    ad.active = data.value
    db.commit()
    return ad_info(ad)


@router.delete("/ads/{ad_id}")
def delete_ad(ad_id: int, db=Depends(get_db), admin=Depends(get_admin)):
    ad = db.get(Ad, ad_id)
    if ad:
        delete_photo(ad.image_url, db)
        db.delete(ad)
        db.commit()
    return {"ok": True}


# ---------- Users & posts ----------

@router.get("/users")
def list_users(q: str = "", db=Depends(get_db), admin=Depends(get_admin)):
    query = db.query(User)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.name.ilike(like), User.email.ilike(like)))
    users = query.order_by(User.id.desc()).limit(100).all()
    counts = dict(db.query(Post.user_id, func.count(Post.id)).group_by(Post.user_id).all())
    return [{
        **public_user(u),
        "email": u.email,
        "banned": bool(u.banned),
        "email_verified": bool(u.email_verified),
        "is_admin": is_admin(u),
        "posts": counts.get(u.id, 0),
        "created_at": iso_time(u.created_at),
    } for u in users]


@router.post("/users/{user_id}/ban")
def ban_user(user_id: int, data: FlagData, db=Depends(get_db), admin=Depends(get_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if is_admin(user):
        raise HTTPException(status_code=400, detail="You can't ban an admin")
    user.banned = data.value
    db.commit()
    return {"ok": True, "banned": user.banned}


@router.post("/posts/{post_id}/hide")
def hide_post(post_id: int, data: FlagData, db=Depends(get_db), admin=Depends(get_admin)):
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.hidden = data.value
    db.commit()
    return {"ok": True, "hidden": post.hidden}
