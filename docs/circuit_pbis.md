# Circuit PBIs

The following product backlog items (PBIs) outline planned improvements to the ZK circuits.

## C-01 Eligibility v2
- ZK circuit overhaul for passport / age / residency.
- Support up to 3 independent eligibility proofs in a single witness (boolean OR logic).
- Inputs: Merkle path for country list, birth-date commit, residence commit.
- Constraints < 140k R1CS constraints.
- Must still compile in < 30 s on CI.
- Unit tests in `circuits/eligibility/__tests__` proving ≥ 99 % valid, 100 % invalid rejection.

## C-02 Voice-Credits Range Proof
- Prevent overflow / negative credit injection.
- Add field range checks `0 ≤ vc ≤ 1 000 000`.
- Enforce quadratic cost formula inside circuit to close "cheap vote" loophole.
- Groth16 proof size unchanged (≈ 192 bytes).

## C-03 Batch Tally
- Aggregate 128 encrypted ballots per proof.
- Circuit takes an array of 128 ElGamal ciphertexts + public key, outputs `(sumA, sumB)`.
- Provide a Poseidon root to let contracts verify subsets.
- Constraint budget ≤ 6 M.
- Benchmark script dumps R1CS, generates zkey, exports verifier (Sol) + `tally.wasm`.

## C-04 SnarkJS Pipeline
- Reusable Makefile + cache.
- `make circuits` rebuilds only dirty `.circom` files.
- Output artifacts in `artifacts/{name}/{hash}/` with Git LFS-friendly `.gitignore` stub.
- CI job checks hash drift vs. committed verifier.

## C-05 Proof Fuzzing Harness
- Negative-testing with `ffmpeg-wasm` noise.
- Generate 1 000 random bad witnesses per circuit; ensure verifier reverts.
