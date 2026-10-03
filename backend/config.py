"""All the settings of Urios Market in one place.

On your computer, the values after the comma are used.
Online, Render's "Environment" settings replace them.
"""
import os


def _list(value):
    return [item.strip().lower() for item in value.split(",") if item.strip()]


# Only emails ending with this can register
SCHOOL_EMAIL = os.getenv("SCHOOL_EMAIL", "@urios.edu.ph").strip().lower()

# These accounts can open the Admin page (separate several emails with commas)
ADMIN_EMAILS = _list(os.getenv("ADMIN_EMAILS", "jaden.autentico@urios.edu.ph"))

# Signing key for login tokens (Render: set SECRET_KEY to long random text)
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-to-a-long-random-secret")

# ---- "Continue with Google" (optional) ----
# Leave empty to hide the Google button. Get it from Google Cloud > Credentials.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "962938590938-61l7gq7l9j41phk8t0d01e12g3jsrc2s.apps.googleusercontent.com").strip()

# ---- Email verification codes (optional) ----
# Leave BREVO_API_KEY empty to turn verification off.
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
EMAIL_FROM = os.getenv("EMAIL_FROM", "").strip()          # the sender you verified in Brevo
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Urios Market")
EMAIL_VERIFICATION = bool(BREVO_API_KEY and EMAIL_FROM)

# ---- GCash payments for boosts and verified badges ----
GCASH_NUMBER = os.getenv("GCASH_NUMBER", "09XX XXX XXXX")
GCASH_NAME = os.getenv("GCASH_NAME", "Urios Market Admin")

# Boost a post to the top of the feed: {days: price in pesos}
BOOST_PLANS = {1: 15, 3: 40, 7: 80}
# Verified seller badge
VERIFIED_PRICE = 49
VERIFIED_DAYS = 30

# ---- Market options ----
CATEGORIES = ["Food", "Preloved", "Services", "School Supplies", "Gadgets", "Clothes", "Others"]
REACTIONS = ["👍", "❤️", "😮", "😂"]
MEETUP_SPOTS = [
    "Main Lobby",
    "Library",
    "Canteen",
    "Gym",
    "Chapel",
    "Main Gate",
    "Covered Court",
    "Chat to agree",
]
REPORT_REASONS = [
    "Scam or fake item",
    "Prohibited item",
    "Rude or offensive",
    "Spam",
    "Wrong price or info",
    "Other",
]
MAX_PHOTOS = 4
