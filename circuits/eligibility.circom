// circuits/eligibility.circom
include "ecdsa/ecdsa.circom";     // secp256k1 ECDSA gadget from iden3/circomlib
include "poseidon.circom";        // for any hashing (if needed)

template Eligibility() {
    // ── Public inputs ─────────────────────────────────────────────────────────
    // keccak256(header‖payload)
    signal input msgHash;          
    // Ethereum public key (uncompressed)
    signal input pubKey[2];        

    // ── Private inputs ────────────────────────────────────────────────────────
    // signature r, s values
    signal input sigR;
    signal input sigS;
    // eligibility flag extracted from JWT JSON (0 or 1)
    signal input eligibility;      

    // ── ECDSA verify ─────────────────────────────────────────────────────────
    component ecdsaVerify = EcdsaSecp256k1( );  
    // assign inputs to the gadget
    ecdsaVerify.msgHash  <== msgHash;  
    ecdsaVerify.R        <== sigR;     
    ecdsaVerify.S        <== sigS;     
    ecdsaVerify.Px       <== pubKey[0];
    ecdsaVerify.Py       <== pubKey[1];
    // gadget emits `ecdsaVerify.out === 1` on success

    // ── Eligibility check ─────────────────────────────────────────────────────
    // enforce the JWT contained `"eligibility":true`
    eligibility === 1;

    // ── Output ────────────────────────────────────────────────────────────────
    // we still need exactly one public output for our Solidity stub
    signal output valid;  
    // Because both constraints above must pass, we can safely set:
    valid <== 1;
}

component main = Eligibility();
