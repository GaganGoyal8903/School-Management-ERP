import { useState, useEffect } from "react";
import { Bell, AlertCircle, Calendar, Star } from "lucide-react";
import { getNotices } from "../services/api";

const MAYO_LOGO = "https://upload.wikimedia.org/wikipedia/en/b/b5/Mayo_College_logo.png";

const categoryStyles = {
  Urgent: { 
    border: "border-l-red-500", 
    bg: "bg-red-50", 
    badge: "bg-red-500",
    icon: AlertCircle,
    iconColor: "text-red-500"
  },
  Event: { 
    border: "border-l-amber-500", 
    bg: "bg-amber-50", 
    badge: "bg-amber-500",
    icon: Star,
    iconColor: "text-amber-500"
  },
  Holiday: { 
    border: "border-l-blue-500", 
    bg: "bg-blue-50", 
    badge: "bg-blue-500",
    icon: Calendar,
    iconColor: "text-blue-500"
  }
};

export default function LiveNotices({ maxNotices = 3 }) {
  const [sms_notices, setSms_notices] = useState([]);
  const [sms_loading, setSms_loading] = useState(true);

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    try {
      const response = await getNotices({ isActive: true });
      setSms_notices(response.data.notices || []);
    } catch (error) {
      console.error("Fetch notices error:", error);
    } finally {
      setSms_loading(false);
    }
  };

  if (sms_loading) {
    return (
      <div className="rounded-xl border border-[#d8c08a] bg-[#fffff0] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={18} className="text-[#002366]" />
          <h3 className="font-semibold text-[#002366]">Live Notices</h3>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-16 bg-slate-200 rounded-lg"></div>
          <div className="h-16 bg-slate-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (sms_notices.length === 0) {
    return null;
  }

  const displayNotices = sms_notices.slice(0, maxNotices);

  return (
    <div className="rounded-xl border border-[#d8c08a] bg-[#fffff0] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <img src={MAYO_LOGO} alt="Mayo" className="h-6 w-6 rounded-full border border-[#c5a059]" />
          <h3 className="font-semibold text-[#002366]">Live Notices</h3>
        </div>
        <span className="text-xs text-slate-500">{sms_notices.length} total</span>
      </div>

      <div className="space-y-2">
        {displayNotices.map((notice) => {
          const style = categoryStyles[notice.category] || categoryStyles.Urgent;
          const IconComponent = style.icon;

          return (
            <div
              key={notice._id}
              className={`rounded-lg border-l-4 ${style.border} ${style.bg} p-3 transition hover:shadow-md cursor-pointer`}
            >
              <div className="flex items-start gap-2">
                <IconComponent size={16} className={style.iconColor} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`${style.badge} text-white text-xs px-1.5 py-0.5 rounded-full`}>
                      {notice.category}
                    </span>
                  </div>
                  <h4 className="font-medium text-sm text-[#002366] truncate">{notice.title}</h4>
                  <p className="text-xs text-slate-600 line-clamp-2 mt-1">{notice.content}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sms_notices.length > maxNotices && (
        <p className="text-xs text-center text-slate-500 mt-3">
          +{sms_notices.length - maxNotices} more notices
        </p>
      )}
    </div>
  );
}

