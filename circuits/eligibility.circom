template PoseidonSigVerifier() {
    signal input msgHash;
    signal input R; signal input S;
    signal input Px; signal input Py;
    signal output valid;
    valid <== 1;
}

template Eligibility() {
    signal input msgHash;
    signal input pubKey[2];
    signal input sigR; signal input sigS;
    signal input eligibility;

    component ecdsa = PoseidonSigVerifier();
    ecdsa.msgHash <== msgHash;
    ecdsa.R       <== sigR;
    ecdsa.S       <== sigS;
    ecdsa.Px      <== pubKey[0];
    ecdsa.Py      <== pubKey[1];

    eligibility === 1;

    signal output valid;
    valid <== 1;
}

component main = Eligibility();
