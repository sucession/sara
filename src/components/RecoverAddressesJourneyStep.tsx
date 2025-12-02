import {
  extractViewingPrivateKeyNode,
  generateEphemeralPrivateKey,
  generateStealthAddresses,
} from "@fluidkey/stealth-account-kit";
import {
  Box,
  Button,
  Code,
  Collapse,
  Grid,
  NumberInput,
  Progress,
  Select,
  Switch,
  TextInput,
} from "@mantine/core";
import { IconArrowLeft, IconList } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { privateKeyToAccount } from "viem/accounts";

import { StepContent } from "@components/StepContent";
import { CopyWithCheckButton } from "@components/common/CopyButton";

import {
  AUTO_EARN_PROFILES,
  AutoEarnProfileId,
} from "@configs/autoEarnProfiles";
import {
  FluidKeyMetaStealthKeyPair,
  FluidKeyStealthSafeAddressGenerationParams,
  RecoveredStealthSafeRow,
  StealthResults,
  SupportedChainId,
} from "@typing/index";
import { detectRpcChainId } from "@utils/detectRpcChain";
import { normalizeForRange, truncateEthAddress } from "@utils/index";

import {
  createCSVEntry,
  defaultExportHeaders,
  scheduleRequest,
  validateSettings,
} from "./Journey.model";

interface ComponentProps {
  activeChainId: number;
  keys: FluidKeyMetaStealthKeyPair | undefined;
  onStealthDataProcessed: (data: StealthResults) => void;
  onBack: () => void;
}

const CUSTOM_PROFILE_ID = "custom" as const;
type ProfileSelectValue = AutoEarnProfileId | typeof CUSTOM_PROFILE_ID;

