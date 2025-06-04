from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    BigInteger,
    Index,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Election(Base):
    __tablename__ = "elections"
    id = Column(Integer, primary_key=True, index=True)
    meta = Column(String, nullable=False, unique=True)
    start = Column(BigInteger, nullable=False)
    end = Column(BigInteger, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    tally = Column(String, nullable=True)

    __table_args__ = (
        Index("idx_status", "status"),
    )

