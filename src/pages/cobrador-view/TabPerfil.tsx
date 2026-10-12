import { supabase } from "@/integrations/supabase/client";
import { $$, fmtDate } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Eye, User, Lock, Wallet, FileText } from "lucide-react";
import type { PerfilCobrador } from "./hooks";
import { LoadingCards } from "./cards";

interface TabPerfilProps {
  loadingPerfil: boolean;
  perfil: PerfilCobrador | undefined;
  userEmail: string | undefined;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  changingPw: boolean;
  setChangingPw: (value: boolean) => void;
  navigate: (path: string) => void;
}

export function TabPerfil({
  loadingPerfil, perfil, userEmail, newPassword, setNewPassword, confirmPassword,
  setConfirmPassword, changingPw, setChangingPw, navigate,
}: TabPerfilProps) {
  return (
    <>
      {loadingPerfil ? (
        <LoadingCards />
      ) : (
        <>
          {/* Profile info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{perfil?.profile?.nombre_completo || "—"}</p>
                  <p className="text-xs text-muted-foreground">{userEmail || "—"}</p>
                  {perfil?.profile?.telefono && (
                    <p className="text-xs text-muted-foreground">{perfil.profile.telefono}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center bg-secondary/50 rounded-md p-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Comisión</p>
                  <p className="text-sm font-bold">{perfil?.profile?.porcentaje_comision || 0}%</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Efectivo en mano</p>
                  <p className="text-sm font-bold">{$$(Number(perfil?.profile?.efectivo_en_mano || 0))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commissions summary */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Comisiones
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total ganadas</p>
                  <p className="text-lg font-bold text-primary">{$$(perfil?.totalComisionesGanadas || 0)}</p>
                </div>
                <div className="bg-secondary rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total cobrado</p>
                  <p className="text-lg font-bold">{$$(perfil?.totalCobrado || 0)}</p>
                </div>
              </div>

              {/* Recent cortes */}
              {(perfil?.cortes || []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Últimos cortes</p>
                  <div className="space-y-1.5">
                    {perfil!.cortes.slice(0, 5).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between bg-secondary/50 rounded-md px-3 py-2">
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(c.created_at)}
                        </span>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-primary">{$$(Number(c.monto_comision))}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">de {$$(Number(c.total_cobrado))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Change password */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Cambiar contraseña
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nueva contraseña</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Confirmar contraseña</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repetir contraseña" />
              </div>
              <Button
                className="w-full"
                disabled={changingPw || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                onClick={async () => {
                  setChangingPw(true);
                  const { error } = await supabase.auth.updateUser({ password: newPassword });
                  setChangingPw(false);
                  if (error) {
                    toast.error("Error al cambiar contraseña: " + error.message);
                  } else {
                    toast.success("Contraseña actualizada correctamente");
                    setNewPassword("");
                    setConfirmPassword("");
                  }
                }}
              >
                {changingPw ? "Guardando..." : "Actualizar contraseña"}
              </Button>
              {newPassword && newPassword.length < 6 && (
                <p className="text-xs text-destructive">La contraseña debe tener al menos 6 caracteres</p>
              )}
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
              )}
            </CardContent>
          </Card>

          {/* Assigned loans */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Préstamos asignados ({perfil?.prestamos?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              {(perfil?.prestamos || []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin préstamos asignados</p>
              ) : (
                perfil!.prestamos.map((p: any) => (
                  <div key={p.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.cliente}</p>
                        <p className="text-[11px] text-muted-foreground">{p.ruta} • {p.frecuencia}</p>
                      </div>
                      <Badge variant={p.estado === "Vencido" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                        {p.estado}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center bg-secondary/50 rounded-md p-2">
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Monto</p>
                        <p className="text-xs font-semibold">{$$(p.monto)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Saldo</p>
                        <p className="text-xs font-semibold">{$$(p.saldo)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase text-muted-foreground">Cuotas</p>
                        <p className="text-xs font-semibold">{p.pagadas}/{p.cuotas}</p>
                      </div>
                    </div>
                    {p.mora > 0 && (
                      <p className="text-[11px] text-destructive font-medium">Mora: {$$(p.mora)}</p>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => navigate(`/prestamos/${p.id}`)}>
                      <Eye className="h-3 w-3 mr-1" /> Ver detalle
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
