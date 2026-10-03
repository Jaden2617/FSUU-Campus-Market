from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base

engine = create_engine("sqlite:///./market.db", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Listing(Base):
    __tablename__ = "listings"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    category = Column(String, nullable=False)
    description = Column(String, default="")
    seller_name = Column(String, nullable=False)
    contact = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

Base.metadata.create_all(bind=engine)