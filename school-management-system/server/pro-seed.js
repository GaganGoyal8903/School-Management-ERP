/**
 * PRO SEED SCRIPT - School ERP System
 * Generates realistic, production-like data for comprehensive testing
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
 * Run: node pro-seed.js
 */

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

// ==================== DATA GENERATORS ====================

// Indian Names Generator
const firstNames = {
  male: [
    "Aarav", "Arjun", "Vihaan", "Reyansh", "Ayaan", "Krishna", "Ishaan", "Sai", "Rohan", "Aditya",
    "Vivaan", "Ananya", "Dhruv", "Kabir", "Shaurya", "Atharv", "Rohan", "Yash", "Aryan", "Dev",
    "Kartik", "Prateek", "Siddharth", "Rohan", "Vikram", "Raj", "Amit", "Sanjay", "Rajesh", "Pankaj"
  ],
  female: [
    "Aadhya", "Ananya", "Saanvi", "Pari", "Myra", "Kiara", "Avni", "Aarohi", "Aanya", "Saanvi",
    "Riya", "Anushka", "Diya", "Ira", "Kavya", "Aisha", "Neha", "Priya", "Sunita", "Anita",
    "Pooja", "Kiran", "Meera", "Nisha", "Rashmi", "Tina", "Sonia", "Rekha", "Sunita", "Kavita"
  ]
};

const lastNames = [
  "Sharma", "Singh", "Patel", "Gupta", "Kumar", "Reddy", "Joshi", "Shah", "Mehta", "Chauhan",
  "Malhotra", "Bhatia", "Mishra", "Iyer", "Nair", "Verma", "Kapoor", "Khanna", "Sinha", "Pandey",
  "Trivedi", "Desai", "Choudhary", "Saxena", "Agarwal", "Bajaj", "Chandra", "Das", "Gandhi", "Harwani"
];

const cities = [
  { city: "Ajmer", state: "Rajasthan", pincode: "305001" },
  { city: "Jaipur", state: "Rajasthan", pincode: "302001" },
  { city: "Jodhpur", state: "Rajasthan", pincode: "342001" },
  { city: "Udaipur", state: "Rajasthan", pincode: "313001" },
  { city: "Kota", state: "Rajasthan", pincode: "324001" },
  { city: "Bikaner", state: "Rajasthan", pincode: "334001" },
  { city: "Delhi", state: "Delhi", pincode: "110001" },
  { city: "Mumbai", state: "Maharashtra", pincode: "400001" },
  { city: "Bangalore", state: "Karnataka", pincode: "560001" },
  { city: "Hyderabad", state: "Telangana", pincode: "500001" }
];

const streets = [
  "MG Road", "Civil Lines", "Station Road", "Lake View", "Green Park", "Subhash Nagar",
  "Vaishali Nagar", "Gandhi Nagar", "Madhav Garden", "Prithvi Raj Marg", "Kutch Colony",
  "Chandpol", "Ana Sagar", "Bhagat Singh Road", "Narayan Singh Gate", "Mayo College Road",
  "Keshav Nagar", "Shastri Nagar", "Rama Krishna Colony", "Bharatpur Road"
];

// Classes and Sections
const classes = ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8"];
const sections = ["A", "B", "C"];

// Fee Types - must match Fee model's enum
const feeTypes = ["Tuition", "Transport", "Hostel", "Books", "Uniform", "Examination", "Other"];

// Bus Routes
const busRoutes = [
  "Route A - City Circuit",
  "Route B - Western Express",
  "Route C - Eastern Lane",
  "Route D - Northern Hills",
  "Route E - Southern Plains"
];

// Subjects by Grade
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
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhone() {
  return `+91 ${randomNumber(90000, 99999)} ${randomNumber(10000, 99999)}`;
}

function generateDOB(ageMin = 5, ageMax = 18) {
  const today = new Date();
  const birthYear = today.getFullYear() - randomNumber(ageMin, ageMax);
  const birthMonth = randomNumber(0, 11);
  const birthDay = randomNumber(1, 28);
  return new Date(birthYear, birthMonth, birthDay);
}

