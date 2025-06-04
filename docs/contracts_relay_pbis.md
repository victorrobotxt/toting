# Smart-Contracts & Relay PBIs

The following product backlog items (PBIs) capture upcoming smart-contract and relay work.

## SC-01 Upgrade-safe ElectionManager V2
- Break storage into explicit structs.
- Add UUPS proxy.
- Foundry fuzz proves no storage-slot clobber.
- AC: upgrade test passes.

## SC-02 EIP-712 Typed Ballots
- Off-chain typed data → on-chain verify in submitBallot.
- Gas ≤ 50 k.
- Depends on **SC-01**.

## SC-03 Batch Votes Compression
- MACI message bundle of 64 ballots.
- Saving ≥ 25 % gas per voter.
- Depends on **C-03**.

## SC-04 Relay-Daemon Failover
- Hot/standby pod with leader election via Postgres advisory lock.
- Recovery ≤ 10 s.

## SC-05 Cross-Chain Finality Oracle
- Simple BEEFY-style contract emits finality for Solana mirror.
- Unit tests mock lag.
- Depends on **SC-04**.

## SC-06 Gas-Escalator
- Orchestrator hits eth_maxPriorityFeePerGas.
- Resubmits if tx not mined in 30 s.

## SC-07 Chain Health Dashboard
- Prometheus exporter exposes mempool depth, relay lag, Solana slot.
- Grafana JSON committed.
- Depends on **CI-04**.
