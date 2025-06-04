# Architecture ADR

This ADR illustrates the proof pipeline.

```mermaid
flowchart LR
    Circom --> Solidity
    Solidity --> Bridge
    Bridge --> Anchor
```
