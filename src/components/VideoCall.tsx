import { useEffect, useRef, useState } from "react";
import image from "../assets/react.svg";
import type { AnswerType } from "./type.ts";

const configuration = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

const userId = Math.random().toString(36).slice(-6);

const VideoCall = () => {
  const [connection, setConnection] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<AnswerType["messages"]>([]);
  const [textMessage, setTextMessage] = useState("");
  const [isVideoChat, setIsVideoChat] = useState(false);
  const [chatClients, setChatClients] = useState<Array<string>>([]);
  const [videoClients, setVideoClients] = useState<{
    [key: string]: MediaStream;
  }>({});

  const localStreamRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);

  // Получение локального потока
  useEffect(() => {
    if (connection) {
      const getStream = async () => {
        try {
          // Инициализируем соединение при подключении
          socketRef.current = new WebSocket(
            "wss://video-chat-server-production.up.railway.app/ws?id=" + userId,
          );

          socketRef.current.onopen = () => {
            console.log("Подключено к серверу");
          };

          socketRef.current.onmessage = async (event) => {
            const data: AnswerType = JSON.parse(event.data);
            if (data.type === "register") {
              const clients = Object.keys(data.clients);
              setChatClients(clients);
              setChatMessages(data.messages);
            }

            if (data.type === "chat") {
              setChatMessages(data.messages);
            }

            if (data.type === "videochat") {
              const peerData: any = data?.data;
              console.log(peerData);
              if (!peerRef.current) {
                console.error(
                  "Получено видео-сообщение, но соединение не инициализировано",
                );
                return;
              }

              if (peerData.offer) {
                peerRef.current
                  .setRemoteDescription(
                    new RTCSessionDescription(peerData.offer),
                  )
                  .then(() => peerRef.current!.createAnswer())
                  .then((answer) =>
                    peerRef.current!.setLocalDescription(answer),
                  )
                  .then(() => {
                    socketRef.current?.send(
                      JSON.stringify({
                        type: "videochat",
                        answer: peerRef.current!.localDescription,
                        userId: userId,
                      }),
                    );
                  });
              }

              if (peerData.answer) {
                peerRef.current.setRemoteDescription(
                  new RTCSessionDescription(peerData.answer),
                );
              }

              if (peerData.iceCandidate) {
                peerRef.current.addIceCandidate(
                  new RTCIceCandidate(peerData.iceCandidate),
                );
              }
            }
          };
        } catch (error) {
          console.error("Ошибка доступа к медиа:", error);
        }
      };

      void getStream();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connection]);

  const sendMessage = () => {
    if (!textMessage.trim() || !socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({
        type: "chat",
        to: "chat",
        text: textMessage,
        from: userId,
      }),
    );
    setTextMessage("");
  };

  const handleConnect = () => {
    setConnection(true);
  };

  const handleDisconnect = () => {
    setConnection(false);
    (socketRef.current as WebSocket).close();
  };

  const handleVideoChat = async () => {
    if (isVideoChat) {
      setIsVideoChat(false);
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!devices) {
      return alert("Девайсы не найдены");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    if (localStreamRef.current) {
      localStreamRef.current.srcObject = stream;
    }

    if (socketRef.current) {
      const peerConnection = new RTCPeerConnection(configuration);
      peerRef.current = peerConnection;

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        const streamId = Date.now() + Math.random().toString(36).substring(7);
        setVideoClients((prev) => ({
          ...prev,
          [streamId]: remoteStream,
        }));
      };
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.send(
            JSON.stringify({
              type: "videochat",
              "ice-candidate": event.candidate,
            }),
          );
        }
      };

      peerConnection
        .createOffer()
        .then((offer) => peerConnection.setLocalDescription(offer))
        .then(() => {
          socketRef.current?.send(
            JSON.stringify({
              type: "videochat",
              offer: peerConnection.localDescription,
            }),
          );
        });
    }

    setIsVideoChat(true);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Вы: {userId}</h2>

      {connection && (
        <>
          <h3>Локальное видео</h3>
          {isVideoChat && (
            <video
              ref={localStreamRef}
              autoPlay
              playsInline
              width={400}
              height={300}
              poster={image}
            />
          )}
          <h3>Участники:</h3>
          <ul>
            {chatClients.map((user) => (
              <li key={user}>{user}</li>
            ))}
          </ul>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {Object.entries(videoClients).map(([clientId, stream]) => (
              <div key={clientId} style={{ margin: "10px" }}>
                <video
                  autoPlay
                  playsInline
                  width={400}
                  height={300}
                  ref={(el) => {
                    if (el && el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                  }}
                  poster={image}
                />
                <p>ID: {clientId}</p>
              </div>
            ))}
            {/*{connectedUsers.map((id) => (*/}
            {/*  <div key={id}>*/}
            {/*    <video*/}
            {/*      ref={(el) => {*/}
            {/*        if (el && !remoteVideosRef.current[id]) {*/}
            {/*          remoteVideosRef.current[id] = el;*/}
            {/*        }*/}
            {/*      }}*/}
            {/*      autoPlay*/}
            {/*      playsInline*/}
            {/*      width={400}*/}
            {/*      height={300}*/}
            {/*      poster={image}*/}
            {/*    />*/}
            {/*    <p>ID: {id}</p>*/}
            {/*  </div>*/}
            {/*))}*/}
          </div>

          <button onClick={handleVideoChat}>
            {isVideoChat ? "Отключить видео" : "Подключить видео"}
          </button>
        </>
      )}

      {connection && chatMessages && Boolean(chatMessages?.length) && (
        <div>
          <div style={{ marginTop: "20px" }}>
            <h4>Чат:</h4>
            {chatMessages.map((msg, idx) => (
              <p key={idx}>
                <strong>{msg.from}:</strong> {msg.text}
              </p>
            ))}
          </div>

          <div style={{ marginTop: "20px" }}>
            <input
              value={textMessage}
              onChange={(e) => setTextMessage(e.target.value)}
              placeholder="Введите сообщение"
            />
            <button
              disabled={socketRef.current?.readyState === 3}
              onClick={sendMessage}
            >
              Отправить
            </button>
          </div>
        </div>
      )}

      <button onClick={connection ? handleDisconnect : handleConnect}>
        {connection ? "Отключиться" : "Подключиться"}
      </button>
    </div>
  );
};

export default VideoCall;