export const RecoverAddressesJourneyStep = (props: ComponentProps) => {
  const [openSettings, setOpenSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSettingsValid, setSettingsValid] = useState(true);
  const [settings, setSettings] =
    useState<FluidKeyStealthSafeAddressGenerationParams>({
      chainId: 0,
      startNonce: 0,
      endNonce: 100,
      safeVersion: "1.3.0",
      useDefaultAddress: true,
      exportPrivateKeys: true,
      customTransport: undefined,
      tokenBalanceAddress: undefined,
      initializerTo: undefined,
      initializerData: undefined,
    });
  const [stealthResults, setStealthResults] = useState<StealthResults>({
    csv: [defaultExportHeaders],
    rows: [],
  });

  const handleSettingsChange = (
    setting: keyof FluidKeyStealthSafeAddressGenerationParams,
    value: string | number | boolean | undefined
  ) => {
    let normalizedValue = value;
    const shouldTrim =
      setting === "initializerTo" ||
      setting === "initializerData" ||
      setting === "customTransport" ||
      setting === "tokenBalanceAddress";

    if (shouldTrim && typeof value === "string") {
      const trimmedValue = value.trim();
      normalizedValue = trimmedValue.length > 0 ? trimmedValue : undefined;
    }

    setSettings((prev) => ({ ...prev, [setting]: normalizedValue }));
  };

  const matchedProfile = useMemo(() => {
    return AUTO_EARN_PROFILES.find(
      (profile) =>
        profile.initializerTo === settings.initializerTo &&
        profile.initializerData === settings.initializerData
    );
  }, [settings.initializerData, settings.initializerTo]);

  const selectedProfileId: ProfileSelectValue = useMemo(() => {
    if (matchedProfile) {
      return matchedProfile.id;
    }
    if (!settings.initializerTo && !settings.initializerData) {
      return "manual";
    }
    return CUSTOM_PROFILE_ID;
  }, [matchedProfile, settings.initializerData, settings.initializerTo]);

  const profileOptions = useMemo(
    () => [
      ...AUTO_EARN_PROFILES.map((profile) => ({
        value: profile.id,
        label: profile.label,
      })),
    ],
    []
  );

  const handleProfileSelect = (value: string | null) => {
    if (!value) {
      return;
    }

    if (value === CUSTOM_PROFILE_ID) {
      // Keep whatever custom values are present.
      return;
    }

    const selectedProfile = AUTO_EARN_PROFILES.find(
      (profile) => profile.id === value
    );

    if (!selectedProfile) {
      return;
    }

    setSettings((prev) => ({
      ...prev,
      initializerTo: selectedProfile.initializerTo,
      initializerData: selectedProfile.initializerData,
    }));
  };

  const recoverStealthAccounts = async () => {
    setStealthResults({ csv: [defaultExportHeaders], rows: [] });
    if (props.keys?.viewingPrivateKey && props.keys?.spendingPrivateKey) {
      setIsLoading(true);

      const customTransport = settings.customTransport?.trim();
      let balanceChainId: SupportedChainId | undefined;

      if (customTransport) {
        balanceChainId = await detectRpcChainId(customTransport);
      }

      const derivedBIP32Node = extractViewingPrivateKeyNode(
        props.keys.viewingPrivateKey,
        0
      );

      const spendingAccount = privateKeyToAccount(
        props.keys.spendingPrivateKey
      );
      const spendingPublicKey = spendingAccount.publicKey;

      const promises: Promise<string[]>[] = [];
      const pendingRows: Omit<
        RecoveredStealthSafeRow,
        "stealthSafeAddress" | "stealthSignerAddress" | "stealthSignerKey" | "balances"
      >[] = [];
      let counter = 0;
      for (let i = settings.startNonce; i < settings.endNonce; i++) {
        const { ephemeralPrivateKey } = generateEphemeralPrivateKey({
          viewingPrivateKeyNode: derivedBIP32Node,
          nonce: BigInt(i),
          chainId: settings.chainId,
        });

        const { stealthAddresses } = generateStealthAddresses({
          spendingPublicKeys: [spendingPublicKey],
          ephemeralPrivateKey: ephemeralPrivateKey,
        });

        const params = {
          nonce: i,
          stealthAddresses: stealthAddresses as `0x${string}`[],
          settings: settings,
          activeChainId: props.activeChainId as SupportedChainId,
          balanceChainId,
          meta: {
            ephemeralPrivateKey: ephemeralPrivateKey,
            spendingPrivateKey: props.keys.spendingPrivateKey,
            spendingPublicKey: spendingPublicKey,
          },
        };

        const resolvedChainId =
          settings.chainId > 0
            ? (settings.chainId as SupportedChainId)
            : (props.activeChainId as SupportedChainId);

        pendingRows.push({
          nonce: i,
          stealthAddresses: stealthAddresses as `0x${string}`[],
          chainId: settings.chainId,
          deploymentChainId: resolvedChainId,
          safeVersion: settings.safeVersion,
          useDefaultAddress: settings.useDefaultAddress,
          initializerTo: settings.initializerTo,
          initializerData: settings.initializerData,
          threshold: 1,
          balanceChainId,
        });

        const updateProgress = () => {
          setProgress(
            normalizeForRange(
              counter++,
              0,
              settings.endNonce - settings.startNonce,
              0,
              100
            )
          );
        };
        promises.push(
          customTransport
            ? scheduleRequest<string[]>(
                createCSVEntry.bind(null, params, updateProgress)
              )
            : createCSVEntry(params, updateProgress)
        );
      }

      const results = await Promise.all(promises);
      const csv = [defaultExportHeaders, ...results];
      const rows: RecoveredStealthSafeRow[] = results.map((result, index) => {
        const meta = pendingRows[index];
        const [
          ,
          safeAddress,
          signerAddress,
          signerKey,
          nativeLabel,
          nativeValue,
          tokenLabel,
          tokenValue,
        ] = result;

        const resolvedNativeBalance = {
          label: nativeLabel ?? "Native Balance",
          value: nativeValue ?? "-",
        };

        const hasTokenBalance =
          (tokenLabel && tokenLabel !== "-") ||
          (tokenValue && tokenValue !== "-");

        const resolvedTokenBalance = hasTokenBalance
          ? {
              label:
                tokenLabel && tokenLabel !== "-"
                  ? tokenLabel
                  : "Token Balance",
              value: tokenValue ?? "-",
            }
          : undefined;

        return {
          ...meta,
          stealthSafeAddress: safeAddress ?? "-",
          stealthSignerAddress: signerAddress ?? "-",
          stealthSignerKey: signerKey ?? "-",
          balances: {
            native: resolvedNativeBalance,
            token: resolvedTokenBalance,
          },
        };
      });

      setStealthResults({ csv, rows });
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isValid = true;
    Object.keys(settings).forEach((key) => {
      if (
        !validateSettings(
          key as keyof FluidKeyStealthSafeAddressGenerationParams,
          settings
        )
      ) {
        isValid = false;
      }
    });
    setSettingsValid(isValid);
  }, [settings]);

  useEffect(() => {
    if (stealthResults.csv.length > 1) {
      props.onStealthDataProcessed(stealthResults);
    }
  }, [stealthResults]);

  return (
    <>
      <StepContent>
        Click on the button below to initiate the recovery of stealth addresses.
        Feel free to customize additional settings as needed for a personalized
        experience.
        <Box
          style={{
            marginTop: "var(--u2)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--u2)",
            width: "100%",
          }}
        >
          <Select
            label="Auto-earn profile"
            placeholder="Select a profile"
            data={profileOptions}
            value={selectedProfileId}
            onChange={handleProfileSelect}
          />
        </Box>
        <Box
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--u2)",
            width: "100%",
          }}
        >
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={14} />}
            onClick={() => props.onBack()}
          >
            Back
          </Button>
          <Button
            className="button"
            variant="filled"
            color="#191919"
            size="md"
            leftSection={<IconList size={14} />}
            onClick={recoverStealthAccounts}
            disabled={!isSettingsValid}
            loading={isLoading}
          >
            Recover Stealth Accounts
          </Button>
          <Button
            variant="subtle"
            onClick={() => setOpenSettings(!openSettings)}
          >
            Advanced settings
          </Button>
        </Box>
      </StepContent>
      {isLoading && (
        <>
          <br />
          <Progress animated={true} striped={true} value={progress} />
        </>
      )}
      {openSettings && <br />}
      <StepContent hidden={!openSettings}>
        <Collapse
          in={openSettings}
          transitionDuration={250}
          transitionTimingFunction="linear"
        >
          <Grid>
            <Grid.Col span={6}>
              <Box
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--u1)",
                  paddingBottom: "var(--smallUnit)",
                  width: "100%",
                }}
              >
                <b>Spending Private Key</b>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Code block={true}>
                    {truncateEthAddress(props.keys?.spendingPrivateKey, 8)}
                  </Code>
                  <CopyWithCheckButton value={props.keys?.spendingPrivateKey} />
                </div>
              </Box>
            </Grid.Col>
            <Grid.Col span={6}>
              <Box
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--u1)",
                  width: "100%",
                }}
              >
                <b>Viewing Private Key</b>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Code block={true}>
                    {truncateEthAddress(props.keys?.viewingPrivateKey, 8)}
                  </Code>
                  <CopyWithCheckButton value={props.keys?.viewingPrivateKey} />
                </div>
              </Box>
            </Grid.Col>

            <Grid.Col span={12}>
              <Box
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--u2)",
                }}
              >
                <NumberInput
                  label="Chain ID"
                  placeholder={settings.chainId.toString()}
                  allowDecimal={false}
                  allowNegative={false}
                  allowLeadingZeros={false}
                  onChange={(v) => handleSettingsChange("chainId", v)}
                  error={
                    validateSettings("chainId", settings)
                      ? undefined
                      : "Invalid chain ID"
                  }
                />
                <TextInput
                  label="Check balances onchain"
                  placeholder="https://rpc.example.com"
                  value={settings.customTransport ?? ""}
                  onChange={(v) =>
                    handleSettingsChange("customTransport", v.target.value)
                  }
                />
                <TextInput
                  label="Token balance address"
                  placeholder="0x..."
                  value={settings.tokenBalanceAddress ?? ""}
                  onChange={(v) =>
                    handleSettingsChange("tokenBalanceAddress", v.target.value)
                  }
                />
                <TextInput
                  label="Safe Version"
                  placeholder={settings.safeVersion}
                  onChange={(v) =>
                    handleSettingsChange("safeVersion", v.target.value)
                  }
                  error={
                    validateSettings("safeVersion", settings)
                      ? undefined
                      : "Invalid version"
                  }
                />
                <NumberInput
                  label="First Nonce"
                  placeholder={settings.startNonce.toString()}
                  allowDecimal={false}
                  allowNegative={false}
                  allowLeadingZeros={false}
                  onChange={(v) => handleSettingsChange("startNonce", v)}
                  error={
                    validateSettings("startNonce", settings)
                      ? undefined
                      : "Invalid nonce"
                  }
                />
                <NumberInput
                  label="Last Nonce"
                  placeholder={settings.endNonce.toString()}
                  allowDecimal={false}
                  allowNegative={false}
                  allowLeadingZeros={false}
                  onChange={(v) => handleSettingsChange("endNonce", v)}
                  error={
                    validateSettings("endNonce", settings)
                      ? undefined
                      : "Invalid nonce"
                  }
                />
              </Box>
            </Grid.Col>
            <Grid.Col span={12}>
              <Box
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: "var(--u2)",
                }}
              >
                <Switch
                  label="Use Default Address"
                  checked={settings.useDefaultAddress}
                  description="When enabled, the Safe default address will be used."
                  onChange={(v) =>
                    handleSettingsChange("useDefaultAddress", v.target.checked)
                  }
                />
                <Switch
                  label="Export Private Keys"
                  checked={settings.exportPrivateKeys}
                  description="When enabled, the output will contain private keys for each stealth address. Use with caution!"
                  onChange={(v) =>
                    handleSettingsChange("exportPrivateKeys", v.target.checked)
                  }
                />
              </Box>
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput
                label="Initializer to address"
                placeholder="0x..."
                value={settings.initializerTo ?? ""}
                onChange={(v) =>
                  handleSettingsChange("initializerTo", v.target.value)
                }
              />
              <TextInput
                label="Initializer data"
                placeholder="0x..."
                value={settings.initializerData ?? ""}
                onChange={(v) =>
                  handleSettingsChange("initializerData", v.target.value)
                }
              />
            </Grid.Col>
          </Grid>
        </Collapse>
      </StepContent>
    </>
  );
};
