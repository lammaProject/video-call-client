import { RoomsApp } from "./RoomsApp.tsx";
import { FriendsApp } from "./FriendsApp.tsx";

const HomePanel = () => {
  return (
    <div style={{ display: "flex", gap: "20px" }}>
      <RoomsApp />
      <FriendsApp />
    </div>
  );
};

export { HomePanel };
