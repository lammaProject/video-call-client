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
            "ws://video-chat-server-production.up.railway.app/ws?id=" + userId, // Убрали "4" перед userId
          );

          socketRef.current.onopen = () => {
            console.log("Подключено к серверу");
          };

          socketRef.current.onmessage = async (event) => {
            try {
              const data: AnswerType = JSON.parse(event.data);
              console.log("Получено сообщение:", data);

              if (data.type === "register") {
                const clients = Object.keys(data.clients || {});
                console.log("Получен список клиентов:", clients);
                setChatClients(clients);
                setChatMessages(data.messages || []);
              }

              if (data.type === "chat") {
                setChatMessages(data.messages || []);
              }

              if (data.type === "videochat") {
                const peerData: any = data?.data;
                console.log("Получены данные видеочата:", peerData);

                if (!peerRef.current) {
                  console.error(
                    "Получено видео-сообщение, но соединение не инициализировано",
                  );
                  return;
                }

                if (peerData.offer) {
                  console.log("Получено предложение:", peerData.offer);
                  await peerRef.current.setRemoteDescription(
                    new RTCSessionDescription(peerData.offer),
                  );

                  const answer = await peerRef.current.createAnswer();
                  await peerRef.current.setLocalDescription(answer);

                  console.log("Отправляем ответ:", answer);
                  socketRef.current?.send(
                    JSON.stringify({
                      type: "videochat",
                      data: { answer: peerRef.current.localDescription },
                      userId: userId,
                    }),
                  );
                }

                if (peerData.answer) {
                  console.log("Получен ответ:", peerData.answer);
                  await peerRef.current.setRemoteDescription(
                    new RTCSessionDescription(peerData.answer),
                  );
                }

                if (peerData.iceCandidate) {
                  console.log("Получен ICE кандидат:", peerData.iceCandidate);
                  await peerRef.current.addIceCandidate(
                    new RTCIceCandidate(peerData.iceCandidate),
                  );
                }
              }
            } catch (error) {
              console.error("Ошибка при обработке сообщения:", error);
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
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    // Останавливаем видео при отключении
    if (localStreamRef.current && localStreamRef.current.srcObject) {
      const stream = localStreamRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      localStreamRef.current.srcObject = null;
    }

    // Закрываем peer connection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    setIsVideoChat(false);
    setVideoClients({});
  };

  const handleVideoChat = async () => {
    if (isVideoChat) {
      // Выключаем видео
      if (localStreamRef.current && localStreamRef.current.srcObject) {
        const stream = localStreamRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          console.log("Останавливаем трек:", track);
          track.stop();
        });
        localStreamRef.current.srcObject = null;
      }

      // Закрываем peer connection
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }

      setIsVideoChat(false);
      return;
    }

    try {
      // Проверяем доступные устройства
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput",
      );

      if (videoDevices.length === 0) {
        alert("Видеоустройства не обнаружены!");
        return;
      }

      // Получаем доступ к камере
      console.log("Запрашиваем доступ к медиа...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      console.log("Доступ получен, stream:", stream);
      console.log("Stream active:", stream.active);
      console.log("Video tracks:", stream.getVideoTracks());

      // Привязываем поток к видео элементу
      if (localStreamRef.current) {
        localStreamRef.current.srcObject = stream;

        // Добавляем обработчик для проверки загрузки метаданных
        localStreamRef.current.onloadedmetadata = () => {
          console.log("Метаданные видео загружены");
          if (localStreamRef.current) {
            localStreamRef.current
              .play()
              .catch((e) => console.error("Ошибка воспроизведения:", e));
          }
        };
      }

      // Инициализируем WebRTC только если WebSocket соединение активно
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        const peerConnection = new RTCPeerConnection(configuration);
        peerRef.current = peerConnection;

        // Добавляем все треки из локального потока в peer connection
        stream.getTracks().forEach((track) => {
          console.log("Добавляем трек в peer connection:", track);
          peerConnection.addTrack(track, stream);
        });

        // Обработка входящих треков
        peerConnection.ontrack = (event) => {
          console.log("Получен удаленный трек:", event);
          const remoteStream = event.streams[0];
          const streamId = Date.now() + Math.random().toString(36).substring(7);

          console.log("Добавляем удаленный поток:", streamId);
          setVideoClients((prev) => ({
            ...prev,
            [streamId]: remoteStream,
          }));
        };

        // Обработка ICE кандидатов
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Отправка ICE кандидата:", event.candidate);
            socketRef.current?.send(
              JSON.stringify({
                type: "videochat",
                data: { iceCandidate: event.candidate },
                userId,
              }),
            );
          }
        };

        // Логирование состояния соединения
        peerConnection.oniceconnectionstatechange = () => {
          console.log(
            "ICE Connection State:",
            peerConnection.iceConnectionState,
          );
        };

        peerConnection.onsignalingstatechange = () => {
          console.log("Signaling State:", peerConnection.signalingState);
        };

        // Создание и отправка предложения
        try {
          console.log("Создаем предложение");
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          console.log("Отправляем предложение:", offer);
          socketRef.current.send(
            JSON.stringify({
              type: "videochat",
              data: { offer: peerConnection.localDescription },
              userId,
            }),
          );
        } catch (err) {
          console.error("Ошибка при создании предложения:", err);
        }
      } else {
        console.error("WebSocket соединение не активно");
      }

      setIsVideoChat(true);
    } catch (error) {
      console.error("Ошибка при инициализации видеочата:", error);
    }
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
              muted // Важно для локального видео
              width={400}
              height={300}
              style={{ border: "1px solid #ccc", backgroundColor: "#f0f0f0" }}
            />
          )}

          <h3>Участники: {chatClients.length}</h3>
          <ul>
            {chatClients.map((user) => (
              <li key={user}>
                {user} {user === userId ? "(вы)" : ""}
              </li>
            ))}
          </ul>

          <h3>Видео участников: {Object.keys(videoClients).length}</h3>
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
                      console.log("Привязываем поток к видео элементу");
                      el.srcObject = stream;
                    }
                  }}
                  poster={image}
                  style={{ border: "1px solid #ccc" }}
                />
                <p>ID: {clientId}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleVideoChat}
            style={{
              padding: "10px 20px",
              backgroundColor: isVideoChat ? "#e74c3c" : "#2ecc71",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "16px",
              marginTop: "10px",
            }}
          >
            {isVideoChat ? "Отключить видео" : "Подключить видео"}
          </button>
        </>
      )}

      {connection && chatMessages && Boolean(chatMessages?.length) && (
        <div>
          <div style={{ marginTop: "20px" }}>
            <h4>Чат:</h4>
            <div
              style={{
                maxHeight: "200px",
                overflowY: "auto",
                border: "1px solid #ddd",
                padding: "10px",
                borderRadius: "4px",
              }}
            >
              {chatMessages.map((msg, idx) => (
                <p
                  key={idx}
                  style={{
                    margin: "5px 0",
                    backgroundColor:
                      msg.from === userId ? "#e3f2fd" : "transparent",
                    padding: "5px",
                    borderRadius: "4px",
                  }}
                >
                  <strong>{msg.from}:</strong> {msg.text}
                </p>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
            <input
              value={textMessage}
              onChange={(e) => setTextMessage(e.target.value)}
              placeholder="Введите сообщение"
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ddd",
              }}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <button
              disabled={socketRef.current?.readyState === 3}
              onClick={sendMessage}
              style={{
                padding: "8px 16px",
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Отправить
            </button>
          </div>
        </div>
      )}

      <button
        onClick={connection ? handleDisconnect : handleConnect}
        style={{
          padding: "10px 20px",
          backgroundColor: connection ? "#e74c3c" : "#2196F3",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "16px",
          marginTop: "20px",
        }}
      >
        {connection ? "Отключиться" : "Подключиться"}
      </button>

      {/* Отладочная информация */}
      <div
        style={{
          marginTop: "20px",
          padding: "10px",
          border: "1px solid #ddd",
          borderRadius: "4px",
        }}
      >
        <h4>Отладочная информация:</h4>
        <p>
          WebSocket статус:{" "}
          {socketRef.current
            ? ["Соединение...", "Открыто", "Закрывается", "Закрыто"][
                socketRef.current.readyState
              ]
            : "Не инициализирован"}
        </p>
        <p>Клиенты: {JSON.stringify(chatClients)}</p>
        <p>Видео клиенты: {Object.keys(videoClients).length}</p>
        <p>Видео активно: {isVideoChat ? "Да" : "Нет"}</p>
      </div>
    </div>
  );
};

export default VideoCall;
