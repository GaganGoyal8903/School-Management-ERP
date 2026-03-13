import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  FileText, 
  Calendar, 
  ClipboardCheck,
  BarChart3,
  Settings,
  GraduationCap,
  LogOut,
  Bus,
  Clock,
  Sparkles,
  DollarSign
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout, isAdmin, isTeacher, isParent, isAccountant } = useAuth();

  const adminLinks = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/students', icon: Users, label: 'Students' },
    { path: '/teachers', icon: GraduationCap, label: 'Teachers' },
    { path: '/subjects', icon: BookOpen, label: 'Subjects' },
    { path: '/materials', icon: FileText, label: 'Materials' },
    { path: '/attendance', icon: Calendar, label: 'Attendance' },
    { path: '/exams', icon: ClipboardCheck, label: 'Exams' },
    { path: '/fees', icon: DollarSign, label: 'Fees' },
    { path: '/bus-tracking', icon: Bus, label: 'Bus Tracking' },
    { path: '/timetable', icon: Clock, label: 'Timetable' },
    { path: '/reports', icon: BarChart3, label: 'Reports' },
    { path: '/ai-tools', icon: Sparkles, label: 'AI Tools' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  const teacherLinks = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/students', icon: Users, label: 'Students' },
    { path: '/subjects', icon: BookOpen, label: 'Subjects' },
    { path: '/materials', icon: FileText, label: 'Materials' },
    { path: '/attendance', icon: Calendar, label: 'Attendance' },
    { path: '/exams', icon: ClipboardCheck, label: 'Exams' },
    { path: '/timetable', icon: Clock, label: 'Timetable' },
    { path: '/ai-tools', icon: Sparkles, label: 'AI Tools' },
  ];

  const studentLinks = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/timetable', icon: Clock, label: 'Timetable' },
  ];

  const parentLinks = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/bus-tracking', icon: Bus, label: 'Bus Tracking' },
    { path: '/timetable', icon: Clock, label: 'Timetable' },
  ];

  const accountantLinks = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/fees', icon: DollarSign, label: 'Fees' },
    { path: '/reports', icon: BarChart3, label: 'Reports' },
  ];

  const links = isAdmin
    ? adminLinks
    : isTeacher
      ? teacherLinks
      : isAccountant
        ? accountantLinks
        : isParent
          ? parentLinks
          : studentLinks;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-screen w-64 bg-[#002366] text-white flex flex-col
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="p-4 border-b border-white/10 flex-shrink-0">
          <h1 className="text-xl font-bold text-[#C5A059]">Mayo College</h1>
          <p className="text-xs text-gray-300">Management System</p>
        </div>

        {/* Scrollable Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                ${isActive 
                  ? 'bg-[#C5A059] text-[#002366]' 
                  : 'hover:bg-white/10'
                }
              `}
            >
              <link.icon className="w-5 h-5" />
              <span className="font-medium">{link.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Fixed Bottom - User info & Logout */}
        <div className="flex-shrink-0 p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[#C5A059] flex items-center justify-center text-[#002366] font-bold">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.fullName}</p>
              <p className="text-xs text-gray-300 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

