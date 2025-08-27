#!/usr/bin/env node
// Demo: show pending referral and (optionally) claim half in tokenOut
const { ethers } = require('ethers');
const { initContracts, getPending, claimToken, applySlippage } = require('..');
const { loadApiConfig } = require('../config');
require('dotenv').config();

async function main(){
  const cfg = loadApiConfig();
  if(!cfg.referrerPk) throw new Error('REFERRER_PRIVATE_KEY missing');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(cfg.referrerPk, provider);
  const { referral } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });
  const pending = await getPending(referral, wallet.address);
  console.log('Pending native (wei):', pending.toString());
  if (pending === 0n){
    console.log('Nothing to claim');
    return;
  }
  const half = pending / 2n;
  const expectedOut = half * 100000n; // placeholder ratio; quote externally for precision
  const minOut = applySlippage(expectedOut, parseInt(process.env.DEFAULT_CLAIM_SLIPPAGE||'800',10));
  console.log('Claiming half:', half.toString(), 'minOut:', minOut.toString());
  const receipt = await claimToken({ referral, tokenOut: cfg.claimTokenOut || cfg.ctkToken, amount: half, minOut });
  console.log('Tx:', receipt.transactionHash);
}
main().catch(e=>{ console.error(e); process.exit(1); });
