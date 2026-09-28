import { seriesColor } from "../lib/palette";

export default function AppDot({ color, size = 10 }: { color: number; size?: number }) {
  return <span className="inline-block shrink-0 rounded-[3px]" style={{ width: size, height: size, background: seriesColor(color) }} aria-hidden />;
}
