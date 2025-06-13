import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface Props {
  wsUrl: string;
  userId: string;
  localStream: MediaStream | null;
  localStreamRef: RefObject<MediaStream | null>;
  configurationPeer: { iceServers: { urls: string }[] };
  connection: boolean;
  setConnection: (connection: boolean) => void;
}

const useWebsocketPeerConnection = ({
  wsUrl,
  userId,
  localStream,
  localStreamRef,
  configurationPeer,
  connection,
}: Props) => {
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [connectedUsers, setConnectedUsers] = useState(new Set());
  const peerConnections = useRef(new Map());

  const wsRef = useRef<WebSocket>(null);

  useEffect(() => {
    if ((!localStream && !localStreamRef.current) || !connection) return;

    const websocket = new WebSocket(`${wsUrl}?id=${userId}`);
    wsRef.current = websocket;
    websocket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("Received message:", data);

      switch (data.type) {
        case "register":
          if (data.clients) {
            for (const clientId of Object.keys(data.clients)) {
              if (clientId !== userId && data.clients[clientId]) {
                console.log("Creating offer for existing user:", clientId);
                setConnectedUsers((prev) => new Set([...prev, clientId]));
                await createPeerConnection(clientId, true);
              }
            }
          }
          break;

        case "new-user":
          const newUserId = Object.keys(data.clients).find(
            (id) => data.clients[id],
          );
          if (newUserId && newUserId !== userId) {
            setConnectedUsers((prev) => new Set([...prev, newUserId]));
          }
          break;

        case "user-left":
          const leftUserId = Object.keys(data.clients).find(
            (id) => !data.clients[id],
          );
          if (leftUserId) {
            handleUserLeft(leftUserId);
          }
          break;

        case "videochat":
          await handleVideoChatMessage(data.data);
          break;
      }
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected");
      cleanup();
    };

    return () => {
      websocket.close();
    };
  }, [localStream, connection]);

  const createPeerConnection = useCallback(
    async (remoteUserId: string, createOffer = false) => {
      console.log(
        `Creating peer connection for ${remoteUserId}, createOffer: ${createOffer}`,
      );

      if (peerConnections.current.has(remoteUserId)) {
        console.log("Peer connection already exists for", remoteUserId);
        return peerConnections.current.get(remoteUserId);
      }

      const pc = new RTCPeerConnection(configurationPeer);
      peerConnections.current.set(remoteUserId, pc);

      // Добавляем локальные треки
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log(
            `Adding ${track.kind} track to peer connection for ${remoteUserId}`,
          );
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Обработка входящих треков
      pc.ontrack = (event) => {
        console.log(`Received ${event.track.kind} track from ${remoteUserId}`);
        const [remoteStream] = event.streams;

        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(remoteUserId, remoteStream);
          return newMap;
        });
      };

      // Обработка ICE кандидатов
      pc.onicecandidate = (event) => {
        if (
          event.candidate &&
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN
        ) {
          console.log("Sending ICE candidate to", remoteUserId);
          wsRef.current.send(
            JSON.stringify({
              type: "videochat",
              iceCandidate: {
                candidate: event.candidate.candidate,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                sdpMid: event.candidate.sdpMid,
                usernameFragment: event.candidate.usernameFragment,
              },
              to: remoteUserId,
              from: userId,
            }),
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `ICE connection state with ${remoteUserId}: ${pc.iceConnectionState}`,
        );
      };

      pc.onconnectionstatechange = () => {
        console.log(
          `Connection state with ${remoteUserId}: ${pc.connectionState}`,
        );
      };

      // Создаем offer если нужно
      if (createOffer) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log("Sending offer to", remoteUserId);
            wsRef.current.send(
              JSON.stringify({
                type: "videochat",
                offer,
                to: remoteUserId,
                from: userId,
              }),
            );
          }
        } catch (error) {
          console.error("Error creating offer:", error);
        }
      }

      return pc;
    },
    [userId],
  );

  const handleUserLeft = (userId: string) => {
    console.log("User left:", userId);
    setConnectedUsers((prev) => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });

    // Закрываем peer connection
    const pc = peerConnections.current.get(userId);

    if (pc) {
      pc.close();
      peerConnections.current.delete(userId);
    }

    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
  };

  const cleanup = () => {
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    setRemoteStreams(new Map());
    setConnectedUsers(new Set());
  };

  const handleVideoChatMessage = async (data: any) => {
    const { from, offer, answer, iceCandidate } = data;

    if (offer) {
      const pc = await createPeerConnection(from, false);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answerDesc = await pc.createAnswer();
        await pc.setLocalDescription(answerDesc);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log("Sending answer to", from);
          wsRef.current.send(
            JSON.stringify({
              type: "videochat",
              answer: {
                type: answerDesc.type,
                sdp: answerDesc.sdp,
              },
              to: from,
              from: userId,
            }),
          );
        }
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    }

    if (answer) {
      console.log("Received answer from", from);
      // Получили answer
      const pc = peerConnections.current.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      }
    }

    if (iceCandidate) {
      console.log("Received ICE candidate from", from);
      // Получили ICE кандидата
      const pc = peerConnections.current.get(from);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: iceCandidate.candidate,
              sdpMLineIndex: iceCandidate.sdpMLineIndex,
              sdpMid: iceCandidate.sdpMid,
            }),
          );
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      cleanup();
    }
  };

  return { connectedUsers, remoteStreams, disconnect, wsRef };
};

export { useWebsocketPeerConnection };
