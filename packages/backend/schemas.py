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
    meta_hash: str = Field(..., example="0x" + "a" * 64)

class UpdateElectionSchema(BaseModel):
    status: Optional[str] = Field(None, example="open")
    tally: Optional[str] = Field(None, example="A:10,B:5")

class ElectionSchema(BaseModel):
    id: int
    meta: str
    start: int
    end: int
    status: str
    tally: Optional[str] = None

    class Config:
        from_attributes = True


# --- Schema for Proof Auditing ---

class ProofAuditSchema(BaseModel):
    id: int
    circuit_hash: str
    input_hash: str
    proof_root: str
    timestamp: str

    class Config:
        from_attributes = True