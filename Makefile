WITNESS_BIN=tools/witness-builder/target/release/witness-builder

.PHONY: witness-builder witness ci-witness-speed

witness-builder:
cargo build --release --manifest-path tools/witness-builder/Cargo.toml

# Example invocation using voice_check circuit inputs
witness: witness-builder
$(WITNESS_BIN) voice_check_js/generate_witness.js voice_check_js/voice_check.wasm examples/inputs examples/wtns

ci-witness-speed: witness