function generateStudentName(gender) {
  return `${randomElement(firstNames[gender])} ${randomElement(lastNames)}`;
}

function generateRollNumber(className, section, index) {
  const classNum = className.replace("Class ", "");
  return `STU-${classNum}${section}${String(index).padStart(3, '0')}`;
}

function calculateGrade(marks) {
  if (marks >= 95) return "A+";
  if (marks >= 90) return "A";
  if (marks >= 85) return "A-";
  if (marks >= 80) return "B+";
  if (marks >= 75) return "B";
  if (marks >= 70) return "B-";
  if (marks >= 65) return "C+";
  if (marks >= 60) return "C";
  if (marks >= 55) return "C-";
  if (marks >= 50) return "D";
  return "F";
}

function getGradeRemarks(marks) {
  if (marks >= 90) return "Outstanding performance";
  if (marks >= 80) return "Excellent performance";
  if (marks >= 70) return "Very Good performance";
  if (marks >= 60) return "Good performance";
  if (marks >= 50) return "Satisfactory performance";
  return "Needs improvement";
}

// ==================== MAIN SEED FUNCTION ====================

async function seed() {
  let connection;
  
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 PRO SEED SCRIPT - School ERP System");
    console.log("=".repeat(60));
    
    console.log("\n📡 Connecting to MongoDB...");
    connection = await mongoose.connect(MONGO_URI);
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

    // ==================== CREATE ADMIN ====================
    console.log("👤 Creating Admin User...");
    const adminUser = await User.create({
      fullName: "Gagan Goyal",
      email: "gagangoyal878@gmail.com",
      password: "Mayo@123",
      role: "admin"
    });
    console.log("✅ Admin created: gagangoyal878@gmail.com\n");

    // ==================== CREATE 20 TEACHERS ====================
    console.log("👨‍🏫 Creating 20 Teachers...");
    const teacherUsers = [];
    const teacherNames = [
      "Dr. Vikram Singh Rathore", "Prof. Priya Sharma", "Dr. Rahul Verma", 
      "Prof. Anita Desai", "Dr. Mohammad Irfan", "Prof. Sunita Kumari",
      "Dr. Rajesh Bhatnagar", "Prof. Kavita Singh", "Dr. Ajay Pandey",
      "Prof. Meera Joshi", "Dr. Sanjay Saxena", "Prof. Rani Malhotra",
      "Dr. Arun Kumar", "Prof. Pooja Sharma", "Dr. Naveen Reddy",
      "Prof. Anjali Gupta", "Dr. Suresh Chandra", "Prof. Deepika Rao",
      "Dr. Gopal Krishnan", "Prof. Lakshmi Narayan"
    ];

    for (let i = 0; i < 20; i++) {
      const teacher = await User.create({
        fullName: teacherNames[i],
        email: `teacher${i + 1}@mayo.edu`,
        password: "Mayo@123",
        role: "teacher"
      });
      teacherUsers.push(teacher);
    }
    console.log("✅ Created 20 Teachers\n");

    // ==================== CREATE SUBJECTS ====================
    console.log("📚 Creating Subjects...");
    const allSubjects = [];
    
    for (const className of classes) {
      const subjectsForClass = subjectNames[className] || subjectNames["Class 1"];
      for (const subjectName of subjectsForClass) {
        const subject = await Subject.create({
          name: subjectName,
          grade: className,
          description: `${subjectName} for ${className}`,
          teacher: teacherUsers[randomNumber(0, teacherUsers.length - 1)]._id
        });
        allSubjects.push(subject);
      }
    }
    console.log(`✅ Created ${allSubjects.length} Subjects\n`);

    // Group subjects by class
    const subjectsByClass = {};
    for (const subject of allSubjects) {
      if (!subjectsByClass[subject.grade]) {
        subjectsByClass[subject.grade] = [];
      }
      subjectsByClass[subject.grade].push(subject);
    }

    // ==================== CREATE 200 STUDENTS ====================
    console.log("👨‍🎓 Creating 200 Students...");
    const students = [];
    let studentCount = 0;

    for (const className of classes) {
      for (const section of sections) {
        // 8-10 students per section
        const studentsInSection = randomNumber(8, 10);
        
        for (let i = 1; i <= studentsInSection; i++) {
          if (studentCount >= 200) break;
          
          const gender = randomElement(["male", "female"]);
          const fullName = generateStudentName(gender);
          const location = randomElement(cities);
          const street = randomElement(streets);
          
          // Create user first
          const studentUser = await User.create({
            fullName: fullName,
            email: `student${studentCount + 1}@mayo.edu`,
            password: "Mayo@123",
            role: "student"
          });

          // Create student record
          const student = await Student.create({
            userId: studentUser._id,
            fullName: fullName,
            email: studentUser.email,
            phone: generatePhone(),
            class: className,
            section: section,
            rollNumber: generateRollNumber(className, section, i),
            dateOfBirth: generateDOB(),
            gender: gender === "male" ? "Male" : "Female",
            address: {
              street: `${randomNumber(1, 200)}, ${street}`,
              city: location.city,
              state: location.state,
              pincode: location.pincode
            },
            guardianName: `${randomElement(["Mr.", "Mrs."])} ${randomElement(lastNames)}`,
            guardianPhone: generatePhone(),
            guardianRelation: randomElement(["Father", "Mother"]),
            bloodGroup: randomElement(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
            admissionDate: new Date("2024-04-01"),
            isActive: true
          });

          students.push(student);
          studentCount++;
        }
      }
    }
    console.log(`✅ Created ${students.length} Students\n`);

    // Group students by class
    const studentsByClass = {};
    for (const student of students) {
      const key = `${student.class}-${student.section}`;
      if (!studentsByClass[key]) {
        studentsByClass[key] = [];
      }
      studentsByClass[key].push(student);
    }

    // ==================== CREATE 50 FEE RECORDS ====================
    console.log("💰 Creating 50 Fee Records...");
    const feeRecords = [];
    
    for (let i = 0; i < 50; i++) {
      const student = students[randomNumber(0, students.length - 1)];
      const feeType = randomElement(feeTypes);
      
      // Fee amounts based on type (matching valid enum)
      const feeAmounts = {
        "Tuition": 45000,
        "Transport": 15000,
        "Hostel": 25000,
        "Books": 8000,
        "Uniform": 5000,
        "Examination": 3000,
        "Other": 2000
      };
      
      const amount = feeAmounts[feeType] || 10000;
      const status = randomElement(["Pending", "Paid", "Partial", "Overdue", "Paid", "Paid"]);
      
      let paidAmount = 0;
      let paymentDate = null;
      let paymentMode = null;
      
      if (status === "Paid") {
        paidAmount = amount;
        paymentDate = new Date(2024, randomNumber(3, 10), randomNumber(1, 28));
        paymentMode = randomElement(["Cash", "Online", "UPI", "Bank Transfer"]);
      } else if (status === "Partial") {
        paidAmount = Math.floor(amount * randomNumber(30, 70) / 100);
        paymentDate = new Date(2024, randomNumber(3, 10), randomNumber(1, 28));
        paymentMode = randomElement(["Cash", "Online", "UPI"]);
      }

      const fee = await Fee.create({
        studentId: student._id,
        academicYear: "2024-2025",
        class: student.class,
        feeType: feeType,
        amount: amount,
        paidAmount: paidAmount,
        dueDate: new Date(2024, randomNumber(4, 8), randomNumber(1, 28)),
        status: status,
        paymentMode: paymentMode,
        paymentDate: paymentDate,
        receiptNumber: `RCPT-2024-${String(i + 1).padStart(5, '0')}`,
        discount: randomElement([0, 0, 0, 1000, 2000, 5000]),
        lateFee: status === "Overdue" ? randomNumber(100, 500) : 0,
        createdBy: adminUser._id
      });
      
      feeRecords.push(fee);
    }
    console.log("✅ Created 50 Fee Records\n");

    // ==================== CREATE 5 BUSES ====================
    console.log("🚌 Creating 5 Buses...");
    const buses = [];
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

    for (let i = 0; i < 5; i++) {
      // Assign 15-25 students to each bus
      const assignedStudents = [];
      const numAssigned = randomNumber(15, 25);
      const shuffledStudents = [...students].sort(() => 0.5 - Math.random());
      
      for (let j = 0; j < numAssigned && j < shuffledStudents.length; j++) {
        assignedStudents.push({
          studentId: shuffledStudents[j]._id,
          stopName: randomElement(busStops[i])
        });
      }

      const bus = await Bus.create({
        busNumber: `BUS-${String(i + 1).padStart(3, '0')}`,
        registrationNumber: `RJ-01-FA-${1001 + i}`,
        driverName: busDrivers[i].name,
        driverPhone: busDrivers[i].phone,
        driverLicense: busDrivers[i].license,
        routeName: busRoutes[i],
        capacity: 50,
        routeStops: busStops[i].map((stop, idx) => ({
          name: stop,
          arrivalTime: `${7 + Math.floor(idx * 0.2)}:${String(randomNumber(15, 45)).padStart(2, '0')} AM`,
          order: idx + 1
        })),
        gpsLocation: {
          latitude: 26.4499 + (Math.random() - 0.5) * 0.1,
          longitude: 74.6399 + (Math.random() - 0.5) * 0.1,
          lastUpdated: new Date(),
          speed: randomNumber(0, 50)
        },
        currentStatus: randomElement(["Active", "On Route", "Idle", "Active", "Active"]),
        fuelLevel: randomNumber(40, 100),
        insuranceExpiry: new Date(2025, randomNumber(0, 11), randomNumber(1, 28)),
        permitExpiry: new Date(2025, randomNumber(0, 11), randomNumber(1, 28)),
        assignedStudents: assignedStudents,
        isActive: true
      });
      
      buses.push(bus);
    }
    console.log("✅ Created 5 Buses\n");

    // ==================== CREATE 30 ATTENDANCE RECORDS ====================
    console.log("📝 Creating 30 Attendance Records...");
    const attendanceRecords = [];
    const attendanceStatuses = ["Present", "Present", "Present", "Present", "Absent", "Late", "Half Day"];
    
    // Generate dates for the last 30 days
    const today = new Date();
    const attendanceDates = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      attendanceDates.push(date);
    }

    for (let i = 0; i < 30; i++) {
      const student = students[randomNumber(0, students.length - 1)];
      const date = attendanceDates[i];
      
      const attendance = await Attendance.create({
        studentId: student._id,
        date: date,
        status: randomElement(attendanceStatuses),
        class: student.class,
        section: student.section,
        markedBy: teacherUsers[randomNumber(0, teacherUsers.length - 1)]._id,
        remarks: ""
      });
      
      attendanceRecords.push(attendance);
    }
    console.log("✅ Created 30 Attendance Records\n");

    // ==================== CREATE TIMETABLE ====================
    console.log("📅 Creating Timetable...");
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const periodTimes = [
      { start: "08:00", end: "08:45" },
      { start: "08:45", end: "09:30" },
      { start: "09:30", end: "10:15" },
      { start: "10:15", end: "10:30" }, // Break
      { start: "10:30", end: "11:15" },
      { start: "11:15", end: "12:00" },
      { start: "12:00", end: "12:45" },
      { start: "12:45", end: "13:30" }
    ];

    let timetableCount = 0;

    for (const className of classes) {
      for (const section of sections) {
        const classKey = `${className}-${section}`;
        const classStudents = studentsByClass[classKey];
        
        if (!classStudents || classStudents.length === 0) continue;
        
        const classSubjects = subjectsByClass[className] || [];
        if (classSubjects.length === 0) continue;
        
        for (const day of days) {
          const periods = [];
          
          // Create 5-7 periods per day
          const numPeriods = randomNumber(5, 7);
          
          for (let i = 0; i < numPeriods; i++) {
            const subject = classSubjects[i % classSubjects.length];
            const teacher = teacherUsers[randomNumber(0, teacherUsers.length - 1)];
            
            periods.push({
              periodNumber: i + 1,
              subject: subject._id,
              teacher: teacher._id,
              startTime: periodTimes[i].start,
              endTime: periodTimes[i].end,
              roomNumber: `Room ${randomNumber(101, 115)}`
            });
          }

          await Timetable.create({
            class: className,
            section: section,
            day: day,
            periods: periods,
            academicYear: "2024-2025",
            createdBy: adminUser._id,
            isActive: true
          });
          
          timetableCount++;
        }
      }
    }
    console.log(`✅ Created ${timetableCount} Timetable Entries\n`);

    // ==================== CREATE EXAMS ====================
    console.log("📊 Creating Exams...");
    const exams = [];
    const examNames = ["Unit Test 1", "Unit Test 2", "Midterm Examination", "Final Examination"];
    
    // Create exams for each class
    for (const className of classes) {
      const classSubjects = subjectsByClass[className] || [];
      
      for (const examName of examNames.slice(0, 2)) { // Just 2 exams per class
        for (const subject of classSubjects.slice(0, 3)) { // 3 subjects per exam
          const exam = await Exam.create({
            name: `${examName} 2024`,
            subject: subject._id,
            class: className,
            section: randomElement(sections),
            examDate: new Date(2024, randomNumber(8, 11), randomNumber(1, 25)),
            startTime: "09:00",
            endTime: "11:00",
            totalMarks: 100,
            passingMarks: 35,
            instructions: "Attempt all questions. No calculators allowed.",
            createdBy: adminUser._id,
            isActive: true
          });
          exams.push(exam);
        }
      }
    }
    console.log(`✅ Created ${exams.length} Exams\n`);

    // ==================== CREATE EXAM RESULTS (GRADES) ====================
    console.log("🎓 Creating Exam Results...");
    const grades = [];
    
    // Create grades for 100 students across various exams
    for (let i = 0; i < 100; i++) {
      const student = students[randomNumber(0, students.length - 1)];
      const exam = exams[randomNumber(0, exams.length - 1)];
      
      // Get subject from exam
      const subject = allSubjects.find(s => s._id.toString() === exam.subject.toString());
      
      // Generate realistic marks (normal distribution around 70)
      let marks = Math.floor(randomNumber(45, 95));
      
      const grade = await Grade.create({
        studentId: student._id,
        examId: exam._id,
        subjectId: exam.subject,
        marksObtained: marks,
        totalMarks: exam.totalMarks,
        grade: calculateGrade(marks),
        remarks: getGradeRemarks(marks),
        enteredBy: teacherUsers[randomNumber(0, teacherUsers.length - 1)]._id,
        class: student.class,
        section: student.section
      });
      
      grades.push(grade);
    }
    console.log("✅ Created 100 Exam Results\n");

    // ==================== SUMMARY ====================
    console.log("=".repeat(60));
    console.log("📋 SEEDING SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Users Created: ${1 + 20 + 200} (1 Admin + 20 Teachers + 200 Students)`);
    console.log(`✅ Students Created: ${students.length}`);
    console.log(`✅ Teachers Created: ${teacherUsers.length}`);
    console.log(`✅ Subjects Created: ${allSubjects.length}`);
    console.log(`✅ Fee Records Created: ${feeRecords.length}`);
    console.log(`✅ Buses Created: ${buses.length}`);
    console.log(`✅ Attendance Records Created: ${attendanceRecords.length}`);
    console.log(`✅ Timetable Entries Created: ${timetableCount}`);
    console.log(`✅ Exams Created: ${exams.length}`);
    console.log(`✅ Exam Results Created: ${grades.length}`);
    console.log("=".repeat(60));
    console.log("🎉 PRO SEED COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log("\n📌 Test Credentials:");
    console.log("   Admin: gagangoyal878@gmail.com / Mayo@123");
    console.log("   Teacher: teacher1@mayo.edu / Mayo@123");
    console.log("   Student: student1@mayo.edu / Mayo@123");
    console.log("\n");

    await mongoose.disconnect();
    console.log("📴 Disconnected from MongoDB");
    process.exit(0);
    
  } catch (error) {
    console.error("\n❌ SEED ERROR:", error.message);
    console.error(error.stack);
    if (connection) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

// Run the seed function
seed();


