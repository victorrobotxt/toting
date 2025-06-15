pragma circom 2.2.2;
// All hashes use Poseidon (Arkworks) only

// Simple tally circuit that verifies square roots of vote sums.
template QVTally(n) {
    // The prover must provide both the sums and their square roots.
    signal input sums[n];
    signal input results[n]; // This is the witness for the square roots.

    // A single output to confirm all checks passed.
    signal output ok;

    // Use a loop to verify each square root directly.
    for (var i = 0; i < n; i++) {
        results[i] * results[i] === sums[i];
    }

    // If all constraints pass we output 1 to signify success.
    ok <== 1;
}

// Instantiate the main component with n=3.
// Note the required semicolon at the end.
component main = QVTally(3);
