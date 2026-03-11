  /**
 * PRO SEED SCRIPT - OPTIMIZED VERSION
 * School ERP System - Generates realistic, production-like data
 * 
 * Data Generated:
 * - 200 Students
 * - 20 Teachers  
 * - 50 Fee Records
 * - 5 Buses
 * - 30 Attendance Records
 * - Timetable for all classes
 * - Exam Results
 * 
 * Run: node pro-seed-optimized.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// MongoDB URI
const MONGO_URI = process.env.MONGO_URI || "mongodb://gagangoyal878_db_user:wKlY3lEVmyKv2QLt@testcluster-shard-00-00.yshysvv.mongodb.net:27017,testcluster-shard-00-01.yshysvv.mongodb.net:27017,testcluster-shard-00-02.yshysvv.mongodb.net:27017/mayo_college_db?ssl=true&replicaSet=atlas-shard-0&authSource=admin&retryWrites=true&w=majority";

// Import Models
const User = require("./models/User");
const Student = require("./models/Student");
const Parent = require("./models/Parent");
const Subject = require("./models/Subject");
const Fee = require("./models/Fee");
const Bus = require("./models/Bus");
const Timetable = require("./models/Timetable");
const Attendance = require("./models/Attendance");
const Exam = require("./models/Exam");
const Grade = require("./models/Grade");

// ==================== DATA GENERATORS ====================

const firstNames = {
  male: ["Aarav", "Arjun", "Vihaan", "Reyansh", "Ayaan", "Krishna", "Ishaan", "Sai", "Rohan", "Aditya",
    "Vivaan", "Dhruv", "Kabir", "Shaurya", "Atharv", "Yash", "Aryan", "Dev", "Kartik", "Prateek"],
  female: ["Aadhya", "Ananya", "Saanvi", "Myra", "Kiara", "Avni", "Aarohi", "Riya", "Anushka", "Diya",
    "Ira", "Kavya", "Aisha", "Neha", "Priya", "Sunita", "Anita", "Pooja", "Kiran", "Meera"]
};

const lastNames = ["Sharma", "Singh", "Patel", "Gupta", "Kumar", "Reddy", "Joshi", "Shah", "Mehta", "Chauhan",
  "Malhotra", "Bhatia", "Mishra", "Iyer", "Nair", "Verma", "Kapoor", "Khanna", "Sinha", "Pandey"];

const cities = [
  { city: "Ajmer", state: "Rajasthan", pincode: "305001" },
  { city: "Jaipur", state: "Rajasthan", pincode: "302001" },
  { city: "Jodhpur", state: "Rajasthan", pincode: "342001" },
  { city: "Udaipur", state: "Rajasthan", pincode: "313001" },
  { city: "Kota", state: "Rajasthan", pincode: "324001" }
];

const streets = ["MG Road", "Civil Lines", "Station Road", "Lake View", "Green Park", "Subhash Nagar",
  "Vaishali Nagar", "Gandhi Nagar", "Madhav Garden", "Prithvi Raj Marg"];

const classes = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8"];
const sections = ["A", "B", "C"];
const feeTypes = ["Tuition", "Transport", "Hostel", "Books", "Uniform", "Examination", "Other"];
const busRoutes = ["Route A - City Circuit", "Route B - Western Express", "Route C - Eastern Lane",
  "Route D - Northern Hills", "Route E - Southern Plains"];

const subjectNames = {
  "Class 1": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies"],
  "Class 2": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies"],
  "Class 3": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies"],
  "Class 4": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies"],
  "Class 5": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies"],
  "Class 6": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies", "Art"],
  "Class 7": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies", "Art"],
  "Class 8": ["Mathematics", "Science", "English", "Hindi", "Computer", "Social Studies", "Art"]
};

// Helper Functions
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const generatePhone = () => `+91 ${randomNumber(90000, 99999)} ${randomNumber(10000, 99999)}`;
const generateDOB = (ageMin = 5, ageMax = 18) => {
  const today = new Date();
  return new Date(today.getFullYear() - randomNumber(ageMin, ageMax), randomNumber(0, 11), randomNumber(1, 28));
};
const generateStudentName = (gender) => `${randomElement(firstNames[gender])} ${randomElement(lastNames)}`;
const generateRollNumber = (className, section, index) => `STU-${className.replace("Class ", "")}${section}${String(index).padStart(3, '0')}`;

const calculateGrade = (marks) => {
  if (marks >= 95) return "A+"; 
  if (marks >= 90) return "A"; 
  if (marks >= 80) return "B+"; 
  if (marks >= 75) return "B"; 
  if (marks >= 70) return "C+"; 
  if (marks >= 60) return "C"; 
  if (marks >= 50) return "D"; 
  return "F";
};

// ==================== MAIN SEED FUNCTION ====================

async function seed() {
  let connection;
  
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 PRO SEED SCRIPT - OPTIMIZED VERSION");
    console.log("=".repeat(60));
    
    console.log("\n📡 Connecting to MongoDB...");
    connection = await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected!\n");

    // Clear existing data
    console.log("🧹 Clearing existing data...");
    await Promise.all([
      User.deleteMany({}), Student.deleteMany({}), Subject.deleteMany({}),
      Fee.deleteMany({}), Bus.deleteMany({}), Timetable.deleteMany({}),
      Attendance.deleteMany({}), Exam.deleteMany({}), Grade.deleteMany({})
    ]);
    console.log("✅ Existing data cleared!\n");

    // Pre-hash passwords for bulk insert
    console.log("🔐 Pre-hashing passwords...");
    const hashedPassword = await bcrypt.hash("Mayo@123", 10);
    console.log("✅ Passwords hashed!\n");

    // ==================== CREATE USERS (BULK) ====================
    console.log("👤 Creating Users...");
    
    // Admin
    const adminUser = new User({ fullName: "Gagan Goyal", email: "gagan.admin@mayo.edu", password: hashedPassword, role: "admin" });
    
    // Teachers
    const teacherNames = ["Dr. Vikram Singh Rathore", "Prof. Priya Sharma", "Dr. Rahul Verma", 
      "Prof. Anita Desai", "Dr. Mohammad Irfan", "Prof. Sunita Kumari", "Dr. Rajesh Bhatnagar", 
      "Prof. Kavita Singh", "Dr. Ajay Pandey", "Prof. Meera Joshi", "Dr. Sanjay Saxena", 
      "Prof. Rani Malhotra", "Dr. Arun Kumar", "Prof. Pooja Sharma", "Dr. Naveen Reddy",
      "Prof. Anjali Gupta", "Dr. Suresh Chandra", "Prof. Deepika Rao", "Dr. Gopal Krishnan", 
      "Prof. Lakshmi Narayan"];
    
    const teacherUsers = teacherNames.map((name, i) => ({
      fullName: name, email: `teacher${i + 1}@mayo.edu`, password: hashedPassword, role: "teacher"
    }));
    
    // Students - generate 200
    const studentUsers = [];
    for (let i = 0; i < 200; i++) {
      const gender = randomElement(["male", "female"]);
      studentUsers.push({
        fullName: generateStudentName(gender),
        email: `student${i + 1}@mayo.edu`,
        password: hashedPassword,
        role: "student"
      });
    }

    // Bulk insert all users
    const allUsers = [adminUser, ...teacherUsers, ...studentUsers];
    await User.insertMany(allUsers);
    
    // Fetch back the users to get IDs
    const admin = await User.findOne({ email: "gagan.admin@mayo.edu" });
    const teachers = await User.find({ role: "teacher" }).sort({ email: 1 }).limit(20);
    const students = await User.find({ role: "student" }).sort({ email: 1 }).limit(200);
    
    console.log("✅ Created 1 Admin, 20 Teachers, 200 Students\n");

    // ==================== CREATE SUBJECTS ====================
    console.log("📚 Creating Subjects...");
    const subjectsData = [];
    for (const className of classes) {
      const subjectsForClass = subjectNames[className];
      for (const subjectName of subjectsForClass) {
        subjectsData.push({
          name: subjectName,
          grade: className,
          description: `${subjectName} for ${className}`,
          teacher: teachers[randomNumber(0, teachers.length - 1)]._id
        });
      }
    }
    const subjects = await Subject.insertMany(subjectsData);
    
    // Group subjects by class
    const subjectsByClass = {};
    for (const subject of subjects) {
      if (!subjectsByClass[subject.grade]) subjectsByClass[subject.grade] = [];
      subjectsByClass[subject.grade].push(subject);
    }
    console.log(`✅ Created ${subjects.length} Subjects\n`);

    // ==================== CREATE STUDENTS ====================
    console.log("👨‍🎓 Creating Student Records...");
    const studentRecords = [];
    let studentCount = 0;

    for (const className of classes) {
      for (const section of sections) {
        const studentsInSection = randomNumber(8, 10);
        for (let i = 1; i <= studentsInSection; i++) {
          if (studentCount >= 200) break;
          const student = students[studentCount];
          const gender = randomElement(["male", "female"]);
          const location = randomElement(cities);
          
          studentRecords.push({
            userId: student._id,
            fullName: student.fullName,
            email: student.email,
            phone: generatePhone(),
            class: className,
            section: section,
            rollNumber: generateRollNumber(className, section, i),
            dateOfBirth: generateDOB(),
            gender: gender === "male" ? "Male" : "Female",
            address: { street: `${randomNumber(1, 200)}, ${randomElement(streets)}`, city: location.city, state: location.state, pincode: location.pincode },
            guardianName: `${randomElement(["Mr.", "Mrs."])} ${randomElement(lastNames)}`,
            guardianPhone: generatePhone(),
            guardianRelation: randomElement(["Father", "Mother"]),
            bloodGroup: randomElement(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
            admissionDate: new Date("2024-04-01"),
            isActive: true
          });
          studentCount++;
        }
      }
    }
    
    const studentDocs = await Student.insertMany(studentRecords);
    console.log(`✅ Created ${studentDocs.length} Student Records\n`);

    // ==================== CREATE 50 FEE RECORDS ====================
    console.log("💰 Creating 50 Fee Records...");
    const feeAmounts = { "Tuition": 45000, "Transport": 15000, "Hostel": 25000, "Books": 8000, "Uniform": 5000, "Examination": 3000, "Other": 2000 };
    
    const feeRecords = [];
    for (let i = 0; i < 50; i++) {
      const student = studentDocs[randomNumber(0, studentDocs.length - 1)];
      const feeType = randomElement(feeTypes);
      const amount = feeAmounts[feeType] || 10000;
      const status = randomElement(["Pending", "Paid", "Partial", "Overdue", "Paid", "Paid"]);
      
      let paidAmount = 0, paymentDate = null, paymentMode = null;
      if (status === "Paid") { paidAmount = amount; paymentDate = new Date(2024, randomNumber(3, 10), randomNumber(1, 28)); paymentMode = randomElement(["Cash", "Online", "UPI", "Bank Transfer"]); }
      else if (status === "Partial") { paidAmount = Math.floor(amount * randomNumber(30, 70) / 100); paymentDate = new Date(2024, randomNumber(3, 10), randomNumber(1, 28)); paymentMode = randomElement(["Cash", "Online", "UPI"]); }

      feeRecords.push({
        studentId: student._id, academicYear: "2024-2025", class: student.class, feeType: feeType,
        amount: amount, paidAmount: paidAmount, dueDate: new Date(2024, randomNumber(4, 8), randomNumber(1, 28)),
        status: status, paymentMode: paymentMode, paymentDate: paymentDate,
        receiptNumber: `RCPT-2024-${String(i + 1).padStart(5, '0')}`,
        discount: randomElement([0, 0, 0, 1000, 2000, 5000]),
        lateFee: status === "Overdue" ? randomNumber(100, 500) : 0, createdBy: admin._id
      });
    }
    await Fee.insertMany(feeRecords);
    console.log("✅ Created 50 Fee Records\n");

    // ==================== CREATE 5 BUSES ====================
    console.log("🚌 Creating 5 Buses...");
    const busDrivers = [
      { name: "Ramlal Sharma", phone: "+91 90000 10001", license: "DL-2021-123456" },
      { name: "Mohammad Hussain", phone: "+91 90000 10002", license: "DL-2020-234567" },
      { name: "Prem Singh", phone: "+91 90000 10003", license: "DL-2019-345678" },
      { name: "Jai Singh", phone: "+91 90000 10004", license: "DL-2018-456789" },
      { name: "Madan Lal", phone: "+91 90000 10005", license: "DL-2017-567890" }
    ];
    const busStops = [
      ["School", "Vaishali Nagar", "Subhash Nagar", "Civil Lines", "Kutch Colony"],
      ["School", "Ana Sagar", "Madhav Garden", "Prithvi Raj Marg", "Mayo College"],
      ["School", "Station Road", "Green Park", "Lake View", "Gandhi Nagar"],
      ["School", "Keshav Nagar", "Shastri Nagar", "Rama Krishna Colony", "Bharatpur Road"],
      ["School", "Chandpol", "Narayan Singh Gate", "Bhagat Singh Road", "New Civil Lines"]
    ];

    const buses = [];
    for (let i = 0; i < 5; i++) {
      const assignedStudents = [];
      const shuffled = [...studentDocs].sort(() => 0.5 - Math.random());
      const numAssigned = randomNumber(15, 25);
      for (let j = 0; j < numAssigned && j < shuffled.length; j++) {
        assignedStudents.push({ studentId: shuffled[j]._id, stopName: randomElement(busStops[i]) });
      }
      
      buses.push({
        busNumber: `BUS-${String(i + 1).padStart(3, '0')}`, registrationNumber: `RJ-01-FA-${1001 + i}`,
        driverName: busDrivers[i].name, driverPhone: busDrivers[i].phone, driverLicense: busDrivers[i].license,
        routeName: busRoutes[i], capacity: 50,
        routeStops: busStops[i].map((stop, idx) => ({ name: stop, arrivalTime: `${7 + Math.floor(idx * 0.2)}:${String(randomNumber(15, 45)).padStart(2, '0')} AM`, order: idx + 1 })),
        gpsLocation: { latitude: 26.4499 + (Math.random() - 0.5) * 0.1, longitude: 74.6399 + (Math.random() - 0.5) * 0.1, lastUpdated: new Date(), speed: randomNumber(0, 50) },
        currentStatus: randomElement(["Active", "On Route", "Idle", "Active", "Active"]),
        fuelLevel: randomNumber(40, 100), insuranceExpiry: new Date(2025, randomNumber(0, 11), randomNumber(1, 28)),
        permitExpiry: new Date(2025, randomNumber(0, 11), randomNumber(1, 28)),
        assignedStudents: assignedStudents, isActive: true
      });
    }
    await Bus.insertMany(buses);
    console.log("✅ Created 5 Buses\n");

    // ==================== CREATE 30 ATTENDANCE RECORDS ====================
    console.log("📝 Creating 30 Attendance Records...");
    const attendanceRecords = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today); date.setDate(date.getDate() - i);
      const student = studentDocs[randomNumber(0, studentDocs.length - 1)];
      attendanceRecords.push({
        studentId: student._id, date: date, status: randomElement(["Present", "Present", "Present", "Present", "Absent", "Late", "Half Day"]),
        class: student.class, section: student.section, markedBy: teachers[randomNumber(0, teachers.length - 1)]._id, remarks: ""
      });
    }
    await Attendance.insertMany(attendanceRecords);
    console.log("✅ Created 30 Attendance Records\n");

    // ==================== CREATE TIMETABLE ====================
    console.log("📅 Creating Timetable...");
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const periodTimes = [
      { start: "08:00", end: "08:45" }, { start: "08:45", end: "09:30" }, { start: "09:30", end: "10:15" },
      { start: "10:15", end: "10:30" }, { start: "10:30", end: "11:15" }, { start: "11:15", end: "12:00" }, { start: "12:00", end: "12:45" }
    ];

    let timetableCount = 0;
    const timetableRecords = [];
    for (const className of classes) {
      for (const section of sections) {
        const classSubjects = subjectsByClass[className];
        if (!classSubjects || classSubjects.length === 0) continue;
        
        for (const day of days) {
          const numPeriods = randomNumber(5, 7);
          const periods = [];
          for (let i = 0; i < numPeriods; i++) {
            periods.push({
              periodNumber: i + 1, subject: classSubjects[i % classSubjects.length]._id,
              teacher: teachers[randomNumber(0, teachers.length - 1)]._id,
              startTime: periodTimes[i].start, endTime: periodTimes[i].end, roomNumber: `Room ${randomNumber(101, 115)}`
            });
          }
          timetableRecords.push({
            class: className, section: section, day: day, periods: periods, academicYear: "2024-2025", createdBy: admin._id, isActive: true
          });
          timetableCount++;
        }
      }
    }
    await Timetable.insertMany(timetableRecords);
    console.log(`✅ Created ${timetableCount} Timetable Entries\n`);

    // ==================== CREATE EXAMS ====================
    console.log("📊 Creating Exams...");
    const examNames = ["Unit Test 1", "Unit Test 2", "Midterm Examination", "Final Examination"];
    const examsData = [];
    
    for (const className of classes) {
      const classSubjects = subjectsByClass[className];
      for (const examName of examNames.slice(0, 2)) {
        for (const subject of classSubjects.slice(0, 3)) {
          examsData.push({
            name: `${examName} 2024`, subject: subject._id, class: className, section: randomElement(sections),
            examDate: new Date(2024, randomNumber(8, 11), randomNumber(1, 25)),
            startTime: "09:00", endTime: "11:00", totalMarks: 100, passingMarks: 35,
            instructions: "Attempt all questions. No calculators allowed.", createdBy: admin._id, isActive: true
          });
        }
      }
    }
    const exams = await Exam.insertMany(examsData);
    console.log(`✅ Created ${exams.length} Exams\n`);

    // ==================== CREATE EXAM RESULTS ====================
    console.log("🎓 Creating Exam Results...");
    const gradesData = [];
    for (let i = 0; i < 100; i++) {
      const student = studentDocs[randomNumber(0, studentDocs.length - 1)];
      const exam = exams[randomNumber(0, exams.length - 1)];
      const marks = randomNumber(45, 95);
      gradesData.push({
        studentId: student._id, examId: exam._id, subjectId: exam.subject,
        marksObtained: marks, totalMarks: exam.totalMarks, grade: calculateGrade(marks),
        remarks: marks >= 80 ? "Excellent" : marks >= 60 ? "Good" : "Needs improvement",
        enteredBy: teachers[randomNumber(0, teachers.length - 1)]._id, class: student.class, section: student.section
      });
    }
    await Grade.insertMany(gradesData);
    console.log("✅ Created 100 Exam Results\n");

    // ==================== SUMMARY ====================
    console.log("=".repeat(60));
    console.log("📋 SEEDING SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Users Created: 221 (1 Admin + 20 Teachers + 200 Students)`);
    console.log(`✅ Students: ${studentDocs.length}`);
    console.log(`✅ Teachers: ${teachers.length}`);
    console.log(`✅ Subjects: ${subjects.length}`);
    console.log(`✅ Fee Records: 50`);
    console.log(`✅ Buses: 5`);
    console.log(`✅ Attendance Records: 30`);
    console.log(`✅ Timetable Entries: ${timetableCount}`);
    console.log(`✅ Exams: ${exams.length}`);
    console.log(`✅ Exam Results: 100`);
    console.log("=".repeat(60));
    console.log("🎉 PRO SEED COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log("\n📌 Test Credentials:");
    console.log("   Admin: gagan.admin@mayo.edu / Mayo@123");
    console.log("   Teacher: teacher1@mayo.edu / Mayo@123");
    console.log("   Student: student1@mayo.edu / Mayo@123\n");

    await mongoose.disconnect();
    console.log("📴 Disconnected from MongoDB");
    process.exit(0);
    
  } catch (error) {
    console.error("\n❌ SEED ERROR:", error.message);
    console.error(error.stack);
    if (connection) await mongoose.disconnect();
    process.exit(1);
  }
}

seed();

