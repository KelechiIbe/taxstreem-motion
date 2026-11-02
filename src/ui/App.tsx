import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { Projects } from "./Projects";
import { Studio } from "./Studio";
import { Settings } from "./Settings";
import { Demo } from "./Demo";

export interface Me {
  id: string;
  email: string;
  name: string;
  role: "admin" | "producer" | "reviewer";
}

function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => setR(read());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}

export const go = (path: string) => (location.hash = `#/${path}`);

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [outsider, setOutsider] = useState<string | null>(null);
  const route = useRoute();

  const load = async () => {
    const { data } = await sb.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      setMe(null);
      return;
    }
    const { data: p } = await sb.from("profiles").select("id, email, full_name, role").eq("id", user.id).maybeSingle();
    if (!p) {
      setOutsider(user.email ?? "");
      setMe(null);
      return;
    }
    setOutsider(null);
    setMe({ id: p.id, email: p.email || user.email || "", name: p.full_name || p.email, role: p.role });
  };
  useEffect(() => {
    load();
    const { data } = sb.auth.onAuthStateChange((ev) => {
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") load();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (route[0] === "demo") return <Demo />;
  if (me === undefined) return <div className="center muted">Loading…</div>;
  if (outsider !== null)
    return (
      <div className="center">
        <div className="panel narrow stack">
          <h2>You're signed in, but not on the team yet</h2>
          <p>{outsider} isn't on the TaxStreem studio team. An admin can add you from The Bridge's Team page; then sign in again.</p>
          <button className="btn" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );
  if (!me) return <Login />;
  if (route[0] === "p" && route[1]) return <Studio key={route[1]} projectId={route[1]} me={me} />;
  if (route[0] === "settings") return <Settings me={me} />;
  return <Projects me={me} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ error: { message: string } | null }>, done?: string) => {
    setBusy(true);
    setMsg(null);
    const { error } = await fn();
    setBusy(false);
    setMsg(error ? error.message : done ?? null);
  };
  return (
    <div className="login">
      <form
        className="panel narrow stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => sb.auth.signInWithPassword({ email, password }));
        }}
      >
        <img src="/brand/logo-brand.svg" alt="TaxStreem" style={{ height: 28, alignSelf: "flex-start" }} />
        <div>
          <h1 style={{ margin: "18px 0 4px" }}>Motion Studio</h1>
          <p className="muted" style={{ margin: 0 }}>Chat with Claude to turn content, screenshots and audio into on-brand motion videos. Sign in with your Bridge account.</p>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="row small">
          <button type="button" className="link" disabled={!email || busy} onClick={() => run(() => sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin } }), "Check your email for a sign-in link.")}>
            Email me a sign-in link
          </button>
          <span className="muted">·</span>
          <button type="button" className="link" disabled={!email || busy} onClick={() => run(() => sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin }), "Check your email to reset your password.")}>
            Reset password
          </button>
        </div>
        {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
      </form>
    </div>
  );
}

export function TopBar({ me, children }: { me: Me; children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <a href="#/" className="brand">
        <img src="/brand/icon-brand.svg" alt="" />
        <span>Motion</span>
      </a>
      <div className="topbar-mid">{children}</div>
      <nav className="row">
        <a href="#/settings" className="btn ghost small">Settings</a>
        <span className="muted small hide-sm">{me.name}</span>
      </nav>
    </header>
  );
}
