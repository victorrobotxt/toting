pragma circom 2.2.2;

include "../../node_modules/circomlib/circuits/comparators.circom";

// basic square‐root gadget
// The 'out' signal is now an INPUT, serving as the "witness" for the square root.
template Sqrt() {
    signal input in;
    signal input out; // << CHANGE: Was 'output out'. It's now a witness.
    out * out === in; // This now VERIFIES that the provided 'out' is the sqrt of 'in'.
}

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
    component sq[n];

    // now in the loop, give each its type and wire it up
    for (var i = 0; i < n; i++) {
        leMax[i]   = LessEqThan(32);
        geZero[i]  = LessEqThan(32);
        sq[i]      = Sqrt();

        // 0 <= credits[i] <= 1_000_000
        leMax[i].in[0] <== credits[i];
        leMax[i].in[1] <== 1000000;
        leMax[i].out   === 1;

        geZero[i].in[0] <== 0;
        geZero[i].in[1] <== credits[i];
        geZero[i].out   === 1;

        // Provide both the input and its pre-computed square root to the Sqrt component
        sq[i].in       <== credits[i];
        sq[i].out      <== credit_sqrts[i]; // << CHANGED: Wire the witness to the Sqrt gadget.

        // The Sqrt component now has a constraint: credit_sqrts[i] * credit_sqrts[i] === credits[i]

        // accumulate the now-verified sqrt
        acc[i+1]       <== acc[i] + sq[i].out; // This uses the verified square root.
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