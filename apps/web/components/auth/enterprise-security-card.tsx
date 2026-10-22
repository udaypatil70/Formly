import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";

export function EnterpriseSecurityCard() {
  const utils = trpc.useUtils();
  const sso = trpc.auth.getSsoConfiguration.useQuery();
  const audit = trpc.audit.list.useQuery({ limit: 10, offset: 0 });
  const createSaml = trpc.auth.createSamlProvider.useMutation();
  const requestVerification =
    trpc.auth.requestSsoDomainVerification.useMutation();
  const verifyDomain = trpc.auth.verifySsoDomain.useMutation();
  const deleteSso = trpc.auth.deleteSsoProvider.useMutation();

  const [domain, setDomain] = useState("");
  const [idpEntityId, setIdpEntityId] = useState("");
  const [entryPoint, setEntryPoint] = useState("");
  const [certificate, setCertificate] = useState("");
  const [verification, setVerification] = useState<{
    domain: string;
    record: string;
    token: string;
  } | null>(null);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await createSaml.mutateAsync({
        domain,
        idpEntityId,
        entryPoint,
        certificate,
      });
      setVerification({
        domain: result.domain,
        record: result.verificationRecord,
        token: result.domainVerificationToken,
      });
      setDomain("");
      setIdpEntityId("");
      setEntryPoint("");
      setCertificate("");
      await sso.refetch();
      toast.success("SAML provider saved. Verify your domain to enable sign-in.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save SAML provider");
    }
  };

  const handleRequestVerification = async () => {
    try {
      const result = await requestVerification.mutateAsync();
      setVerification({
        domain: result.domain,
        record: result.record,
        token: result.token,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create DNS verification record");
    }
  };

  const handleVerify = async () => {
    try {
      await verifyDomain.mutateAsync();
      setVerification(null);
      await sso.refetch();
      toast.success("SAML domain verified");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "DNS verification failed");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Remove SAML single sign-on for this account?")) return;
    try {
      await deleteSso.mutateAsync();
      setVerification(null);
      await sso.refetch();
      toast.success("SAML provider removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove SAML provider");
    }
  };

  if (sso.isLoading || audit.isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Spinner className="size-5" />
        </CardContent>
      </Card>
    );
  }

  const provider = sso.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enterprise SAML SSO</CardTitle>
          <CardDescription>
            Configure an identity provider for an existing, verified Formly account.
            Domain ownership must be verified before SSO sign-in is accepted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {provider?.providerId ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{provider.domain}</p>
                  <p className="text-muted-foreground text-xs">
                    {provider.domainVerified ? "Domain verified" : "Domain verification required"}
                  </p>
                </div>
                {provider.domainVerified ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-500">
                    Active
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRequestVerification()}
                    disabled={requestVerification.isPending}
                  >
                    {requestVerification.isPending ? <Spinner /> : null}
                    Show DNS record
                  </Button>
                )}
              </div>
              {provider.serviceProviderMetadataUrl ? (
                <p className="text-sm">
                  <a
                    className="text-primary underline"
                    href={provider.serviceProviderMetadataUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Service provider metadata
                  </a>
                </p>
              ) : null}
              {verification ? (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Publish this DNS TXT record</p>
                  <div className="space-y-1 text-xs">
                    <p>
                      Host:{" "}
                      <code>{verification.record}.{verification.domain}</code>
                    </p>
                    <p>
                      Value: <code className="break-all">{verification.token}</code>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void handleVerify()}
                    disabled={verifyDomain.isPending}
                  >
                    {verifyDomain.isPending ? <Spinner /> : null}
                    Verify domain
                  </Button>
                </div>
              ) : null}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleDelete()}
                disabled={deleteSso.isPending}
              >
                {deleteSso.isPending ? <Spinner /> : null}
                Remove SSO
              </Button>
            </>
          ) : (
            <form onSubmit={(event) => void handleCreate(event)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="saml-domain">Organization email domain</Label>
                <Input
                  id="saml-domain"
                  placeholder="example.com"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="saml-entity-id">Identity provider entity ID</Label>
                <Input
                  id="saml-entity-id"
                  value={idpEntityId}
                  onChange={(event) => setIdpEntityId(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="saml-entry-point">Identity provider SSO URL</Label>
                <Input
                  id="saml-entry-point"
                  type="url"
                  value={entryPoint}
                  onChange={(event) => setEntryPoint(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="saml-certificate">Identity provider signing certificate</Label>
                <Textarea
                  id="saml-certificate"
                  rows={5}
                  value={certificate}
                  onChange={(event) => setCertificate(event.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  required
                />
              </div>
              <Button type="submit" disabled={createSaml.isPending}>
                {createSaml.isPending ? <Spinner /> : null}
                Save SAML provider
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>
            Recent account changes. Records are automatically purged after 90 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {audit.isError ? (
            <p className="text-destructive text-sm">
              Could not load the audit log: {audit.error.message}
            </p>
          ) : audit.data?.events.length ? (
            <div className="space-y-3">
              {audit.data.events.map((event) => (
                <div key={event.id} className="flex flex-wrap justify-between gap-2 border-b pb-3 last:border-0">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">{event.action}</p>
                    <p className="text-muted-foreground text-xs">
                      {event.resourceType}
                      {event.resourceId ? ` · ${event.resourceId}` : ""}
                    </p>
                  </div>
                  <time className="text-muted-foreground text-xs">
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No account changes recorded yet.</p>
          )}
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => void utils.audit.list.invalidate()}
          >
            Refresh audit log
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
