import { WarrantyPage } from "@/components/warranty/warranty-pages";
export default async function Page({ params, searchParams }: { params: Promise<{ claimId: string }>; searchParams: Promise<{ archiveBranch?: string }> }) {
  const { claimId } = await params;
  const { archiveBranch } = await searchParams;
  return <WarrantyPage mode="detail" claimId={claimId} archiveBranch={archiveBranch} />;
}
