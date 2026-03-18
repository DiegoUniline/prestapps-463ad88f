import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import logoFull from "@/assets/logo-full.png";

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  // Redirect if already logged in
  if (!authLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message === "Invalid login credentials"
        ? "Credenciales inválidas. Verifica tu correo y contraseña."
        : error.message
      );
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Ingresa tu correo electrónico");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Se envió un enlace de recuperación a tu correo");
      setMode("login");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <img src={logoFull} alt="PrestApp" className="mx-auto h-28 w-28 object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Sistema de Préstamos</h1>
          <p className="text-muted-foreground text-sm">
            {mode === "login" ? "Inicia sesión para continuar" : "Recupera tu contraseña"}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === "login" ? "Iniciar Sesión" : "Recuperar Contraseña"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Ingresa tus credenciales"
                : "Te enviaremos un enlace de recuperación"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={mode === "login" ? handleLogin : handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              {mode === "login" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-9"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Cargando..."
                  : mode === "login"
                  ? "Iniciar Sesión"
                  : "Enviar enlace"}
              </Button>

              <div className="text-center">
                {mode === "login" ? (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-sm text-primary hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-sm text-primary hover:underline"
                  >
                    Volver al inicio de sesión
                  </button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="text-center space-y-2">
          <Link to="/registro" className="text-sm text-primary font-medium hover:underline">
            ¿No tienes cuenta? Regístrate gratis →
          </Link>
          <br />
          <Link to="/landing" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            ← Conoce más sobre PrestApp
          </Link>
        </div>
      </div>
    </div>
  );
}
