import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

const RPC = process.env.EVM_RPC ?? 'http://127.0.0.1:8545';
const PK = process.env.TEST_WALLET_PK || process.env.ORCHESTRATOR_KEY;
if (!PK) {
  throw new Error('Please set TEST_WALLET_PK or ORCHESTRATOR_KEY in your .env');
}
const EMGR = process.env.ELECTION_MANAGER;
if (!EMGR) {
  throw new Error('ELECTION_MANAGER address missing (see .env.deployed)');
}
const FACTORY = process.env.NEXT_PUBLIC_WALLET_FACTORY || process.env.FACTORY_ADDRESS;
if (!FACTORY) {
  throw new Error('FACTORY_ADDRESS missing (see .env.deployed)');
}

// Load ABIs
const EMGR_ABI = JSON.parse(
  fs.readFileSync(
    path.join('out', 'ElectionManagerV2.sol', 'ElectionManagerV2.json'),
    'utf8'
  )
).abi as any[];

const FACTORY_ABI = [
  'function getAddress(address owner, uint256 salt) view returns (address)',
  'function mintWallet(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[7] pubSignals, address owner, uint256 salt) returns (address)',
  'event WalletMinted(address indexed owner, address indexed wallet)',
];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK!, provider);
  console.log(`🔑 Using wallet ${wallet.address}`);

  // 1. Test the factory deployment
  const factory = new ethers.Contract(FACTORY!, FACTORY_ABI, wallet);
  const salt = 0;

  // Predict the address
  const predicted = await factory.getAddress(wallet.address, salt);
  console.log('🔨 Predicted wallet address:', predicted);

  // Check code before mint
  const codeBefore = await provider.getCode(predicted);
  console.log('🔍 Code at predicted address before mint:', codeBefore);

  let deployed: string;
  if (codeBefore !== '0x') {
    console.log('⚠️ Wallet already deployed. Skipping mint.');
    deployed = predicted;
  } else {
    // Dummy zero proofs for the UnsafeVerifierStub
    const a = [0, 0] as [number, number];
    const b = [[0, 0], [0, 0]] as [[number, number], [number, number]];
    const c = [0, 0] as [number, number];
    const pubSignals = [0, 0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number, number];

    console.log('⏳ Minting wallet via factory...');
    const tx1 = await factory.mintWallet(a, b, c, pubSignals, wallet.address, salt, { gasLimit: 5_000_000 });
    const rcpt1 = await tx1.wait();
    console.log('✅ Wallet minted tx:', rcpt1.transactionHash);

    // Decode the WalletMinted event
    const mintedEvent = rcpt1.logs
      .map(log => {
        try { return factory.interface.parseLog(log); }
        catch { return null; }
      })
      .find(e => e && e.name === 'WalletMinted');
    if (!mintedEvent) throw new Error('WalletMinted event not found');
    deployed = (mintedEvent as any).args.wallet;
    console.log('🏗️ Deployed wallet address from event:', deployed);

    // Verify code after mint
    const codeAfter = await provider.getCode(deployed);
    console.log('🔍 Code at deployed address:', codeAfter !== '0x' ? 'OK' : 'Missing');
  }

  // 2. Test the ElectionManager interactions
  const mgr = new ethers.Contract(EMGR!, EMGR_ABI, wallet);
  const meta = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('demo-election'));
  const tx2 = await mgr.createElection(meta, { gasLimit: 5_000_000 });
  console.log('⏳ createElection tx', tx2.hash);
  const rcpt2 = await tx2.wait();
  const evt2 = rcpt2.logs.map(l => mgr.interface.parseLog(l)).find(e => e.name === 'ElectionCreated');
  if (!evt2) throw new Error('ElectionCreated not found');
  const id = (evt2 as any).args.id.toNumber();
  console.log('🗳️ created election #', id);

  const vote = 1;
  const nonce = 42;
  const vcProof = '0x';
  const tx3 = await mgr.enqueueMessage(id, vote, nonce, vcProof, { gasLimit: 5_000_000 });
  console.log('⏳ enqueueMessage tx', tx3.hash);
  const rcpt3 = await tx3.wait();
  console.log('🎉 ballot submitted, gas used', rcpt3.gasUsed.toString());
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});