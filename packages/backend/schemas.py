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
    root: int
    nullifier: int
    Ax: int
    Ay: int
    R8x: int
    R8y: int
    S: int
    msgHash: int
    pathElements: list[int]
    pathIndices: list[int]

    class Config:
        extra = "forbid"

    @validator("pathElements", "pathIndices")
    def check_len(cls, v):
        if len(v) != 32:
            raise ValueError("expected length 32")
        return v

