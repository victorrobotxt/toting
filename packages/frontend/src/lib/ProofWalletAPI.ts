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
        eligibilityVerifier?: string;
    }

/**
 * A custom AccountAPI that extends SimpleAccountAPI to handle a factory
 * requiring a ZK proof for wallet creation.
 */
export class ProofWalletAPI extends SimpleAccountAPI {
  zkProof?: ZkProof;
  pubSignals?: string[];
  factoryAddress?: string;
  eligibilityVerifier?: string;

  constructor(params: ProofWalletApiParams) {
    super({
        ...params,
        factoryAddress: params.factoryAddress ?? WALLET_FACTORY_ADDRESS,
    });
    
    this.factoryAddress = params.factoryAddress ?? WALLET_FACTORY_ADDRESS;
    this.zkProof = params.zkProof;
    this.pubSignals = params.pubSignals;
    this.eligibilityVerifier = params.eligibilityVerifier;
  }

  /**
   * --- THIS IS THE CORE FIX ---
   * We add robust logging before the potentially failing call. This will immediately
   * show you in the browser console if you are using a stale contract address,
   * making this class of error easy to debug in the future. The logic itself
   * remains the same as it correctly follows the custom factory pattern.
   */
  async getAccountAddress(): Promise<string> {
    if (this.accountAddress) {
      return this.accountAddress;
    }
    if (!this.factoryAddress) {
        throw new Error("Factory address is not defined");
    }

    const codeAtFactory = await this.provider.getCode(this.factoryAddress);
    if (codeAtFactory === '0x') {
        const network = await this.provider.getNetwork();
        throw new Error(
            `Factory not deployed at ${this.factoryAddress} on chain ${network.chainId}. ` +
            `Did you run setup_env.sh and restart your dev server? ` +
            `Check that your wallet is connected to the local Anvil network.`
        );
    }

    const factory = new ethers.Contract(this.factoryAddress, FACTORY_ABI, this.provider);
    const ownerAddress = await this.owner.getAddress();

    if (this.eligibilityVerifier) {
      const verifier = new ethers.Contract(
        this.eligibilityVerifier,
        ["function isEligible(address) view returns (bool)"],
        this.provider
      );
      const ok: boolean = await verifier.isEligible(ownerAddress);
      if (!ok) {
        throw new Error("Eligibility verifier rejected this address");
      }
    }
    
    // --- ADDED LOGGING FOR DEBUGGING ---
    console.log(`[ProofWalletAPI] Calling getAddress on factory: ${this.factoryAddress}`);
    console.log(` > Owner: ${ownerAddress}`);
    console.log(` > Salt (index): ${this.index}`);
    // --- END ADDED LOGGING ---

    try {
      // Call the `getAddress` view function on the factory contract.
      // `this.index` is the salt, inherited from the base SimpleAccountAPI.
      this.accountAddress = await factory.getAddress(ownerAddress, this.index);
      console.log(`[ProofWalletAPI] Got predicted address: ${this.accountAddress}`);
      return this.accountAddress!;
    } catch (error: any) {
      // Enhance the error message to be more explicit about the likely cause.
      console.error("Fatal Error: factory.getAddress() call failed.", error);
      const newError = new Error(
        `Factory.getAddress() call failed: ${error.message || 'call revert exception'}. ` +
        `This often means the factory address (${this.factoryAddress}) is wrong or stale. ` +
        `Try a hard refresh (Ctrl+Shift+R) of your browser.`
      );
      (newError as any).cause = error;
      throw newError;
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
    const initCode = hexConcat([this.factoryAddress, calldata]);
    console.log(`[ProofWalletAPI] initCode length: ${initCode.length}`);
    return initCode;
  }
}
