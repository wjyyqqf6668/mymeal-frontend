import { Button, Form, Input } from "antd";
import { LockOutlined, UserOutlined } from "@ant-design/icons";

export default function LoginForm({ onLogin, loading = false }) {
  return (
    <Form name="login" onFinish={onLogin} style={{ width: "100%", maxWidth: 360, margin: "auto" }}>
      <Form.Item name="username" label="Email" rules={[
        { required: true, message: "Enter your email." },
        { type: "email", transform: (value) => value?.trim(), message: "Enter a valid email." },
      ]}>
        <Input prefix={<UserOutlined />} autoComplete="username" disabled={loading} />
      </Form.Item>
      <Form.Item name="password" label="Password" rules={[{ required: true, message: "Enter your password." }]}>
        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" disabled={loading} />
      </Form.Item>
      <Button type="primary" htmlType="submit" block loading={loading}>Sign in</Button>
    </Form>
  );
}
