import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import WarfrontRoom, { WarfrontRoomUnavailable } from "@/components/warfront/WarfrontRoom";
import { isWarfrontOperationRoomId } from "@/lib/warfront/contracts";
import { getWarfrontOperationRoomBootstrap } from "@/lib/warfront/room";

type WarfrontOperationRoomPageProps = { params: Promise<{ operationId: string }> };

export default async function WarfrontOperationRoomPage({ params }: WarfrontOperationRoomPageProps) {
  const { operationId } = await params;
  if (!isWarfrontOperationRoomId(operationId)) return <WarfrontRoomUnavailable code="invalid_operation_id" />;

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const bootstrap = await getWarfrontOperationRoomBootstrap(operationId);
  if (!bootstrap.ok) {
    if (bootstrap.code === "unauthenticated") redirect("/sign-in");
    return <WarfrontRoomUnavailable code={bootstrap.code} />;
  }
  return <WarfrontRoom bootstrap={bootstrap.data} />;
}
