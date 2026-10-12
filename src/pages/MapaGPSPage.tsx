import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { $$, fmtDate } from "@/lib/utils";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { rpc } from "@/lib/supabaseQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Users, CreditCard, HandCoins, Loader2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const clienteIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const prestamoIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const pagoIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

type Bbox = [number, number, number, number]; // minLat, minLng, maxLat, maxLng

// Ajusta la vista a los puntos una sola vez por combinación de filtros (fitKey), con datos ya cargados.
function FitBounds({ bounds, fitKey, ready }: { bounds: L.LatLngBoundsExpression | null; fitKey: string; ready: boolean }) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !bounds || fitted.current === fitKey) return;
    fitted.current = fitKey;
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [bounds, fitKey, ready, map]);
  return null;
}

// Informa el área visible (redondeada hacia afuera) tras mover/zoom, con debounce.
function BoundsWatcher({ onChange }: { onChange: (b: Bbox) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useMapEvents({
    moveend: (e) => {
      const b = e.target.getBounds();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const r = (v: number, up: boolean) => (up ? Math.ceil(v * 1000) : Math.floor(v * 1000)) / 1000;
        onChange([r(b.getSouth(), false), r(b.getWest(), false), r(b.getNorth(), true), r(b.getEast(), true)]);
      }, 400);
    },
  });
  return null;
}

const MAX_PUNTOS_POR_TIPO = 500;
const CENTRO_DEFAULT: [number, number] = [19.4326, -99.1332];

interface PuntoRow {
  tipo: "cliente" | "prestamo" | "pago";
  lat: number;
  lng: number;
  nombre: string | null;
  id_cliente: string | null;
  direccion: string | null;
  monto: number | null;
  fecha: string | null;
}

interface MapPoint {
  lat: number;
  lng: number;
  tipo: "cliente" | "prestamo" | "pago";
  label: string;
  detail: string;
}

export default function MapaGPSPage() {
  const { empresaId } = useEmpresa();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("todos");

  const debouncedSearch = useDebouncedValue(search, 300);
  const fitKey = `${empresaId}|${filter}|${debouncedSearch}`;
  const [bboxState, setBboxState] = useState<{ key: string; bbox: Bbox | null }>({ key: fitKey, bbox: null });
  const bbox = bboxState.key === fitKey ? bboxState.bbox : null;
  const handleBounds = useCallback((b: Bbox) => setBboxState({ key: fitKey, bbox: b }), [fitKey]);

  // KPIs: totales del tenant con el filtro/búsqueda actuales (no dependen del área visible)
  const { data: totales, isLoading: loadingTotales } = useQuery({
    queryKey: ["mapa-totales", empresaId, filter, debouncedSearch],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await rpc<{ clientes: number; prestamos: number; pagos: number }>("mapa_totales", {
        p_tipo: filter,
        p_search: debouncedSearch || null,
      });
      if (error) throw error;
      return data;
    },
  });

  // Marcadores: solo los del área visible (o los más recientes antes de conocerla), máx. N por tipo
  const { data: puntos = [], isPlaceholderData } = useQuery({
    queryKey: ["mapa-puntos", empresaId, filter, debouncedSearch, bbox],
    enabled: !!empresaId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await rpc<PuntoRow[]>("mapa_puntos", {
        p_tipo: filter,
        p_search: debouncedSearch || null,
        p_min_lat: bbox ? bbox[0] : null,
        p_min_lng: bbox ? bbox[1] : null,
        p_max_lat: bbox ? bbox[2] : null,
        p_max_lng: bbox ? bbox[3] : null,
        p_limit: MAX_PUNTOS_POR_TIPO,
      });
      if (error) throw error;
      return data || [];
    },
  });

  const points = useMemo((): MapPoint[] =>
    puntos.map((p) => {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (p.tipo === "cliente") {
        return { lat, lng, tipo: "cliente", label: p.nombre || "", detail: `${p.id_cliente} · ${p.direccion || "Sin dirección"}` };
      }
      if (p.tipo === "prestamo") {
        return { lat, lng, tipo: "prestamo", label: `Préstamo ${$$(Number(p.monto))}`, detail: `${p.nombre} · ${fmtDate(p.fecha)}` };
      }
      return { lat, lng, tipo: "pago", label: `Pago ${$$(Number(p.monto))}`, detail: `${p.nombre || ""} · ${fmtDate(p.fecha)}` };
    }),
  [puntos]);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    return L.latLngBounds(points.map((p) => [p.lat, p.lng]));
  }, [points]);

  const countByType = (t: string) =>
    t === "cliente" ? totales?.clientes ?? 0 : t === "prestamo" ? totales?.prestamos ?? 0 : totales?.pagos ?? 0;
  const totalPuntos = (totales?.clientes ?? 0) + (totales?.prestamos ?? 0) + (totales?.pagos ?? 0);
  const hayPuntos = totalPuntos > 0 || points.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Mapa de Ubicaciones GPS
        </h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-[11px] text-muted-foreground uppercase">Clientes</p>
              <p className="text-lg font-bold">{countByType("cliente")}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-[11px] text-muted-foreground uppercase">Préstamos</p>
              <p className="text-lg font-bold">{countByType("prestamo")}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-[11px] text-muted-foreground uppercase">Pagos</p>
              <p className="text-lg font-bold">{countByType("pago")}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." className="pl-9 h-9 text-[13px]" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px] h-9 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="clientes">Solo Clientes</SelectItem>
            <SelectItem value="prestamos">Solo Préstamos</SelectItem>
            <SelectItem value="pagos">Solo Pagos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[12px]">
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-blue-500" /> Domicilio Cliente</div>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-green-500" /> Lugar de Préstamo</div>
        <div className="flex items-center gap-1.5"><div className="h-3 w-3 rounded-full bg-red-500" /> Lugar de Pago/Cobro</div>
      </div>

      {/* Map */}
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          {!hayPuntos ? (
            <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
              {loadingTotales ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
              <>
              <MapPin className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay ubicaciones GPS registradas</p>
              <p className="text-[12px]">Las ubicaciones se capturan automáticamente al crear préstamos y registrar pagos</p>
              </>
              )}
            </div>
          ) : (
            <div style={{ height: 500 }}>
              <MapContainer
                center={points[0] ? [points[0].lat, points[0].lng] : CENTRO_DEFAULT}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds bounds={bounds} fitKey={fitKey} ready={!isPlaceholderData && bbox === null} />
                <BoundsWatcher onChange={handleBounds} />
                {points.map((p, i) => (
                  <Marker
                    key={`${p.tipo}-${i}`}
                    position={[p.lat, p.lng]}
                    icon={p.tipo === "cliente" ? clienteIcon : p.tipo === "prestamo" ? prestamoIcon : pagoIcon}
                  >
                    <Popup>
                      <div className="text-[12px]">
                        <p className="font-semibold">{p.label}</p>
                        <p className="text-muted-foreground">{p.detail}</p>
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {p.tipo === "cliente" ? "📍 Domicilio" : p.tipo === "prestamo" ? "💰 Préstamo" : "💳 Pago"}
                        </Badge>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
  );
}
