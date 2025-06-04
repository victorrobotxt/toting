# packages/backend/main.py
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from jose import jwt
import httpx, os

app = FastAPI()

# OAuth2 config (real GRAO or fallback to dummy)
IDP_BASE   = os.getenv("GRAO_BASE_URL", "https://demo-oauth.example")
CLIENT_ID  = os.getenv("GRAO_CLIENT_ID", "test-client")
CLIENT_SEC = os.getenv("GRAO_CLIENT_SECRET", "test-secret")
REDIRECT   = os.getenv("GRAO_REDIRECT_URI", "http://localhost:3000/callback")

@app.get("/auth/initiate")
def initiate():
    url = (
        f"{IDP_BASE}/authorize?"
        f"response_type=code&client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT}&scope=openid email"
    )
    return RedirectResponse(url)

@app.get("/auth/callback")
async def callback(code: str):
    """
    In real life you would exchange `code` for an ID‑token at the OAuth server.
    For local testing we just mint a fake JWT and return 200.
    """
    # ⚠️ DON’T DO THIS IN PROD – it is ONLY for the smoke test
    fake_jwt = (
        "ey.fake."
        "base64"  # <<< any string, we're not verifying it yet
    )
    return {"id_token": fake_jwt, "eligibility": True}


@app.get("/api/gas")
async def gas_estimate():
    """Return a fake 95th percentile gas fee in gwei."""
    return {"p95": 42}
