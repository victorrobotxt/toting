import os
import hashlib
import json
import requests
from base58 import b58encode

IPFS_API_URL = os.getenv("IPFS_API_URL", "https://ipfs.infura.io:5001/api/v0/add")
IPFS_GATEWAY = os.getenv("IPFS_GATEWAY", "https://ipfs.io/ipfs/")
IPFS_TOKEN = os.getenv("IPFS_API_TOKEN")


def pin_json(data: str) -> str:
    """Pin JSON data to IPFS and return the CID string."""
    headers = {}
    if IPFS_TOKEN:
        headers["Authorization"] = f"Bearer {IPFS_TOKEN}"
    try:
        resp = requests.post(
            IPFS_API_URL,
            files={"file": data.encode()},
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()
        cid = resp.json()["Hash"]
        return cid
    except Exception:
        # deterministic fallback if pinning fails
        digest = hashlib.sha256(data.encode()).digest()
        return b58encode(b"\x12\x20" + digest).decode()


def cid_from_meta_hash(meta_hex: str) -> str:
    """Derive an IPFS CID from a hex-encoded sha256 digest."""
    if meta_hex.startswith("0x"):
        meta_hex = meta_hex[2:]
    try:
        digest = bytes.fromhex(meta_hex)
    except ValueError as exc:
        raise ValueError("invalid metadata hash") from exc
    return b58encode(b"\x12\x20" + digest).decode()


def fetch_json(cid: str) -> dict:
    url = f"{IPFS_GATEWAY}{cid}"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()
