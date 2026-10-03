from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, DateTime, ForeignKey,
    Boolean, Text, UniqueConstraint, inspect, text,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship

# New file name, so the old market.db is not used anymore
engine = create_engine("sqlite:///./campus_market.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    contact = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)  # profile picture
    created_at = Column(DateTime, default=datetime.now)


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
    image_url = Column(String, nullable=True)
    status = Column(String, default="available")  # available / sold / found
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User")


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User")


class Reaction(Base):
    """Each user can have one reaction per post (like Facebook)."""
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id"),)
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    emoji = Column(String, nullable=False)


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)  # which item they're asking about
    text = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)


Base.metadata.create_all(bind=engine)


# Adds new columns to an existing database, so you don't have to delete it
# and register again every time we add a feature.
def add_missing_columns():
    new_columns = {"users": {"avatar_url": "VARCHAR"}}
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, columns in new_columns.items():
            existing = {c["name"] for c in inspector.get_columns(table)}
            for name, sql_type in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


add_missing_columns()
