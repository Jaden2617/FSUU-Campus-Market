from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base

engine = create_engine("sqlite:///./market.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    contact = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

class Listing(Base):
    __tablename__ = "listings"
    id = Column(Integer, primary_key=True)
    seller_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    category = Column(String, nullable=False)
    description = Column(String, default="")
    seller_name = Column(String, nullable=False)
    contact = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

Base.metadata.create_all(bind=engine)