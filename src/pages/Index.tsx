import { Alert, Button, Group } from "@mantine/core";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { IconAlertTriangle, IconBrandGithub, IconPlayerPlay } from "@tabler/icons-react";
import { useState } from "react";

import { Journey } from "@components/Journey";
import { StealthAddressStickyTable } from "@components/StealthAddressStickyTable";
import { Card } from "@components/common/Card";
import { Footer } from "@components/common/Footer";
import { Header } from "@components/common/Header";
import { Section } from "@components/common/Section";

import { RecoveredStealthSafeRow } from "@typing/index";

export const Index = () => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [stealthRows, setStealthRows] = useState<RecoveredStealthSafeRow[]>([]);
  const deployedGitCommit = __APP_COMMIT__ || 'main';

  const GITHUB_URL = `https://github.com/shahnami/sara`;
  const TUTORIAL_URL = `https://www.youtube.com/watch?v=HWy6-jXqemg`;
  const handleGithubRedirect = () => {
    open(GITHUB_URL, "_blank");
  };
  const handleTutorialRedirect = () => {
    open(TUTORIAL_URL, "_blank");
  };

  return (
    <>
      <Header>
        <h3>Stealth Account Recovery Assistant</h3>
        <ConnectButton showBalance={false} />
      </Header>
      <Section>
        <Card>
          <Journey
            onStepChanged={(step: number) => setActiveStep(step)}
            onStealthDataProcessed={(data) => setStealthRows(data.rows)}
          />
        </Card>
        <Card hidden={activeStep < 3}>
          <StealthAddressStickyTable items={stealthRows} />
        </Card>
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="yellow"
          variant="light"
          style={{ marginTop: "var(--u3)" }}
        >
          Moving funds out of a stealth address without using the Fluidkey UI may
          lead to loss of functionality within the Fluidkey UI. Only use this
          interface to verify addresses or as a last resort to recover funds.
        </Alert>
      </Section>
      <Footer>
        <p>
          Learn more about{" "}
          <a href="https://fluidkey.com" target="_blank">
            Fluidkey
          </a>
        </p>
        <p>
          <i>Latest deployed commit</i>:{" "}
          <a href={`${GITHUB_URL}/commit/${deployedGitCommit}`} target="_blank">
            {deployedGitCommit?.substring(0, 7)}
          </a>
        </p>
        <Group gap="sm">
          <Button
            color="#191919"
            onClick={handleTutorialRedirect}
            leftSection={<IconPlayerPlay />}
          >
            Watch Tutorial
          </Button>
          <Button
            color="#191919"
            onClick={handleGithubRedirect}
            leftSection={<IconBrandGithub />}
          >
            GitHub
          </Button>
        </Group>
      </Footer>
    </>
  );
};
