/**
 * C-TRACKER V4 FRONTEND / THIRD-PARTY API UTILITIES
 * -------------------------------------------------
 * Este módulo expone funciones de alto nivel para integrarse desde un frontend
 * o servicios externos con los contratos CoreSwapV4 y ReferralEngineV4.
 * 
 * Objetivos:
 *  - Swaps (todas las variantes soportadas) con parámetros correctos.
 *  - Gestión de referrals: selección de modelo, envío de referrer.
 *  - Consulta de pending referral y claim (nativo o token) de forma segura.
 *  - Inferir deadlines, minOut y validaciones básicas.
 *  - Explicar modelos de referral y cómo pasar parámetros.
 *  - Minimizar errores de input (tipos, units, deadlines, paths, slippage).
 * 
 * Dependencias: ethers v6
 * Requiere que el caller provea un signer (wallet) o provider según la operación.
 */

import { ethers } from 'ethers';

/** ---------------------------------------------------------------------------
 * CONFIG / CONSTANTES
 * --------------------------------------------------------------------------*/
const DEFAULT_DEADLINE_SECS = 600; // 10 minutos
// Current mainnet Core address (BNB Chain) after fee-on-transfer sell fallback redeploy
const MAINNET_CORE_CURRENT = '0xfF2B8a49Df43ed103B67f6F8E72F049aD8f330Ba';

/**
 * Estructura esperada del objeto config pasado a initContracts:
 * {
 *   coreAddress: '0x...',
 *   referralAddress: '0x...',
 *   feeManagerAddress: '0x...' (opcional para snapshots),
 *   wNative: '0x...',
 *   provider: ethers.Provider, // requerido
 *   signer: ethers.Signer (opcional para lecturas, requerido para writes)
 * }
 */

// ABI actualizado: Core ya no expone getter público wNative().
// El SDK usará wNative provisto en config o variable externa.
const CoreSwapV4_ABI = [
  'event SwapExecuted(address indexed user,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut,uint256 platformFee,uint256 referralFee,uint256 modelId,uint8 tier,address router,uint256 timestamp)',
  'function quoteBestPath(uint256 amountIn,address tokenIn,address tokenOut) view returns (address router,address[] path,uint256 amountOut)',
  'function swapETHForToken(address tokenOut,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient) payable',
  'function swapETHForTokenChain(address tokenOut,uint256 minOut,uint256 deadline,uint256 referralModelId,address[3] refChain,uint256 requestedTier,address recipient) payable',
  'function swapTokenForETH(address tokenIn,uint256 amountIn,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient)',
  'function swapTokenForToken(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient)',
  'function swapETHForTokenPath(address[] path,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient) payable',
  'function swapTokenForTokenPath(address[] path,uint256 amountIn,uint256 minOut,uint256 deadline,uint256 referralModelId,address referrer,uint256 requestedTier,address recipient)',
  'function platformPool() view returns (uint256)'
];

// FeeManager (opcional para cotizaciones más precisas)
const FeeManagerV4_ABI = [
  'function currentTier(address) view returns (uint8)',
  'function feeConfig() view returns (tuple(uint16 defaultPlatformBP,uint16 vipPlatformBP,uint16 premiumPlatformBP,uint16 maxReferralTotalBP))'
];

const ReferralEngineV4_ABI = [
  'function pendingReferral(address) view returns (uint256)',
  'function totalPendingReferral() view returns (uint256)',
  'function getReferralModel(uint256 id) view returns (tuple(uint256 id,uint16[] levelBps,bool active,uint8 levels,bool locked))',
  'function referralUserSnapshot(address user,address feeManager) view returns (bool claimable,uint256 pending,address l1,address l2,address l3,uint8 tier,uint256 volume)',
  'function claimReferral(uint256 amount,address tokenOut,uint256 minOut,uint256 deadline,address recipient) returns (uint256)',
  'function claimReferralPath(uint256 amount,address[] path,uint256 minOut,uint256 deadline,address recipient) returns (uint256)',
  'function isTokenWhitelisted(address) view returns (bool)',
  'function wNative() view returns (address)'
  , 'function leftoverReferral() view returns (uint256)'
  , 'function modelLeftover(uint256) view returns (uint256)'
];

/** ---------------------------------------------------------------------------
 * REFERRAL MODELS - DESCRIPCIÓN LÓGICA
 * --------------------------------------------------------------------------*/
