pragma circom 2.1.6;

// Shared square-root gadget
template Sqrt() {
    signal input in;
    signal output out;
    out * out === in;
}

// Take an array of squared vote sums and output their square roots.
template QVTally(n) {
    signal input sums[n];
    signal output results[n];

    for (var i = 0; i < n; i++) {
        component sq = Sqrt();
        sq.in <== sums[i];
        results[i] <== sq.out;
    }
}

component main = QVTally(3);
