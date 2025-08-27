#!/usr/bin/env node
// Demo: Claim 50% a CTK
require('dotenv').config();
const { ethers } = require('ethers');
const { initContracts, getPending, claimToken, applySlippage } = require('..');
const { loadApiConfig } = require('../config');

async function main(){
  const cfg = loadApiConfig();
  const pk = cfg.referrerPk; if(!pk) throw new Error('REFERRER_PRIVATE_KEY faltante');
  if(!cfg.ctkToken) throw new Error('CTK_TOKEN faltante');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const { referral } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });
  const pending = await getPending(referral, wallet.address);
  console.log('Pending', pending.toString());
  if(pending === 0n){ console.log('Nada para claim'); return; }
  const half = pending / 2n;
  const assumedRate = BigInt(process.env.CLAIM_RATE_NUMERATOR || '100000');
  const expectedOut = half * assumedRate;
  const minOut = applySlippage(expectedOut, parseInt(process.env.DEFAULT_CLAIM_SLIPPAGE||'800',10));
  console.log('Claim half', half.toString(), 'minOut', minOut.toString());
  const receipt = await claimToken({ referral, tokenOut: cfg.ctkToken, amount: half, minOut });
  console.log('Claim token tx:', receipt.transactionHash);
}
main().catch(e=>{ console.error(e); process.exit(1); });
