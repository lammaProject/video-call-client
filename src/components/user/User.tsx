import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getUser } from "../../api/api.ts";

const User = () => {
  const { name } = useParams();

  const { data } = useQuery({
    queryKey: ["user"],
    queryFn: () => getUser(String(name)),
  });

  return <div>{data}</div>;
};

export { User };
