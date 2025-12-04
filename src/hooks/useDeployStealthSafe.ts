import { useCallback, useState } from "react";
import {
  getFallbackHandlerDeployment,
  getProxyFactoryDeployment,
  getSafeSingletonDeployment,
} from "@safe-global/safe-deployments";
import { encodeFunctionData } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { RecoveredStealthSafeRow, SupportedChainId } from "@typing/index";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const CREATE_PROXY_FUNCTION = "createProxyWithNonce" as const;

const getDeploymentAddresses = (
  row: RecoveredStealthSafeRow,
  chainIdForContracts: number
) => {
  const configuration = {
    network: chainIdForContracts.toString(),
    version: row.safeVersion,
    released: true,
  };

  const proxyFactory = getProxyFactoryDeployment(configuration);
  const safeSingleton = getSafeSingletonDeployment(configuration);
  const fallbackHandler = getFallbackHandlerDeployment(configuration);

  if (!proxyFactory || !safeSingleton || !fallbackHandler) {
    throw new Error("Safe deployments not available for this chain/version.");
  }

  const deploymentChainKey = row.deploymentChainId.toString();

  const proxyFactoryAddress = row.useDefaultAddress
    ? proxyFactory.defaultAddress
    : proxyFactory.networkAddresses?.[deploymentChainKey];
  const safeSingletonAddress = row.useDefaultAddress
    ? safeSingleton.defaultAddress
    : safeSingleton.networkAddresses?.[deploymentChainKey];
  const fallbackHandlerAddress = row.useDefaultAddress
    ? fallbackHandler.defaultAddress
    : fallbackHandler.networkAddresses?.[deploymentChainKey];

  if (!proxyFactoryAddress || !safeSingletonAddress || !fallbackHandlerAddress) {
    throw new Error("Missing Safe contract addresses for selected network.");
  }

  return {
    proxyFactory,
    safeSingleton,
    fallbackHandlerAddress,
    proxyFactoryAddress,
    safeSingletonAddress,
  };
};

export const useDeployStealthSafe = () => {
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const publicClient = usePublicClient({ chainId: connectedChainId });
  const { data: walletClient, refetch: refetchWalletClient } = useWalletClient({
    chainId: connectedChainId,
  });
  const [pendingNonce, setPendingNonce] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deploy = useCallback(
    async (row: RecoveredStealthSafeRow) => {
      setPendingNonce(row.nonce);
      setError(null);

      try {
        const refreshedWalletClient = await refetchWalletClient();
        const activeWalletClient = refreshedWalletClient.data ?? walletClient;

        if (
          !activeWalletClient ||
          !activeWalletClient.account ||
          !activeWalletClient.chain
        ) {
          throw new Error("Wallet not connected.");
        }

        if (!publicClient) {
          throw new Error("Public client unavailable.");
        }

        if (!isConnected) {
          throw new Error("Connect your wallet to deploy the Safe.");
        }

        const activeChainId =
          (activeWalletClient.chain?.id as SupportedChainId | undefined) ??
          row.deploymentChainId;

        const chainIdForContracts = row.useDefaultAddress
          ? 1
          : activeChainId;

        const deploymentRow: RecoveredStealthSafeRow = {
          ...row,
          deploymentChainId: activeChainId,
        };

        const {
          proxyFactory,
          safeSingleton,
          fallbackHandlerAddress,
          proxyFactoryAddress,
          safeSingletonAddress,
        } = getDeploymentAddresses(deploymentRow, chainIdForContracts);

        const initializer = encodeFunctionData({
          abi: safeSingleton.abi,
          functionName: "setup",
          args: [
            row.stealthAddresses,
            row.threshold,
            row.initializerTo ?? ZERO_ADDRESS,
            row.initializerData ?? "0x",
            fallbackHandlerAddress,
            ZERO_ADDRESS,
            0,
            ZERO_ADDRESS,
          ],
        });

        const { request } = await publicClient.simulateContract({
          account: activeWalletClient.account.address,
          address: proxyFactoryAddress as `0x${string}`,
          abi: proxyFactory.abi,
          functionName: CREATE_PROXY_FUNCTION,
          args: [safeSingletonAddress as `0x${string}`, initializer, 0n],
        });

        await activeWalletClient.writeContract(request);
      } catch (deployError) {
        const message =
          deployError instanceof Error
            ? deployError.message
            : "Failed to deploy Safe.";
        setError(message);
        throw deployError;
      } finally {
        setPendingNonce(null);
      }
    },
    [
      connectedChainId,
      isConnected,
      publicClient,
      walletClient,
      refetchWalletClient,
    ]
  );

  return {
    deploy,
    error,
    isDeploying: pendingNonce !== null,
    pendingNonce,
  };
};

