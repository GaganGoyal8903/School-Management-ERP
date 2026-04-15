require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require("cors");
const { initSqlServer } = require('./config/sqlServer');
const User = require('./models/User');
const { syncUserAuthRecord } = require('./services/authSqlService');
const { migrateLegacyPasswordHashes } = require('./services/passwordHashMigrationService');

const { errorMiddleware, notFound } = require('./middleware/errorMiddleware');

// Import routes
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const classRoutes = require('./routes/classRoutes');
const sectionRoutes = require('./routes/sectionRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const materialRoutes = require('./routes/materialRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const examRoutes = require('./routes/examRoutes');
const reportRoutes = require('./routes/reportRoutes');
const feeRoutes = require('./routes/feeRoutes');
const busRoutes = require('./routes/busRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const parentRoutes = require('./routes/parentRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();
const DEFAULT_ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? []
  : [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];

const normalizeOrigin = (value = '') => String(value || '').trim().replace(/\/+$/, '');

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...DEFAULT_ALLOWED_ORIGINS,
]
  .map(normalizeOrigin)
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(normalizeOrigin(origin));
};

let isMongoReady = false;
let isSqlReady = false;
let authSyncInFlight = null;
let httpServer = null;

const attemptInitialAuthSync = async () => {
  if (!isMongoReady || !isSqlReady) {
    return false;
  }

  if (authSyncInFlight) {
    return authSyncInFlight;
  }

  authSyncInFlight = (async () => {
    const users = await User.find({})
      .select('fullName email password role phone isActive lastLogin')
      .lean();

    if (!users.length) {
      console.log('[auth-sync] No Mongo users found to sync into SQL auth.');
      return true;
    }

    let syncedCount = 0;

    for (const user of users) {
      if (!user?._id || !user?.email || !user?.password) {
        continue;
      }

      try {
        await syncUserAuthRecord(user);
        syncedCount += 1;
      } catch (error) {
        console.warn(`[auth-sync] Failed to sync ${user.email}: ${error.message}`);
      }
    }

    console.log(`[auth-sync] Synced ${syncedCount}/${users.length} Mongo users to SQL auth.`);

    const passwordHashMigration = await migrateLegacyPasswordHashes();
    if (
      passwordHashMigration.mongo.updated ||
      passwordHashMigration.sql.primary.updated ||
      passwordHashMigration.sql.mirror.updated
    ) {
      console.warn('[auth-sync] Migrated legacy plain-text passwords to bcrypt hashes', {
        mongoUpdated: passwordHashMigration.mongo.updated,
        primarySqlUpdated: passwordHashMigration.sql.primary.updated,
        mirrorSqlUpdated: passwordHashMigration.sql.mirror.updated,
      });
    }

    return true;
  })().catch((error) => {
    authSyncInFlight = null;
    throw error;
  });

  return authSyncInFlight;
};

// ================= ENHANCED SECURITY =================
app.set('trust proxy', 1);
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));

// ================= PARSER =================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ================= DATABASE =================
const MONGO_URI = process.env.MONGO_URI || (process.env.NODE_ENV === 'production'
  ? ''
  : 'mongodb://127.0.0.1:27017/mayo_college_db');

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is required in production.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    isMongoReady = true;
    console.log("✅ MongoDB Connected Successfully");
    await attemptInitialAuthSync();
  })
  .catch((err) => console.error("❌ MongoDB Error:", err.message));

initSqlServer()
  .then(async () => {
    isSqlReady = true;
    console.log("✅ SQL Server Initialized");
    await attemptInitialAuthSync();
  })
  .catch((err) => console.warn("⚠️ SQL Server bootstrap skipped:", err.message));

// ================= API ROUTES =================

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    message: "School Management API Secure & Running",
    timestamp: new Date().toISOString(),
    security: "helmet/cors/logging ✅"
  });
});

// Dashboard route - returns simplified stats for dashboard cards
app.get("/api/dashboard", async (req, res) => {
  try {
    const { getDashboardReport } = require('./services/reportSqlService');
    const dashboard = await getDashboardReport({});

    res.json({
      totalStudents: Number(dashboard?.stats?.students || 0),
      totalTeachers: Number(dashboard?.stats?.teachers || 0),
      totalSubjects: Number(dashboard?.stats?.subjects || 0),
      totalMaterials: Number(dashboard?.stats?.materials || 0)
    });
  } catch (error) {
    console.error('[dashboard] Error:', error.message);
    res.status(500).json({ message: 'Dashboard data unavailable' });
  }
});

// Auth routes
app.use("/api/auth", authRoutes);

// Student routes
app.use("/api/students", studentRoutes);
// Backward-compatible student routes (legacy singular prefix)
app.use("/api/student", studentRoutes);

// Teacher routes
app.use("/api/teachers", teacherRoutes);

// Class routes
app.use("/api/classes", classRoutes);

// Section routes
app.use("/api/sections", sectionRoutes);

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

// AI routes
app.use("/api/ai", aiRoutes);

// ================= LEGACY / BACKWARD-COMPAT NOTES =================
// - /api/student is mounted for backward compatibility with older clients.
// - /api/login (duplicate of /api/auth/login) - REMOVED
// - /api/register (duplicate of /api/auth/register) - REMOVED

// ================= ERROR HANDLING =================
app.use(notFound);
app.use(errorMiddleware);

// ================= START SERVER =================
const PORT = parseInt(process.env.PORT) || 5000;

const startServer = async (port) => {
  httpServer = app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 School Management Server Secure on http://localhost:${port}`);
    console.log(`📊 Health: http://localhost:${port}/api/health`);
    console.log(`🔧 Data Sync: cd server && npm run sync-sections`);
    console.log(`📱 Frontend: cd client && npm run dev`);
  });

  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `❌ Port ${port} is already in use. Stop the existing backend process or set PORT consistently for both client and server.`
      );
      process.exit(1);
      return;
    }
    console.error('❌ Server error:', error.message);
  });
};

startServer(PORT).catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM. Graceful shutdown...');

  if (!httpServer) {
    mongoose.connection.close(() => process.exit(0));
    return;
  }

  httpServer.close(() => {
    mongoose.connection.close();
    console.log('✅ Connections closed');
    process.exit(0);
  });
});
