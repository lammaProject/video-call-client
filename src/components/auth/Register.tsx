import { useFormik } from "formik";
import { useMutation } from "@tanstack/react-query";
import { registerUser } from "../../api/api.ts";
import { Button, TextInput } from "react95";
import { useNavigate } from "react-router";
import { RouteConfig } from "../../app/config/config.ts";
import { WindowCustom } from "../ui/Window/Window.tsx";
import { useState } from "react";
import type { AxiosError } from "axios";

const Register = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [contentText, setContentText] = useState("");

  const navigate = useNavigate();

  const { mutateAsync } = useMutation({
    mutationFn: registerUser,
    onSuccess: (res) => {
      localStorage.setItem("token", res.data.token);
      navigate(RouteConfig.main);
    },
    onError: (err: AxiosError) => {
      setIsOpen(true);
      setContentText(String(err?.response?.data));
    },
  });

  const handleSubmit = async (values: { name: string; password: string }) => {
    try {
      await mutateAsync(values);
      await navigate(RouteConfig.main);
    } catch (err) {
      console.log(err);
    }
  };

  const formik = useFormik({
    initialValues: { name: "", password: "" },
    onSubmit: handleSubmit,
  });

  return (
    <form style={{ marginBottom: "15px" }} onSubmit={formik.handleSubmit}>
      <h1 style={{ marginBottom: "10px" }}>REGISTER</h1>
      <h2>Name</h2>
      <TextInput
        id={"name"}
        name={"name"}
        type={"text"}
        onChange={formik.handleChange}
        value={formik.values.name}
      />
      <h2 style={{ marginTop: "15px" }}>Password</h2>
      <TextInput
        id={"password"}
        name={"password"}
        type={"password"}
        onChange={formik.handleChange}
        value={formik.values.password}
      />

      <Button style={{ marginTop: "10px" }} type="submit">
        Send
      </Button>

      <WindowCustom
        headerText={"register notification"}
        contentText={contentText}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />
    </form>
  );
};

export { Register };
