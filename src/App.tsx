import "./App.css";
import VideoCall from "./components/VideoCall.tsx";

const App = () => {
  const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
  const wsUrl = "ws://192.168.0.18:8080/ws";
  return (
    <div>
      <VideoCall userId={userId} wsUrl={wsUrl} />
    </div>
  );
};

export default App;
