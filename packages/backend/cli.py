import json
import typer
from datetime import datetime
from .db import SessionLocal, ProofAudit

app = typer.Typer()

@app.command()
def audit_proof(tx_hash: str = typer.Argument(...)):
    db = SessionLocal()
    row = db.query(ProofAudit).filter_by(proof_root=tx_hash).first()
    if not row:
        typer.echo("not found")
        raise typer.Exit(code=1)
    ts = row.timestamp
    if hasattr(ts, "isoformat"):
        ts = ts.isoformat()
    data = {
        "circuit_hash": row.circuit_hash,
        "input_hash": row.input_hash,
        "proof_root": row.proof_root,
        "timestamp": ts,
    }
    typer.echo(json.dumps(data))

if __name__ == "__main__":
    app()