/**
 * Un ReferralModel define niveles (levels) y basis points (bps) por nivel sobre la base
 * de cálculo (feeBase) que entrega el Core (fee en nativo sujeta a reparto). Ejemplo:
 *  id: 2
 *  levels: 3
 *  levelBps: [500, 300, 200]  => Nivel1 5%, Nivel2 3%, Nivel3 2% (total 10% = 1000 bps)
 * El contrato valida que la suma no exceda un maxTotalBP global (ej. 3000 = 30%).
 *
 * Parámetros de swap relevantes para referral:
 *  - referralModelId: ID numérico del modelo (uint256)
 *  - referrer: address del Level1 (puede ser zero si no se desea referral) 
 *    El contrato internamente registrará la cadena L2 y L3 copiando los L1/L2 del referrer.
 *  - requestedTier: (en CoreSwapV4 actualmente no se fuerza; se mantiene para compat / futuro)
 *
 * Flujo de acumulación:
 *  1. Core calcula platformFee + referralFee total sobre el monto en nativo (entrada o salida según la dirección del swap).
 *  2. Llama a referralEngine.accrueReferral(user, referrer, modelId, feeBase).
 *  3. ReferralEngine reparte a cada nivel (si existe) y almacena _pending[address] += part.
 *  4. El total pendiente global _totalPending se incrementa.
 *  5. El Core transfiere inmediatamente la parte referral (en nativo) al ReferralEngine (custodia).
 *
 * Claim:
 *  - claimReferral(amount, tokenOut, minOut, deadline, recipient)
 *      amount = 0 o > pending => usa full pending.
 *      tokenOut = 0x0 => se entrega nativo directamente.
 *      tokenOut != 0 y whitelisted => se usa conversión wNative->tokenOut vía router configurado.
 *  - claimReferralPath(amount, path, minOut, deadline, recipient)
 *      path[0] debe ser wNative; path[last] token deseado (whitelisted). Permite control de ruta.
 *
 * Recomendación Frontend:
 *  - Mostrar pending (snapshot) y habilitar botón Claim cuando claimable=true.
 *  - Para reclamo con conversión proporcionar campos: tokenOut o path y minOut calculado con un quote ext.
 */

/** ---------------------------------------------------------------------------
 * INIT HELPERS
 * --------------------------------------------------------------------------*/
function initContracts(cfg){
  if(!cfg.provider) throw new Error('provider requerido');
  const runner = cfg.signer||cfg.provider;
  const core = new ethers.Contract(cfg.coreAddress, CoreSwapV4_ABI, runner);
  const referral = new ethers.Contract(cfg.referralAddress, ReferralEngineV4_ABI, runner);
  let feeManager = null;
  if (cfg.feeManagerAddress) {
    try { feeManager = new ethers.Contract(cfg.feeManagerAddress, FeeManagerV4_ABI, runner); } catch {/* ignore */}
  }
  return { core, referral, feeManager };
}

/** ---------------------------------------------------------------------------
 * UTILS
 * --------------------------------------------------------------------------*/
function calcDeadline(secondsAhead = DEFAULT_DEADLINE_SECS){
  return Math.floor(Date.now()/1000) + secondsAhead;
}

function applySlippage(amountOut, slippageBps){
  if (!amountOut || amountOut === 0n) return 0n;
  return amountOut * BigInt(10000 - slippageBps) / 10000n;
}

/** ---------------------------------------------------------------------------
 * SWAP QUOTE + EXECUTION
 * --------------------------------------------------------------------------*/
async function quoteBest(core, amountInWei, tokenIn, tokenOut){
  const [router, path, amountOut] = await core.quoteBestPath(amountInWei, tokenIn, tokenOut);
  return { router, path, amountOut };
}

