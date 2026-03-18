import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Building2, User, Mail, Lock, Phone, Sparkles } from "lucide-react";
import logoFull from "@/assets/logo-full.png";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre_completo: "",
    email: "",
    password: "",
    nombre_empresa: "",
    telefono: "",
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nombre_completo || !form.email || !form.password || !form.nombre_empresa) {
      toast.error("Completa todos los campos requeridos");
      return;
    }

    if (form.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);
    try {
      // Call register-empresa edge function
      const { data, error } = await supabase.functions.invoke("register-empresa", {
        body: {
          email: (form.email ?? "").trim().toLowerCase(),
          password: form.password,
          nombre_completo: (form.nombre_completo ?? "").trim(),
          nombre_empresa: (form.nombre_empresa ?? "").trim(),
          telefono: (form.telefono ?? "").trim() || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("¡Cuenta creada exitosamente! Iniciando sesión...");

      // Auto-login
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: (form.email ?? "").trim().toLowerCase(),
        password: form.password,
      });

      if (loginError) {
        toast.info("Cuenta creada. Inicia sesión con tus credenciales.");
        navigate("/login");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || "Error al crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src={logoFull} alt="PrestApp" className="mx-auto h-16 object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Crear Cuenta</h1>
          <p className="text-muted-foreground text-sm">
            Regístrate y obtén <span className="font-semibold text-primary">7 días gratis</span> para probar todas las funcionalidades
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Prueba Gratuita
            </CardTitle>
            <CardDescription>
              Acceso completo durante 7 días. Sin tarjeta de crédito.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre_empresa">Nombre de tu empresa *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="nombre_empresa"
                    value={form.nombre_empresa}
                    onChange={(e) => update("nombre_empresa", e.target.value)}
                    placeholder="Mi Financiera S.A."
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nombre_completo">Tu nombre completo *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="nombre_completo"
                    value={form.nombre_completo}
                    onChange={(e) => update("nombre_completo", e.target.value)}
                    placeholder="Juan Pérez"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="juan@miempresa.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono (opcional)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="telefono"
                    value={form.telefono}
                    onChange={(e) => update("telefono", e.target.value)}
                    placeholder="+52 55 1234 5678"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="pl-10 pr-10"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {loading ? "Creando cuenta..." : "Comenzar prueba gratuita"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Iniciar sesión
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Al registrarte aceptas los términos de servicio y la política de privacidad.
          </p>
        </div>
      </div>
    </div>
  );
}
