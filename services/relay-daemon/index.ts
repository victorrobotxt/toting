import 'dotenv/config';
import { ethers } from 'ethers';
import { Pool } from 'pg';
import express from 'express';
import { Gauge, collectDefaultMetrics, register } from 'prom-client';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, setProvider } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';

// Load the IDL at runtime
const idlPath = path.join(__dirname, '..', '..', '..', 'solana-programs', 'election', 'target', 'idl', 'election_mirror.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

let EVM_RPC = process.env.EVM_RPC || 'http://127.0.0.1:8545';
// (Removed the “anvil → 127.0.0.1” rewrite because inside Docker that was pointing at loopback, causing ECONNREFUSED.)

const SOLANA_RPC = process.env.SOLANA_RPC || 'http://localhost:8899';
const POSTGRES_URL = process.env.POSTGRES_URL as string;
if (!POSTGRES_URL) throw new Error('POSTGRES_URL env var required');
const ELECTION_MANAGER = process.env.ELECTION_MANAGER as string;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL || '10000');
const PROM_PORT = Number(process.env.PROM_PORT || '9300');
const BRIDGE_SK = process.env.SOLANA_BRIDGE_SK as string;

if (!ELECTION_MANAGER) throw new Error('ELECTION_MANAGER env var required');
if (!BRIDGE_SK) throw new Error('SOLANA_BRIDGE_SK env var required');

const CHAIN_ID = Number(process.env.CHAIN_ID || '1337');
const ethProvider = new ethers.providers.StaticJsonRpcProvider(EVM_RPC, {
  chainId: CHAIN_ID,
  name: 'local'
});
const iface = new ethers.utils.Interface(['event Tally(uint256,uint256)']);
const pool = new Pool({ connectionString: POSTGRES_URL });

async function waitForEvm() {
  let delay = 1000;
  while (true) {
    try {
      await ethProvider.getBlockNumber();
      return;
    } catch (err) {
      console.error('EVM RPC not reachable, retrying', err);
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
}

async function waitForDb() {
  let delay = 1000;
  while (true) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.error('db not ready, retrying', err);
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
}

collectDefaultMetrics();
const lagGauge = new Gauge({ name: 'relay_lag', help: 'L1 block lag' });
const app = express();
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
app.listen(PROM_PORT, () => console.log(`prom metrics on ${PROM_PORT}`));

async function getLastBlock(): Promise<number> {
  await pool.query('CREATE TABLE IF NOT EXISTS relay_state (id INT PRIMARY KEY, last_block BIGINT)');
  const res = await pool.query('SELECT last_block FROM relay_state WHERE id=1');
  if (res.rowCount === 0) {
    const latest = await ethProvider.getBlockNumber();
    await pool.query('INSERT INTO relay_state (id, last_block) VALUES (1,$1)', [latest]);
    return latest;
  }
  return Number(res.rows[0].last_block);
}

async function setLastBlock(b: number) {
  await pool.query('UPDATE relay_state SET last_block=$1 WHERE id=1', [b]);
}

async function bridgeTally(A: bigint, B: bigint, blockHash: string) {
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(BRIDGE_SK)));
  const provider = new AnchorProvider(conn, { publicKey: wallet.publicKey, signAllTransactions: (txs: any[]) => txs.map(t => { t.partialSign(wallet); return t; }) } as any, {});
  setProvider(provider);
  const program = new Program(idl as any, new PublicKey(idl.metadata.address));
  const election = PublicKey.findProgramAddressSync([
    Buffer.from('election'),
    Buffer.from(blockHash.slice(2, 34), 'hex')
  ], program.programId)[0];
  await program.methods.setTally(A, B).accounts({ election, authority: wallet.publicKey }).rpc();
}

async function main() {
  await waitForEvm();
  await waitForDb();
  let last = await getLastBlock();
  console.log('starting from block', last);
  while (true) {
    try {
      const latest = await ethProvider.getBlockNumber();
      lagGauge.set(latest - last);
      if (latest > last) {
        const logs = await ethProvider.getLogs({
          address: ELECTION_MANAGER,
          fromBlock: last + 1,
          toBlock: latest,
          topics: [iface.getEventTopic('Tally')]
        });
        for (const log of logs) {
          const { args: [A, B] } = iface.parseLog(log);
          let attempt = 0;
          while (true) {
            try {
              await bridgeTally(BigInt(A), BigInt(B), log.blockHash);
              break;
            } catch (err) {
              attempt++;
              if (attempt >= 5) throw err;
              console.error('bridge failed, retrying', err);
              await new Promise(r => setTimeout(r, 3000));
            }
          }
          last = log.blockNumber;
          await setLastBlock(last);
        }
      }
    } catch (err) {
      console.error('loop error', err);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main().catch(e => console.error(e));
