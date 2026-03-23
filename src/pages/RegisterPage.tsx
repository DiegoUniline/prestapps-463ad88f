import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Eye, EyeOff, Building2, User, Mail, Lock, Phone, Sparkles } from "lucide-react";
import logoFull from "@/assets/logo-full.png";

const COUNTRY_CODES: { code: string; label: string; flag: string; digits: number[] }[] = [
  { code: "52", label: "México", flag: "🇲🇽", digits: [10] },
  { code: "1", label: "EE.UU. / Canadá", flag: "🇺🇸", digits: [10] },
  { code: "502", label: "Guatemala", flag: "🇬🇹", digits: [8] },
  { code: "503", label: "El Salvador", flag: "🇸🇻", digits: [8] },
  { code: "504", label: "Honduras", flag: "🇭🇳", digits: [8] },
  { code: "505", label: "Nicaragua", flag: "🇳🇮", digits: [8] },
  { code: "506", label: "Costa Rica", flag: "🇨🇷", digits: [8] },
  { code: "507", label: "Panamá", flag: "🇵🇦", digits: [7, 8] },
  { code: "51", label: "Perú", flag: "🇵🇪", digits: [9] },
  { code: "57", label: "Colombia", flag: "🇨🇴", digits: [10] },
  { code: "56", label: "Chile", flag: "🇨🇱", digits: [9] },
  { code: "54", label: "Argentina", flag: "🇦🇷", digits: [10] },
  { code: "593", label: "Ecuador", flag: "🇪🇨", digits: [9, 10] },
  { code: "591", label: "Bolivia", flag: "🇧🇴", digits: [8] },
  { code: "595", label: "Paraguay", flag: "🇵🇾", digits: [9] },
  { code: "598", label: "Uruguay", flag: "🇺🇾", digits: [8, 9] },
  { code: "58", label: "Venezuela", flag: "🇻🇪", digits: [10] },
  { code: "809", label: "Rep. Dominicana", flag: "🇩🇴", digits: [10] },
  { code: "34", label: "España", flag: "🇪🇸", digits: [9] },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre_completo: "",
    email: "",
    password: "",
    nombre_empresa: "",
    telefono: "",
    lada_pais: "52",
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const selectedCountry = useMemo(
    () => COUNTRY_CODES.find((c) => c.code === form.lada_pais) || COUNTRY_CODES[0],
    [form.lada_pais]
  );

  const phoneDigitsOnly = form.telefono.replace(/\D/g, "");
  const isPhoneValid = !form.telefono.trim() || selectedCountry.digits.includes(phoneDigitsOnly.length);
  const expectedDigits = selectedCountry.digits.join(" ó ");

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

    if (form.telefono.trim() && !isPhoneValid) {
      toast.error(`El teléfono para ${selectedCountry.label} debe tener ${expectedDigits} dígitos`);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("register-empresa", {
        body: {
          email: form.email.trim().toLowerCase(),
          password: form.password,
          nombre_completo: form.nombre_completo.trim(),
          nombre_empresa: form.nombre_empresa.trim(),
          telefono: form.telefono.trim() || null,
          lada_pais: form.lada_pais,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("¡Cuenta creada exitosamente! Iniciando sesión...");

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
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
                <Label>País y teléfono (opcional)</Label>
                <div className="flex gap-2">
                  <Select value={form.lada_pais} onValueChange={(v) => update("lada_pais", v)}>
                    <SelectTrigger className="w-[160px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          <span className="flex items-center gap-1.5">
                            <span>{c.flag}</span>
                            <span>+{c.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="telefono"
                      value={form.telefono}
                      onChange={(e) => update("telefono", e.target.value)}
                      placeholder={`${expectedDigits} dígitos`}
                      className="pl-10"
                      inputMode="tel"
                    />
                  </div>
                </div>
                {form.telefono.trim() && !isPhoneValid && (
                  <p className="text-xs text-destructive">
                    {selectedCountry.flag} {selectedCountry.label} requiere {expectedDigits} dígitos (tienes {phoneDigitsOnly.length})
                  </p>
                )}
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
