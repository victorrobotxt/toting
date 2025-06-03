pragma circom 2.1.6;

// Simple square root component reused here
template QVTally(n) {
    signal input sums[n]; // sum of squared votes for each option
    signal output results[n]; // sqrt of sums (placeholder)

    for (var i = 0; i < n; i++) {
        results[i] <== sums[i];
    }
}

component main = QVTally(3);
