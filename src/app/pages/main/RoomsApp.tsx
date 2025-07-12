import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoom, getProfile, getRooms } from "../../../api/api.ts";
import { useFormik } from "formik";
import { RouteConfig } from "../../config/config.ts";
import { Button, Frame, Hourglass, TextInput } from "react95";
import { WindowCustom } from "../../../components/ui/Window/Window.tsx";
import { Rsrcmtr100 } from "@react95/icons";
import { AppLayout } from "../../../components/ui/AppLayout/AppLayout.tsx";

const RoomsApp = () => {
  const [isOpen, setIsOpen] = useState(false);

  const navigate = useNavigate();

  const queryCLient = useQueryClient();

  const { mutateAsync } = useMutation({
    mutationFn: createRoom,
  });
  const { data } = useQuery({
    queryKey: ["user"],
    queryFn: getProfile,
  });
  const { data: rooms, isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: getRooms,
  });

  const handleSubmit = async (values: { name: string }) => {
    await mutateAsync(values.name);
    await queryCLient.invalidateQueries({ queryKey: ["rooms"] });
  };

  const formik = useFormik({
    initialValues: { name: "" },
    onSubmit: handleSubmit,
    validate: (values) => {
      const errors: { name?: string } = {};
      if (!values.name) {
        errors.name = "Required";
      }

      return errors;
    },
  });

  const handleConnectToRoom = (id: string) => {
    navigate(RouteConfig.room + "/" + id);
  };

  return (
    <>
      <AppLayout
        title={"RoomsApp"}
        children={
          <Button variant="raised" size="lg" onClick={() => setIsOpen(true)}>
            <Rsrcmtr100 variant="32x32_4" style={{ width: 32, height: 32 }} />
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
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h2>{data?.name}</h2>
            <form
              style={{
                display: "flex",
                gap: "5px",
                flexDirection: "column",
                marginTop: "50px",
              }}
              onSubmit={formik.handleSubmit}
            >
              <h2 style={{ color: "white" }}>Name Room</h2>
              <TextInput
                id={"name"}
                name={"name"}
                type={"text"}
                onChange={formik.handleChange}
                value={formik.values.name}
              />
              <Button type={"submit"}>CREATE ROOM👨‍💻</Button>
            </form>

            {rooms &&
              Boolean(rooms?.length) &&
              rooms.map((room) => (
                <Frame
                  variant={"outside"}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <Frame style={{ width: "150px" }} variant={"well"}>
                    {room.name}
                  </Frame>
                  <Button
                    onClick={() => handleConnectToRoom(room.id)}
                    variant={"default"}
                  >
                    Connect
                  </Button>
                </Frame>
              ))}
            {isLoading && <Hourglass />}
          </div>
        }
      />
    </>
  );
};

export { RoomsApp };
