import {
  createConfig,
  defaultProviders,
  fabric,
  zeroX,
  kyberswap,
  odos,
  lifi,
  relay,
  velora,
  type Config,
} from "@spandex/core";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
const APP_ID = process.env.APP_ID || "flashprofits";

export const SUPPORTED_CHAINS: Record<number, { name: string; alchemySubdomain: string }> = {
  1: { name: "Ethereum", alchemySubdomain: "eth-mainnet" },
  8453: { name: "Base", alchemySubdomain: "base-mainnet" },
  42161: { name: "Arbitrum", alchemySubdomain: "arb-mainnet" },
  10: { name: "Optimism", alchemySubdomain: "opt-mainnet" },
  137: { name: "Polygon", alchemySubdomain: "polygon-mainnet" },
  56: { name: "BSC", alchemySubdomain: "bnb-mainnet" },
  43114: { name: "Avalanche", alchemySubdomain: "avax-mainnet" },
};

const erc20Abi = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

function buildProviders() {
  const zeroXApiKey = process.env.ZEROX_API_KEY;
  const fabricApiKey = process.env.FABRIC_API_KEY;

  if (zeroXApiKey || fabricApiKey) {
    const providers = [];
    providers.push(fabric({ appId: APP_ID, apiKey: fabricApiKey }));
    if (zeroXApiKey) providers.push(zeroX({ apiKey: zeroXApiKey }));
    providers.push(kyberswap({ clientId: APP_ID }));
    providers.push(odos({}));
    providers.push(lifi({}));
    providers.push(relay({}));
    providers.push(velora({}));
    return providers;
  }

  return defaultProviders({ appId: APP_ID });
}

const clientCache = new Map<number, PublicClient>();

export function getClient(chainId: number): PublicClient {
  const cached = clientCache.get(chainId);
  if (cached) return cached;

  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    throw new Error(
      `Unsupported chain: ${chainId}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(", ")}`
    );
  }

  const rpcUrl =
    process.env[`RPC_URL_${chainId}`] ||
    `https://${chain.alchemySubdomain}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  clientCache.set(chainId, client as PublicClient);
  return client as PublicClient;
}

export function getSpandexConfig(): Config {
  return createConfig({
    providers: buildProviders(),
    clients: (chainId: number) => getClient(chainId),
    options: {
      deadlineMs: 15_000,
    },
  });
}

const decimalsCache = new Map<string, number>();
const symbolCache = new Map<string, string>();

export async function getTokenDecimals(chainId: number, address: string): Promise<number> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;

  const client = getClient(chainId);
  const decimals = await client.readContract({
    address: address as Address,
    abi: erc20Abi,
    functionName: "decimals",
  });

  decimalsCache.set(key, decimals);
  return decimals;
}

export async function getTokenSymbol(chainId: number, address: string): Promise<string> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const cached = symbolCache.get(key);
  if (cached !== undefined) return cached;

  const client = getClient(chainId);
  try {
    const symbol = await client.readContract({
      address: address as Address,
      abi: erc20Abi,
      functionName: "symbol",
    });
    symbolCache.set(key, symbol);
    return symbol;
  } catch {
    symbolCache.set(key, "");
    return "";
  }
}
