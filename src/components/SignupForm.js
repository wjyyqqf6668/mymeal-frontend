import { Alert, Button, Form, Input, message, Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { signup } from "../utils";

export default function SignupForm({ disabled = false }) {
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const submit = async (values) => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    try {
      await signup({ ...values, email: values.email.trim().toLowerCase(),
        first_name: values.first_name.trim(), last_name: values.last_name.trim() });
      if (!mounted.current) return;
      setOpen(false);
      form.resetFields();
      message.success("Account created. You can now sign in.");
    } catch (failure) {
      if (!mounted.current) return;
      setError(failure.outcomeUnknown
        ? "Registration was not confirmed. Try signing in before registering again." : failure.message);
      if (Array.isArray(failure.details)) {
        form.setFields(failure.details.filter((item) => ["email", "password", "first_name", "last_name"].includes(item.field))
          .map((item) => ({ name: item.field, errors: [item.message] })));
      }
    } finally {
      pending.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  return <>
    <Button disabled={disabled} onClick={() => { setError(null); setOpen(true); }}>Register</Button>
    <Modal title="Create an account" open={open} footer={null} destroyOnClose
      closable={!loading} maskClosable={!loading} keyboard={!loading}
      onCancel={() => { if (!loading) setOpen(false); }}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" preserve={false} onFinish={submit}>
        <Form.Item name="email" label="Email" rules={[{ required: true },
          { type: "email", transform: (value) => value?.trim() }, { max: 254 }]}>
          <Input autoComplete="email" disabled={loading} />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true }, { min: 8, max: 72 }, {
          validator: (_, value) => !value || new TextEncoder().encode(value).length <= 72
            ? Promise.resolve() : Promise.reject(new Error("Password is too long; use fewer characters.")),
        }]}>
          <Input.Password autoComplete="new-password" disabled={loading} />
        </Form.Item>
        <Form.Item name="first_name" label="First name" rules={[{ required: true, whitespace: true }, { max: 100 }]}>
          <Input autoComplete="given-name" disabled={loading} />
        </Form.Item>
        <Form.Item name="last_name" label="Last name" rules={[{ required: true, whitespace: true }, { max: 100 }]}>
          <Input autoComplete="family-name" disabled={loading} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>Create account</Button>
      </Form>
    </Modal>
  </>;
}
