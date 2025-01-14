import React, { useRef, useEffect, useState } from "react";
import cv from "@techstark/opencv-js";

const WebCamera = ({ onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isPaperDetected, setIsPaperDetected] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            videoRef.current.play();
            console.log("Видео загружено");
          };
        }
      } catch (error) {
        console.error("Ошибка доступа к камере:", error);
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

  const detectPaper = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let j = 1; j < points.length; j++) {
          ctx.lineTo(points[j].x, points[j].y);
        }
        ctx.closePath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "green";
        ctx.stroke();

        approx.delete();
      }
    }

    setIsPaperDetected(paperDetected);

    src.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  };

  useEffect(() => {
    const interval = setInterval(detectPaper, 100);
    return () => clearInterval(interval);
  }, []);

  const handleCapture = () => {
    if (!isPaperDetected) {
      alert("Бумага не обнаружена!");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(blob => {
      if (blob && typeof onCapture === "function") {
        onCapture(blob);
      } else {
        console.error("onCapture не является функцией или Blob не создан");
      }
    }, "image/jpeg");
  };

  return (
    <div>
      <video ref={videoRef} style={{ width: "100%", height: "auto" }} />
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
      <div>
        <button
          onClick={handleCapture}
          disabled={!isPaperDetected}
          style={{
            marginTop: 10,
            padding: "10px 20px",
            fontSize: "16px",
            cursor: isPaperDetected ? "pointer" : "not-allowed",
          }}
        >
          Сфотографировать
        </button>
      </div>
    </div>
  );
};

export default WebCamera;
