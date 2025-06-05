import json
from concurrent import futures
import grpc

from .proto import proof_pb2, proof_pb2_grpc
from .proof import generate_proof, celery_app

class ProofService(proof_pb2_grpc.ProofServiceServicer):
    def Generate(self, request, context):
        try:
            inputs = json.loads(request.input_json)
        except json.JSONDecodeError:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details('invalid json')
            return proof_pb2.GenerateResponse()
        meta = dict(context.invocation_metadata())
        curve = meta.get("x-curve", "bn254").lower()
        job = generate_proof.delay(request.circuit, inputs, curve)
        return proof_pb2.GenerateResponse(job_id=job.id)

    def Status(self, request, context):
        async_result = celery_app.AsyncResult(request.job_id)
        state = async_result.state
        if state in {"PENDING", "STARTED"}:
            return proof_pb2.StatusResponse(state=state.lower())
        if state == "SUCCESS":
            res = async_result.result
            return proof_pb2.StatusResponse(state="done", proof=res["proof"], pubSignals=res["pubSignals"])
        return proof_pb2.StatusResponse(state="error")


def serve(port: int = 50051):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    proof_pb2_grpc.add_ProofServiceServicer_to_server(ProofService(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    return server

