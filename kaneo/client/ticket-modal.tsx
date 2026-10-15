import {
  getPaseoClient,
  openExternalUrl,
  type PluginScreenProps,
  useHosts,
  usePaseo,
  useRpc,
  useSettings,
} from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { SettingsCard, SettingsInput, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { type NativeSyntheticEvent, Text, type TextInputKeyPressEventData, View } from "react-native";
import { type TicketDetail, ticketContextRpc } from "../shared/contracts";
import { preferences } from "../shared/settings";
import { errorMessage, isOverdue, priorityLabel, readableMarkdown, shortDate } from "./format";
import { useTicket } from "./queries";
import { defaultInstruction, startWork } from "./start-work";
import { Button, type Styles, useStyles } from "./ui";

type Theme = PluginScreenProps["theme"];

interface ModalProps {
  ticketId: string;
  pluginHostId: string;
  theme: Theme;
  layout: PluginScreenProps["layout"];
  navigation: PluginScreenProps["navigation"];
  onClose(): void;
}

const NO_PROJECT = "";

function Section({ title, styles, children }: { title: string; styles: Styles; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function TicketFacts({ detail, styles, theme }: { detail: TicketDetail; styles: Styles; theme: Theme }) {
  const due = shortDate(detail.dueDate);
  const facts = [detail.projectName, detail.status, priorityLabel(detail.priority), detail.assigneeName ?? "Unassigned"].filter(Boolean);
  return (
    <View style={{ gap: 6 }}>
      <Text selectable style={styles.title}>
        {detail.title}
      </Text>
      <Text style={styles.muted}>
        {facts.join(" · ")}
        {due ? (
          <Text style={!detail.done && isOverdue(detail.dueDate) ? { color: theme.colors.statusDanger } : null}>{` · Due ${due}`}</Text>
        ) : null}
      </Text>
      {detail.labels.length > 0 ? (
        <View style={styles.wrap}>
          {detail.labels.map((label) => (
            <View
              key={label.name}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              {/^#[0-9a-f]{3,8}$/i.test(label.color) ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: label.color }} />
              ) : null}
              <Text style={styles.small}>{label.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StartForm({
  detail,
  pluginHostId,
  theme,
  styles,
  compact,
  navigation,
  onStarted,
}: {
  detail: TicketDetail;
  pluginHostId: string;
  theme: Theme;
  styles: Styles;
  compact: boolean;
  navigation: PluginScreenProps["navigation"];
  onStarted(): void;
}) {
  const pluginHost = usePaseo();
  const hosts = useHosts();
  const toast = useToast();
  const loadContext = useRpc(ticketContextRpc);
  const settings = useSettings(preferences);
  const saved = settings.status === "ready" ? settings.values : null;
  const remembered = saved?.targetByKaneoProject[detail.projectId] ?? null;

  const [chosenServerId, setServerId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>(NO_PROJECT);
  const [model, setModel] = useState<string | null>(null);
  const [branch, setBranch] = useState(detail.branchName);
  const [note, setNote] = useState("");
  const [attachImages, setAttachImages] = useState<boolean | null>(null);
  const includeImages = detail.imageCount > 0 && (attachImages ?? saved?.attachImages ?? true);

  const rememberedServerId = remembered ? (remembered.serverId ?? pluginHostId) : null;
  const serverId =
    chosenServerId ??
    (rememberedServerId && hosts.some((host) => host.serverId === rememberedServerId) ? rememberedServerId : pluginHostId);
  const targetHost = hosts.find((host) => host.serverId === serverId) ?? null;
  const online = serverId === pluginHostId || targetHost?.status === "online";
  const api = () => (serverId === pluginHostId ? pluginHost : getPaseoClient(serverId));

  const projectsQuery = useQuery({
    queryKey: ["paseo", serverId, "projects"],
    queryFn: () => api().projects.list(),
    enabled: online,
    staleTime: 30_000,
  });
  const projects = useMemo(
    () =>
      (projectsQuery.data?.projects ?? [])
        .filter((project) => project.projectKind === "git")
        .sort((a, b) => a.projectDisplayName.localeCompare(b.projectDisplayName)),
    [projectsQuery.data],
  );

  useEffect(() => {
    if (projectId !== NO_PROJECT || !remembered || projects.length === 0) return;
    if ((remembered.serverId ?? pluginHostId) !== serverId) return;
    if (projects.some((project) => project.projectId === remembered.projectId)) setProjectId(remembered.projectId);
  }, [projects, remembered, projectId, serverId, pluginHostId]);

  const selectedProject = projects.find((project) => project.projectId === projectId) ?? null;
  const providersQuery = useQuery({
    queryKey: ["paseo", serverId, "providers", selectedProject?.projectRootPath ?? ""],
    queryFn: () =>
      api().providers.waitForReady({
        ...(selectedProject ? { cwd: selectedProject.projectRootPath } : {}),
        timeoutMs: 30_000,
      }),
    enabled: online,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const models = useMemo(() => {
    const choices: { value: string; label: string; isDefault: boolean }[] = [];
    for (const entry of providersQuery.data?.entries ?? []) {
      if (entry.status !== "ready" || entry.enabled === false) continue;
      for (const option of entry.models ?? []) {
        if (option.isSelectable === false) continue;
        choices.push({
          value: `${entry.provider}/${option.id}`,
          label: `${entry.label ?? entry.provider} · ${option.label}`,
          isDefault: option.isDefault === true,
        });
      }
    }
    return choices;
  }, [providersQuery.data]);

  useEffect(() => {
    if (settings.status === "loading") return;
    if (models.length === 0 || (model && models.some((choice) => choice.value === model))) return;
    const preferred = saved?.defaultModel && models.find((choice) => choice.value === saved.defaultModel);
    setModel((preferred || models.find((choice) => choice.isDefault) || models[0])?.value ?? null);
  }, [models, model, saved?.defaultModel, settings.status]);

  const chooseHost = (next: string) => {
    if (next === serverId) return;
    setServerId(next);
    setProjectId(NO_PROJECT);
  };

  const start = useMutation({
    mutationFn: async () => {
      if (!online) throw new Error(`${targetHost?.label ?? "This host"} is not connected.`);
      if (!selectedProject) throw new Error("Choose the Paseo project to work in.");
      if (!model) throw new Error("Choose a model. Enable a provider in Paseo if the list is empty.");
      const branchName = branch.trim();
      if (!branchName) throw new Error("Enter a branch name.");
      const context = await loadContext({ id: detail.id, includeImages });
      const started = await startWork(api(), {
        context,
        ticketId: detail.id,
        note,
        model,
        project: selectedProject,
        branchName,
      });
      if (settings.status === "ready") {
        void settings.save(
          {
            ...settings.values,
            defaultModel: model,
            targetByKaneoProject: {
              ...settings.values.targetByKaneoProject,
              [detail.projectId]: {
                serverId: serverId === pluginHostId ? null : serverId,
                projectId: selectedProject.projectId,
              },
            },
          },
          settings.revision,
        );
      }
      return { ...started, skippedImages: context.skippedImages };
    },
    onSuccess: ({ agentId, skippedImages }) => {
      const skipped = skippedImages > 0 ? ` ${skippedImages} image${skippedImages === 1 ? "" : "s"} could not be attached.` : "";
      const where = hosts.length > 1 && targetHost ? ` on ${targetHost.label}` : "";
      toast.show(`Started ${detail.identifier} in ${selectedProject?.projectDisplayName}${where}.${skipped}`, {
        variant: skipped ? "warning" : "success",
      });
      onStarted();
      navigation?.openAgent({ agentId, serverId });
    },
  });

  const submit = () => {
    if (!start.isPending) start.mutate();
  };

  const onKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean };
    if (key.key === "Enter" && !key.shiftKey && !key.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const hostOptions = hosts.map((host) => ({
    value: host.serverId,
    label: host.status === "online" || host.serverId === pluginHostId ? host.label : `${host.label} (${host.status})`,
  }));
  const projectPlaceholder = !online
    ? "Host not connected"
    : projectsQuery.isPending
      ? "Loading projects…"
      : projectsQuery.error
        ? "Could not load projects"
        : projects.length === 0
          ? "No git projects on this host"
          : "Choose a project…";
  const projectOptions = [
    { value: NO_PROJECT, label: projectPlaceholder },
    ...projects.map((project) => ({ value: project.projectId, label: project.projectDisplayName })),
  ];
  const modelPlaceholder = !online
    ? "Host not connected"
    : providersQuery.isPending
      ? "Loading models…"
      : "No models available";
  const modelOptions = model ? models.map(({ value, label }) => ({ value, label })) : [{ value: "", label: modelPlaceholder }];
  const loadError = projectsQuery.error ?? providersQuery.error;

  return (
    <View style={{ gap: 10 }}>
      <SettingsCard>
        {hosts.length > 1 ? (
          <SettingsSelect
            label="Host"
            hint="The Paseo daemon that runs the worktree and the agent."
            value={serverId}
            options={hostOptions}
            onValueChange={chooseHost}
            disabled={start.isPending}
          />
        ) : null}
        <SettingsSelect
          label="Paseo project"
          hint={selectedProject ? `New worktree in ${selectedProject.projectRootPath}` : "The ticket is worked on in a new worktree of this project."}
          value={projectId}
          options={projectOptions}
          onValueChange={setProjectId}
          disabled={start.isPending || !online}
        />
        <SettingsSelect
          label="Model"
          value={model ?? ""}
          options={modelOptions}
          onValueChange={setModel}
          disabled={start.isPending || !model}
        />
        <SettingsInput label="Branch" initialValue={detail.branchName} onChangeText={setBranch} disabled={start.isPending} />
        {detail.imageCount > 0 ? (
          <SettingsSwitch
            label={`Attach ${detail.imageCount} image${detail.imageCount === 1 ? "" : "s"} from the ticket`}
            value={includeImages}
            onValueChange={setAttachImages}
            disabled={start.isPending}
          />
        ) : null}
      </SettingsCard>
      {loadError && online ? <Text style={styles.danger}>{errorMessage(loadError)}</Text> : null}
      <TextInput
        value={note}
        onChangeText={setNote}
        onKeyPress={onKeyPress}
        multiline
        autoFocus={!compact}
        editable={!start.isPending}
        placeholder={`${defaultInstruction(detail.identifier)} Add your own note here.`}
        placeholderTextColor={theme.colors.foregroundMuted}
        accessibilityLabel="Message to the agent"
        style={[styles.input, { flex: 0, minHeight: 84, maxHeight: 220, textAlignVertical: "top" }]}
      />
      <View style={[styles.row, { justifyContent: "space-between", flexWrap: "wrap" }]}>
        <Text style={[styles.small, { flexShrink: 1 }]}>
          {compact ? "The ticket is attached to the message." : "Enter starts, Shift+Enter adds a line. The ticket is attached to the message."}
        </Text>
        <Button theme={theme} variant="primary" icon="Play" label="Start agent" busy={start.isPending} onPress={submit} />
      </View>
      {start.error ? <Text style={styles.danger}>{errorMessage(start.error)}</Text> : null}
    </View>
  );
}

export function TicketModal({ ticketId, pluginHostId, theme, layout, navigation, onClose }: ModalProps) {
  const styles = useStyles(theme, layout.compact);
  const ticket = useTicket(ticketId);
  const detail = ticket.data;
  const title = detail ? `${detail.identifier} · ${detail.projectName}` : "Kaneo ticket";

  return (
    <Modal
      title={title}
      icon={<Icon name="SquareKanban" size={18} color={theme.colors.foreground} />}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 18 }}>
        {ticket.isPending ? <Text style={styles.muted}>Loading ticket…</Text> : null}
        {ticket.error ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.danger}>{errorMessage(ticket.error)}</Text>
            <Button theme={theme} icon="RefreshCw" label="Retry" onPress={() => void ticket.refetch()} />
          </View>
        ) : null}
        {detail ? (
          <>
            <TicketFacts detail={detail} styles={styles} theme={theme} />
            <StartForm
              detail={detail}
              pluginHostId={pluginHostId}
              theme={theme}
              styles={styles}
              compact={layout.compact}
              navigation={navigation}
              onStarted={onClose}
            />
            <Section title="Description" styles={styles}>
              <Text selectable style={styles.text}>
                {readableMarkdown(detail.description) || "No description."}
              </Text>
            </Section>
            {detail.related.length > 0 ? (
              <Section title="Related tickets" styles={styles}>
                {detail.related.map((item) => (
                  <Text key={`${item.relation}-${item.identifier}`} style={[styles.text, item.done ? { color: theme.colors.foregroundMuted } : null]}>
                    <Text style={styles.mono}>{item.identifier}</Text> {item.title}
                    <Text style={styles.small}>{` · ${item.relation}${item.done ? ", done" : ""}`}</Text>
                  </Text>
                ))}
              </Section>
            ) : null}
            {detail.links.length > 0 ? (
              <Section title="Links" styles={styles}>
                {detail.links.map((link) => (
                  <Text
                    key={link.url}
                    accessibilityRole="link"
                    onPress={() => void openExternalUrl(link.url)}
                    style={[styles.text, { color: theme.colors.accent }]}
                  >
                    {link.title}
                    <Text style={styles.small}>{` · ${link.kind}`}</Text>
                  </Text>
                ))}
              </Section>
            ) : null}
            {detail.comments.length > 0 ? (
              <Section title={`Comments (${detail.comments.length})`} styles={styles}>
                {detail.comments.map((comment, index) => (
                  <View key={`${comment.createdAt}-${index}`} style={styles.card}>
                    <Text style={styles.small}>
                      {comment.author} · {shortDate(comment.createdAt)}
                    </Text>
                    <Text selectable style={styles.text}>
                      {comment.text.trim()}
                    </Text>
                  </View>
                ))}
              </Section>
            ) : null}
            <View style={styles.row}>
              <Button theme={theme} icon="ExternalLink" label="Open in Kaneo" onPress={() => void openExternalUrl(detail.url)} />
            </View>
          </>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
