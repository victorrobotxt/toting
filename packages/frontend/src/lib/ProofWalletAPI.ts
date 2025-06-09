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

// --- This ABI is for the getAddress view function on your factory ---
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
  factoryAddress?: string;

  constructor(params: ProofWalletApiParams) {
    super({
        ...params,
        factoryAddress: params.factoryAddress ?? WALLET_FACTORY_ADDRESS,
    });
    
    this.factoryAddress = params.factoryAddress ?? WALLET_FACTORY_ADDRESS;
    this.zkProof = params.zkProof;
    this.pubSignals = params.pubSignals;
  }

  /**
   * --- THIS IS THE CORE FIX ---
   * This method overrides the default SDK behavior. Instead of trying to compute the
   * address off-chain or by calling a state-changing function, we directly call 
   * our factory's `getAddress` view function. This is the correct pattern for 
   * custom factories in the `account-abstraction` SDK.
   */
  async getAccountAddress(): Promise<string> {
    if (this.accountAddress) {
      return this.accountAddress;
    }
    if (!this.factoryAddress) {
        throw new Error("Factory address is not defined");
    }
    
    const factory = new ethers.Contract(this.factoryAddress, FACTORY_ABI, this.provider);
    const ownerAddress = await this.owner.getAddress();
    
    try {
      // Call the `getAddress` view function on the factory contract.
      // `this.index` is the salt, inherited from the base SimpleAccountAPI.
      this.accountAddress = await factory.getAddress(ownerAddress, this.index);
      return this.accountAddress!;
    } catch (error: any) {
      console.error("Fatal Error: factory.getAddress() call failed.", error);
      throw new Error(`Factory.getAddress() call failed: ${error.message || 'call revert exception'}`);
    }
  }

  /**
   * Overrides the base `getAccountInitCode` to work with our custom factory
   * that requires a ZK-proof for wallet creation.
   */
  async getAccountInitCode(): Promise<string> {
    // If the wallet already exists, initCode is empty.
    const code = await this.provider.getCode(await this.getAccountAddress());
    if (code !== '0x') {
        return '0x';
    }
      
    if (!this.zkProof || !this.pubSignals) {
      throw new Error("ProofWalletAPI: ZK proof and public signals are required for the first transaction.");
    }
    if (!this.factoryAddress) {
        throw new Error("ProofWalletAPI: factoryAddress is not defined.");
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
            this.index // salt
        ]
    );

    const factoryIface = new ethers.utils.Interface(["function createAccount(bytes data)"]);
    const calldata = factoryIface.encodeFunctionData("createAccount", [innerCreationData]);

    return hexConcat([this.factoryAddress, calldata]);
  }
}
