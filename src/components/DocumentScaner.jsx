import { useState, useRef, useCallback, useEffect } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui";
import { Alert, AlertDescription } from "@/components/ui";

const DocumentScanner = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [processedImage, setProcessedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isOpenCVLoaded, setIsOpenCVLoaded] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cv = useRef(null);

  // Загрузка OpenCV
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.async = true;
    script.onload = () => {
      // Ждем инициализацию OpenCV
      window.Module = {
        onRuntimeInitialized: () => {
          cv.current = window.cv;
          setIsOpenCVLoaded(true);
        },
      };
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Функция обработки изображения с помощью OpenCV
  const processImage = async imageData => {
    if (!cv.current) {
      setError("OpenCV не загружен");
      return;
    }

    setIsProcessing(true);
    try {
      // Конвертируем base64 в Image
      const img = await new Promise(resolve => {
        const img = new Image();
        img.src = imageData;
        img.onload = () => resolve(img);
      });

      // Создаем Mat из изображения
      const mat = cv.current.imread(img);

      // Конвертируем в оттенки серого
      const gray = new cv.current.Mat();
      cv.current.cvtColor(mat, gray, cv.current.COLOR_RGBA2GRAY);

      // Применяем размытие по Гауссу
      const blurred = new cv.current.Mat();
      const ksize = new cv.current.Size(5, 5);
      cv.current.GaussianBlur(gray, blurred, ksize, 0);

      // Находим края с помощью Canny
      const edges = new cv.current.Mat();
      cv.current.Canny(blurred, edges, 75, 200);

      // Находим контуры
      const contours = new cv.current.MatVector();
      const hierarchy = new cv.current.Mat();
      cv.current.findContours(edges, contours, hierarchy, cv.current.RETR_EXTERNAL, cv.current.CHAIN_APPROX_SIMPLE);

      // Находим самый большой контур (предположительно, это наш документ)
      let maxArea = 0;
      let maxContourIndex = -1;
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.current.contourArea(contour);
        if (area > maxArea) {
          maxArea = area;
          maxContourIndex = i;
        }
      }

      if (maxContourIndex === -1) {
        throw new Error("Не удалось найти контур документа");
      }

      // Аппроксимируем контур многоугольником
      const contour = contours.get(maxContourIndex);
      const peri = cv.current.arcLength(contour, true);
      const approx = new cv.current.Mat();
      cv.current.approxPolyDP(contour, approx, 0.02 * peri, true);

      // Проверяем, что получили 4 точки (прямоугольник)
      if (approx.rows !== 4) {
        throw new Error("Не удалось определить четкие границы документа");
      }

      // Находим углы документа
      const points = [];
      for (let i = 0; i < 4; i++) {
        points.push({
          x: approx.data32S[i * 2],
          y: approx.data32S[i * 2 + 1],
        });
      }

      // Сортируем точки для правильного порядка
      const sortedPoints = sortCorners(points);

      // Применяем перспективную трансформацию
      const dstWidth = 595; // A4 ширина в пикселях при 72 DPI
      const dstHeight = 842; // A4 высота в пикселях при 72 DPI

      const srcPoints = cv.current.matFromArray(4, 1, cv.current.CV_32FC2, [
        sortedPoints[0].x,
        sortedPoints[0].y,
        sortedPoints[1].x,
        sortedPoints[1].y,
        sortedPoints[2].x,
        sortedPoints[2].y,
        sortedPoints[3].x,
        sortedPoints[3].y,
      ]);

      const dstPoints = cv.current.matFromArray(4, 1, cv.current.CV_32FC2, [
        0,
        0,
        dstWidth,
        0,
        dstWidth,
        dstHeight,
        0,
        dstHeight,
      ]);

      // Получаем матрицу трансформации
      const transformMatrix = cv.current.getPerspectiveTransform(srcPoints, dstPoints);

      // Применяем трансформацию
      const transformed = new cv.current.Mat();
      cv.current.warpPerspective(mat, transformed, transformMatrix, new cv.current.Size(dstWidth, dstHeight));

      // Конвертируем результат обратно в canvas
      const outputCanvas = document.createElement("canvas");
      cv.current.imshow(outputCanvas, transformed);

      // Получаем base64 изображение
      setProcessedImage(outputCanvas.toDataURL("image/jpeg"));

      // Освобождаем память
      mat.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
      approx.delete();
      srcPoints.delete();
      dstPoints.delete();
      transformMatrix.delete();
      transformed.delete();
    } catch (err) {
      console.error("Ошибка при обработке изображения:", err);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Вспомогательная функция для сортировки углов
  const sortCorners = points => {
    // Находим центр
    const center = points.reduce((acc, point) => ({ x: acc.x + point.x / 4, y: acc.y + point.y / 4 }), { x: 0, y: 0 });

    // Сортируем точки относительно центра
    return points.sort((a, b) => {
      const a1 = Math.atan2(a.y - center.y, a.x - center.x);
      const a2 = Math.atan2(b.y - center.y, b.x - center.x);
      return a1 - a2;
    });
  };

  // Запуск камеры
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCapturing(true);
      }
    } catch (err) {
      console.error("Ошибка доступа к камере:", err);
      setError("Не удалось получить доступ к камере");
    }
  };

  // Остановка камеры
  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setIsCapturing(false);
    }
  };

  // Захват кадра
  const captureFrame = useCallback(() => {
    if (!canvasRef.current || !videoRef.current) return;

    setError(null);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext("2d");

    // Устанавливаем размеры canvas равными размерам видео
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Рисуем текущий кадр на canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Получаем изображение в формате base64
    const capturedImage = canvas.toDataURL("image/jpeg");

    // Обрабатываем изображение
    processImage(capturedImage);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {!isOpenCVLoaded && (
        <Alert>
          <AlertDescription>Загрузка OpenCV...</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="w-full max-w-2xl p-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
          {isCapturing ? (
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Camera className="h-12 w-12 text-gray-400" />
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="mt-4 flex justify-center gap-4">
          <Button
            onClick={isCapturing ? stopCamera : startCamera}
            variant={isCapturing ? "destructive" : "default"}
            // disabled={!isOpenCVLoaded}
          >
            {isCapturing ? "Остановить камеру" : "Запустить камеру"}
          </Button>

          {isCapturing && (
            <Button onClick={captureFrame} disabled={isProcessing || !isOpenCVLoaded}>
              {isProcessing ? "Обработка..." : "Сделать снимок"}
            </Button>
          )}
        </div>
      </Card>

      {processedImage && (
        <Card className="w-full max-w-2xl p-4">
          <div className="aspect-video w-full overflow-hidden rounded-lg">
            <img src={processedImage} alt="Обработанное изображение" className="h-full w-full object-contain" />
          </div>
        </Card>
      )}
    </div>
  );
};

export default DocumentScanner;
