pragma circom 2.1.6;

// Simplified Merkle proof template using Poseidon
// Arkworks parameters (t=3,5) ensure compatibility with other circuits
include "poseidon.circom";

template MerkleProof(depth) {
    // Public inputs
    signal input root;
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];

    // Internal rolling hash
    signal hash;
    hash <== leaf;

    for (var i = 0; i < depth; i++) {
        component h = Poseidon(2);
        // left/right ordering
        h.inputs[0] <== pathIndices[i] == 0 ? hash : pathElements[i];
        h.inputs[1] <== pathIndices[i] == 0 ? pathElements[i] : hash;
        hash <== h.out;
    }

    // Ensure the final hash equals the public root
    hash === root;
}

// Optional standalone instantiation (for debugging)
component main { public [root, leaf, pathElements, pathIndices] } = MerkleProof(32);