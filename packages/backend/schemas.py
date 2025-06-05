from pydantic import BaseModel, validator
from typing import Optional
import re

class ElectionSchema(BaseModel):
    id: int
    meta: str
    start: int
    end: int
    status: str
    tally: Optional[str] = None

    class Config:
        orm_mode = True
        schema_extra = {"version": 1}


class CreateElectionSchema(BaseModel):
    meta_hash: str

    @validator("meta_hash")
    def validate_meta(cls, v):
        if not re.fullmatch(r"0x[a-fA-F0-9]{64}", v):
            raise ValueError("meta_hash must be 0x-prefixed 32-byte hex string")
        return v



class UpdateElectionSchema(BaseModel):
    status: Optional[str] = None
    tally: Optional[str] = None

    @validator("status")
    def valid_status(cls, v):
        if v not in {"pending", "open", "closed", "tallied"}:
            raise ValueError("invalid status")
        return v


class EligibilityInput(BaseModel):
    country: str
    dob: str
    residency: str

    class Config:
        extra = "forbid"

    @validator("country")
    def check_country(cls, v):
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("country must be ISO alpha-2 code")
        return v


class VoiceInput(BaseModel):
    credits: list[int]
    nonce: int

    class Config:
        extra = "forbid"

    @validator("credits")
    def check_range(cls, v):
        for c in v:
            if c < 0 or c > 1_000_000:
                raise ValueError("credits must be 0-1e6")
        return v


class BatchTallyInput(BaseModel):
    election_id: int

    class Config:
        extra = "forbid"

