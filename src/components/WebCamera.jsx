import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

const WebCamera = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [error, setError] = useState(null);
  const requestId = useRef(null);
  const cornersRef = useRef([]);

  const findPaper = (ctx, width, height) => {
    try {
      // console.log("Finding paper. Canvas dimensions:", width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // 1. Оптимизированное преобразование в оттенки серого
      const grayscale = new Uint8Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        grayscale[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }

      // 2. Оптимизированное обнаружение краёв (оператор Собеля)
      const edges = new Uint8Array(width * height);
      const threshold = 30;

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;

          // Вычисляем градиенты по X и Y используя оператор Собеля 3x3
          const gx =
            -grayscale[idx - width - 1] +
            grayscale[idx - width + 1] +
            -2 * grayscale[idx - 1] +
            2 * grayscale[idx + 1] +
            -grayscale[idx + width - 1] +
            grayscale[idx + width + 1];

          const gy =
            -grayscale[idx - width - 1] +
            -2 * grayscale[idx - width] +
            -grayscale[idx - width + 1] +
            grayscale[idx + width - 1] +
            2 * grayscale[idx + width] +
            grayscale[idx + width + 1];

          const magnitude = Math.sqrt(gx * gx + gy * gy);
          edges[idx] = magnitude > threshold ? 255 : 0;
        }
      }

      // 3. Поиск контуров
      const contours = [];
      const visited = new Set();

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const key = `${x},${y}`;

          if (edges[idx] > 0 && !visited.has(key)) {
            const contour = [];
            let currentX = x;
            let currentY = y;

            // Отслеживаем контур
            while (true) {
              const currentKey = `${currentX},${currentY}`;
              if (visited.has(currentKey)) break;

              visited.add(currentKey);
              contour.push({ x: currentX, y: currentY });

              // Ищем следующую точку контура
              let found = false;
              for (let dy = -1; dy <= 1 && !found; dy++) {
                for (let dx = -1; dx <= 1 && !found; dx++) {
                  const nextX = currentX + dx;
                  const nextY = currentY + dy;
                  const nextKey = `${nextX},${nextY}`;

                  if (
                    nextX > 0 &&
                    nextX < width &&
                    nextY > 0 &&
                    nextY < height &&
                    edges[nextY * width + nextX] > 0 &&
                    !visited.has(nextKey)
                  ) {
                    currentX = nextX;
                    currentY = nextY;
                    found = true;
                  }
                }
              }

              if (!found) break;
            }

            if (contour.length > 100) {
              // Минимальная длина контура
              contours.push(contour);
            }
          }
        }
      }

      // 4. Находим самый большой контур с 4 углами
      let bestCorners = null;
      let maxArea = 0;

      contours.forEach(contour => {
        // Упрощаем контур до 4 точек
        const simplified = simplifyContour(contour);
        if (simplified.length === 4) {
          const area = calculateArea(simplified);
          if (area > maxArea) {
            maxArea = area;
            bestCorners = simplified;
          }
        }
      });

      // Если не нашли подходящий контур, используем значения по умолчанию
      if (!bestCorners) {
        const centerX = width / 2;
        const centerY = height / 2;
        const rectWidth = width * 0.7;
        const rectHeight = height * 0.8;

        bestCorners = [
          { x: centerX - rectWidth / 2, y: centerY - rectHeight / 2 },
          { x: centerX + rectWidth / 2, y: centerY - rectHeight / 2 },
          { x: centerX + rectWidth / 2, y: centerY + rectHeight / 2 },
          { x: centerX - rectWidth / 2, y: centerY + rectHeight / 2 },
        ];
      }

      // 5. Отрисовка результата
      ctx.putImageData(imageData, 0, 0);

      // Рисуем контур
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bestCorners[0].x, bestCorners[0].y);
      bestCorners.forEach((point, i) => {
        const nextPoint = bestCorners[(i + 1) % bestCorners.length];
        ctx.lineTo(nextPoint.x, nextPoint.y);
      });
      ctx.closePath();
      ctx.stroke();

      // Рисуем углы
      ctx.fillStyle = "#FF0000";
      bestCorners.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Сохраняем найденные углы
      cornersRef.current = bestCorners;
      return bestCorners;
    } catch (err) {
      // console.error("Error in findPaper:", err);
      setError("Error processing image");
      return null;
    }
  };

  // Вспомогательные функции
  const simplifyContour = contour => {
    const len = contour.length;
    if (len < 4) return contour;

    // Находим самые удаленные точки для формирования углов
    const center = {
      x: contour.reduce((sum, p) => sum + p.x, 0) / len,
      y: contour.reduce((sum, p) => sum + p.y, 0) / len,
    };

    const angles = contour.map(point => {
      return {
        point,
        angle: Math.atan2(point.y - center.y, point.x - center.x),
      };
    });

    // Сортируем точки по углу
    angles.sort((a, b) => a.angle - b.angle);

    // Берем 4 точки с равными интервалами
    const step = Math.floor(len / 4);
    return [0, 1, 2, 3].map(i => angles[i * step].point);
  };

  const calculateArea = points => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area / 2);
  };

  const drawToCanvas = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        // console.log("Video or canvas not ready");
        return;
      }

      // console.log("Drawing to canvas. Video dimensions:", video.videoWidth, video.videoHeight);

      // Установка размеров canvas
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0);
      findPaper(context, canvas.width, canvas.height);

      requestId.current = requestAnimationFrame(drawToCanvas);
    } catch (err) {
      // console.error("Error in drawToCanvas:", err);
      setError("Error drawing to canvas");
    }
  };

  const startCamera = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
      });

      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = mediaStream;
        videoElement.onloadedmetadata = () => {
          // console.log("Video metadata loaded. Dimensions:", videoElement.videoWidth, videoElement.videoHeight);
          videoElement.play();
          drawToCanvas();
        };
      }

      setStream(mediaStream);
      setIsStarted(true);
      setCapturedImage(null);
    } catch (err) {
      // console.error("Error accessing camera:", err);
      setError("Could not access camera");
    }
  };

  const stopCamera = () => {
    if (requestId.current) {
      cancelAnimationFrame(requestId.current);
      requestId.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setIsStarted(false);
  };

  const handleCanvasClick = () => {
    if (cornersRef.current && cornersRef.current.length === 4) {
      stopCamera();
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Сохраняем текущий кадр
      setCapturedImage(canvas.toDataURL());
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        onLoadedMetadata={e => {
          // console.log("Video element loaded:", e.target.videoWidth, e.target.videoHeight);
        }}
      />
      <canvas
        ref={canvasRef}
        className="w-full max-w-4xl border border-gray-300 rounded-lg cursor-pointer"
        onClick={handleCanvasClick}
      />
      {error && <div className="text-red-500">{error}</div>}
      {!capturedImage && (
        <button
          onClick={isStarted ? stopCamera : startCamera}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${
            isStarted ? "bg-red-500" : "bg-green-500"
          }`}
        >
          {isStarted ? (
            <>
              <CameraOff size={20} />
              Остановить
            </>
          ) : (
            <>
              <Camera size={20} />
              Запустить
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default WebCamera;
