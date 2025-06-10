export interface NetworkConfig {
  entryPoint: string;
  walletFactory: string;
  electionManager: string;
  bundlerUrl: string;
}

const configs: Record<number, NetworkConfig> = {
  31337: {
    entryPoint: process.env.NEXT_PUBLIC_ENTRYPOINT!,
    walletFactory: process.env.NEXT_PUBLIC_WALLET_FACTORY!,
    electionManager: process.env.NEXT_PUBLIC_ELECTION_MANAGER!,
    bundlerUrl: process.env.NEXT_PUBLIC_BUNDLER_URL!,
  },
  11155111: {
    entryPoint: process.env.NEXT_PUBLIC_SEPOLIA_ENTRYPOINT!,
    walletFactory: process.env.NEXT_PUBLIC_SEPOLIA_WALLET_FACTORY!,
    electionManager: process.env.NEXT_PUBLIC_SEPOLIA_ELECTION_MANAGER!,
    bundlerUrl: process.env.NEXT_PUBLIC_SEPOLIA_BUNDLER_URL!,
  },
};

export function getConfig(chainId: number): NetworkConfig {
  return configs[chainId] || configs[31337];
}
