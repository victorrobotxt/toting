import os
import hashlib
import json

os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("CIRCUIT_MANIFEST", os.path.join(os.path.dirname(__file__), "test_manifest.json"))

from backend import proof


def test_dummy_proof_eligibility():
    inputs = {"a": 1}
    res = proof._dummy_proof("eligibility", inputs)
    h = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    expected_proof = {
        "a": [f"0x{h[0:8]}", f"0x{h[8:16]}"],
        "b": [[f"0x{h[16:24]}", f"0x{h[24:32]}"], [f"0x{h[32:40]}", f"0x{h[40:48]}"]],
        "c": [f"0x{h[48:56]}", f"0x{h[56:64]}"]
    }
    expected_pub = [int(h[i:i+8], 16) for i in range(0,56,8)]
    assert res["proof"] == expected_proof
    assert res["pubSignals"] == expected_pub


def test_dummy_proof_other():
    inputs = {"b": 2}
    res = proof._dummy_proof("voice", inputs)
    h = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    assert res["proof"] == f"0x{h[:64]}"
    assert res["pubSignals"] == [int(h[i:i+8], 16) for i in range(0,56,8)]


def test_cache_key_and_cache_get(monkeypatch):
    monkeypatch.setattr(proof, "get_circuit_hash", lambda c, curve: "hash")
    inputs = {"x": 1}
    key = proof.cache_key("eligibility", inputs, "bn254")
    expected = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode() + b"hash").hexdigest()
    assert key == expected

    proof.PROOF_CACHE.clear()
    assert proof.cache_get("eligibility", inputs, "bn254") is None
    proof.PROOF_CACHE[key] = {"proof": 1}
    assert proof.cache_get("eligibility", inputs, "bn254") == {"proof": 1}


def test_cache_get_bad_hash(monkeypatch):
    monkeypatch.setattr(proof, "get_circuit_hash", lambda *a, **k: "")
    assert proof.cache_get("bad", {"x":0}, "bn254") is None
