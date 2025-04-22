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
    # Exchange code for tokens
    token_url = f"{IDP_BASE}/token"
    data = {
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  REDIRECT,
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SEC,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(token_url, data=data)
    if resp.status_code != 200:
        raise HTTPException(400, "token exchange failed")
    tokens = resp.json()

    # Validate ID token signature (no real verification in test mode)
    try:
        claims = jwt.decode(
            tokens["id_token"],
            os.getenv("GRAO_JWKS_URL"),    # in prod, point to GRAO JWKS
            options={"verify_signature": os.getenv("GRAO_JWKS_URL") is None},
            algorithms=["RS256"]
        )
    except Exception as e:
        raise HTTPException(400, f"invalid token: {e}")

    # Ensure eligibility claim
    if not claims.get("eligibility", False):
        raise HTTPException(403, "not eligible")
    # Return only pseudonymized sub and eligibility
    return {"sub": claims["sub"], "eligibility": True}
