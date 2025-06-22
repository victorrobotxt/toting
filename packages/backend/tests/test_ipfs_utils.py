import hashlib
from base58 import b58encode
import json
import types

import pytest

from backend.utils import ipfs


def test_pin_json_success(monkeypatch):
    responses = types.SimpleNamespace(called=False)

    def mock_post(url, files, headers, timeout):
        responses.called = True
        class R:
            def raise_for_status(self):
                pass
            def json(self):
                return {"Hash": "Qm123"}
        assert files["file"] == b"{}"
        return R()
    monkeypatch.setattr(ipfs.requests, "post", mock_post)
    cid = ipfs.pin_json("{}")
    assert responses.called
    assert cid == "Qm123"


def test_pin_json_fallback(monkeypatch):
    monkeypatch.setattr(ipfs.requests, "post", lambda *a, **k: (_ for _ in ()).throw(Exception("boom")))
    data = "{\"a\":1}"
    cid = ipfs.pin_json(data)
    digest = hashlib.sha256(data.encode()).digest()
    expected = b58encode(b"\x12\x20" + digest).decode()
    assert cid == expected


def test_cid_from_meta_hash():
    digest = hashlib.sha256(b"x").hexdigest()
    cid = ipfs.cid_from_meta_hash("0x" + digest)
    expected = b58encode(b"\x12\x20" + bytes.fromhex(digest)).decode()
    assert cid == expected


def test_cid_from_meta_hash_invalid():
    with pytest.raises(ValueError):
        ipfs.cid_from_meta_hash("0xzzzz")


def test_fetch_json(monkeypatch):
    def mock_get(url, timeout):
        class R:
            def raise_for_status(self):
                pass
            def json(self):
                return {"ok": True}
        return R()
    monkeypatch.setattr(ipfs.requests, "get", mock_get)
    assert ipfs.fetch_json("cid1") == {"ok": True}
