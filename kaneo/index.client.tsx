import type { PluginClientContext, PluginScreenProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { KaneoSettings } from "./client/settings-screen";
import { TicketsBrowser } from "./client/tickets-screen";
import { ticketAttachments } from "./shared/contracts";

export default function contribute(client: PluginClientContext) {
  function TicketsScreen(props: PluginScreenProps) {
    return <TicketsBrowser {...props} openSettings={() => client.openSettings("connection")} />;
  }

  function TicketsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
    return (
      <SidebarRow
        icon="SquareKanban"
        active={currentScreen?.screenId === "tickets"}
        onPress={() => openScreen({ screenId: "tickets" })}
      />
    );
  }

  client.addScreen({ id: "tickets", title: "Kaneo", Component: TicketsScreen });
  client.addSidebarHeaderItem({ id: "tickets", title: "Kaneo", Component: TicketsItem });
  client.addSettingsScreen({ id: "connection", title: "Kaneo", icon: "SquareKanban", Component: KaneoSettings });
  client.addAttachmentSource(ticketAttachments);
  client.addCommandCenterItem({
    id: "open-tickets",
    title: "Open Kaneo tickets",
    icon: "SquareKanban",
    keywords: ["kaneo", "ticket", "issue", "task"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "tickets" });
    },
  });
  client.addCommandCenterItem({
    id: "open-agent-ticket",
    title: "Open this agent's Kaneo ticket",
    icon: "SquareKanban",
    keywords: ["kaneo", "ticket"],
    context: "agent",
    onSelect({ agent, openScreen }) {
      const ticket = agent.labels["kaneo-id"];
      if (!ticket) throw new Error("This agent was not started from a Kaneo ticket.");
      openScreen({ screenId: "tickets", params: { ticket } });
    },
  });
  client.addCommandCenterItem({
    id: "configure",
    title: "Configure Kaneo",
    icon: "Settings",
    keywords: ["kaneo", "api key"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("connection");
    },
  });
  return () => {};
}
