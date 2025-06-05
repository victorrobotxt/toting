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


class ProofRequest(Base):
    __tablename__ = "proof_requests"
    id = Column(Integer, primary_key=True)
    user = Column(String, nullable=False, index=True)
    day = Column(String, nullable=False, index=True)
    count = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("idx_user_day", "user", "day", unique=True),
    )


class Circuit(Base):
    __tablename__ = "circuits"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, index=True)
    version = Column(Integer, nullable=False)
    circuit_hash = Column(String, nullable=False)
    ptau_version = Column(Integer, nullable=False)
    zkey_version = Column(Integer, nullable=False)
    active = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("idx_circuit_name_version", "name", "version", unique=True),
    )


class ProofAudit(Base):
    __tablename__ = "proof_audit"
    id = Column(Integer, primary_key=True)
    circuit_hash = Column(String, nullable=False)
    input_hash = Column(String, nullable=False)
    proof_root = Column(String, nullable=False, index=True)
    timestamp = Column(String, nullable=False)

