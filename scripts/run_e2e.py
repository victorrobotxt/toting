#!/usr/bin/env python3
import requests, os, time

BASE = os.getenv("BASE_URL", "http://localhost:8000")

# 1. create election
payload = {"metadata": "{\"title\": \"E2E\"}"}
r = requests.post(f"{BASE}/elections", json=payload)
r.raise_for_status()
eid = r.json()["id"]

# 2. login
r = requests.get(f"{BASE}/auth/callback", params={"user":"e2e@example.com"})
r.raise_for_status()
token = r.json()["id_token"]
headers = {"Authorization": f"Bearer {token}"}

# 2a. eligibility proof
elig = {"country":"US","dob":"1990-01-01","residency":"CA"}
job = requests.post(f"{BASE}/api/zk/eligibility", json=elig, headers=headers).json()["job_id"]
status = requests.get(f"{BASE}/api/zk/eligibility/{job}").json()
assert status["status"] == "done"

# 2b. voice proof
voice = {"credits":[1,2],"nonce":1}
job = requests.post(f"{BASE}/api/zk/voice", json=voice, headers=headers).json()["job_id"]
status = requests.get(f"{BASE}/api/zk/voice/{job}").json()
assert status["status"] == "done"

# 3. batch tally proof
job = requests.post(f"{BASE}/api/zk/batch_tally", json={"election_id": eid}, headers=headers).json()["job_id"]
status = requests.get(f"{BASE}/api/zk/batch_tally/{job}").json()
assert status["status"] == "done"

print("E2E workflow succeeded")
