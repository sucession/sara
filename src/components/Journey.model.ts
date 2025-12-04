import { predictStealthSafeAddressWithBytecode } from "@fluidkey/stealth-account-kit";
import { getBalance } from "@wagmi/core";
import { isEmpty } from "lodash";
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";

// Config
import { getConfig } from "@configs/rainbow.config";
import { detectRpcChainId } from "@utils/detectRpcChain";
import {
  SAFE_PROXY_BYTECODE,
  SupportedChainIds,
  SupportedSafeVersions,
  getPrivateKeyForSigner,
} from "@utils/fluidkey";
import Bottleneck from "bottleneck";

// Types
import {
  Address,
  CreateCSVEntryParams,
  FluidKeyStealthSafeAddressGenerationParams,
  SupportedChainId,
} from "@typing/index";

const DEFAULT_NATIVE_LABEL = "Native Balance";
const DEFAULT_TOKEN_LABEL = "Token Balance";

const limiter = new Bottleneck({
  minTime: 200, // minimum time (in ms) between requests
  maxConcurrent: 10, // maximum concurrent requests
});

export const scheduleRequest = <T>(call: () => Promise<T>) => {
  return limiter.schedule(() => {
    return call();
  });
};

const formatBalanceValue = (value: bigint, decimals: number) => {
  try {
    return formatUnits(value, decimals);
  } catch {
    return "-";
  }
};

const createEmptyBalances = (includeToken: boolean) => {
  return {
    native: { label: DEFAULT_NATIVE_LABEL, value: "-" },
    token: includeToken ? { label: DEFAULT_TOKEN_LABEL, value: "-" } : undefined,
  };
};

const buildFallbackChain = (chainId: SupportedChainId, rpcUrl: string) => ({
  id: chainId,
  name: `Chain ${chainId}`,
  network: `chain-${chainId}`,
  nativeCurrency: {
    name: "Native",
    symbol: "Native",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
});

const fetchTokenMetadata = async (
  client: ReturnType<typeof createPublicClient>,
  tokenAddress: Address
) => {
  const decimals = (await client
    .readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    })
    .catch(() => 18)) as number;

  const symbol = (await client
    .readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "symbol",
    })
    .catch(() => DEFAULT_TOKEN_LABEL)) as string;

  return { decimals, symbol };
};

const fetchTokenBalance = async ({
  address,
  chainId,
  rpcUrl,
  tokenAddress,
}: {
  address: Address;
  chainId: SupportedChainId;
  rpcUrl: string;
  tokenAddress: Address;
}) => {
  const client = createPublicClient({
    chain: buildFallbackChain(chainId, rpcUrl),
    transport: http(rpcUrl),
  });

  const [rawBalance, metadata] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }) as Promise<bigint>,
    fetchTokenMetadata(client, tokenAddress),
  ]);

  return {
    value: rawBalance,
    decimals: metadata.decimals,
    symbol: metadata.symbol,
  };
};

const getBalances = async ({
  address,
  chainId,
  rpcUrl,
  tokenAddress,
}: {
  address: Address;
  chainId: SupportedChainId;
  rpcUrl: string;
  tokenAddress?: Address;
}) => {
  const includeToken = Boolean(tokenAddress);
  const balances = createEmptyBalances(includeToken);
  if (includeToken && tokenAddress) {
    try {
      const tokenData = await fetchTokenBalance({
        address,
        chainId,
        rpcUrl,
        tokenAddress,
      });
      balances.token = {
        label: tokenData.symbol ?? DEFAULT_TOKEN_LABEL,
        value: formatBalanceValue(tokenData.value, tokenData.decimals ?? 18),
      };
      return {
        values: balances,
      };
    } catch (err) {
      return {
        values: balances,
      };
    }
  }

  try {
    const config = getConfig(rpcUrl, { chainId });
    const native = await getBalance(config, {
      address,
      chainId,
    });
    balances.native = {
      label: native.symbol ?? DEFAULT_NATIVE_LABEL,
      value: formatBalanceValue(native.value, native.decimals),
    };
    return {
      values: balances,
    };
  } catch (err) {
    return {
      values: balances,
    };
  }
};

export const createCSVEntry = async (
  params: CreateCSVEntryParams,
  callback: () => void
) => {
  try {
    const { stealthSafeAddress } = predictStealthSafeAddressWithBytecode({
      safeProxyBytecode: SAFE_PROXY_BYTECODE,
      chainId: params.settings.chainId,
      threshold: 1,
      stealthAddresses: params.stealthAddresses,
      useDefaultAddress: params.settings.useDefaultAddress,
      safeVersion: params.settings.safeVersion,
      initializerExtraFields:
        params.settings.initializerTo && params.settings.initializerData
          ? {
              to: params.settings.initializerTo,
              data: params.settings.initializerData,
            }
          : undefined,
    });

    const primaryStealthAddress =
      params.stealthAddresses[0] ?? ("-" as Address);

    const tokenAddress = params.settings
      .tokenBalanceAddress as Address | undefined;
    let resolvedBalances = createEmptyBalances(Boolean(tokenAddress));

    const trimmedTransport = params.settings.customTransport?.trim();

    let balanceChainId = params.balanceChainId;

    if (trimmedTransport && !balanceChainId) {
      balanceChainId = await detectRpcChainId(trimmedTransport);
    }

    if (trimmedTransport && balanceChainId) {
      try {
        const balances = await getBalances({
          address: stealthSafeAddress,
          chainId: balanceChainId,
          rpcUrl: trimmedTransport,
          tokenAddress,
        });
        resolvedBalances = balances.values;
      } catch (err) {
      }
    } else if (trimmedTransport && !balanceChainId) {
    }

    callback();

    return [
      params.nonce.toString(),
      stealthSafeAddress,
      primaryStealthAddress,
      params.settings.exportPrivateKeys
        ? getPrivateKeyForSigner({ ...params.meta })
        : "-",
      resolvedBalances.native.label,
      resolvedBalances.native.value,
      resolvedBalances.token?.label ?? "-",
      resolvedBalances.token?.value ?? "-",
    ];
  } catch (e) {
    return [
      params.nonce.toString(),
      "-",
      "-",
      "-",
      DEFAULT_NATIVE_LABEL,
      "-",
      DEFAULT_TOKEN_LABEL,
      "-",
    ];
  }
};

export const defaultExportHeaders = [
  "Nonce",
  "Safe Address",
  "Signer Address",
  "Signer Private Key",
  "Native Balance Label",
  "Native Balance",
  "Token Balance Label",
  "Token Balance",
];

export const validateSettings = (
  setting: keyof FluidKeyStealthSafeAddressGenerationParams,
  settings: FluidKeyStealthSafeAddressGenerationParams
): boolean => {
  switch (setting) {
    case "chainId":
      if (
        !isFinite(settings.chainId) ||
        !SupportedChainIds.includes(settings.chainId)
      ) {
        return false;
      }
      break;
    case "startNonce":
      if (
        !isFinite(settings.startNonce) ||
        (settings.startNonce as any) === "" ||
        settings.startNonce < 0 ||
        settings.startNonce > settings.endNonce
      ) {
        return false;
      }
      break;
    case "endNonce":
      if (
        !isFinite(settings.endNonce as number) ||
        (settings.endNonce as any) === "" ||
        settings.endNonce < 0 ||
        settings.endNonce < settings.startNonce
      ) {
        return false;
      }
      break;
    case "safeVersion":
      if (
        isEmpty(settings.safeVersion) ||
        !SupportedSafeVersions.includes(settings.safeVersion)
      ) {
        return false;
      }
      break;
    default:
      return true;
  }
  return true;
};
