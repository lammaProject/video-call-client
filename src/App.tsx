import VideoCall from "./components/VideoCall.tsx";

const App = () => {
  const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
  const wsUrl = "ws://192.168.0.18:8080/ws";
  return (
    <main className={"bg-[#0C0032] h-full flex flex-col"}>
      <VideoCall userId={userId} wsUrl={wsUrl} />
      <a
        href={"https://t.me/lammaProject"}
        target={"_blank"}
        className={
          "bg-[#3500D3] p-2 cursor-pointer w-fit ml-auto hover:bg-[#0C0032] hover:text-white transition-all delay-75"
        }
      >
        lamma
      </a>
    </main>
  );
};

export default App;
