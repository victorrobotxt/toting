pragma circom 2.2.2;

// Shared square-root gadget
// 'out' is an INPUT signal, a "witness" provided by the prover.
template Sqrt() {
    signal input in;
    signal input out;
    // This constraint VERIFIES that the provided 'out' is the square root of 'in'.
    out * out === in;
}

// Take an array of squared vote sums and verify their square roots.
template QVTally(n) {
    // The prover must provide both the sums and their square roots.
    signal input sums[n];
    signal input results[n]; // This is the witness for the square roots.

    // A single output to confirm all checks passed.
    signal output ok;

    // 1. Declare an array of 'n' Sqrt components.
    component sq[n];

    // 2. Use a loop to initialize and connect each component.
    for (var i = 0; i < n; i++) {
        // Initialize the i-th component in the array
        sq[i] = Sqrt();
        
        // Wire the i-th sum and its corresponding witness (result)
        // to the Sqrt component's inputs.
        sq[i].in <== sums[i];
        sq[i].out <== results[i];
    }

    // If all the `out * out === in` constraints in the Sqrt components pass,
    // the proof will be valid. We output 1 to signify success.
    ok <== 1;
}

// Instantiate the main component with n=3.
// Note the required semicolon at the end.
component main = QVTally(3);
