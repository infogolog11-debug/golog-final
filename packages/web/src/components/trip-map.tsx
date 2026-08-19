import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const CITY_COORDS: Record<string, [number, number]> = {
  "حلب":         [36.2021, 37.1343],
  "إدلب":        [35.9306, 36.6340],
  "دمشق":        [33.5138, 36.2765],
  "غازي عنتاب":  [37.0662, 37.3833],
  "هاتاي":       [36.4018, 36.3498],
  "كلس":         [36.7184, 37.1212],
  "عفرين":       [36.5130, 36.8687],
  "أعزاز":       [36.5892, 37.0488],
  "إعزاز":       [36.5892, 37.0488],
  "الباب":       [36.3738, 37.5166],
  "جرابلس":      [36.8201, 38.0107],
  "مارع":        [36.6294, 37.1738],
  "سرمدا":       [36.1547, 36.7239],
  "الأتارب":     [36.1352, 36.8294],
};

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function distance(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

type Props = {
  origin: string;
  destination: string;
  className?: string;
};

export default function TripMap({ origin, destination, className = "" }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  const originCoords = CITY_COORDS[origin];
  const destCoords = CITY_COORDS[destination];
  const hasCoords = !!(originCoords && destCoords);

  useEffect(() => {
    if (!mapRef.current || !hasCoords) return;
    if (instanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || instanceRef.current) return;

      const center = midpoint(originCoords, destCoords);
      const dist = distance(originCoords, destCoords);
      const zoom = dist < 20 ? 11 : dist < 60 ? 10 : dist < 120 ? 9 : 8;

      const map = L.map(mapRef.current, {
        center,
        zoom,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      instanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const greenIcon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const redIcon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker(originCoords, { icon: greenIcon })
        .addTo(map)
        .bindTooltip(origin, { permanent: false, direction: "top", className: "leaflet-city-label" });

      L.marker(destCoords, { icon: redIcon })
        .addTo(map)
        .bindTooltip(destination, { permanent: false, direction: "top", className: "leaflet-city-label" });

      L.polyline([originCoords, destCoords], {
        color: "#6366f1",
        weight: 3,
        opacity: 0.75,
        dashArray: "8, 6",
      }).addTo(map);

      map.fitBounds([originCoords, destCoords], { padding: [30, 30] });
    });

    return () => {
      instanceRef.current?.remove();
      instanceRef.current = null;
    };
  }, [origin, destination, hasCoords]);

  if (!hasCoords) return null;

  return (
    <div style={{ isolation: "isolate" }}>
      <div
        className={`rounded-xl overflow-hidden border bg-muted/30 ${className}`}
        style={{ height: 180 }}
      >
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
