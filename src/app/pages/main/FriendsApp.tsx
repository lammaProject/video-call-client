import { useState } from "react";
import { AppLayout } from "../../../components/ui/AppLayout/AppLayout.tsx";
import { Avatar, Button, Frame } from "react95";
import { Mprserv121 } from "@react95/icons";
import { WindowCustom } from "../../../components/ui/Window/Window.tsx";
import { useQuery } from "@tanstack/react-query";
import { getUsers } from "../../../api/api.ts";
import { useNavigate } from "react-router";
import { RouteConfig } from "../../config/config.ts";

const FriendsApp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["friends"],
    queryFn: getUsers,
  });

  const handleCheckProfile = (name: string) => {
    navigate(RouteConfig.user + "/" + name);
  };

  return (
    <>
      <AppLayout
        title={"FriendsApp"}
        children={
          <Button variant="raised" size="lg" onClick={() => setIsOpen(true)}>
            <Mprserv121 variant="48x48_4" />
          </Button>
        }
      />

      <WindowCustom
        style={{
          position: "fixed",
          top: "0",
          bottom: "10%",
          left: 0,
          right: 0,
        }}
        headerText={"RoomsApp"}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        children={
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {data &&
              data?.map((user) => (
                <Frame
                  style={{
                    display: "flex",
                    gap: "10px",
                    width: "200px",
                    height: "150px",
                    flexDirection: "column",
                    padding: "10px",
                  }}
                  key={user.id}
                >
                  <Avatar>{user.name.slice(0, 2)}</Avatar>
                  <p>{user.name}</p>
                  <Button>Add</Button>
                  <Button
                    variant={"thin"}
                    onClick={() => handleCheckProfile(user.name)}
                  >
                    Profile
                  </Button>
                </Frame>
              ))}
          </div>
        }
      />
    </>
  );
};

export { FriendsApp };
