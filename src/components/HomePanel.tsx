import { Button, Frame, TextInput, Hourglass } from "react95";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoom, getProfile, getRooms } from "../api/api.ts";
import { WindowCustom } from "./ui/Window/Window.tsx";
import { useState } from "react";
import { useFormik } from "formik";
import { useNavigate } from "react-router";
import { RouteConfig } from "../app/config/config.ts";

const HomePanel = () => {
  const [isOpen, setIsOpen] = useState(false);

  const navigate = useNavigate();

  const queryCLient = useQueryClient();

  const { mutateAsync, isError: isErrorMutate } = useMutation({
    mutationFn: createRoom,
  });
  const { data, isError } = useQuery({
    queryKey: ["user"],
    queryFn: getProfile,
  });
  const {
    data: rooms,
    isError: isRoomsError,
    isLoading,
  } = useQuery({
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
      <WindowCustom
        headerText={"Main Page"}
        contentText={isError || isErrorMutate || isRoomsError ? "Error" : ""}
        isOpen={isError ?? isOpen ?? isErrorMutate ?? isRoomsError}
        setIsOpen={setIsOpen}
      />
    </div>
  );
};

export { HomePanel };
