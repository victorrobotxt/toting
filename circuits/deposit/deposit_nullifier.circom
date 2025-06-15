pragma circom 2.1.6;

include "../circomlib/circuits/poseidon.circom";

// Simplified Merkle proof using Poseidon
template MerkleProof(depth) {
    signal input root;
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    signal hash[depth + 1];
    hash[0] <== leaf;

    component h[depth];
    signal left[depth];
    signal right[depth];
    for (var i = 0; i < depth; i++) {
        h[i] = Poseidon(2);
        // Select left/right depending on path index
        left[i] <== hash[i] + pathIndices[i] * (pathElements[i] - hash[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (hash[i] - pathElements[i]);
        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== right[i];
        hash[i+1] <== h[i].out;
    }

    hash[depth] === root;
}

// Deposit-nullifier circuit proving a secret commitment exists in a Merkle tree
// and exposes a nullifier derived from that secret.
template DepositNullifier(depth) {
    // --- PUBLIC INPUTS ---
    signal input root;       // Merkle root of commitments
    signal input nullifier;  // Output nullifier

    // --- WITNESS INPUTS ---
    signal input secret;                  // private deposit secret
    signal input pathElements[depth];     // Merkle sibling hashes
    signal input pathIndices[depth];      // Merkle path indices

    // 1) Hash secret to compute commitment/leaf
    component leafHash = Poseidon(1);
    leafHash.inputs[0] <== secret;

    // 2) Merkle inclusion proof
    component proof = MerkleProof(depth);
    proof.root <== root;
    proof.leaf <== leafHash.out;
    for (var i = 0; i < depth; i++) {
        proof.pathElements[i] <== pathElements[i];
        proof.pathIndices[i]  <== pathIndices[i];
    }

    // 3) Nullifier derived from secret
    component nf = Poseidon(2);
    nf.inputs[0] <== secret;
    nf.inputs[1] <== 0;
    nullifier === nf.out;
}

component main { public [root, nullifier] } = DepositNullifier(32);
