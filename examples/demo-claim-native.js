#!/usr/bin/env node
// Demo: Claim full nativo
require('dotenv').config();
const { ethers } = require('ethers');
const { initContracts, getPending, claimNative } = require('..');
const { loadApiConfig } = require('../config');

async function main(){
  const cfg = loadApiConfig();
  const pk = cfg.referrerPk; if(!pk) throw new Error('REFERRER_PRIVATE_KEY faltante');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const { referral } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });
  const pending = await getPending(referral, wallet.address);
  console.log('Pending', pending.toString());
  if(pending === 0n){ console.log('Nada para claim'); return; }
  const receipt = await claimNative({ referral, amount: 0n });
  console.log('Claim tx:', receipt.transactionHash);
}
main().catch(e=>{ console.error(e); process.exit(1); });
