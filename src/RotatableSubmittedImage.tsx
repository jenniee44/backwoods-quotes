import { useLayoutEffect, useRef, useState } from "react";
import type { PdfRotation } from "../shared/pdf";
export default function RotatableSubmittedImage({
  data,
  pixelWidth,
  pixelHeight,
  turn,
  zoom,
}: {
  data: string;
  pixelWidth: number;
  pixelHeight: number;
  turn: PdfRotation;
  zoom: number;
}) {
  const pan = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(300);
  useLayoutEffect(() => {
    const node = pan.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const sideways = turn === 90 || turn === 270,
    outputWidth = (width * zoom) / 100;
  const imageWidth = sideways
      ? (outputWidth * pixelWidth) / pixelHeight
      : outputWidth,
    imageHeight = (imageWidth * pixelHeight) / pixelWidth;
  const transform =
    turn === 90
      ? "rotate(90deg) translateY(-100%)"
      : turn === 180
        ? "rotate(180deg) translate(-100%, -100%)"
        : turn === 270
          ? "rotate(270deg) translateX(-100%)"
          : "none";
  return (
    <div
      ref={pan}
      className="submitted-image-pan"
      tabIndex={0}
      aria-label="Scroll to pan submitted image"
    >
      <div
        style={{
          position: "relative",
          width: sideways ? imageHeight : imageWidth,
          height: sideways ? imageWidth : imageHeight,
        }}
      >
        <img
          data-inspection-rotation={turn}
          src={data}
          alt="Exact submitted detail enlarged"
          style={{
            position: "absolute",
            width: imageWidth,
            height: imageHeight,
            maxWidth: "none",
            transform,
            transformOrigin: "0 0",
          }}
        />
      </div>
    </div>
  );
}
