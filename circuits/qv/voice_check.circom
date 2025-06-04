pragma circom 2.1.6;

include "../../node_modules/circomlib/circuits/comparators.circom";

// Square-root gadget used by multiple circuits
template Sqrt() {
    signal input in;
    signal output out;
    out * out === in;
}

// Voice credits verification with quadratic cost enforcement
// `credits[i]` represent the squared cost for option i.
// The circuit checks:
//   1. 0 <= credits[i] <= 1,000,000
//   2. Sum of sqrt(credits[i]) <= `limit`
// This prevents cheap vote injection and enforces the quadratic pricing rule.
template VoiceCheck(n) {
    signal input credits[n];
    signal input limit; // maximum sum of sqrt(credits)
    signal output ok;

    signal acc[n + 1];
    acc[0] <== 0;

    for (var i = 0; i < n; i++) {
        // range: credits[i] <= 1_000_000
        component leMax = LessEqThan(32);
        leMax.in[0] <== credits[i];
        leMax.in[1] <== 1000000;
        leMax.out === 1;

        // range: 0 <= credits[i]
        component geZero = LessEqThan(32);
        geZero.in[0] <== 0;
        geZero.in[1] <== credits[i];
        geZero.out === 1;

        // sqrt of credits to accumulate vote count
        component sq = Sqrt();
        sq.in <== credits[i];

        acc[i + 1] <== acc[i] + sq.out;
    }

    component cmp = LessEqThan(32);
    cmp.in[0] <== acc[n];
    cmp.in[1] <== limit;
    cmp.out === 1;

    ok <== 1;
}

