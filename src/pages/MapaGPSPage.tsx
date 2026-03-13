import { useState, useMemo, useEffect } from "react";
import { $$, fmtDate } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Users, CreditCard, HandCoins } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
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

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [bounds, map]);
  return null;
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

  // Fetch clients with GPS
  const { data: clientes = [] } = useQuery({
    queryKey: ["mapa-clientes", empresaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nombre_completo, id_cliente, gps_lat, gps_lng, direccion, telefono")
        .eq("empresa_id", empresaId)
        .not("gps_lat", "is", null);
      return data || [];
    },
  });

  // Fetch prestamos with GPS
  const { data: prestamos = [] } = useQuery({
    queryKey: ["mapa-prestamos", empresaId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("prestamos")
        .select("id, monto_solicitado, created_at, gps_lat, gps_lng, clientes!inner(nombre_completo)")
        .eq("empresa_id", empresaId)
        .not("gps_lat", "is", null);
      return data || [];
    },
  });

  // Fetch pagos with GPS
  const { data: pagos = [] } = useQuery({
    queryKey: ["mapa-pagos", empresaId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("pagos")
        .select("id, monto_recibido, created_at, gps_lat, gps_lng, prestamos!inner(clientes!inner(nombre_completo))")
        .eq("empresa_id", empresaId)
        .not("gps_lat", "is", null);
      return data || [];
    },
  });

  const points = useMemo((): MapPoint[] => {
    const result: MapPoint[] = [];

    if (filter === "todos" || filter === "clientes") {
      clientes.forEach((c: any) => {
        if (c.gps_lat && c.gps_lng) {
          result.push({
            lat: c.gps_lat, lng: c.gps_lng, tipo: "cliente",
            label: c.nombre_completo,
            detail: `${c.id_cliente} · ${c.direccion || "Sin dirección"}`,
          });
        }
      });
    }

    if (filter === "todos" || filter === "prestamos") {
      prestamos.forEach((p: any) => {
        if (p.gps_lat && p.gps_lng) {
          result.push({
            lat: p.gps_lat, lng: p.gps_lng, tipo: "prestamo",
            label: `Préstamo ${$$(Number(p.monto_solicitado))}`,
            detail: `${p.clientes?.nombre_completo} · ${fmtDate(p.created_at)}`,
          });
        }
      });
    }

    if (filter === "todos" || filter === "pagos") {
      pagos.forEach((pg: any) => {
        if (pg.gps_lat && pg.gps_lng) {
          result.push({
            lat: pg.gps_lat, lng: pg.gps_lng, tipo: "pago",
            label: `Pago ${$$(Number(pg.monto_recibido))}`,
            detail: `${pg.prestamos?.clientes?.nombre_completo || ""} · ${fmtDate(pg.created_at)}`,
          });
        }
      });
    }

    return result.filter((p) =>
      !search || p.label.toLowerCase().includes(search.toLowerCase()) || p.detail.toLowerCase().includes(search.toLowerCase())
    );
  }, [clientes, prestamos, pagos, filter, search]);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    return L.latLngBounds(points.map((p) => [p.lat, p.lng]));
  }, [points]);

  const countByType = (t: string) => points.filter((p) => p.tipo === t).length;

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
          {points.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
              <MapPin className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No hay ubicaciones GPS registradas</p>
              <p className="text-[12px]">Las ubicaciones se capturan automáticamente al crear préstamos y registrar pagos</p>
            </div>
          ) : (
            <div style={{ height: 500 }}>
              <MapContainer
                center={[points[0].lat, points[0].lng]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds bounds={bounds} />
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
