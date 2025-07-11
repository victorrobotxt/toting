from pydantic import BaseModel, Field
from typing import Optional, List

# --- Schemas for ZK Proof Generation ---

class EligibilityInput(BaseModel):
    country: str = Field(..., example="US")
    dob: str = Field(..., example="1990-01-01")
    residency: str = Field(..., example="CA")

class VoiceInput(BaseModel):
    credits: List[int] = Field(..., example=[1, 4, 9])
    nonce: int = Field(..., example=1)

class BatchTallyInput(BaseModel):
    election_id: int = Field(..., example=1)


# --- Schemas for Election Management ---

class CreateElectionSchema(BaseModel):
    # The frontend will now send the full JSON metadata as a string
    metadata: str = Field(..., example='{"title": "My Election", "options": []}')
    verifier: Optional[str] = Field(None, example="0xabc123...")

class UpdateElectionSchema(BaseModel):
    status: Optional[str] = Field(None, example="open")
    tally: Optional[str] = Field(None, example="A:10,B:5")

class ElectionSchema(BaseModel):
    id: int
    meta: str
    start: int
    end: int
    status: str
    verifier: Optional[str] = None
    tally: Optional[str] = None
    # We don't need to expose the full metadata in the list view

    class Config:
        orm_mode = True


# --- Schema for Proof Auditing ---

class ProofAuditSchema(BaseModel):
    id: int
    circuit_hash: str
    input_hash: str
    proof_root: str
    timestamp: str

    class Config:
        orm_mode = True
