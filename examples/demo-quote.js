#!/usr/bin/env node
// Demo: quote path & expected output using SDK with env config
const { ethers } = require('ethers');
const { initContracts, quoteBest } = require('..');
const { loadApiConfig } = require('../config');
require('dotenv').config();

async function main(){
  const cfg = loadApiConfig();
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const { core } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider });
  const amountIn = ethers.parseEther('0.01');
  const q = await quoteBest(core, amountIn, cfg.wNative, cfg.ctkToken);
  console.log('Quote router:', q.router);
  console.log('Path:', q.path);
  console.log('AmountOut:', q.amountOut.toString());
}
main().catch(e=>{ console.error(e); process.exit(1); });
