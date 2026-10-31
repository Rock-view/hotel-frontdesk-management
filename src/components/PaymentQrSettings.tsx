import { useState } from "react";
import { Plus, Trash2, Upload, RefreshCw, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PaymentQr, processQrImageFile } from "@/lib/payment-qrs";

export function PaymentQrSettings({
  isOwner,
  qrs,
  onChange,
}: {
  isOwner: boolean;
  qrs: PaymentQr[];
  onChange: (updated: PaymentQr[]) => void;
}) {
  const [processing, setProcessing] = useState(false);

  async function handleUpload(file: File, indexToReplace?: number) {
    try {
      setProcessing(true);
      const dataUrl = await processQrImageFile(file);

      if (indexToReplace !== undefined) {
        // Replacing existing slot
        const updated = [...qrs];
        updated[indexToReplace] = {
          ...updated[indexToReplace],
          image_url: dataUrl,
          updated_at: new Date().toISOString(),
        };
        onChange(updated);
        toast.success(`QR image updated for "${updated[indexToReplace].name || `QR ${indexToReplace + 1}`}"`);
      } else {
        // Adding new slot
        if (qrs.length >= 3) {
          toast.error("Maximum of 3 payment QR codes allowed.");
          return;
        }

        const newQr: PaymentQr = {
          id: crypto.randomUUID(),
          name: `QR ${qrs.length + 1}`,
          image_url: dataUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        onChange([...qrs, newQr]);
        toast.success("New payment QR added. Remember to click 'Save settings'.");
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to process QR image.");
    } finally {
      setProcessing(false);
    }
  }

  function handleNameChange(index: number, newName: string) {
    const updated = [...qrs];
    updated[index] = {
      ...updated[index],
      name: newName,
      updated_at: new Date().toISOString(),
    };
    onChange(updated);
  }

  function handleRemove(index: number) {
    const name = qrs[index]?.name || `Slot ${index + 1}`;
    if (!window.confirm(`Remove payment QR "${name}"?`)) return;
    const updated = qrs.filter((_, i) => i !== index);
    onChange(updated);
    toast.success(`Removed "${name}". Remember to click 'Save settings'.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Configure up to 3 payment QR codes (e.g. Mauli, HDFC, Axis). These appear during WhatsApp quotation sharing and for UPI payment tracking.
        </p>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {qrs.length} of 3 configured
        </span>
      </div>

      {qrs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
          <QrCode className="mb-2 h-10 w-10 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">No Payment QR Codes Configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add your hotel's UPI payment QR codes so staff can attach them to quotations and track receiving accounts.
          </p>
          {isOwner && (
            <div className="mt-4">
              <Button size="sm" variant="outline" asChild disabled={processing}>
                <label className="cursor-pointer">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Upload First QR Code
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    disabled={processing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {qrs.map((qr, idx) => (
            <div
              key={qr.id || idx}
              className="flex flex-col rounded-xl border bg-card p-3 shadow-sm transition hover:shadow-md"
            >
              {/* Header with Slot & Delete */}
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Slot {idx + 1}
                </span>
                {isOwner && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(idx)}
                    title="Remove QR"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* QR Image Preview */}
              <div className="relative mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-white p-2">
                <img
                  src={qr.image_url}
                  alt={qr.name}
                  className="h-full w-full object-contain"
                />
              </div>

              {/* Name input */}
              <div className="space-y-1.5">
                <Label className="text-xs">Account / Custom Name</Label>
                <Input
                  disabled={!isOwner}
                  value={qr.name}
                  placeholder="e.g. Mauli, HDFC, Axis"
                  className="h-8 text-xs font-medium"
                  onChange={(e) => handleNameChange(idx, e.target.value)}
                />
              </div>

              {/* Replace button */}
              {isOwner && (
                <div className="mt-3 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full text-xs font-normal"
                    asChild
                    disabled={processing}
                  >
                    <label className="cursor-pointer">
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Replace Image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        className="hidden"
                        disabled={processing}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(f, idx);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                </div>
              )}
            </div>
          ))}

          {/* Add slot placeholder if fewer than 3 */}
          {qrs.length < 3 && isOwner && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center min-h-[220px]">
              <div className="rounded-full bg-primary/10 p-3 text-primary mb-2">
                <Plus className="h-5 w-5" />
              </div>
              <p className="text-xs font-medium">Add QR Slot ({qrs.length + 1} of 3)</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">PNG, JPG, or JPEG up to 5MB</p>
              <div className="mt-3">
                <Button size="sm" variant="outline" className="h-8 text-xs" asChild disabled={processing}>
                  <label className="cursor-pointer">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload QR
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      className="hidden"
                      disabled={processing}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
