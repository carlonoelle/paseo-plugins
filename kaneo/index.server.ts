import type { PluginServerContext } from "@getpaseo/plugin/server";
import { KaneoService } from "./server/service";
import {
  clearConnectionRpc,
  connectionStatusRpc,
  getTicketRpc,
  listTicketsRpc,
  saveConnectionRpc,
  searchTicketsRpc,
  ticketContextRpc,
} from "./shared/contracts";
import { preferences } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  const kaneo = new KaneoService();
  server.handle(connectionStatusRpc, () => kaneo.status());
  server.handle(saveConnectionRpc, ({ baseUrl, apiKey }) => kaneo.save(baseUrl, apiKey));
  server.handle(clearConnectionRpc, () => kaneo.clear());
  server.handle(listTicketsRpc, ({ force }) => kaneo.listTickets(force));
  server.handle(getTicketRpc, ({ id, force }) => kaneo.getTicket(id, force));
  server.handle(ticketContextRpc, ({ id, includeImages }) => kaneo.context(id, includeImages));
  server.handle(searchTicketsRpc, ({ query }) => kaneo.search(query));
  return () => {};
}
