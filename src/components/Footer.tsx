import {
  AppBar,
  Button,
  MenuList,
  MenuListItem,
  Separator,
  Toolbar,
} from "react95";
import { useState } from "react";
import { useNavigate } from "react-router";
import { RouteConfig } from "../app/config/config.ts";

const Footer = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleExit = () => {
    localStorage.removeItem("token");
    navigate(RouteConfig.auth);
  };

  return (
    <AppBar style={{ top: "unset", bottom: 0 }}>
      <Toolbar style={{ justifyContent: "space-between" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <Button
            onClick={() => setOpen(!open)}
            active={open}
            style={{ fontWeight: "bold" }}
          >
            Menu
          </Button>
          {open && (
            <MenuList
              style={{
                position: "absolute",
                left: "0",
                bottom: "100%",
              }}
              onClick={() => setOpen(false)}
            >
              <MenuListItem
                onClick={
                  localStorage.getItem("token")
                    ? () => navigate(RouteConfig.profile)
                    : () => navigate(RouteConfig.auth)
                }
              >
                {localStorage.getItem("token") ? "Profile" : "Login"}
              </MenuListItem>
              <Separator />
              {localStorage.getItem("token") && (
                <MenuListItem onClick={handleExit}>Logout</MenuListItem>
              )}
            </MenuList>
          )}
        </div>
      </Toolbar>
    </AppBar>
  );
};

export { Footer };
