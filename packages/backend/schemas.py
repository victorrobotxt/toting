from pydantic import BaseModel
from typing import Optional

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

