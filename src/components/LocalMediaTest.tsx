// @ts-nocheck

import React, { useRef, useState, useEffect } from "react";

const WebcamComponent = () => {
  const videoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
        setError(null);
      }
    } catch (err) {
      console.error("Ошибка доступа к веб-камере:", err);
      setError(
        "Не удалось получить доступ к веб-камере. Убедитесь, что камера подключена и вы дали разрешение на её использование.",
      );
    }
  };

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  };

  // Очистка при размонтировании компонента
  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopWebcam();
      }
    };
  }, [isStreaming]);

  return (
    <div className="webcam-container">
      <h2>Веб-камера</h2>

      <div className="video-container">
        <video ref={videoRef} width="640" height="480" autoPlay playsInline />
      </div>

      <div className="controls">
        {!isStreaming ? (
          <button onClick={startWebcam}>Включить камеру</button>
        ) : (
          <button onClick={stopWebcam}>Выключить камеру</button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <style jsx>{`
        .webcam-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 20px;
          font-family: Arial, sans-serif;
        }

        .video-container {
          margin: 15px 0;
        }

        video {
          border: 2px solid #333;
          border-radius: 8px;
          max-width: 100%;
        }

        .controls {
          margin: 10px 0;
        }

        button {
          padding: 8px 16px;
          background-color: #4285f4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.3s;
        }

        button:hover {
          background-color: #3367d6;
        }

        .error {
          color: #d32f2f;
          margin-top: 10px;
        }
      `}</style>
    </div>
  );
};

export default WebcamComponent;
