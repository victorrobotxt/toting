// packages/frontend/src/lib/ProofWalletAPI.ts
import { SimpleAccountAPI } from "@account-abstraction/sdk";
import { ethers } from "ethers";
import { hexConcat } from "ethers/lib/utils";

// Make sure these are being loaded correctly from your .env files
const WALLET_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_WALLET_FACTORY!;

export type ZkProof = {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
};

// We extend the parameters for SimpleAccountAPI to include our ZK proof data.
interface ProofWalletApiParams extends
    Omit < ConstructorParameters < typeof SimpleAccountAPI > [0], "factoryAddress" > {
        factoryAddress?: string;
        zkProof?: ZkProof;
        pubSignals?: string[];
    }

/**
 * A custom AccountAPI that extends SimpleAccountAPI to handle a factory
 * requiring a ZK proof for wallet creation.
 */
export class ProofWalletAPI extends SimpleAccountAPI {
  zkProof?: ZkProof;
  pubSignals?: string[];

  constructor(params: ProofWalletApiParams) {
    // Pass the standard parameters to the SimpleAccountAPI constructor
    super({
        ...params,
        factoryAddress: params.factoryAddress ?? WALLET_FACTORY_ADDRESS,
    });
    
    // Store our custom proof data
    this.zkProof = params.zkProof;
    this.pubSignals = params.pubSignals;
  }

  /**
   * --- FIX ---
   * Overrides the base `getAccountInitCode` to work with our custom factory.
   * It constructs a nested calldata: the outer call is `createAccount(bytes)`, and the
   * inner `bytes` payload contains the encoded arguments for our `mintWallet` logic.
   * This is the pattern required by the EntryPoint v0.6.0 contract.
   */
  async getAccountInitCode(): Promise<string> {
    if (!this.zkProof || !this.pubSignals) {
      throw new Error("ProofWalletAPI: ZK proof and public signals are required for the first transaction.");
    }

    const ownerAddress = await this.owner.getAddress();
    
    // 1. ABI-encode the arguments for our internal minting logic. This becomes the `data` parameter.
    const innerCreationData = ethers.utils.defaultAbiCoder.encode(
        ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[7]', 'address', 'uint256'],
        [
            this.zkProof.a,
            this.zkProof.b,
            this.zkProof.c,
            this.pubSignals,
            ownerAddress,
            this.index // Pass the account's salt (index)
        ]
    );

    // 2. The interface for the factory's public function that EntryPoint will call.
    const factoryIface = new ethers.utils.Interface(["function createAccount(bytes data)"]);
    
    // 3. Encode the full calldata for the `createAccount` function.
    const calldata = factoryIface.encodeFunctionData("createAccount", [innerCreationData]);

    if (!this.factoryAddress) {
      throw new Error("ProofWalletAPI: factoryAddress is undefined. Check your environment variables and configuration.");
    }
    
    // The initCode is the factory address concatenated with the calldata for `createAccount`.
    return hexConcat([this.factoryAddress, calldata]);
  }
}
