pragma circom 2.2.2;

include "../../node_modules/circomlib/circuits/comparators.circom";

// Circuit that verifies provided square roots and totals them.

template VoiceCheck(n) {
    // inputs & outputs
    signal input credits[n];
    signal input credit_sqrts[n]; // << ADDED: The prover must provide the square roots here.
    signal input limit;
    signal output ok;

    // accumulator
    signal acc[n+1];
    acc[0] <== 0;

    // declare uninitialized component arrays
    component leMax[n];
    component geZero[n];

    // now in the loop, give each its type and wire it up
    for (var i = 0; i < n; i++) {
        leMax[i]   = LessEqThan(32);
        geZero[i]  = LessEqThan(32);

        // 0 <= credits[i] <= 1_000_000
        leMax[i].in[0] <== credits[i];
        leMax[i].in[1] <== 1000000;
        leMax[i].out   === 1;

        geZero[i].in[0] <== 0;
        geZero[i].in[1] <== credits[i];
        geZero[i].out   === 1;

        // Verify the supplied square root and accumulate
        credit_sqrts[i] * credit_sqrts[i] === credits[i];
        acc[i+1]       <== acc[i] + credit_sqrts[i];
    }

    // final compare
    component cmp = LessEqThan(32);
    cmp.in[0] <== acc[n];
    cmp.in[1] <== limit;
    cmp.out    === 1;

    ok <== 1;
}

// instantiate with 10 options
component main = VoiceCheck(10);