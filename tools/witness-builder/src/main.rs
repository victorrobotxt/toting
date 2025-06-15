use std::path::{PathBuf};
use std::process::Command;
use clap::Parser;
use rayon::prelude::*;

#[derive(Parser, Debug)]
#[command(about = "Parallel witness builder using rayon", author, version)]
struct Args {
    /// Path to generate_witness.js
    script: PathBuf,
    /// Path to circuit wasm
    wasm: PathBuf,
    /// Directory containing input JSON files
    input_dir: PathBuf,
    /// Output directory for .wtns files
    output_dir: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    std::fs::create_dir_all(&args.output_dir)?;
    let inputs: Vec<PathBuf> = std::fs::read_dir(&args.input_dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|e| e == "json").unwrap_or(false))
        .collect();

    inputs.par_iter().try_for_each(|input| {
        let name = input
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| anyhow::anyhow!("bad input name"))?;
        let out = args.output_dir.join(format!("{name}.wtns"));
        let status = Command::new("node")
            .arg(&args.script)
            .arg(&args.wasm)
            .arg(input)
            .arg(&out)
            .status()?;
        if !status.success() {
            Err(anyhow::anyhow!("witness failed for {}", name))
        } else {
            Ok(())
        }
    })?;
    Ok(())
}
