"""Register, log in, email codes, and your own profile settings."""
import hashlib
import secrets
import time
import urllib.request
from datetime import timedelta

import jwt

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel

import config
from auth import get_db, hash_password, check_password, create_token, get_current_user
from database import User, utc_now
from emailer import send_verification_code
from helpers import user_info, save_photo, save_image_bytes, delete_photo

router = APIRouter()

# Limits for guessing / resending codes (kept in memory)
_attempts = {}
_last_sent = {}


class RegisterData(BaseModel):
    name: str
    email: str
    contact: str
    password: str


class LoginData(BaseModel):
    email: str
    password: str


class VerifyData(BaseModel):
    email: str
    code: str


class EmailData(BaseModel):
    email: str


class GoogleData(BaseModel):
    credential: str  # the ID token Google gives the website


class ProfileData(BaseModel):
    name: str
    contact: str
    bio: str = ""


def _hash_code(email, code):
    return hashlib.sha256(f"{email}:{code}:{config.SECRET_KEY}".encode()).hexdigest()


def _send_code(user, db):
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.verify_code_hash = _hash_code(user.email, code)
    user.verify_expires = utc_now() + timedelta(minutes=15)
    db.commit()
    _attempts.pop(user.email, None)
    _last_sent[user.email] = time.time()
    try:
        send_verification_code(user.email, user.name, code)
    except Exception:
        raise HTTPException(status_code=502, detail="We couldn't send the email. Please try again in a minute.")


def _login_response(user):
    return {"token": create_token(user.id), "user": user_info(user)}


@router.get("/config")
def get_config():
    """Options the website needs (categories, prices, GCash number...)."""
    return {
        "school_email": config.SCHOOL_EMAIL,
        "email_verification": config.EMAIL_VERIFICATION,
        "categories": config.CATEGORIES,
        "reactions": config.REACTIONS,
        "meetup_spots": config.MEETUP_SPOTS,
        "report_reasons": config.REPORT_REASONS,
        "boost_plans": [{"days": d, "price": p} for d, p in config.BOOST_PLANS.items()],
        "verified_price": config.VERIFIED_PRICE,
        "verified_days": config.VERIFIED_DAYS,
        "gcash_number": config.GCASH_NUMBER,
        "gcash_name": config.GCASH_NAME,
        "max_photos": config.MAX_PHOTOS,
        "google_client_id": config.GOOGLE_CLIENT_ID or None,
    }


@router.post("/register")
def register(data: RegisterData, db=Depends(get_db)):
    email = data.email.strip().lower()
    if not email.endswith(config.SCHOOL_EMAIL):
        raise HTTPException(status_code=400, detail=f"Only FSUU emails ({config.SCHOOL_EMAIL}) can register")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not data.name.strip() or not data.contact.strip():
        raise HTTPException(status_code=400, detail="Please fill in your name and contact")

    user = db.query(User).filter(User.email == email).first()
    if user and user.email_verified:
        raise HTTPException(status_code=400, detail="This email is already registered")

    if user is None:
        user = User(email=email)
        db.add(user)
    # (an unverified account can be registered again, e.g. if the code was lost)
    user.name = data.name.strip()
    user.contact = data.contact.strip()
    user.password_hash = hash_password(data.password)
    user.email_verified = not config.EMAIL_VERIFICATION
    db.commit()
    db.refresh(user)

    if config.EMAIL_VERIFICATION:
        _send_code(user, db)
        return {"needs_verification": True, "email": email}
    return _login_response(user)


