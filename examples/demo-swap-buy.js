#!/usr/bin/env node
// Demo: Swap BNB -> CTK (sin referral)
require('dotenv').config();
const { ethers } = require('ethers');
const { initContracts, quoteBest, swapETHForToken, applySlippage } = require('..');
const { loadApiConfig } = require('../config');

async function main(){
  const cfg = loadApiConfig();
  const pk = process.env.DEMO_PRIVATE_KEY;
  if(!pk) throw new Error('DEMO_PRIVATE_KEY faltante');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const { core } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });
  const amountIn = ethers.parseEther(process.env.DEMO_BUY_AMOUNT || '0.01');
  const q = await quoteBest(core, amountIn, cfg.wNative, cfg.ctkToken);
  const minOut = applySlippage(q.amountOut, parseInt(process.env.DEFAULT_SWAP_SLIPPAGE||'800',10));
  console.log('Quote path:', q.path, 'rawOut:', q.amountOut.toString(), 'minOut:', minOut.toString());
  const receipt = await swapETHForToken({ core, tokenOut: cfg.ctkToken, amountInWei: amountIn });
  console.log('Swap tx:', receipt.transactionHash);
}
main().catch(e=>{ console.error(e); process.exit(1); });
