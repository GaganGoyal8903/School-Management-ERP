import { useState, useEffect } from 'react';
import { Bell, AlertCircle, CheckCircle, Info, X } from 'lucide-react';

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Mock notifications - in production, fetch from API
  useEffect(() => {
    const mockNotifications = [
      {
        id: 1,
        type: 'warning',
        title: 'Fee Due',
        message: 'Class 10 fees due date is tomorrow',
        time: '2 hours ago',
        read: false
      },
      {
        id: 2,
        type: 'info',
        title: 'Exam Schedule',
        message: 'Half-yearly exams schedule published',
        time: '5 hours ago',
        read: false
      },
      {
        id: 3,
        type: 'success',
        title: 'Attendance',
        message: 'Today\'s attendance marked successfully',
        time: '1 day ago',
        read: true
      }
    ];
    setNotifications(mockNotifications);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type) => {
    switch (type) {
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getBgColor = (type) => {
    switch (type) {
      case 'warning': return 'bg-yellow-50';
      case 'success': return 'bg-green-50';
      case 'error': return 'bg-red-50';
      default: return 'bg-blue-50';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {notifications.length > 0 ? (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-blue-50/50' : ''}`}
                  >
                    <div className="flex gap-3">
                      <div className={`p-2 rounded-lg ${getBgColor(notification.type)}`}>
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm text-gray-900">{notification.title}</p>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5"></span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">{notification.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{notification.time}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No notifications</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-gray-100">
              <button className="w-full text-center text-sm text-[#002366] hover:text-[#001a4d] font-medium">
                View All Notifications
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;

