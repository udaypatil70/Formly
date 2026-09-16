import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  CheckIcon,
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  LinkedinIcon,
  MessageCircleIcon,
  QrCodeIcon,
  TwitterIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

type ShareTarget = { id: string; title: string; slug: string } | null;

export function ShareDialog({
  form,
  open,
  onOpenChange,
}: {
  form: ShareTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  if (!form) return null;

  const url = `${window.location.origin}/f/${form.slug}`;
  const shareText = `Check out "${form.title}" on FormForge`;
  const embedCode = `<iframe src="${url}" width="100%" height="640" style="border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe>`;

  const copy = (key: string, text: string, label: string) => async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label} copied to clipboard`);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  const openShare = (shareUrl: string) => {
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const downloadQr = () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${form.slug}-qr.png`;
    link.click();
    toast.success("QR code downloaded");
  };

  const socials = [
    {
      key: "twitter",
      label: "Twitter / X",
      className: "hover:border-zinc-400 hover:text-zinc-900",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`,
      icon: TwitterIcon,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      className: "hover:text-blue-700",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      icon: LinkedinIcon,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      className: "hover:text-green-600",
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`,
      icon: MessageCircleIcon,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{form.title}&rdquo;</DialogTitle>
          <DialogDescription>
            Share this link anywhere, or grab a QR code your audience can scan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Copy form link"
            onClick={copy("link", url, "Link")}
          >
            {copiedKey === "link" ? (
              <CheckIcon className="text-green-600" />
            ) : (
              <CopyIcon />
            )}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {socials.map((social) => (
            <Button
              key={social.key}
              variant="outline"
              className={cn(
                "flex flex-col items-center gap-1.5 py-3 text-xs font-medium",
                social.className,
              )}
              onClick={() => openShare(social.href)}
            >
              <social.icon className="size-4" />
              {social.label}
            </Button>
          ))}
        </div>

        <Tabs defaultValue="qr">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="qr">
              <QrCodeIcon />
              QR code
            </TabsTrigger>
            <TabsTrigger value="embed">
              <Code2Icon />
              Embed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="qr" className="pt-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg border bg-white p-3">
                <QRCodeCanvas
                  ref={qrRef}
                  value={url}
                  size={180}
                  level="M"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#18181b"
                  title={`QR code for ${url}`}
                />
              </div>
              <p className="text-muted-foreground text-xs text-center">
                Scan to open the form on any device.
              </p>
              <Button variant="outline" size="sm" onClick={downloadQr}>
                <DownloadIcon />
                Download PNG
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="embed" className="pt-4">
            <div className="space-y-3">
              <div className="border-input bg-muted relative rounded-md border p-3">
                <code className="font-mono text-muted-foreground block text-xs break-all whitespace-pre-wrap">
                  {embedCode}
                </code>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={copy("embed", embedCode, "Embed code")}
              >
                {copiedKey === "embed" ? (
                  <>
                    <CheckIcon className="text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon />
                    Copy embed code
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}