import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

// ------ ВАЖНО: используйте библиотеку opencv.js (WebAssembly) ------
// Раскомментируйте или добавьте <script src="https://docs.opencv.org/4.6.0/opencv.js"></script>
// в ваш index.html. Или импортируйте opencv через npm-пакет (experimental).

// window.cv будет доступен глобально, когда OpenCV подгрузится.

const TARGET_ASPECT_RATIO = 297 / 210; // A4 (примерно 1.4142)

const WebCamera = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [error, setError] = useState(null);
  const requestId = useRef(null);

  const [status, setStatus] = useState("Ищем бумагу...");

  // Функция, которая ищет контур A4 на canvas
  const findA4Paper = (ctx, width, height) => {
    try {
      const src = new window.cv.Mat(height, width, window.cv.CV_8UC4);
      const dst = new window.cv.Mat(height, width, window.cv.CV_8UC1);
      const hierarchy = new window.cv.Mat();

      // Считываем данные из canvas в матрицу src
      let imageData = ctx.getImageData(0, 0, width, height);
      src.data.set(imageData.data);

      // Преобразуем в оттенки серого
      window.cv.cvtColor(src, dst, window.cv.COLOR_RGBA2GRAY);

      // Размываем, чтобы убрать мелкие шумы
      window.cv.GaussianBlur(dst, dst, new window.cv.Size(5, 5), 0, 0, window.cv.BORDER_DEFAULT);

      // Поиск резких границ (Canny)
      window.cv.Canny(dst, dst, 50, 150);

      // Увеличим области (dilate) и затем чуть «съедим» (erode),
      // чтобы контуры «замкнулись» лучше
      const M = window.cv.Mat.ones(3, 3, window.cv.CV_8U);
      window.cv.dilate(dst, dst, M);
      window.cv.erode(dst, dst, M);

      // Ищем контуры
      const contours = new window.cv.MatVector();
      window.cv.findContours(dst, contours, hierarchy, window.cv.RETR_EXTERNAL, window.cv.CHAIN_APPROX_SIMPLE);

      let biggestRect = null;
      let bestArea = 0;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        // Аппроксимируем контур к многоугольнику
        const approx = new window.cv.Mat();
        const perimeter = window.cv.arcLength(contour, true);
        window.cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

        // Ищем четырёхугольник (4 вершины)
        if (approx.rows === 4) {
          // Вычисляем площадь
          const contourArea = window.cv.contourArea(approx);
          if (contourArea > bestArea) {
            bestArea = contourArea;
            biggestRect = approx;
          } else {
            approx.delete();
          }
        } else {
          approx.delete();
        }
        contour.delete();
      }

      // Если нашли четырёхугольник
      if (biggestRect) {
        // Преобразуем точки в удобный формат
        const corners = [];
        for (let i = 0; i < 4; i++) {
          const x = biggestRect.intAt(i, 0);
          const y = biggestRect.intAt(i, 1);
          corners.push({ x, y });
        }

        // Сортируем углы в порядке: top-left, top-right, bottom-right, bottom-left
        // (Это упрощённый метод; в OpenCV обычно делают minAreaRect, затем сортируют)
        corners.sort((a, b) => a.x + a.y - (b.x + b.y));
        // corners[0] будет самым "верхним левым", corners[3] - "нижним правым" условно.
        // Для большей точности можно написать свою логику сортировки.

        // Проверим аспект-ратио
        // Считаем расстояния между соседними углами
        const d1 = distance(corners[0], corners[1]); // top side
        const d2 = distance(corners[1], corners[2]); // right side
        const d3 = distance(corners[2], corners[3]); // bottom side
        const d4 = distance(corners[3], corners[0]); // left side

        // Предположим, что "верхняя" и "нижняя" стороны — это d1 и d3
        // "правая" и "левая" — это d2 и d4
        // Берём среднее по "горизонтальным" сторонам и среднее по "вертикальным"
        const avgH = (d1 + d3) / 2;
        const avgV = (d2 + d4) / 2;
        const ratio = avgV > 0 ? avgH / avgV : 0;

        // Сравниваем с соотношением A4 (297/210 ~ 1.4142).
        // Допустим, что углы камеры могут вносить погрешность, пусть 10% допустим
        const lowerBound = TARGET_ASPECT_RATIO * 0.9;
        const upperBound = TARGET_ASPECT_RATIO * 1.1;

        if (ratio > lowerBound && ratio < upperBound) {
          // Рисуем контур на canvas
          drawPolygon(ctx, corners, "#00FF00");

          setStatus("Бумага A4 найдена!");
        } else {
          drawPolygon(ctx, corners, "#FFA500");
          setStatus("Найден прямоугольник, но не A4.");
        }

        biggestRect.delete();
      } else {
        setStatus("Прямоугольник не найден.");
      }

      // Очищаем
      src.delete();
      dst.delete();
      hierarchy.delete();
      contours.delete();
    } catch (e) {
      console.error(e);
      setError("Ошибка при распознавании");
    }
  };

  const drawPolygon = (ctx, corners, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Рисуем углы точками
    ctx.fillStyle = color;
    corners.forEach(corner => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 5, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  const distance = (p1, p2) => {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const drawToCanvas = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Устанавливаем размеры canvas по факту видеокадра
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Рисуем текущее изображение с видео
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Пытаемся найти бумагу А4
    findA4Paper(ctx, canvas.width, canvas.height);

    requestId.current = requestAnimationFrame(drawToCanvas);
  };

  const startCamera = async () => {
    try {
      setError(null);
      setStatus("Подключаем камеру...");
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
          videoElement.play();
          // Запускаем цикл отрисовки
          drawToCanvas();
        };
      }

      setStream(mediaStream);
      setIsStarted(true);
      setCapturedImage(null);
      setStatus("Ищем бумагу...");
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera");
      setStatus("Ошибка доступа к камере");
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
    setStatus("Камера остановлена");
  };

  // Щелчок по canvas — делаем снимок (сохраняем dataURL)
  const handleCanvasClick = () => {
    if (!canvasRef.current) return;
    stopCamera();
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setCapturedImage(dataUrl);
    setStatus("Снимок сделан");
  };

  useEffect(() => {
    // При размонтировании компонента — останавливаем камеру
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
      {/* Отображаем статус */}
      <div className="text-blue-600">{status}</div>
      {/* Ошибки, если есть */}
      {error && <div className="text-red-500">{error}</div>}
      {/* Кнопка запуска / остановки камеры */}
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
      {/* Показ сохранённого снимка (если есть) */}
      {capturedImage && (
        <div className="mt-4">
          <img src={capturedImage} alt="Captured" className="max-w-full border border-gray-300 rounded-lg" />
        </div>
      )}
    </div>
  );
};

export default WebCamera;
