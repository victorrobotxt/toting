import 'dotenv/config';
import { ethers } from 'ethers';
import { Pool } from 'pg';
import express from 'express';
import { Gauge, collectDefaultMetrics, register } from 'prom-client';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, BN, Wallet, Idl } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';
import { Server as WebSocketServer } from 'ws';
import http from 'http';

// --- Configuration ---
const EVM_RPC = process.env.EVM_RPC || 'http://127.0.0.1:8545';
const SOLANA_RPC = process.env.SOLANA_RPC || 'http://localhost:8899';
const POSTGRES_URL = process.env.POSTGRES_URL as string;
const ELECTION_MANAGER = process.env.ELECTION_MANAGER as string;
const BRIDGE_SK = process.env.SOLANA_BRIDGE_SK as string;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || '10000');
const PROM_PORT = Number(process.env.PROM_PORT || '9300');
const CHAIN_ID = Number(process.env.CHAIN_ID || '31337');

if (!POSTGRES_URL) throw new Error('POSTGRES_URL env var required');
if (!ELECTION_MANAGER) throw new Error('ELECTION_MANAGER env var required');
if (!BRIDGE_SK) throw new Error('SOLANA_BRIDGE_SK env var required');

// --- Load Solana IDL ---
const idlPath = path.join(__dirname, '..', 'idl', 'election_mirror.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8')) as Idl;
// --- FIX: Extract programId from the IDL metadata ---
const programId = new PublicKey(idl.metadata.address);

// --- Providers and Interfaces ---
const ethProvider = new ethers.providers.JsonRpcProvider(EVM_RPC, {
  chainId: CHAIN_ID,
  name: 'local'
});
const iface = new ethers.utils.Interface(['event Tally(uint256 indexed id, uint256 A, uint256 B)']);
const pool = new Pool({ connectionString: POSTGRES_URL });

// --- Helper Functions ---
const waitForRpc = async (rpcName: string, checkFn: () => Promise<any>, delay = 1000) => {
  while (true) {
    try {
      await checkFn();
      console.log(`✅ ${rpcName} is ready.`);
      return;
    } catch (err) {
      console.error(`⏳ ${rpcName} not reachable, retrying in ${delay / 1000}s...`);
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 1.5, 30000);
    }
  }
};

// --- Metrics and WebSocket Server ---
collectDefaultMetrics();
const lagGauge = new Gauge({ name: 'relay_lag_blocks', help: 'L1 block lag' });
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

wss.on('connection', ws => {
  console.log('Frontend client connected to Solana WebSocket.');
  const dummyTally = { A: 10, B: 5 };
  ws.send(JSON.stringify(dummyTally));

  const interval = setInterval(() => {
    dummyTally.A += Math.floor(Math.random() * 3);
    dummyTally.B += Math.floor(Math.random() * 2);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(dummyTally));
    }
  }, 5000);

  ws.on('close', () => {
    console.log('Frontend client disconnected.');
    clearInterval(interval);
  });
});

server.listen(PROM_PORT, () => console.log(`📈 Metrics and WebSocket listening on port ${PROM_PORT}`));


// --- State Management ---
async function getLastBlock(): Promise<number> {
  await pool.query('CREATE TABLE IF NOT EXISTS relay_state (id INT PRIMARY KEY, last_block BIGINT)');
  const res = await pool.query('SELECT last_block FROM relay_state WHERE id=1');
  if (res.rowCount === 0) {
    const latest = await ethProvider.getBlockNumber();
    await pool.query('INSERT INTO relay_state (id, last_block) VALUES (1, $1)', [latest]);
    return latest;
  }
  return Number(res.rows[0].last_block);
}

async function setLastBlock(b: number) {
  await pool.query('UPDATE relay_state SET last_block=$1 WHERE id=1', [b]);
}

// --- Solana Bridge Logic ---
async function bridgeTally(A: ethers.BigNumber, B: ethers.BigNumber, blockHash: string) {
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(BRIDGE_SK)));
  
  const wallet = new Wallet(keypair);

  const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  
  // --- FIX: Pass the programId as the second argument to the Program constructor ---
  const program = new Program(idl, programId, provider);

  // Derive the PDA for the election account on Solana
  const [electionPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('election'),
      Buffer.from(blockHash.slice(2), 'hex') 
    ],
    program.programId
  );

  console.log(`Bridging tally to Solana account: ${electionPDA.toBase58()}`);
  const txSignature = await program.methods
    .setTally(new BN(A.toString()), new BN(B.toString()))
    .accounts({ election: electionPDA, authority: wallet.publicKey })
    .rpc();
  
  console.log(`Solana transaction successful: ${txSignature}`);
}

// --- Main Loop ---
async function main() {
  await waitForRpc('EVM RPC', () => ethProvider.getBlockNumber());
  await waitForRpc('Postgres DB', () => pool.query('SELECT 1'));

  let last = await getLastBlock();
  console.log(`🚀 Starting relay from block ${last}`);

  while (true) {
    try {
      const latest = await ethProvider.getBlockNumber();
      lagGauge.set(latest - last);

      if (latest > last) {
        console.log(`Scanning blocks from ${last + 1} to ${latest}`);
        const logs = await ethProvider.getLogs({
          address: ELECTION_MANAGER,
          fromBlock: last + 1,
          toBlock: latest,
          topics: [iface.getEventTopic('Tally')]
        });

        for (const log of logs) {
          const { args: [id, A, B] } = iface.parseLog(log);
          console.log(`Found Tally event for election ${id} in block ${log.blockNumber}`);
          
          let attempt = 0;
          const maxAttempts = 5;
          while (true) {
            try {
              await bridgeTally(A, B, log.blockHash);
              console.log(`✅ Relayed tally for election ${id} from EVM tx ${log.transactionHash}`);
              break;
            } catch (err) {
              attempt++;
              console.error(`Bridge attempt ${attempt}/${maxAttempts} failed:`, err);
              if (attempt >= maxAttempts) {
                console.error(`FATAL: Could not relay tally for election ${id} after ${maxAttempts} attempts.`);
                throw err;
              }
              await new Promise(r => setTimeout(r, 3000 * attempt));
            }
          }
        }
        last = latest;
        await setLastBlock(last);
      }
    } catch (err) {
      console.error('FATAL: An error occurred in the main relay loop:', err);
      await new Promise(r => setTimeout(r, 15000));
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch(e => {
  console.error("Relay daemon crashed:", e)
  process.exit(1)
});
