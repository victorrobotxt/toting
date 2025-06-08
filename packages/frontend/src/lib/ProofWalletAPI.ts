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
   * Overrides the SimpleAccountAPI method to provide the custom initCode.
   * This is the only method we need to override for our specific factory logic.
   */
  async getAccountInitCode(): Promise<string> {
    // If the wallet is already deployed, SimpleAccountAPI will have found the
    // accountContract instance, and we should return "0x".
    if (this.accountContract) {
        return "0x";
    }

    // For the first transaction (wallet creation), proof and signals are required.
    if (!this.zkProof || !this.pubSignals) {
      throw new Error("ProofWalletAPI: ZK proof and public signals are required for the first transaction.");
    }

    // The interface for our factory's mintWallet function
    const factoryIface = new ethers.utils.Interface([
      "function mintWallet(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[7] pubSignals, address owner)"
    ]);
    
    const ownerAddress = await this.owner.getAddress();
    
    // Encode the calldata for the mintWallet function
    const calldata = factoryIface.encodeFunctionData("mintWallet", [
        this.zkProof.a,
        this.zkProof.b,
        this.zkProof.c,
        this.pubSignals,
        ownerAddress
    ]);

    // Add a runtime check to ensure factoryAddress is defined.
    // This satisfies TypeScript and provides a clear error if configuration is missing.
    if (!this.factoryAddress) {
      throw new Error("ProofWalletAPI: factoryAddress is undefined. Check your environment variables and configuration.");
    }
    
    // The initCode is the factory address concatenated with the calldata
    return hexConcat([this.factoryAddress, calldata]);
  }
}
