import { CheckCircle2, Link2Off } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { groupsData } from "../infrastructure/GroupsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

export function GroupInvitePage() {
  const { token } = useParams();
  const [state, setState] = useState<"joining" | "joined" | "error">("joining");
  const [message, setMessage] = useState("Đang kiểm tra lời mời…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Liên kết mời không hợp lệ.");
      return;
    }
    void groupsData.claim(token).then(() => {
      setState("joined");
      setMessage("Bạn đã tham gia nhóm.");
    }).catch((error: Error) => {
      setState("error");
      const text = error.message;
      setMessage(text.includes("expired") ? "Liên kết mời đã hết hạn." : text.includes("revoked") ? "Liên kết mời đã bị thu hồi." : text.includes("exhausted") ? "Liên kết mời đã hết lượt sử dụng." : "Không thể sử dụng liên kết mời này.");
    });
  }, [token]);

  return (
    <div className="mx-auto max-w-xl pt-10">
      <Card>
        <div className="py-8 text-center">
          {state === "joined" ? <CheckCircle2 className="mx-auto text-emerald-600" size={42} /> : state === "error" ? <Link2Off className="mx-auto text-red-500" size={42} /> : <div className="mx-auto size-10 animate-pulse rounded-full bg-[var(--soft)]" />}
          <h1 className="mt-5 text-2xl font-black">{state === "joining" ? "Đang tham gia nhóm" : state === "joined" ? "Xong rồi!" : "Lời mời không dùng được"}</h1>
          <p className="mt-2 text-[var(--muted)]">{message}</p>
          {state !== "joining" && <Link to="/groups"><Button className="mt-6">Mở danh sách nhóm</Button></Link>}
        </div>
      </Card>
    </div>
  );
}
