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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localStreamRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  // Храним peer connections для каждого пользователя
  const peerConnectionsRef = useRef<{ [key: string]: RTCPeerConnection }>({});

  // Получение локального потока и подключение к серверу
  useEffect(() => {
    if (connection) {
      const connectToServer = async () => {
        try {
          // Инициализируем соединение при подключении
          socketRef.current = new WebSocket(
            `wss://video-chat-server-production.up.railway.app/ws?id=${userId}`,
          );

          socketRef.current.onopen = () => {
            console.log("Подключено к серверу");
          };

          socketRef.current.onmessage = async (event) => {
            try {
              const data = JSON.parse(event.data);
              console.log("Получено сообщение:", data);

              if (data.type === "register") {
                const clients = Object.keys(data.clients || {});
                setChatClients(clients);
                setChatMessages(data.messages || []);
              }

              if (data.type === "chat") {
                setChatMessages(data.messages || []);
              }

              if (data.type === "videochat") {
                const peerData = data?.data || {};
                const remoteUserId = data?.userId;

                if (!remoteUserId) {
                  console.error("Получено видео-сообщение без userId");
                  return;
                }

                console.log(
                  `Получены данные видеочата от ${remoteUserId}:`,
                  peerData,
                );

                // Обрабатываем сообщение только если у нас включено видео
                if (!isVideoChat || !localStream) {
                  console.log("Видео не активно, игнорируем сообщение");
                  return;
                }

                // Создаем peer connection для этого пользователя, если еще не создано
                if (!peerConnectionsRef.current[remoteUserId]) {
                  console.log(`Создаем новое соединение для ${remoteUserId}`);
                  peerConnectionsRef.current[remoteUserId] =
                    createPeerConnection(localStream, remoteUserId);
                }

                const peerConnection = peerConnectionsRef.current[remoteUserId];

                try {
                  // Обрабатываем offer
                  if (peerData.offer) {
                    console.log(
                      `Получено предложение от ${remoteUserId}:`,
                      peerData.offer,
                    );

                    await peerConnection.setRemoteDescription(
                      new RTCSessionDescription(peerData.offer),
                    );

                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    console.log(
                      `Отправляем ответ для ${remoteUserId}:`,
                      answer,
                    );
                    socketRef.current?.send(
                      JSON.stringify({
                        type: "videochat",
                        data: { answer: peerConnection.localDescription },
                        userId: userId,
                      }),
                    );
                  }

                  // Обрабатываем answer
                  if (peerData.answer) {
                    console.log(
                      `Получен ответ от ${remoteUserId}:`,
                      peerData.answer,
                    );

                    if (peerConnection.signalingState !== "stable") {
                      await peerConnection.setRemoteDescription(
                        new RTCSessionDescription(peerData.answer),
                      );
                    }
                  }

                  // Обрабатываем ICE кандидатов
                  if (peerData.iceCandidate) {
                    console.log(
                      `Получен ICE кандидат от ${remoteUserId}:`,
                      peerData.iceCandidate,
                    );

                    await peerConnection.addIceCandidate(
                      new RTCIceCandidate(peerData.iceCandidate),
                    );
                  }
                } catch (error) {
                  console.error(
                    `Ошибка при обработке WebRTC сообщения от ${remoteUserId}:`,
                    error,
                  );
                }
              }
            } catch (error) {
              console.error("Ошибка при обработке сообщения:", error);
            }
          };

          socketRef.current.onerror = (error) => {
            console.error("WebSocket ошибка:", error);
          };

          socketRef.current.onclose = (event) => {
            console.log("WebSocket закрыт:", event);
          };
        } catch (error) {
          console.error("Ошибка подключения:", error);
        }
      };

      void connectToServer();
    }

    return () => {
      // Очистка при размонтировании
      if (socketRef.current) {
        socketRef.current.close();
      }

      // Останавливаем все треки при размонтировании
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      // Закрываем все peer connections
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.close();
      });
      peerConnectionsRef.current = {};
    };
  }, [connection, isVideoChat, localStream]);

  // Эффект для инициализации соединений с существующими клиентами при включении видео
  useEffect(() => {
    if (
      isVideoChat &&
      localStream &&
      socketRef.current &&
      chatClients.length > 0
    ) {
      // Инициируем соединения со всеми клиентами, кроме себя
      const initConnections = async () => {
        for (const clientId of chatClients) {
          if (clientId !== userId && !peerConnectionsRef.current[clientId]) {
            console.log(`Инициируем соединение с ${clientId}`);

            const peerConnection = createPeerConnection(localStream, clientId);
            peerConnectionsRef.current[clientId] = peerConnection;

            try {
              // Создаем и отправляем предложение
              const offer = await peerConnection.createOffer();
              await peerConnection.setLocalDescription(offer);

              console.log(`Отправляем предложение для ${clientId}:`, offer);
              socketRef.current?.send(
                JSON.stringify({
                  type: "videochat",
                  data: { offer: peerConnection.localDescription },
                  userId: userId,
                }),
              );
            } catch (err) {
              console.error(
                `Ошибка при создании предложения для ${clientId}:`,
                err,
              );
            }
          }
        }
      };

      initConnections();
    }
  }, [isVideoChat, localStream, chatClients]);

  // Создание peer connection
  const createPeerConnection = (stream: MediaStream, remoteUserId: string) => {
    console.log(`Создаем peer connection для ${remoteUserId}`);

    const peerConnection = new RTCPeerConnection(configuration);

    // Добавляем все треки из локального потока
    stream.getTracks().forEach((track) => {
      console.log(
        `Добавляем трек ${track.kind} в peer connection для ${remoteUserId}`,
      );
      peerConnection.addTrack(track, stream);
    });

    // Обработка входящих треков
    peerConnection.ontrack = (event) => {
      console.log(`Получен удаленный трек от ${remoteUserId}:`, event.streams);

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];

        console.log(`Добавляем удаленный поток от ${remoteUserId}`);
        setVideoClients((prev) => ({
          ...prev,
          [remoteUserId]: remoteStream,
        }));
      }
    };

    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(
          `Отправляем ICE кандидат для ${remoteUserId}:`,
          event.candidate,
        );
        socketRef.current?.send(
          JSON.stringify({
            type: "videochat",
            data: { iceCandidate: event.candidate },
            userId: userId,
          }),
        );
      }
    };

    // Логирование состояния соединения
    peerConnection.oniceconnectionstatechange = () => {
      console.log(
        `ICE Connection State для ${remoteUserId}:`,
        peerConnection.iceConnectionState,
      );

      // Если соединение разорвано, удаляем его
      if (
        peerConnection.iceConnectionState === "disconnected" ||
        peerConnection.iceConnectionState === "failed" ||
        peerConnection.iceConnectionState === "closed"
      ) {
        console.log(`Соединение с ${remoteUserId} закрыто`);

        // Удаляем видео клиента
        setVideoClients((prev) => {
          const newClients = { ...prev };
          delete newClients[remoteUserId];
          return newClients;
        });

        // Удаляем peer connection
        if (peerConnectionsRef.current[remoteUserId]) {
          peerConnectionsRef.current[remoteUserId].close();
          delete peerConnectionsRef.current[remoteUserId];
        }
      }
    };

    peerConnection.onsignalingstatechange = () => {
      console.log(
        `Signaling State для ${remoteUserId}:`,
        peerConnection.signalingState,
      );
    };

    return peerConnection;
  };

  // Инициализация камеры
  const initializeCamera = async () => {
    try {
      // Проверяем поддержку getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Ваш браузер не поддерживает API для доступа к камере");
      }

      // Проверяем доступные устройства
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput",
      );

      if (videoDevices.length === 0) {
        throw new Error("Видеоустройства не обнаружены!");
      }

      console.log("Найдены видеоустройства:", videoDevices);

      // Запрашиваем доступ к камере
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
        console.log("Поток привязан к видео элементу");
      }

      return stream;
    } catch (error) {
      console.error("Ошибка при инициализации камеры:", error);
      return null;
    }
  };

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

    // Останавливаем видео при отключении
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Закрываем WebSocket
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    // Закрываем все peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current = {};

    setIsVideoChat(false);
    setVideoClients({});
  };

  const handleVideoChat = async () => {
    if (isVideoChat) {
      // Выключаем видео
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          console.log("Останавливаем трек:", track);
          track.stop();
        });
        setLocalStream(null);
      }

      if (localStreamRef.current) {
        localStreamRef.current.srcObject = null;
      }

      // Закрываем все peer connections
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.close();
      });
      peerConnectionsRef.current = {};

      setVideoClients({});
      setIsVideoChat(false);
      return;
    }

    // Включаем видео
    const stream = await initializeCamera();
    if (!stream) return;

    // Сохраняем поток в состоянии
    setLocalStream(stream);
    setIsVideoChat(true);

    // Соединения с другими клиентами будут инициализированы в useEffect
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Вы: {userId}</h2>

      {connection && (
        <>
          <h3>Локальное видео</h3>
          <video
            ref={localStreamRef}
            autoPlay
            playsInline
            muted // Важно для локального видео
            width={400}
            height={300}
            style={{ border: "1px solid #ccc", backgroundColor: "#f0f0f0" }}
          />

          <h3>Участники: {chatClients.length}</h3>
          <ul>
            {chatClients.map((user) => (
              <li key={user}>{user === userId ? `${user} (вы)` : user}</li>
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
                      console.log(`Привязываем поток к видео для ${clientId}`);
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
              backgroundColor: isVideoChat ? "#f44336" : "#4CAF50",
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
                    padding: "5px",
                    backgroundColor:
                      msg.from === userId ? "#e3f2fd" : "transparent",
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
          backgroundColor: connection ? "#f44336" : "#2196F3",
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
    </div>
  );
};

export default VideoCall;
