import { createPublicClient, http } from "viem";
import * as chains from "viem/chains";

import { SupportedChainId } from "@typing/index";
import { SupportedChainIds } from "@utils/fluidkey";

const BALANCE_SUPPORTED_CHAIN_IDS: SupportedChainId[] = SupportedChainIds.filter(
  (chainId): chainId is SupportedChainId => chainId !== 0
);

const FALLBACK_CHAIN = chains.mainnet;

export const detectRpcChainId = async (
  rpcUrl?: string
): Promise<SupportedChainId | undefined> => {
  const trimmed = rpcUrl?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const client = createPublicClient({
      chain: FALLBACK_CHAIN,
      transport: http(trimmed),
    });
    const remoteChainId = await client.getChainId();
    if (
      BALANCE_SUPPORTED_CHAIN_IDS.includes(
        Number(remoteChainId) as SupportedChainId
      )
    ) {
      return Number(remoteChainId) as SupportedChainId;
    }
  } catch {
    // ignore detection errors
  }

  return undefined;
};

