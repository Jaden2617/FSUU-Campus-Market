from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import Listing, User
from auth import get_db, hash_password, check_password, create_token, get_current_user

# Change this to the ending of your FSUU email
SCHOOL_EMAIL = "@urios.edu.ph"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegisterData(BaseModel):
    name: str
    email: str
    contact: str
    password: str

class LoginData(BaseModel):
    email: str
    password: str

class ListingCreate(BaseModel):
    title: str
    price: float
    category: str
    description: str = ""

def user_info(user):
    return {"id": user.id, "name": user.name, "email": user.email, "contact": user.contact}

@app.get("/")
def home():
    return {"message": "Campus Market is running!"}

@app.post("/register")
def register(data: RegisterData, db=Depends(get_db)):
    email = data.email.strip().lower()
    if not email.endswith(SCHOOL_EMAIL):
        raise HTTPException(status_code=400, detail=f"Only FSUU emails ({SCHOOL_EMAIL}) can register")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="This email is already registered")

    user = User(
        name=data.name,
        email=email,
        contact=data.contact,
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

@app.get("/listings")
def get_listings(db=Depends(get_db)):
    return db.query(Listing).order_by(Listing.id.desc()).all()

@app.post("/listings")
def create_listing(data: ListingCreate, db=Depends(get_db), user=Depends(get_current_user)):
    listing = Listing(
        **data.model_dump(),
        seller_id=user.id,
        seller_name=user.name,
        contact=user.contact,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing