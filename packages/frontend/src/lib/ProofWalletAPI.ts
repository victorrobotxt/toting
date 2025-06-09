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

// Minimal ABI for our new view function.
const FACTORY_ABI = ['function getAddress(address owner, uint256 salt) view returns (address)'];

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
    super({
        ...params,
        factoryAddress: params.factoryAddress ?? WALLET_FACTORY_ADDRESS,
    });
    
    this.zkProof = params.zkProof;
    this.pubSignals = params.pubSignals;
  }

  /**
   * --- THE DEFINITIVE FIX ---
   * We override `getAccountAddress` to call our new `getAddress` view function
   * on the factory. This completely bypasses the problematic `getCounterFactualAddress`
   * and its reliance on revert data, which is inconsistent across providers.
   */
  async getAccountAddress(): Promise<string> {
      const factory = new ethers.Contract(this.factoryAddress!, FACTORY_ABI, this.provider);
      const ownerAddress = await this.owner.getAddress();
      return factory.getAddress(ownerAddress, this.index);
  }

  /**
   * Overrides the base `getAccountInitCode` to work with our custom factory.
   */
  async getAccountInitCode(): Promise<string> {
    if (!this.zkProof || !this.pubSignals) {
      throw new Error("ProofWalletAPI: ZK proof and public signals are required for the first transaction.");
    }

    const ownerAddress = await this.owner.getAddress();
    
    const innerCreationData = ethers.utils.defaultAbiCoder.encode(
        ['uint256[2]', 'uint256[2][2]', 'uint256[2]', 'uint256[7]', 'address', 'uint256'],
        [
            this.zkProof.a,
            this.zkProof.b,
            this.zkProof.c,
            this.pubSignals,
            ownerAddress,
            this.index
        ]
    );

    const factoryIface = new ethers.utils.Interface(["function createAccount(bytes data)"]);
    const calldata = factoryIface.encodeFunctionData("createAccount", [innerCreationData]);

    if (!this.factoryAddress) {
      throw new Error("ProofWalletAPI: factoryAddress is undefined. Check your environment variables and configuration.");
    }
    
    return hexConcat([this.factoryAddress, calldata]);
  }
}
