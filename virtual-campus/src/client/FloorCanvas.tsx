import { useEffect, useRef, useState } from "react";
import type { FloorView, FloorViewSeat } from "../shared/projections";

interface FloorCanvasProps {
  floor: FloorView;
  selectedSeatId: string | null;
  onSelectSeat: (seat: FloorViewSeat) => void;
}

const statusColors = {
  empty: "#e5e7eb",
  occupied: "#d1fae5",
  reserved: "#fef3c7",
  offline: "#d1d5db",
  running: "#10b981",
  idle: "#6b7280",
  paused: "#f59e0b",
  error: "#ef4444",
  blocked: "#dc2626",
  in_progress: "#2563eb",
  in_review: "#7c3aed",
  todo: "#9ca3af",
  done: "#16a34a",
};

export function FloorCanvas({ floor, selectedSeatId, onSelectSeat }: FloorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scale, setScale] = useState(0.72);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFloor(ctx, canvas, floor, selectedSeatId, scale);
  }, [floor, selectedSeatId, scale]);

  return (
    <div className="floor-shell">
      <div className="floor-toolbar">
        <span>{floor.seats.length} seats</span>
        <input
          aria-label="Zoom"
          type="range"
          min="0.45"
          max="1.25"
          step="0.05"
          value={scale}
          onChange={(event) => setScale(Number(event.target.value))}
        />
      </div>
      <canvas
        ref={canvasRef}
        width={Math.round(floor.width * scale)}
        height={Math.round(floor.height * scale)}
        onClick={(event) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const x = (event.clientX - rect.left) / scale;
          const y = (event.clientY - rect.top) / scale;
          const seat = [...floor.seats].reverse().find((candidate) => {
            return x >= candidate.x && x <= candidate.x + candidate.width && y >= candidate.y && y <= candidate.y + candidate.height;
          });
          if (seat) onSelectSeat(seat);
        }}
      />
    </div>
  );
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  floor: FloorView,
  selectedSeatId: string | null,
  scale: number,
) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, floor.width, floor.height);

  drawZones(ctx, floor);
  for (const seat of floor.seats) {
    drawSeat(ctx, seat, seat.id === selectedSeatId);
  }
  ctx.restore();
}

function drawZones(ctx: CanvasRenderingContext2D, floor: FloorView) {
  const zoneWidth = floor.width / Math.max(floor.zones.length, 1);
  floor.zones.forEach((zone, index) => {
    ctx.fillStyle = index % 2 === 0 ? "#eef2ff" : "#ecfeff";
    ctx.fillRect(index * zoneWidth, 0, zoneWidth, floor.height);
    ctx.fillStyle = "#475569";
    ctx.font = "14px system-ui";
    ctx.fillText(zone, index * zoneWidth + 18, 24);
  });
}

function drawSeat(ctx: CanvasRenderingContext2D, seat: FloorViewSeat, selected: boolean) {
  ctx.fillStyle = seat.occupancyStatus === "occupied" ? statusColors.occupied : statusColors[seat.occupancyStatus];
  ctx.strokeStyle = selected ? "#111827" : "#94a3b8";
  ctx.lineWidth = selected ? 2.5 : 1;
  roundRect(ctx, seat.x, seat.y, seat.width, seat.height, 3);
  ctx.fill();
  ctx.stroke();

  if (seat.agentStatus) {
    ctx.fillStyle = statusColors[seat.agentStatus];
    ctx.beginPath();
    ctx.arc(seat.x + seat.width - 2, seat.y + 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (seat.issueStatus && seat.issueStatus !== "done") {
    ctx.fillStyle = statusColors[seat.issueStatus];
    ctx.fillRect(seat.x, seat.y + seat.height - 4, seat.width, 4);
  }
  if (seat.alertKinds.length > 0) {
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(seat.x + 2, seat.y + 2);
    ctx.lineTo(seat.x + 10, seat.y + 2);
    ctx.lineTo(seat.x + 2, seat.y + 10);
    ctx.closePath();
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
