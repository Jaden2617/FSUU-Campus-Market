"""Reports, GCash payments (boosts and verified badges), and ads."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import config
from auth import get_db, get_current_user
from database import User, Post, Report, PaymentRequest, Ad
from helpers import iso_time, is_active_until

router = APIRouter()


class ReportData(BaseModel):
    post_id: Optional[int] = None
    user_id: Optional[int] = None
    reason: str
    details: str = ""


class PaymentData(BaseModel):
    kind: str                     # "boost" or "verified"
    post_id: Optional[int] = None
    days: Optional[int] = None
    reference: str


# ---------- Reports ----------

@router.post("/reports")
def create_report(data: ReportData, db=Depends(get_db), me=Depends(get_current_user)):
    if not data.post_id and not data.user_id:
        raise HTTPException(status_code=400, detail="Nothing to report")
    if data.reason not in config.REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Please choose a reason")
    reported_user_id = data.user_id
    if data.post_id:
        post = db.get(Post, data.post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        reported_user_id = post.user_id
    if reported_user_id == me.id:
        raise HTTPException(status_code=400, detail="You can't report yourself")
    if reported_user_id and not db.get(User, reported_user_id):
        raise HTTPException(status_code=404, detail="User not found")

    duplicate = db.query(Report).filter(
        Report.reporter_id == me.id, Report.status == "open",
        Report.post_id == data.post_id, Report.reported_user_id == reported_user_id,
    ).first()
    if not duplicate:
        db.add(Report(reporter_id=me.id, post_id=data.post_id, reported_user_id=reported_user_id,
                      reason=data.reason, details=data.details.strip()[:1000]))
        db.commit()
    return {"ok": True}


# ---------- GCash payments ----------

def payment_info(p, db):
    post = db.get(Post, p.post_id) if p.post_id else None
    return {
        "id": p.id,
        "kind": p.kind,
        "post_id": p.post_id,
        "post_title": post.title if post else None,
        "days": p.days,
        "amount": p.amount,
        "reference": p.reference,
        "status": p.status,
        "created_at": iso_time(p.created_at),
    }


@router.post("/payments")
def create_payment(data: PaymentData, db=Depends(get_db), me=Depends(get_current_user)):
    reference = re.sub(r"\s+", "", data.reference)
    if not re.fullmatch(r"[0-9A-Za-z]{6,20}", reference):
        raise HTTPException(status_code=400, detail="Enter the GCash reference number from your receipt")

    if data.kind == "boost":
        post = db.get(Post, data.post_id) if data.post_id else None
        if not post or post.user_id != me.id:
            raise HTTPException(status_code=400, detail="You can only boost your own post")
        if post.status != "available" or post.hidden:
            raise HTTPException(status_code=400, detail="Only available posts can be boosted")
        if data.days not in config.BOOST_PLANS:
            raise HTTPException(status_code=400, detail="Choose a boost plan")
        days, amount = data.days, config.BOOST_PLANS[data.days]
    elif data.kind == "verified":
        post = None
        days, amount = config.VERIFIED_DAYS, config.VERIFIED_PRICE
    else:
        raise HTTPException(status_code=400, detail="Unknown payment type")

    if db.query(PaymentRequest).filter(PaymentRequest.reference == reference).first():
        raise HTTPException(status_code=400, detail="This reference number was already submitted")
    pending = db.query(PaymentRequest).filter(
        PaymentRequest.user_id == me.id, PaymentRequest.kind == data.kind,
        PaymentRequest.status == "pending", PaymentRequest.post_id == (post.id if post else None),
    ).first()
    if pending:
        raise HTTPException(status_code=400, detail="You already have a payment waiting for approval")

    payment = PaymentRequest(user_id=me.id, kind=data.kind, post_id=post.id if post else None,
                             days=days, amount=amount, reference=reference)
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment_info(payment, db)


@router.get("/payments/mine")
def my_payments(db=Depends(get_db), me=Depends(get_current_user)):
    items = db.query(PaymentRequest).filter(PaymentRequest.user_id == me.id).order_by(PaymentRequest.id.desc()).limit(30).all()
    return {
        "payments": [payment_info(p, db) for p in items],
        "verified": is_active_until(me.verified_until),
        "verified_until": iso_time(me.verified_until),
    }


# ---------- Ads ----------

def ad_info(ad):
    return {
        "id": ad.id,
        "business_name": ad.business_name,
        "title": ad.title,
        "text": ad.text,
        "image_url": ad.image_url,
        "link_url": ad.link_url,
        "active": bool(ad.active),
        "created_at": iso_time(ad.created_at),
    }


@router.get("/ads")
def active_ads(db=Depends(get_db), me=Depends(get_current_user)):
    ads = db.query(Ad).filter(Ad.active == True).order_by(Ad.id.desc()).limit(10).all()  # noqa: E712
    return [ad_info(a) for a in ads]
