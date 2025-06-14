import { useLocaleVideo } from "../hooks/useLocaleVideo.ts";
import { useWebsocketPeerConnection } from "../hooks/useWebsocketPeerConnection.ts";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "../../api/api.ts";

const Room = () => {
  const { roomId } = useParams();
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });
  const { localStream, localStreamRef, localVideoRef } = useLocaleVideo({
    connection: true,
  });
  console.log(data);
  const { remoteStreams, connectedUsers, wsRef } = useWebsocketPeerConnection({
    roomId: String(roomId),
    connection: !!data,
    userId: String(data?.id),
    localStream,
    localStreamRef,
  });

  return (
    <div>
      Connected users: {connectedUsers.size + 1}
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

export { Room };
