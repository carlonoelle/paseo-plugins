import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { FlatList, TextInput } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import type { KaneoProject, TicketSummary } from "../shared/contracts";
import { errorMessage, isOverdue, PRIORITY_RANK, priorityLabel, shortDate } from "./format";
import { useConnection, useRefreshTickets, useTickets } from "./queries";
import { TicketModal } from "./ticket-modal";
import { Button, Chip, IconButton, Notice, type Styles, useStyles } from "./ui";

type Scope = "mine-open" | "mine" | "all";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "mine-open", label: "Mine + unassigned" },
  { value: "mine", label: "Mine" },
  { value: "all", label: "Everyone" },
];

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}

function compareTickets(userId: string) {
  return (a: TicketSummary, b: TicketSummary) => {
    const mine = Number(b.assigneeId === userId) - Number(a.assigneeId === userId);
    if (mine !== 0) return mine;
    const priority = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (priority !== 0) return priority;
    const dueA = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
    const dueB = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  };
}

function TicketRow({
  ticket,
  project,
  mine,
  styles,
  theme,
  onPress,
}: {
  ticket: TicketSummary;
  project: KaneoProject | undefined;
  mine: boolean;
  styles: Styles;
  theme: PluginScreenProps["theme"];
  onPress(): void;
}) {
  const due = shortDate(ticket.dueDate);
  const priority = priorityLabel(ticket.priority);
  const overdue = !ticket.done && isOverdue(ticket.dueDate);
  const meta = [project?.name, ticket.status, priority, mine ? "You" : (ticket.assigneeName ?? "Unassigned")].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ticket.identifier} ${ticket.title}`}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 3,
        backgroundColor: pressed ? theme.colors.surface1 : theme.colors.surface0,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      })}
    >
      <View style={styles.row}>
        <Text style={styles.mono}>{ticket.identifier}</Text>
        <Text
          numberOfLines={1}
          style={[styles.text, { flex: 1 }, ticket.done ? { color: theme.colors.foregroundMuted, textDecorationLine: "line-through" } : null]}
        >
          {ticket.title}
        </Text>
      </View>
      <Text numberOfLines={1} style={styles.small}>
        {meta.join(" · ")}
        {due ? <Text style={overdue ? { color: theme.colors.statusDanger } : null}>{` · Due ${due}`}</Text> : null}
      </Text>
    </Pressable>
  );
}

export function TicketsBrowser({
  host,
  theme,
  layout,
  params,
  navigation,
  openSettings,
}: Pick<PluginScreenProps, "host" | "theme" | "layout" | "params" | "navigation"> & { openSettings?: () => void }) {
  const styles = useStyles(theme, layout.compact);
  const appActive = useAppActive();
  const [openTicket, setOpenTicket] = useState<string | null>(params.ticket ?? null);
  const [scope, setScope] = useState<Scope>("mine-open");
  const [showDone, setShowDone] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (params.ticket) setOpenTicket(params.ticket);
  }, [params.ticket]);

  const connection = useConnection();
  const connected = Boolean(connection.data?.user);
  const tickets = useTickets(connected, !appActive || openTicket !== null);
  const refresh = useRefreshTickets();
  const data = tickets.data;

  const projectsById = useMemo(() => new Map((data?.projects ?? []).map((project) => [project.id, project])), [data]);

  const visible = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.tickets
      .filter((ticket) => showDone || !ticket.done)
      .filter((ticket) => !projectId || ticket.projectId === projectId)
      .filter((ticket) => {
        if (scope === "all") return true;
        if (ticket.assigneeId === data.userId) return true;
        return scope === "mine-open" && ticket.assigneeId === null;
      })
      .filter((ticket) => {
        if (!needle) return true;
        const project = projectsById.get(ticket.projectId);
        return [ticket.identifier, ticket.title, ticket.assigneeName ?? "", ticket.status, project?.name ?? ""].some((field) =>
          field.toLowerCase().includes(needle),
        );
      })
      .sort(compareTickets(data.userId));
  }, [data, query, showDone, projectId, scope, projectsById]);

  const projectsWithTickets = useMemo(() => {
    if (!data) return [];
    const used = new Set(data.tickets.filter((ticket) => showDone || !ticket.done).map((ticket) => ticket.projectId));
    return data.projects.filter((project) => used.has(project.id));
  }, [data, showDone]);
  const showWorkspace = new Set(projectsWithTickets.map((project) => project.workspaceId)).size > 1;

  if (connection.isPending) {
    return (
      <View style={[styles.screen, { padding: 24 }]}>
        <Text style={styles.muted}>Connecting to Kaneo…</Text>
      </View>
    );
  }

  if (!connected) {
    const reason = connection.error ? errorMessage(connection.error) : connection.data?.error;
    return (
      <View style={[styles.screen, { padding: layout.compact ? 16 : 24, gap: 12 }]}>
        <Text style={styles.title}>Connect Kaneo</Text>
        <Text style={styles.muted}>
          Add your Kaneo URL and an API key under Settings → Plugins → kaneo → Kaneo. The key stays on the daemon.
        </Text>
        {reason ? <Text style={styles.danger}>{reason}</Text> : null}
        <View style={styles.row}>
          {openSettings ? <Button theme={theme} variant="primary" icon="Settings" label="Open settings" onPress={openSettings} /> : null}
          <Button theme={theme} icon="RefreshCw" label="Retry" busy={connection.isFetching} onPress={() => void connection.refetch()} />
        </View>
      </View>
    );
  }

  const listError = tickets.error ?? refresh.error;

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <View style={styles.row}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter by ID, title, status, assignee"
            placeholderTextColor={theme.colors.foregroundMuted}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Filter tickets"
          />
          <IconButton
            theme={theme}
            icon="RefreshCw"
            label="Refresh tickets"
            busy={refresh.isPending || (tickets.isFetching && !tickets.isPending)}
            onPress={() => refresh.mutate()}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.wrap}>
          {SCOPES.map((option) => (
            <Chip key={option.value} theme={theme} label={option.label} selected={scope === option.value} onPress={() => setScope(option.value)} />
          ))}
          <Chip theme={theme} label="Show done" selected={showDone} onPress={() => setShowDone((value) => !value)} />
        </ScrollView>
        {projectsWithTickets.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.wrap}>
            <Chip theme={theme} label="All projects" selected={projectId === null} onPress={() => setProjectId(null)} />
            {projectsWithTickets.map((project) => (
              <Chip
                key={project.id}
                theme={theme}
                label={showWorkspace ? `${project.workspaceName} / ${project.name}` : project.name}
                selected={projectId === project.id}
                onPress={() => setProjectId(projectId === project.id ? null : project.id)}
              />
            ))}
          </ScrollView>
        ) : null}
        {data?.warning ? <Notice theme={theme}>{data.warning}</Notice> : null}
        {listError ? <Text style={styles.danger}>{errorMessage(listError)}</Text> : null}
      </View>
      {tickets.isPending ? (
        <View style={{ padding: 24 }}>
          <Text style={styles.muted}>Loading tickets…</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visible}
          keyExtractor={(ticket) => ticket.id}
          renderItem={({ item }) => (
            <TicketRow
              ticket={item}
              project={projectsById.get(item.projectId)}
              mine={item.assigneeId === data?.userId}
              styles={styles}
              theme={theme}
              onPress={() => setOpenTicket(item.id)}
            />
          )}
          ListEmptyComponent={
            <View style={{ padding: 24 }}>
              <Text style={styles.muted}>
                {data && data.tickets.length > 0 ? "No tickets match these filters." : "No tickets in your Kaneo workspaces."}
              </Text>
            </View>
          }
        />
      )}
      {openTicket ? (
        <TicketModal
          ticketId={openTicket}
          pluginHostId={host.id}
          theme={theme}
          layout={layout}
          navigation={navigation}
          onClose={() => setOpenTicket(null)}
        />
      ) : null}
    </View>
  );
}
