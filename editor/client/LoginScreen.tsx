import { Button } from "@cloudflare/kumo/components/button";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import { Text } from "@cloudflare/kumo/components/text";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { login } from "./api";

export function LoginScreen({ message }: { message?: string }) {
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <LayerCard className="w-full max-w-sm">
        <LayerCard.Secondary>Blog Editor</LayerCard.Secondary>
        <LayerCard.Primary className="flex flex-col gap-4 p-6">
          <Text variant="secondary">
            {message ?? "GitHub アカウントでログインしてください。"}
          </Text>
          <Button variant="primary" icon={GithubLogoIcon} onClick={login}>
            GitHub でログイン
          </Button>
        </LayerCard.Primary>
      </LayerCard>
    </main>
  );
}
