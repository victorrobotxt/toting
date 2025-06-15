pragma circom 2.1.6;

// Batch tally of encrypted ballots (copied from batch_tally.circom)
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

// Recursive batch tally that rolls 8 BatchTally(128) into one.
template RecursiveBatchTallyV2() {
    signal input A[8][128];
    signal input B[8][128];
    signal output sumA;
    signal output sumB;

    component t[8];
    signal partialA[8];
    signal partialB[8];

    for (var i = 0; i < 8; i++) {
        t[i] = BatchTally(128);
        for (var j = 0; j < 128; j++) {
            t[i].A[j] <== A[i][j];
            t[i].B[j] <== B[i][j];
        }
        partialA[i] <== t[i].sumA;
        partialB[i] <== t[i].sumB;
    }

    signal accA[9];
    signal accB[9];
    accA[0] <== 0;
    accB[0] <== 0;
    for (var i = 0; i < 8; i++) {
        accA[i + 1] <== accA[i] + partialA[i];
        accB[i + 1] <== accB[i] + partialB[i];
    }
    sumA <== accA[8];
    sumB <== accB[8];
}

component main = RecursiveBatchTallyV2();
