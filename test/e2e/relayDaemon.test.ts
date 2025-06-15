import fs from 'fs';
import path from 'path';
import { spawnSync, spawn } from 'child_process';
import { JsonRpcProvider, Wallet, Interface } from 'ethers';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Idl } from '@coral-xyz/anchor';
import dotenv from 'dotenv';

// Load environment variables from .env.deployed if present
if (fs.existsSync('.env.deployed')) {
  dotenv.config({ path: '.env.deployed' });
} else {
  dotenv.config();
}

const EVM_RPC = process.env.EVM_RPC || 'http://127.0.0.1:8545';
const SOLANA_RPC = process.env.SOLANA_RPC || 'http://localhost:8899';
const ORCHESTRATOR_KEY = process.env.ORCHESTRATOR_KEY as string;
const POSTGRES_URL = process.env.POSTGRES_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const SOLANA_BRIDGE_SK = process.env.SOLANA_BRIDGE_SK as string;

if (!ORCHESTRATOR_KEY || !SOLANA_BRIDGE_SK) {
  console.error('ORCHESTRATOR_KEY and SOLANA_BRIDGE_SK env vars required');
  process.exit(1);
}

async function deployEmitter(): Promise<string> {
  const tmp = fs.mkdtempSync(path.join('/tmp', 'emitter-'));
  fs.writeFileSync(path.join(tmp, 'foundry.toml'), '[profile.default]\nsrc="src"\nout="out"\n');
  fs.mkdirSync(path.join(tmp, 'src'));
  const src = `pragma solidity ^0.8.24;\ncontract TestTallyEmitter {\n  event Tally(uint256 indexed id, uint256 A, uint256 B);\n  function emitTally(uint256 id, uint256 A, uint256 B) external { emit Tally(id,A,B); }\n}`;
  const file = path.join(tmp, 'src', 'TestTallyEmitter.sol');
  fs.writeFileSync(file, src);

  const res = spawnSync('forge', ['create', file + ':TestTallyEmitter', '--rpc-url', EVM_RPC, '--private-key', ORCHESTRATOR_KEY, '--root', tmp], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stdout);
    console.error(res.stderr);
    throw new Error('forge create failed');
  }
  const m = /Deployed to: (0x[0-9a-fA-F]+)/.exec(res.stdout);
  if (!m) throw new Error('Could not parse forge output');
  return m[1];
}

async function main() {
  const emitterAddr = await deployEmitter();
  console.log('Emitter deployed at', emitterAddr);

  // Start relay daemon
  const daemon = spawn('npx', ['ts-node', 'index.ts'], {
    cwd: path.join(__dirname, '../..', 'services/relay-daemon'),
    env: {
      ...process.env,
      ELECTION_MANAGER: emitterAddr,
      EVM_RPC,
      SOLANA_RPC,
      POSTGRES_URL,
      SOLANA_BRIDGE_SK,
      POLL_INTERVAL: '1000',
      CONFIRMATIONS: '0',
    },
    stdio: 'inherit'
  });

  // Wait a bit for daemon to start
  await new Promise(r => setTimeout(r, 5000));

  const provider = new JsonRpcProvider(EVM_RPC);
  const wallet = new Wallet(ORCHESTRATOR_KEY, provider);
  const emitter = new (new Interface(['function emitTally(uint256,uint256,uint256)'])) as any;
  const tx = await wallet.sendTransaction({
    to: emitterAddr,
    data: emitter.encodeFunctionData('emitTally', [1, 42, 7])
  });
  const receipt = await tx.wait();
  const blockHash = receipt.blockHash;

  // Setup solana program
  const idlPath = path.join(__dirname, '../..', 'solana-programs/election/target/idl/election_mirror.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
  const programId = new PublicKey((idl as any).metadata.address);
  (idl as any).address = programId.toBuffer();

  const solConn = new Connection(SOLANA_RPC, 'confirmed');
  const sk = Uint8Array.from(JSON.parse(SOLANA_BRIDGE_SK));
  const kp = Keypair.fromSecretKey(sk);
  const providerSol = new AnchorProvider(solConn, { publicKey: kp.publicKey, signAllTransactions: async txs => { txs.forEach(tx => tx.partialSign(kp)); return txs; } } as any, {});
  const program = new Program(idl as any, providerSol);

  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('election'), Buffer.from(blockHash.slice(2), 'hex')], program.programId);

  console.log('Waiting for bridge to write account', pda.toBase58());
  let attempts = 30;
  while (attempts-- > 0) {
    try {
      const acc: any = await (program.account as any).election.fetch(pda);
      if (Number(acc.votesA) === 42 && Number(acc.votesB) === 7) {
        console.log('✅ Bridged tally matches');
        daemon.kill('SIGTERM');
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  daemon.kill('SIGTERM');
  throw new Error('Timed out waiting for bridged tally');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
