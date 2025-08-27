require('dotenv').config();
const { ethers } = require('ethers');
const sdk = require('..');
/*
 Demo: Explicit Model 2 Swap with Full Referral Chain (swapETHForTokenChain)
 Steps:
 1. Loads env (CORE_V4, REFERRAL_V4, WNATIVE_V4, CTK_TOKEN, MODEL2_L1/2/3, MODEL2_BUY_BNB, DEMO_PRIVATE_KEY).
 2. Quotes best path WNATIVE -> tokenOut.
 3. Executes swapETHForTokenChain with refChain [L1,L2,L3]. If L3 zero, leftover accumulates.
 4. Prints pending deltas for L1/L2 and global/model leftover.
 5. Shows hasClaimable + amount for one referrer.

 Env requirements (see env.example):
  - RPC_URL
  - CORE_V4, REFERRAL_V4, FEE_V4, WNATIVE_V4, CTK_TOKEN
  - MODEL2_L1, MODEL2_L2, MODEL2_L3 (can be zero address for leftover)
  - MODEL2_BUY_BNB (e.g. 0.3)
  - DEMO_PRIVATE_KEY funded with enough testnet BNB
*/
async function main(){
  const rpc = process.env.RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/';
  const provider = new ethers.JsonRpcProvider(rpc);
  const pk = process.env.DEMO_PRIVATE_KEY;
  if(!pk) throw new Error('DEMO_PRIVATE_KEY missing');
  const wallet = new ethers.Wallet(pk, provider);
  console.log('Trader:', wallet.address);

  const cfg = {
    coreAddress: process.env.CORE_V4,
    referralAddress: process.env.REFERRAL_V4,
    provider,
    signer: wallet
  };
  const { core, referral } = sdk.initContracts(cfg);
  const wNative = process.env.WNATIVE_V4;
  const tokenOut = process.env.CTK_TOKEN || process.env.TOKEN_OUT;
  const amountInWei = ethers.parseEther(process.env.MODEL2_BUY_BNB || '0.3');
  const refChain = [process.env.MODEL2_L1, process.env.MODEL2_L2, process.env.MODEL2_L3];
  if(refChain.length !==3) throw new Error('Invalid refChain length');
  console.log('RefChain:', refChain);

  // Quote
  const quote = await sdk.quoteBest(core, amountInWei, wNative, tokenOut).catch(()=>({ amountOut:0n, path:[] }));
  console.log('Quote path:', quote.path, 'grossOut:', quote.amountOut.toString());
  const minOut = sdk.applySlippage(quote.amountOut, 800); // 8% default
  console.log('minOut (8% slippage):', minOut.toString());

  // Snapshot before (L1 and L2)
  const snapBeforeL1 = await referral.referralUserSnapshot(refChain[0], process.env.FEE_V4 || ethers.ZeroAddress);
  const snapBeforeL2 = await referral.referralUserSnapshot(refChain[1], process.env.FEE_V4 || ethers.ZeroAddress);

  // Execute
  console.log('Executing swapETHForTokenChain...');
  const receipt = await sdk.swapETHForTokenChain({ core, tokenOut, amountInWei, refChain, wNative, referralModelId:2 });
  console.log('Swap tx hash:', receipt.transactionHash);

  // Pending deltas
  const snapAfterL1 = await referral.referralUserSnapshot(refChain[0], process.env.FEE_V4 || ethers.ZeroAddress);
  const snapAfterL2 = await referral.referralUserSnapshot(refChain[1], process.env.FEE_V4 || ethers.ZeroAddress);
  const deltaL1 = snapAfterL1[1] - snapBeforeL1[1];
  const deltaL2 = snapAfterL2[1] - snapBeforeL2[1];
  console.log('L1 delta pending (BNB):', ethers.formatEther(deltaL1));
  console.log('L2 delta pending (BNB):', ethers.formatEther(deltaL2));

  // Leftovers
  const globalLeft = await sdk.getGlobalLeftover(referral);
  const model2Left = await sdk.getModelLeftover(referral, 2);
  console.log('Global leftover:', ethers.formatEther(globalLeft));
  console.log('Model 2 leftover:', ethers.formatEther(model2Left));

  // Claimable check for L1
  const hasClaim = await sdk.hasClaimable(referral, refChain[0], process.env.FEE_V4);
  const claimable = await sdk.getClaimableAmount(referral, refChain[0]);
  console.log('L1 hasClaimable:', hasClaim, 'pending:', ethers.formatEther(claimable));

  console.log('Done.');
}
main().catch(e=>{ console.error(e); process.exit(1); });
