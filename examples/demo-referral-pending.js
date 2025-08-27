#!/usr/bin/env node
// Demo: Mostrar pending referral
require('dotenv').config();
const { ethers } = require('ethers');
const { initContracts, getPending } = require('..');
const { loadApiConfig } = require('../config');

async function main(){
  const cfg = loadApiConfig();
  const addr = process.env.QUERY_ADDRESS; if(!addr) throw new Error('QUERY_ADDRESS faltante');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const { referral } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider });
  const pending = await getPending(referral, addr);
  console.log('Pending (wei):', pending.toString());
}
main().catch(e=>{ console.error(e); process.exit(1); });
