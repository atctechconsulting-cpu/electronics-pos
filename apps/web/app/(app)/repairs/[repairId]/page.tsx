import { RepairDetailPage } from "@/components/repairs/repair-detail";

export default async function RepairPage({ params }: { params: Promise<{ repairId: string }> }) {
  const { repairId } = await params;
  return <RepairDetailPage repairId={repairId} />;
}
