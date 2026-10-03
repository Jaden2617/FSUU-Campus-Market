"""Sends the 6-digit verification code by email using Brevo's free API.
(Render's free plan blocks normal email sending, so we use Brevo's web API.)"""
import json
import urllib.request

from config import BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME


def send_verification_code(to_email, name, code):
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px">
      <h2 style="color:#1e3a8a;margin:0 0 12px">Urios Market</h2>
      <p>Hi {name},</p>
      <p>Your verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1d4ed8;margin:16px 0">{code}</p>
      <p style="color:#64748b">It expires in 15 minutes. If you didn't sign up, you can ignore this email.</p>
    </div>
    """
    body = json.dumps({
        "sender": {"email": EMAIL_FROM, "name": EMAIL_FROM_NAME},
        "to": [{"email": to_email, "name": name}],
        "subject": f"{code} is your Urios Market code",
        "htmlContent": html,
    }).encode()
    request = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=body,
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return 200 <= response.status < 300
