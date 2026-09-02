import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  HandCoins,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Route,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, $$ } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

export type RouteStop = {
  prestamoId: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteDireccion: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  ruta: string;
  saldoTotal: number;
  saldoMora: number;
  diasAtrasoMax: number;
};

type Position = { lat: number; lng: number };
type SortMode = "urgencia" | "cercania";

function haversineKm(a: Position, b: Position) {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function markerIcon(index: number, overdue: boolean) {
  return L.divIcon({
    className: "prestapp-route-marker",
    html: `<div style="width:34px;height:34px;border-radius:12px;background:${overdue ? "#ef4444" : "#f0144d"};color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px Inter,system-ui;border:3px solid #fff;box-shadow:0 8px 22px rgba(15,23,42,.28)">${index + 1}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

const currentIcon = L.divIcon({
  className: "prestapp-current-marker",
  html: '<div style="width:20px;height:20px;border-radius:999px;background:#2563eb;border:4px solid white;box-shadow:0 0 0 6px rgba(37,99,235,.18),0 6px 16px rgba(15,23,42,.25)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function FitRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length) map.fitBounds(L.latLngBounds(positions), { padding: [34, 34], maxZoom: 15 });
  }, [map, positions]);
  return null;
}

function navigationUrl(stop: RouteStop) {
  if (stop.gpsLat && stop.gpsLng) return `https://www.google.com/maps/dir/?api=1&destination=${stop.gpsLat},${stop.gpsLng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.clienteDireccion || stop.clienteNombre)}`;
}

export function MiRutaMap({
  stops,
  collectedCount,
  collectedAmount,
  onCollect,
  onVisit,
}: {
  stops: RouteStop[];
  collectedCount: number;
  collectedAmount: number;
  onCollect: (stop: RouteStop) => void;
  onVisit: (stop: RouteStop) => void;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("urgencia");

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  useEffect(() => { locate(); }, []);

  const orderedStops = useMemo(() => {
    return [...stops].sort((a, b) => {
      if (sortMode === "cercania" && position) {
        const aDistance = a.gpsLat && a.gpsLng ? haversineKm(position, { lat: a.gpsLat, lng: a.gpsLng }) : Number.POSITIVE_INFINITY;
        const bDistance = b.gpsLat && b.gpsLng ? haversineKm(position, { lat: b.gpsLat, lng: b.gpsLng }) : Number.POSITIVE_INFINITY;
        return aDistance - bDistance;
      }
      if (b.diasAtrasoMax !== a.diasAtrasoMax) return b.diasAtrasoMax - a.diasAtrasoMax;
      return b.saldoTotal - a.saldoTotal;
    });
  }, [position, sortMode, stops]);

  const locatedStops = orderedStops.filter((stop) => stop.gpsLat && stop.gpsLng);
  const positions = locatedStops.map((stop) => [Number(stop.gpsLat), Number(stop.gpsLng)] as [number, number]);
  if (position) positions.unshift([position.lat, position.lng]);
  const nextStop = orderedStops[0];
  const pendingAmount = stops.reduce((sum, stop) => sum + stop.saldoTotal, 0);
  const totalStops = collectedCount + stops.length;
  const progress = totalStops > 0 ? Math.round((collectedCount / totalStops) * 100) : 0;

  if (!stops.length) {
    return (
      <Card className="overflow-hidden border-success/20 bg-success/[0.04]">
        <CardContent className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h3 className="mt-4 text-lg font-bold">Ruta completada</h3>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">No quedan cobros pendientes en el periodo seleccionado.</p>
          <p className="mt-4 text-2xl font-bold text-success">{$$(collectedAmount)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">recaudado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl bg-[#111217] p-4 text-white shadow-[0_24px_55px_-34px_rgba(15,23,42,.75)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#ff5b82]">Ruta activa</p>
            <h2 className="mt-1 text-lg font-bold">{stops.length} paradas pendientes</h2>
            <p className="mt-0.5 text-[11px] text-white/50">{$$(pendingAmount)} por recuperar</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{progress}%</p>
            <p className="text-[9px] uppercase tracking-wider text-white/45">completado</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[#f0144d] to-[#ff5b82] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {nextStop && (
        <Card className={cn("overflow-hidden border-primary/20", nextStop.diasAtrasoMax > 0 && "border-destructive/30")}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Siguiente parada</p>
                <h3 className="mt-1 truncate text-base font-bold">{nextStop.clienteNombre}</h3>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{nextStop.clienteDireccion || nextStop.ruta}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold">{$$(nextStop.saldoTotal)}</p>
                {nextStop.diasAtrasoMax > 0 && <Badge variant="destructive" className="mt-1 h-5 text-[9px]">{nextStop.diasAtrasoMax} días tarde</Badge>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
              <Button className="h-11" onClick={() => onCollect(nextStop)}><HandCoins className="mr-2 h-4 w-4" />Cobrar</Button>
              <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => window.open(navigationUrl(nextStop), "_blank")}><Navigation className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => onVisit(nextStop)}><MapPin className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-xl border border-border/70 bg-card p-1">
          <button onClick={() => setSortMode("urgencia")} className={cn("rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors", sortMode === "urgencia" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Urgencia</button>
          <button onClick={() => setSortMode("cercania")} className={cn("rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors", sortMode === "cercania" ? "bg-primary text-primary-foreground" : "text-muted-foreground")} disabled={!position}>Cercanía</button>
        </div>
        <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={locate} disabled={locating}>
          <Crosshair className={cn("mr-1.5 h-3.5 w-3.5", locating && "animate-spin")} />Mi ubicación
        </Button>
      </div>

      {locatedStops.length ? (
        <Card className="overflow-hidden border-border/70">
          <CardContent className="p-0">
            <MapContainer center={[Number(locatedStops[0].gpsLat), Number(locatedStops[0].gpsLng)]} zoom={13} style={{ height: 360, width: "100%" }} zoomControl={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitRoute positions={positions} />
              {position && <Marker position={[position.lat, position.lng]} icon={currentIcon}><Popup><strong>Tu ubicación</strong></Popup></Marker>}
              {locatedStops.map((stop, index) => (
                <Marker key={stop.prestamoId} position={[Number(stop.gpsLat), Number(stop.gpsLng)]} icon={markerIcon(index, stop.diasAtrasoMax > 0)}>
                  <Popup>
                    <div className="min-w-[190px] p-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#f0144d]">Parada {index + 1}</p>
                      <p className="mt-1 text-sm font-bold">{stop.clienteNombre}</p>
                      <p className="mt-1 text-xs text-slate-500">{stop.clienteDireccion || stop.ruta}</p>
                      <p className="mt-2 text-base font-bold">{$$(stop.saldoTotal)}</p>
                      <div className="mt-2 flex gap-1.5">
                        <button className="rounded-lg bg-[#f0144d] px-3 py-2 text-xs font-bold text-white" onClick={() => onCollect(stop)}>Cobrar</button>
                        <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => window.open(navigationUrl(stop), "_blank")}>Navegar</button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              {positions.length > 1 && <Polyline positions={positions} pathOptions={{ color: "#f0144d", weight: 3, opacity: 0.7, dashArray: "7 9" }} />}
            </MapContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center p-6 text-center">
            <Route className="h-9 w-9 text-muted-foreground/35" />
            <p className="mt-3 text-sm font-semibold">Faltan ubicaciones de clientes</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">La ruta se dibujará cuando los domicilios tengan coordenadas GPS.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold">Orden de visita</h3>
          <span className="text-[10px] text-muted-foreground">{locatedStops.length}/{stops.length} con GPS</span>
        </div>
        {orderedStops.map((stop, index) => {
          const distance = position && stop.gpsLat && stop.gpsLng ? haversineKm(position, { lat: stop.gpsLat, lng: stop.gpsLng }) : null;
          return (
            <Card key={stop.prestamoId} className={cn("border-border/70", stop.diasAtrasoMax > 0 && "border-l-4 border-l-destructive")}>
              <CardContent className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-bold">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{stop.clienteNombre}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{distance !== null ? `${distance.toFixed(1)} km · ` : ""}{stop.ruta}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold">{$$(stop.saldoTotal)}</p>
                  <p className={cn("text-[9px]", stop.diasAtrasoMax > 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>{stop.diasAtrasoMax > 0 ? `${stop.diasAtrasoMax} días tarde` : "Pendiente"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {stop.clienteTelefono && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`tel:${stop.clienteTelefono}`, "_blank")}><Phone className="h-3.5 w-3.5" /></Button>}
                  {stop.clienteTelefono && <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => window.open(`https://wa.me/${stop.clienteTelefono.replace(/\D/g, "")}`, "_blank")}><MessageSquare className="h-3.5 w-3.5" /></Button>}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => window.open(navigationUrl(stop), "_blank")}><Navigation className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
