# Changelog

## [Unreleased]
### Added
- `ElectionManagerV2` upgradeable via UUPS proxy.
- `submitTypedBallot` EIP-712 support in `QVManager`.
- Mobile-first vote page with card buttons (UX-13).
### Fixed
- Persist tally results on-chain in `ElectionManagerV2`.
- Replay protection for ballots in `QVManager`.
- `WalletFactory` restricts one wallet per owner.

## [0.1.0] - 2025-06-06
### Added
- Initial preview release tagged for dogfooding.
