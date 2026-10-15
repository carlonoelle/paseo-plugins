import { type PluginSurfaceProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  type SettingsInputHandle,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Text } from "react-native";
import {
  type ConnectionStatus,
  clearConnectionRpc,
  connectionStatusRpc,
  saveConnectionRpc,
} from "../shared/contracts";
import { preferences } from "../shared/settings";
import { errorMessage } from "./format";
import { connectionKey } from "./queries";

export function KaneoSettings({ theme }: PluginSurfaceProps) {
  const queryClient = useQueryClient();
  const status = useRpc(connectionStatusRpc);
  const save = useRpc(saveConnectionRpc);
  const clear = useRpc(clearConnectionRpc);
  const settings = useSettings(preferences);
  const connection = useQuery({ queryKey: connectionKey, queryFn: () => status({}) });
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const apiKeyInput = useRef<SettingsInputHandle>(null);

  const onSaved = (next: ConnectionStatus) => {
    queryClient.setQueryData(connectionKey, next);
    void queryClient.invalidateQueries({ queryKey: ["kaneo"] });
    setApiKey("");
    apiKeyInput.current?.replaceText("");
  };
  const saveMutation = useMutation({
    mutationFn: () => save({ baseUrl: baseUrl ?? connection.data?.baseUrl ?? "", apiKey }),
    onSuccess: onSaved,
  });
  const clearMutation = useMutation({ mutationFn: () => clear({}), onSuccess: onSaved });

  const current = connection.data;
  const fromEnv = current?.source === "env";
  const busy = saveMutation.isPending || clearMutation.isPending;
  const statusText = connection.isPending
    ? "Checking…"
    : connection.error
      ? errorMessage(connection.error)
      : current?.user
        ? `Connected as ${current.user.name} (${current.user.email})`
        : (current?.error ?? "Not connected");

  return (
    <>
      <SettingsSection title="Connection">
        <SettingsCard>
          <SettingsRow label="Status">
            <Text
              style={{
                color: current?.user ? theme.colors.statusSuccess : theme.colors.foregroundMuted,
              }}
            >
              {statusText}
            </Text>
          </SettingsRow>
          {fromEnv ? (
            <SettingsRow
              label="Configured by the daemon environment"
              hint="KANEO_URL and KANEO_API_KEY are set for the daemon and take precedence."
            />
          ) : (
            <>
              <SettingsInput
                key={current?.baseUrl ?? "empty"}
                label="Kaneo URL"
                hint="The address you open Kaneo at, for example https://kaneo.example.com"
                placeholder="https://kaneo.example.com"
                initialValue={current?.baseUrl ?? ""}
                onChangeText={setBaseUrl}
                disabled={busy}
              />
              <SettingsInput
                ref={apiKeyInput}
                label="API key"
                hint={
                  current?.configured
                    ? "Stored on the daemon. Enter a new key to replace it."
                    : "Kaneo → Settings → Account → API keys. Read access is enough."
                }
                placeholder={current?.configured ? "••••••••" : "Paste your API key"}
                secureTextEntry
                onChangeText={setApiKey}
                disabled={busy}
              />
              <SettingsAction
                label="Save and test"
                error={saveMutation.error ? errorMessage(saveMutation.error) : null}
                actionLabel={saveMutation.isPending ? "Testing…" : "Save"}
                onPress={() => saveMutation.mutate()}
                disabled={busy || (!apiKey.trim() && !current?.configured)}
              />
              {current?.configured ? (
                <SettingsAction
                  label="Remove the stored URL and key"
                  actionLabel="Disconnect"
                  onPress={() => clearMutation.mutate()}
                  disabled={busy}
                />
              ) : null}
            </>
          )}
        </SettingsCard>
      </SettingsSection>
      {settings.status === "ready" ? (
        <SettingsSection title="Starting work">
          <SettingsCard>
            <SettingsSwitch
              label="Attach ticket images"
              hint="Images in the ticket description are downloaded by the daemon and sent to the agent."
              value={settings.values.attachImages}
              onValueChange={(attachImages) =>
                void settings.save({ ...settings.values, attachImages }, settings.revision)
              }
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}
    </>
  );
}
