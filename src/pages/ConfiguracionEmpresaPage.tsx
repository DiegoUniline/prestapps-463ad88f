import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Receipt, FileText, CreditCard, CalendarCheck, Send, ShieldAlert } from "lucide-react";
import { StripeConnectTab } from "@/components/StripeConnectTab";
import { PurgeDataSection } from "@/components/PurgeDataSection";
import { DatosGeneralesTab } from "@/pages/configuracion-empresa/DatosGeneralesTab";
import { TicketTab } from "@/pages/configuracion-empresa/TicketTab";
import { ContratoTab } from "@/pages/configuracion-empresa/ContratoTab";
import { CorteSemanalTab } from "@/pages/configuracion-empresa/CorteSemanalTab";
import { SimuladorTab } from "@/pages/configuracion-empresa/SimuladorTab";

export default function ConfiguracionEmpresaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración de la Empresa</h1>
        <p className="text-muted-foreground text-sm mt-1">Logo, datos, tickets, contratos, corte semanal, simulador y pagos con tarjeta</p>
      </div>

      <Tabs defaultValue="datos" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="datos" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Datos Generales
          </TabsTrigger>
          <TabsTrigger value="ticket" className="gap-1.5">
            <Receipt className="h-4 w-4" /> Ticket de Pago
          </TabsTrigger>
          <TabsTrigger value="contrato" className="gap-1.5">
            <FileText className="h-4 w-4" /> Contrato
          </TabsTrigger>
          <TabsTrigger value="simulador" className="gap-1.5">
            <Send className="h-4 w-4" /> Simulador
          </TabsTrigger>
          <TabsTrigger value="corte" className="gap-1.5">
            <CalendarCheck className="h-4 w-4" /> Corte Semanal
          </TabsTrigger>
          <TabsTrigger value="stripe" className="gap-1.5">
            <CreditCard className="h-4 w-4" /> Stripe
          </TabsTrigger>
          <TabsTrigger value="peligro" className="gap-1.5 text-destructive data-[state=active]:text-destructive">
            <ShieldAlert className="h-4 w-4" /> Peligro
          </TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <DatosGeneralesTab />
        </TabsContent>
        <TabsContent value="ticket">
          <TicketTab />
        </TabsContent>
        <TabsContent value="contrato">
          <ContratoTab />
        </TabsContent>
        <TabsContent value="simulador">
          <SimuladorTab />
        </TabsContent>
        <TabsContent value="corte">
          <CorteSemanalTab />
        </TabsContent>
        <TabsContent value="stripe">
          <StripeConnectTab />
        </TabsContent>
        <TabsContent value="peligro">
          <PurgeDataSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
