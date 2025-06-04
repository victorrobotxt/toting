pragma circom 2.1.6;

// Batch tally of encrypted ballots.
template BatchTally(N) {
    signal input A[N];
    signal input B[N];
    signal output sumA;
    signal output sumB;

    signal accA[N + 1];
    signal accB[N + 1];
    accA[0] <== 0;
    accB[0] <== 0;

    for (var i = 0; i < N; i++) {
        accA[i + 1] <== accA[i] + A[i];
        accB[i + 1] <== accB[i] + B[i];
    }

    sumA <== accA[N];
    sumB <== accB[N];
}

component main = BatchTally(128);
