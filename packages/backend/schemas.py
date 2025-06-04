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
    start: int
    end: int

    @validator("meta_hash")
    def validate_meta(cls, v):
        if not re.fullmatch(r"0x[a-fA-F0-9]{64}", v):
            raise ValueError("meta_hash must be 0x-prefixed 32-byte hex string")
        return v

    @validator("end")
    def check_end(cls, v, values):
        start = values.get("start")
        if start is not None and v <= start:
            raise ValueError("end must be greater than start")
        return v


class UpdateElectionSchema(BaseModel):
    status: Optional[str] = None
    tally: Optional[str] = None

    @validator("status")
    def valid_status(cls, v):
        if v not in {"pending", "open", "closed", "tallied"}:
            raise ValueError("invalid status")
        return v

