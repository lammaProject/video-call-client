import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getUser } from "../../api/api.ts";
import { Avatar, Hourglass } from "react95";

const User = () => {
  const { name } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: () => getUser(String(name)),
  });

  if (isLoading) return <Hourglass />;

  return (
    <div style={{ display: "flex", gap: "20px" }}>
      <Avatar size={200} />
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <h1 style={{ fontSize: "50px" }}>{data?.name}</h1>
      </div>
    </div>
  );
};

export { User };
