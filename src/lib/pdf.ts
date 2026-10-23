import { waNumber } from "@/lib/format";

export async function generatePdfBlob(element: HTMLElement, filename: string): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;
  const opt = {
    margin: 10,
    filename,
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
  };
  return await html2pdf().set(opt).from(element).outputPdf("blob");
}

export async function downloadPdfFromElement(element: HTMLElement, filename: string): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  const opt = {
    margin: 10,
    filename,
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
  };
  await html2pdf().set(opt).from(element).save();
}

export async function sharePdfViaWhatsApp(
  element: HTMLElement,
  filename: string,
  mobile: string,
  messageText: string
): Promise<"shared" | "downloaded_and_opened" | "aborted"> {
  const blob = await generatePdfBlob(element, filename);
  const file = new File([blob], filename, { type: "application/pdf" });
  const wa = waNumber(mobile);

  // Check if Web Share API with files is supported (e.g. mobile Safari / Chrome)
  if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: messageText,
      });
      return "shared";
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        return "aborted";
      }
      // User dismissed or failed; fall back to download & wa.me
    }
  }

  // Fallback: download file and open WhatsApp chat
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  if (typeof window !== "undefined") {
    const waUrl = `https://wa.me/${wa}?text=${encodeURIComponent(messageText)}`;
    window.open(waUrl, "_blank");
  }

  return "downloaded_and_opened";
}
