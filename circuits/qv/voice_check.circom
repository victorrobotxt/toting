pragma circom 2.1.6;

include "../../node_modules/circomlib/circuits/comparators.circom";

// Simple square root component
template Sqrt() {
    signal input in;
    signal output out;
    out * out === in;
}

// Verify that the sum of vote counts (sqrt of credits) does not exceed the limit.
// The vote counts remain private; only the squared credits may be revealed off-chain.
template VoiceCheck(n) {
    signal input votes[n];
    signal input limit; // maximum sum of votes
    signal output ok;

    var sum = 0;
    for (var i = 0; i < n; i++) {
        sum += votes[i];
    }

    // constrain sum <= limit using circomlib comparator
    component cmp = LessEqThan(32);
    cmp.in[0] <== sum;
    cmp.in[1] <== limit;
    cmp.out === 1;
    ok <== 1;
}

