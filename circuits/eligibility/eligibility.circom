pragma circom 2.1.6;

// Uses Poseidon hash with Arkworks parameters (t=3,5)
include "../circomlib/circuits/eddsaposeidon.circom";
include "../circomlib/circuits/poseidon.circom";

// Stub Merkle proof: checks leaf == root

// 3) Stub Merkle proof: checks leaf == root
template MerkleProof(depth) {
    signal input root;
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    // trivial proof: leaf must equal root
    leaf === root;
}

// ========== ELIGIBILITY CIRCUIT ==========
// Verifies: ECDSA sig, membership in Merkle tree, and nullifier derivation
template Eligibility(depth) {
    // --- PUBLIC INPUTS ---
    signal input root;       // Merkle root
    signal input nullifier;  // Nullifier output

    // --- WITNESS INPUTS ---
    signal input Ax;
    signal input Ay;
    signal input R8x;
    signal input R8y;
    signal input S;
    signal input msgHash;             // Hash of the challenge message
    signal input pathElements[depth]; // Merkle sibling hashes
    signal input pathIndices[depth];  // Merkle path indices

    // 1) EdDSA signature check
    component ed = EdDSAPoseidonVerifier();
    ed.enabled <== 1;
    ed.Ax <== Ax;
    ed.Ay <== Ay;
    ed.R8x <== R8x;
    ed.R8y <== R8y;
    ed.S <== S;
    ed.M <== msgHash;

    // 2) Compute leaf = Poseidon(pkX, pkY) (stub)
    component leafHash = Poseidon(2);
    leafHash.inputs[0] <== Ax;
    leafHash.inputs[1] <== Ay;

    // 3) Merkle proof: ensure leaf ∈ tree (stub)
    component merkleProof = MerkleProof(depth);
    merkleProof.root           <== root;
    merkleProof.leaf           <== leafHash.out;
    for (var i = 0; i < depth; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i]  <== pathIndices[i];
    }

    // 4) Nullifier = Poseidon(leaf, 0) (stub)
    component nullify = Poseidon(2);
    nullify.inputs[0] <== leafHash.out;
    nullify.inputs[1] <== 0;
    nullifier === nullify.out;
}

// Instantiate for a 32-level Merkle tree
component main = Eligibility(32);
