"""Urios Market backend. Start it with:  uvicorn main:app --reload

Settings (school email, admin emails, GCash number, prices) are in config.py.
Each part of the app has its own file in the routes folder.
"""
import os

from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from auth import get_db
from database import Photo
from routes import accounts, posts, social, messages, market, admin

app = FastAPI(title="Urios Market")

# Login uses a token in the request header (not cookies),
# so it's safe to let the website call the API from any address.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Old photos from before photos were saved in the database
UPLOAD_DIR = "uploads"
if os.path.isdir(UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


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


app.include_router(accounts.router)
app.include_router(posts.router)
app.include_router(social.router)
app.include_router(messages.router)
app.include_router(market.router)
app.include_router(admin.router)
