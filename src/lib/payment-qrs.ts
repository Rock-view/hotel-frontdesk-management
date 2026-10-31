export type PaymentQr = {
  id: string;
  name: string;
  image_url: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Safely parses and validates payment QR configurations from hotel_settings.
 * Filters out malformed entries and strictly bounds the list to at most 3 slots.
 */
export function parsePaymentQrs(data: unknown): PaymentQr[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (q): q is PaymentQr =>
        Boolean(q) &&
        typeof q === "object" &&
        typeof (q as any).id === "string" &&
        (q as any).id.trim().length > 0 &&
        typeof (q as any).name === "string" &&
        (q as any).name.trim().length > 0 &&
        typeof (q as any).image_url === "string" &&
        (q as any).image_url.trim().length > 0
    )
    .slice(0, 3);
}

/**
 * Validates and processes an uploaded QR image file into a crisp, high-resolution
 * lossless PNG with an optimal quiet zone (white margin) to guarantee immediate scanning.
 */
export async function processQrImageFile(file: File): Promise<string> {
  // Validate format
  const validTypes = ["image/png", "image/jpeg", "image/jpg"];
  if (!validTypes.includes(file.type.toLowerCase())) {
    throw new Error("Please upload a valid image file (PNG, JPG, or JPEG).");
  }

  // Validate size (max 5 MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image file size must be less than 5 MB.");
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Desired canvas target: 512x512 with quiet zone margin
      const targetSize = 512;
      const margin = 24; // White quiet zone around the QR
      const drawSize = targetSize - margin * 2;

      const canvas = document.createElement("canvas");
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Unable to initialize image processing canvas."));
        return;
      }

      // Fill pure white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetSize, targetSize);

      // Disable smoothing to preserve crisp, sharp black-and-white QR modules
      ctx.imageSmoothingEnabled = false;

      // Draw the QR centered inside the quiet zone
      ctx.drawImage(img, margin, margin, drawSize, drawSize);

      // Export as lossless PNG (avoids JPEG compression artifact noise around QR modules)
      const dataUrl = canvas.toDataURL("image/png");
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load and process the QR image."));
    };

    img.src = objectUrl;
  });
}
