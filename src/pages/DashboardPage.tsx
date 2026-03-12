import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { DollarSign, TrendingUp, AlertTriangle, Clock } from "lucide-react";

const kpis = [
  { title: "Cartera Activa", value: "$1,245,800", change: "+12%", icon: DollarSign },
  { title: "Cobrado Hoy", value: "$18,450", change: "+5%", icon: TrendingUp },
  { title: "Préstamos Vencidos", value: "23", change: "-3", icon: AlertTriangle },
  { title: "Mora Acumulada", value: "$45,200", change: "+8%", icon: Clock },
];

const chartData = [
  { semana: "Sem 1", activos: 45 },
  { semana: "Sem 2", activos: 52 },
  { semana: "Sem 3", activos: 48 },
  { semana: "Sem 4", activos: 61 },
  { semana: "Sem 5", activos: 55 },
  { semana: "Sem 6", activos: 67 },
  { semana: "Sem 7", activos: 72 },
  { semana: "Sem 8", activos: 69 },
];

const pagosHoy = [
  { id: 1, cliente: "María García", monto: "$500", cuota: "3/12", status: "Pendiente" },
  { id: 2, cliente: "Carlos López", monto: "$1,200", cuota: "7/24", status: "Vencida" },
  { id: 3, cliente: "Ana Martínez", monto: "$350", cuota: "1/6", status: "Pendiente" },
  { id: 4, cliente: "José Rodríguez", monto: "$800", cuota: "5/18", status: "Prometida" },
  { id: 5, cliente: "Laura Sánchez", monto: "$650", cuota: "10/12", status: "Pendiente" },
];

const statusColor: Record<string, string> = {
  Pendiente: "bg-muted text-muted-foreground",
  Vencida: "bg-destructive text-destructive-foreground",
  Prometida: "bg-warning text-warning-foreground",
  Pagada: "bg-success text-success-foreground",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Resumen general del sistema</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.change} vs semana anterior</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <kpi.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Préstamos Activos por Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="semana" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Bar dataKey="activos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagos del Día</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pagosHoy.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{p.cliente}</p>
                  <p className="text-xs text-muted-foreground">Cuota {p.cuota} · {p.monto}</p>
                </div>
                <Badge className={statusColor[p.status]}>{p.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