async function swapETHForToken({ core, tokenOut, amountInWei, wNative, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  // Requiere wNative explícito (no getter). Si no se pasa aborta para evitar quote inválida.
  const wNativeAddr = wNative;
  if(!wNativeAddr) throw new Error('wNative requerido (pasar args.wNative)');
  const quote = await core.quoteBestPath(amountInWei, wNativeAddr, tokenOut).catch(()=>({amountOut:0n}));
  const minOut = quote.amountOut ? applySlippage(quote.amountOut, slippageBps) : 0n; // Nota: minOut sobre output estimado bruto; para slippage muy bajo considerar usar quoteBuy.
  const deadline = calcDeadline();
  const tx = await core.swapETHForToken(tokenOut, minOut, deadline, referralModelId, referrer, requestedTier, recipient, { value: amountInWei });
  return tx.wait();
}

/** ---------------------------------------------------------------------------
 * swapETHForTokenChain (Modelo 2 explícito)
 * Permite pasar cadena completa [L1,L2,L3]. Si alguna posición es address(0) se acumula leftover.
 * Slippage: usar quoteBuy para cálculo preciso neto si se exige tolerancia estricta.
 */
async function swapETHForTokenChain({ core, tokenOut, amountInWei, refChain, wNative, slippageBps=800, referralModelId=2, requestedTier=0, recipient=ethers.ZeroAddress }){
  if(!Array.isArray(refChain) || refChain.length !== 3) throw new Error('refChain debe tener length 3');
  if(!wNative) throw new Error('wNative requerido');
  const quote = await core.quoteBestPath(amountInWei, wNative, tokenOut).catch(()=>({amountOut:0n}));
  const minOut = quote.amountOut ? applySlippage(quote.amountOut, slippageBps) : 0n;
  const deadline = calcDeadline();
  const tx = await core.swapETHForTokenChain(tokenOut, minOut, deadline, referralModelId, refChain, requestedTier, recipient, { value: amountInWei });
  return tx.wait();
}

async function swapTokenForETH({ core, tokenIn, amountInWei, minOut=0n, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  const deadline = calcDeadline();
  const tx = await core.swapTokenForETH(tokenIn, amountInWei, minOut, deadline, referralModelId, referrer, requestedTier, recipient);
  return tx.wait();
}

async function swapTokenForToken({ core, tokenIn, tokenOut, amountInWei, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  const quote = await core.quoteBestPath(amountInWei, tokenIn, tokenOut).catch(()=>({amountOut:0n}));
  const minOut = quote.amountOut ? applySlippage(quote.amountOut, slippageBps) : 0n;
  const deadline = calcDeadline();
  const tx = await core.swapTokenForToken(tokenIn, tokenOut, amountInWei, minOut, deadline, referralModelId, referrer, requestedTier, recipient);
  return tx.wait();
}

/** ---------------------------------------------------------------------------
 * PRECISION QUOTES (No-referral focus)
 * Estas funciones replican la lógica interna del Core para estimar el netOut real
 * teniendo en cuenta la aplicación de platformFee antes (buy) o después (sell) de la operación.
 * Para escenarios con referral pueden extenderse incorporando bps de modelo.
 */

async function _getPlatformFeeBp(feeManager, user){
  if(!feeManager) return 0; // fallback si no disponible
  try {
    const tier = await feeManager.currentTier(user);
    const cfg = await feeManager.feeConfig();
    return tier === 2 ? cfg.premiumPlatformBP : (tier === 1 ? cfg.vipPlatformBP : cfg.defaultPlatformBP);
  } catch { return 0; }
}

async function quoteBuy({ core, feeManager, user, amountInWei, tokenOut, wNative, slippageBps=800, referralEngine, referralModelId, referrer }){
  if(!wNative) return { grossQuote:0n, platformFeeBP:0, platformFee:0n, netForSwap:0n, estimatedOut:0n, minOut:0n };
  const [, , grossOut] = await core.quoteBestPath(amountInWei, wNative, tokenOut).catch(()=>[ethers.ZeroAddress, [], 0n]);
  const platformFeeBP = await _getPlatformFeeBp(feeManager, user);
  const platformFee = (amountInWei * BigInt(platformFeeBP)) / 10000n; // aplicado sobre amountIn (fee base)
  // Referral fee (modelo 0: 1 nivel) si referrer no es zero y model activo
  let referralFeeBP = 0;
  if (referrer && referrer !== ethers.ZeroAddress && referralEngine && (referralModelId===0 || referralModelId===2)) {
    try {
      const model = await referralEngine.getReferralModel(referralModelId===2?2:0);
      if (model && model.active) {
        // Para modelo 0 (un nivel) tomamos levelBps[0]; para modelo 2 sólo consideramos primer nivel si sólo hay L1
        const levelArr = model.levelBps || [];
        if (Array.isArray(levelArr) && levelArr.length>0) referralFeeBP = levelArr[0];
      }
    } catch { /* ignore */ }
  }
  const referralFee = (amountInWei * BigInt(referralFeeBP)) / 10000n;
  const netForSwap = amountInWei - platformFee - referralFee;
  // Aproximación lineal: output escala lineal con input efectiva
  const estimatedOut = grossOut === 0n ? 0n : (grossOut * netForSwap) / amountInWei;
  const minOut = applySlippage(estimatedOut, slippageBps);
  const priceImpactPct = grossOut === 0n ? 0 : Number(((grossOut - estimatedOut) * 10000n) / (grossOut === 0n ? 1n : grossOut)) / 100; // %
  return { grossQuote: grossOut, platformFeeBP, platformFee, referralFeeBP, referralFee, netForSwap, estimatedOut, minOut, priceImpactPct };
}

async function quoteSell({ core, feeManager, user, amountInTokenWei, tokenIn, wNative, slippageBps=800, referralEngine, referralModelId, referrer }){
  if(!wNative) return { grossQuote:0n, platformFeeBP:0, platformFee:0n, netOut:0n, minOut:0n };
  const [, , grossOut] = await core.quoteBestPath(amountInTokenWei, tokenIn, wNative).catch(()=>[ethers.ZeroAddress, [], 0n]);
  const platformFeeBP = await _getPlatformFeeBp(feeManager, user);
  const platformFee = (grossOut * BigInt(platformFeeBP)) / 10000n; // fee sobre salida nativa
  let referralFeeBP = 0;
  if (referrer && referrer !== ethers.ZeroAddress && referralEngine && (referralModelId===0 || referralModelId===2)) {
    try {
      const model = await referralEngine.getReferralModel(referralModelId===2?2:0);
      if (model && model.active) {
        const levelArr = model.levelBps || [];
        if (Array.isArray(levelArr) && levelArr.length>0) referralFeeBP = levelArr[0];
      }
    } catch { /* ignore */ }
  }
  const referralFee = (grossOut * BigInt(referralFeeBP)) / 10000n;
  const netOutBeforeSlip = grossOut - platformFee - referralFee;
  const minOut = applySlippage(netOutBeforeSlip, slippageBps);
  const priceImpactPct = grossOut === 0n ? 0 : Number(((grossOut - netOutBeforeSlip) * 10000n) / (grossOut === 0n ? 1n : grossOut)) / 100;
  return { grossQuote: grossOut, platformFeeBP, platformFee, referralFeeBP, referralFee, netOut: netOutBeforeSlip, minOut, priceImpactPct };
}

async function quoteTokenForToken({ core, feeManager, user, amountInWei, tokenIn, tokenOut, wNative, slippageBps=800, referralEngine, referralModelId, referrer }){
  if(!wNative) return { leg1Out:0n, platformFee:0n, netNative:0n, leg2Out:0n, minOut:0n };
  const [, , leg1Out] = await core.quoteBestPath(amountInWei, tokenIn, wNative).catch(()=>[ethers.ZeroAddress, [], 0n]);
  const platformFeeBP = await _getPlatformFeeBp(feeManager, user);
  const platformFee = (leg1Out * BigInt(platformFeeBP)) / 10000n; // fee sobre salida wNative (se unwrappa)
  let referralFeeBP = 0;
  if (referrer && referrer !== ethers.ZeroAddress && referralEngine && (referralModelId===0 || referralModelId===2)) {
    try {
      const model = await referralEngine.getReferralModel(referralModelId===2?2:0);
      if (model && model.active) {
        const levelArr = model.levelBps || [];
        if (Array.isArray(levelArr) && levelArr.length>0) referralFeeBP = levelArr[0];
      }
    } catch { /* ignore */ }
  }
  const referralFee = (leg1Out * BigInt(referralFeeBP)) / 10000n;
  const netNative = leg1Out - platformFee - referralFee;
  const [, , leg2Out] = await core.quoteBestPath(netNative, wNative, tokenOut).catch(()=>[ethers.ZeroAddress, [], 0n]);
  const minOut = applySlippage(leg2Out, slippageBps);
  const combinedGrossDestination = leg2Out === 0n ? 0n : leg2Out + platformFee + referralFee; // aproximado para impacto
  const priceImpactPct = combinedGrossDestination === 0n ? 0 : Number(((combinedGrossDestination - leg2Out) * 10000n) / (combinedGrossDestination === 0n ? 1n : combinedGrossDestination)) / 100;
  return { leg1Out, platformFeeBP, platformFee, referralFeeBP, referralFee, netNative, leg2Out, minOut, priceImpactPct };
}

/** ---------------------------------------------------------------------------
 * PATH SWAPS (explicit routing)
 * --------------------------------------------------------------------------*/
async function swapETHForTokenPath({ core, path, amountInWei, expectedOut, minOut, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  if(!Array.isArray(path) || path.length < 2) throw new Error('path inválido');
  let computedMinOut = 0n;
  if (minOut != null) {
    computedMinOut = minOut;
  } else if (expectedOut != null) {
    computedMinOut = applySlippage(BigInt(expectedOut), slippageBps);
  }
  const deadline = calcDeadline();
  const tx = await core.swapETHForTokenPath(path, computedMinOut, deadline, referralModelId, referrer, requestedTier, recipient, { value: amountInWei });
  return tx.wait();
}

async function swapTokenForTokenPath({ core, path, amountInWei, expectedOut, minOut, slippageBps=800, referralModelId=0, referrer=ethers.ZeroAddress, requestedTier=0, recipient=ethers.ZeroAddress }){
  if(!Array.isArray(path) || path.length < 2) throw new Error('path inválido');
  let computedMinOut = 0n;
  if (minOut != null) {
    computedMinOut = minOut;
  } else if (expectedOut != null) {
    computedMinOut = applySlippage(BigInt(expectedOut), slippageBps);
  }
  const deadline = calcDeadline();
  const tx = await core.swapTokenForTokenPath(path, amountInWei, computedMinOut, deadline, referralModelId, referrer, requestedTier, recipient);
  return tx.wait();
}

/** ---------------------------------------------------------------------------
 * REFERRAL QUERIES
 * --------------------------------------------------------------------------*/
async function getReferralSnapshot(referral, user, feeManager){
  return referral.referralUserSnapshot(user, feeManager||ethers.ZeroAddress);
}

async function getPending(referral, user){
  return referral.pendingReferral(user);
}

// Snapshot helpers para claim
async function hasClaimable(referral, user, feeManager){
  const snap = await referral.referralUserSnapshot(user, feeManager||ethers.ZeroAddress);
  return snap[0];
}
async function getClaimableAmount(referral, user){
  return referral.pendingReferral(user); // alias semántico
}

/** ---------------------------------------------------------------------------
 * CLAIM FUNCTIONS
 * --------------------------------------------------------------------------*/
async function claimNative({ referral, amount=0n, recipient=ethers.ZeroAddress }){
  const deadline = calcDeadline();
  const tx = await referral.claimReferral(amount, ethers.ZeroAddress, 0, deadline, recipient);
  return tx.wait();
}

async function claimToken({ referral, tokenOut, amount=0n, minOut=0n, recipient=ethers.ZeroAddress, deadlineSecs=DEFAULT_DEADLINE_SECS }){
  const deadline = calcDeadline(deadlineSecs);
  const tx = await referral.claimReferral(amount, tokenOut, minOut, deadline, recipient);
  return tx.wait();
}

async function claimPath({ referral, path, amount=0n, minOut=0n, recipient=ethers.ZeroAddress, deadlineSecs=DEFAULT_DEADLINE_SECS }){
  const deadline = calcDeadline(deadlineSecs);
  const tx = await referral.claimReferralPath(amount, path, minOut, deadline, recipient);
  return tx.wait();
}

/** ---------------------------------------------------------------------------
 * VALIDATION HELPERS (Frontend Pre-checks)
 * --------------------------------------------------------------------------*/
function validateReferralInputs({ referralModelId, referrer }){
  if (referralModelId < 0) throw new Error('referralModelId inválido');
  if (!ethers.isAddress(referrer)) throw new Error('referrer no es address');
}

function validateClaimToken({ tokenOut, minOut }){
  if (!ethers.isAddress(tokenOut)) throw new Error('tokenOut no es address');
  if (minOut < 0n) throw new Error('minOut negativo');
}

function validateClaimPath(path){
  if (!Array.isArray(path) || path.length < 2) throw new Error('path inválido');
  path.forEach(a=>{ if(!ethers.isAddress(a)) throw new Error('address inválido en path'); });
}

/** ---------------------------------------------------------------------------
 * EJEMPLOS DE USO (comentado) PARA FRONTEND
 * --------------------------------------------------------------------------*/
/*
import { BrowserProvider } from 'ethers';
import { initContracts, quoteBest, swapETHForToken } from './api/index.js';

async function ejemplo(){
 const provider = new BrowserProvider(window.ethereum);
 const signer = await provider.getSigner();
 const { core, referral } = initContracts({
   coreAddress: process.env.NEXT_PUBLIC_CORE,
   referralAddress: process.env.NEXT_PUBLIC_REFERRAL,
   provider, signer
 });
 // Quote
 const amountIn = ethers.parseEther('0.5');
 const { path, amountOut } = await quoteBest(core, amountIn, WBNB, CTK);
 // Swap
 await swapETHForToken({ core, tokenOut: CTK, amountInWei: amountIn, referralModelId:2, referrer:'0xRef...' });
 // Pending
 const pending = await getPending(referral, await signer.getAddress());
 // Claim native
 await claimNative({ referral, amount: 0n }); // 0 => full
}
*/

/** ---------------------------------------------------------------------------
 * WRAPPER FUNCTIONS FOR FRONTEND COMPATIBILITY
 * --------------------------------------------------------------------------*/

// Wrapper function that maps getBestQuote to quoteBest
async function getBestQuote(amountIn, tokenIn, tokenOut) {
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  return await quoteBest(globalContracts.core, amountInWei, tokenIn, tokenOut);
}

// Wrapper function for executeSwap - determines swap type and calls appropriate function
async function executeSwap(params) {
  const { fromToken, toToken, amountIn, slippageBps, referralModelId, referrer, requestedTier, recipient } = params;
  
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const isFromNative = fromToken === ethers.ZeroAddress;
  const isToNative = toToken === ethers.ZeroAddress;
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  
  if (isFromNative && !isToNative) {
    // ETH to Token
    return await swapETHForToken({ 
      core: globalContracts.core, 
      tokenOut: toToken, 
      amountInWei, 
      wNative: globalContracts.wNative,
      slippageBps, 
      referralModelId, 
      referrer, 
      requestedTier, 
      recipient 
    });
  } else if (!isFromNative && isToNative) {
    // Token to ETH
    return await swapTokenForETH({ 
      core: globalContracts.core, 
      tokenIn: fromToken, 
      amountInWei, 
      referralModelId, 
      referrer, 
      requestedTier, 
      recipient 
    });
  } else if (!isFromNative && !isToNative) {
    // Token to Token
    return await swapTokenForToken({ 
      core: globalContracts.core, 
      tokenIn: fromToken, 
      tokenOut: toToken, 
      amountInWei, 
      slippageBps, 
      referralModelId, 
      referrer, 
      requestedTier, 
      recipient 
    });
  } else {
    throw new Error('Swap ETH to ETH no soportado');
  }
}

// Specific quote functions for different swap types
async function getQuoteNativeToToken(amountIn, tokenOut) {
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  return await quoteBest(globalContracts.core, amountInWei, ethers.ZeroAddress, tokenOut);
}

async function getQuoteTokenToNative(amountIn, tokenIn) {
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  return await quoteBest(globalContracts.core, amountInWei, tokenIn, ethers.ZeroAddress);
}

async function getQuoteTokenToToken(amountIn, tokenIn, tokenOut) {
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  return await quoteBest(globalContracts.core, amountInWei, tokenIn, tokenOut);
}

// Specific execute functions for different swap types
async function executeSwapNativeToToken(amountIn, tokenOut, slippageBps, referralModelId, referrer, requestedTier, recipient) {
  return await executeSwap({
    fromToken: ethers.ZeroAddress,
    toToken: tokenOut,
    amountIn,
    slippageBps,
    referralModelId,
    referrer,
    requestedTier,
    recipient
  });
}

async function executeSwapTokenToNative(tokenIn, amountIn, slippageBps, referralModelId, referrer, requestedTier, recipient) {
  return await executeSwap({
    fromToken: tokenIn,
    toToken: ethers.ZeroAddress,
    amountIn,
    slippageBps,
    referralModelId,
    referrer,
    requestedTier,
    recipient
  });
}

async function executeSwapTokenToToken(tokenIn, tokenOut, amountIn, slippageBps, referralModelId, referrer, requestedTier, recipient) {
  return await executeSwap({
    fromToken: tokenIn,
    toToken: tokenOut,
    amountIn,
    slippageBps,
    referralModelId,
    referrer,
    requestedTier,
    recipient
  });
}

// Path-based swap functions (if needed)
async function executeSwapNativeToTokenPath(path, amountIn, slippageBps, referralModelId, referrer, requestedTier, recipient) {
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  return await swapETHForTokenPath({ 
    core: globalContracts.core, 
    path, 
    amountInWei, 
    slippageBps, 
    referralModelId, 
    referrer, 
    requestedTier, 
    recipient 
  });
}

async function executeSwapTokenToTokenPath(path, amountIn, slippageBps, referralModelId, referrer, requestedTier, recipient) {
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  return await swapTokenForTokenPath({ 
    core: globalContracts.core, 
    path, 
    amountInWei, 
    slippageBps, 
    referralModelId, 
    referrer, 
    requestedTier, 
    recipient 
  });
}

// Chain-based swap function
async function executeSwapNativeToTokenChain(tokenOut, amountIn, refChain, slippageBps, referralModelId, requestedTier, recipient) {
  if (!globalContracts?.core) {
    throw new Error('SDK no inicializado - llama a initContracts() primero');
  }
  
  const amountInWei = typeof amountIn === 'string' ? ethers.parseEther(amountIn) : amountIn;
  return await swapETHForTokenChain({ 
    core: globalContracts.core, 
    tokenOut, 
    amountInWei, 
    refChain, 
    wNative: globalContracts.wNative,
    slippageBps, 
    referralModelId, 
    requestedTier, 
    recipient 
  });
}

// Referral claim wrapper functions - map to actual function names
async function claimReferralNative({ referral, amount, recipient }) {
  return await claimNative({ referral, amount, recipient });
}

async function claimReferralToken({ referral, tokenOut, amount, minOut, recipient, deadlineSecs }) {
  return await claimToken({ referral, tokenOut, amount, minOut, recipient, deadlineSecs });
}

async function claimReferralPercentage({ referral, percentage, tokenOut, path, minOut, recipient }) {
  return await claimPercentage({ referral, percentage, tokenOut, path, minOut, recipient });
}

// Referral functions - map to existing functions
async function getPendingReferral(referral, user) {
  return await getPending(referral, user);
}

// Helper function wrappers - copied from original API
function parseConfig(configStr) {
  if (!configStr) return {};
  try {
    return JSON.parse(configStr);
  } catch (error) {
    console.error('Error parsing config:', error);
    return {};
  }
}

function parseTierRules(str){
  if(!str) return [];
  let arr;
  try { arr = JSON.parse(str); } catch { return []; }
  if(!Array.isArray(arr)) return [];
  return arr.filter(r=> r && (r.minVolume!==undefined) && (r.tier!==undefined));
}

async function getGlobalLeftover(referral){ 
  return referral.leftoverReferral(); 
}

async function getModelLeftover(referral, modelId){ 
  return referral.modelLeftover(modelId); 
}

// Global contracts storage for wrapper functions
let globalContracts = null;

// Override initContracts to store contracts globally
const _originalInitContracts = initContracts;
function initContractsEnhanced(config) {
  const result = _originalInitContracts(config);
  globalContracts = result;
  return result;
}

/** ---------------------------------------------------------------------------
 * EXPORTS
 * --------------------------------------------------------------------------*/
module.exports = {
  initContracts,
  quoteBest,
  swapETHForToken,
  swapETHForTokenChain,
  swapTokenForETH,
  swapTokenForToken,
  swapETHForTokenPath,
  swapTokenForTokenPath,
  quoteBuy,
  quoteSell,
  quoteTokenForToken,
  getReferralSnapshot,
  getPending,
  hasClaimable,
  getClaimableAmount,
  claimNative,
  claimToken,
  claimPath,
  validateReferralInputs,
  validateClaimToken,
  validateClaimPath,
  calcDeadline,
  applySlippage,
  MAINNET_CORE_CURRENT
};

/** ---------------------------------------------------------------------------
 * TIER / VIP HELPERS
 * --------------------------------------------------------------------------*/
/**
 * determineRequestedTier
 * Dado un volumen acumulado (bigint) y una lista de reglas [{ minVolume, tier }]
 * devuelve el tier más alto cuyo minVolume <= volume. Si no coincide, retorna 0.
 * Reglas pueden venir sin ordenar; empates se resuelven por tier numérico mayor.
 * minVolume acepta bigint o string (parseado a bigint).
 */
function determineRequestedTier(volume, rules){
  if (!rules || !Array.isArray(rules) || rules.length === 0) return 0;
  const vol = BigInt(volume);
  let chosen = 0;
  for (const r of rules){
    if (r == null) continue;
    if (r.tier == null) continue;
    let mv;
    try { mv = typeof r.minVolume === 'bigint' ? r.minVolume : BigInt(r.minVolume); } catch { continue; }
    if (vol >= mv && r.tier > chosen) chosen = r.tier;
  }
  return chosen;
}

module.exports.determineRequestedTier = determineRequestedTier;
// Re-export config loader for external projects
try { module.exports.loadApiConfig = require('./config').loadApiConfig; } catch {}

/** ---------------------------------------------------------------------------
 * CLAIM PERCENTAGE HELPER
 * --------------------------------------------------------------------------*/
async function claimPercentage({ referral, percentage, tokenOut, path, minOut=0n, recipient=ethers.ZeroAddress }){
  if (percentage <=0 || percentage > 100) throw new Error('percentage inválido');
  const me = recipient !== ethers.ZeroAddress ? recipient : undefined;
  const addr = me || (referral.runner && referral.runner.address) || (referral.signer && referral.signer.address) || undefined;
  if(!addr) throw new Error('No signer/address context para calcular pending');
  const pending = await referral.pendingReferral(addr);
  if (pending === 0n) return { skipped:true, reason:'No pending' };
  const amount = (pending * BigInt(percentage)) / 100n;
  if (path){
    const deadline = calcDeadline();
    const tx = await referral.claimReferralPath(amount, path, minOut, deadline, recipient);
    return tx.wait();
  }
  if (tokenOut){
    const deadline = calcDeadline();
    const tx = await referral.claimReferral(amount, tokenOut, minOut, deadline, recipient);
    return tx.wait();
  }
  // native
  const deadline = calcDeadline();
  const tx = await referral.claimReferral(amount, ethers.ZeroAddress, 0, deadline, recipient);
  return tx.wait();
}
module.exports.claimPercentage = claimPercentage;

/** ---------------------------------------------------------------------------
 * parseTierRules helper (string -> array validada)
 * --------------------------------------------------------------------------*/
function parseTierRules(str){
  if(!str) return [];
  let arr;
  try { arr = JSON.parse(str); } catch { return []; }
  if(!Array.isArray(arr)) return [];
  return arr.filter(r=> r && (r.minVolume!==undefined) && (r.tier!==undefined));
}

/** ---------------------------------------------------------------------------
 * Leftover Helpers
 * --------------------------------------------------------------------------*/
async function getGlobalLeftover(referral){ return referral.leftoverReferral(); }
async function getModelLeftover(referral, modelId){ return referral.modelLeftover(modelId); }

/** ---------------------------------------------------------------------------
 * EXPORTS - Compatible con CommonJS y ES modules
 * --------------------------------------------------------------------------*/
// Exportaciones principales
const cTrackerSDK = {
  // Core functions
  initContracts: initContractsEnhanced,
  getBestQuote,
  executeSwap,
  
  // Quote functions
  getQuoteNativeToToken,
  getQuoteTokenToNative, 
  getQuoteTokenToToken,
  
  // Swap execution functions
  executeSwapNativeToToken,
  executeSwapTokenToNative,
  executeSwapTokenToToken,
  
  // Path-based swaps
  executeSwapNativeToTokenPath,
  executeSwapTokenToTokenPath,
  
  // Chain swaps
  executeSwapNativeToTokenChain,
  
  // Referral functions
  getPendingReferral,
  claimReferralNative,
  claimReferralToken,
  claimReferralPercentage,
  
  // Helper functions
  parseConfig,
  parseTierRules,
  getGlobalLeftover,
  getModelLeftover,
  
  // Constants
  DEFAULT_DEADLINE_SECS,
  MAINNET_CORE_CURRENT
};

// ES modules exports
export default cTrackerSDK;

// Named exports for better tree-shaking
export {
  initContractsEnhanced as initContracts,
  getBestQuote,
  executeSwap,
  getQuoteNativeToToken,
  getQuoteTokenToNative,
  getQuoteTokenToToken,
  executeSwapNativeToToken,
  executeSwapTokenToNative,
  executeSwapTokenToToken,
  executeSwapNativeToTokenPath,
  executeSwapTokenToTokenPath,
  executeSwapNativeToTokenChain,
  getPendingReferral,
  claimReferralNative,
  claimReferralToken,
  claimReferralPercentage,
  parseConfig,
  parseTierRules,
  getGlobalLeftover,
  getModelLeftover,
  DEFAULT_DEADLINE_SECS,
  MAINNET_CORE_CURRENT
};
