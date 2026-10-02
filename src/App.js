import { Alert, Button, Layout, Space, Spin, Typography } from "antd";
import AccountWorkspace from "./components/AccountWorkspace";
import LoginForm from "./components/LoginForm";
import SignupForm from "./components/SignupForm";
import useAuth from "./hooks/useAuth";

const { Header, Content } = Layout;

export default function App() {
  const auth = useAuth();
  return <Layout style={{ minHeight: "100vh" }}>
    <Header style={{ height: "auto", minHeight: 64, padding: "12px 24px", lineHeight: "normal" }}>
      <div style={{ display: "flex", gap: 16, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <Typography.Title level={2} style={{ color: "white", margin: 0 }}>MyMeal</Typography.Title>
        {auth.phase === "authenticated" && <Space wrap>
          <Typography.Text style={{ color: "white" }}>{auth.user.email}</Typography.Text>
          <Button onClick={auth.signOut} loading={auth.busy}>Sign out</Button>
        </Space>}
        {auth.phase === "anonymous" && <SignupForm disabled={auth.busy} />}
      </div>
    </Header>
    <Content style={{ padding: "32px 24px", width: "100%", maxWidth: 1440, margin: "0 auto" }}>
      {auth.phase === "loading" && <div style={{ textAlign: "center", padding: 48 }}><Spin tip="Checking your session…" /></div>}
      {auth.error && <Alert type="error" message={auth.error} showIcon style={{ marginBottom: 24 }} />}
      {auth.phase === "error" && <Button type="primary" onClick={auth.restoreSession}>Check session again</Button>}
      {auth.phase === "anonymous" && <LoginForm onLogin={auth.signIn} loading={auth.busy} />}
      {auth.phase === "authenticated" && <AccountWorkspace key={auth.user.id} user={auth.user} />}
    </Content>
  </Layout>;
}
