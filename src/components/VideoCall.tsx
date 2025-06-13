import { useLocaleVideo } from "./hooks/useLocaleVideo.ts";
import { useWebsocketPeerConnection } from "./hooks/useWebsocketPeerConnection.ts";
import { useState } from "react";

interface VideoCallProps {
  userId: string;
  wsUrl: string;
}

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const VideoCall = ({ userId, wsUrl }: VideoCallProps) => {
  const [connection, setConnection] = useState(false);

  const { localStream, localStreamRef, localVideoRef } = useLocaleVideo({
    connection,
  });

  const { remoteStreams, connectedUsers, disconnect, wsRef } =
    useWebsocketPeerConnection({
      wsUrl,
      userId,
      configurationPeer: configuration,
      localStreamRef,
      localStream,
      connection,
      setConnection,
    });

  // const { messages } = useChat({ connection });

  const handleConnection = () => {
    setConnection(true);
  };

  const handleDisconnect = () => {
    disconnect();
    setConnection(false);
  };

  return (
    <div className={"flex justify-center items-center flex-col h-full"}>
      {localStreamRef.current && wsRef?.current?.readyState !== 3 && (
        <div className={"bg-white p-[10px] mb-4"}>
          Connected users: {connectedUsers.size + 1}
        </div>
      )}
      <button
        className={"mb-4"}
        onClick={connection ? handleDisconnect : handleConnection}
      >
        {connection ? "Отключиться от чата" : "Подключиться к чату"}
      </button>
      {connection && (
        <div className={"text-white flex flex-col "}>
          <span className={"mb-2 text-[10px]"}>You ({userId})</span>
          {localStreamRef.current && wsRef?.current?.readyState !== 3 ? (
            <video
              width={200}
              height={200}
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
            />
          ) : (
            <span>loading...</span>
          )}
        </div>
      )}

      {Array.from(remoteStreams.entries()).map(([remoteUserId, stream]) => (
        <div key={remoteUserId}>
          <div>
            <span>{remoteUserId}</span>
            <video
              ref={(el) => {
                if (el && stream) {
                  el.srcObject = stream;
                }
              }}
              autoPlay
              playsInline
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default VideoCall;
