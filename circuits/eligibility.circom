// circuits/eligibility.circom

// Stubbed verifier
template PoseidonSigVerifier() {
    signal input msg;
    signal input r;
    signal input s;
    signal input P[2];
    signal output valid;
    valid <== 1;
}

// Main eligibility check
template Eligibility() {
    // public input: JWT header+payload hash
    signal input msgHash;
    // private ECDSA signature parts
    signal input r;
    signal input s;
    // public key (x, y)
    signal input pubKey[2];
    // eligibility flag from JWT payload
    signal input eligibility;

    // verify signature (stub)
    component ecdsa = PoseidonSigVerifier();
    ecdsa.msg    <== msgHash;
    ecdsa.r      <== r;
    ecdsa.s      <== s;
    ecdsa.P[0]   <== pubKey[0];
    ecdsa.P[1]   <== pubKey[1];

    // expose the stub’s “valid” bit
    signal output valid;
    valid <== ecdsa.valid;

    // enforce eligibility == 1
    eligibility === 1;
}

// single entry‑point
component main = Eligibility();
