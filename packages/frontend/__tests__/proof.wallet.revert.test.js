import { ProofWalletAPI } from '../src/lib/ProofWalletAPI';
import { ethers } from 'ethers';

function makeApi(mockGetSenderAddress) {
  const provider = new ethers.providers.JsonRpcProvider();
  const owner = ethers.Wallet.createRandom();
  const api = new ProofWalletAPI({
    provider,
    entryPointAddress: '0x' + '11'.repeat(20),
    owner,
  });
  api.getAccountInitCode = jest.fn(() => '0xdead');
  api.entryPointView = {
    callStatic: { getSenderAddress: mockGetSenderAddress },
  };
  return api;
}

describe('ProofWalletAPI.getAccountAddress', () => {
  test('throws when entrypoint call does not revert', async () => {
    const api = makeApi(jest.fn().mockResolvedValue('0x'));
    await expect(api.getAccountAddress()).rejects.toThrow('must handle revert');
  });

  test('returns address when revert contains SenderAddressResult', async () => {
    const expected = '0x' + 'aa'.repeat(20);
    const err = new Error('revert');
    err.errorArgs = { sender: expected };
    const api = makeApi(jest.fn().mockRejectedValue(err));
    await expect(api.getAccountAddress()).resolves.toBe(expected);
  });
});
