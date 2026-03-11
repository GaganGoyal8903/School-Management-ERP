require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const { errorMiddleware, notFound } = require('./middleware/errorMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const materialRoutes = require('./routes/materialRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const examRoutes = require('./routes/examRoutes');
const reportRoutes = require('./routes/reportRoutes');
const feeRoutes = require('./routes/feeRoutes');
const busRoutes = require('./routes/busRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const parentRoutes = require('./routes/parentRoutes');

const app = express();

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= DATABASE =================
const MONGO_URI = process.env.MONGO_URI || "mongodb://gagangoyal878_db_user:wKlY3lEVmyKv2QLt@testcluster-shard-00-00.yshysvv.mongodb.net:27017,testcluster-shard-00-01.yshysvv.mongodb.net:27017,testcluster-shard-00-02.yshysvv.mongodb.net:27017/mayo_college_db?ssl=true&replicaSet=atlas-shard-0&authSource=admin&retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.log("MongoDB Error:", err.message));

// ================= API ROUTES =================

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "School Management API is running" });
});

// Dashboard route - returns simplified stats for dashboard cards
app.get("/api/dashboard", async (req, res) => {
  try {
    const User = require('./models/User');
    const Student = require('./models/Student');
    const Subject = require('./models/Subject');
    const Material = require('./models/Material');
    
    const totalStudents = await Student.countDocuments({ isActive: true });
    const totalTeachers = await User.countDocuments({ role: 'teacher', isActive: { $ne: false } });
    const totalSubjects = await Subject.countDocuments();
    const totalMaterials = await Material.countDocuments();

    res.json({
      totalStudents,
      totalTeachers,
      totalSubjects,
      totalMaterials
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Auth routes
app.use("/api/auth", authRoutes);

// Student routes
app.use("/api/students", studentRoutes);

// Teacher routes
app.use("/api/teachers", teacherRoutes);

// Subject routes
app.use("/api/subjects", subjectRoutes);

// Material routes
app.use("/api/materials", materialRoutes);

// Attendance routes
app.use("/api/attendance", attendanceRoutes);

// Exam routes
app.use("/api/exams", examRoutes);

// Report routes
app.use("/api/reports", reportRoutes);

// Fee routes
app.use("/api/fees", feeRoutes);

// Bus routes
app.use("/api/buses", busRoutes);

// Timetable routes
app.use("/api/timetables", timetableRoutes);

// Parent routes
app.use("/api/parent", parentRoutes);

// ================= REMOVED LEGACY ROUTES (now using authRoutes only) =================
// - /api/student (duplicate of /api/students) - REMOVED
// - /api/login (duplicate of /api/auth/login) - REMOVED
// - /api/register (duplicate of /api/auth/register) - REMOVED

// ================= ERROR HANDLING =================
app.use(notFound);
app.use(errorMiddleware);

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`School Management Server Running on http://localhost:${PORT}`);
});

