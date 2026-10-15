import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { connectionStatusRpc, getTicketRpc, listTicketsRpc } from "../shared/contracts";

export const connectionKey = ["kaneo", "connection"] as const;
const ticketsKey = ["kaneo", "tickets"] as const;
export const REFRESH_INTERVAL_MS = 120_000;

export function useConnection() {
  const status = useRpc(connectionStatusRpc);
  return useQuery({ queryKey: connectionKey, queryFn: () => status({}), staleTime: 60_000 });
}

export function useTickets(enabled: boolean, paused: boolean) {
  const list = useRpc(listTicketsRpc);
  return useQuery({
    queryKey: ticketsKey,
    queryFn: () => list({}),
    enabled,
    staleTime: 30_000,
    refetchInterval: paused ? false : REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useRefreshTickets() {
  const list = useRpc(listTicketsRpc);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => list({ force: true }),
    onSuccess: (data) => queryClient.setQueryData(ticketsKey, data),
  });
}

export function useTicket(id: string | null) {
  const get = useRpc(getTicketRpc);
  return useQuery({
    queryKey: ["kaneo", "ticket", id],
    queryFn: () => get({ id: id ?? "" }),
    enabled: id !== null,
    staleTime: 30_000,
  });
}
