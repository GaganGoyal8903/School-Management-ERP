require("dotenv").config();
const mongoose = require("mongoose");

// MongoDB URI - Same as server.js
const MONGO_URI = process.env.MONGO_URI || "mongodb://gagangoyal878_db_user:wKlY3lEVmyKv2QLt@testcluster-shard-00-00.yshysvv.mongodb.net:27017,testcluster-shard-00-01.yshysvv.mongodb.net:27017,testcluster-shard-00-02.yshysvv.mongodb.net:27017/mayo_college_db?ssl=true&replicaSet=atlas-shard-0&authSource=admin&retryWrites=true&w=majority";

// Import Models
const User = require("./models/User");
const Student = require("./models/Student");
const Subject = require("./models/Subject");
const Fee = require("./models/Fee");
const Bus = require("./models/Bus");
const Timetable = require("./models/Timetable");
const Attendance = require("./models/Attendance");
const Exam = require("./models/Exam");
const Grade = require("./models/Grade");

async function seed() {
  try {
    console.log("🚀 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected!\n");

    // Clear existing data
    console.log("🧹 Clearing existing data...");
    await User.deleteMany({});
    await Student.deleteMany({});
    await Subject.deleteMany({});
    await Fee.deleteMany({});
    await Bus.deleteMany({});
    await Timetable.deleteMany({});
    await Attendance.deleteMany({});
    await Exam.deleteMany({});
    await Grade.deleteMany({});
    console.log("✅ Existing data cleared!\n");

    // ==================== CREATE USERS ====================
    console.log("👤 Creating users...");

    // Admin User - Use plain password, will be hashed by pre-save hook
    const adminUser = await User.create({
      fullName: "Gagan Goyal",
      email: "gagan.admin@mayo.edu",
      password: "Mayo@123", // Plain password - will be hashed by pre-save hook
      role: "admin"
    });

    // Teacher Users (6 teachers as per requirement) - Create individually to trigger password hashing
    const teacherUsers = [];
    const teacherData = [
      { fullName: "Vikram Singh Rathore", email: "vikram.teacher@mayo.edu", phone: "+91 98765 43210" },
      { fullName: "Priya Sharma", email: "priya.teacher@mayo.edu", phone: "+91 98765 43211" },
      { fullName: "Rahul Verma", email: "rahul.teacher@mayo.edu", phone: "+91 98765 43212" },
      { fullName: "Anita Desai", email: "anita.teacher@mayo.edu", phone: "+91 98765 43213" },
      { fullName: "Mohammad Irfan", email: "irfan.teacher@mayo.edu", phone: "+91 98765 43214" },
      { fullName: "Sunita Kumari", email: "sunita.teacher@mayo.edu", phone: "+91 98765 43215" }
    ];

    for (const t of teacherData) {
      const teacher = await User.create({
        fullName: t.fullName,
        email: t.email,
        password: "Mayo@123", // Plain password - will be hashed by pre-save hook
        role: "teacher",
        phone: t.phone
      });
      teacherUsers.push(teacher);
    }
    console.log("✅ Created 1 admin and 6 teacher users");

    // Student Users (15 students) - Create individually to trigger password hashing
    const studentUsers = [];
    const studentUserData = [
      { fullName: "Aarav Sharma", email: "aarav.sharma@mayo.edu" },
      { fullName: "Riya Nair", email: "riya.nair@mayo.edu" },
      { fullName: "Kabir Mehta", email: "kabir.mehta@mayo.edu" },
      { fullName: "Ananya Patel", email: "ananya.patel@mayo.edu" },
      { fullName: "Arjun Singh", email: "arjun.singh@mayo.edu" },
      { fullName: "Saanvi Gupta", email: "saanvi.gupta@mayo.edu" },
      { fullName: "Reyansh Joshi", email: "reyansh.joshi@mayo.edu" },
      { fullName: "Aadhya Shah", email: "aadhya.shah@mayo.edu" },
      { fullName: "Vihaan Kumar", email: "vihaan.kumar@mayo.edu" },
      { fullName: "Myra Reddy", email: "myra.reddy@mayo.edu" },
      { fullName: "Krishna Iyer", email: "krishna.iyer@mayo.edu" },
      { fullName: "Avni Malhotra", email: "avni.malhotra@mayo.edu" },
      { fullName: "Dhruv Chauhan", email: "dhruv.chauhan@mayo.edu" },
      { fullName: "Kiara Bhatia", email: "kiara.bhatia@mayo.edu" },
      { fullName: "Aditya Mishra", email: "aditya.mishra@mayo.edu" }
    ];

    for (const s of studentUserData) {
      const student = await User.create({
        fullName: s.fullName,
        email: s.email,
        password: "Mayo@123", // Plain password - will be hashed by pre-save hook
        role: "student"
      });
      studentUsers.push(student);
    }
    console.log("✅ Created 15 student users\n");

    // ==================== CREATE SUBJECTS ====================
    console.log("📚 Creating subjects...");

    const subjects = await Subject.insertMany([
      { name: "Mathematics", grade: "Class 1", description: "Basic Math" },
      { name: "Science", grade: "Class 1", description: "General Science" },
      { name: "English", grade: "Class 1", description: "English Language & Literature" },
      { name: "Computer", grade: "Class 1", description: "Computer Fundamentals" },
      { name: "Social Studies", grade: "Class 1", description: "History & Geography" },
      { name: "Hindi", grade: "Class 1", description: "Hindi Language" },
      { name: "Mathematics", grade: "Class 2", description: "Advanced Math" },
      { name: "Science", grade: "Class 2", description: "General Science" },
      { name: "English", grade: "Class 2", description: "English Language & Literature" },
      { name: "Computer", grade: "Class 2", description: "Computer Fundamentals" },
      { name: "Social Studies", grade: "Class 2", description: "History & Geography" },
      { name: "Hindi", grade: "Class 2", description: "Hindi Language" }
    ]);

    // Map subjects for easy reference
    const mathSub1 = subjects[0];
    const scienceSub1 = subjects[1];
    const englishSub1 = subjects[2];
    const computerSub1 = subjects[3];
    const socialSub1 = subjects[4];
    const hindiSub1 = subjects[5];

    console.log("✅ Created 12 subjects\n");

    // ==================== CREATE STUDENTS ====================
    console.log("👨‍🎓 Creating students...");

    const studentData = [
      { name: "Aarav Sharma", roll: "STU-1001", class: "Class 1", section: "A", gender: "Male", phone: "+91 98765 10001", parentName: "Rajesh Sharma", parentPhone: "+91 98765 10011", address: "123, Green Park, Ajmer" },
      { name: "Riya Nair", roll: "STU-1002", class: "Class 1", section: "A", gender: "Female", phone: "+91 98765 10002", parentName: "Suresh Nair", parentPhone: "+91 98765 10012", address: "45, Lake View, Ajmer" },
      { name: "Kabir Mehta", roll: "STU-1003", class: "Class 1", section: "B", gender: "Male", phone: "+91 98765 10003", parentName: "Pankaj Mehta", parentPhone: "+91 98765 10013", address: "78, Civil Lines, Ajmer" },
      { name: "Ananya Patel", roll: "STU-2001", class: "Class 2", section: "A", gender: "Female", phone: "+91 98765 10004", parentName: "Dev Patel", parentPhone: "+91 98765 10014", address: "56, Subhash Nagar, Ajmer" },
      { name: "Arjun Singh", roll: "STU-2002", class: "Class 2", section: "A", gender: "Male", phone: "+91 98765 10005", parentName: "Raj Singh", parentPhone: "+91 98765 10015", address: "34, Vaishali Nagar, Ajmer" },
      { name: "Saanvi Gupta", roll: "STU-2003", class: "Class 2", section: "B", gender: "Female", phone: "+91 98765 10006", parentName: "Anil Gupta", parentPhone: "+91 98765 10016", address: "90, Gandhi Nagar, Ajmer" },
      { name: "Reyansh Joshi", roll: "STU-3001", class: "Class 3", section: "A", gender: "Male", phone: "+91 98765 10007", parentName: "Ravi Joshi", parentPhone: "+91 98765 10017", address: "12, Station Road, Ajmer" },
      { name: "Aadhya Shah", roll: "STU-3002", class: "Class 3", section: "A", gender: "Female", phone: "+91 98765 10008", parentName: "Kiran Shah", parentPhone: "+91 98765 10018", address: "67, Kutch Colony, Ajmer" },
      { name: "Vihaan Kumar", roll: "STU-4001", class: "Class 4", section: "B", gender: "Male", phone: "+91 98765 10009", parentName: "Ajay Kumar", parentPhone: "+91 98765 10019", address: "23, Chandpol, Ajmer" },
      { name: "Myra Reddy", roll: "STU-4002", class: "Class 4", section: "B", gender: "Female", phone: "+91 98765 10010", parentName: "Sanjay Reddy", parentPhone: "+91 98765 10020", address: "89, Mayo College, Ajmer" },
      { name: "Krishna Iyer", roll: "STU-5001", class: "Class 5", section: "A", gender: "Male", phone: "+91 98765 10021", parentName: "Gopal Iyer", parentPhone: "+91 98765 10031", address: "45, Ana Sagar, Ajmer" },
      { name: "Avni Malhotra", roll: "STU-5002", class: "Class 5", section: "A", gender: "Female", phone: "+91 98765 10022", parentName: "Vikram Malhotra", parentPhone: "+91 98765 10032", address: "78, Prithvi Raj Marg, Ajmer" },
      { name: "Dhruv Chauhan", roll: "STU-5003", class: "Class 5", section: "A", gender: "Male", phone: "+91 98765 10023", parentName: "Dinesh Chauhan", parentPhone: "+91 98765 10033", address: "101, Madhav Garden, Ajmer" },
      { name: "Kiara Bhatia", roll: "STU-5004", class: "Class 5", section: "B", gender: "Female", phone: "+91 98765 10024", parentName: "Rohit Bhatia", parentPhone: "+91 98765 10034", address: "56, Bhagat Singh Road, Ajmer" },
      { name: "Aditya Mishra", roll: "STU-5005", class: "Class 5", section: "B", gender: "Male", phone: "+91 98765 10025", parentName: "Amit Mishra", parentPhone: "+91 98765 10035", address: "67, Narayan Singh Gate, Ajmer" }
    ];

    const students = [];
    for (let i = 0; i < studentData.length; i++) {
      const s = studentData[i];
      const student = await Student.create({
        userId: studentUsers[i]._id,
        fullName: s.name,
        email: studentUsers[i].email,
        phone: s.phone,
        class: s.class,
        section: s.section,
        rollNumber: s.roll,
        gender: s.gender,
        guardianName: s.parentName,
        guardianPhone: s.parentPhone,
        address: { street: s.address, city: "Ajmer", state: "Rajasthan", pincode: "305001" },
        admissionDate: new Date("2024-04-01")
      });
      students.push(student);
    }
    console.log("✅ Created 15 students\n");

    // ==================== CREATE FEES ====================
    console.log("💰 Creating fees...");

    const feeStatuses = ["Paid", "Pending", "Partial", "Paid", "Pending", "Paid", "Partial", "Paid", "Pending", "Paid", "Paid", "Partial", "Paid", "Pending", "Paid"];
    const paymentModes = ["Cash", "UPI", "Online", "Cash", "UPI", "Cash", "UPI", "Online", "Cash", "UPI", "Online", "Cash", "UPI", "Online", "Cash"];

    const fees = [];
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const status = feeStatuses[i];
      const totalAmount = 50000;
      let paidAmount = 0;

      if (status === "Paid") {
        paidAmount = totalAmount;
      } else if (status === "Partial") {
        paidAmount = Math.floor(totalAmount * 0.5);
      }

      const fee = await Fee.create({
        studentId: student._id,
        class: student.class,
        feeType: "Tuition",
        amount: totalAmount,
        paidAmount: paidAmount,
        dueDate: new Date("2024-05-31"),
        status: status,
        paymentMode: status !== "Pending" ? paymentModes[i] : null,
        paymentDate: status !== "Pending" ? new Date("2024-04-15") : null,
        receiptNumber: `RCPT-2024-${String(i + 1).padStart(4, "0")}`,
        academicYear: "2024-2025"
      });
      fees.push(fee);
    }
    console.log("✅ Created 15 fee records\n");

    // ==================== CREATE BUSES ====================
    console.log("🚌 Creating buses...");

    const buses = await Bus.insertMany([
      {
        busNumber: "BUS-001",
        registrationNumber: "RJ-01-FA-1001",
        driverName: "Ramlal Sharma",
        driverPhone: "+91 90000 10001",
        driverLicense: "DL-2021-123456",
        routeName: "Route A - City Circuit",
        capacity: 50,
        gpsLocation: {
          latitude: 26.4499,
          longitude: 74.6399,
          lastUpdated: new Date(),
          speed: 35
        },
        currentStatus: "Active",
        fuelLevel: 75,
        isActive: true,
        routeStops: [
          { name: "School", arrivalTime: "07:30 AM", order: 1 },
          { name: "Vaishali Nagar", arrivalTime: "07:45 AM", order: 2 },
          { name: "Subhash Nagar", arrivalTime: "08:00 AM", order: 3 }
        ]
      },
      {
        busNumber: "BUS-002",
        registrationNumber: "RJ-01-FA-1002",
        driverName: "Mohammad Hussain",
        driverPhone: "+91 90000 10002",
        driverLicense: "DL-2020-234567",
        routeName: "Route B - Western Express",
        capacity: 50,
        gpsLocation: {
          latitude: 26.4699,
          longitude: 74.6199,
          lastUpdated: new Date(),
          speed: 28
        },
        currentStatus: "On Route",
        fuelLevel: 60,
        isActive: true,
        routeStops: [
          { name: "School", arrivalTime: "07:30 AM", order: 1 },
          { name: "Civil Lines", arrivalTime: "07:50 AM", order: 2 },
          { name: "Kutch Colony", arrivalTime: "08:10 AM", order: 3 }
        ]
      },
      {
        busNumber: "BUS-003",
        registrationNumber: "RJ-01-FA-1003",
        driverName: "Prem Singh",
        driverPhone: "+91 90000 10003",
        driverLicense: "DL-2019-345678",
        routeName: "Route C - Eastern Lane",
        capacity: 50,
        gpsLocation: {
          latitude: 26.4299,
          longitude: 74.6599,
          lastUpdated: new Date(),
          speed: 0
        },
        currentStatus: "Idle",
        fuelLevel: 90,
        isActive: true,
        routeStops: [
          { name: "School", arrivalTime: "07:30 AM", order: 1 },
          { name: "Ana Sagar", arrivalTime: "07:40 AM", order: 2 },
          { name: "Madhav Garden", arrivalTime: "08:00 AM", order: 3 }
        ]
      }
    ]);
    console.log("✅ Created 3 buses\n");

    // ==================== CREATE TIMETABLE ====================
    console.log("📅 Creating timetable...");

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const classSchedules = [
      { class: "Class 1", section: "A", subjects: [mathSub1, scienceSub1, englishSub1, computerSub1, socialSub1, hindiSub1] },
      { class: "Class 1", section: "B", subjects: [mathSub1, scienceSub1, englishSub1, computerSub1, socialSub1, hindiSub1] },
      { class: "Class 2", section: "A", subjects: [subjects[6], subjects[7], subjects[8], subjects[9], subjects[10], subjects[11]] },
      { class: "Class 2", section: "B", subjects: [subjects[6], subjects[7], subjects[8], subjects[9], subjects[10], subjects[11]] },
      { class: "Class 3", section: "A", subjects: [mathSub1, scienceSub1, englishSub1, computerSub1, socialSub1, hindiSub1] },
      { class: "Class 4", section: "B", subjects: [mathSub1, scienceSub1, englishSub1, computerSub1, socialSub1, hindiSub1] },
      { class: "Class 5", section: "A", subjects: [mathSub1, scienceSub1, englishSub1, computerSub1, socialSub1, hindiSub1] },
      { class: "Class 5", section: "B", subjects: [mathSub1, scienceSub1, englishSub1, computerSub1, socialSub1, hindiSub1] }
    ];

    const periodTimes = [
      { start: "08:00", end: "08:45" },
      { start: "08:45", end: "09:30" },
      { start: "09:30", end: "10:15" },
      { start: "10:15", end: "10:30" }, // Break
      { start: "10:30", end: "11:15" },
      { start: "11:15", end: "12:00" },
      { start: "12:00", end: "12:45" }
    ];

    let timetableCount = 0;
    for (const schedule of classSchedules) {
      for (const day of days) {
        const periods = [];
        for (let i = 0; i < Math.min(6, schedule.subjects.length); i++) {
          const teacherIndex = i % teacherUsers.length;
          periods.push({
            periodNumber: i + 1,
            subject: schedule.subjects[i]._id,
            teacher: teacherUsers[teacherIndex]._id,
            startTime: periodTimes[i].start,
            endTime: periodTimes[i].end,
            roomNumber: `Room ${i + 1}`
          });
        }

        await Timetable.create({
          class: schedule.class,
          section: schedule.section,
          day: day,
          periods: periods,
          academicYear: "2024-2025",
          createdBy: adminUser._id
        });
        timetableCount++;
      }
    }
    console.log(`✅ Created ${timetableCount} timetable entries\n`);

    // ==================== CREATE ATTENDANCE ====================
    console.log("📝 Creating attendance records...");

    const attendanceStatuses = ["Present", "Present", "Present", "Absent", "Present", "Present", "Present", "Present", "Absent", "Present", "Present", "Present", "Present", "Absent", "Present"];
    const attendanceDates = [
      new Date("2024-11-18"),
      new Date("2024-11-19"),
      new Date("2024-11-20"),
      new Date("2024-11-21"),
      new Date("2024-11-22"),
      new Date("2024-11-25"),
      new Date("2024-11-26"),
      new Date("2024-11-27"),
      new Date("2024-11-28"),
      new Date("2024-11-29"),
      new Date("2024-12-02"),
      new Date("2024-12-03"),
      new Date("2024-12-04"),
      new Date("2024-12-05"),
      new Date("2024-12-06"),
      new Date("2024-12-09"),
      new Date("2024-12-10"),
      new Date("2024-12-11"),
      new Date("2024-12-12"),
      new Date("2024-12-13")
    ];

    const attendanceRecords = [];
    for (let i = 0; i < 20; i++) {
      const studentIndex = i % students.length;
      const attendance = await Attendance.create({
        studentId: students[studentIndex]._id,
        date: attendanceDates[i],
        status: attendanceStatuses[i % attendanceStatuses.length],
        class: students[studentIndex].class,
        section: students[studentIndex].section,
        markedBy: teacherUsers[0]._id
      });
      attendanceRecords.push(attendance);
    }
    console.log("✅ Created 20 attendance records\n");

    // ==================== CREATE EXAMS AND RESULTS ====================
    console.log("📊 Creating exams and results...");

    // Create Exams
    const exams = await Exam.insertMany([
      {
        name: "Midterm Examination 2024",
        subject: mathSub1._id,
        class: "Class 1",
        section: "A",
        examDate: new Date("2024-10-15"),
        startTime: "09:00",
        endTime: "11:00",
        totalMarks: 100,
        passingMarks: 35,
        instructions: "Attempt all questions. No calculators allowed.",
        createdBy: adminUser._id
      },
      {
        name: "Midterm Examination 2024",
        subject: englishSub1._id,
        class: "Class 1",
        section: "A",
        examDate: new Date("2024-10-16"),
        startTime: "09:00",
        endTime: "11:00",
        totalMarks: 100,
        passingMarks: 35,
        instructions: "Essay and grammar sections.",
        createdBy: adminUser._id
      },
      {
        name: "Final Examination 2024",
        subject: scienceSub1._id,
        class: "Class 1",
        section: "A",
        examDate: new Date("2024-12-10"),
        startTime: "09:00",
        endTime: "11:00",
        totalMarks: 100,
        passingMarks: 35,
        instructions: "Physics, Chemistry, Biology sections.",
        createdBy: adminUser._id
      }
    ]);

    // Create Results (Grades) - 10 records as per requirement
    const marksData = [85, 92, 78, 88, 95, 72, 81, 67, 90, 83];
    const gradeStudents = students.slice(0, 10);

    const grades = [];
    for (let i = 0; i < gradeStudents.length; i++) {
      const grade = await Grade.create({
        studentId: gradeStudents[i]._id,
        examId: exams[0]._id,
        subjectId: mathSub1._id,
        marksObtained: marksData[i],
        totalMarks: 100,
        grade: marksData[i] >= 90 ? "A+" : marksData[i] >= 80 ? "A" : marksData[i] >= 70 ? "B+" : marksData[i] >= 60 ? "B" : "C",
        remarks: marksData[i] >= 80 ? "Excellent" : "Good",
        enteredBy: teacherUsers[0]._id,
        class: gradeStudents[i].class,
        section: gradeStudents[i].section
      });
      grades.push(grade);
    }
    console.log("✅ Created 3 exams and 10 result records\n");

    // ==================== PRINT SUCCESS LOGS ====================
    console.log("=".repeat(50));
    console.log("📋 SEEDING SUMMARY");
    console.log("=".repeat(50));
    console.log("✅ Students Seeded");
    console.log("✅ Teachers Seeded");
    console.log("✅ Fees Seeded");
    console.log("✅ Buses Seeded");
    console.log("✅ Timetable Seeded");
    console.log("✅ Attendance Seeded");
    console.log("✅ Results Seeded");
    console.log("=".repeat(50));
    console.log("🎉 Database Seeded Successfully!");
    console.log("=".repeat(50));
    console.log("\n📌 Test Credentials:");
    console.log("   Admin: gagan.admin@mayo.edu / Mayo@123");
    console.log("   Teacher: vikram.teacher@mayo.edu / Mayo@123");
    console.log("   Student: aarav.sharma@mayo.edu / Mayo@123");
    console.log("\n");

    // Exit process
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the seed function
seed();

