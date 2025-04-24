include "poseidon.circom";
template Tally(N){
  signal input c1_x[N], c1_y[N], c2_x[N], c2_y[N];
  signal output tallyA;
  signal output tallyB;
  // for i in 0..N:
  //   decrypt(c1,c2) → bit
  //   bit*(1−bit) == 0
  //   tallyA += bit; tallyB += 1−bit
}
component main = Tally(/** batch size, e.g. 512 **/);
