// @ts-nocheck

import React, { useEffect, useRef, useState } from "react";

const LocalMediaTest = () => {
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [mediaStatus, setMediaStatus] = useState("Не запрошено");
  const [errorMessage, setErrorMessage] = useState("");
  const [devices, setDevices] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Функция для получения списка устройств
  const getDeviceList = async () => {
    try {
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceList);
      console.log("Доступные устройства:", deviceList);
    } catch (error) {
      console.error("Ошибка при получении списка устройств:", error);
      setErrorMessage(
        `Ошибка при получении списка устройств: ${error.message}`,
      );
    }
  };

  // Функция для запуска видео
  const startVideo = async () => {
    try {
      setMediaStatus("Запрос доступа...");
      setErrorMessage("");

      // Сначала получим список устройств для отладки
      await getDeviceList();

      // Запрашиваем доступ к медиаустройствам
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("Поток получен:", stream);
      console.log("Видео треки:", stream.getVideoTracks());
      console.log("Аудио треки:", stream.getAudioTracks());

      // Сохраняем поток для дальнейшего использования
      streamRef.current = stream;

      // Назначаем поток видеоэлементу
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setMediaStatus("Медиа подключено");
        setIsVideoEnabled(true);
      }
    } catch (error) {
      console.error("Ошибка доступа к медиа:", error);
      setMediaStatus("Ошибка");
      setErrorMessage(`Не удалось получить доступ: ${error.message}`);
    }
  };

  // Функция для остановки видео
  const stopVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsVideoEnabled(false);
    setMediaStatus("Остановлено");
  };

  // Отображение информации об устройствах
  const renderDeviceInfo = () => {
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput",
    );
    const audioDevices = devices.filter(
      (device) => device.kind === "audioinput",
    );

    return (
      <div style={{ marginTop: "20px" }}>
        <h4>Информация об устройствах:</h4>
        <p>Камеры: {videoDevices.length}</p>
        <ul>
          {videoDevices.map((device, index) => (
            <li key={`video-${index}`}>
              {device.label || `Камера ${index + 1}`}
            </li>
          ))}
        </ul>
        <p>Микрофоны: {audioDevices.length}</p>
        <ul>
          {audioDevices.map((device, index) => (
            <li key={`audio-${index}`}>
              {device.label || `Микрофон ${index + 1}`}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Тест локального видео и аудио</h2>

      <div>
        <p>Статус: {mediaStatus}</p>
        {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

        <div style={{ marginBottom: "10px" }}>
          <button
            onClick={isVideoEnabled ? stopVideo : startVideo}
            style={{ padding: "10px", marginRight: "10px" }}
          >
            {isVideoEnabled ? "Остановить видео" : "Запустить видео"}
          </button>

          <button onClick={getDeviceList} style={{ padding: "10px" }}>
            Обновить список устройств
          </button>
        </div>
      </div>

      {/* Контейнер для видео с заметными границами */}
      <div
        style={{
          border: "2px solid red",
          width: "640px",
          height: "480px",
          background: "#f0f0f0",
          position: "relative",
        }}
      >
        {isVideoEnabled ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls
            width="100%"
            height="100%"
            style={{ objectFit: "cover" }}
            onLoadedMetadata={() => console.log("Видео метаданные загружены")}
            onError={(e) => {
              console.error("Ошибка видео элемента:", e);
              setErrorMessage(
                `Ошибка видео: ${e.target.error?.message || "Неизвестная ошибка"}`,
              );
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
              height: "100%",
              color: "#666",
            }}
          >
            Видео не запущено
          </div>
        )}
      </div>

      {/* Информация о медиа треках */}
      {streamRef.current && (
        <div style={{ marginTop: "20px" }}>
          <h4>Активные треки:</h4>
          <p>Видео треки: {streamRef.current.getVideoTracks().length}</p>
          <p>Аудио треки: {streamRef.current.getAudioTracks().length}</p>
        </div>
      )}

      {/* Информация об устройствах */}
      {devices.length > 0 && renderDeviceInfo()}

      {/* Ручной запуск воспроизведения */}
      {isVideoEnabled && (
        <div style={{ marginTop: "20px" }}>
          <button onClick={() => videoRef.current?.play()}>
            Принудительно запустить воспроизведение
          </button>
        </div>
      )}
    </div>
  );
};

export default LocalMediaTest;
