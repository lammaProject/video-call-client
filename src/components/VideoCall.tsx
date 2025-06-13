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

  const localStreamRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<{ [key: string]: HTMLVideoElement }>({});
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);

  // Получение локального потока
  useEffect(() => {
    if (connection) {
      const getStream = async () => {
        try {
          // Инициализируем соединение при подключении
          socketRef.current = new WebSocket(
            "ws://192.168.0.18:8080/ws?id=" + userId,
          );
          socketRef.current.onopen = () => {
            console.log("Подключено к серверу");
          };

          socketRef.current.onmessage = async (event) => {
            const data: AnswerType = JSON.parse(event.data);
            console.log(data);
            if (data.type === "register") {
              const clients = Object.keys(data.clients);
              setChatClients(clients);
              setChatMessages(data.messages);
            }

            if (data.type === "chat") {
              setChatMessages(data.messages);
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
  }, [connection, peerRef]);

  const sendMessage = () => {
    if (!textMessage.trim() || !socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({ to: "chat", text: textMessage, from: userId }),
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
