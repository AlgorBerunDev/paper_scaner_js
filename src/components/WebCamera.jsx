import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

const WebCamera = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const requestId = useRef(null);
  const cornersRef = useRef([]);

  const findPaper = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Улучшенное преобразование в оттенки серого
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      grayscale[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }

    // Улучшенное обнаружение краёв с адаптивным порогом
    const edges = new Uint8Array(width * height);
    const kernelSize = 3;
    const threshold = 40; // Увеличенный порог для лучшего обнаружения бумаги

    for (let y = kernelSize; y < height - kernelSize; y++) {
      for (let x = kernelSize; x < width - kernelSize; x++) {
        const idx = y * width + x;

        // Вычисление градиента по X и Y с большим ядром
        let sumX = 0;
        let sumY = 0;

        for (let ky = -kernelSize; ky <= kernelSize; ky++) {
          for (let kx = -kernelSize; kx <= kernelSize; kx++) {
            const pixel = grayscale[(y + ky) * width + (x + kx)];
            sumX += pixel * kx;
            sumY += pixel * ky;
          }
        }

        const gradient = Math.sqrt(sumX * sumX + sumY * sumY);
        edges[idx] = gradient > threshold ? 255 : 0;
      }
    }

    // Поиск прямоугольника бумаги
    let maxArea = 0;
    let bestCorners = null;

    // Поиск контуров
    const contours = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (edges[y * width + x] > 0) {
          const contour = traceContour(edges, width, height, x, y);
          if (contour.length > 100) {
            // Минимальная длина контура
            contours.push(contour);
          }
        }
      }
    }

    // Поиск самого большого прямоугольника
    contours.forEach(contour => {
      const approxContour = approximatePolygon(contour);
      if (approxContour.length === 4) {
        const area = calculateArea(approxContour);
        if (area > maxArea && isValidPaperShape(approxContour, width, height)) {
          maxArea = area;
          bestCorners = approxContour;
        }
      }
    });

    if (bestCorners) {
      // Сохранение найденных углов
      cornersRef.current = bestCorners;

      // Отрисовка найденного прямоугольника
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bestCorners[0].x, bestCorners[0].y);
      for (let i = 1; i < bestCorners.length; i++) {
        ctx.lineTo(bestCorners[i].x, bestCorners[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      // Отрисовка углов
      ctx.fillStyle = "#FF0000";
      bestCorners.forEach(corner => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    return bestCorners;
  };

  // Вспомогательные функции
  const traceContour = (edges, width, height, startX, startY) => {
    const contour = [];
    let x = startX;
    let y = startY;
    const visited = new Set();

    while (true) {
      const key = `${x},${y}`;
      if (visited.has(key)) break;

      visited.add(key);
      contour.push({ x, y });

      // Поиск следующей точки контура
      let found = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx >= 0 &&
            nx < width &&
            ny >= 0 &&
            ny < height &&
            edges[ny * width + nx] > 0 &&
            !visited.has(`${nx},${ny}`)
          ) {
            x = nx;
            y = ny;
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) break;
    }

    return contour;
  };

  const approximatePolygon = contour => {
    // Упрощение контура до четырехугольника
    let corners = [];
    const step = Math.max(1, Math.floor(contour.length / 4));

    for (let i = 0; i < contour.length; i += step) {
      corners.push(contour[i]);
    }

    // Оставляем только 4 самые удаленные точки
    corners.sort((a, b) => {
      const distA = a.x * a.x + a.y * a.y;
      const distB = b.x * b.x + b.y * b.y;
      return distB - distA;
    });

    return corners.slice(0, 4);
  };

  const calculateArea = corners => {
    let area = 0;
    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length;
      area += corners[i].x * corners[j].y;
      area -= corners[j].x * corners[i].y;
    }
    return Math.abs(area / 2);
  };

  const isValidPaperShape = (corners, width, height) => {
    // Проверка пропорций и размера
    const minArea = width * height * 0.15; // Минимальная площадь (15% от кадра)
    const maxArea = width * height * 0.95; // Максимальная площадь (95% от кадра)

    const area = calculateArea(corners);
    if (area < minArea || area > maxArea) return false;

    // Проверка прямоугольности
    const angles = corners.map((corner, i) => {
      const prev = corners[(i + 3) % 4];
      const next = corners[(i + 1) % 4];
      return calculateAngle(prev, corner, next);
    });

    return angles.every(angle => Math.abs(angle - 90) < 20);
  };

  const calculateAngle = (p1, p2, p3) => {
    const angle = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    return Math.abs((angle * 180) / Math.PI);
  };

  const perspectiveTransform = (srcCorners, width, height) => {
    // Сортировка углов: верхний-левый, верхний-правый, нижний-правый, нижний-левый
    const sortedCorners = [...srcCorners].sort((a, b) => {
      const centerY = srcCorners.reduce((sum, c) => sum + c.y, 0) / srcCorners.length;
      if (Math.abs(a.y - b.y) < centerY * 0.1) {
        // 10% от центральной Y координаты
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    const dstCorners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];

    // Матрица перспективного преобразования
    const matrix = computePerspectiveTransform(sortedCorners, dstCorners);

    // Создаем новый canvas для трансформированного изображения
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Получаем исходное изображение
    const srcCanvas = canvasRef.current;
    const srcCtx = srcCanvas.getContext("2d");
    const imageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

    // Применяем трансформацию
    const destImageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Обратное преобразование координат
        const [srcX, srcY] = applyTransform(matrix, x, y);

        if (srcX >= 0 && srcX < srcCanvas.width && srcY >= 0 && srcY < srcCanvas.height) {
          // Билинейная интерполяция
          const x1 = Math.floor(srcX);
          const y1 = Math.floor(srcY);
          const x2 = Math.min(x1 + 1, srcCanvas.width - 1);
          const y2 = Math.min(y1 + 1, srcCanvas.height - 1);

          const fx = srcX - x1;
          const fy = srcY - y1;

          const destIdx = (y * width + x) * 4;
          const srcIdx11 = (y1 * srcCanvas.width + x1) * 4;
          const srcIdx12 = (y1 * srcCanvas.width + x2) * 4;
          const srcIdx21 = (y2 * srcCanvas.width + x1) * 4;
          const srcIdx22 = (y2 * srcCanvas.width + x2) * 4;

          for (let c = 0; c < 3; c++) {
            const value = bilinearInterpolation(
              imageData.data[srcIdx11 + c],
              imageData.data[srcIdx12 + c],
              imageData.data[srcIdx21 + c],
              imageData.data[srcIdx22 + c],
              fx,
              fy
            );
            destImageData.data[destIdx + c] = value;
          }
          destImageData.data[destIdx + 3] = 255;
        }
      }
    }

    ctx.putImageData(destImageData, 0, 0);
    return canvas;
  };

  const computePerspectiveTransform = (srcCorners, dstCorners) => {
    // Вычисление матрицы перспективного преобразования
    // Реализация метода наименьших квадратов
    const matrix = new Array(9).fill(0);
    // ... (реализация вычисления матрицы)
    return matrix;
  };

  const applyTransform = (matrix, x, y) => {
    // Применение матрицы трансформации к точке
    const w = matrix[6] * x + matrix[7] * y + matrix[8];
    const srcX = (matrix[0] * x + matrix[1] * y + matrix[2]) / w;
    const srcY = (matrix[3] * x + matrix[4] * y + matrix[5]) / w;
    return [srcX, srcY];
  };

  const bilinearInterpolation = (v11, v12, v21, v22, x, y) => {
    const v1 = v11 * (1 - x) + v12 * x;
    const v2 = v21 * (1 - x) + v22 * x;
    return Math.round(v1 * (1 - y) + v2 * y);
  };

  const handleCanvasClick = () => {
    if (cornersRef.current && cornersRef.current.length === 4) {
      stopCamera();

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Пропорции A4 (297мм x 210мм)
      const a4Width = 1240;
      const a4Height = Math.floor(a4Width * (297 / 210));

      // Трансформация перспективы
      const transformedCanvas = perspectiveTransform(cornersRef.current, a4Width, a4Height);

      if (transformedCanvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = a4Width;
        canvas.height = a4Height;
        ctx.drawImage(transformedCanvas, 0, 0);
        setCapturedImage(canvas.toDataURL());
      }
    }
  };

  const drawToCanvas = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0);
    findPaper(context, canvas.width, canvas.height);

    requestId.current = requestAnimationFrame(drawToCanvas);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: "environment",
        },
      });

      videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);
      setIsStarted(true);
      setCapturedImage(null);

      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play();
        drawToCanvas();
      };
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const stopCamera = () => {
    if (requestId.current) {
      cancelAnimationFrame(requestId.current);
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

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <video ref={videoRef} className="hidden" playsInline />
      <canvas
        ref={canvasRef}
        className="w-full max-w-4xl border border-gray-300 rounded-lg cursor-pointer"
        onClick={handleCanvasClick}
      />
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
