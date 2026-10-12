import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresa } from "@/contexts/EmpresaContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Receipt, FileText, Send, FileDown, Phone, MessageSquare } from "lucide-react";
import { useEmpresaConfig } from "@/hooks/useEmpresaConfig";

// ── Tab: Simulador ──
export function SimuladorTab() {
  const { empresaId } = useEmpresa();
  const { data: config } = useEmpresaConfig();
  const { data: empresa } = useQuery({
    queryKey: ["empresa-datos", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("nombre, telefono, direccion, logo_url")
        .eq("id", empresaId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [phone, setPhone] = useState("");
  const [sendingTicket, setSendingTicket] = useState(false);
  const [sendingText, setSendingText] = useState(false);
  const [testMessage, setTestMessage] = useState("Hola, este es un mensaje de prueba desde PrestApps 🚀");

  // Mock data for previews
  const mockPago = {
    folio: "REC-0042",
    monto_recibido: 50,
    aplicado_mora: 5,
    aplicado_interes: 15,
    aplicado_capital: 30,
    metodo_pago: "Efectivo",
    cuota_num: "3",
    saldo_restante: 450,
    proxima_cuota: "20/Mar/2026",
    monto_proxima: 50,
    descuento: 0,
    pago_id: "test-pago",
  };
  const mockCliente = { nombre: "Juan Pérez (Prueba)", telefono: phone };
  const mockPrestamo = { folio: "PRE-0015", num_cuotas: 12 };
  const mockEmpresa = {
    nombre: empresa?.nombre || "Mi Empresa",
    telefono: empresa?.telefono || "",
    direccion: empresa?.direccion || "",
    logo_url: empresa?.logo_url || null,
  };

  const handleSendTicket = async () => {
    if (!phone.trim()) { toast.error("Ingresa un número de teléfono"); return; }
    setSendingTicket(true);
    try {
      const { sendReceiptAsImage } = await import("@/lib/whatsappReceipt");
      const result = await sendReceiptAsImage(
        empresaId,
        phone.trim(),
        {
          pago: mockPago,
          empresa: mockEmpresa,
          cliente: { nombre: mockCliente.nombre },
          prestamo: mockPrestamo,
        },
        `✅ Recibo de pago ${mockPago.folio} por $${mockPago.monto_recibido.toFixed(2)}. Gracias por su pago.`,
        true,
      );
      if (result.success) {
        toast.success("Ticket enviado correctamente por WhatsApp");
      } else {
        toast.error(result.error || "Error al enviar el ticket");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al enviar");
    } finally {
      setSendingTicket(false);
    }
  };

  const handleSendText = async () => {
    if (!phone.trim()) { toast.error("Ingresa un número de teléfono"); return; }
    if (!testMessage.trim()) { toast.error("Escribe un mensaje"); return; }
    setSendingText(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-sender", {
        body: {
           action: "send-text",
          empresa_id: empresaId,
          phone: phone.trim(),
          message: testMessage.trim(),
          tipo: "prueba",
          test: true,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Mensaje enviado correctamente por WhatsApp");
      } else {
        toast.error(data?.error || "Error al enviar el mensaje");
      }
    } catch (e: any) {
      toast.error(e.message || "Error al enviar");
    } finally {
      setSendingText(false);
    }
  };

  const handleDownloadContract = async () => {
    try {
      const { generarContrato } = await import("@/lib/pdfDocuments");
      const prestamoData = {
        id: "test-simulador-id",
        clienteNombre: "Juan Pérez (Prueba)",
        clienteDni: "00000000-0",
        clienteDireccion: "Calle Ejemplo #123, Ciudad",
        clienteTelefono: "7000-0000",
        empresa: empresa?.nombre || "Mi Empresa",
        modalidad: "fijo",
        montoSolicitado: 1000,
        montoTotalPagar: 1200,
        numCuotas: 12,
        frecuencia: "Semanal",
        tasaInteres: 20,
        cuotaCalculada: 100,
        cuotaRedondeada: 100,
        gastosLegales: 0,
        tipoMora: "porcentaje",
        valorMora: 5,
        estado: "Activo",
        fechaRegistro: new Date().toISOString().slice(0, 10),
        fechaPrimerPago: new Date().toISOString().slice(0, 10),
        caja: "Caja Principal",
        ruta: "Ruta Centro",
        notas: "Contrato de prueba generado desde el simulador",
        logoUrl: empresa?.logo_url || null,
        empresaNombre: empresa?.nombre || "Mi Empresa",
      };
      const mockCuotas = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + (i + 1) * 7);
        return {
          num_cuota: i + 1,
          capital: 83.33,
          interes: 16.67,
          capital_interes: 100,
          fecha_vencimiento: d.toISOString().slice(0, 10),
          dias_atraso: 0,
          mora: 0,
          saldo_total: 100,
          status: "Pendiente",
          fecha_pagada: null,
          capital_pagado: 0,
          interes_pagado: 0,
          mora_pagada: 0,
        };
      });
      const doc = await generarContrato(prestamoData, mockCuotas);
      doc.save("contrato-prueba.pdf");
      toast.success("Contrato descargado");
    } catch (e: any) {
      toast.error(e.message || "Error al generar contrato");
    }
  };

  const handleDownloadTicket = async () => {
    try {
      const { generarReciboPagos } = await import("@/lib/pdfDocuments");
      const prestamoData = {
        id: "test-simulador-id",
        clienteNombre: "Juan Pérez (Prueba)",
        clienteDni: "00000000-0",
        clienteDireccion: "Calle Ejemplo #123",
        clienteTelefono: "7000-0000",
        empresa: empresa?.nombre || "Mi Empresa",
        modalidad: "fijo",
        montoSolicitado: 1000,
        montoTotalPagar: 1200,
        numCuotas: 12,
        frecuencia: "Semanal",
        tasaInteres: 20,
        cuotaCalculada: 100,
        cuotaRedondeada: 100,
        gastosLegales: 0,
        tipoMora: "porcentaje",
        valorMora: 5,
        estado: "Activo",
        fechaRegistro: new Date().toISOString().slice(0, 10),
        fechaPrimerPago: new Date().toISOString().slice(0, 10),
        caja: "Caja Principal",
        ruta: "Ruta Centro",
        notas: "",
        logoUrl: empresa?.logo_url || null,
        empresaNombre: empresa?.nombre || "Mi Empresa",
      };
      const mockPagos = [
        {
          created_at: new Date().toISOString(),
          monto_recibido: 50,
          aplicado_mora: 5,
          aplicado_interes: 15,
          aplicado_capital: 30,
          metodo_pago: "Efectivo",
          cajaNombre: "Caja Principal",
        },
      ];
      const doc = await generarReciboPagos(prestamoData, mockPagos);
      doc.save("recibo-prueba.pdf");
      toast.success("Recibo descargado");
    } catch (e: any) {
      toast.error(e.message || "Error al generar recibo");
    }
  };

  return (
    <div className="space-y-6">
      {/* Phone input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" /> Número de Prueba
          </CardTitle>
          <CardDescription>
            Ingresa el número de WhatsApp al que deseas enviar las pruebas (con código de país, ej: 503 7000 0000)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: 50370000000"
            className="max-w-xs"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ticket Preview & Send */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Simulador de Ticket
            </CardTitle>
            <CardDescription>Vista previa del recibo de pago que se envía por WhatsApp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mini ticket preview */}
            <div className="mx-auto w-[280px] bg-white text-black rounded-lg shadow-lg border border-border/40 font-mono text-[10px] overflow-hidden">
              <div className="bg-[#f8f9fa] px-4 py-3 text-center border-b border-dashed border-[#ddd]">
                {empresa?.logo_url && (
                  <div className="flex justify-center mb-1">
                    <img src={empresa.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
                  </div>
                )}
                <p className="font-bold text-[12px] tracking-[2px] uppercase text-[#333]">{empresa?.nombre || "MI EMPRESA"}</p>
                <div className="mt-1">
                  <span className="inline-block bg-[#22c55e] text-white text-[8px] font-bold px-2 py-0.5 rounded uppercase">✓ PAGO RECIBIDO</span>
                </div>
              </div>
              <div className="px-4 py-2 space-y-0.5">
                <div className="flex justify-between"><span className="text-[#666]">Folio:</span><span className="font-bold">REC-0042</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Fecha:</span><span className="font-bold">{new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Cliente:</span><span className="font-bold">Juan Pérez</span></div>
              </div>
              <div className="border-t border-dashed border-[#ddd] mx-4" />
              <div className="px-4 py-2 space-y-0.5">
                <div className="flex justify-between"><span className="text-[#666]">A Mora:</span><span className="font-bold">$5.00</span></div>
                <div className="flex justify-between"><span className="text-[#666]">A Interés:</span><span className="font-bold">$15.00</span></div>
                <div className="flex justify-between"><span className="text-[#666]">A Capital:</span><span className="font-bold">$30.00</span></div>
              </div>
              <div className="mx-4 border-t-2 border-b-2 border-[#333] py-1.5 flex justify-between text-[13px] font-bold">
                <span>TOTAL</span><span>$50.00</span>
              </div>
              <div className="px-4 py-2 space-y-0.5">
                <div className="flex justify-between"><span className="text-[#666]">Cuota:</span><span className="font-bold">3 de 12</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Saldo:</span><span className="font-bold">$450.00</span></div>
              </div>
              <div className="bg-[#f8f9fa] px-4 py-2 text-center border-t border-dashed border-[#ddd]">
                <p className="text-[9px] text-[#999] italic">{config?.ticket_pie || "Gracias por su pago"}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleDownloadTicket}>
                <FileDown className="h-4 w-4 mr-1" /> Descargar PDF
              </Button>
              <Button className="flex-1" onClick={handleSendTicket} disabled={sendingTicket || !phone.trim()}>
                <Send className="h-4 w-4 mr-1" />
                {sendingTicket ? "Enviando..." : "Enviar por WhatsApp"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Contract Preview & Download */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Simulador de Contrato
            </CardTitle>
            <CardDescription>Genera un contrato de prueba con datos ficticios para ver cómo queda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mini contract preview */}
            <div className="mx-auto w-[280px] bg-white text-black rounded-lg shadow-lg border border-border/40 text-[10px] overflow-hidden">
              <div className="bg-primary px-4 py-3">
                <p className="text-primary-foreground font-bold text-[12px]">CONTRATO DE PRÉSTAMO</p>
                <p className="text-primary-foreground/70 text-[9px]">{empresa?.nombre || "Mi Empresa"}</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <div>
                  <p className="text-[8px] font-bold uppercase text-[#999] tracking-[1px]">Datos del Cliente</p>
                  <p className="font-medium">Juan Pérez (Prueba)</p>
                  <p className="text-[#666]">Doc: 00000000-0</p>
                </div>
                <div className="border-t border-[#eee] pt-2">
                  <p className="text-[8px] font-bold uppercase text-[#999] tracking-[1px]">Condiciones</p>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <div><span className="text-[#666]">Monto:</span> <span className="font-bold">$1,000.00</span></div>
                    <div><span className="text-[#666]">Total:</span> <span className="font-bold">$1,200.00</span></div>
                    <div><span className="text-[#666]">Cuotas:</span> <span className="font-bold">12</span></div>
                    <div><span className="text-[#666]">Tasa:</span> <span className="font-bold">20%</span></div>
                  </div>
                </div>
                <div className="border-t border-[#eee] pt-2">
                  <p className="text-[8px] font-bold uppercase text-[#999] tracking-[1px]">Plan de Pagos</p>
                  <div className="mt-1 space-y-0.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex justify-between text-[9px] bg-[#f9fafb] px-1 py-0.5 rounded">
                        <span>Cuota {i}</span><span className="font-bold">$100.00</span>
                      </div>
                    ))}
                    <p className="text-[8px] text-[#999] text-center">... 9 cuotas más</p>
                  </div>
                </div>
                <div className="border-t border-[#eee] pt-3 pb-1 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="border-t border-[#333] mt-4 pt-1 text-[8px] text-[#666]">Firma Cliente</div>
                  </div>
                  <div>
                    <div className="border-t border-[#333] mt-4 pt-1 text-[8px] text-[#666]">Firma Empresa</div>
                  </div>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleDownloadContract}>
              <FileDown className="h-4 w-4 mr-1" /> Descargar Contrato PDF de Prueba
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Text Test */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Prueba de Mensaje WhatsApp
          </CardTitle>
          <CardDescription>Envía un mensaje de texto libre para verificar que tu integración de WhatsApp funciona</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            rows={3}
            placeholder="Escribe un mensaje de prueba..."
          />
          <Button onClick={handleSendText} disabled={sendingText || !phone.trim()} className="w-full sm:w-auto">
            <Send className="h-4 w-4 mr-1" />
            {sendingText ? "Enviando..." : "Enviar Mensaje de Prueba"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
