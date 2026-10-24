import { waNumber } from "@/lib/format";

export function getPdfOptions(filename: string) {
  return {
    margin: 10,
    filename,
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      onclone: (clonedDoc: Document, clonedEl?: HTMLElement) => {
        // Fix for oklch colors in html2canvas:
        // Inject RGB/Hex overrides for all root & semantic CSS custom properties
        const style = clonedDoc.createElement("style");
        style.setAttribute("data-pdf-sanitizer", "true");
        style.textContent = `
          :root, .dark, body, * {
            --background: #ffffff !important;
            --foreground: #0f172a !important;
            --card: #ffffff !important;
            --card-foreground: #0f172a !important;
            --popover: #ffffff !important;
            --popover-foreground: #0f172a !important;
            --primary: #0284c7 !important;
            --primary-foreground: #ffffff !important;
            --secondary: #f1f5f9 !important;
            --secondary-foreground: #0f172a !important;
            --muted: #f1f5f9 !important;
            --muted-foreground: #64748b !important;
            --accent: #f8fafc !important;
            --accent-foreground: #0f172a !important;
            --destructive: #ef4444 !important;
            --destructive-foreground: #ffffff !important;
            --border: #e2e8f0 !important;
            --input: #e2e8f0 !important;
            --ring: #0284c7 !important;
          }
        `;
        clonedDoc.head.appendChild(style);

        // Sanitize any elements that have computed or inline oklch
        const target = clonedEl || clonedDoc.body;
        const allNodes = target.querySelectorAll("*");
        const canvas = clonedDoc.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const sanitize = (val: string): string => {
          if (!val || !val.includes("oklch")) return val;
          if (ctx) {
            try {
              ctx.fillStyle = val;
              return ctx.fillStyle;
            } catch {
              // fallback
            }
          }
          return "#0f172a";
        };

        const colorProps = [
          "color",
          "backgroundColor",
          "borderColor",
          "borderTopColor",
          "borderRightColor",
          "borderBottomColor",
          "borderLeftColor",
        ] as const;

        [target, ...Array.from(allNodes)].forEach((node) => {
          const el = node as HTMLElement;
          if (!el.style) return;
          try {
            const cs = window.getComputedStyle(el);
            for (const prop of colorProps) {
              const val = cs[prop];
              if (val && val.includes("oklch")) {
                el.style[prop] = sanitize(val);
              }
            }
          } catch {
            // Ignore styling read errors if any
          }
        });
      },
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
  };
}

export async function generatePdfBlob(element: HTMLElement, filename: string): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;
  const opt = getPdfOptions(filename);
  return await html2pdf().set(opt).from(element).outputPdf("blob");
}

export async function downloadPdfFromElement(element: HTMLElement, filename: string): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  const opt = getPdfOptions(filename);
  await html2pdf().set(opt).from(element).save();
}

export function openWhatsAppChat(mobile: string, messageText: string): void {
  const wa = waNumber(mobile);
  const waUrl = `https://wa.me/${wa}?text=${encodeURIComponent(messageText)}`;
  if (typeof window !== "undefined") {
    window.open(waUrl, "_blank");
  }
}

export async function sharePdfViaWhatsApp(
  element: HTMLElement,
  filename: string,
  mobile: string,
  messageText: string
): Promise<"shared" | "downloaded_and_opened" | "aborted"> {
  const blob = await generatePdfBlob(element, filename);
  const file = new File([blob], filename, { type: "application/pdf" });

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

  openWhatsAppChat(mobile, messageText);
  return "downloaded_and_opened";
}
