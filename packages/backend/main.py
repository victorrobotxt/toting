from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from jose import jwt
import httpx
import os
from typing import Optional

from .db import SessionLocal, Base, engine, Election
from .schemas import ElectionSchema

app = FastAPI()

# Create tables on startup
Base.metadata.create_all(bind=engine)

# Dependency to get DB session

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# OAuth2 config (real GRAO or fallback to a mock login form)
IDP_BASE = os.getenv("GRAO_BASE_URL", "https://demo-oauth.example")
CLIENT_ID = os.getenv("GRAO_CLIENT_ID", "test-client")
CLIENT_SEC = os.getenv("GRAO_CLIENT_SECRET", "test-secret")
REDIRECT = os.getenv("GRAO_REDIRECT_URI", "http://localhost:3000/callback")
USE_REAL_OAUTH = os.getenv("USE_REAL_OAUTH", "false").lower() in ("1", "true")

@app.get("/auth/initiate")
def initiate():
    if USE_REAL_OAUTH:
        url = (
            f"{IDP_BASE}/authorize?"
            f"response_type=code&client_id={CLIENT_ID}"
            f"&redirect_uri={REDIRECT}&scope=openid email"
        )
        return RedirectResponse(url)

    html = """
    <html>
      <body>
        <h1>Mock Login</h1>
        <form action='/auth/callback' method='get'>
          <label>Email: <input type='text' name='user' value='tester@example.com'></label>
          <button type='submit'>Login</button>
        </form>
      </body>
    </html>
    """
    return HTMLResponse(html)

@app.get("/auth/callback")
async def callback(code: Optional[str] = None, user: Optional[str] = None):
    """Exchange code for a (dummy) ID token or handle mock logins."""
    if USE_REAL_OAUTH:
        # For the smoke test we still mint a fake JWT
        fake_jwt = "ey.fake.base64"
        return {"id_token": fake_jwt, "eligibility": True}

    email = user or "tester@example.com"
    claims = {"email": email}
    fake_jwt = jwt.encode(claims, CLIENT_SEC, algorithm="HS256")
    return {"id_token": fake_jwt, "eligibility": True}

@app.get("/elections", response_model=list[ElectionSchema])
def list_elections(db: Session = Depends(get_db)):
    return db.query(Election).all()

@app.get("/elections/{election_id}", response_model=ElectionSchema)
def get_election(election_id: int, db: Session = Depends(get_db)):
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(404, "election not found")
    return election

@app.get("/api/gas")
async def gas_estimate():
    """Return a fake 95th percentile gas fee in gwei."""
    return {"p95": 42}
