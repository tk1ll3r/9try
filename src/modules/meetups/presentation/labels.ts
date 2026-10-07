export const meetupsKey = ["meetups"] as const;

export const statusLabel = { draft: "Nháp", proposed: "Đang đề xuất", confirmed: "Đã chốt", canceled: "Đã hủy", completed: "Đã xong" } as const;
export const rsvpLabel = { going: "Đi", maybe: "Có thể", pending: "Chưa trả lời", declined: "Không đi" } as const;

export const formatTime = (value: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
export const formatRange = (start: string, end: string) => `${formatTime(start)} → ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(end))}`;
