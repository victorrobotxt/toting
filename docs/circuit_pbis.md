# Circuit PBIs

The following product backlog items (PBIs) outline planned improvements to the ZK circuits.

## C-01 Eligibility v2
- ZK circuit overhaul for passport / age / residency.
- Support up to 3 independent eligibility proofs in a single witness (boolean OR logic).
- Inputs: Merkle path for country list, birth-date commit, residence commit.
- Constraints < 140k R1CS constraints.
- Must still compile in < 30 s on CI.
- Unit tests in `circuits/eligibility/__tests__` proving ≥ 99 % valid, 100 % invalid rejection.

## C-02 Voice-Credits Range Proof *(Implemented)*
- Prevent overflow / negative credit injection.
- Add field range checks `0 ≤ vc ≤ 1 000 000`.
- Enforce quadratic cost formula inside circuit to close "cheap vote" loophole.
- Groth16 proof size unchanged (≈ 192 bytes).

## C-03 Batch Tally *(Implemented)*
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

## C-05 Proof Fuzzing Harness *(Implemented)*
- Negative-testing with `ffmpeg-wasm` noise.
- Generate 1 000 random bad witnesses per circuit; ensure verifier reverts.

## C-06 Deposit-Nullifier Circuit
- Groth16 circuit proving one-time deposit without leaking identity.
- ≤ 200 k constraints.
- Rejects duplicate nullifier in 1 000 negative tests.
- Solidity verifier auto-generated and unit-tested in Foundry.

This circuit checks a commitment's inclusion in a Merkle tree and
derives a nullifier from the same secret used in the commitment. The
public inputs are the Merkle root and resulting nullifier. Witnesses
contain the secret and Merkle path. A Poseidon-based proof ensures the
nullifier cannot be forged while keeping the secret private. The
Solidity verifier is generated from the Groth16 key and exercised in a
Foundry test that attempts 1 000 deposits with a reused nullifier,
expecting reverts after the first.

## C-07 Poseidon Hash Refactor
- Replace MiMC in all circuits with Poseidon (Arkworks params 3,5).
- Proof size must remain unchanged.
- Benchmarks ≤ 5 % slower than baseline.

## C-08 Recursive Batch-Tally v2
- Halo2 or Plonk recursion proof that rolls 8 × `C-03` tallies into one.
- Constraint budget ≤ 2 M.
- Prove & verify under 30 s on CI.

## C-09 Signal Range Proofs
- Generic gadget library for `0 ≤ value ≤ 2³²-1` usable by other circuits.
- Fuzz harness must find zero false negatives/positives.

## C-10 Parallel Witness Builder
- Rust `rayon` based `build_witness` saturating all cores.
- 2 × speed-up vs serial.
- Integrated in Makefile with CI proving speed shortcut.

## C-11 Multi-Curve Compatibility
- Port circuits to support BN254 and BLS12-381.
- Build matrix in CI.
- Contracts auto-select curve at deploy.

## C-12 Proof Compression Benchmark
- Script that compares zkey size, proof size and verifier gas across `C-01…C-11`.
- CI uploads CSV artefact.

## C-13 E2E Circuit Docs
- Architecture doc with constraint graphs, input tables and trusted setup workflow.
- Published as MkDocs site with diagrams exported from Circom graph.

## C-14 Multi-Proof Aggregator
- Groth16 → BLS12-381 aggregator that rolls up ≤ 512 vote proofs into one.
- Solidity verifier gas ≤ 6 M.
- AC: same public signals out, ≤ 5 s prove time on CI.
- Depends on **C-08**.

## C-15 Trusted-Setup Audit Kit
- Script reproduces PTAU & ZKey hashes, uploads to release.
- AC: `make audit` exits 0 on identical hashes, non-zero otherwise.
- Depends on **C-04**.

## C-16 Warp-Swap Curve Port
- Compile circuits for bn254 and curve25519 via CirC.
- AC: unit tests pass on both targets; Verifier gas delta ≤ +5 %.
- Depends on **C-11**.

## C-17 Hardware Keccak Gadget
- Verilog Poseidon ASIC stub + constraint mapping; prove on GPU CI runner.
- AC: FPGA sim < 150 ms per hash.
- Depends on **C-07**.

## C-18 Stateless Witness Builder
- Rust lib returns streaming iterator so browser can GC.
- Benchmark 30 % less peak RAM vs baseline.
- Depends on **C-10**.
