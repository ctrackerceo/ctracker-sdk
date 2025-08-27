#!/usr/bin/env node
// Demo: Swap CTK -> BNB (sell) sin referral
require('dotenv').config();
const { ethers } = require('ethers');
const { initContracts, swapTokenForETH } = require('..');
const { loadApiConfig } = require('../config');

async function main(){
  const cfg = loadApiConfig();
  const pk = process.env.DEMO_PRIVATE_KEY; if(!pk) throw new Error('DEMO_PRIVATE_KEY faltante');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  const { core } = initContracts({ coreAddress: cfg.coreAddress, referralAddress: cfg.referralAddress, provider, signer: wallet });
  const amountIn = ethers.parseUnits(process.env.DEMO_SELL_AMOUNT || '100', 18);
  const erc20 = new ethers.Contract(cfg.ctkToken, ['function approve(address,uint256)','function allowance(address,address) view returns (uint256)'], wallet);
  const allowance = await erc20.allowance(wallet.address, cfg.coreAddress);
  if(allowance < amountIn){
    console.log('Aprobando...');
    const txa = await erc20.approve(cfg.coreAddress, amountIn);
    await txa.wait();
  }
  const receipt = await swapTokenForETH({ core, tokenIn: cfg.ctkToken, amountInWei: amountIn });
  console.log('Sell tx:', receipt.transactionHash);
}
main().catch(e=>{ console.error(e); process.exit(1); });