@router.post("/login")
def login(data: LoginData, db=Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user and user.password_hash.startswith(GOOGLE_ONLY):
        raise HTTPException(status_code=400, detail="This account uses Google. Tap “Continue with Google” instead.")
    if not user or not check_password(data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Wrong email or password")
    if user.banned:
        raise HTTPException(status_code=403, detail="Your account has been suspended. Contact the admin.")
    if not user.email_verified:
        if time.time() - _last_sent.get(email, 0) > 60:
            _send_code(user, db)
        return {"needs_verification": True, "email": email}
    return _login_response(user)


@router.post("/verify-email")
def verify_email(data: VerifyData, db=Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or user.email_verified:
        raise HTTPException(status_code=400, detail="Nothing to verify. Try logging in.")
    if _attempts.get(email, 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many wrong codes. Tap “Send a new code”.")
    if not user.verify_expires or user.verify_expires < utc_now():
        raise HTTPException(status_code=400, detail="That code expired. Tap “Send a new code”.")
    if _hash_code(email, data.code.strip()) != user.verify_code_hash:
        _attempts[email] = _attempts.get(email, 0) + 1
        raise HTTPException(status_code=400, detail="Wrong code. Check your email (and the Spam folder).")

    user.email_verified = True
    user.verify_code_hash = None
    db.commit()
    return _login_response(user)


@router.post("/resend-code")
def resend_code(data: EmailData, db=Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or user.email_verified:
        return {"ok": True}
    wait = 60 - (time.time() - _last_sent.get(email, 0))
    if wait > 0:
        raise HTTPException(status_code=429, detail=f"Please wait {int(wait)} seconds before asking for a new code.")
    _send_code(user, db)
    return {"ok": True}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user_info(user)


@router.patch("/me")
def update_profile(data: ProfileData, db=Depends(get_db), me=Depends(get_current_user)):
    if not data.name.strip() or not data.contact.strip():
        raise HTTPException(status_code=400, detail="Name and contact can't be empty")
    me.name = data.name.strip()[:80]
    me.contact = data.contact.strip()[:80]
    me.bio = data.bio.strip()[:300]
    db.commit()
    return user_info(me)


@router.post("/me/avatar")
async def upload_avatar(photo: UploadFile = File(...), db=Depends(get_db), me=Depends(get_current_user)):
    new_url = await save_photo(photo, db, max_side=400)
    delete_photo(me.avatar_url, db)
    me.avatar_url = new_url
    db.commit()
    return user_info(me)


@router.delete("/me/avatar")
def remove_avatar(db=Depends(get_db), me=Depends(get_current_user)):
    delete_photo(me.avatar_url, db)
    me.avatar_url = None
    db.commit()
    return user_info(me)


# ======================= Continue with Google =======================

GOOGLE_ONLY = "google-only:"  # password placeholder for accounts made with Google
_google_keys = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", cache_keys=True)


def verify_google_token(credential):
    """Checks the token really came from Google, for our app, and isn't expired."""
    try:
        signing_key = _google_keys.get_signing_key_from_jwt(credential)
        return jwt.decode(
            credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=config.GOOGLE_CLIENT_ID,
            issuer=["accounts.google.com", "https://accounts.google.com"],
            leeway=30,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Google sign-in failed. Please try again.")


def _copy_google_photo(url, db):
    """Uses the person's Google profile picture as their avatar (if it works)."""
    if not url or not url.startswith("https://"):
        return None
    try:
        with urllib.request.urlopen(url.replace("=s96-c", "=s400-c"), timeout=5) as response:
            return save_image_bytes(response.read(4 * 1024 * 1024), db, max_side=400)
    except Exception:
        return None


@router.post("/auth/google")
def google_login(data: GoogleData, db=Depends(get_db)):
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Google sign-in is not set up yet")
    info = verify_google_token(data.credential)

    email = (info.get("email") or "").strip().lower()
    if not info.get("email_verified") or not email:
        raise HTTPException(status_code=400, detail="Your Google email isn't verified")
    if not email.endswith(config.SCHOOL_EMAIL):
        raise HTTPException(status_code=400, detail=f"Please use your FSUU Google account ({config.SCHOOL_EMAIL})")

    sub = info["sub"]
    user = db.query(User).filter(User.google_sub == sub).first() or db.query(User).filter(User.email == email).first()
    is_new = user is None

    if user and user.banned:
        raise HTTPException(status_code=403, detail="Your account has been suspended. Contact the admin.")

    if is_new:
        user = User(
            email=email,
            name=(info.get("name") or email.split("@")[0]).strip()[:80],
            contact="",  # asked right after the first sign-in
            password_hash=GOOGLE_ONLY + secrets.token_hex(16),
        )
        db.add(user)
        db.flush()
    user.google_sub = sub
    user.email_verified = True  # Google already checked the email
    user.verify_code_hash = None
    if not user.avatar_url:
        user.avatar_url = _copy_google_photo(info.get("picture"), db)
    db.commit()
    db.refresh(user)
    return {**_login_response(user), "new": is_new}
