// @ts-nocheck

import { useEffect, useRef, useState } from "react";
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
  const localStream = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  // Изменяем на Map для хранения множественных соединений
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Функция создания peer connection для конкретного участника
  const createPeerConnection = (remoteUserId: string) => {
    console.log(`Создаем peer connection для ${remoteUserId}`);

    const peerConnection = new RTCPeerConnection(configuration);

    // Добавляем локальный поток
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        console.log(
          `Добавляем трек ${track.kind} в peer connection для ${remoteUserId}`,
        );
        peerConnection.addTrack(track, localStream.current!);
      });
    }

    // Обработка входящих треков
    peerConnection.ontrack = (event) => {
      console.log(`Получен удаленный трек от ${remoteUserId}:`, event);
      const remoteStream = event.streams[0];

      setVideoClients((prev) => ({
        ...prev,
        [remoteUserId]: remoteStream,
      }));
    };

    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log(`Отправка ICE кандидата для ${remoteUserId}`);
        socketRef.current.send(
          JSON.stringify({
            type: "videochat",
            data: {
              iceCandidate: event.candidate,
              targetUserId: remoteUserId,
            },
            userId,
          }),
        );
      }
    };

    // Логирование состояния
    peerConnection.oniceconnectionstatechange = () => {
      console.log(
        `ICE Connection State для ${remoteUserId}:`,
        peerConnection.iceConnectionState,
      );

      // Удаляем соединение если оно закрыто
      if (
        peerConnection.iceConnectionState === "disconnected" ||
        peerConnection.iceConnectionState === "failed"
      ) {
        peerConnections.current.delete(remoteUserId);
        setVideoClients((prev) => {
          const newClients = { ...prev };
          delete newClients[remoteUserId];
          return newClients;
        });
      }
    };

    peerConnections.current.set(remoteUserId, peerConnection);
    return peerConnection;
  };

  // Основной useEffect для WebSocket
  useEffect(() => {
    if (connection) {
      socketRef.current = new WebSocket(
        "wss://video-chat-server-production.up.railway.app/ws?id=" + userId,
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

            // Если видеочат активен, инициируем соединения с новыми клиентами
            if (isVideoChat && localStream.current) {
              for (const clientId of clients) {
                if (
                  clientId !== userId &&
                  !peerConnections.current.has(clientId)
                ) {
                  await initiateCall(clientId);
                }
              }
            }
          }

          if (data.type === "chat") {
            setChatMessages(data.messages || []);
          }

          if (data.type === "videochat") {
            const peerData: any = data?.data;
            const fromUserId = data.userId; // Предполагаем, что сервер передает ID отправителя

            console.log(
              `Получены данные видеочата от ${fromUserId}:`,
              peerData,
            );

            // Обработка offer
            if (peerData.offer && fromUserId) {
              await handleOffer(peerData.offer, fromUserId);
            }

            // Обработка answer
            if (peerData.answer && peerData.targetUserId === userId) {
              await handleAnswer(peerData.answer, fromUserId);
            }

            // Обработка ICE кандидата
            if (peerData.iceCandidate && peerData.targetUserId === userId) {
              await handleIceCandidate(peerData.iceCandidate, fromUserId);
            }
          }
        } catch (error) {
          console.error("Ошибка при обработке сообщения:", error);
        }
      };

      socketRef.current.onerror = (error) => {
        console.error("WebSocket ошибка:", error);
      };

      socketRef.current.onclose = () => {
        console.log("WebSocket закрыт");
      };
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connection, isVideoChat]); // Добавляем isVideoChat в зависимости

  // Инициирование звонка
  const initiateCall = async (remoteUserId: string) => {
    console.log(`Инициируем звонок с ${remoteUserId}`);

    const peerConnection = createPeerConnection(remoteUserId);

    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      if (socketRef.current) {
        socketRef.current.send(
          JSON.stringify({
            type: "videochat",
            data: {
              offer: peerConnection.localDescription,
              targetUserId: remoteUserId,
            },
            userId,
          }),
        );
      }
    } catch (error) {
      console.error(`Ошибка при создании offer для ${remoteUserId}:`, error);
    }
  };

  // Обработка входящего offer
  const handleOffer = async (
    offer: RTCSessionDescriptionInit,
    fromUserId: string,
  ) => {
    console.log(`Обработка offer от ${fromUserId}`);

    let peerConnection = peerConnections.current.get(fromUserId);

    if (!peerConnection) {
      peerConnection = createPeerConnection(fromUserId);
    }

    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer),
      );
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (socketRef.current) {
        socketRef.current.send(
          JSON.stringify({
            type: "videochat",
            data: {
              answer: peerConnection.localDescription,
              targetUserId: fromUserId,
            },
            userId,
          }),
        );
      }
    } catch (error) {
      console.error(`Ошибка при обработке offer от ${fromUserId}:`, error);
    }
  };

  // Обработка входящего answer
  const handleAnswer = async (
    answer: RTCSessionDescriptionInit,
    fromUserId: string,
  ) => {
    console.log(`Обработка answer от ${fromUserId}`);

    const peerConnection = peerConnections.current.get(fromUserId);

    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer),
        );
      } catch (error) {
        console.error(`Ошибка при обработке answer от ${fromUserId}:`, error);
      }
    }
  };

  // Обработка ICE кандидата
  const handleIceCandidate = async (
    candidate: RTCIceCandidateInit,
    fromUserId: string,
  ) => {
    const peerConnection = peerConnections.current.get(fromUserId);

    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(
          `Ошибка при добавлении ICE кандидата от ${fromUserId}:`,
          error,
        );
      }
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

    // Останавливаем локальный поток
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }

    // Закрываем все peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsVideoChat(false);
    setVideoClients({});
  };

  const handleVideoChat = async () => {
    if (isVideoChat) {
      // Выключаем видео
      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => track.stop());
        localStream.current = null;
      }

      // Закрываем все peer connections
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();

      setIsVideoChat(false);
      setVideoClients({});
      return;
    }

    try {
      // Получаем локальный поток
      console.log("Запрашиваем доступ к медиа...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true, // Включаем аудио
      });

      localStream.current = stream;

      // Устанавливаем поток для локального видео
      if (localStreamRef.current) {
        localStreamRef.current.srcObject = stream;
      }

      setIsVideoChat(true);

      // Инициируем соединения со всеми участниками
      for (const clientId of chatClients) {
        if (clientId !== userId) {
          await initiateCall(clientId);
        }
      }
    } catch (error) {
      console.error("Ошибка при инициализации видеочата:", error);
      alert("Не удалось получить доступ к камере/микрофону");
    }
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
            muted
            width={400}
            height={300}
            style={{
              border: "1px solid #ccc",
              backgroundColor: "#000",
              display: isVideoChat ? "block" : "none",
            }}
          />

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
                    if (el && stream) {
                      el.srcObject = stream;
                    }
                  }}
                  style={{
                    border: "1px solid #ccc",
                    backgroundColor: "#000",
                  }}
                />
                <p>Участник: {clientId}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleVideoChat}
            disabled={
              !socketRef.current ||
              socketRef.current.readyState !== WebSocket.OPEN
            }
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
              disabled={
                !socketRef.current ||
                socketRef.current.readyState !== WebSocket.OPEN
              }
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
        <p>Активные peer connections: {peerConnections.current.size}</p>
        <p>Видео активно: {isVideoChat ? "Да" : "Нет"}</p>
        <p>Локальный поток: {localStream.current ? "Активен" : "Неактивен"}</p>
      </div>
    </div>
  );
};

export default VideoCall;
