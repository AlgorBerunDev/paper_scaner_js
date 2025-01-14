import React, { useRef, useEffect, useState } from "react";
import cv from "@techstark/opencv-js";

const WebCamera = ({ onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isPaperDetected, setIsPaperDetected] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch (error) {
        console.error("Ошибка доступа к камере:", error);
        alert("Не удалось получить доступ к камере. Проверьте настройки.");
      }
    };

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Рисуем текущий кадр
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Обрабатываем изображение с OpenCV
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = cv.matFromImageData(frame);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let paperDetected = false;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (approx.rows === 4) {
        paperDetected = true;
        const points = [];
        for (let j = 0; j < 4; j++) {
          const x = approx.data32S[j * 2];
          const y = approx.data32S[j * 2 + 1];
          points.push({ x, y });
        }

        // Рисуем контуры бумаги
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < points.length; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }
        ctx.closePath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "green";
        ctx.stroke();

        approx.delete();
      }
    }

    setIsPaperDetected(paperDetected);

    // Освобождаем ресурсы OpenCV
    src.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  };

  useEffect(() => {
    let animationFrameId;

    const update = () => {
      processFrame();
      animationFrameId = requestAnimationFrame(update); // Постоянно обновляем кадры
    };

    if (isReady) {
      update();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isReady]);

  const handleCapture = () => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    canvas.toBlob(blob => {
      if (blob) {
        onCapture(blob); // Отправляем изображение на сервер
      }
    }, "image/jpeg");
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "400px" }}>
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "auto",
          display: isReady ? "block" : "none",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "auto",
        }}
      />
      {!isReady && <p>Загрузка камеры...</p>}
      <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
        <button
          onClick={handleCapture}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            backgroundColor: isPaperDetected ? "#28a745" : "#6c757d",
            color: "#FFF",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Сфотографировать
        </button>
      </div>
    </div>
  );
};

export default WebCamera;
