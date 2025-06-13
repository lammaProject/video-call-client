import { useLocaleVideo } from "./hooks/useLocaleVideo.ts";
import { useWebsocketPeerConnection } from "./hooks/useWebsocketPeerConnection.ts";

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
  const { localStream, localStreamRef, localVideoRef } = useLocaleVideo();
  const { remoteStreams, connectedUsers } = useWebsocketPeerConnection({
    wsUrl,
    userId,
    configurationPeer: configuration,
    localStreamRef,
    localStream,
  });

  if (!localStreamRef.current) {
    return (
      <div>
        <div style={{ color: "white" }}>Initializing camera...</div>
      </div>
    );
  }

  return (
    <div>
      <div>Connected users: {connectedUsers.size + 1}</div>

      {/* Локальное видео */}
      <div>
        <div>
          <span>You ({userId})</span>
          <video ref={localVideoRef} autoPlay playsInline muted />
        </div>
      </div>

      {/* Удаленные видео */}
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
