pragma circom 2.2.2;

include "../circomlib/circuits/bitify.circom";

// Range check gadget ensuring 0 <= value <= 2^32 - 1.
// It exposes a single output `ok` that is 1 when the
// constraint is satisfied.
template RangeCheck32() {
    signal input value;
    signal output ok;

    // Convert the value to 32 bits. Num2Bits enforces that
    // all higher bits are zero and each bit is boolean.
    component bits = Num2Bits(32);
    bits.in <== value;

    ok <== 1;
}

component main = RangeCheck32();
