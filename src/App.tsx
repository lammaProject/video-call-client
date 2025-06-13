import "./App.css";
import VideoCall from "./components/VideoCall.tsx";

const App = () => {
  const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
  const wsUrl = "ws://video-chat-server-production.up.railway.app/ws";
  return (
    <div>
      <VideoCall userId={userId} wsUrl={wsUrl} />
    </div>
  );
};

export default App;
