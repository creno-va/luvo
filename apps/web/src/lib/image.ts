export type AnalysisView = {
  region: "full" | "detail1" | "detail2";
  blob: Blob;
};
const maxBytes = 1.7 * 1024 * 1024;
async function renderView(
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number,
  maxSide: number,
): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("사진을 열지 못했어요. 다른 사진을 골라 주세요.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    bitmap,
    x,
    y,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const encode = (type: string, quality?: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("사진을 준비하지 못했어요.")),
        type,
        quality,
      ),
    );
  // Text and table screenshots remain lossless instead of always becoming JPEG.
  const png = await encode("image/png");
  if (png.size <= maxBytes) return png;
  for (const quality of [0.95, 0.88, 0.8]) {
    const jpeg = await encode("image/jpeg", quality);
    if (jpeg.size <= maxBytes) return jpeg;
  }
  throw new Error(
    "사진의 일부를 나누어 촬영하거나 조금 작은 사진을 올려 주세요.",
  );
}
export async function analysisViews(file: File): Promise<AnalysisView[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const views: AnalysisView[] = [
      {
        region: "full",
        blob: await renderView(bitmap, 0, 0, bitmap.width, bitmap.height, 2400),
      },
    ];
    // Overlapping sections make small Korean table cells legible to vision models.
    if (bitmap.height >= 1100 && bitmap.height / bitmap.width > 1.05) {
      const height = Math.ceil(bitmap.height * 0.6);
      const bottom = bitmap.height - height;
      views.push(
        {
          region: "detail1",
          blob: await renderView(bitmap, 0, 0, bitmap.width, height, 2000),
        },
        {
          region: "detail2",
          blob: await renderView(bitmap, 0, bottom, bitmap.width, height, 2000),
        },
      );
    }
    if (bitmap.width >= 1100 && bitmap.width / bitmap.height >= 1.05) {
      const width = Math.ceil(bitmap.width * 0.62);
      views.push(
        {
          region: "detail1",
          blob: await renderView(bitmap, 0, 0, width, bitmap.height, 2000),
        },
        {
          region: "detail2",
          blob: await renderView(
            bitmap,
            bitmap.width - width,
            0,
            width,
            bitmap.height,
            2000,
          ),
        },
      );
    }
    return views;
  } finally {
    bitmap.close();
  }
}
export async function analysisImage(file: File): Promise<Blob> {
  return (await analysisViews(file))[0].blob;
}
