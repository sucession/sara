import { generateKeysFromSignature } from "@fluidkey/stealth-account-kit";
import {
  Box,
  Button,
  Collapse,
  Notification,
  PinInput,
  Text,
  Textarea,
} from "@mantine/core";
import { IconArrowLeft, IconKey } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { StepContent } from "@components/StepContent";

import { Address, FluidKeyMetaStealthKeyPair } from "@typing/index";
import { getMessageToSign } from "@utils/fluidkey";
import { useAccount, useSignMessage } from "wagmi";

interface ComponentProps {
  onKeys: (keys: FluidKeyMetaStealthKeyPair) => void;
  onBack: () => void;
}

export const GenerateKeysJourneyStep = (props: ComponentProps) => {
  const [openSettings, setOpenSettings] = useState(false);
  const [signature, setSignature] = useState<Address>();
  const [customMessage, setCustomMessage] = useState<string>();
  const [pin, setPin] = useState("0000");
  const [pinError, setPinError] = useState<string>();

  const { signMessage } = useSignMessage();
  const { address, isConnected } = useAccount();
  const PIN_LENGTH = 4;

  useEffect(() => {
    try {
      if (signature) {
        props.onKeys(generateKeysFromSignature(signature));
      }
    } catch (e) {
      // ignore generation errors
    }
  }, [signature]);

  const handleCustomSignature = () => {
    if (customMessage) {
      signMessage(
        {
          message: customMessage,
        },
        {
          onSuccess: (data) => {
            setSignature(data);
          },
        }
      );
    }
  };

  const handlePinSignature = () => {
    setPinError(undefined);
    if (!isConnected || !address) {
      setPinError("Connect your wallet before signing.");
      return;
    }
    if (!pin || pin.length !== PIN_LENGTH) {
      setPinError("PIN must be 4 digits.");
      return;
    }
    signMessage(
      {
        message: getMessageToSign({ address, secret: pin }),
      },
      {
        onSuccess: (data) => {
          setSignature(data);
          setPinError(undefined);
        },
        onError: (error) => {
          setPinError(error.message);
        },
      }
    );
  };

  return (
    <>
      <StepContent>
        Enter the 4-digit PIN below (default is 0000) and click the button to
        sign a message. This unique signature will be used to derive your stealth
        meta address.
        <Box
          style={{
            marginTop: "var(--u3)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--u2)",
            width: "100%",
          }}
        >
          <Box
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--u1)",
              width: "100%",
            }}
          >
            <Text size="sm" fw={600}>
              PIN
            </Text>
            <PinInput
              length={PIN_LENGTH}
              inputMode="decimal"
              type="number"
              size="lg"
              value={pin}
              onChange={(value) => {
                setPin(value);
                if (pinError) setPinError(undefined);
              }}
              style={{ margin: "0 auto" }}
            />
            {pinError && (
              <Notification
                withCloseButton={false}
                withBorder
                color="red"
                style={{
                  textAlign: "center",
                  width: "clamp(200px, 50%, 360px)",
                }}
              >
                {pinError}
              </Notification>
            )}
          </Box>
          <Button
            className="button"
            variant="filled"
            color="#191919"
            size="md"
            leftSection={<IconKey size={14} />}
            onClick={() =>
              customMessage ? handleCustomSignature() : handlePinSignature()
            }
            style={{ minWidth: 260 }}
          >
            Generate Stealth Keys
          </Button>
        </Box>
        <Box
          style={{
            marginTop: "var(--u2)",
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
            variant="subtle"
            onClick={() => setOpenSettings(!openSettings)}
          >
            Advanced settings
          </Button>
        </Box>
      </StepContent>
      {openSettings && <br />}
      <StepContent hidden={!openSettings}>
        <Collapse
          in={openSettings}
          transitionDuration={250}
          transitionTimingFunction="linear"
        >
          <Box
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "var(--u1)",
            }}
          >
            <b>Sign a custom message</b>
            <Textarea
              autosize={true}
              minRows={5}
              style={{ width: "50vw" }}
              onChange={(event) => setCustomMessage(event.target.value)}
            />
          </Box>
        </Collapse>
      </StepContent>
    </>
  );
};
