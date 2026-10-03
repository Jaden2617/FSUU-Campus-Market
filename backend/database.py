import os
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, DateTime, ForeignKey,
    Boolean, Text, UniqueConstraint, LargeBinary, inspect, text,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship

# On your computer: uses the SQLite file campus_market.db
# Online: uses the Postgres database in the DATABASE_URL setting (from Neon)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./campus_market.db")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Neon gives "postgresql://..." — tell SQLAlchemy to use the psycopg driver
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
    # pool_pre_ping reconnects after the free database goes to sleep
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)

SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


def utc_now():
    """All times are saved in UTC (world time). The browser converts them
    to Philippine time, so "Just now" is correct on any server."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ======================= Accounts =======================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    contact = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)        # profile picture
    bio = Column(Text, default="")
    banned = Column(Boolean, default=False)           # blocked by an admin
    email_verified = Column(Boolean, default=True)
    verify_code_hash = Column(String, nullable=True)  # 6-digit email code (scrambled)
    verify_expires = Column(DateTime, nullable=True)
    verified_until = Column(DateTime, nullable=True)  # paid "Verified seller" badge
    created_at = Column(DateTime, default=utc_now)


class Friendship(Base):
    """A friend request. status: "pending" until accepted, then "accepted"."""
    __tablename__ = "friendships"
    id = Column(Integer, primary_key=True)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    addressee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=utc_now)


# ======================= Posts =======================

class Post(Base):
    """One post in the News Feed. type is "selling" or "looking"."""
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False, default="selling")
    title = Column(String, nullable=False)
    price = Column(Float, nullable=True)          # price (selling) or budget (looking)
    category = Column(String, nullable=False)
    description = Column(Text, default="")
    image_url = Column(String, nullable=True)     # first photo (kept for older posts)
    meetup_spot = Column(String, nullable=True)
    status = Column(String, default="available")  # available / sold / found
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    hidden = Column(Boolean, default=False)       # hidden by an admin
    boosted_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])


class PostPhoto(Base):
    """Up to 4 photos per post."""
    __tablename__ = "post_photos"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    url = Column(String, nullable=False)
    position = Column(Integer, default=0)


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now)

    user = relationship("User")


class Reaction(Base):
    """Each user can have one reaction per post (like Facebook)."""
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id"),)
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    emoji = Column(String, nullable=False)


class SavedPost(Base):
    __tablename__ = "saved_posts"
    __table_args__ = (UniqueConstraint("post_id", "user_id"),)
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now)


class Rating(Base):
    """A buyer rates the seller after a deal (1 to 5 stars)."""
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("post_id", "rater_id"),)
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)  # empty if the post was deleted
    post_title = Column(String, default="")
    rater_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    stars = Column(Integer, nullable=False)
    comment = Column(Text, default="")
    created_at = Column(DateTime, default=utc_now)


# ======================= Photos =======================

class Photo(Base):
    """Photos are saved inside the database, so they are not lost when the
    free online server restarts."""
    __tablename__ = "photos"
    __table_args__ = {"sqlite_autoincrement": True}  # never reuse a deleted photo's number
    id = Column(Integer, primary_key=True)
    data = Column(LargeBinary, nullable=False)
    content_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now)


# ======================= Messages & notifications =======================

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)  # which item they're asking about
    text = Column(Text, nullable=False, default="")
    image_url = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)


class Notification(Base):
    """type: comment, reaction, friend_request, friend_accept, sold_to_you,
    rating, payment, report, admin"""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)   # who receives it
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # who did it
    type = Column(String, nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)
    text = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)

    actor = relationship("User", foreign_keys=[actor_id])


# ======================= Safety & money =======================

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)
    reported_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reason = Column(String, nullable=False)
    details = Column(Text, default="")
    status = Column(String, default="open")  # open / resolved / dismissed
    created_at = Column(DateTime, default=utc_now)


class PaymentRequest(Base):
    """A GCash payment for a boost or a verified badge, waiting for admin approval."""
    __tablename__ = "payment_requests"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kind = Column(String, nullable=False)           # "boost" or "verified"
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)
    days = Column(Integer, nullable=False)
    amount = Column(Integer, nullable=False)
    reference = Column(String, nullable=False)       # GCash reference number
    status = Column(String, default="pending")       # pending / approved / rejected
    created_at = Column(DateTime, default=utc_now)
    reviewed_at = Column(DateTime, nullable=True)


class Ad(Base):
    """Sponsored cards from nearby businesses, shown in the feed."""
    __tablename__ = "ads"
    id = Column(Integer, primary_key=True)
    business_name = Column(String, nullable=False)
    title = Column(String, nullable=False)
    text = Column(Text, default="")
    image_url = Column(String, nullable=True)
    link_url = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)


Base.metadata.create_all(bind=engine)


# Adds new columns to an existing database, so you don't have to delete it
# and register again every time we add a feature.
NEW_COLUMNS = {
    "users": {
        "avatar_url": "VARCHAR",
        "bio": "TEXT DEFAULT ''",
        "banned": "BOOLEAN DEFAULT FALSE",
        "email_verified": "BOOLEAN DEFAULT TRUE",
        "verify_code_hash": "VARCHAR",
        "verify_expires": "TIMESTAMP",
        "verified_until": "TIMESTAMP",
    },
    "posts": {
        "meetup_spot": "VARCHAR",
        "buyer_id": "INTEGER",
        "hidden": "BOOLEAN DEFAULT FALSE",
        "boosted_until": "TIMESTAMP",
        "updated_at": "TIMESTAMP",
    },
    "messages": {
        "image_url": "VARCHAR",
    },
}


def add_missing_columns():
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, columns in NEW_COLUMNS.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, sql_type in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


add_missing_columns()
