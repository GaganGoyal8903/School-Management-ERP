# School Management System - Production Ready

## System Overview

A complete, production-ready School Management System built with:
- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Authentication**: JWT with role-based access control

## Features Implemented

### 1. Authentication System
- JWT-based authentication
- Role-based access control (Admin, Teacher, Student)
- Protected routes
- Secure password hashing with bcrypt

### 2. User Roles & Permissions

| Role | Permissions |
|------|-------------|
| Admin | Full access to all features |
| Teacher | Students, Subjects, Materials, Attendance, Exams |
| Student | View own profile, materials, attendance, grades |

### 3. Dashboard
- Role-based statistics
- Quick actions
- Recent students
- System information

### 4. Modules
- **Students Management**: CRUD operations, search, filter, pagination
- **Teachers Management**: Add, edit, delete, assign subjects
- **Subjects Management**: Create, edit, delete, assign teachers
- **Materials Upload**: File upload, filter by subject/grade
- **Attendance System**: Mark attendance, view reports
- **Exam Management**: Create exams, enter marks, generate results
- **Reports & Analytics**: Dashboard stats, charts

## Fixes Applied

### Dashboard.jsx
- Fixed missing closing tags in JSX structure
- Fixed API response handling for stats (now correctly parses nested `stats` object)
- Changed anchor tags to React Router Link components for proper navigation
- Updated field names to match API response (`class`, `section`)

### Students.jsx
- Fixed field name mismatch between form and API (`grade` → `class`, `rollNo` → `rollNumber`)
- Added complete form fields matching the Student model schema
- Added support for nested address object

### Login.jsx
- Integrated with AuthContext for consistent authentication
- Added demo credentials display

### API Service
- All endpoints properly configured with JWT authorization
- Response handling updated for consistent data structure

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user

### Students
- `GET /api/students` - List students (paginated)
- `POST /api/students` - Create student (Admin)
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student (Admin)

### Teachers
- `GET /api/teachers` - List teachers
- `POST /api/teachers` - Create teacher (Admin)
- `PUT /api/teachers/:id` - Update teacher
- `DELETE /api/teachers/:id` - Delete teacher (Admin)

### Subjects
- `GET /api/subjects` - List subjects
- `POST /api/subjects` - Create subject (Admin)
- `PUT /api/subjects/:id` - Update subject
- `DELETE /api/subjects/:id` - Delete subject (Admin)

### Materials
- `GET /api/materials` - List materials
- `POST /api/materials` - Upload material

### Attendance
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance` - Mark attendance
- `POST /api/attendance/bulk` - Bulk mark attendance

### Exams
- `GET /api/exams` - List exams
- `POST /api/exams` - Create exam (Admin/Teacher)
- `PUT /api/exams/:id` - Update exam

### Reports
- `GET /api/reports/dashboard` - Dashboard statistics
- `GET /api/reports/analytics` - Analytics data

## Running the Application

### Backend
```bash
cd server
npm install
npm start
```
Server runs on http://localhost:5000

### Frontend
```bash
cd client
npm install
npm run dev
```
Client runs on http://localhost:5173

### Seed Data
```bash
cd server
node seed.js
```

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | gagan.admin@mayo.edu | Mayo@123 |
| Teacher | vikram.teacher@mayo.edu | Mayo@123 |

## Project Structure

```
school-management-system/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── context/           # Auth context
│   │   ├── pages/             # Page components
│   │   ├── services/          # API services
│   │   └── ...
│   └── package.json
│
├── server/                    # Express backend
│   ├── controllers/           # Route controllers
│   ├── middleware/            # Auth, role, error middleware
│   ├── models/                # Mongoose models
│   ├── routes/                # API routes
│   ├── server.js              # Entry point
│   └── package.json
│
└── README.md
```

## Production Deployment

### Frontend (Vercel/Netlify)
1. Build: `npm run build`
2. Deploy the `dist` folder

### Backend (Render/Railway)
1. Set environment variables:
   - `MONGO_URI` - MongoDB connection string
   - `JWT_SECRET` - Your JWT secret
   - `PORT` - Server port

### Database
Use MongoDB Atlas for cloud database or local MongoDB

## Version
1.0.0 - Production Ready

