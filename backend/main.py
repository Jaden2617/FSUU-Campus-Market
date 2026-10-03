from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import SessionLocal, Listing

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ListingCreate(BaseModel):
    title: str
    price: float
    category: str
    description: str = ""
    seller_name: str
    contact: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def home():
    return {"message": "Campus Market is running!"}

@app.get("/listings")
def get_listings(db=Depends(get_db)):
    return db.query(Listing).order_by(Listing.id.desc()).all()

@app.post("/listings")
def create_listing(data: ListingCreate, db=Depends(get_db)):
    listing = Listing(**data.model_dump())
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing