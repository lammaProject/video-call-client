import { Register } from "./Register.tsx";
import { Login } from "./Login.tsx";
import { useEffect, useState } from "react";
import { Button } from "react95";
import { useNavigate } from "react-router";
import { RouteConfig } from "../../app/config/config.ts";

const Auth = () => {
  const [isLoggin, setIsLoggin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      navigate(RouteConfig.main);
    }
  }, []);

  return (
    <div>
      {isLoggin ? <Login /> : <Register />}

      <h3>{isLoggin ? "Maybe register?" : "You have account?"}</h3>
      <Button onClick={() => setIsLoggin(!isLoggin)}>
        {isLoggin ? "register" : "Login"}
      </Button>
    </div>
  );
};

export { Auth };
