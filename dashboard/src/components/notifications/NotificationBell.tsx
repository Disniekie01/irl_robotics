import { Bell, Check, Info, AlertTriangle, AlertCircle, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications, NotificationType } from "@/stores/notifications";
import { cn } from "@/lib/utils";

function typeIcon(type: NotificationType) {
  switch (type) {
    case "success": return <Check className="size-3.5 text-green-400" />;
    case "warning": return <AlertTriangle className="size-3.5 text-amber-400" />;
    case "error": return <AlertCircle className="size-3.5 text-red-400" />;
    default: return <Info className="size-3.5 text-blue-400" />;
  }
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, dismiss, clear } = useNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative p-1.5 rounded-md hover:bg-accent transition-colors"
          onClick={markAllRead}
        >
          <Bell className="size-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 size-4 flex items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-medium">Notifications</span>
          {notifications.length > 0 && (
            <button
              onClick={clear}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2.5 border-b border-border/50 last:border-0 group",
                  !n.read && "bg-accent/30"
                )}
              >
                <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground">{n.title}</div>
                  {n.message && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {n.message}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {timeAgo(n.timestamp)}
                  </div>
                </div>
                <button
                  onClick={() => dismiss(n.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-accent rounded transition-all shrink-0"
                >
                  <X className="size-3 text-muted-foreground" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
