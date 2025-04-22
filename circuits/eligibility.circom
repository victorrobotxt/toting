// circuits/eligibility.circom
include "ecdsa/poseidonSigVerifier.circom";
component main {
    // 1) JWT header+payload hash as public input
    signal input msgHash;
    // 2) ECDSA signature components as private inputs
    signal input r;
    signal input s;
    signal input pubKey[2];
    // 3) eligibility flag from JWT payload
    signal input eligibility;

    // Verify ECDSA signature over msgHash
    component ecdsa = PoseidonSigVerifier();
    ecdsa.msg <== msgHash;
    ecdsa.r   <== r;
    ecdsa.s   <== s;
    ecdsa.P   <== pubKey;

    // output a single “valid” flag
    signal output valid;
    valid <== ecdsa.valid;

    // enforce eligibility == true
    eligibility === 1;
}
