import type { CampusOverview, FloorView, FloorViewSeat, TimelineEvent } from "../shared/projections";

export interface CampusApi {
  getOverview(): Promise<CampusOverview>;
  getFloor(floorId: string, filters: Record<string, string>): Promise<FloorView>;
  getSeat(seatId: string): Promise<FloorViewSeat & { timeline: TimelineEvent[] }>;
  openEvents(onEvent: () => void): () => void;
}

export function createCampusApi(): CampusApi {
  return {
    getOverview: () => getJson("/api/campus/campus-main/overview"),
    getFloor: (floorId, filters) => {
      const search = new URLSearchParams(filters);
      return getJson(`/api/floors/${encodeURIComponent(floorId)}?${search.toString()}`);
    },
    getSeat: (seatId) => getJson(`/api/seats/${encodeURIComponent(seatId)}`),
    openEvents(onEvent) {
      const source = new EventSource("/api/events");
      source.addEventListener("campus.event", () => onEvent());
      return () => source.close();
    },
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
